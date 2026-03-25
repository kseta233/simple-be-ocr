import { z } from "zod";

export const pocketTypeSchema = z.enum(["personal", "shared"]);
export const pocketShareModeSchema = z.enum(["invite_only", "link"]);
export const transactionSourceSchema = z.enum(["manual", "chat", "photo", "text"]);

export const createPocketSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional(),
  type: pocketTypeSchema,
  currency: z.string().trim().min(1).max(10),
  icon: z.string().max(50).optional(),
  color: z.string().max(30).optional(),
  shareMode: pocketShareModeSchema.optional()
});

export const getPocketQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional()
});

export const sharePocketSchema = z.object({
  pocketId: z.string().uuid(),
  expiresAt: z.string().datetime().optional(),
  maxUses: z.number().int().min(1).optional()
});

export const acceptPocketSchema = z.object({
  code: z.string().trim().min(6).max(120)
});

export const leavePocketSchema = z.object({
  pocketId: z.string().uuid()
});

export const archivePocketSchema = z.object({
  pocketId: z.string().uuid()
});

export const addTransactionSchema = z.object({
  pocketId: z.string().uuid(),
  merchant: z.string().max(255).optional(),
  title: z.string().trim().min(1).max(255),
  amount: z.number().min(0),
  dateTrx: z.string().date(),
  categoryId: z.string().max(100).optional(),
  categoryLabel: z.string().max(100).optional(),
  note: z.string().max(10000).optional(),
  attachmentUri: z.string().max(10000).optional(),
  source: transactionSourceSchema,
  originalText: z.string().max(10000).optional()
});

export const editTransactionSchema = z.object({
  pocketId: z.string().uuid(),
  transactionId: z.string().uuid(),
  merchant: z.string().max(255).optional(),
  title: z.string().trim().min(1).max(255),
  amount: z.number().min(0),
  dateTrx: z.string().date(),
  categoryId: z.string().max(100).optional(),
  categoryLabel: z.string().max(100).optional(),
  note: z.string().max(10000).optional(),
  attachmentUri: z.string().max(10000).optional()
});

export const deleteTransactionSchema = z.object({
  pocketId: z.string().uuid(),
  transactionId: z.string().uuid()
});

export type CreatePocketInput = z.infer<typeof createPocketSchema>;
export type GetPocketQuery = z.infer<typeof getPocketQuerySchema>;
export type SharePocketInput = z.infer<typeof sharePocketSchema>;
export type AcceptPocketInput = z.infer<typeof acceptPocketSchema>;
export type LeavePocketInput = z.infer<typeof leavePocketSchema>;
export type ArchivePocketInput = z.infer<typeof archivePocketSchema>;
export type AddTransactionInput = z.infer<typeof addTransactionSchema>;
export type EditTransactionInput = z.infer<typeof editTransactionSchema>;
export type DeleteTransactionInput = z.infer<typeof deleteTransactionSchema>;
