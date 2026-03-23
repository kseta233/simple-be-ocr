export type SourceType = "receipt" | "bank-notification";

export interface OCRParsedPayload {
  merchant: string;
  transactionDate: string;
  totalAmount: number;
  currency: string;
  category: string;
  paymentMethod: string | null;
  notes: string | null;
  lineItems: unknown[];
}

export interface OCRResponse {
  requestId: string;
  provider: string;
  sourceType: SourceType;
  rawText: string;
  parsed: OCRParsedPayload;
  transactions: OCRParsedPayload[];
  confidence: {
    overall: number;
    fields: Record<string, number>;
  };
  raw: Record<string, unknown>;
}

