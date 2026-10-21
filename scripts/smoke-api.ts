// End-to-end check of the running app's API, the same way the browser calls it.
// Usage: BASE_URL=http://localhost:3000 npx tsx scripts/smoke-api.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assembleDraft, parseCatalogCsv, shortlist, type RequestedLine, type Selection } from "../src/lib/quotation";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const samples = join(__dirname, "..", "public", "samples");
const catalog = parseCatalogCsv(readFileSync(join(samples, "catalog-construction-th.csv"), "utf8")).items;
const inquiry = readFileSync(join(samples, "inquiries", "03-ambiguous-missing.txt"), "utf8");

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function main() {
  const ex = await post<{ mode: string; model: string | null; lines: RequestedLine[] }>("/api/extract", { inquiry });
  const requests = shortlist(ex.lines, catalog);
  const sel = await post<{ mode: string; selections: Selection[] }>("/api/select", { requests });
  const draft = assembleDraft(requests, sel.selections, catalog);
  console.log(`mode: extract=${ex.mode} select=${sel.mode} model=${ex.model}`);
  for (const l of draft.lines) console.log(`  [${l.status}] ${l.request.itemQuery} × ${l.quantity ?? "?"} → ${l.sku ?? "-"}`);
  const bodyBytes = JSON.stringify({ requests });
  if (/unitPriceSatang|"price"/.test(bodyBytes)) throw new Error("price leaked into /api/select payload");
  console.log("OK: /api/select payload has no prices");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
