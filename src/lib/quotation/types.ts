/** One sellable item from the company's own catalog. Prices live here and nowhere else. */
export interface CatalogItem {
  sku: string;
  name: string;
  nameEn?: string;
  aliases: string[];
  unit: string;
  /** Unit price in satang (1 THB = 100 satang) to keep all money math in integers. */
  unitPriceSatang: number;
  category?: string;
}

export interface CsvIssue {
  /** 1-based row number as shown in a spreadsheet (header = row 1). 0 for file-level problems. */
  row: number;
  column?: string;
  message: string;
}

export interface CatalogImportResult {
  items: CatalogItem[];
  errors: CsvIssue[];
  warnings: CsvIssue[];
}

export interface QuotationSettings {
  /** VAT rate in basis points: 700 = 7%. */
  vatRateBps: number;
  /** true when catalog prices already include VAT. */
  pricesIncludeVat: boolean;
}

export const DEFAULT_SETTINGS: QuotationSettings = {
  vatRateBps: 700,
  pricesIncludeVat: false,
};

/** One thing the customer asked for, as understood from the inquiry text. */
export interface RequestedLine {
  /** The fragment of the inquiry this line came from. */
  text: string;
  /** Normalised description used for catalog search (no quantity/unit). */
  itemQuery: string;
  quantity: number | null;
  unit: string | null;
}

export interface Candidate {
  sku: string;
  score: number;
}

export type MatchStatus = "matched" | "ambiguous" | "not_found";

/** What the selector may see about a candidate: identity only, never the price. */
export interface CandidateView {
  sku: string;
  name: string;
  nameEn?: string;
  unit: string;
  score: number;
}

export interface MatchRequest {
  line: RequestedLine;
  candidates: CandidateView[];
}

/** A selector's decision for one requested line. */
export interface Selection {
  status: MatchStatus;
  /** Must be one of the line's candidate SKUs when status is "matched". */
  sku: string | null;
  /** Question to ask the customer when the request is unclear. */
  question: string | null;
}

export type DraftIssue =
  | { kind: "missing_quantity" }
  | { kind: "unit_mismatch"; requested: string; catalog: string }
  | { kind: "ambiguous"; question: string | null }
  | { kind: "not_found"; question: string | null }
  | { kind: "rejected_sku"; sku: string };

export interface DraftLine {
  id: string;
  request: RequestedLine;
  status: MatchStatus;
  sku: string | null;
  quantity: number | null;
  /** Shortlist from the catalog, best first. The reviewer picks from these. */
  candidates: Candidate[];
  issues: DraftIssue[];
}

export interface QuotationDraft {
  lines: DraftLine[];
  /** Inquiry fragments that did not look like a product request (greetings, notes). */
  ignored: string[];
}

export interface PricedLine {
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  unitPriceSatang: number;
  lineTotalSatang: number;
}

export interface QuotationTotals {
  /** Amount before VAT. */
  subtotalSatang: number;
  vatSatang: number;
  /** Amount including VAT. */
  grandTotalSatang: number;
}

export interface PricedQuotation extends QuotationTotals {
  lines: PricedLine[];
  settings: QuotationSettings;
}
