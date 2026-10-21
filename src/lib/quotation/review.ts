import { computeTotals, lineTotalSatang } from "./money";
import { sameUnit } from "./text";
import type {
  CatalogItem,
  DraftIssue,
  DraftLine,
  PricedQuotation,
  QuotationDraft,
  QuotationSettings,
} from "./types";

/** Issues that disappear once a person picks the item themselves. */
const SELECTION_ISSUES: DraftIssue["kind"][] = ["ambiguous", "not_found", "rejected_sku"];

/** The reviewer picks (or changes) the catalog item for a line. */
export function chooseItem(draft: QuotationDraft, lineId: string, item: CatalogItem): QuotationDraft {
  return mapLine(draft, lineId, (line) => {
    const issues = line.issues.filter(
      (i) => !SELECTION_ISSUES.includes(i.kind) && i.kind !== "unit_mismatch",
    );
    const requested = line.request.unit;
    if (requested && !sameUnit(requested, item.unit)) {
      issues.push({ kind: "unit_mismatch", requested, catalog: item.unit });
    }
    return { ...line, sku: item.sku, status: "matched", issues };
  });
}

export function setQuantity(draft: QuotationDraft, lineId: string, quantity: number | null): QuotationDraft {
  return mapLine(draft, lineId, (line) => {
    const valid = quantity !== null && Number.isFinite(quantity) && quantity > 0;
    const issues: DraftIssue[] = line.issues.filter((i) => i.kind !== "missing_quantity");
    if (!valid) issues.push({ kind: "missing_quantity" });
    return { ...line, quantity: valid ? quantity : null, issues };
  });
}

/** Unit mismatches are a warning; the reviewer clears it once the quantity is confirmed. */
export function acknowledgeUnit(draft: QuotationDraft, lineId: string): QuotationDraft {
  return mapLine(draft, lineId, (line) => ({
    ...line,
    issues: line.issues.filter((i) => i.kind !== "unit_mismatch"),
  }));
}

export function removeLine(draft: QuotationDraft, lineId: string): QuotationDraft {
  return { ...draft, lines: draft.lines.filter((l) => l.id !== lineId) };
}

let manualId = 0;

/** Adds an item the inquiry did not mention (e.g. delivery), chosen from the catalog. */
export function addLine(draft: QuotationDraft, item: CatalogItem, quantity: number): QuotationDraft {
  const line: DraftLine = {
    id: `m${Date.now().toString(36)}${(manualId++).toString(36)}`,
    request: { text: item.name, itemQuery: item.name, quantity, unit: item.unit },
    status: "matched",
    sku: item.sku,
    quantity,
    candidates: [{ sku: item.sku, score: 1 }],
    issues: [],
  };
  return { ...draft, lines: [...draft.lines, line] };
}

function mapLine(draft: QuotationDraft, id: string, fn: (l: DraftLine) => DraftLine): QuotationDraft {
  return { ...draft, lines: draft.lines.map((l) => (l.id === id ? fn(l) : l)) };
}

export interface ApprovalCheck {
  ok: boolean;
  /** Human-readable blockers, one per problem. */
  blockers: string[];
}

/**
 * Whether a person may approve this draft. Every line needs a catalog item that
 * still exists, a positive quantity and no open issue. Approval itself is a
 * separate, explicit human action in the UI; this only says whether it is allowed.
 */
export function canApprove(draft: QuotationDraft, catalog: CatalogItem[]): ApprovalCheck {
  const skus = new Set(catalog.map((i) => i.sku));
  const blockers: string[] = [];
  if (draft.lines.length === 0) blockers.push("ยังไม่มีรายการสินค้า / No lines yet.");
  draft.lines.forEach((line, i) => {
    const label = `บรรทัด ${i + 1} (${line.request.text})`;
    if (!line.sku) blockers.push(`${label}: ยังไม่ได้เลือกสินค้า / no item selected`);
    else if (!skus.has(line.sku)) blockers.push(`${label}: ไม่พบรหัส ${line.sku} ในแคตตาล็อก / SKU not in catalog`);
    if (line.quantity === null || !(line.quantity > 0)) blockers.push(`${label}: ไม่ระบุจำนวน / no quantity`);
    if (line.issues.some((x) => x.kind === "unit_mismatch")) {
      blockers.push(`${label}: หน่วยไม่ตรงกับแคตตาล็อก ต้องยืนยัน / unit mismatch must be confirmed`);
    }
  });
  return { ok: blockers.length === 0, blockers };
}

/**
 * Prices an approvable draft. Unit prices are looked up from the catalog by SKU
 * here and only here; nothing upstream (including the model) can set a price.
 */
export function priceQuotation(
  draft: QuotationDraft,
  catalog: CatalogItem[],
  settings: QuotationSettings,
): PricedQuotation {
  const check = canApprove(draft, catalog);
  if (!check.ok) throw new Error(`Draft cannot be priced: ${check.blockers.join("; ")}`);
  const bySku = new Map(catalog.map((i) => [i.sku, i]));
  const lines = draft.lines.map((line) => {
    const item = bySku.get(line.sku!)!;
    const quantity = line.quantity!;
    return {
      sku: item.sku,
      name: item.name,
      unit: item.unit,
      quantity,
      unitPriceSatang: item.unitPriceSatang,
      lineTotalSatang: lineTotalSatang(item.unitPriceSatang, quantity),
    };
  });
  return {
    lines,
    settings,
    ...computeTotals(
      lines.map((l) => l.lineTotalSatang),
      settings,
    ),
  };
}

/** Running totals for the review screen; lines without an item or quantity count as zero. */
export function previewTotals(draft: QuotationDraft, catalog: CatalogItem[], settings: QuotationSettings) {
  const bySku = new Map(catalog.map((i) => [i.sku, i]));
  const lineTotals = draft.lines.map((l) => {
    const item = l.sku ? bySku.get(l.sku) : undefined;
    return item && l.quantity ? lineTotalSatang(item.unitPriceSatang, l.quantity) : 0;
  });
  return { lineTotals, ...computeTotals(lineTotals, settings) };
}
