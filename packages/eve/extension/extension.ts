import { defineExtension } from "eve/extension";
import { z } from "zod";

const catalogSource = z.union([
  z.object({ csv: z.string().min(1).describe("The catalog CSV text itself.") }),
  z.object({ url: z.string().url().describe("Where to fetch the catalog CSV. Re-read every `refreshSeconds`.") }),
  z.object({ path: z.string().min(1).describe("A CSV file, relative to the agent's working directory.") }),
]);

const approval = z.union([
  /** The person talking to the agent approves. Only for agents your own staff talk to. */
  z.object({ by: z.literal("requester") }),
  /** Only these principals can approve; anyone can deny. For customer-facing agents. */
  z.object({ by: z.literal("approvers"), principals: z.array(z.string().min(1)).min(1) }),
]);

export default defineExtension({
  config: z.object({
    /** Columns: sku, name, unit, unit_price (required); name_en, aliases, category (optional). */
    catalog: catalogSource,
    /** Who may approve a quotation before it is issued. There is no default: choose one. */
    approval,
    /** VAT rate in basis points: 700 = 7%. */
    vatRateBps: z.number().int().min(0).max(10_000).default(700),
    /** true when catalog prices already include VAT. */
    pricesIncludeVat: z.boolean().default(false),
    /** How many days the quoted prices stay valid. */
    validDays: z.number().int().min(1).max(365).default(30),
    /** How long a catalog fetched from `url` is kept before it is read again. */
    refreshSeconds: z.number().int().min(0).max(86_400).default(300),
    /** Shown at the top of an issued quotation. */
    sellerName: z.string().default(""),
  }),
});
