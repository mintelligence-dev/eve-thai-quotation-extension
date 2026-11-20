const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

/** Converts Thai digits (๐-๙) to Arabic digits. */
export function toArabicDigits(input: string): string {
  return input.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)));
}

/**
 * Canonical form used for matching: NFC, Arabic digits, lower case,
 * punctuation removed, whitespace collapsed.
 */
export function normalize(input: string): string {
  return toArabicDigits(input.normalize("NFC"))
    .toLowerCase()
    .replace(/["'`“”‘’()\[\]{}<>]/g, " ")
    .replace(/(?<!\d)\/|\/(?!\d)/g, " ") // keep "1/2" (a size), drop other slashes
    .replace(/[,;:!?*#_|\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Same as normalize() but without spaces, so "ท่อ พีวีซี" and "ท่อพีวีซี" compare equal. */
export function compact(input: string): string {
  return normalize(input).replace(/[\s.\-]/g, "");
}

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter("th", { granularity: "word" })
    : null;

/** Word tokens for Thai, English or mixed text. Thai has no spaces, so we rely on Intl.Segmenter. */
export function tokenize(input: string): string[] {
  const text = normalize(input);
  if (!segmenter) return text.split(" ").filter(Boolean);
  const tokens: string[] = [];
  for (const s of segmenter.segment(text)) {
    if (s.isWordLike) tokens.push(s.segment);
  }
  return tokens;
}

/** Character bigrams of the compact form; robust to Thai spelling variants and typos. */
export function bigrams(input: string): Set<string> {
  const s = compact(input);
  const out = new Set<string>();
  if (s.length === 1) out.add(s);
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

/** Sørensen–Dice coefficient over character bigrams, 0..1. */
export function diceSimilarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let overlap = 0;
  for (const g of A) if (B.has(g)) overlap++;
  return (2 * overlap) / (A.size + B.size);
}

/**
 * Unit words seen in Thai/English B2B inquiries, mapped to a canonical key.
 * Units with the same key are considered the same; anything else is a mismatch
 * the reviewer has to look at (we never convert box ↔ piece automatically).
 */
const UNIT_SYNONYMS: Record<string, string> = {
  ตัว: "piece", ชิ้น: "piece", อัน: "piece", pcs: "piece", pc: "piece", piece: "piece", pieces: "piece", ea: "piece", each: "piece", unit: "piece", units: "piece",
  เส้น: "length", ท่อน: "length", length: "length", lengths: "length",
  ม้วน: "roll", roll: "roll", rolls: "roll",
  กล่อง: "box", box: "box", boxes: "box",
  ถุง: "bag", กระสอบ: "bag", bag: "bag", bags: "bag", sack: "bag", sacks: "bag",
  แผ่น: "sheet", sheet: "sheet", sheets: "sheet", panel: "sheet", panels: "sheet",
  ชุด: "set", set: "set", sets: "set", kit: "set",
  ดวง: "lamp", หลอด: "lamp", lamp: "lamp", lamps: "lamp", bulb: "lamp", bulbs: "lamp",
  เมตร: "metre", "ม.": "metre", m: "metre", meter: "metre", meters: "metre", metre: "metre", metres: "metre",
  ถัง: "pail", pail: "pail", pails: "pail",
  แกลลอน: "gallon", gallon: "gallon", gallons: "gallon",
  ก้อน: "block", block: "block", blocks: "block",
  ลูก: "ball", คิว: "cubic_metre", ลบ: "cubic_metre",
  กิโลกรัม: "kg", กก: "kg", "กก.": "kg", kg: "kg", กิโล: "kg",
  ลัง: "carton", carton: "carton", cartons: "carton", ctn: "carton",
  คู่: "pair", pair: "pair", pairs: "pair",
  กระป๋อง: "can", can: "can", cans: "can",
  ตู้: "cabinet", cabinet: "cabinet",
  เที่ยว: "trip", trip: "trip", trips: "trip",
  รีม: "ream", ream: "ream", reams: "ream",
  เล่ม: "book", book: "book", books: "book",
  ตลับ: "cartridge", cartridge: "cartridge", cartridges: "cartridge",
  แพ็ค: "pack", แพ็ก: "pack", แพค: "pack", pack: "pack", packs: "pack",
};

/** Unit words ordered longest first so the regex prefers "กิโลกรัม" over "กิโล". */
export const UNIT_WORDS = Object.keys(UNIT_SYNONYMS).sort((a, b) => b.length - a.length);

export function canonicalUnit(unit: string): string {
  const key = normalize(unit);
  return UNIT_SYNONYMS[key] ?? UNIT_SYNONYMS[key.replace(/\.$/, "")] ?? key;
}

export function sameUnit(a: string, b: string): boolean {
  return canonicalUnit(a) === canonicalUnit(b);
}
