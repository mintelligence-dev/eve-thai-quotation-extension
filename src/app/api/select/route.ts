import { z } from "zod";
import { heuristicSelector, SELECT_LIMITS } from "@/lib/quotation";
import { getEngine, modeSchema, OFFLINE_FALLBACK_WARNING, readJson } from "@/lib/server/ai";

const bodySchema = z.object({
  requests: z
    .array(
      z.object({
        line: z.object({
          text: z.string().max(500),
          itemQuery: z.string().max(500),
          quantity: z.number().positive().nullable(),
          unit: z.string().max(50).nullable(),
        }),
        // Shortlist only: identity and unit, no prices.
        candidates: z
          .array(
            z.object({
              sku: z.string().max(100),
              name: z.string().max(SELECT_LIMITS.nameLength),
              nameEn: z.string().max(SELECT_LIMITS.nameLength).optional(),
              aliases: z.array(z.string().max(SELECT_LIMITS.aliasLength)).max(SELECT_LIMITS.aliases).optional(),
              unit: z.string().max(50),
              score: z.number(),
            }),
          )
          .max(SELECT_LIMITS.candidates),
      }),
    )
    .max(SELECT_LIMITS.lines),
  mode: modeSchema,
});

/** Well above a full 60-line Thai request (~2 KB per line), far below what the field caps alone would allow. */
const MAX_BODY_BYTES = 200_000;

/** Shortlisted requests → selections. The browser keeps the catalog; only shortlists arrive here. */
export async function POST(req: Request) {
  const parsed = await readJson(req, bodySchema, MAX_BODY_BYTES);
  if ("response" in parsed) return parsed.response;

  const { requests } = parsed.data;
  const engine = getEngine(parsed.data.mode);
  try {
    const selections = await engine.selector.select(requests);
    return Response.json({ mode: engine.mode, model: engine.model, selections });
  } catch (err) {
    // Log the failure class only — never the inquiry or catalog content.
    console.error(`[api/select] AI call failed, using offline fallback:`, err instanceof Error ? `${err.name}: ${err.message}` : "unknown");
    const selections = await heuristicSelector.select(requests);
    return Response.json({ mode: "offline", model: null, selections, warning: OFFLINE_FALLBACK_WARNING });
  }
}
