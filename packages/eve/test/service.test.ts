import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { clearCatalogCache, loadCatalog } from "../extension/lib/catalog";
import {
  createDraft,
  emptyStore,
  issueQuotation,
  reviseDraft,
  searchCatalog,
  viewDraft,
  type DraftStore,
} from "../extension/lib/service";

const SAMPLES = join(__dirname, "..", "..", "..", "public", "samples");
const csv = readFileSync(join(SAMPLES, "catalog-construction-th.csv"), "utf8");
const inquiry = (file: string) => readFileSync(join(SAMPLES, "inquiries", file), "utf8");
const settings = { vatRateBps: 700, pricesIncludeVat: false };
const options = { validDays: 30, sellerName: "บริษัท ตัวอย่าง จำกัด", now: new Date("2026-11-20T03:04:05Z") };

beforeEach(() => clearCatalogCache());

async function start(file: string) {
  const catalog = await loadCatalog({ csv });
  const { store, draftId } = await createDraft(emptyStore(), { inquiry: inquiry(file) }, catalog);
  return { catalog, store, draftId, view: (s: DraftStore = store) => viewDraft(draftId, s.drafts[draftId], catalog, settings) };
}

describe("catalog", () => {
  it("refuses a catalog with errors instead of using part of it", async () => {
    await expect(loadCatalog({ csv: "sku,name\nA1,Thing\n" })).rejects.toThrow(/was not loaded/);
  });

  it("re-reads a URL only after it is stale", async () => {
    let calls = 0;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(csv);
    }) as typeof fetch;
    try {
      const source = { url: "https://example.test/catalog.csv" };
      await loadCatalog(source, { refreshSeconds: 60, now: 0 });
      await loadCatalog(source, { refreshSeconds: 60, now: 59_000 });
      expect(calls).toBe(1);
      await loadCatalog(source, { refreshSeconds: 60, now: 61_000 });
      expect(calls).toBe(2);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("draft", () => {
  it("prices a clear inquiry from the catalog and is ready to issue", async () => {
    const { view } = await start("02-mixed-electrical.txt");
    const v = view();
    expect(v.lines).toHaveLength(6);
    expect(v.lines.every((l) => l.status === "matched")).toBe(true);
    expect(v.readyToIssue).toBe(true);
    expect(v.totals.grandTotal).toBe("11,012.44");
  });

  it("reports what is unclear, with questions, and is not ready", async () => {
    const { view } = await start("03-ambiguous-missing.txt");
    const v = view();
    expect(v.readyToIssue).toBe(false);
    expect(v.lines.map((l) => l.status)).toEqual(["ambiguous", "ambiguous", "matched", "not_found"]);
    expect(v.lines[0].candidates.length).toBeGreaterThan(1);
    expect(v.lines[0].unitPrice).toBeNull();
    expect(v.questionsForCustomer.length).toBe(4);
    expect(v.blockers.length).toBeGreaterThan(0);
  });

  it("uses the caller's reading of the message when lines are given", async () => {
    const catalog = await loadCatalog({ csv });
    const { store, draftId } = await createDraft(
      emptyStore(),
      { inquiry: "เอาท่อฟ้าครึ่งนิ้วสักห้าสิบเส้นนะ", lines: [{ text: "ท่อฟ้าครึ่งนิ้ว 50 เส้น", itemQuery: "ท่อฟ้า 1/2 นิ้ว", quantity: 50, unit: "เส้น" }] },
      catalog,
    );
    const v = viewDraft(draftId, store.drafts[draftId], catalog, settings);
    expect(v.lines).toHaveLength(1);
    expect(v.lines[0].quantity).toBe(50);
    expect(v.lines[0].item?.sku).toBe("PVC-050-85");
  });

  it("never shows a price in search results", async () => {
    const catalog = await loadCatalog({ csv });
    const found = searchCatalog("ทราย", catalog);
    expect(found.length).toBeGreaterThan(0);
    expect(Object.keys(found[0]).sort()).toEqual(["name", "sku", "unit"]);
  });
});

describe("revise", () => {
  it("settles the open lines and makes the draft ready", async () => {
    const { catalog, store, draftId, view } = await start("03-ambiguous-missing.txt");
    const [cement, led, sand, copper] = view().lines;
    const next = reviseDraft(
      store,
      draftId,
      {
        changes: [
          { lineId: cement.lineId, sku: cement.candidates[0].sku },
          { lineId: led.lineId, sku: led.candidates[0].sku },
          { lineId: sand.lineId, quantity: 2 },
          { lineId: copper.lineId, remove: true },
        ],
      },
      catalog,
    );
    const v = view(next);
    expect(v.lines).toHaveLength(3);
    expect(v.readyToIssue).toBe(true);
    expect(v.questionsForCustomer).toEqual([]);
  });

  it("rejects a SKU that is not in the catalog", async () => {
    const { catalog, store, draftId, view } = await start("03-ambiguous-missing.txt");
    expect(() => reviseDraft(store, draftId, { changes: [{ lineId: view().lines[0].lineId, sku: "MADE-UP-1" }] }, catalog)).toThrow(
      /not in the catalog/,
    );
  });

  it("rejects an unknown draft or line", async () => {
    const { catalog, store, draftId } = await start("02-mixed-electrical.txt");
    expect(() => reviseDraft(store, "D99", {}, catalog)).toThrow(/no draft D99/);
    expect(() => reviseDraft(store, draftId, { changes: [{ lineId: "nope", quantity: 1 }] }, catalog)).toThrow(/no line nope/);
  });
});

describe("issue", () => {
  it("issues a ready draft at the approved total, in Thai, dated in Bangkok time", async () => {
    const { catalog, store, draftId } = await start("02-mixed-electrical.txt");
    const { store: after, issued } = issueQuotation(store, { draftId, grandTotal: "11,012.44", customerName: "คุณสมชาย" }, catalog, settings, options);
    expect(issued.quoteNo).toBe("QT-20261120-100405");
    expect(issued.date).toBe("2026-11-20");
    expect(issued.quotation.grandTotalSatang).toBe(1_101_244);
    expect(issued.text).toContain("รวมทั้งสิ้น 11,012.44 บาท (หนึ่งหมื่นหนึ่งพันสิบสองบาทสี่สิบสี่สตางค์)");
    expect(issued.text).toContain("ลูกค้า: คุณสมชาย");
    expect(after.drafts[draftId].issuedAs).toBe(issued.quoteNo);
  });

  it("refuses when the approved total is not the current total", async () => {
    const { catalog, store, draftId } = await start("02-mixed-electrical.txt");
    expect(() => issueQuotation(store, { draftId, grandTotal: "9,999.00" }, catalog, settings, options)).toThrow(/Nothing was issued/);
  });

  it("refuses a draft that still has open lines", async () => {
    const { catalog, store, draftId } = await start("03-ambiguous-missing.txt");
    expect(() => issueQuotation(store, { draftId, grandTotal: "0.00" }, catalog, settings, options)).toThrow(/not ready/);
  });

  it("issues once, and an issued draft cannot be changed", async () => {
    const { catalog, store, draftId, view } = await start("02-mixed-electrical.txt");
    const { store: after } = issueQuotation(store, { draftId, grandTotal: "11,012.44" }, catalog, settings, options);
    expect(() => issueQuotation(after, { draftId, grandTotal: "11,012.44" }, catalog, settings, options)).toThrow(/already issued/);
    expect(() => reviseDraft(after, draftId, { changes: [{ lineId: view().lines[0].lineId, quantity: 99 }] }, catalog)).toThrow(
      /can no longer be changed/,
    );
    expect(view(after).readyToIssue).toBe(false);
  });

  it("uses the price in the catalog at issue time, not an earlier one", async () => {
    const { catalog, store, draftId } = await start("02-mixed-electrical.txt");
    const dearer = catalog.map((i) => (i.sku === "VAF-2X25" ? { ...i, unitPriceSatang: i.unitPriceSatang + 10_000 } : i));
    expect(() => issueQuotation(store, { draftId, grandTotal: "11,012.44" }, dearer, settings, options)).toThrow(/The total is now/);
  });
});
