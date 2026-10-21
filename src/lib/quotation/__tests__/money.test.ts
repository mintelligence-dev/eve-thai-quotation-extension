import { describe, expect, it } from "vitest";
import {
  bahtText,
  computeTotals,
  formatTHB,
  lineTotalSatang,
  parseBahtToSatang,
} from "../index";

const EXCL = { vatRateBps: 700, pricesIncludeVat: false };
const INCL = { vatRateBps: 700, pricesIncludeVat: true };

describe("deterministic calculations", () => {
  it("computes line totals in integer satang", () => {
    expect(lineTotalSatang(6_200, 50)).toBe(310_000);
    expect(lineTotalSatang(650, 30)).toBe(19_500);
    expect(lineTotalSatang(120, 2_000)).toBe(240_000); // อิฐมอญ ฿1.20 × 2,000
  });

  it("rounds fractional quantities half-up to the satang", () => {
    expect(lineTotalSatang(1_999, 0.5)).toBe(1_000); // 999.5 → 1000
    expect(lineTotalSatang(333, 2.5)).toBe(833); // 832.5 → 833
  });

  it("is immune to float drift in quantities", () => {
    expect(lineTotalSatang(1_000, 0.1 + 0.2)).toBe(300);
  });

  it("adds VAT on top when catalog prices exclude VAT", () => {
    expect(computeTotals([310_000, 19_500, 16_000, 13_500], EXCL)).toEqual({
      subtotalSatang: 359_000,
      vatSatang: 25_130,
      grandTotalSatang: 384_130,
    });
  });

  it("extracts VAT when catalog prices include VAT", () => {
    expect(computeTotals([107_000], INCL)).toEqual({
      subtotalSatang: 100_000,
      vatSatang: 7_000,
      grandTotalSatang: 107_000,
    });
  });

  it("computes VAT once on the document total, not per line", () => {
    // Per-line rounding would give 4 + 4 = 8 satang; the documented rule gives 7.
    expect(computeTotals([50, 50], EXCL).vatSatang).toBe(7);
    expect(computeTotals([50], EXCL).vatSatang).toBe(4); // 3.5 → 4, half-up
  });

  it("supports a configurable VAT rate, including zero", () => {
    expect(computeTotals([100_000], { vatRateBps: 0, pricesIncludeVat: false }).grandTotalSatang).toBe(100_000);
    expect(computeTotals([100_000], { vatRateBps: 1_000, pricesIncludeVat: false }).vatSatang).toBe(10_000);
  });

  it("gives the same totals for the same lines in any order", () => {
    const lines = [12_345, 67_890, 5, 99_999];
    const a = computeTotals(lines, EXCL);
    const b = computeTotals([...lines].reverse(), EXCL);
    expect(a).toEqual(b);
    expect(computeTotals(lines, EXCL)).toEqual(a);
  });

  it("subtotal + VAT always equals the grand total", () => {
    for (let sum = 0; sum < 5_000; sum += 7) {
      for (const s of [EXCL, INCL]) {
        const t = computeTotals([sum], s);
        expect(t.subtotalSatang + t.vatSatang).toBe(t.grandTotalSatang);
      }
    }
  });
});

describe("THB parsing and formatting", () => {
  it("parses catalog prices into satang", () => {
    expect(parseBahtToSatang("1,250.50")).toBe(125_050);
    expect(parseBahtToSatang("฿ 45")).toBe(4_500);
    expect(parseBahtToSatang("๑๒๐")).toBe(12_000);
    expect(parseBahtToSatang("99.9")).toBe(9_990);
    expect(parseBahtToSatang("165 บาท")).toBe(16_500);
  });

  it("rejects negative, over-precise or non-numeric prices", () => {
    expect(parseBahtToSatang("-5")).toBeNull();
    expect(parseBahtToSatang("1.234")).toBeNull();
    expect(parseBahtToSatang("ฟรี")).toBeNull();
    expect(parseBahtToSatang("")).toBeNull();
  });

  it("formats THB with two decimals and thousands separators", () => {
    expect(formatTHB(384_130)).toBe("฿3,841.30");
    expect(formatTHB(0)).toBe("฿0.00");
  });

  it("writes the amount in Thai words as printed on quotations", () => {
    expect(bahtText(0)).toBe("ศูนย์บาทถ้วน");
    expect(bahtText(2_100)).toBe("ยี่สิบเอ็ดบาทถ้วน");
    expect(bahtText(1_100)).toBe("สิบเอ็ดบาทถ้วน");
    expect(bahtText(10_100)).toBe("หนึ่งร้อยเอ็ดบาทถ้วน");
    expect(bahtText(107_050)).toBe("หนึ่งพันเจ็ดสิบบาทห้าสิบสตางค์");
    expect(bahtText(25)).toBe("ยี่สิบห้าสตางค์");
    expect(bahtText(100_000_000)).toBe("หนึ่งล้านบาทถ้วน");
    expect(bahtText(1_234_567_890)).toBe("สิบสองล้านสามแสนสี่หมื่นห้าพันหกร้อยเจ็ดสิบแปดบาทเก้าสิบสตางค์");
  });
});
