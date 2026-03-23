import type { OCRParsedPayload } from "../../../types/ocr.js";

/**
 * Regex captures from bank CC/debit notification messages (e.g. Danamon WhatsApp).
 *
 * Pattern: "...Kartu Kredit {BANK} {LAST4} di {MERCHANT} sebesar IDR {AMOUNT} pada {DATE} {TIME} telah berhasil..."
 */
const TRANSACTION_PATTERN =
  /Kartu\s+(Kredit|Debit)\s+(\w+)\s+(\d{4})\s+di\s+(.+?)\s+sebesar\s+IDR\s+([\d.,]+)\s+pada\s+(\d{2}\/\d{2}\/\d{2})\s+(\d{2}:\d{2}:\d{2})\s+telah\s+berhasil/gi;

export function parseBankNotifications(rawText: string): OCRParsedPayload[] {
  const transactions: OCRParsedPayload[] = [];

  // Normalize newlines to spaces for easier regex matching
  const normalized = rawText.replace(/\n/g, " ");

  let match: RegExpExecArray | null;
  while ((match = TRANSACTION_PATTERN.exec(normalized)) !== null) {
    const cardType = match[1];    // "Kredit" or "Debit"
    const bank = match[2];        // "Danamon"
    const lastFour = match[3];    // "9223"
    const merchant = match[4].trim();
    const amountRaw = match[5];
    const dateRaw = match[6];     // "23/03/26"

    const totalAmount = parseIDRAmount(amountRaw);
    const transactionDate = parseShortDate(dateRaw);
    const paymentMethod = `${cardType === "Kredit" ? "Credit" : "Debit"} Card (${bank} ${lastFour})`;

    transactions.push({
      merchant,
      transactionDate,
      totalAmount,
      currency: "IDR",
      category: "Uncategorized",
      paymentMethod,
      notes: null,
      lineItems: []
    });
  }

  return transactions;
}

function parseIDRAmount(raw: string): number {
  // Indonesian format: 249.400,00 → 249400.00
  const cleaned = raw.replace(/\./g, "").replace(/,/g, ".");
  return Number(cleaned) || 0;
}

function parseShortDate(raw: string): string {
  // "23/03/26" → "2026-03-23"  (DD/MM/YY)
  const [dd, mm, yy] = raw.split("/");
  const year = Number(yy) + 2000;
  return `${year}-${mm}-${dd}`;
}
