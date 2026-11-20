import { parseCatalogCsv, type CatalogItem } from "@eve-thai-quotation-extension/core";

export type CatalogSource = { csv: string } | { url: string } | { path: string };

interface Loaded {
  items: CatalogItem[];
  at: number;
}

const cache = new Map<string, Loaded>();

async function readSource(source: CatalogSource, signal?: AbortSignal): Promise<string> {
  if ("csv" in source) return source.csv;
  if ("url" in source) {
    const res = await fetch(source.url, { signal });
    if (!res.ok) throw new Error(`Could not fetch the catalog (${res.status}) from ${source.url}`);
    return res.text();
  }
  const { readFile } = await import("node:fs/promises");
  return readFile(source.path, "utf8");
}

/**
 * The catalog, parsed and validated. A catalog with errors is never used: a quotation priced
 * from a half-read price list is worse than no quotation.
 */
export async function loadCatalog(
  source: CatalogSource,
  options: { refreshSeconds: number; signal?: AbortSignal; now?: number } = { refreshSeconds: 300 },
): Promise<CatalogItem[]> {
  const key = JSON.stringify(source);
  const now = options.now ?? Date.now();
  const hit = cache.get(key);
  // Inline CSV and files are fixed for the life of the process; a URL is re-read when it is stale.
  if (hit && (!("url" in source) || now - hit.at < options.refreshSeconds * 1000)) return hit.items;

  const result = parseCatalogCsv(await readSource(source, options.signal));
  if (result.errors.length > 0) {
    const first = result.errors
      .slice(0, 5)
      .map((e) => (e.row > 0 ? `row ${e.row}${e.column ? ` (${e.column})` : ""}: ${e.message}` : e.message))
      .join("; ");
    throw new Error(`The catalog has ${result.errors.length} error(s) and was not loaded. ${first}`);
  }
  if (result.items.length === 0) throw new Error("The catalog has no items.");
  cache.set(key, { items: result.items, at: now });
  return result.items;
}

/** For tests. */
export function clearCatalogCache() {
  cache.clear();
}
