import { describe, it, expect } from "vitest";
import { parseBankNotifications } from "../modules/ocr/parsers/bank-notification.js";

// Raw text from wa1.json sample (3 Danamon CC transactions)
const WA_RAW_TEXT = `9.27
\u062C\u0627
Danamon
18
Danamon
Business account
Nsb Yth. Transaksi Kartu
Kredit Danamon 9223 di
ASTRO-32466095 JAK
ARTA sebesar IDR
249.400,00 pada 23/03/26
10:29:32 telah berhasil. Info:
1500090/+622123546100(L
N)
10.29 AM
Nsb Yth. Transaksi Kartu
Kredit Danamon 9223 di Grab
A-94LLR8SGWQ2SAV628
sebesar IDR 77.500,00 pada
23/03/26 14:03:34 telah
berhasil. Info:
1500090/+622123546100(L
N)
2.03 PM
Nsb Yth. Transaksi Kartu
Kredit Danamon 9223 di Grab
A-94MJEL9WWIAXAV628
sebesar IDR 34.500,00 pada
23/03/26 19:26:57 telah
berhasil. Info:
1500090/+622123546100(L
N)
7.27 PM
+
`;

describe("parseBankNotifications", () => {
  it("extracts exactly 3 transactions from the WhatsApp sample", () => {
    const result = parseBankNotifications(WA_RAW_TEXT);
    expect(result).toHaveLength(3);
  });

  it("extracts correct merchants", () => {
    const result = parseBankNotifications(WA_RAW_TEXT);
    expect(result[0].merchant).toBe("ASTRO-32466095 JAK ARTA");
    expect(result[1].merchant).toBe("Grab A-94LLR8SGWQ2SAV628");
    expect(result[2].merchant).toBe("Grab A-94MJEL9WWIAXAV628");
  });

  it("extracts correct amounts", () => {
    const result = parseBankNotifications(WA_RAW_TEXT);
    expect(result[0].totalAmount).toBe(249400);
    expect(result[1].totalAmount).toBe(77500);
    expect(result[2].totalAmount).toBe(34500);
  });

  it("extracts correct dates in ISO format", () => {
    const result = parseBankNotifications(WA_RAW_TEXT);
    expect(result[0].transactionDate).toBe("2026-03-23");
    expect(result[1].transactionDate).toBe("2026-03-23");
    expect(result[2].transactionDate).toBe("2026-03-23");
  });

  it("sets payment method with card type, bank and last4", () => {
    const result = parseBankNotifications(WA_RAW_TEXT);
    expect(result[0].paymentMethod).toBe("Credit Card (Danamon 9223)");
    expect(result[1].paymentMethod).toBe("Credit Card (Danamon 9223)");
  });

  it("sets currency to IDR for all transactions", () => {
    const result = parseBankNotifications(WA_RAW_TEXT);
    for (const trx of result) {
      expect(trx.currency).toBe("IDR");
    }
  });

  it("returns empty array for non-matching text", () => {
    const result = parseBankNotifications("Just some random text");
    expect(result).toHaveLength(0);
  });

  it("handles single transaction text", () => {
    const singleTrx = "Nsb Yth. Transaksi Kartu Kredit Danamon 9223 di MERCHANT-123 sebesar IDR 50.000,00 pada 01/02/26 08:30:00 telah berhasil.";
    const result = parseBankNotifications(singleTrx);
    expect(result).toHaveLength(1);
    expect(result[0].merchant).toBe("MERCHANT-123");
    expect(result[0].totalAmount).toBe(50000);
    expect(result[0].transactionDate).toBe("2026-02-01");
  });

  it("handles debit card transactions", () => {
    const debitTrx = "Transaksi Kartu Debit BCA 4567 di Tokopedia sebesar IDR 150.000,00 pada 15/06/26 12:00:00 telah berhasil.";
    const result = parseBankNotifications(debitTrx);
    expect(result).toHaveLength(1);
    expect(result[0].paymentMethod).toBe("Debit Card (BCA 4567)");
    expect(result[0].totalAmount).toBe(150000);
  });
});
