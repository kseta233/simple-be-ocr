import { z } from "zod";

export const sourceTypeSchema = z.enum(["receipt", "bank-notification"]);

export const ocrParsedPayloadSchema = z.object({
  merchant: z.string(),
  transactionDate: z.string(),
  totalAmount: z.number(),
  currency: z.string(),
  category: z.string(),
  paymentMethod: z.string().nullable(),
  notes: z.string().nullable(),
  lineItems: z.array(z.unknown())
});

export const ocrResponseSchema = z.object({
  requestId: z.string(),
  provider: z.string(),
  sourceType: sourceTypeSchema,
  rawText: z.string(),
  parsed: ocrParsedPayloadSchema,
  transactions: z.array(ocrParsedPayloadSchema),
  confidence: z.object({
    overall: z.number(),
    fields: z.record(z.number())
  }),
  raw: z.record(z.unknown())
});

