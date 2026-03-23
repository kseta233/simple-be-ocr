import { beforeEach, describe, expect, it, vi } from "vitest";

const getAccessTokenMock = vi.fn();

vi.mock("google-auth-library", () => {
  class MockGoogleAuth {
    async getClient() {
      return {
        getAccessToken: getAccessTokenMock
      };
    }
  }

  return {
    GoogleAuth: MockGoogleAuth
  };
});

import { processOCRDocument } from "../modules/ocr/service.js";

function makeResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as Response;
}

describe("processOCRDocument", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getAccessTokenMock.mockResolvedValue({ token: "gcp-token" });
    process.env.OCR_PROVIDER = "google-document-ai";
    process.env._RECEIPT_PROCESS_LINK = "https://expense.example/process";
    process.env._DOCUMENT_PROCESS_LINK = "https://document.example/process";
  });

  it("returns expense parser result when totalAmount exists", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        makeResponse({
          document: {
            text: "receipt text",
            entities: [
              { type: "supplier_name", mentionText: "OH!SOME" },
              { type: "total_amount", mentionText: "Rp118,800" },
              { type: "receipt_date", mentionText: "2026/03/22" }
            ]
          }
        })
      );

    const result = await processOCRDocument({
      fileName: "receipt.jpg",
      mimeType: "image/jpeg",
      content: Buffer.from("fake")
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://expense.example/process",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.sourceType).toBe("receipt");
    expect(result.parsed.totalAmount).toBe(118800);
  });

  it("falls back to document processor when expense parser misses totalAmount", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        makeResponse({
          document: {
            text: "receipt no total",
            entities: [{ type: "supplier_name", mentionText: "OH!SOME" }]
          }
        })
      )
      .mockResolvedValueOnce(
        makeResponse({
          document: {
            text: "Nsb Yth. Transaksi Kartu Kredit Danamon 9223 di MERCHANT sebesar IDR 50.000,00 pada 01/02/26 08:30:00 telah berhasil"
          }
        })
      );

    const result = await processOCRDocument({
      fileName: "wa.jpg",
      mimeType: "image/jpeg",
      content: Buffer.from("fake")
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://expense.example/process",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://document.example/process",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.sourceType).toBe("bank-notification");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].totalAmount).toBe(50000);
  });
});
