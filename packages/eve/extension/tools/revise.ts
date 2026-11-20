import { defineTool } from "eve/tools";
import { z } from "zod";

import { reviseDraft } from "../lib/service";
import { catalog, loadDrafts, saveDrafts, view } from "../lib/session";

export default defineTool({
  description:
    "Change a quotation draft after the customer answered: choose the item for a line, set a quantity, confirm a unit, remove a line, or add an item. Returns the updated draft. Call it with only the draftId to read the draft as it is now. Only use SKUs from a line's candidates or from the search tool.",
  inputSchema: z.object({
    draftId: z.string().min(1),
    changes: z
      .array(
        z.object({
          lineId: z.string().min(1),
          sku: z.string().min(1).optional().describe("The catalog item the customer meant."),
          quantity: z.number().positive().optional(),
          confirmUnit: z
            .boolean()
            .optional()
            .describe("true once the customer confirmed the quantity in the unit the item is sold in."),
          remove: z.boolean().optional(),
        }),
      )
      .max(60)
      .optional(),
    add: z
      .array(z.object({ sku: z.string().min(1), quantity: z.number().positive() }))
      .max(20)
      .optional()
      .describe("Items the first message did not mention, such as delivery."),
  }),
  async execute({ draftId, changes, add }, ctx) {
    const items = await catalog(ctx.abortSignal);
    const store = reviseDraft(await loadDrafts(draftId), draftId, { changes, add }, items);
    return view(await saveDrafts(store, draftId), draftId, ctx.abortSignal);
  },
});
