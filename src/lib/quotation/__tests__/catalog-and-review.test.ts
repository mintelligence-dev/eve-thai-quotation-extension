import { describe, expect, it } from "vitest";
import {
  acknowledgeUnit,
  addLine,
  buildDraft,
  canApprove,
  chooseItem,
  decodeCsvBytes,
  parseCatalogCsv,
  priceQuotation,
  removeLine,
  setQuantity,
} from "../index";
import { sampleCatalog, sampleInquiry } from "./fixtures";

const HEADER = "sku,name,name_en,aliases,unit,unit_price,category";

describe("CSV catalog import", () => {
  it("loads the synthetic sample catalogs without errors", () => {
    expect(sampleCatalog("construction-th")).toHaveLength(32);
    expect(sampleCatalog("office-en")).toHaveLength(10);
  });

  it("parses quoted prices with thousands separators and pipe-separated aliases", () => {
    const { items, errors } = parseCatalogCsv(`${HEADER}\nA1,สายไฟ,"Cable, 100m",สาย|wire,ม้วน,"1,250.00",x`);
    expect(errors).toEqual([]);
    expect(items[0]).toMatchObject({ nameEn: "Cable, 100m", aliases: ["สาย", "wire"], unitPriceSatang: 125_000 });
  });

  it("accepts Thai column headers", () => {
    const { items, errors } = parseCatalogCsv("รหัสสินค้า,ชื่อสินค้า,หน่วย,ราคา\nA1,ปูน,ถุง,165");
    expect(errors).toEqual([]);
    expect(items[0]).toMatchObject({ sku: "A1", unit: "ถุง", unitPriceSatang: 16_500 });
  });

  it("reports a missing required column by name", () => {
    const { errors } = parseCatalogCsv("sku,name,unit\nA1,ปูน,ถุง");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ row: 1 });
    expect(errors[0].message).toContain("unit_price");
  });

  it("reports each bad cell with its spreadsheet row and column", () => {
    const csv = [HEADER, "A1,ปูน,,,ถุง,165,", "A2,,,,ถุง,abc,", "", "A1,ทราย,,,คิว,550,"].join("\n");
    const { items, errors } = parseCatalogCsv(csv);
    expect(items.map((i) => i.sku)).toEqual(["A1"]);
    expect(errors).toEqual([
      expect.objectContaining({ row: 3, column: "name" }),
      expect.objectContaining({ row: 3, column: "unit_price" }),
      expect.objectContaining({ row: 5, column: "sku", message: expect.stringContaining("แถว 2") }),
    ]);
  });

  it("strips a UTF-8 BOM and rejects Windows-874 files with a clear message", () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(`${HEADER}\nA1,ปูน,,,ถุง,1,`)]);
    const decoded = decodeCsvBytes(bom);
    expect("text" in decoded && decoded.text.startsWith("sku")).toBe(true);

    const tis620 = new Uint8Array([0xbb, 0xd9, 0xb9]); // "ปูน" in Windows-874
    const bad = decodeCsvBytes(tis620);
    expect("error" in bad && bad.error.message).toContain("CSV UTF-8");
  });

  it("rejects an empty file", () => {
    expect(parseCatalogCsv("").errors[0].message).toContain("empty");
  });
});

describe("review and approval", () => {
  const catalog = sampleCatalog("construction-th");
  const byS = (sku: string) => catalog.find((i) => i.sku === sku)!;

  it("blocks approval until every line has an item and a quantity", async () => {
    let draft = await buildDraft({ inquiry: sampleInquiry("03-ambiguous-missing.txt"), catalog });
    const check = canApprove(draft, catalog);
    expect(check.ok).toBe(false);
    expect(check.blockers.length).toBeGreaterThanOrEqual(3);

    const [cement, lamp, sand, copper] = draft.lines;
    draft = chooseItem(draft, cement.id, byS("CEM-PC-50"));
    draft = chooseItem(draft, lamp.id, byS("LED-T8-18-DL"));
    draft = setQuantity(draft, sand.id, 2);
    draft = removeLine(draft, copper.id);
    expect(canApprove(draft, catalog)).toEqual({ ok: true, blockers: [] });
  });

  it("requires the reviewer to confirm a unit mismatch", async () => {
    let draft = await buildDraft({ inquiry: "สีทาบ้านขาว 4 แกลลอน", catalog });
    expect(canApprove(draft, catalog).ok).toBe(false);
    draft = acknowledgeUnit(setQuantity(draft, draft.lines[0].id, 1), draft.lines[0].id);
    expect(canApprove(draft, catalog).ok).toBe(true);
  });

  it("refuses to price a draft that cannot be approved", async () => {
    const draft = await buildDraft({ inquiry: "ขอราคาปูน 20 ถุง", catalog });
    expect(() => priceQuotation(draft, catalog, { vatRateBps: 700, pricesIncludeVat: false })).toThrow();
  });

  it("takes every price from the catalog at pricing time", async () => {
    let draft = await buildDraft({ inquiry: sampleInquiry("01-thai-line-chat.txt"), catalog });
    draft = addLine(draft, byS("DLV-BKK"), 1);
    const quote = priceQuotation(draft, catalog, { vatRateBps: 700, pricesIncludeVat: false });
    expect(quote.lines.map((l) => [l.sku, l.unitPriceSatang, l.lineTotalSatang])).toEqual([
      ["PVC-050-85", 6_200, 310_000],
      ["ELB-050", 650, 19_500],
      ["TEE-050", 800, 16_000],
      ["GLU-100", 4_500, 13_500],
      ["DLV-BKK", 50_000, 50_000],
    ]);
    expect(quote).toMatchObject({ subtotalSatang: 409_000, vatSatang: 28_630, grandTotalSatang: 437_630 });

    // A catalog price change is reflected; nothing in the draft carries a price.
    const repriced = catalog.map((i) => (i.sku === "GLU-100" ? { ...i, unitPriceSatang: 5_000 } : i));
    expect(priceQuotation(draft, repriced, quote.settings).lines[3].lineTotalSatang).toBe(15_000);
  });

  it("blocks approval when a chosen SKU has since been removed from the catalog", async () => {
    const draft = await buildDraft({ inquiry: "ค่าขนส่ง 1 เที่ยว", catalog });
    const smaller = catalog.filter((i) => i.sku !== "DLV-BKK");
    expect(canApprove(draft, smaller).ok).toBe(false);
  });
});
