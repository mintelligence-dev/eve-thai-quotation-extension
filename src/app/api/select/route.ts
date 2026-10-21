import { z } from "zod";
import { heuristicSelector } from "@/lib/quotation";
import { getEngine, OFFLINE_FALLBACK_WARNING, readJson } from "@/lib/server/ai";

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
              name: z.string().max(300),
              nameEn: z.string().max(300).optional(),
              aliases: z.array(z.string().max(200)).max(30).optional(),
              unit: z.string().max(50),
              score: z.number(),
            }),
          )
          .max(10),
      }),
    )
    .max(100),
});

/** Shortlisted requests → selections. The browser keeps the catalog; only shortlists arrive here. */
export async function POST(req: Request) {
  const parsed = await readJson(req, bodySchema);
  if ("response" in parsed) return parsed.response;

  const { requests } = parsed.data;
  const engine = getEngine();
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
