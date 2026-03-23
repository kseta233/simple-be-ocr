import type { SourceType } from "../../types/ocr.js";

const BANK_NOTIFICATION_PATTERNS = [
  /transaksi\s+kartu\s+(kredit|debit)/i,
  /sebesar\s+IDR/i
];

export function detectSourceType(rawText: string): SourceType {
  const matchCount = BANK_NOTIFICATION_PATTERNS.filter((pattern) =>
    pattern.test(rawText)
  ).length;

  if (matchCount >= 2) {
    return "bank-notification";
  }

  return "receipt";
}
