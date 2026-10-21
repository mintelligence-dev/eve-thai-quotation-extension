import { extractRequestedLinesHeuristic } from "./extract";
import { findCandidates } from "./retrieve";
import { sameUnit } from "./text";
import type {
  CandidateView,
  CatalogItem,
  DraftIssue,
  DraftLine,
  MatchRequest,
  QuotationDraft,
  RequestedLine,
  Selection,
} from "./types";

/** Turns a free-text inquiry into requested lines. */
export interface LineExtractor {
  extract(inquiry: string): Promise<RequestedLine[]>;
}

/**
 * Picks a catalog item for each request from its shortlist, or says it cannot.
 * Implementations receive no prices and may only answer with shortlisted SKUs;
 * anything else is rejected by assembleDraft().
 */
export interface MatchSelector {
  select(requests: MatchRequest[]): Promise<Selection[]>;
}

/** A request with no quantity and no candidate this good is treated as chit-chat, not a product. */
const PRODUCT_LIKE_SCORE = 0.4;
const MATCH_SCORE = 0.75;
const MATCH_MARGIN = 0.08;
/** A weaker match is still accepted when nothing else in the catalog is plausible. */
const SOLE_MATCH_SCORE = 0.6;
/** Ambiguity questions only offer options this close to the best score. */
const OPTION_WINDOW = 0.15;

export const heuristicExtractor: LineExtractor = {
  async extract(inquiry) {
    return extractRequestedLinesHeuristic(inquiry);
  },
};

/** Score-threshold selector used when no model is configured. */
export const heuristicSelector: MatchSelector = {
  async select(requests) {
    return requests.map(({ candidates }) => {
      const [top, second] = candidates;
      if (!top || top.score < PRODUCT_LIKE_SCORE) return { status: "not_found", sku: null, question: null };
      const clearWinner = !second || top.score - second.score >= MATCH_MARGIN;
      const onlyPlausible = !second || second.score < PRODUCT_LIKE_SCORE;
      if ((top.score >= MATCH_SCORE && clearWinner) || (top.score >= SOLE_MATCH_SCORE && onlyPlausible)) {
        return { status: "matched", sku: top.sku, question: null };
      }
      return { status: "ambiguous", sku: null, question: null };
    });
  },
};

export function toCandidateView(item: CatalogItem, score: number): CandidateView {
  return { sku: item.sku, name: item.name, nameEn: item.nameEn, aliases: item.aliases, unit: item.unit, score };
}

/** Attaches a catalog shortlist to every requested line. */
export function shortlist(
  lines: RequestedLine[],
  catalog: CatalogItem[],
  limit = 8,
): MatchRequest[] {
  const bySku = new Map(catalog.map((i) => [i.sku, i]));
  return lines.map((line) => ({
    line,
    candidates: findCandidates(line.itemQuery, catalog, { limit }).map((c) =>
      toCandidateView(bySku.get(c.sku)!, c.score),
    ),
  }));
}

function unitIssue(request: RequestedLine, item: CatalogItem | undefined): DraftIssue[] {
  if (!item || !request.unit || sameUnit(request.unit, item.unit)) return [];
  return [{ kind: "unit_mismatch", requested: request.unit, catalog: item.unit }];
}

let nextId = 0;
const newId = () => `l${Date.now().toString(36)}${(nextId++).toString(36)}`;

/**
 * Combines shortlists and selector decisions into a reviewable draft.
 * This is where model output is distrusted: a "matched" SKU that was not on the
 * line's shortlist is rejected and the line falls back to "ambiguous".
 */
export function assembleDraft(
  requests: MatchRequest[],
  selections: Selection[],
  catalog: CatalogItem[],
): QuotationDraft {
  const bySku = new Map(catalog.map((i) => [i.sku, i]));
  const lines: DraftLine[] = [];
  const ignored: string[] = [];

  requests.forEach(({ line, candidates }, i) => {
    const sel: Selection = selections[i] ?? { status: "not_found", sku: null, question: null };
    const best = candidates[0]?.score ?? 0;
    if (line.quantity === null && best < PRODUCT_LIKE_SCORE && sel.status !== "matched") {
      ignored.push(line.text);
      return;
    }

    const issues: DraftIssue[] = [];
    let status = sel.status;
    let sku = sel.sku;

    if (status === "matched") {
      const onShortlist = sku !== null && candidates.some((c) => c.sku === sku) && bySku.has(sku);
      if (!onShortlist) {
        if (sku) issues.push({ kind: "rejected_sku", sku });
        status = candidates.length > 0 ? "ambiguous" : "not_found";
        sku = null;
      }
    } else {
      sku = null;
      // "Not found" is factually wrong when the request equals a catalog name or alias;
      // don't auto-match it either — let the reviewer decide.
      if (status === "not_found" && candidates[0]?.score === 1) status = "ambiguous";
    }

    if (status === "ambiguous") issues.push({ kind: "ambiguous", question: sel.question });
    if (status === "not_found") issues.push({ kind: "not_found", question: sel.question });
    if (line.quantity === null) issues.push({ kind: "missing_quantity" });
    issues.push(...unitIssue(line, sku ? bySku.get(sku) : undefined));

    lines.push({
      id: newId(),
      request: line,
      status,
      sku,
      quantity: line.quantity,
      candidates: candidates.map(({ sku, score }) => ({ sku, score })),
      issues,
    });
  });

  return { lines, ignored };
}

export interface BuildDraftOptions {
  inquiry: string;
  catalog: CatalogItem[];
  extractor?: LineExtractor;
  selector?: MatchSelector;
  shortlistSize?: number;
}

/** Full pipeline: extract → shortlist → select → validate. Defaults to the offline heuristics. */
export async function buildDraft({
  inquiry,
  catalog,
  extractor = heuristicExtractor,
  selector = heuristicSelector,
  shortlistSize,
}: BuildDraftOptions): Promise<QuotationDraft> {
  const lines = await extractor.extract(inquiry);
  const requests = shortlist(lines, catalog, shortlistSize);
  const selections = await selector.select(requests);
  return assembleDraft(requests, selections, catalog);
}

/** Questions to send back to the customer, derived from the draft's open issues. */
export function customerQuestions(draft: QuotationDraft, catalog: CatalogItem[]): string[] {
  const bySku = new Map(catalog.map((i) => [i.sku, i]));
  const out: string[] = [];
  for (const line of draft.lines) {
    const what = line.request.itemQuery || line.request.text;
    for (const issue of line.issues) {
      if (issue.kind === "missing_quantity") {
        out.push(`"${what}" ต้องการจำนวนเท่าไร?`);
      } else if (issue.kind === "ambiguous") {
        const top = line.candidates[0]?.score ?? 0;
        const options = line.candidates
          .filter((c) => c.score >= top - OPTION_WINDOW)
          .slice(0, 3)
          .map((c) => bySku.get(c.sku)?.name)
          .filter(Boolean);
        out.push(issue.question ?? `"${what}" หมายถึงรายการใด: ${options.join(" / ")}?`);
      } else if (issue.kind === "not_found") {
        out.push(issue.question ?? `"${what}" ไม่พบในแคตตาล็อก — ขอรายละเอียดเพิ่ม (ยี่ห้อ รุ่น ขนาด) หรือแจ้งว่าไม่มีจำหน่าย`);
      } else if (issue.kind === "unit_mismatch") {
        out.push(`"${what}" ขอเป็น "${issue.requested}" แต่สินค้าขายเป็น "${issue.catalog}" — รบกวนยืนยันจำนวนอีกครั้ง`);
      }
    }
  }
  return [...new Set(out)];
}
