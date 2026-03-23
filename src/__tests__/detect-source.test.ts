import { describe, it, expect } from "vitest";
import { detectSourceType } from "../modules/ocr/detect-source.js";

const WA_BANK_TEXT = `9.27
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
10.29 AM`;

const RECEIPT_TEXT = `SOME
Central Park OHISOME
al Park L1,LGM Mall Central Park Jl. Letjen
S.Parman No.28, RT.12/RW.6, TJ. Duren Sel., Kec.
Grogolpetamburan, Kota Jakarta Barat, Daerah
Khususibukota Jakarta 11470
Salinan pelanggan
Di toko
1. TAG-SLIM BROW
PENCIL-03 #LIGHT
x1 Rp65,900
Total
Rp118,800
BCA
Rp118,800`;

describe("detectSourceType", () => {
  it("returns 'bank-notification' for WhatsApp CC notification text", () => {
    expect(detectSourceType(WA_BANK_TEXT)).toBe("bank-notification");
  });

  it("returns 'receipt' for store receipt text", () => {
    expect(detectSourceType(RECEIPT_TEXT)).toBe("receipt");
  });

  it("returns 'receipt' for empty text", () => {
    expect(detectSourceType("")).toBe("receipt");
  });

  it("returns 'receipt' when only one pattern matches", () => {
    // Has "sebesar IDR" but not "Transaksi Kartu Kredit/Debit"
    expect(detectSourceType("total sebesar IDR 50.000")).toBe("receipt");
  });

  it("detects debit card notifications too", () => {
    const debitText = "Transaksi Kartu Debit BCA 1234 di Tokopedia sebesar IDR 100.000,00 pada 01/01/26 12:00:00 telah berhasil";
    expect(detectSourceType(debitText)).toBe("bank-notification");
  });
});
