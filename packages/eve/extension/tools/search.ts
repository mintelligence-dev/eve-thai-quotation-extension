import { defineTool } from "eve/tools";
import { z } from "zod";

import { searchCatalog } from "../lib/service";
import { catalog } from "../lib/session";

export default defineTool({
  description:
    "Search the company catalog by product name, Thai or English, including common trade names. Returns matching items with their SKU and unit, without prices. Use it when a draft line has no fitting candidate.",
  inputSchema: z.object({ query: z.string().min(1).max(200) }),
  async execute({ query }, ctx) {
    const items = searchCatalog(query, await catalog(ctx.abortSignal));
    return { items, note: items.length === 0 ? "Nothing in the catalog matches. Do not offer this product." : undefined };
  },
});
