import "server-only";
import { z } from "zod";
import {
  createLlmExtractor,
  createLlmSelector,
} from "@/lib/quotation/llm";
import { heuristicExtractor, heuristicSelector, type LineExtractor, type MatchSelector } from "@/lib/quotation";

/** Default Gateway model; override with QUOTATION_MODEL (any id from https://vercel.com/ai-gateway/models). */
export const DEFAULT_MODEL = "anthropic/claude-haiku-5.5";

export type EngineMode = "ai" | "offline";

export interface Engine {
  mode: EngineMode;
  model: string | null;
  extractor: LineExtractor;
  selector: MatchSelector;
}

/**
 * The AI path is used when an AI Gateway key is configured locally, or when running
 * on Vercel (where the Gateway authenticates with the deployment's OIDC token).
 * QUOTATION_AI_MODE=offline forces the rule-based matcher.
 */
export function getEngine(): Engine {
  const forcedOffline = process.env.QUOTATION_AI_MODE === "offline";
  const canAuth = Boolean(process.env.AI_GATEWAY_API_KEY) || process.env.VERCEL === "1";
  if (forcedOffline || !canAuth) {
    return { mode: "offline", model: null, extractor: heuristicExtractor, selector: heuristicSelector };
  }
  const model = process.env.QUOTATION_MODEL || DEFAULT_MODEL;
  return { mode: "ai", model, extractor: createLlmExtractor(model), selector: createLlmSelector(model) };
}

export const OFFLINE_FALLBACK_WARNING =
  "เรียกโมเดล AI ไม่สำเร็จ ระบบใช้การจับคู่แบบออฟไลน์แทน กรุณาตรวจผลอย่างละเอียด / AI call failed; offline matching was used instead.";

/** Parses a JSON body against a schema, returning a 400 response on failure. */
export async function readJson<T>(req: Request, schema: z.ZodType<T>): Promise<{ data: T } | { response: Response }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { response: Response.json({ error: "Invalid JSON body" }, { status: 400 }) };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { response: Response.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 }) };
  }
  return { data: parsed.data };
}
