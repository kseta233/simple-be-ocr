import { describe, expect, it } from "vitest";
import { extractReceiptFallbackFields } from "../modules/ocr/parsers/receipt-fallback.js";

const SOCIOLLA_RECEIPT_TEXT = `SOME
Central Park OHISOME
Salinan pelanggan
Waktu checkout
2026/03/22 18:26:51
1. TAG-SLIM BROW
x1 Rp65,900
Total
Rp118,800
BCA
Rp118,800`;

describe("extractReceiptFallbackFields", () => {
  it("extracts merchant/date/total from Sociolla-like receipt text", () => {
    const result = extractReceiptFallbackFields(SOCIOLLA_RECEIPT_TEXT);

    expect(result.merchant).toBe("SOME");
    expect(result.transactionDate).toBe("2026-03-22");
    expect(result.totalAmount).toBe(118800);
  });

  it("returns null fields when no useful data is present", () => {
    const result = extractReceiptFallbackFields("random text without amounts");

    expect(result.transactionDate).toBeNull();
    expect(result.totalAmount).toBeNull();
  });
});