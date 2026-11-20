"use client";

import type { DeskDraft, DocumentDetails, ItemView, LineView, Revision } from "@eve-thai-quotation-extension/eve/desk";
import { CheckIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import { Step } from "@/app/_components/step";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { issueDraft, reviseDraft, saveDetails, searchItems, type Result } from "./actions";
import { QuotationDocument, quotationCsv } from "./quotation-document";

type ProblemCode = LineView["problemCodes"][number];

const STATUS: Record<LineView["status"], { label: string; variant: "success" | "warning" | "destructive" }> = {
  matched: { label: "จับคู่แล้ว", variant: "success" },
  ambiguous: { label: "ต้องเลือก", variant: "warning" },
  not_found: { label: "ไม่พบในแคตตาล็อก", variant: "destructive" },
};

const PROBLEM_TEXT: Record<ProblemCode, (line: LineView) => string> = {
  missing_quantity: () => "ลูกค้าไม่ได้ระบุจำนวน",
  unit_mismatch: (line) => `หน่วยที่ลูกค้าขอไม่ตรงกับหน่วยขาย "${line.item?.unit ?? "-"}"`,
  ambiguous: () => "ตรงได้หลายรายการ เลือกให้ถูกรุ่น",
  not_found: () => "ไม่มีรายการที่ตรง เลือกเองหรือลบบรรทัดนี้",
  rejected_sku: () => "AI เสนอรหัสที่ไม่อยู่ในรายการที่ค้นได้ จึงไม่ใช้",
};

export function QuotationDesk({ token, initial }: { token: string; initial: DeskDraft }) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [copied, setCopied] = useState(false);

  // Changes are sent one at a time, in the order they were made. Two at once would each start
  // from the same saved draft, and the second to finish would undo the first.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const apply = (run: () => Promise<Result<DeskDraft>>, after?: () => void) => {
    setError(undefined);
    startTransition(async () => {
      const turn = queue.current.then(run);
      queue.current = turn.then(
        () => undefined,
        () => undefined,
      );
      const result = await turn.catch(
        (cause: unknown): Result<DeskDraft> => ({
          ok: false,
          error: cause instanceof Error ? cause.message : "ไม่สามารถติดต่อระบบได้",
        }),
      );
      if (result.ok) {
        setDraft(result.value);
        after?.();
      } else {
        setError(result.error);
      }
    });
  };
  const revise = (revision: Revision) => {
    // Any change to the lines means the person has to look again before approving.
    setReviewed(false);
    apply(() => reviseDraft(token, revision));
  };
  const saveDetail = (details: Partial<DocumentDetails>) => apply(() => saveDetails(token, details));

  if (draft.issued) return <Issued draft={draft} />;

  const { view } = draft;
  const questions = view.questionsForCustomer;
  const blockers = [
    ...(view.lines.length === 0 ? ["ยังไม่มีรายการสินค้า"] : []),
    ...view.lines.flatMap((line, index) =>
      line.problemCodes.map((code) => `บรรทัด ${index + 1} (${line.customerAsked}): ${PROBLEM_TEXT[code](line)}`),
    ),
  ];

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Thai Quotation Copilot</h1>
          <p className="text-muted-foreground text-sm">
            ตรวจและปรับแก้ร่าง แล้วอนุมัติเพื่อออกใบเสนอราคา · ราคาทุกบรรทัดมาจากแคตตาล็อกเท่านั้น
          </p>
        </div>
        <a className="text-primary text-sm underline underline-offset-4" href="/">
          ← เริ่มใหม่ (ขั้นที่ 1–2)
        </a>
      </header>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>ดำเนินการไม่สำเร็จ</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {draft.inquiry && (
        <details className="bg-card rounded-xl border px-5 py-3 text-sm shadow-sm">
          <summary className="cursor-pointer font-medium">ข้อความจากลูกค้า</summary>
          <p className="text-muted-foreground mt-2 leading-relaxed whitespace-pre-wrap">{draft.inquiry}</p>
        </details>
      )}

      <Step
        n={3}
        title="ตรวจและแก้ไขร่าง"
        aside={
          <span className="text-muted-foreground text-xs">
            {draft.usesUploadedCatalog ? "ใช้แคตตาล็อกที่อัปโหลด" : "ใช้แคตตาล็อกของร้าน"} · คนเป็นผู้ตัดสินทุกบรรทัด
          </span>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-xs">
              <tr>
                <th className="w-10 px-3 py-2 text-left font-medium">#</th>
                <th className="min-w-44 px-3 py-2 text-left font-medium">ลูกค้าขอ</th>
                <th className="min-w-72 px-3 py-2 text-left font-medium">สินค้าในแคตตาล็อก</th>
                <th className="w-28 px-3 py-2 text-right font-medium">จำนวน</th>
                <th className="px-3 py-2 text-left font-medium">หน่วย</th>
                <th className="px-3 py-2 text-right font-medium">ราคา/หน่วย</th>
                <th className="px-3 py-2 text-right font-medium">รวม</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {view.lines.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-muted-foreground px-3 py-6 text-center">
                    ยังไม่มีรายการ เพิ่มสินค้าจากช่องค้นหาด้านล่าง
                  </td>
                </tr>
              )}
              {view.lines.map((line, index) => (
                <LineRow key={line.lineId} token={token} index={index} line={line} disabled={pending} revise={revise} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-5 border-t px-5 py-4 md:grid-cols-[1fr_auto]">
          <div className="space-y-4">
            <div className="max-w-md">
              <p className="text-muted-foreground mb-1 text-xs font-medium">
                เพิ่มรายการที่ลูกค้าไม่ได้พูดถึง (เช่น ค่าขนส่ง)
              </p>
              <ItemPicker
                token={token}
                label="เพิ่มรายการ"
                placeholder="ค้นหาเพื่อเพิ่มบรรทัด…"
                disabled={pending}
                onPick={(sku) => revise({ add: [{ sku, quantity: 1 }] })}
              />
            </div>
            {questions.length > 0 && (
              <Alert variant="warning" role="group" aria-label="ต้องถามลูกค้าเพิ่ม">
                <div className="col-start-2 flex items-center justify-between gap-2">
                  <AlertTitle>ต้องถามลูกค้าเพิ่ม ({questions.length})</AlertTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await navigator.clipboard.writeText(questions.map((q, i) => `${i + 1}. ${q}`).join("\n"));
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                  >
                    {copied ? "คัดลอกแล้ว" : "คัดลอกข้อความ"}
                  </Button>
                </div>
                <AlertDescription>
                  <ol className="list-decimal space-y-0.5 pl-5">
                    {questions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ol>
                </AlertDescription>
              </Alert>
            )}
          </div>

          <div className="min-w-72 space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="vat-rate">VAT</Label>
                <VatRateInput
                  key={draft.details.vatRateBps}
                  bps={draft.details.vatRateBps}
                  disabled={pending}
                  onCommit={(vatRateBps) => saveDetail({ vatRateBps })}
                />
                <span className="text-muted-foreground">%</span>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="prices-include-vat"
                  checked={draft.details.pricesIncludeVat}
                  disabled={pending}
                  onCheckedChange={(value) => saveDetail({ pricesIncludeVat: value === true })}
                />
                <Label className="font-normal" htmlFor="prices-include-vat">
                  ราคาในแคตตาล็อกรวม VAT แล้ว
                </Label>
              </div>
            </div>
            <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
              <dt className="text-muted-foreground">มูลค่าก่อนภาษี</dt>
              <dd className="num text-right">{view.totals.subtotal}</dd>
              <dt className="text-muted-foreground">VAT {view.totals.vatRate}</dt>
              <dd className="num text-right">{view.totals.vat}</dd>
              <dt className="border-t pt-1 font-semibold">รวมทั้งสิ้น</dt>
              <dd className="num text-brand border-t pt-1 text-right text-lg font-bold">฿{view.totals.grandTotal}</dd>
            </dl>
          </div>
        </div>
      </Step>

      <Step n={4} title="ข้อมูลเอกสาร อนุมัติ และส่งออก">
        <div className="grid gap-5 px-5 py-4 text-sm md:grid-cols-2">
          <div className="grid content-start gap-2">
            <TextField
              id="quote-no"
              label="เลขที่ใบเสนอราคา"
              placeholder="เว้นว่างเพื่อให้ระบบออกเลขให้"
              maxLength={40}
              value={draft.details.quoteNo}
              onCommit={(quoteNo) => saveDetail({ quoteNo })}
            />
            <TextField
              id="customer-name"
              label="ชื่อลูกค้า"
              maxLength={200}
              value={draft.details.customerName}
              onCommit={(customerName) => saveDetail({ customerName })}
            />
            <TextField
              id="seller-name"
              label="ชื่อบริษัทผู้ขาย"
              maxLength={200}
              value={draft.details.sellerName}
              onCommit={(sellerName) => saveDetail({ sellerName })}
            />
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label className="text-muted-foreground text-xs" htmlFor="quote-date">
                  วันที่ (เว้นว่าง = วันที่อนุมัติ)
                </Label>
                <DatePicker
                  id="quote-date"
                  placeholder="วันที่อนุมัติ"
                  value={parseIsoDate(draft.details.date)}
                  onValueChange={(date) => saveDetail({ date: date ? toIsoDate(date) : "" })}
                />
              </div>
              <TextField
                id="valid-days"
                label="ยืนราคา (วัน)"
                type="number"
                value={String(draft.details.validDays)}
                onCommit={(text) => {
                  const validDays = Number(text);
                  if (Number.isInteger(validDays) && validDays >= 1 && validDays <= 365) saveDetail({ validDays });
                  else setError("จำนวนวันยืนราคาต้องเป็นจำนวนเต็ม 1 ถึง 365");
                }}
              />
            </div>
          </div>
          <div className="grid content-start gap-2">
            <TextField
              id="customer-details"
              label="ที่อยู่ / ผู้ติดต่อของลูกค้า"
              multiline
              maxLength={500}
              value={draft.details.customerDetails}
              onCommit={(customerDetails) => saveDetail({ customerDetails })}
            />
            <TextField
              id="seller-details"
              label="ที่อยู่ / เลขผู้เสียภาษีของผู้ขาย"
              multiline
              maxLength={500}
              value={draft.details.sellerDetails}
              onCommit={(sellerDetails) => saveDetail({ sellerDetails })}
            />
            <TextField
              id="notes"
              label="หมายเหตุ (เงื่อนไขชำระเงิน การส่งของ ฯลฯ)"
              multiline
              maxLength={1000}
              value={draft.details.notes}
              onCommit={(notes) => saveDetail({ notes })}
            />
          </div>
        </div>

        <div className="border-t px-5 py-4 text-sm">
          {!view.readyToIssue ? (
            <Alert role="status" className="bg-muted/50">
              <AlertTitle>ยังอนุมัติไม่ได้ แก้ให้ครบก่อน:</AlertTitle>
              <AlertDescription>
                <ul className="list-disc space-y-0.5 pl-5">
                  {blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Checkbox id="reviewed" checked={reviewed} onCheckedChange={(value) => setReviewed(value === true)} />
                <Label className="font-normal" htmlFor="reviewed">
                  ฉันตรวจรายการ จำนวน และราคาทุกบรรทัดแล้ว
                </Label>
              </div>
              <Button
                className="bg-success hover:bg-success/90 dark:text-background text-white"
                disabled={!reviewed || pending}
                onClick={() => setConfirming(true)}
              >
                <CheckIcon />
                อนุมัติใบเสนอราคา
              </Button>
            </div>
          )}
        </div>
      </Step>

      <p className="text-muted-foreground text-center text-xs">
        Open source (MIT) · ข้อมูลตัวอย่างทั้งหมดเป็นข้อมูลสมมติ · ตรวจสอบเอกสารทุกครั้งก่อนส่งให้ลูกค้า
      </p>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ยืนยันการอนุมัติ</DialogTitle>
            <DialogDescription>
              ออกใบเสนอราคา{draft.details.customerName ? `ให้ ${draft.details.customerName}` : ""} ยอดรวม{" "}
              {view.totals.grandTotal} บาท (รวมภาษีมูลค่าเพิ่ม) หลังออกแล้วจะแก้ไขร่างนี้ไม่ได้
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={pending}>
              ยกเลิก
            </Button>
            <Button
              disabled={pending}
              onClick={() => apply(() => issueDraft(token, view.totals.grandTotal), () => setConfirming(false))}
            >
              {pending ? "กำลังออกใบเสนอราคา…" : "อนุมัติ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function LineRow({
  token,
  index,
  line,
  disabled,
  revise,
}: {
  token: string;
  index: number;
  line: LineView;
  disabled: boolean;
  revise: (revision: Revision) => void;
}) {
  const change = (fields: Omit<NonNullable<Revision["changes"]>[number], "lineId">) =>
    revise({ changes: [{ lineId: line.lineId, ...fields }] });
  const needsItem = line.item === null;
  const status = STATUS[line.status];

  return (
    <tr className="border-t align-top">
      <td className="text-muted-foreground px-3 py-3">
        <span className="flex h-9 items-center">{index + 1}</span>
      </td>
      <td className="px-3 py-3">
        <span className="flex min-h-9 items-center">{line.customerAsked}</span>
        <Badge variant={status.variant} className="mt-1">
          {status.label}
        </Badge>
        {line.problemCodes.length > 0 && (
          <ul className="text-warning mt-1 space-y-0.5 text-xs">
            {line.problemCodes.map((code) => (
              <li key={code}>• {PROBLEM_TEXT[code](line)}</li>
            ))}
          </ul>
        )}
      </td>
      <td className="px-3 py-3">
        <ItemPicker
          token={token}
          label={`สินค้า บรรทัด ${index + 1}`}
          placeholder="เลือกสินค้า…"
          className={needsItem ? "border-warning/60 bg-warning/5" : "bg-background"}
          disabled={disabled}
          current={line.item}
          suggestions={line.candidates}
          onPick={(sku) => change({ sku })}
        />

        {line.problemCodes.includes("unit_mismatch") && (
          <Button className="mt-2" size="xs" variant="outline" disabled={disabled} onClick={() => change({ confirmUnit: true })}>
            ยืนยันจำนวนตามหน่วยขาย ({line.item?.unit})
          </Button>
        )}
      </td>
      <td className="px-3 py-3">
        <QuantityInput
          key={`${line.lineId}:${line.quantity ?? ""}`}
          label={`จำนวน บรรทัด ${index + 1}`}
          value={line.quantity}
          disabled={disabled}
          onCommit={(quantity) => change({ quantity })}
        />
      </td>
      <td className="px-3 py-3">
        <span className="flex h-9 items-center">{line.item?.unit ?? "-"}</span>
      </td>
      <td className="num px-3 py-3 text-right">
        <span className="flex h-9 items-center justify-end">{line.unitPrice ?? "-"}</span>
      </td>
      <td className="num px-3 py-3 text-right">
        <span className="flex h-9 items-center justify-end">{line.lineTotal ?? "-"}</span>
      </td>
      <td className="py-3 pr-3">
        <Button
          aria-label={`ลบบรรทัด ${index + 1}`}
          className="text-muted-foreground hover:text-destructive"
          size="icon"
          title="ลบบรรทัด"
          variant="ghost"
          disabled={disabled}
          onClick={() => change({ remove: true })}
        >
          <XIcon />
        </Button>
      </td>
    </tr>
  );
}

function QuantityInput({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: number | null;
  disabled: boolean;
  onCommit: (quantity: number) => void;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const commit = () => {
    const quantity = Number(text);
    if (text.trim() !== "" && Number.isFinite(quantity) && quantity > 0 && quantity !== value) onCommit(quantity);
    else setText(value === null ? "" : String(value));
  };
  return (
    <Input
      aria-label={label}
      // A missing quantity is something to fill in, not an error: warning colour.
      className={cn("no-spin num w-full text-right", value === null && "border-warning/60 bg-warning/5")}
      inputMode="decimal"
      type="number"
      min={0}
      step="any"
      value={text}
      disabled={disabled}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

const itemOption = (item: ItemView) => ({
  value: item.sku,
  label: `${item.name} · ${item.sku} · ${item.unit}`,
  keywords: [item.sku],
});

/**
 * Choose a catalog item. Closed, it shows the current item; open, it lists the close matches
 * and searches the whole catalog on the server once two characters are typed.
 */
function ItemPicker({
  token,
  label,
  placeholder,
  className,
  disabled,
  current = null,
  suggestions = [],
  onPick,
}: {
  token: string;
  label: string;
  placeholder: string;
  className?: string;
  disabled: boolean;
  current?: ItemView | null;
  suggestions?: ItemView[];
  onPick: (sku: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ query: string; items: ItemView[] }>();
  const [failed, setFailed] = useState<string>();
  const latest = useRef(0);
  // Counts picks: a new key gives the combobox an empty search box the next time it opens.
  const [picks, setPicks] = useState(0);
  const text = query.trim();
  const searching = text.length >= 2;

  useEffect(() => {
    if (text.length < 2) return;
    const id = ++latest.current;
    const timer = setTimeout(async () => {
      const result = await searchItems(token, text);
      // A slower, older search must not replace the results of a newer one.
      if (id !== latest.current) return;
      if (result.ok) {
        setFound({ query: text, items: result.value });
        setFailed(undefined);
      } else {
        setFailed(result.error);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [text, token]);

  // The current item stays in the list so the closed field can always show its name.
  const listed = searching ? (found?.items ?? []) : suggestions;
  const items = current ? [current, ...listed.filter((item) => item.sku !== current.sku)] : listed;
  return (
    <div className="grid gap-1">
      <Combobox
        key={picks}
        aria-label={label}
        className={className}
        disabled={disabled}
        placeholder={placeholder}
        searchPlaceholder="พิมพ์ชื่อหรือรหัสสินค้า…"
        emptyText={searching ? `ไม่พบ "${text}" ในแคตตาล็อก` : "พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นหา"}
        loading={searching && found?.query !== text && !failed}
        shouldFilter={false}
        options={items.map(itemOption)}
        value={current?.sku ?? ""}
        onSearchChange={setQuery}
        onValueChange={(sku) => {
          setQuery("");
          setPicks((count) => count + 1);
          // The combobox sends "" when the chosen item is clicked again; a line keeps its item.
          if (sku && sku !== current?.sku) onPick(sku);
        }}
      />
      {failed && <p className="text-destructive text-xs">{failed}</p>}
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const toIsoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
/** "2026-11-20" as a local date; `new Date(text)` would read it as UTC and can shift the day. */
function parseIsoDate(text: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : undefined;
}

/** A field that saves when the person leaves it, and only when the text changed. */
function TextField({
  id,
  label,
  value,
  onCommit,
  multiline,
  ...input
}: {
  id: string;
  label: string;
  value: string;
  onCommit: (value: string) => void;
  multiline?: boolean;
  type?: string;
  maxLength?: number;
  placeholder?: string;
}) {
  const commit = (next: string) => {
    if (next.trim() !== value) onCommit(next.trim());
  };
  return (
    <div className="grid gap-1">
      <Label className="text-muted-foreground text-xs" htmlFor={id}>
        {label}
      </Label>
      {multiline ? (
        <Textarea key={value} id={id} defaultValue={value} rows={2} {...input} onBlur={(event) => commit(event.target.value)} />
      ) : (
        <Input key={value} id={id} defaultValue={value} {...input} onBlur={(event) => commit(event.target.value)} />
      )}
    </div>
  );
}

function VatRateInput({ bps, disabled, onCommit }: { bps: number; disabled: boolean; onCommit: (bps: number) => void }) {
  const shown = String(bps / 100);
  const [text, setText] = useState(shown);
  const commit = () => {
    const percent = Number(text);
    const next = Math.round(percent * 100);
    if (text.trim() !== "" && Number.isFinite(percent) && next >= 0 && next <= 10_000 && next !== bps) onCommit(next);
    else setText(shown);
  };
  return (
    <Input
      id="vat-rate"
      className="no-spin num w-20 text-right"
      inputMode="decimal"
      type="number"
      min={0}
      max={100}
      step="any"
      value={text}
      disabled={disabled}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

function Issued({ draft }: { draft: DeskDraft }) {
  const issued = draft.issued!;
  const [copied, setCopied] = useState(false);

  const downloadCsv = () => {
    const url = URL.createObjectURL(new Blob([quotationCsv(issued)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${issued.quoteNo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const copyText = async () => {
    await navigator.clipboard.writeText(issued.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 print:p-0">
      <div className="no-print">
        <Step n={4} title="ข้อมูลเอกสาร อนุมัติ และส่งออก">
          <div className="flex flex-wrap items-center gap-2 px-5 py-4 text-sm">
            <span className="text-success mr-2 flex items-center gap-1.5 font-medium">
              <CheckIcon className="size-4" />
              อนุมัติแล้ว ส่งออกได้ · {issued.quoteNo}
            </span>
            <Button onClick={() => window.print()}>พิมพ์ / บันทึกเป็น PDF</Button>
            <Button variant="outline" onClick={downloadCsv}>
              ดาวน์โหลด CSV
            </Button>
            <Button variant="outline" onClick={() => void copyText()}>
              {copied ? "คัดลอกแล้ว" : "คัดลอกข้อความ"}
            </Button>
            <a className="text-primary ml-auto text-sm underline underline-offset-4" href="/">
              สร้างใบเสนอราคาใหม่
            </a>
          </div>
        </Step>
      </div>
      <QuotationDocument issued={issued} />
    </main>
  );
}
