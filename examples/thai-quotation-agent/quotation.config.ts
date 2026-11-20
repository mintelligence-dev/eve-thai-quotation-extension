/**
 * One place for the quotation settings. The agent's extension (agent/extensions/quotation.ts)
 * and the web page (apps/web) both read this, so they price from the same catalog and share
 * the same drafts.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

import { STARTER_CATALOG } from "./data/starter-catalog";

/** The project folder, wherever the process was started from (the web app runs in apps/web). */
function projectRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, "agent", "agent.ts"))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

const root = projectRoot();

export const quotationConfig = {
  // The starting price list. With managedCatalog on, the one stored later replaces it.
  catalog: { csv: STARTER_CATALOG },
  sellerName: "ร้านทดสอบ วัสดุก่อสร้าง",
  vatRateBps: 700,
  pricesIncludeVat: false,
  validDays: 30,
  sharing: {
    // On Vercel, drafts and catalogs go to a private Blob store; on one machine, to a folder.
    storage: process.env.BLOB_READ_WRITE_TOKEN
      ? ({ blob: { prefix: "quotation" } } as const)
      : ({ dir: join(root, ".data", "drafts") } as const),
    // Where people open drafts. Set QUOTATION_WEB_URL when the page is not on this machine.
    baseUrl:
      process.env.QUOTATION_WEB_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:4320"),
    expiresDays: 30,
    // The page lets a person upload a price list and quote from it. Whoever can open the page
    // then chooses the prices, so this suits a demo or a staff-only page, not a public one.
    allowUploadedCatalogs: true,
    // The shop's own price list can be replaced or edited after deployment: on the /catalog
    // page, or by an admin sending a CSV file or a /price command to the Telegram bot.
    managedCatalog: true,
  },
};
