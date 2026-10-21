import { toArabicDigits } from "./text";
import type { QuotationSettings, QuotationTotals } from "./types";

/**
 * Parses a baht amount such as "1,250.50", "฿99", "๑๒๐" into integer satang.
 * Uses string arithmetic so "0.1 + 0.2" style float drift cannot creep in.
 * Returns null for anything that is not a non-negative amount with ≤ 2 decimals.
 */
export function parseBahtToSatang(input: string): number | null {
  const s = toArabicDigits(input).replace(/[\s,฿]|บาท|thb/gi, "");
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const baht = Number(m[1]);
  const satang = Number((m[2] ?? "").padEnd(2, "0"));
  const total = baht * 100 + satang;
  return Number.isSafeInteger(total) ? total : null;
}

const thb = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const plain = new Intl.NumberFormat("th-TH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "฿1,250.50" */
export function formatTHB(satang: number): string {
  return thb.format(satang / 100);
}

/** "1,250.50" — for table cells where the currency is in the header. */
export function formatAmount(satang: number): string {
  return plain.format(satang / 100);
}

/** Round half away from zero; amounts are non-negative so this is round-half-up. */
function roundHalfUp(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x));
}

/**
 * Line total = unit price × quantity, rounded half-up to the satang.
 * Quantity may be fractional (e.g. 2.5 metres); it is fixed to 3 decimals first.
 */
export function lineTotalSatang(unitPriceSatang: number, quantity: number): number {
  const qtyMilli = Math.round(quantity * 1000);
  return roundHalfUp((unitPriceSatang * qtyMilli) / 1000);
}

/**
 * Totals for a quotation. Rounding rule (documented in the README):
 * VAT is computed once on the document sum, not per line, and rounded half-up to the satang.
 *
 * - Prices exclude VAT: subtotal = Σ lines, VAT = subtotal × rate, total = subtotal + VAT.
 * - Prices include VAT: total = Σ lines, VAT = total × rate / (1 + rate), subtotal = total − VAT.
 */
export function computeTotals(lineTotals: number[], settings: QuotationSettings): QuotationTotals {
  const sum = lineTotals.reduce((a, b) => a + b, 0);
  const bps = settings.vatRateBps;
  if (settings.pricesIncludeVat) {
    const vat = roundHalfUp((sum * bps) / (10_000 + bps));
    return { subtotalSatang: sum - vat, vatSatang: vat, grandTotalSatang: sum };
  }
  const vat = roundHalfUp((sum * bps) / 10_000);
  return { subtotalSatang: sum, vatSatang: vat, grandTotalSatang: sum + vat };
}

const DIGIT_WORDS = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const PLACE_WORDS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

/** Thai words for 0 < n < 1,000,000 following the เอ็ด / ยี่ rules. */
function underMillion(n: number): string {
  const digits = String(n).split("").map(Number);
  let out = "";
  digits.forEach((d, i) => {
    const place = digits.length - 1 - i;
    if (d === 0) return;
    if (place === 0 && d === 1 && digits.length > 1) out += "เอ็ด";
    else if (place === 1 && d === 1) out += "สิบ";
    else if (place === 1 && d === 2) out += "ยี่สิบ";
    else out += DIGIT_WORDS[d] + PLACE_WORDS[place];
  });
  return out;
}

function integerWords(n: number): string {
  if (n === 0) return "ศูนย์";
  const parts: string[] = [];
  while (n > 0) {
    parts.unshift(String(n % 1_000_000));
    n = Math.floor(n / 1_000_000);
  }
  return parts
    .map((p, i) => {
      const value = Number(p);
      const words = value === 0 ? "" : underMillion(value);
      return i < parts.length - 1 ? words + "ล้าน" : words;
    })
    .join("");
}

/** Thai "amount in words" line printed on quotations, e.g. 1,070.50 → "หนึ่งพันเจ็ดสิบบาทห้าสิบสตางค์". */
export function bahtText(satang: number): string {
  const baht = Math.floor(satang / 100);
  const st = satang % 100;
  if (baht === 0 && st === 0) return "ศูนย์บาทถ้วน";
  const bahtPart = baht > 0 ? integerWords(baht) + "บาท" : "";
  return st === 0 ? bahtPart + "ถ้วน" : bahtPart + integerWords(st) + "สตางค์";
}

export function formatVatRate(bps: number): string {
  return `${(bps / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })}%`;
}

