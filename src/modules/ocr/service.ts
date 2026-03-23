import { randomUUID } from "node:crypto";
import type { OCRResponse } from "../../types/ocr.js";

export async function processOCRDocument(fileName: string): Promise<OCRResponse> {
  const now = new Date().toISOString().slice(0, 10);

  return {
    requestId: randomUUID(),
    provider: process.env.OCR_PROVIDER ?? "mock",
    rawText: `Mock OCR output for ${fileName}`,
    parsed: {
      merchant: "Mock Merchant",
      transactionDate: now,
      totalAmount: 125000,
      currency: "IDR",
      category: "Food",
      paymentMethod: null,
      notes: null,
      lineItems: []
    },
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

