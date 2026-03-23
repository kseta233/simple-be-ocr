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
  rawText: string;
  parsed: OCRParsedPayload;
  confidence: {
    overall: number;
    fields: Record<string, number>;
  };
  raw: Record<string, unknown>;
}

