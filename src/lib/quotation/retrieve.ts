import { compact, diceSimilarity, toArabicDigits, tokenize } from "./text";
import type { Candidate, CatalogItem } from "./types";

function numbersIn(text: string): Set<string> {
  // "1/2" and "4" are both meaningful sizes; keep fractions as one token.
  return new Set(toArabicDigits(text).match(/\d+(?:[./]\d+)?/g) ?? []);
}

function fieldScore(query: string, queryTokens: string[], field: string): number {
  const q = compact(query);
  const f = compact(field);
  if (!q || !f) return 0;
  if (q === f) return 1;

  let containment = 0;
  if (q.length >= 3 && f.length >= 3 && (f.includes(q) || q.includes(f))) {
    const ratio = Math.min(q.length, f.length) / Math.max(q.length, f.length);
    containment = 0.6 + 0.3 * ratio;
  }

  // Length-weighted share of the request's words found in this field, so the
  // product noun ("ทองแดง", 6 letters) outweighs generic bits ("ท่อ", 3 letters).
  let total = 0;
  let covered = 0;
  for (const t of queryTokens) {
    const w = compact(t).length;
    total += w;
    if (f.includes(compact(t))) covered += w;
  }
  const coverage = total > 0 ? covered / total : 0;
  const fuzzy = 0.5 * diceSimilarity(q, f) + 0.5 * coverage;

  return Math.max(containment, fuzzy);
}

/** Sizes and measures are scored by the number check below, not as words. */
const MEASURE_TOKEN = /^(?:\d+(?:[./]\d+)?|นิ้ว|inch|in|มม|ซม|ม|mm|cm|m|หุน|ตร|sq)$/i;

/** Similarity of a free-text request to one catalog item, 0..1. */
export function scoreItem(query: string, item: CatalogItem): number {
  const tokens = tokenize(query).filter((t) => !MEASURE_TOKEN.test(t));
  const fields = [item.name, item.nameEn ?? "", item.sku, ...item.aliases];
  if (fields.some((f) => f && compact(f) === compact(query))) return 1;

  let best = 0;
  for (const f of fields) if (f) best = Math.max(best, fieldScore(query, tokens, f));

  // A request for "4 หุน" must not rank a 6 หุน pipe as high as a 4 หุน one.
  const qNums = numbersIn(query);
  if (qNums.size > 0) {
    const itemNums = numbersIn(fields.join(" "));
    const hit = [...qNums].filter((n) => itemNums.has(n)).length;
    best *= 0.6 + 0.4 * (hit / qNums.size);
  }
  return Math.round(best * 1000) / 1000;
}

/**
 * Shortlists catalog items for one request. Only this shortlist (never the whole
 * catalog, never prices) is shown to the language model.
 */
export function findCandidates(
  query: string,
  catalog: CatalogItem[],
  { limit = 8, minScore = 0.2 }: { limit?: number; minScore?: number } = {},
): Candidate[] {
  return catalog
    .map((item) => ({ sku: item.sku, score: scoreItem(query, item) }))
    .filter((c) => c.score >= minScore)
    .sort((a, b) => b.score - a.score || a.sku.localeCompare(b.sku))
    .slice(0, limit);
}
