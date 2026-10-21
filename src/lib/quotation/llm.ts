import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { compact } from "./text";
import type { LineExtractor, MatchSelector } from "./pipeline";
import type { MatchRequest, RequestedLine, Selection } from "./types";

const extractionSchema = z.object({
  lines: z.array(
    z.object({
      text: z.string().describe("The exact fragment of the inquiry this line came from."),
      itemQuery: z
        .string()
        .describe("Product description only: name, brand, size, spec. No quantity, unit or polite words."),
      quantity: z.number().positive().nullable().describe("Requested quantity, or null if not stated."),
      unit: z.string().nullable().describe("Unit word as the customer wrote it (e.g. เส้น, ตัว, box), or null."),
    }),
  ),
});

const EXTRACT_SYSTEM = `You read customer purchase inquiries written in Thai, English or a mix of both.
List every product or service the customer asks for, one entry per distinct item.
Rules:
- Ignore greetings, signatures, delivery notes and other text that is not a product request.
- Never invent items, quantities or units. If the quantity is not stated, use null.
- Convert Thai digits (๐-๙) to Arabic digits.
- Keep Thai trade terms as written (e.g. "4 หุน" is a pipe size, not a quantity).
- Do not translate itemQuery; keep the customer's wording minus quantity, unit and polite words.`;

/** LLM-backed extractor. `model` is a Gateway model id string (e.g. "anthropic/claude-haiku-5.5") or a provider model. */
export function createLlmExtractor(model: LanguageModel): LineExtractor {
  return {
    async extract(inquiry: string): Promise<RequestedLine[]> {
      const { output } = await generateText({
        model,
        system: EXTRACT_SYSTEM,
        prompt: inquiry,
        temperature: 0,
        output: Output.object({ schema: extractionSchema, name: "requested_lines" }),
      });
      return output.lines
        .map((l) => ({ ...l, itemQuery: l.itemQuery.trim() }))
        .filter((l) => l.itemQuery.length > 0);
    },
  };
}

const selectionSchema = z.object({
  decisions: z.array(
    z.object({
      ref: z.string().describe('The request label exactly as given, e.g. "L3".'),
      request: z.string().describe("The request text exactly as given, copied verbatim."),
      status: z.enum(["matched", "ambiguous", "not_found"]),
      sku: z.string().nullable().describe("A SKU copied exactly from this request's candidates when matched, else null."),
      question: z
        .string()
        .nullable()
        .describe("When ambiguous or not_found: one short question to ask the customer, in the inquiry's language."),
    }),
  ),
});

const SELECT_SYSTEM = `You match customer requests to items from a company catalog.
For each request (labelled L1, L2, …) you are given a shortlist of candidate catalog items (SKU, name, aliases, unit).
Return exactly one decision per request, echoing its label and request text.
Rules:
- "matched": exactly one candidate clearly is what the customer asked for. Return its SKU copied exactly.
  Aliases are names the company itself uses for that item; a request that equals a name or alias is a match.
  A different unit (e.g. gallon vs pail) is NOT a reason to reject: match the item, a person confirms units later.
- "ambiguous": more than one candidate could fit (e.g. size, brand or model not specified). Ask which one.
- "not_found": no candidate fits. Ask for the detail you would need.
- Only ever return SKUs from that request's own candidate list. Never invent a SKU.
- Sizes and specs must agree (4 หุน = 1/2 นิ้ว, 6 หุน = 3/4 นิ้ว, 1 นิ้ว = 8 หุน). A different size is not a match.
- You do not know prices and must not mention them.`;

function describeRequests(requests: MatchRequest[]): string {
  return requests
    .map(({ line, candidates }, i) => {
      const list = candidates.length
        ? candidates
            .map(
              (c) =>
                `   - ${c.sku} | ${c.name}${c.nameEn ? ` (${c.nameEn})` : ""}${
                  c.aliases?.length ? ` | aliases: ${c.aliases.join(", ")}` : ""
                } | unit: ${c.unit}`,
            )
            .join("\n")
        : "   (no candidates)";
      const qty = line.quantity === null ? "not stated" : `${line.quantity} ${line.unit ?? ""}`.trim();
      return `L${i + 1} request: "${line.itemQuery}" (original: "${line.text}", quantity: ${qty})\n   candidates:\n${list}`;
    })
    .join("\n\n");
}

/** LLM-backed selector. It sees the shortlist names and units, never the prices or the full catalog. */
export function createLlmSelector(model: LanguageModel): MatchSelector {
  return {
    async select(requests: MatchRequest[]): Promise<Selection[]> {
      if (requests.length === 0) return [];
      const { output } = await generateText({
        model,
        system: SELECT_SYSTEM,
        prompt: describeRequests(requests),
        temperature: 0,
        output: Output.object({ schema: selectionSchema, name: "match_decisions" }),
      });
      // Models miscount positions, so a decision is tied to a request by its echoed text
      // first and its label second. A wrong pairing is still caught by assembleDraft(),
      // which rejects any SKU outside that line's shortlist.
      const byText = new Map(output.decisions.map((d) => [compact(d.request), d]));
      const byRef = new Map(output.decisions.map((d) => [d.ref.trim().toUpperCase(), d]));
      return requests.map(({ line }, i) => {
        const d = byText.get(compact(line.itemQuery)) ?? byRef.get(`L${i + 1}`);
        if (!d) return { status: "not_found", sku: null, question: null };
        return { status: d.status, sku: d.status === "matched" ? d.sku : null, question: d.question };
      });
    },
  };
}
