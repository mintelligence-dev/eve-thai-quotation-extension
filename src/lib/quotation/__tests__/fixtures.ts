import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCatalogCsv } from "../csv";
import type { CatalogItem } from "../types";

const SAMPLES = join(__dirname, "..", "..", "..", "..", "public", "samples");

export function sampleCatalog(name: "construction-th" | "office-en"): CatalogItem[] {
  const result = parseCatalogCsv(readFileSync(join(SAMPLES, `catalog-${name}.csv`), "utf8"));
  if (result.errors.length) throw new Error(JSON.stringify(result.errors));
  return result.items;
}

export function sampleInquiry(file: string): string {
  return readFileSync(join(SAMPLES, "inquiries", file), "utf8");
}
