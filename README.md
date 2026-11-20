# eve Thai Quotation Extension

Turn a customer's message, in Thai or English, into a quotation priced from your own catalog. A person approves before anything goes out.

[![CI](https://github.com/mintelligence-dev/eve-thai-quotation-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/mintelligence-dev/eve-thai-quotation-extension/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![core](https://img.shields.io/npm/v/@eve-thai-quotation-extension/core?label=core)](https://www.npmjs.com/package/@eve-thai-quotation-extension/core)
[![eve](https://img.shields.io/npm/v/@eve-thai-quotation-extension/eve?label=eve)](https://www.npmjs.com/package/@eve-thai-quotation-extension/eve)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

**English** · [ภาษาไทย](README.th.md)

[![A customer message turned into a quotation draft, with unclear lines flagged for review](docs/screenshot.png)](https://thai-quotation-copilot.vercel.app)

## What is in this repository

| | What it is | Where it runs | Try it |
|---|---|---|---|
| [`packages/eve`](packages/eve) | An extension for [eve](https://eve.dev) agents: tools to draft, search, revise and issue a quotation, with approval before issuing | Any channel your eve agent has: Telegram, Slack, web chat and others | `eve add` (see [Quick start](#quick-start)) |
| [`packages/core`](packages/core) | The rules on their own: catalog import, Thai and English matching, review checks, pricing. No framework, no runtime dependencies | Any TypeScript project | `npm install @eve-thai-quotation-extension/core` |
| [`examples/thai-quotation-agent`](examples/thai-quotation-agent) | A complete agent built with the extension: a web page and a Telegram bot working on the same drafts and the same catalog | Web and Telegram | [thai-quotation-agent.vercel.app](https://thai-quotation-agent.vercel.app) |
| Web demo (repository root) | The original single-page app. The catalog stays in the browser; it does not use eve | Web only | [thai-quotation-copilot.vercel.app](https://thai-quotation-copilot.vercel.app) |

All four price with the same code in `packages/core`.

## How it works

1. **A catalog** of products and prices, as CSV. The file is checked and every error is reported with its row and column.
2. **A customer's message**, from LINE, email or chat, in Thai, English or both.
3. **Matching.** Each requested item is matched to the catalog. Anything ambiguous ("cement" could be structural or plaster), missing a quantity, or in a different unit is flagged, with questions ready to send to the customer.
4. **Review.** A person changes items and quantities, adds or removes lines, and sets VAT.
5. **Approval.** Nothing is issued, printed or exported until a person approves.

## Safeguards

| Rule | How it is enforced |
|---|---|
| Prices only come from the catalog | The model's output has no price field. Prices are looked up by SKU in one place, `priceQuotation()`. |
| No invented products | The model may only answer with a SKU from that line's shortlist. Anything else is rejected and the line goes back to the reviewer. |
| A person approves | A draft can be approved only when every line has an item and a quantity and unit mismatches are confirmed. In the extension, issuing is a tool call that eve pauses for approval, and it is refused if the total changed after the approver saw it. |
| Sample data is made up | All catalogs, brands and messages under `public/samples/` are fictional. |

Each part says what it keeps and where: the web demo keeps the catalog in the browser, while the extension and the example agent keep drafts on the server. See each README before putting real prices in.

## Quick start

### Add quotations to an eve agent

Needs Node 24 or newer and an eve project (`npx eve@latest init my-agent`).

```bash
eve add https://cdn.jsdelivr.net/npm/@eve-thai-quotation-extension/eve/r/quotation.json
```

This installs the package and writes `agent/extensions/quotation.ts` and a sample `data/catalog.csv`. Put in your own catalog, choose who approves, and the agent can quote on every channel it has. Settings, approval rules and limits are in the [extension README](packages/eve).

To see it working with a web page and Telegram, start from the [example agent](examples/thai-quotation-agent).

### Use the rules in your own code

```bash
npm install @eve-thai-quotation-extension/core
```

```ts
import { buildDraft, canApprove, parseCatalogCsv, priceQuotation } from "@eve-thai-quotation-extension/core";

const { items: catalog, errors } = parseCatalogCsv(csvText);
const draft = await buildDraft({ inquiry: "ขอราคาท่อฟ้า 4 หุน 50 เส้น กับ breaker 20A 6 ตัว", catalog });
// …a person reviews: chooseItem() / setQuantity() / acknowledgeUnit()…
if (canApprove(draft, catalog).ok) {
  const quote = priceQuotation(draft, catalog, { vatRateBps: 700, pricesIncludeVat: false });
}
```

Without a model, `buildDraft` reads the message with built-in rules. To use a model, pass `createLlmExtractor` and `createLlmSelector` from `@eve-thai-quotation-extension/core/llm`.

### Run the web demo

```bash
npm install
cp .env.example .env.local   # optionally set AI_GATEWAY_API_KEY
npm run dev                  # http://localhost:3000
```

- **No key:** the demo runs in offline mode with rule-based matching (Thai word segmentation with `Intl.Segmenter`, fuzzy matching and aliases), at no cost.
- **With an [AI Gateway](https://vercel.com/docs/ai-gateway) key:** a model reads the message, which copes better with messy text. If a model call fails, the demo falls back to offline matching and says so.
- **On a linked Vercel project:** `vercel env pull .env.local` gives a short-lived `VERCEL_OIDC_TOKEN` instead of a key.

A switch at the top right chooses "AI" or "no AI" per draft. `QUOTATION_AI_MODE=offline` turns AI off for everyone, and `QUOTATION_MODEL` changes the model.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmintelligence-dev%2Feve-thai-quotation-extension&project-name=thai-quotation-copilot&repository-name=thai-quotation-copilot&env=AI_GATEWAY_API_KEY&envDescription=AI%20Gateway%20API%20key%3A%20Vercel%20dashboard%20%3E%20AI%20Gateway%20%3E%20API%20Keys%20%3E%20Create%20key&envLink=https%3A%2F%2Fvercel.com%2Fdocs%2Fai-gateway%2Fauthentication)

The button deploys the web demo only. The demo has no login, so anyone who can reach your copy can use its AI at your cost: set a spending limit on the key and a rate limit in front of `/api/extract` and `/api/select`. See [SECURITY.md](SECURITY.md).

## Catalog format

| Column | Required | Example |
|---|---|---|
| `sku` | yes | `PVC-050-85` |
| `name` | yes | `ท่อ PVC สีฟ้า 1/2 นิ้ว ชั้น 8.5` |
| `unit` | yes | `เส้น` |
| `unit_price` | yes | `62.00` or `"1,250.00"` (at most 2 decimals) |
| `name_en` | | `PVC pipe 1/2 inch` |
| `aliases` | | `ท่อฟ้า 4 หุน\|ท่อ pvc 4 หุน`, separated by `\|` |
| `category` | | `ท่อและข้อต่อ` |

- Thai headers are accepted, for example `รหัสสินค้า, ชื่อสินค้า, หน่วย, ราคา`.
- The file must be UTF-8. In Excel choose "CSV UTF-8". A Windows-874 file is refused with a message that says how to save it again.
- `aliases` are the biggest accuracy lever. Put in the words customers really use.

## Money rules

- All amounts are integer satang, so there is no floating-point drift.
- Line total = unit price × quantity, rounded half up to the satang. Quantities may have decimals.
- **VAT is computed once on the document total**, not per line, and rounded half up.
  - Prices exclude VAT: VAT = sum × rate.
  - Prices include VAT: VAT = sum × rate ÷ (1 + rate).
- The VAT rate is configurable (default 7%). The Thai amount in words comes from `bahtText`.

## Costs

**Hosting.** The web demo is one static page and two short API functions. The Hobby plan is enough to try it; commercial use needs Pro. See <https://vercel.com/pricing>.

**Model.** You pay per token through AI Gateway. The web demo makes two calls per message: one to read the lines and one to choose items. From the real prompt size of a 6-line sample (about 3,400 characters plus schemas) we estimate about 3,000 input and 800 output tokens per message. This was not measured from live calls, and Thai uses more tokens per character than English.

| Model | Input / output per 1M tokens* | About, per message |
|---|---|---|
| `anthropic/claude-haiku-5.5` (default) | $0.10 / $0.50 | $0.0007 |
| `google/gemini-3.5-flash-lite` | $0.30 / $2.50 | $0.003 |
| `anthropic/claude-sonnet-5.5` | $2.00 / $10.00 | $0.014 |

\* From `https://ai-gateway.vercel.sh/v1/models` on 2026-10-21. Prices change; see <https://vercel.com/ai-gateway/models>.

An eve agent uses more than this per message, because it takes several model turns to read, call tools and reply. We have not measured that.

## Known limits

- No unit conversion (box ↔ piece). A unit mismatch is flagged for a person to confirm.
- No discounts or tiered prices.
- Offline matching can misread a line where a spec with a unit comes before the quantity, such as "ปูน 50 กก. ตราเพชรา 10 ถุง". A model handles that better.
- The extension issues the quotation as text. A printable page exists in the web demo and the example agent; neither makes a PDF on the server.

What was and was not tested is listed in the [extension README](packages/eve#what-was-tested) and the [example's README](examples/thai-quotation-agent#what-was-tested).

## Repository layout

```
packages/core/                  the rules: CSV, matching, review, money (+ tests)
packages/eve/                   the eve extension: tools, instructions, desk API (+ tests)
examples/thai-quotation-agent/  an eve agent with a web page and a Telegram channel; a project of its own
src/                            the web demo (Next.js)
public/samples/                 fictional catalogs and messages
scripts/                        small scripts for trying samples and the demo's API
```

## Development

Needs Node 24 or newer.

| Command | |
|---|---|
| `npm install` | Install everything in the workspace |
| `npm run dev` | Run the web demo |
| `npm test` | Unit tests for the rules, the extension and the demo |
| `npm run typecheck` · `npm run lint` | Type and lint checks |
| `npm run build:eve` | Build the extension |
| `npx tsx scripts/try-samples.ts` | Show how each sample message matches, offline |

The example agent is outside the workspace: run its commands from inside its folder.

## Contributing

Issues and pull requests are welcome, in English or Thai. Read [CONTRIBUTING.md](CONTRIBUTING.md) first; it is short. Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

Found a security problem? Do not open a public issue. See [SECURITY.md](SECURITY.md).

Changes in each release are in [CHANGELOG.md](CHANGELOG.md).

## Credits

- [eve](https://eve.dev) by Vercel, the agent framework the extension is built for.
- [Mintel UI](https://mintel-ui.vercel.app), the theme and components of the web demo and the example, on [Radix UI](https://www.radix-ui.com) and [shadcn/ui](https://ui.shadcn.com).
- [Next.js](https://nextjs.org), [AI SDK](https://ai-sdk.dev), [Zod](https://zod.dev), [Tailwind CSS](https://tailwindcss.com) and [Vitest](https://vitest.dev).

## License

[MIT](LICENSE) © 2026 M Intelligence
