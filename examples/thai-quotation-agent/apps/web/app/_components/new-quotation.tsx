"use client";

import { decodeCsvBytes } from "@eve-thai-quotation-extension/core";
import { CheckIcon, MessageSquareIcon, UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Step, brandButton } from "@/app/_components/step";
import { createDraftWithAi, createDraftWithoutAi, uploadCatalog } from "@/app/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Textarea } from "@/components/ui/textarea";

type SampleCatalog = "construction-th" | "office-en";

const SAMPLE_CATALOGS: { name: SampleCatalog; label: string }[] = [
  { name: "construction-th", label: "วัสดุก่อสร้างและไฟฟ้า (ตัวอย่าง)" },
  { name: "office-en", label: "Office supplies (sample)" },
];

const SAMPLE_INQUIRIES: { file: string; label: string; catalog: SampleCatalog }[] = [
  { file: "01-thai-line-chat.txt", label: "แชต LINE ภาษาไทย", catalog: "construction-th" },
  { file: "02-mixed-electrical.txt", label: "ไทยปนอังกฤษ งานไฟ", catalog: "construction-th" },
  { file: "03-ambiguous-missing.txt", label: "กำกวม / ข้อมูลไม่ครบ", catalog: "construction-th" },
  { file: "05-unit-mismatch.txt", label: "หน่วยไม่ตรง", catalog: "construction-th" },
  { file: "04-english-office.txt", label: "English email", catalog: "office-en" },
];

const MAX_LENGTH = 8000;
const MAX_CATALOG_BYTES = 1_000_000;

/** The price list a draft will be made from. */
type Catalog =
  | { kind: "none" }
  | { kind: "shop" }
  | { kind: "uploaded"; catalogId: string; items: number; label: string; sample?: SampleCatalog; warnings: string[] };

type Mode = "ai" | "rules";

const MODE_NOTE: Record<Mode, string> = {
  ai: "ให้ AI อ่านข้อความ เหมาะกับข้อความไม่เป็นระเบียบ · ราคายังมาจากแคตตาล็อกเท่านั้น",
  rules: "จับคู่ด้วยกฎ: ตัดคำไทย + ชื่อเรียกอื่น + เทียบตัวสะกดและขนาด · ไม่มีค่าใช้จ่าย",
};

export function NewQuotation() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  // Nothing is chosen at first: a draft priced from a catalog the person did not pick would confuse.
  const [catalog, setCatalog] = useState<Catalog>({ kind: "none" });
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [catalogError, setCatalogError] = useState<string>();
  const [message, setMessage] = useState("");
  const [sendError, setSendError] = useState<string>();
  const [mode, setMode] = useState<Mode>("ai");
  const [creating, setCreating] = useState(false);

  const working = creating;
  const error = sendError;
  const locked = working || catalogBusy;

  async function applyCatalogText(text: string, label: string, sample?: SampleCatalog): Promise<boolean> {
    setCatalogError(undefined);
    setCatalogBusy(true);
    try {
      const result = await uploadCatalog(text);
      if (!result.ok) {
        setCatalogError(result.error);
        return false;
      }
      setCatalog({
        kind: "uploaded",
        catalogId: result.catalogId,
        items: result.items,
        label,
        sample,
        warnings: result.warnings,
      });
      return true;
    } catch {
      setCatalogError("ส่งไฟล์แคตตาล็อกไม่สำเร็จ กรุณาลองอีกครั้ง");
      return false;
    } finally {
      setCatalogBusy(false);
    }
  }

  async function pickSampleCatalog(name: SampleCatalog): Promise<boolean> {
    if (catalog.kind === "uploaded" && catalog.sample === name) return true;
    const label = SAMPLE_CATALOGS.find((sample) => sample.name === name)?.label ?? name;
    const text = await (await fetch(`/samples/catalog-${name}.csv`)).text();
    return applyCatalogText(text, label, name);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_CATALOG_BYTES) {
      setCatalogError("ไฟล์ใหญ่เกินไป (จำกัด 1 MB)");
      return;
    }
    const decoded = decodeCsvBytes(new Uint8Array(await file.arrayBuffer()));
    if ("error" in decoded) {
      setCatalogError(decoded.error.message);
      return;
    }
    await applyCatalogText(decoded.text, file.name);
  }

  async function pickSampleInquiry(sample: (typeof SAMPLE_INQUIRIES)[number]) {
    // A sample message only makes sense with the catalog it was written for.
    if (!(await pickSampleCatalog(sample.catalog))) return;
    setMessage(await (await fetch(`/samples/inquiries/${sample.file}`)).text());
  }

  const submit = () => {
    const text = message.trim();
    if (text.length === 0 || locked || catalog.kind === "none") return;
    setSendError(undefined);
    setCreating(true);
    const catalogId = catalog.kind === "uploaded" ? catalog.catalogId : undefined;
    // "ai": the agent's model reads the message. "rules": the built-in rules do, at no cost.
    void (mode === "ai" ? createDraftWithAi(text, catalogId) : createDraftWithoutAi(text, catalogId))
      .then((result) => {
        if (result.ok) router.push(result.path);
        else {
          setSendError(result.error);
          setCreating(false);
        }
      })
      .catch(() => {
        setSendError("สร้างร่างไม่สำเร็จ กรุณาลองอีกครั้ง");
        setCreating(false);
      });
  };

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">Thai Quotation Copilot</h1>
          <p className="text-muted-foreground text-sm">
            วางข้อความลูกค้า แล้วได้ร่างใบเสนอราคาจากแคตตาล็อกและราคาจริงของคุณ · ราคาทุกบรรทัดมาจากแคตตาล็อกเท่านั้น
          </p>
        </div>
        <div className="flex max-w-xs flex-col items-end gap-1.5">
          <SegmentedControl
            aria-label="วิธีอ่านข้อความ"
            options={[
              { value: "ai", label: "ใช้ AI" },
              { value: "rules", label: "ไม่ใช้ AI" },
            ]}
            value={mode}
            onValueChange={(value) => setMode(value === "rules" ? "rules" : "ai")}
          />
          <p className="text-muted-foreground text-right text-xs">{MODE_NOTE[mode]}</p>
        </div>
      </header>

      <Step
        n={1}
        title="แคตตาล็อกสินค้าและราคา (CSV)"
        aside={
          catalog.kind === "none" ? (
            <span className="text-muted-foreground text-sm">ยังไม่ได้โหลด</span>
          ) : (
            <span className="text-success flex items-center gap-1.5 text-sm">
              <CheckIcon className="size-4" />
              {catalog.kind === "uploaded"
                ? `${catalog.label} · ${catalog.items.toLocaleString("th-TH")} รายการ`
                : "แคตตาล็อกของร้าน"}
            </span>
          )
        }
      >
        <div className="flex flex-col gap-3 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={locked} onClick={() => fileInput.current?.click()}>
            <UploadIcon />
            อัปโหลด CSV
          </Button>
          <input
            ref={fileInput}
            accept=".csv,text/csv"
            aria-label="ไฟล์แคตตาล็อก CSV"
            className="sr-only"
            type="file"
            onChange={(event) => {
              void onFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <span className="text-muted-foreground text-sm">หรือใช้ตัวอย่าง:</span>
          {SAMPLE_CATALOGS.map((sample) => (
            <Button
              key={sample.name}
              aria-pressed={catalog.kind === "uploaded" && catalog.sample === sample.name}
              variant={catalog.kind === "uploaded" && catalog.sample === sample.name ? "secondary" : "outline"}
              disabled={locked}
              onClick={() => void pickSampleCatalog(sample.name)}
            >
              {sample.label}
            </Button>
          ))}
          <Button
            aria-pressed={catalog.kind === "shop"}
            variant={catalog.kind === "shop" ? "secondary" : "outline"}
            disabled={locked}
            onClick={() => {
              setCatalogError(undefined);
              setCatalog({ kind: "shop" });
            }}
          >
            แคตตาล็อกของร้าน
          </Button>
          <a className="text-primary text-sm underline underline-offset-4" href="/catalog">
            ดู / แก้ไขแคตตาล็อกของร้าน
          </a>
        </div>
        {catalogError && (
          <Alert variant="destructive" role="alert">
            <AlertTitle>ใช้แคตตาล็อกนี้ไม่ได้</AlertTitle>
            <AlertDescription>{catalogError}</AlertDescription>
          </Alert>
        )}
        {catalog.kind === "uploaded" && catalog.warnings.length > 0 && (
          <Alert variant="warning" role="status">
            <AlertTitle>นำเข้าแล้ว มี {catalog.warnings.length} จุดที่ควรตรวจ</AlertTitle>
            <AlertDescription>
              <ul className="list-disc space-y-0.5 pl-5">
                {catalog.warnings.slice(0, 5).map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        <p className="text-muted-foreground text-sm">
          คอลัมน์: <code>sku, name, unit, unit_price</code> (จำเป็น) · <code>name_en, aliases, category</code> (ไม่บังคับ) ·
          คั่นชื่อเรียกอื่นด้วย <code>|</code> · ไฟล์ที่อัปโหลดจะถูกส่งไปเก็บที่เซิร์ฟเวอร์ของระบบนี้เพื่อใช้คิดราคา ·{" "}
          <a className="text-primary underline underline-offset-4" href="/samples/catalog-construction-th.csv" download>
            ดาวน์โหลดไฟล์ตัวอย่าง
          </a>
        </p>
        </div>
      </Step>

      <Step n={2} title="ข้อความจากลูกค้า (ไทย / English)">
        <div className="flex flex-col gap-3 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-sm">ตัวอย่าง:</span>
          {SAMPLE_INQUIRIES.map((sample) => (
            <Button
              key={sample.file}
              className="rounded-full"
              size="sm"
              variant="outline"
              disabled={locked}
              onClick={() => void pickSampleInquiry(sample)}
            >
              {sample.label}
            </Button>
          ))}
        </div>
        <Textarea
          aria-label="ข้อความจากลูกค้า"
          className="leading-relaxed"
          rows={7}
          maxLength={MAX_LENGTH}
          placeholder={"เช่น\nขอราคาท่อฟ้า 4 หุน 50 เส้น ข้องอ 30 ตัว\nbreaker 20A 6 ตัว"}
          value={message}
          disabled={working}
          onChange={(event) => setMessage(event.target.value)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            className={brandButton}
            disabled={locked || message.trim().length === 0 || catalog.kind === "none"}
            onClick={submit}
          >
            {working ? "กำลังวิเคราะห์…" : "สร้างร่างใบเสนอราคา"}
          </Button>
          {catalogBusy && <span className="text-muted-foreground text-sm">กำลังตรวจแคตตาล็อก…</span>}
          {!catalogBusy && catalog.kind === "none" && (
            <span className="text-muted-foreground text-sm">โหลดแคตตาล็อกก่อน</span>
          )}
        </div>
        </div>
      </Step>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>สร้างร่างไม่สำเร็จ</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <footer className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-sm">
        {/* The chat talks to the agent from the browser, which only local development allows. */}
        {process.env.NODE_ENV !== "production" ? (
          <a className="inline-flex items-center gap-1.5 underline underline-offset-4" href="/chat">
            <MessageSquareIcon className="size-4" />
            หรือคุยกับผู้ช่วยแบบแชต
          </a>
        ) : (
          <span />
        )}
        <span>Open source (MIT) · ข้อมูลตัวอย่างทั้งหมดเป็นข้อมูลสมมติ · ตรวจสอบเอกสารทุกครั้งก่อนส่งให้ลูกค้า</span>
      </footer>
    </main>
  );
}
