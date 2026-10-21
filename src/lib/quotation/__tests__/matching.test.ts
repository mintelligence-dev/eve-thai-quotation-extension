import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { createLlmExtractor, createLlmSelector } from "../llm";
import {
  assembleDraft,
  buildDraft,
  customerQuestions,
  extractRequestedLinesHeuristic,
  findCandidates,
  shortlist,
} from "../index";
import { sampleCatalog, sampleInquiry } from "./fixtures";

const construction = sampleCatalog("construction-th");
const office = sampleCatalog("office-en");

const lineFor = (draft: Awaited<ReturnType<typeof buildDraft>>, sku: string) =>
  draft.lines.find((l) => l.sku === sku);

describe("Thai aliases", () => {
  it("maps trade slang to the right SKU: ท่อฟ้า 4 หุน is the 1/2 inch blue PVC pipe", () => {
    expect(findCandidates("ท่อฟ้า 4 หุน", construction)[0].sku).toBe("PVC-050-85");
    expect(findCandidates("ท่อฟ้า 6 หุน", construction)[0].sku).toBe("PVC-075-85");
  });

  it("does not confuse sizes that differ only by number", () => {
    const [top, second] = findCandidates("ข้องอ 4 หุน", construction);
    expect(top.sku).toBe("ELB-050");
    expect(top.score - second.score).toBeGreaterThan(0.3);
  });

  it("matches regardless of spacing and Thai digits", () => {
    expect(findCandidates("ปลั๊ก กราวด์ คู่", construction)[0].sku).toBe("SOC-2G-E");
    const [line] = extractRequestedLinesHeuristic("สามทาง ๔ หุน ๒๐ ตัว");
    expect(line).toMatchObject({ itemQuery: "สามทาง 4 หุน", quantity: 20, unit: "ตัว" });
  });

  it("handles a full Thai LINE-style inquiry end to end", async () => {
    const draft = await buildDraft({ inquiry: sampleInquiry("01-thai-line-chat.txt"), catalog: construction });
    expect(draft.lines.map((l) => [l.sku, l.quantity])).toEqual([
      ["PVC-050-85", 50],
      ["ELB-050", 30],
      ["TEE-050", 20],
      ["GLU-100", 3],
    ]);
    expect(draft.lines.every((l) => l.status === "matched")).toBe(true);
    expect(draft.ignored).toContain("ส่งหน้างานบางนาได้ไหมครับ");
  });

  it("handles mixed Thai/English requests and English aliases", async () => {
    const draft = await buildDraft({ inquiry: sampleInquiry("02-mixed-electrical.txt"), catalog: construction });
    expect(lineFor(draft, "MCB-1P20")?.quantity).toBe(6); // "breaker 20A"
    expect(lineFor(draft, "MCB-1P32")?.quantity).toBe(2); // "ลูกย่อย 32A"
    expect(lineFor(draft, "VAF-2X25")?.quantity).toBe(3);
    expect(lineFor(draft, "SW-1WAY")?.quantity).toBe(8); // split from "... และ สวิตช์ทางเดียว 8 ตัว"
    expect(draft.lines).toHaveLength(6);
  });

  it("matches an English-only inquiry against a catalog with Thai names", async () => {
    const draft = await buildDraft({ inquiry: sampleInquiry("04-english-office.txt"), catalog: office });
    expect(draft.lines.map((l) => l.sku)).toEqual(["PAP-A4-80", "PEN-BP-BL", "STP-10", "STP-10-REF", "FILE-LA-3"]);
    expect(lineFor(draft, "FILE-LA-3")?.quantity).toBe(30);
  });
});

describe("ambiguous matches", () => {
  it("does not guess between equally good items and asks which one", async () => {
    const draft = await buildDraft({ inquiry: "ขอราคาปูน 20 ถุง", catalog: construction });
    const [line] = draft.lines;
    expect(line.status).toBe("ambiguous");
    expect(line.sku).toBeNull();
    expect(line.candidates.slice(0, 2).map((c) => c.sku).sort()).toEqual(["CEM-PC-50", "MOR-PL-50"]);
    const [question] = customerQuestions(draft, construction);
    expect(question).toContain("ปูนซีเมนต์ปอร์ตแลนด์");
    expect(question).toContain("ปูนฉาบสำเร็จรูป");
  });

  it("only offers close alternatives in the question", async () => {
    const draft = await buildDraft({ inquiry: "หลอด LED 18W 40 หลอด", catalog: construction });
    const [question] = customerQuestions(draft, construction);
    expect(question).toContain("เดย์ไลท์");
    expect(question).toContain("วอร์มไวท์");
    expect(question).not.toContain("E27");
  });

  it("reports items the catalog does not carry instead of substituting a similar one", async () => {
    const draft = await buildDraft({ inquiry: "ท่อทองแดง 1/2 นิ้ว 10 เส้น", catalog: construction });
    expect(draft.lines[0].status).toBe("not_found");
    expect(draft.lines[0].sku).toBeNull();
  });

  it("rejects a model answer whose SKU is not on that line's shortlist", () => {
    const requests = shortlist(extractRequestedLinesHeuristic("ท่อฟ้า 4 หุน 10 เส้น"), construction);
    const draft = assembleDraft(requests, [{ status: "matched", sku: "MADE-UP-999", question: null }], construction);
    expect(draft.lines[0]).toMatchObject({ status: "ambiguous", sku: null });
    expect(draft.lines[0].issues).toContainEqual({ kind: "rejected_sku", sku: "MADE-UP-999" });
  });

  it("rejects a real catalog SKU that was not shortlisted for that line", () => {
    const requests = shortlist(extractRequestedLinesHeuristic("ท่อฟ้า 4 หุน 10 เส้น"), construction);
    const draft = assembleDraft(requests, [{ status: "matched", sku: "DLV-BKK", question: null }], construction);
    expect(draft.lines[0].sku).toBeNull();
  });
});

describe("missing information", () => {
  it("flags a requested item with no quantity", async () => {
    const draft = await buildDraft({ inquiry: "แล้วก็ทรายด้วยนะคะ", catalog: construction });
    expect(draft.lines[0]).toMatchObject({ sku: "SAND-CRS", quantity: null });
    expect(draft.lines[0].issues).toContainEqual({ kind: "missing_quantity" });
    expect(customerQuestions(draft, construction)).toContain('"ทราย" ต้องการจำนวนเท่าไร?');
  });

  it("flags a unit that differs from how the catalog sells the item", async () => {
    const draft = await buildDraft({ inquiry: "สีทาบ้านขาว 4 แกลลอน", catalog: construction });
    expect(draft.lines[0].issues).toContainEqual({ kind: "unit_mismatch", requested: "แกลลอน", catalog: "ถัง" });
  });

  it("treats unit synonyms as the same unit", async () => {
    const draft = await buildDraft({ inquiry: "Stapler 10 pcs", catalog: office });
    expect(draft.lines[0].issues).toEqual([]);
  });

  it("keeps a spec with a unit (50 กก.) separate from the quantity (10 ถุง)", () => {
    const lines = extractRequestedLinesHeuristic("ปูนซีเมนต์ 50 กก. 10 ถุง");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ quantity: 10, unit: "ถุง", itemQuery: "ปูนซีเมนต์ 50 กก." });
  });

  it("drops a greeting that shares a line with the request", () => {
    const [line] = extractRequestedLinesHeuristic("สวัสดีครับ ขอราคาท่อฟ้า 4 หุน 50 เส้น");
    expect(line.itemQuery).toBe("ท่อฟ้า 4 หุน");
  });

  it("does not turn greetings and sign-offs into products", async () => {
    const draft = await buildDraft({ inquiry: sampleInquiry("04-english-office.txt"), catalog: office });
    expect(draft.ignored).toEqual(
      expect.arrayContaining(["Please quote the following for our new branch office:", "Procurement"]),
    );
  });
});

/** Minimal V4 mock that answers with fixed JSON and records the prompt it was sent. */
function mockModel(json: unknown) {
  const prompts: unknown[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      prompts.push(options.prompt);
      return {
        content: [{ type: "text", text: JSON.stringify(json) }],
        finishReason: { unified: "stop", raw: undefined },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 10, text: 10, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });
  return { model, prompts };
}

describe("model-backed extractor and selector (mocked)", () => {
  it("parses the model's structured extraction", async () => {
    const { model } = mockModel({
      lines: [{ text: "ท่อฟ้า 4 หุน 50 เส้น", itemQuery: "ท่อฟ้า 4 หุน", quantity: 50, unit: "เส้น" }],
    });
    const lines = await createLlmExtractor(model).extract("ท่อฟ้า 4 หุน 50 เส้น");
    expect(lines).toEqual([{ text: "ท่อฟ้า 4 หุน 50 เส้น", itemQuery: "ท่อฟ้า 4 หุน", quantity: 50, unit: "เส้น" }]);
  });

  it("never sends prices or the full catalog to the model", async () => {
    const { model, prompts } = mockModel({ decisions: [{ index: 0, status: "matched", sku: "PVC-050-85", question: null }] });
    const requests = shortlist(extractRequestedLinesHeuristic("ท่อฟ้า 4 หุน 50 เส้น"), construction, 3);
    await createLlmSelector(model).select(requests);
    const sent = JSON.stringify(prompts);
    expect(sent).toContain("PVC-050-85");
    expect(sent).not.toMatch(/62\.00|6200|unitPrice|ราคา/);
    expect(sent).not.toContain("DLV-BKK"); // not on the shortlist
  });

  it("downgrades a hallucinated SKU from the model to ambiguous", async () => {
    const { model } = mockModel({ decisions: [{ index: 0, status: "matched", sku: "PVC-999-XX", question: null }] });
    const draft = await buildDraft({
      inquiry: "ท่อฟ้า 4 หุน 50 เส้น",
      catalog: construction,
      selector: createLlmSelector(model),
    });
    expect(draft.lines[0]).toMatchObject({ status: "ambiguous", sku: null });
  });
});
