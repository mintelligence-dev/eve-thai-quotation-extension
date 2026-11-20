import { adminState } from "@/lib/admin";
import { desk } from "@/lib/desk";

export const dynamic = "force-dynamic";

/** The shop's catalog as a CSV file, to edit in a spreadsheet and upload again. */
export async function GET() {
  if ((await adminState()) !== "admin") return new Response("Not allowed", { status: 403 });
  // BOM so Excel opens Thai text as UTF-8.
  return new Response("﻿" + (await desk.shopCatalogCsv()), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="catalog.csv"',
      "cache-control": "no-store",
    },
  });
}
