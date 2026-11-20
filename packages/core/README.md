# @eve-thai-quotation-extension/core

The quotation rules behind [Thai Quotation Copilot](https://github.com/mintelligence-dev/eve-thai-quotation-extension): catalog import, Thai and English item matching, review rules and pricing in integer satang. Plain TypeScript with no runtime dependencies; the model-backed extractor and selector are in the `./llm` entry and need `ai` and `zod`.

Used by the web app in this repository and by [`@eve-thai-quotation-extension/eve`](../eve). Published on npm: `npm install @eve-thai-quotation-extension/core`.

```ts
import { buildDraft, canApprove, parseCatalogCsv, priceQuotation } from "@eve-thai-quotation-extension/core";

const { items: catalog, errors } = parseCatalogCsv(csvText);
const draft = await buildDraft({ inquiry: "ขอราคาท่อฟ้า 4 หุน 50 เส้น กับ breaker 20A 6 ตัว", catalog });
// …a person reviews: chooseItem() / setQuantity() / acknowledgeUnit()…
if (canApprove(draft, catalog).ok) {
  const quote = priceQuotation(draft, catalog, { vatRateBps: 700, pricesIncludeVat: false });
}
```

Money is always an integer number of satang; VAT is rounded half up on the total. See the main README for the rules.

## License

[MIT](../../LICENSE) © M Intelligence
