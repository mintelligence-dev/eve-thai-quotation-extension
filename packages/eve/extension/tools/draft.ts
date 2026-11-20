import { defineTool } from "eve/tools";
import { z } from "zod";

import { createDraft } from "../lib/service";
import { catalog, loadDrafts, saveDrafts, uploadedCatalog, view } from "../lib/session";

export default defineTool({
  description:
    "Start a quotation draft from a customer's message. Matches what they asked for against the company catalog and reports, line by line, what matched, what is ambiguous, what is missing a quantity and what is not in the catalog, with questions to ask the customer. Prices come from the catalog; never state a price that is not in a draft.",
  inputSchema: z.object({
    inquiry: z.string().min(1).max(8000).describe("The customer's message, exactly as they wrote it."),
    lines: z
      .array(
        z.object({
          text: z.string().min(1).max(300).describe("The part of the message this line comes from."),
          itemQuery: z.string().min(1).max(200).describe("The product only, without quantity or unit."),
          quantity: z.number().positive().nullable().describe("null when the customer gave none. Never guess."),
          unit: z.string().max(40).nullable().describe("The unit the customer used, or null."),
        }),
      )
      .max(60)
      .optional()
      .describe("The requested items as you read them. Give this when the message is informal or mixes languages."),
    catalogId: z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .optional()
      .describe("Only when the request names an uploaded catalog id. Never invent one; leave out otherwise."),
  }),
  async execute(input, ctx) {
    const items = input.catalogId ? await uploadedCatalog(input.catalogId) : await catalog(ctx.abortSignal);
    const { store, draftId } = await createDraft(await loadDrafts(), input, items);
    const kept = { ...store, drafts: { ...store.drafts, [draftId]: { ...store.drafts[draftId], catalogId: input.catalogId } } };
    return view(await saveDrafts(kept, draftId), draftId, ctx.abortSignal);
  },
});
