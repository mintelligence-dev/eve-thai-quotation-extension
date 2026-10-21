import { parseBahtToSatang } from "./money";
import { normalize } from "./text";
import type { CatalogImportResult, CatalogItem, CsvIssue } from "./types";

export const MAX_CATALOG_ROWS = 10_000;

/**
 * Decodes an uploaded CSV file. Thai Excel often saves "CSV" as Windows-874 (TIS-620);
 * those bytes are not valid UTF-8, so we reject them with an actionable message
 * instead of silently showing mojibake.
 */
export function decodeCsvBytes(bytes: Uint8Array): { text: string } | { error: CsvIssue } {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { text: text.replace(/^﻿/, "") };
  } catch {
    return {
      error: {
        row: 0,
        message:
          "ไฟล์ไม่ใช่ UTF-8 (มักเป็นไฟล์ที่ Excel บันทึกแบบ Windows-874) — กรุณาบันทึกใหม่เป็น \"CSV UTF-8 (Comma delimited)\" / File is not UTF-8. Save it again as \"CSV UTF-8\".",
      },
    };
  }
}

/** RFC 4180 parser: quoted fields, escaped quotes, commas and newlines inside quotes. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"' && field === "") {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

type Column = "sku" | "name" | "name_en" | "aliases" | "unit" | "unit_price" | "category";

/** Accepted header spellings (English or Thai) for each column. */
const HEADER_ALIASES: Record<Column, string[]> = {
  sku: ["sku", "code", "item code", "product code", "รหัส", "รหัสสินค้า"],
  name: ["name", "name_th", "product name", "ชื่อ", "ชื่อสินค้า", "รายการ"],
  name_en: ["name_en", "english name", "ชื่อภาษาอังกฤษ"],
  aliases: ["aliases", "alias", "keywords", "ชื่อเรียกอื่น", "คำค้น"],
  unit: ["unit", "uom", "หน่วย", "หน่วยนับ"],
  unit_price: ["unit_price", "price", "unit price", "ราคา", "ราคาต่อหน่วย"],
  category: ["category", "หมวด", "หมวดหมู่"],
};

const REQUIRED: Column[] = ["sku", "name", "unit", "unit_price"];

function resolveHeader(cell: string): Column | null {
  const key = normalize(cell).replace(/\s+/g, " ");
  for (const [col, names] of Object.entries(HEADER_ALIASES) as [Column, string[]][]) {
    if (names.some((n) => normalize(n) === key)) return col;
  }
  return null;
}

/**
 * Parses and validates a catalog CSV. Every problem is reported with its spreadsheet
 * row number and column so a non-technical user can fix the file.
 * Aliases are separated by "|" (e.g. "ท่อฟ้า|ท่อ pvc").
 */
export function parseCatalogCsv(text: string): CatalogImportResult {
  const errors: CsvIssue[] = [];
  const warnings: CsvIssue[] = [];
  // Keep the original record number so blank lines don't shift reported row numbers.
  const rows = parseCsvRows(text)
    .map((cells, i) => ({ cells, rowNo: i + 1 }))
    .filter((r) => r.cells.some((c) => c.trim() !== ""));

  if (rows.length === 0) {
    return { items: [], errors: [{ row: 0, message: "ไฟล์ว่าง / The file is empty." }], warnings };
  }

  const header = rows[0].cells;
  const index = new Map<Column, number>();
  header.forEach((cell, i) => {
    const col = resolveHeader(cell);
    if (col && !index.has(col)) index.set(col, i);
  });
  const missing = REQUIRED.filter((c) => !index.has(c));
  if (missing.length > 0) {
    errors.push({
      row: 1,
      message: `ไม่พบคอลัมน์ที่จำเป็น: ${missing.join(", ")} / Missing required column(s): ${missing.join(", ")}. พบ / Found: ${header.join(", ")}`,
    });
    return { items: [], errors, warnings };
  }

  if (rows.length - 1 > MAX_CATALOG_ROWS) {
    errors.push({
      row: 0,
      message: `แคตตาล็อกมี ${rows.length - 1} แถว เกินขีดจำกัด ${MAX_CATALOG_ROWS} แถว / Too many rows (limit ${MAX_CATALOG_ROWS}).`,
    });
    return { items: [], errors, warnings };
  }

  const get = (r: string[], c: Column) => (index.has(c) ? (r[index.get(c)!] ?? "").trim() : "");
  const items: CatalogItem[] = [];
  const seen = new Map<string, number>();

  rows.slice(1).forEach(({ cells: r, rowNo }) => {
    const rowErrors: CsvIssue[] = [];
    const sku = get(r, "sku");
    const name = get(r, "name");
    const unit = get(r, "unit");
    const priceRaw = get(r, "unit_price");

    if (!sku) rowErrors.push({ row: rowNo, column: "sku", message: "ไม่มีรหัสสินค้า / SKU is empty." });
    if (!name) rowErrors.push({ row: rowNo, column: "name", message: "ไม่มีชื่อสินค้า / Name is empty." });
    if (!unit) rowErrors.push({ row: rowNo, column: "unit", message: "ไม่มีหน่วยนับ / Unit is empty." });

    const price = parseBahtToSatang(priceRaw);
    if (!priceRaw) {
      rowErrors.push({ row: rowNo, column: "unit_price", message: "ไม่มีราคา / Price is empty." });
    } else if (price === null) {
      rowErrors.push({
        row: rowNo,
        column: "unit_price",
        message: `ราคา "${priceRaw}" ไม่ถูกต้อง ต้องเป็นตัวเลขไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง / Invalid price "${priceRaw}".`,
      });
    } else if (price === 0) {
      warnings.push({ row: rowNo, column: "unit_price", message: `ราคาเป็น 0 / Price is 0 for ${sku}.` });
    }

    if (sku && seen.has(sku)) {
      rowErrors.push({
        row: rowNo,
        column: "sku",
        message: `รหัส ${sku} ซ้ำกับแถว ${seen.get(sku)} / Duplicate SKU (first seen on row ${seen.get(sku)}).`,
      });
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      return;
    }
    seen.set(sku, rowNo);
    items.push({
      sku,
      name,
      nameEn: get(r, "name_en") || undefined,
      aliases: get(r, "aliases")
        .split("|")
        .map((a) => a.trim())
        .filter(Boolean),
      unit,
      unitPriceSatang: price!,
      category: get(r, "category") || undefined,
    });
  });

  if (items.length === 0 && errors.length === 0) {
    errors.push({ row: 0, message: "ไม่มีรายการสินค้า / The file has a header but no items." });
  }
  return { items, errors, warnings };
}
