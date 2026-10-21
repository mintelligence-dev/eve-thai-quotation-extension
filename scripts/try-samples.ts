// Prints the offline (heuristic) draft for every sample inquiry. Usage: npx tsx scripts/try-samples.ts
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { buildDraft, customerQuestions, parseCatalogCsv } from "../src/lib/quotation";

const dir = join(__dirname, "..", "public", "samples");
const catalogs = {
  construction: parseCatalogCsv(readFileSync(join(dir, "catalog-construction-th.csv"), "utf8")).items,
  office: parseCatalogCsv(readFileSync(join(dir, "catalog-office-en.csv"), "utf8")).items,
};

async function main() {
  for (const file of readdirSync(join(dir, "inquiries")).sort()) {
    const catalog = file.includes("office") ? catalogs.office : catalogs.construction;
    const inquiry = readFileSync(join(dir, "inquiries", file), "utf8");
    const draft = await buildDraft({ inquiry, catalog });
    console.log(`\n=== ${file}`);
    for (const l of draft.lines) {
      const top = l.candidates.slice(0, 3).map((c) => `${c.sku}:${c.score}`).join(" ");
      console.log(`  [${l.status}] "${l.request.itemQuery}" qty=${l.quantity} ${l.request.unit ?? ""} -> ${l.sku ?? "-"} | ${top} | ${l.issues.map((i) => i.kind).join(",")}`);
    }
    if (draft.ignored.length) console.log("  ignored:", draft.ignored);
    for (const q of customerQuestions(draft, catalog)) console.log("  ?", q);
  }
}
main();
