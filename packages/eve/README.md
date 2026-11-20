# @eve-thai-quotation-extension/eve

> Let an [eve](https://eve.dev) agent prepare quotations from a customer's message, in Thai or English, priced from your own catalog and issued only after a person approves.

```text
Customer        ขอราคาปูน 20 ถุง กับหลอด LED 18W 40 หลอด แล้วก็ทรายด้วยนะคะ
Agent           "ปูน" มี 2 รายการ … หลอด LED มี 2 แบบ … ทรายต้องการกี่คิวคะ
Customer        ปูนปอร์ตแลนด์ หลอดเดย์ไลท์ ทราย 2 คิว
Approver sees   Issue quotation for draft D1 to ร้านสมชายการช่าง, total 8,517.20 THB including VAT?
Customer gets   ใบเสนอราคา QT-20261120-125255 … รวมทั้งสิ้น 8,517.20 บาท
```

**Status: 0.1, on npm.** It was run end to end in a local eve 1.1.0 agent (see [What was tested](#what-was-tested)). It has not been deployed, and not tried on LINE, Slack or any channel other than eve's HTTP channel.

[ภาษาไทย](#ภาษาไทย)

## What it adds to an agent

| Tool (mounted as `quotation`) | What it does |
|---|---|
| `quotation__draft` | Reads the customer's message and matches it against the catalog. Says, line by line, what matched, what is ambiguous, what has no quantity and what is not in the catalog, with questions to send back. |
| `quotation__search` | Searches the catalog by name, Thai or English. Returns SKU, name and unit, no prices. |
| `quotation__revise` | Applies the customer's answers: choose an item, set a quantity, confirm a unit, remove or add a line. |
| `quotation__issue` | Prices the draft and returns the quotation text. **Every call waits for a person's approval.** |

It also adds instructions that tell the agent how to use them: never state a price that is not in a draft, never guess a quantity, ask instead.

## Safeguards

| Rule | How it is enforced |
|---|---|
| Prices only come from the catalog | No tool takes a price as input. `issue` looks every price up by SKU in the catalog at the moment it runs. |
| No invented products | `revise` rejects a SKU that is not in the catalog. |
| A person approves every quotation | `issue` is gated with eve's approval (`always()`); a denied call never runs. |
| What was approved is what is issued | The approval prompt shows the grand total. `issue` recomputes it and refuses if the draft or a price changed since. |
| The right person approves | `approval` has no default. Choose `requester` or a list of `approvers`; anyone may deny. |
| A quotation is issued once | An issued draft cannot be issued again or changed. |
| A broken price list is never used | A catalog with any import error is not loaded at all, and the tools say why. |

## Install

In an agent made with `eve init` (Node 24+, eve 1.1 or later):

```bash
npm install @eve-thai-quotation-extension/eve
```

```ts title="agent/extensions/quotation.ts"
import quotation from "@eve-thai-quotation-extension/eve";

export default quotation({
  catalog: { path: "data/catalog.csv" },
  approval: { by: "approvers", principals: ["slack:T012AB3CD:U045EF6GH"] },
  sellerName: "บริษัท ตัวอย่าง วัสดุภัณฑ์ จำกัด",
});
```

The file name is the tool prefix: `quotation.ts` gives `quotation__draft`. `eve add` installs the package and writes this file and a sample catalog for you:

```bash
eve add https://cdn.jsdelivr.net/npm/@eve-thai-quotation-extension/eve/r/quotation.json
```

### Settings

| Setting | Default | |
|---|---|---|
| `catalog` | required | `{ path }` a CSV file in the project, `{ url }` a CSV to fetch, or `{ csv }` the text itself |
| `approval` | required | `{ by: "requester" }` or `{ by: "approvers", principals: [...] }` |
| `vatRateBps` | `700` | VAT in basis points; 700 is 7% |
| `pricesIncludeVat` | `false` | `true` when catalog prices already include VAT |
| `validDays` | `30` | How long the quoted prices stay valid |
| `refreshSeconds` | `300` | How long a catalog fetched from `url` is kept |
| `sellerName` | `""` | Shown at the top of the quotation |
| `sharing` | off | Keep drafts outside the conversation and give each one a link. See [Edit a draft on a web page](#edit-a-draft-on-a-web-page) |

The catalog format is the same as the web app's: `sku, name, unit, unit_price` are required, `name_en, aliases, category` are optional, and `aliases` are separated by `|`. Good aliases are the biggest accuracy lever.

### Who approves

- **`{ by: "requester" }`**: the person talking to the agent approves. Use it only for an agent your own staff talk to. On a customer-facing channel the requester is the customer, who would be approving their own quotation.
- **`{ by: "approvers", principals: [...] }`**: only these people can approve. The ID is the `principalId` your channel gives the person who answers (for Slack, `slack:<team>:<user>`). How an approval request reaches those people depends on the channel; see eve's channel docs.

## Edit a draft on a web page

By default a draft lives in the conversation. With `sharing`, each draft is also kept in a folder and gets a link, so a person can open the same draft in a table, change it, and approve it there. The agent hands out the link and reads the draft again before it issues.

```ts
quotation({
  // ...
  sharing: {
    storage: { dir: ".data/drafts" },      // a folder of JSON files
    baseUrl: "https://quotes.example.com", // a draft's link is <baseUrl>/q/<token>
    expiresDays: 30,
  },
});
```

The page is yours to build. The `desk` export gives it the same rules the tools use, with no model involved:

```ts
import { openDesk } from "@eve-thai-quotation-extension/eve/desk";

const desk = openDesk({ catalog, storage: { dir: ".data/drafts" }, sellerName: "..." });

await desk.read(token);                                   // the draft, as the tools show it
await desk.revise(token, { changes: [{ lineId, sku }] }); // same changes as the revise tool
await desk.search(token, "ท่อ pvc");                      // the draft's own catalog
await desk.setDetails(token, { customerName, notes });
await desk.issue(token, { grandTotal });                  // refuses if the total changed
```

Read this before you use it:

- **The link is the key.** Anyone who holds a draft's link can read it, and anyone who can reach your page's `issue` call can issue it. Calling `desk.issue` is the approval; the `approval` setting only covers the agent's `issue` tool. Put your own sign-in in front of the page when the link may travel beyond the people allowed to approve.
- **`dir` storage is one machine.** It suits local use and a server with a disk. On serverless hosting the folder is not shared between requests; a storage option for that does not exist yet.
- **Last write wins.** Two people changing the same draft at the same moment can overwrite each other.
- **Uploaded catalogs are off by default.** With `allowUploadedCatalogs: true` (in `sharing` and in `openDesk`), `desk.uploadCatalog(csv)` keeps a price list and returns a `catalogId`; `desk.create({ inquiry, catalogId })` or the `draft` tool's `catalogId` then prices a draft from it instead of your `catalog`. Whoever can upload then chooses the prices, so turn it on only for a demo or a page that only trusted staff reach.
- Tokens are 128 random bits. A draft stops opening `expiresDays` after it was made.

## What was tested

In a local `eve dev` agent on eve 1.1.0 with `anthropic/claude-haiku-5.5`, over eve's HTTP channel:

- An ambiguous Thai inquiry: the agent called `draft`, asked the customer the four open questions, then after the answers called `revise` and `issue`; the run paused with the approval prompt, and after approval returned the quotation (8,517.20 THB, matching the web app's arithmetic).
- Denying the approval: `issue` did not run, and the agent told the customer the quotation was not approved.
- `approvers` with a principal that did not match: the approval was refused and stayed open.

The rules behind the tools have unit tests (`packages/eve/test`).

Shared drafts and the `desk` export (0.2.0) were run locally with a Next.js page beside the agent: paste a message, change lines in a table, approve, see the printable quotation; and the same with an uploaded catalog. Issuing from chat after a change on the page was not tried, and neither was any of this on a deployed agent.

`eve add` was run against the published 0.1.0 packages in a fresh `eve init` agent: it installed the package, wrote the two files, and the agent drafted and, after approval, issued a quotation.

**Not tested:** a deployed agent, any channel besides eve's HTTP channel, a `{ path }` catalog on a deployed agent (the file may not be part of the deployment; use `{ url }` or `{ csv }` there until that is checked), and eve versions other than 1.1.0.

## Known limits

- Drafts live in the session. They are gone when the conversation ends, and one conversation keeps at most 20.
- The quotation is text. There is no PDF; the web app in this repository prints one.
- No unit conversion, discounts or tiered prices, the same as the core module.
- The built-in reading of a message is rule-based. The agent's own model reads messy messages better, which is why `draft` also accepts the lines as the model understood them.

## ภาษาไทย

ชุดเสริมสำหรับ agent ที่สร้างด้วย [eve](https://eve.dev) ให้ agent ร่างใบเสนอราคาจากข้อความลูกค้าได้ทั้งภาษาไทยและอังกฤษ ราคามาจากแคตตาล็อกของบริษัทเท่านั้น และต้องมีคนอนุมัติก่อนออกทุกครั้ง

- **สถานะ:** เวอร์ชัน 0.1 ยังไม่ได้เผยแพร่บน npm ทดสอบครบ flow กับ agent ในเครื่องบน eve 1.1.0 แล้ว แต่ยังไม่ได้ deploy และยังไม่ได้ลองกับ LINE หรือ Slack
- **เครื่องมือที่ได้:** `draft` (ร่างจากข้อความ) · `search` (ค้นแคตตาล็อก) · `revise` (แก้ตามคำตอบลูกค้า) · `issue` (ออกใบเสนอราคา ต้องอนุมัติก่อน)
- **ติดตั้ง:** `npm install @eve-thai-quotation-extension/eve` แล้วสร้างไฟล์ `agent/extensions/quotation.ts` ตามตัวอย่างด้านบน
- **ต้องเลือกผู้อนุมัติเอง:** ถ้าลูกค้าเป็นคนคุยกับ agent ให้ใช้ `approvers` และระบุรายชื่อพนักงาน อย่าใช้ `requester` เพราะจะเท่ากับให้ลูกค้าอนุมัติใบเสนอราคาของตัวเอง

## License

[MIT](../../LICENSE) © M Intelligence
