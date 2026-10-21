import { z } from "zod";
import { heuristicExtractor } from "@/lib/quotation";
import { getEngine, OFFLINE_FALLBACK_WARNING, readJson } from "@/lib/server/ai";

const bodySchema = z.object({ inquiry: z.string().trim().min(1).max(8_000) });

/** Inquiry text → requested lines. Receives no catalog data. Nothing is stored or logged. */
export async function POST(req: Request) {
  const parsed = await readJson(req, bodySchema);
  if ("response" in parsed) return parsed.response;

  const engine = getEngine();
  try {
    const lines = await engine.extractor.extract(parsed.data.inquiry);
    return Response.json({ mode: engine.mode, model: engine.model, lines });
  } catch (err) {
    // Log the failure class only — never the inquiry or catalog content.
    console.error(`[api/extract] AI call failed, using offline fallback:`, err instanceof Error ? `${err.name}: ${err.message}` : "unknown");
    const lines = await heuristicExtractor.extract(parsed.data.inquiry);
    return Response.json({ mode: "offline", model: null, lines, warning: OFFLINE_FALLBACK_WARNING });
  }
}
