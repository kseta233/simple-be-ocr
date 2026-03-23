import { randomUUID } from "node:crypto";
import { GoogleAuth } from "google-auth-library";
import type { JWTInput } from "google-auth-library";
import type { OCRResponse, OCRParsedPayload } from "../../types/ocr.js";
import { detectSourceType } from "./detect-source.js";
import { parseBankNotifications } from "./parsers/bank-notification.js";
import { extractReceiptFallbackFields } from "./parsers/receipt-fallback.js";

interface OCRDocumentInput {
  fileName: string;
  mimeType: string;
  content: Buffer;
}

interface DocumentAIEntity {
  type?: string;
  mentionText?: string;
  confidence?: number;
  normalizedValue?: {
    text?: string;
    moneyValue?: {
      units?: string | number;
      nanos?: number;
      currencyCode?: string;
    };
    dateValue?: {
      year?: number;
      month?: number;
      day?: number;
    };
  };
  properties?: DocumentAIEntity[];
}

interface DocumentAIResponse {
  document?: {
    text?: string;
    entities?: DocumentAIEntity[];
  };
}

const googleAuth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"]
});

export async function processOCRDocument(input: OCRDocumentInput): Promise<OCRResponse> {
  const provider = (process.env.OCR_PROVIDER ?? "mock").trim().toLowerCase();

  if (provider === "google" || provider === "google-document-ai") {
    return processGoogleDocumentAI(input, provider);
  }

  return createMockResponse(input.fileName, provider);
}

function createMockResponse(fileName: string, provider: string): OCRResponse {
  const now = new Date().toISOString().slice(0, 10);

  const parsed: OCRParsedPayload = {
    merchant: "Mock Merchant",
    transactionDate: now,
    totalAmount: 125000,
    currency: "IDR",
    category: "Food",
    paymentMethod: null,
    notes: null,
    lineItems: []
  };

  return {
    requestId: randomUUID(),
    provider,
    sourceType: "receipt",
    rawText: `Mock OCR output for ${fileName}`,
    parsed,
    transactions: [parsed],
    confidence: {
      overall: 0.88,
      fields: {
        merchant: 0.92,
        transactionDate: 0.81,
        totalAmount: 0.95
      }
    },
    raw: {
      fileName,
      mock: true
    }
  };
}

async function processGoogleDocumentAI(
  input: OCRDocumentInput,
  provider: string
): Promise<OCRResponse> {
  const documentReaderEndpoint = process.env._DOCUMENT_PROCESS_LINK?.trim();
  const expenseParserEndpoint = process.env._RECEIPT_PROCESS_LINK?.trim();

  if (!documentReaderEndpoint) {
    throw new Error("Missing _DOCUMENT_PROCESS_LINK");
  }

  if (!expenseParserEndpoint) {
    throw new Error("Missing _RECEIPT_PROCESS_LINK");
  }

  const accessToken = await resolveGoogleAccessToken();

  const expensePayload = await requestDocumentAI(expenseParserEndpoint, input, accessToken);
  const expenseDocument = expensePayload.document;
  const expenseRawText = expenseDocument?.text ?? "";

  const expenseReceiptResponse = buildReceiptResponse(
    expenseRawText,
    expenseDocument,
    input,
    provider,
    expenseParserEndpoint,
    expensePayload
  );

  if (expenseReceiptResponse.parsed.totalAmount > 0) {
    return expenseReceiptResponse;
  }

  const documentPayload = await requestDocumentAI(documentReaderEndpoint, input, accessToken);
  const document = documentPayload.document;
  const rawText = document?.text ?? "";
  const sourceType = detectSourceType(rawText);

  if (sourceType === "bank-notification") {
    return buildBankNotificationResponse(rawText, input, provider, documentReaderEndpoint, documentPayload);
  }

  return buildReceiptResponse(
    rawText,
    document,
    input,
    provider,
    documentReaderEndpoint,
    documentPayload,
    expenseParserEndpoint
  );
}

async function requestDocumentAI(
  endpoint: string,
  input: OCRDocumentInput,
  accessToken: string
): Promise<DocumentAIResponse> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      rawDocument: {
        mimeType: input.mimeType,
        content: input.content.toString("base64")
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Google Document AI request failed (${response.status}): ${errorText || response.statusText}`
    );
  }

  return (await response.json()) as DocumentAIResponse;
}

function buildBankNotificationResponse(
  rawText: string,
  input: OCRDocumentInput,
  provider: string,
  endpoint: string,
  payload: DocumentAIResponse
): OCRResponse {
  const transactions = parseBankNotifications(rawText);
  const primary = transactions[0] ?? {
    merchant: "Unknown merchant",
    transactionDate: new Date().toISOString().slice(0, 10),
    totalAmount: 0,
    currency: "IDR",
    category: "Uncategorized",
    paymentMethod: null,
    notes: null,
    lineItems: []
  };

  return {
    requestId: randomUUID(),
    provider,
    sourceType: "bank-notification",
    rawText,
    parsed: primary,
    transactions,
    confidence: {
      overall: transactions.length > 0 ? 0.85 : 0,
      fields: {
        merchant: 0.8,
        transactionDate: 0.9,
        totalAmount: 0.95
      }
    },
    raw: {
      fileName: input.fileName,
      mimeType: input.mimeType,
      processorEndpoint: endpoint,
      document: payload.document ?? null
    }
  };
}

function buildReceiptResponse(
  rawText: string,
  document: DocumentAIResponse["document"],
  input: OCRDocumentInput,
  provider: string,
  endpoint: string,
  payload: DocumentAIResponse,
  sourceDetectionEndpoint?: string
): OCRResponse {
  const entities = Array.isArray(document?.entities) ? document.entities : [];
  const now = new Date().toISOString().slice(0, 10);

  const merchantEntity = pickEntity(entities, [
    "merchant_name",
    "supplier_name",
    "merchant",
    "supplier",
    "vendor",
    "seller"
  ]);
  const transactionDateEntity = pickEntity(entities, ["transaction_date", "receipt_date", "invoice_date", "date"]);
  const totalAmountEntity = pickEntity(entities, ["total_amount", "amount_due", "net_amount", "balance_due", "total"]);
  const currencyEntity = pickEntity(entities, ["currency", "currency_code"]);
  const paymentMethodEntity = pickEntity(entities, ["payment_method", "payment_type", "method"]);
  const notesEntity = pickEntity(entities, ["notes", "description", "memo"]);

  const parsedAmount = extractAmount(totalAmountEntity);
  const parsedCurrency = extractCurrency(totalAmountEntity) ?? entityText(currencyEntity) ?? "IDR";
  const fallback = extractReceiptFallbackFields(rawText);

  const fieldConfidences: Record<string, number> = {
    merchant: merchantEntity?.confidence ?? 0,
    transactionDate: transactionDateEntity?.confidence ?? 0,
    totalAmount: totalAmountEntity?.confidence ?? 0,
    currency: currencyEntity?.confidence ?? totalAmountEntity?.confidence ?? 0,
    paymentMethod: paymentMethodEntity?.confidence ?? 0,
    notes: notesEntity?.confidence ?? 0
  };

  const confidenceValues = entities
    .map((entity) => entity.confidence)
    .filter((value): value is number => typeof value === "number");

  const parsed: OCRParsedPayload = {
    merchant: entityText(merchantEntity) ?? fallback.merchant ?? "Unknown merchant",
    transactionDate: extractDate(transactionDateEntity) ?? fallback.transactionDate ?? now,
    totalAmount: parsedAmount ?? fallback.totalAmount ?? 0,
    currency: parsedCurrency,
    category: "Uncategorized",
    paymentMethod: entityText(paymentMethodEntity),
    notes: entityText(notesEntity),
    lineItems: extractLineItems(entities)
  };

  return {
    requestId: randomUUID(),
    provider,
    sourceType: "receipt",
    rawText,
    parsed,
    transactions: [parsed],
    confidence: {
      overall: confidenceValues.length
        ? Number(
            (confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length).toFixed(4)
          )
        : 0,
      fields: fieldConfidences
    },
    raw: {
      fileName: input.fileName,
      mimeType: input.mimeType,
      processorEndpoint: endpoint,
      sourceDetectionEndpoint: sourceDetectionEndpoint ?? endpoint,
      document: payload.document ?? null
    }
  };
}

async function resolveGoogleAccessToken() {
  const envToken = process.env.GOOGLE_DOCUMENT_AI_ACCESS_TOKEN?.trim();
  if (envToken) {
    return envToken;
  }

  const serviceAccount = resolveServiceAccountJson();
  const authClient = serviceAccount
    ? new GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
        credentials: parseServiceAccountCredentials(serviceAccount.value, serviceAccount.source)
      })
    : googleAuth;

  const client = await authClient.getClient();
  const tokenResponse = await client.getAccessToken();
  const adcToken = typeof tokenResponse === "string" ? tokenResponse : tokenResponse.token;

  if (!adcToken) {
    throw new Error(
      "Missing Google access token. Set GOOGLE_DOCUMENT_AI_ACCESS_TOKEN, set GOOGLE_APPLICATION_CREDENTIALS to the full service account JSON, or configure ADC with gcloud auth application-default login"
    );
  }

  return adcToken;
}

function resolveServiceAccountJson() {
  const applicationCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (applicationCredentials) {
    return {
      value: applicationCredentials,
      source: "GOOGLE_APPLICATION_CREDENTIALS"
    };
  }

  return null;
}

function parseServiceAccountCredentials(rawJson: string, sourceEnvVar: string): JWTInput {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawJson) as Record<string, unknown>;
  } catch {
    throw new Error(`Invalid ${sourceEnvVar}: expected valid JSON`);
  }

  const clientEmail = parsed.client_email;
  const privateKey = parsed.private_key;

  if (typeof clientEmail !== "string" || typeof privateKey !== "string") {
    throw new Error(`Invalid ${sourceEnvVar}: missing client_email or private_key`);
  }

  return {
    ...parsed,
    client_email: clientEmail,
    private_key: privateKey.replace(/\\n/g, "\n")
  } as JWTInput;
}

function pickEntity(entities: DocumentAIEntity[], candidates: string[]) {
  const normalizedCandidates = candidates.map((candidate) => candidate.toLowerCase());

  return entities.find((entity) => {
    const type = entity.type?.toLowerCase();
    return type ? normalizedCandidates.includes(type) : false;
  });
}

function entityText(entity?: DocumentAIEntity) {
  if (!entity) {
    return null;
  }

  const moneyValue = entity.normalizedValue?.moneyValue;
  if (moneyValue) {
    return formatMoneyValue(moneyValue.units, moneyValue.nanos);
  }

  const dateValue = entity.normalizedValue?.dateValue;
  if (dateValue?.year && dateValue.month && dateValue.day) {
    return [dateValue.year, padNumber(dateValue.month), padNumber(dateValue.day)].join("-");
  }

  return entity.normalizedValue?.text?.trim() || entity.mentionText?.trim() || null;
}

function extractAmount(entity?: DocumentAIEntity) {
  const moneyValue = entity?.normalizedValue?.moneyValue;
  if (moneyValue) {
    const units = Number(moneyValue.units ?? 0);
    const nanos = Number(moneyValue.nanos ?? 0) / 1_000_000_000;
    return Number((units + nanos).toFixed(2));
  }

  const text = entityText(entity);
  if (!text) {
    return null;
  }

  const normalized = text.replace(/[^\d.,-]/g, "");
  const dotCount = (normalized.match(/\./g) ?? []).length;
  const commaCount = (normalized.match(/,/g) ?? []).length;

  if (dotCount > 0 && commaCount > 0) {
    return Number(normalized.replace(/\./g, "").replace(/,/g, "."));
  }

  if (commaCount === 1 && dotCount === 0) {
    const fraction = normalized.split(",")[1];

    if ((fraction?.length ?? 0) <= 2) {
      return Number(normalized.replace(/,/g, "."));
    }

    return Number(normalized.replace(/,/g, ""));
  }

  return Number(normalized.replace(/,/g, ""));
}

function extractCurrency(entity?: DocumentAIEntity) {
  return entity?.normalizedValue?.moneyValue?.currencyCode ?? null;
}

function extractDate(entity?: DocumentAIEntity) {
  const dateValue = entity?.normalizedValue?.dateValue;
  if (dateValue?.year && dateValue.month && dateValue.day) {
    return [dateValue.year, padNumber(dateValue.month), padNumber(dateValue.day)].join("-");
  }

  const textValue = entityText(entity);
  if (!textValue) {
    return null;
  }

  const yyyyMmDd = textValue.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (yyyyMmDd) {
    return `${yyyyMmDd[1]}-${padNumber(Number(yyyyMmDd[2]))}-${padNumber(Number(yyyyMmDd[3]))}`;
  }

  const ddMmYy = textValue.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (ddMmYy) {
    return `20${ddMmYy[3]}-${ddMmYy[2]}-${ddMmYy[1]}`;
  }

  return textValue;
}

function extractLineItems(entities: DocumentAIEntity[]) {
  return entities
    .filter((entity) => entity.type?.toLowerCase().includes("line_item"))
    .map((entity) => ({
      type: entity.type ?? null,
      text: entityText(entity),
      confidence: entity.confidence ?? null,
      properties: entity.properties?.map((property) => ({
        type: property.type ?? null,
        text: entityText(property),
        confidence: property.confidence ?? null
      })) ?? []
    }));
}

function padNumber(value: number) {
  return value.toString().padStart(2, "0");
}

function formatMoneyValue(units?: string | number, nanos?: number) {
  const wholeUnits = Number(units ?? 0);
  const fractionalUnits = Number(nanos ?? 0) / 1_000_000_000;
  return (wholeUnits + fractionalUnits).toFixed(2);
}

