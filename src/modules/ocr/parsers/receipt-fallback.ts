export interface ReceiptFallbackFields {
  merchant: string | null;
  transactionDate: string | null;
  totalAmount: number | null;
}

const STOPWORD_PREFIXES = [
  "salinan pelanggan",
  "di toko",
  "waktu checkout",
  "waktu pembayaran",
  "kasir",
  "total",
  "nomor anggota",
  "print"
];

export function extractReceiptFallbackFields(rawText: string): ReceiptFallbackFields {
  const normalized = rawText.replace(/\r/g, "");

  return {
    merchant: extractMerchant(normalized),
    transactionDate: extractDate(normalized),
    totalAmount: extractTotalAmount(normalized)
  };
}

function extractMerchant(rawText: string) {
  const lines = rawText
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (const line of lines) {
    const lowered = line.toLowerCase();

    if (STOPWORD_PREFIXES.some((prefix) => lowered.startsWith(prefix))) {
      continue;
    }

    if (/^\d+[.)]?\s*/.test(line)) {
      continue;
    }

    if (/^x\d+/i.test(line)) {
      continue;
    }

    if (!/[a-z]/i.test(line)) {
      continue;
    }

    return line;
  }

  return null;
}

function extractDate(rawText: string) {
  const isoLike = rawText.match(/\b(\d{4})\/(\d{2})\/(\d{2})\b/);
  if (isoLike) {
    return `${isoLike[1]}-${isoLike[2]}-${isoLike[3]}`;
  }

  const shortDate = rawText.match(/\b(\d{2})\/(\d{2})\/(\d{2})\b/);
  if (shortDate) {
    return `20${shortDate[3]}-${shortDate[2]}-${shortDate[1]}`;
  }

  return null;
}

function extractTotalAmount(rawText: string) {
  const flattened = rawText.replace(/\n+/g, " ");
  const totalMatch = flattened.match(/\btotal\b\s*(?:[:\-])?\s*rp\s*([\d.,]+)/i);

  if (totalMatch) {
    return parseIDRAmount(totalMatch[1]);
  }

  const allRpAmounts = [...flattened.matchAll(/\brp\s*([\d.,]+)/gi)]
    .map((match) => parseIDRAmount(match[1]))
    .filter((value) => Number.isFinite(value));

  if (!allRpAmounts.length) {
    return null;
  }

  return Math.max(...allRpAmounts);
}

function parseIDRAmount(raw: string): number {
  // Handle both 118,800 and 249.400,00 formats.
  const hasDotAndComma = raw.includes(".") && raw.includes(",");
  if (hasDotAndComma) {
    return Number(raw.replace(/\./g, "").replace(/,/g, ".")) || 0;
  }

  if (raw.includes(",") && !raw.includes(".")) {
    const fraction = raw.split(",")[1];
    if ((fraction?.length ?? 0) <= 2) {
      return Number(raw.replace(/,/g, ".")) || 0;
    }

    return Number(raw.replace(/,/g, "")) || 0;
  }

  return Number(raw.replace(/\./g, "")) || 0;
}