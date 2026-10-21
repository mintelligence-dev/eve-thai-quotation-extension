# Thai Quotation Copilot

[ภาษาไทย](#ภาษาไทย) · [English](#english)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmuisurasak%2Fthai-quotation-copilot&project-name=thai-quotation-copilot&repository-name=thai-quotation-copilot)

> The repository is private for now, so the Deploy button only works for accounts with access until it is made public.

Open-source AI tool that turns Thai or English customer inquiries into quotation drafts using a company's **own** product and price catalog.

---

## ภาษาไทย

### ทำอะไรได้

1. **อัปโหลดแคตตาล็อก** สินค้าและราคาเป็นไฟล์ CSV ระบบตรวจไฟล์และบอกว่าผิดที่แถวไหน คอลัมน์ไหน
2. **แปะข้อความลูกค้า** จาก LINE อีเมล หรือแชต ได้ทั้งภาษาไทย ภาษาอังกฤษ และแบบปนกัน
3. **AI แนะนำรายการ** ที่ตรงกับแคตตาล็อก และชี้ว่ารายการไหน**กำกวม** (เช่น "ปูน" มีทั้งปูนโครงสร้างและปูนฉาบ) หรือ**ข้อมูลไม่ครบ** (ไม่ระบุจำนวน หรือหน่วยไม่ตรง) พร้อมคำถามที่คัดลอกไปถามลูกค้าได้ทันที
4. **ตรวจและแก้ไขร่าง** เปลี่ยนสินค้า แก้จำนวน เพิ่มหรือลบบรรทัด ตั้งอัตรา VAT และเลือกได้ว่าราคาในแคตตาล็อกรวม VAT แล้วหรือยัง
5. **อนุมัติก่อนส่งออก** ต้องมีคนยืนยันก่อนจึงจะพิมพ์ บันทึกเป็น PDF หรือดาวน์โหลด CSV ได้ ระบบไม่ส่งเอกสารถึงลูกค้าเอง

### หลักความปลอดภัย

| กฎ | บังคับใช้อย่างไร |
|---|---|
| ราคามาจากแคตตาล็อกเท่านั้น | schema ของ AI ไม่มีช่องราคา ราคาถูกดึงจากแคตตาล็อกตามรหัสสินค้าในขั้น `priceQuotation()` เพียงจุดเดียว |
| ไม่สร้างสินค้าขึ้นเอง | AI เลือกได้แค่รหัสที่อยู่ใน shortlist ของบรรทัดนั้น ถ้าตอบรหัสอื่นมา ระบบปฏิเสธและให้คนเลือกเอง (`assembleDraft()`) |
| คนต้องอนุมัติก่อนส่งออก | `canApprove()` ต้องผ่านก่อน (ทุกบรรทัดมีสินค้าและจำนวน และยืนยันหน่วยที่ไม่ตรงแล้ว) จากนั้นต้องติ๊กยืนยันและกดอนุมัติ ถ้าแก้อะไรหลังอนุมัติ ระบบยกเลิกการอนุมัติทันที |
| แคตตาล็อกเป็นความลับ | ไฟล์อยู่ในเบราว์เซอร์เท่านั้น เซิร์ฟเวอร์ได้รับแค่ข้อความลูกค้า กับชื่อและหน่วยของสินค้าใน shortlist ไม่มีราคา และไม่มีการบันทึกหรือ log |
| ข้อมูลตัวอย่างเป็นของสมมติ | แคตตาล็อก ยี่ห้อ และข้อความลูกค้าใน `public/samples/` แต่งขึ้นทั้งหมด |

### เริ่มใช้งาน

```bash
npm install
cp .env.example .env.local   # ใส่ AI_GATEWAY_API_KEY (ไม่ใส่ก็ได้)
npm run dev                  # http://localhost:3000
```

- **ไม่มีคีย์:** ระบบทำงานแบบ**ออฟไลน์** จับคู่ด้วยกฎ (ตัดคำไทยด้วย `Intl.Segmenter`, fuzzy match, ชื่อเรียกอื่น) ใช้เดโมได้ทันทีโดยไม่มีค่าใช้จ่าย
- **มีคีย์ AI Gateway:** ระบบใช้ AI แยกรายการและเลือกสินค้า ซึ่งแม่นกว่าเมื่อลูกค้าพิมพ์ไม่เป็นรูปแบบ
- **โปรเจกต์ที่ link กับ Vercel แล้ว:** รัน `vercel env pull .env.local` เพื่อดึง `VERCEL_OIDC_TOKEN` มาใช้ได้เลย ไม่ต้องสร้างคีย์ (token มีอายุจำกัด ถ้าหมดอายุให้ pull ใหม่)
- **Deploy บน Vercel:** ไม่ต้องตั้งคีย์ เพราะ AI Gateway ยืนยันตัวตนด้วย OIDC ของ deployment ให้เอง (ต้องเปิดใช้ AI Gateway ในทีมก่อน)

ถ้าเรียกโมเดลไม่สำเร็จ ระบบจะใช้โหมดออฟไลน์แทนและแสดงคำเตือนบนหน้าจอ

**ปุ่มสลับโหมด (มุมขวาบน):** ผู้ใช้เลือก "ใช้ AI" หรือ "ไม่ใช้ AI" ได้ทุกครั้ง ส่วนหัวของร่างบอกว่าร่างนี้สร้างด้วยโหมดไหน และสร้างใหม่ด้วยอีกโหมดได้ ถ้าเซิร์ฟเวอร์ไม่มี AI ปุ่ม "ใช้ AI" จะกดไม่ได้ (หน้าเว็บถาม `GET /api/engine`) · ถ้าตั้ง `QUOTATION_AI_MODE=offline` จะปิด AI สำหรับทุกคน

### รูปแบบไฟล์ CSV

| คอลัมน์ | จำเป็น | ตัวอย่าง |
|---|---|---|
| `sku` | ✓ | `PVC-050-85` |
| `name` | ✓ | `ท่อ PVC สีฟ้า 1/2 นิ้ว ชั้น 8.5` |
| `unit` | ✓ | `เส้น` |
| `unit_price` | ✓ | `62.00` หรือ `"1,250.00"` (ทศนิยมไม่เกิน 2 ตำแหน่ง) |
| `name_en` | | `PVC pipe 1/2 inch` |
| `aliases` | | `ท่อฟ้า 4 หุน\|ท่อ pvc 4 หุน` คั่นด้วย `\|` |
| `category` | | `ท่อและข้อต่อ` |

- ใช้หัวคอลัมน์ภาษาไทยได้ เช่น `รหัสสินค้า, ชื่อสินค้า, หน่วย, ราคา`
- ไฟล์ต้องเป็น **UTF-8** (ใน Excel เลือก "CSV UTF-8") ถ้าเป็นไฟล์ Windows-874 ระบบจะแจ้งให้บันทึกใหม่
- ช่อง `aliases` คือส่วนที่ช่วยให้จับคู่แม่นที่สุด ให้ใส่คำที่ลูกค้าใช้เรียกจริง เช่น "ท่อฟ้า", "ลูกย่อย", "หลอดปิงปอง"

### การคำนวณเงิน

- เก็บเงินเป็น**สตางค์** (จำนวนเต็ม) ทั้งระบบ จึงไม่มีปัญหาทศนิยมคลาดเคลื่อน
- ยอดต่อบรรทัด = ราคาต่อหน่วย × จำนวน ปัดครึ่งขึ้นเป็นสตางค์ (จำนวนมีทศนิยมได้ เช่น 2.5 เมตร)
- **คิด VAT ครั้งเดียวจากยอดรวมทั้งเอกสาร** ไม่ใช่คิดทีละบรรทัด แล้วปัดครึ่งขึ้นเป็นสตางค์
  - ราคายังไม่รวม VAT: VAT = ยอดรวม × อัตรา
  - ราคารวม VAT แล้ว: VAT = ยอดรวม × อัตรา ÷ (1 + อัตรา)
- อัตรา VAT ตั้งได้ (ค่าเริ่มต้น 7%) แสดงผลเป็นบาท และมีจำนวนเงินตัวอักษรภาษาไทย (`bahtText`)

### ค่าใช้จ่าย

**Hosting:** เดโมนี้มีหน้าเว็บ static หนึ่งหน้า กับ API function สองตัวที่ทำงานสั้นๆ ทดลองบนแพ็กเกจ Hobby ได้ ส่วนการใช้งานเชิงพาณิชย์ต้องใช้แพ็กเกจ Pro ขึ้นไป ดูราคาล่าสุดที่ <https://vercel.com/pricing>

**โมเดล:** คิดตามจำนวน token ที่ใช้ผ่าน AI Gateway ข้อความลูกค้าหนึ่งข้อความเรียกโมเดล 2 ครั้ง (แยกรายการ 1 ครั้ง และเลือกสินค้า 1 ครั้ง)

```
ค่าโมเดลต่อข้อความ ≈ (input tokens × ราคา input) + (output tokens × ราคา output)
```

ประเมินจากขนาด prompt จริงของข้อความตัวอย่าง 6 บรรทัด (ประมาณ 3,400 ตัวอักษร รวมกับ schema) ได้ราว 3,000 input tokens และ 800 output tokens ต่อข้อความ ตัวเลขนี้ยังไม่ได้วัดจากการเรียกโมเดลจริง และภาษาไทยใช้ token ต่อตัวอักษรมากกว่าภาษาอังกฤษ

| โมเดล | ราคา input / output ต่อ 1M token* | ประมาณต่อข้อความ |
|---|---|---|
| `anthropic/claude-haiku-5.5` (ค่าเริ่มต้น) | $0.10 / $0.50 | ~$0.0007 |
| `google/gemini-3.5-flash-lite` | $0.30 / $2.50 | ~$0.003 |
| `anthropic/claude-sonnet-5.5` | $2.00 / $10.00 | ~$0.014 |

\* ดึงจาก `https://ai-gateway.vercel.sh/v1/models` เมื่อ 21 ต.ค. 2569 ราคาเปลี่ยนได้ ดูล่าสุดที่ <https://vercel.com/ai-gateway/models> · เปลี่ยนโมเดลได้ด้วย `QUOTATION_MODEL`

### ใช้โมดูลจับคู่ในโปรเจกต์อื่น

`src/lib/quotation/` เป็น TypeScript ล้วน ไม่ขึ้นกับ Next.js หรือ React ส่วนที่เรียก AI แยกอยู่ใน `llm.ts`

```ts
import { buildDraft, canApprove, chooseItem, parseCatalogCsv, priceQuotation } from "./src/lib/quotation";
import { createLlmExtractor, createLlmSelector } from "./src/lib/quotation/llm";

const { items: catalog, errors } = parseCatalogCsv(csvText);
const draft = await buildDraft({
  inquiry: "ขอราคาท่อฟ้า 4 หุน 50 เส้น กับ breaker 20A 6 ตัว",
  catalog,
  // ไม่ใส่สองบรรทัดนี้ = ใช้ตัวจับคู่แบบออฟไลน์
  extractor: createLlmExtractor("anthropic/claude-haiku-5.5"),
  selector: createLlmSelector("anthropic/claude-haiku-5.5"),
});
// …ให้คนตรวจ / chooseItem() / setQuantity()…
if (canApprove(draft, catalog).ok) {
  const quote = priceQuotation(draft, catalog, { vatRateBps: 700, pricesIncludeVat: false });
}
```

### คำสั่ง

| คำสั่ง | |
|---|---|
| `npm run dev` | เปิดเดโม |
| `npm test` | รันเทสต์ (ชื่อเรียกไทย, รายการกำกวม, ข้อมูลไม่ครบ, การคำนวณ, นำเข้า CSV, ด่านอนุมัติ, AI แบบ mock) |
| `npm run typecheck` / `npm run lint` | ตรวจ type และ lint |
| `npx tsx scripts/try-samples.ts` | ดูผลจับคู่ของข้อความตัวอย่างทุกไฟล์ (โหมดออฟไลน์) |
| `BASE_URL=http://localhost:3000 npx tsx scripts/smoke-api.ts` | ทดสอบ API ของเซิร์ฟเวอร์ที่รันอยู่ |

### ข้อจำกัดของ MVP

- ยังไม่แปลงหน่วย (เช่น กล่อง ↔ ชิ้น) ระบบแค่เตือนให้คนยืนยัน
- ยังไม่มีส่วนลดหรือราคาขั้นบันได
- ยังไม่ส่งเอกสารให้ลูกค้าอัตโนมัติ และยังไม่เชื่อม CRM/ERP
- โหมดออฟไลน์อาจตีความผิด ถ้าสเปกมีหน่วยและมีข้อความคั่นก่อนถึงจำนวน เช่น "ปูน 50 กก. ตราเพชรา 10 ถุง" ซึ่งโหมด AI จัดการได้ดีกว่า

---

## English

### What it does

1. **Upload a catalog** of products and prices as CSV. The file is validated, and every error is reported with its row and column.
2. **Paste a customer inquiry** in Thai, English or a mix of both, e.g. from LINE, email or chat.
3. **AI suggests matching catalog items** and flags anything **ambiguous** (e.g. "cement" could be structural or plaster) or **missing** (no quantity, unit mismatch). It also gives you questions you can copy straight to the customer.
4. **Review and edit** the draft: swap items, edit quantities, add or remove lines, set the VAT rate, and choose whether catalog prices include VAT.
5. **Approve before export.** Printing, saving as PDF or downloading CSV needs explicit human approval. Nothing is ever sent to the customer automatically.

### Safeguards

| Rule | How it is enforced |
|---|---|
| Prices only come from the catalog | The model's output schema has no price field. Prices are looked up by SKU in exactly one place, `priceQuotation()`. |
| No invented products | The model may only answer with a SKU from that line's shortlist. Anything else is rejected and the line goes back to the reviewer (`assembleDraft()`). |
| Human approval before export | `canApprove()` must pass: every line has an item and a quantity, and unit mismatches are confirmed. The reviewer then ticks the confirmation box and clicks Approve. Any edit afterwards revokes the approval. |
| Private catalogs | The catalog stays in the browser. The server only sees the inquiry text plus the names and units of shortlisted items. It never sees prices, and nothing is stored or logged. |
| Synthetic examples | All catalogs, brands and inquiries in `public/samples/` are fictional. |

### Getting started

```bash
npm install
cp .env.example .env.local   # optionally set AI_GATEWAY_API_KEY
npm run dev                  # http://localhost:3000
```

- **No key:** the app runs in **offline mode**, using rule-based matching (Thai word segmentation via `Intl.Segmenter`, fuzzy matching and aliases). The demo works immediately at no cost.
- **With an AI Gateway key:** extraction and item selection use the model, which copes better with messy inquiries.
- **Linked to a Vercel project:** run `vercel env pull .env.local` to get a short-lived `VERCEL_OIDC_TOKEN` instead of creating a key; pull again when it expires.
- **On Vercel:** no key is needed, because the Gateway authenticates with the deployment's OIDC token. AI Gateway must be enabled for the team.

If a model call fails, the app falls back to offline matching and shows a warning on screen.

**Mode switch (top right):** each user can choose "AI" or "no AI" per draft. The draft header shows which mode built it and offers a rebuild in the other mode. The AI option is disabled when the server has no AI access (`GET /api/engine`), and `QUOTATION_AI_MODE=offline` turns AI off for everyone.

### CSV format

See the Thai table above. The required columns are `sku, name, unit, unit_price`. The optional columns are `name_en`, `aliases` (separated by `|`) and `category`. Thai headers are accepted, and the file must be UTF-8. Good `aliases` are the single biggest accuracy lever.

### Money rules

- All amounts are stored as integer satang.
- Line total = unit price × quantity, rounded half-up to the satang.
- **VAT is computed once on the document total**, not per line, and rounded half-up.
  - Prices exclude VAT: VAT = sum × rate.
  - Prices include VAT: VAT = sum × rate / (1 + rate).
- The VAT rate is configurable (default 7%).
- Amounts are formatted as THB, and the Thai amount-in-words line comes from `bahtText`.

### Costs

**Hosting:** the app is one static page plus two short-lived API functions. The Hobby plan is fine for trying it out, but commercial use requires Pro. See <https://vercel.com/pricing>.

**Model:** you pay per token through AI Gateway, with two calls per inquiry: one to extract lines and one to select items. Based on the real prompt size for a 6-line sample (about 3,400 characters plus schemas), we estimate roughly 3,000 input and 800 output tokens per inquiry. This is not yet measured from live calls. With the default `anthropic/claude-haiku-5.5` at $0.10 / $0.50 per 1M tokens, that comes to about **$0.0007 per inquiry**. These prices were fetched from `https://ai-gateway.vercel.sh/v1/models` on 2026-10-21. See the Thai table above for other models, and set `QUOTATION_MODEL` to switch.

### Reusing the matching module

`src/lib/quotation/` is plain TypeScript with no Next.js or React dependency. The model-backed parts live in `llm.ts` and are injected as `LineExtractor` and `MatchSelector` interfaces. See the code sample in the Thai section.

### Project layout

```
src/lib/quotation/      core module (CSV, matching, pipeline, review, money) + tests
src/lib/server/ai.ts    picks AI vs offline engine
src/app/api/extract     inquiry → requested lines
src/app/api/select      shortlists → item selections (no prices)
src/app/api/engine      whether AI is available here (drives the mode switch)
src/components/         review screen and printable quotation template
public/samples/         synthetic catalogs and inquiries
```

## License

[MIT](LICENSE)
