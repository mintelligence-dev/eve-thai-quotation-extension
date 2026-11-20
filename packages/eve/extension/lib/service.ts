/**
 * What the tools do, without eve: every function takes the stored drafts and returns the next
 * ones, so the rules can be tested as plain functions. The tools add state and approval.
 */
import {
  acknowledgeUnit,
  addLine,
  assembleDraft,
  bahtText,
  buildDraft,
  canApprove,
  chooseItem,
  customerQuestions,
  findCandidates,
  formatAmount,
  formatVatRate,
  heuristicSelector,
  previewTotals,
  priceQuotation,
  removeLine,
  SELECT_LIMITS,
  setQuantity,
  shortlist,
  type CatalogItem,
  type DraftIssue,
  type PricedQuotation,
  type QuotationDraft,
  type QuotationSettings,
  type RequestedLine,
} from "@eve-thai-quotation-extension/core";

export interface StoredDraft {
  draft: QuotationDraft;
  /** Set once the quotation has been issued; an issued draft can no longer be changed. */
  issuedAs: string | null;
  /** The key of this draft in shared storage, when drafts are shared. Also the last part of its link. */
  token?: string;
  /** The customer's message the draft was made from. */
  inquiry?: string;
  /** An uploaded catalog this draft is priced from, instead of the configured one. */
  catalogId?: string;
  customerName?: string;
  notes?: string;
  /** Address or contact of the customer, printed under their name. */
  customerDetails?: string;
  /** Replaces the configured seller name on this quotation. */
  sellerName?: string;
  /** Address or tax ID of the seller, printed under its name. */
  sellerDetails?: string;
  /** A quotation number chosen by a person. Left out, one is made from the time of issue. */
  quoteNo?: string;
  /** The quotation date, yyyy-mm-dd. Left out, the day of issue in Thailand. */
  date?: string;
  /** Replaces the configured number of days the prices stay valid. */
  validDays?: number;
  /** Replaces the configured VAT rate for this draft, in basis points. */
  vatRateBps?: number;
  /** Replaces the configured "prices already include VAT" for this draft. */
  pricesIncludeVat?: boolean;
  /** The issued quotation, kept so a shared draft can show and export it later. */
  issued?: IssuedQuotation;
}

export interface DraftStore {
  drafts: Record<string, StoredDraft>;
  next: number;
}

export const emptyStore = (): DraftStore => ({ drafts: {}, next: 1 });

/** Keep a session from growing without bound; the oldest drafts go first. */
const MAX_DRAFTS = 20;

export interface ItemView {
  sku: string;
  name: string;
  unit: string;
}

export interface LineView {
  lineId: string;
  customerAsked: string;
  status: "matched" | "ambiguous" | "not_found";
  item: ItemView | null;
  quantity: number | null;
  /** Catalog price, formatted. Present only for a line that has an item. */
  unitPrice: string | null;
  lineTotal: string | null;
  /** What still has to be settled on this line, in words. */
  problems: string[];
  /** The same problems as codes, in the same order, for a page that words them itself. */
  problemCodes: DraftIssue["kind"][];
  /** Items the customer may have meant. Choose one of these, or use the search tool. */
  candidates: ItemView[];
}

export interface DraftView {
  draftId: string;
  lines: LineView[];
  /** Questions to put to the customer, ready to send. */
  questionsForCustomer: string[];
  /** Parts of the message that were not treated as products. */
  ignored: string[];
  readyToIssue: boolean;
  blockers: string[];
  /** Pass `grandTotal` to the issue tool exactly as written here. */
  totals: { subtotal: string; vat: string; vatRate: string; grandTotal: string };
  issuedAs: string | null;
  /** Where a person can open this draft in a table and change it. Present when drafts are shared. */
  editUrl?: string;
}

const toItemView = (item: CatalogItem): ItemView => ({ sku: item.sku, name: item.name, unit: item.unit });

function problemText(issue: DraftIssue): string {
  switch (issue.kind) {
    case "missing_quantity":
      return "No quantity given.";
    case "unit_mismatch":
      return `The customer asked for "${issue.requested}" but this item is sold per "${issue.catalog}". Confirm the quantity in "${issue.catalog}" with the customer, then set confirmUnit.`;
    case "ambiguous":
      return "More than one item fits. Ask which one.";
    case "not_found":
      return "Nothing in the catalog fits. Ask for details, search for another item, or remove the line.";
    case "rejected_sku":
      return `SKU ${issue.sku} was not among the items found for this line and was not used.`;
  }
}

export function viewDraft(
  draftId: string,
  stored: StoredDraft,
  catalog: CatalogItem[],
  settings: QuotationSettings,
): DraftView {
  const { draft } = stored;
  const bySku = new Map(catalog.map((i) => [i.sku, i]));
  const totals = previewTotals(draft, catalog, settings);
  const check = canApprove(draft, catalog);
  return {
    draftId,
    lines: draft.lines.map((line, i) => {
      const item = line.sku ? bySku.get(line.sku) : undefined;
      return {
        lineId: line.id,
        customerAsked: line.request.text,
        status: line.status,
        item: item ? toItemView(item) : null,
        quantity: line.quantity,
        unitPrice: item ? formatAmount(item.unitPriceSatang) : null,
        lineTotal: item && line.quantity ? formatAmount(totals.lineTotals[i]) : null,
        problems: line.issues.map(problemText),
        problemCodes: line.issues.map((issue) => issue.kind),
        candidates: line.candidates
          .map((c) => bySku.get(c.sku))
          .filter((x): x is CatalogItem => Boolean(x))
          .map(toItemView),
      };
    }),
    questionsForCustomer: customerQuestions(draft, catalog),
    ignored: draft.ignored,
    readyToIssue: check.ok && stored.issuedAs === null,
    blockers: stored.issuedAs ? [`Already issued as ${stored.issuedAs}.`] : check.blockers,
    totals: {
      subtotal: formatAmount(totals.subtotalSatang),
      vat: formatAmount(totals.vatSatang),
      vatRate: formatVatRate(settings.vatRateBps),
      grandTotal: formatAmount(totals.grandTotalSatang),
    },
    issuedAs: stored.issuedAs,
  };
}

function put(store: DraftStore, draftId: string, stored: StoredDraft): DraftStore {
  const drafts = { ...store.drafts, [draftId]: stored };
  const ids = Object.keys(drafts);
  for (const old of ids.slice(0, Math.max(0, ids.length - MAX_DRAFTS))) delete drafts[old];
  return { ...store, drafts };
}

function open(store: DraftStore, draftId: string): StoredDraft {
  const stored = store.drafts[draftId];
  if (!stored) throw new Error(`There is no draft ${draftId} in this conversation. Create one with the draft tool.`);
  return stored;
}

export interface NewDraftInput {
  /** The customer's message, as written. */
  inquiry: string;
  /**
   * The lines as the caller understood them. When given, they replace the built-in reading of
   * the message, which copes less well with messy text.
   */
  lines?: RequestedLine[];
}

export async function createDraft(
  store: DraftStore,
  input: NewDraftInput,
  catalog: CatalogItem[],
): Promise<{ store: DraftStore; draftId: string }> {
  let draft: QuotationDraft;
  if (input.lines && input.lines.length > 0) {
    if (input.lines.length > SELECT_LIMITS.lines) {
      throw new Error(`Too many lines (${input.lines.length}); the limit is ${SELECT_LIMITS.lines}. Split the request.`);
    }
    const requests = shortlist(input.lines, catalog);
    draft = assembleDraft(requests, await heuristicSelector.select(requests), catalog);
  } else {
    draft = await buildDraft({ inquiry: input.inquiry, catalog });
  }
  const draftId = `D${store.next}`;
  return {
    store: put({ ...store, next: store.next + 1 }, draftId, { draft, issuedAs: null, inquiry: input.inquiry }),
    draftId,
  };
}

export interface LineChange {
  lineId: string;
  /** Choose this catalog item for the line. */
  sku?: string;
  quantity?: number;
  /** The customer confirmed the quantity in the unit the item is sold in. */
  confirmUnit?: boolean;
  remove?: boolean;
}

export interface Revision {
  changes?: LineChange[];
  /** Items to add that the customer did not ask for in the first message, such as delivery. */
  add?: { sku: string; quantity: number }[];
}

export function reviseDraft(store: DraftStore, draftId: string, revision: Revision, catalog: CatalogItem[]): DraftStore {
  const stored = open(store, draftId);
  if (stored.issuedAs) throw new Error(`Draft ${draftId} was issued as ${stored.issuedAs} and can no longer be changed. Create a new draft.`);
  const bySku = new Map(catalog.map((i) => [i.sku, i]));
  const item = (sku: string) => {
    const found = bySku.get(sku);
    if (!found) throw new Error(`SKU ${sku} is not in the catalog. Use a SKU from the line's candidates or from the search tool.`);
    return found;
  };

  let draft = stored.draft;
  for (const change of revision.changes ?? []) {
    if (!draft.lines.some((l) => l.id === change.lineId)) throw new Error(`Draft ${draftId} has no line ${change.lineId}.`);
    if (change.remove) {
      draft = removeLine(draft, change.lineId);
      continue;
    }
    if (change.sku !== undefined) draft = chooseItem(draft, change.lineId, item(change.sku));
    if (change.quantity !== undefined) draft = setQuantity(draft, change.lineId, change.quantity);
    if (change.confirmUnit) draft = acknowledgeUnit(draft, change.lineId);
  }
  for (const extra of revision.add ?? []) draft = addLine(draft, item(extra.sku), extra.quantity);
  return put(store, draftId, { ...stored, draft, issuedAs: null });
}

export function searchCatalog(query: string, catalog: CatalogItem[], limit = 8): ItemView[] {
  const bySku = new Map(catalog.map((i) => [i.sku, i]));
  return findCandidates(query, catalog, { limit, minScore: 0.15 })
    .map((c) => bySku.get(c.sku))
    .filter((x): x is CatalogItem => Boolean(x))
    .map(toItemView);
}

export interface IssueInput {
  draftId: string;
  /** The grand total the approver was shown, as written in the draft's totals. */
  grandTotal: string;
  customerName?: string;
  notes?: string;
}

export interface IssuedQuotation {
  quoteNo: string;
  date: string;
  validDays: number;
  customerName: string;
  quotation: PricedQuotation;
  notes: string;
  sellerName: string;
  customerDetails: string;
  sellerDetails: string;
  /** The quotation as text, ready to send to the customer. */
  text: string;
}

const dateParts = (now: Date) => {
  // Quotation dates follow the Thai business day, wherever the agent runs.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}${get("minute")}${get("second")}` };
};

export function renderQuotation(q: Omit<IssuedQuotation, "text">): string {
  const { quotation, sellerName, notes } = q;
  const indented = (text: string) => (text ? [text] : []);
  const thaiDate = new Date(`${q.date}T00:00:00+07:00`).toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const lines = quotation.lines.map(
    (l, i) =>
      `${i + 1}. ${l.name} (${l.sku})\n   ${l.quantity.toLocaleString("th-TH")} ${l.unit} × ${formatAmount(l.unitPriceSatang)} = ${formatAmount(l.lineTotalSatang)}`,
  );
  const optional = (text: string) => (text ? [text] : []);
  return [
    `ใบเสนอราคา ${q.quoteNo}`,
    ...optional(sellerName),
    ...indented(q.sellerDetails),
    `วันที่ ${thaiDate} · ยืนราคา ${q.validDays} วัน`,
    ...optional(q.customerName ? `ลูกค้า: ${q.customerName}` : ""),
    ...indented(q.customerDetails),
    "",
    ...lines,
    "",
    `มูลค่าก่อนภาษี ${formatAmount(quotation.subtotalSatang)} บาท`,
    `ภาษีมูลค่าเพิ่ม ${formatVatRate(quotation.settings.vatRateBps)} ${formatAmount(quotation.vatSatang)} บาท`,
    `รวมทั้งสิ้น ${formatAmount(quotation.grandTotalSatang)} บาท (${bahtText(quotation.grandTotalSatang)})`,
    ...optional(quotation.settings.pricesIncludeVat ? "* ราคาสินค้ารวมภาษีมูลค่าเพิ่มแล้ว" : ""),
    ...optional(notes ? `หมายเหตุ: ${notes}` : ""),
  ].join("\n");
}

/**
 * Prices the draft and marks it issued. Runs only after a person approved the call, and only if
 * the total they approved is still the total: a draft that changed in between is refused.
 */
export function issueQuotation(
  store: DraftStore,
  input: IssueInput,
  catalog: CatalogItem[],
  settings: QuotationSettings,
  options: { validDays: number; sellerName: string; now?: Date },
): { store: DraftStore; issued: IssuedQuotation } {
  const stored = open(store, input.draftId);
  if (stored.issuedAs) throw new Error(`Draft ${input.draftId} was already issued as ${stored.issuedAs}.`);
  const check = canApprove(stored.draft, catalog);
  if (!check.ok) throw new Error(`Draft ${input.draftId} is not ready: ${check.blockers.join("; ")}`);

  const quotation = priceQuotation(stored.draft, catalog, settings);
  const total = formatAmount(quotation.grandTotalSatang);
  if (input.grandTotal.replace(/[^\d.]/g, "") !== total.replace(/[^\d.]/g, "")) {
    throw new Error(
      `The total is now ${total}, not ${input.grandTotal}. Nothing was issued. Show the current draft and ask for approval of ${total}.`,
    );
  }

  const today = dateParts(options.now ?? new Date());
  const date = stored.date ?? today.date;
  const quoteNo = stored.quoteNo?.trim() || `QT-${today.date.replace(/-/g, "")}-${today.time}`;
  const base = {
    quoteNo,
    date,
    validDays: stored.validDays ?? options.validDays,
    customerName: (input.customerName ?? stored.customerName ?? "").trim(),
    notes: (input.notes ?? stored.notes ?? "").trim(),
    sellerName: (stored.sellerName ?? options.sellerName).trim(),
    customerDetails: (stored.customerDetails ?? "").trim(),
    sellerDetails: (stored.sellerDetails ?? "").trim(),
    quotation,
  };
  const issued: IssuedQuotation = { ...base, text: renderQuotation(base) };
  return { store: put(store, input.draftId, { ...stored, issuedAs: quoteNo, issued }), issued };
}
