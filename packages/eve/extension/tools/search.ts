import { defineTool } from "eve/tools";
import { z } from "zod";

import { searchCatalog } from "../lib/service";
import { catalogFor, loadDrafts } from "../lib/session";

export default defineTool({
  description:
    "Search the company catalog by product name, Thai or English, including common trade names. Returns matching items with their SKU and unit, without prices. Use it when a draft line has no fitting candidate.",
  inputSchema: z.object({
    query: z.string().min(1).max(200),
    draftId: z.string().min(1).optional().describe("The draft you are searching for, so the search uses that draft's catalog."),
  }),
  async execute({ query, draftId }, ctx) {
    const stored = draftId ? (await loadDrafts(draftId)).drafts[draftId] : undefined;
    const items = searchCatalog(query, await catalogFor(stored, ctx.abortSignal));
    return { items, note: items.length === 0 ? "Nothing in the catalog matches. Do not offer this product." : undefined };
  },
});
