import { normalize, toArabicDigits, UNIT_WORDS } from "./text";
import type { RequestedLine } from "./types";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const UNIT_PATTERN = UNIT_WORDS.map(escape).join("|");

/** "50 เส้น", "2.5 m", "1,000 pcs". English units need a word boundary; Thai has none. */
const QTY_UNIT = new RegExp(
  `(\\d[\\d,]*(?:\\.\\d+)?)\\s*(${UNIT_PATTERN})(?![a-z])`,
  "gi",
);
/** "x 10", "×10", "จำนวน 10", "qty 10" — a quantity without a unit word. */
const QTY_ONLY = /(?:^|\s)(?:x|×|จำนวน|qty\.?|quantity)\s*(\d[\d,]*(?:\.\d+)?)/i;
/** "Stapler 10" — a bare number at the very end, used only when nothing better was found. */
const QTY_TRAILING = /\s(\d[\d,]*)\s*$/;

const LIST_MARKER = /^\s*(?:\d{1,3}[.)]|[-•*–])\s+/;
const LEADING_CONNECTOR = /^\s*(?:และ|กับ|แล้วก็|รวมถึง|and|plus|\+|&)\s*/i;

/**
 * Request and politeness words that carry no product meaning. Thai has no word
 * boundaries, so these are only stripped at the start or end of a fragment
 * (stripping "ขอ" anywhere would break "ขอบยาง"; a leading "ขอ" is only
 * stripped when the next letter cannot be a syllable final, so "ขอบ…"/"ของ…" survive).
 */
const LEADING_FILLER = new RegExp(
  `^(?:${["สวัสดีครับ", "สวัสดีค่ะ", "สวัสดีคะ", "สวัสดี", "hello", "hi", "ขอใบเสนอราคา", "ขอราคา", "รบกวน", "ต้องการ", "อยากได้", "สั่ง", "แล้วก็", "please quote", "please", "quote", "i need", "we need", "need", "want", "would like"].map(escape).join("|")}|ขอ(?![บนกงดมยว])|มี(?![บนกงดมยว]))(?![a-z])\\s*`,
  "i",
);
const TRAILING_FILLER = new RegExp(
  `\\s*(?:${["ด้วยครับ", "ด้วยค่ะ", "ด้วยนะคะ", "ด้วยนะ", "ด้วย", "ไหม", "มั้ย", "หรือเปล่า", "ครับ", "ค่ะ", "คะ", "นะคะ", "นะ", "จ้า", "please"].map(escape).join("|")})$`,
  "i",
);

function stripFiller(text: string): string {
  let prev: string;
  do {
    prev = text;
    text = text.replace(LEADING_FILLER, "").replace(TRAILING_FILLER, "").trim();
  } while (text !== prev);
  return text;
}

/** Lines that are clearly greetings, sign-offs or meta text. */
const NON_ITEM = /^(?:สวัสดี|ขอบคุณ|ขอแสดงความนับถือ|เรียน|hi\b|hello|dear|thanks|thank you|regards|best regards)/i;

function parseQty(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function cleanItemText(text: string): string {
  const cleaned = normalize(text.replace(LIST_MARKER, "").replace(LEADING_CONNECTOR, ""));
  return stripFiller(cleaned).replace(/^[-–:]+|[-–:]+$/g, "").trim();
}

/**
 * Splits "ท่อ 10 เส้นและข้อต่อ 5 ตัว" after each quantity+unit so each product gets its own line.
 * Adjacent matches with nothing but spaces between them ("ปูน 50 กก. 10 ถุง") are a spec
 * followed by the quantity, so they stay together.
 */
function splitAfterQuantities(segment: string): string[] {
  const matches = [...segment.matchAll(QTY_UNIT)];
  if (matches.length < 2) return [segment];
  const parts: string[] = [];
  let start = 0;
  for (let k = 0; k < matches.length - 1; k++) {
    const end = matches[k].index! + matches[k][0].length;
    const between = segment.slice(end, matches[k + 1].index);
    if (!/[a-z\u0E01-\u0E4E]{2,}/i.test(between.replace(LEADING_CONNECTOR, ""))) continue;
    parts.push(segment.slice(start, end));
    start = end;
  }
  parts.push(segment.slice(start));
  return parts;
}

function parseSegment(segment: string): RequestedLine | null {
  const text = segment.trim().replace(LEADING_CONNECTOR, "").trim();
  if (!text) return null;

  let quantity: number | null = null;
  let unit: string | null = null;
  let itemPart = text;

  const qtyUnit = [...text.matchAll(QTY_UNIT)].pop();
  if (qtyUnit) {
    quantity = parseQty(qtyUnit[1]);
    unit = qtyUnit[2];
    itemPart = text.slice(0, qtyUnit.index) + " " + text.slice(qtyUnit.index! + qtyUnit[0].length);
  } else {
    const qtyOnly = QTY_ONLY.exec(text) ?? QTY_TRAILING.exec(text);
    if (qtyOnly) {
      quantity = parseQty(qtyOnly[1]);
      itemPart = text.replace(qtyOnly[0], " ");
    }
  }

  const itemQuery = cleanItemText(itemPart.replace(/\s(?:x|×|จำนวน|qty\.?)\s*$/i, ""));
  if (!itemQuery || (quantity === null && NON_ITEM.test(normalize(text)))) return null;
  return { text, itemQuery, quantity, unit };
}

/**
 * Rule-based extraction used when no model is configured (and as the offline fallback).
 * Handles numbered/bulleted lists, comma/semicolon separated items, Thai "และ/กับ"
 * joins, Thai digits and mixed Thai/English text.
 */
export function extractRequestedLinesHeuristic(inquiry: string): RequestedLine[] {
  const lines: RequestedLine[] = [];
  for (const rawLine of toArabicDigits(inquiry.normalize("NFC")).split(/\r?\n/)) {
    const line = rawLine.replace(LIST_MARKER, "");
    // Split on separators, but not on thousands separators like "1,000".
    const segments = line.split(/,(?!\d{3}\b)|;|\s+(?:และ|กับ|and)\s+/i);
    for (const seg of segments) {
      for (const part of splitAfterQuantities(seg)) {
        const parsed = parseSegment(part);
        if (parsed) lines.push(parsed);
      }
    }
  }
  return lines;
}
