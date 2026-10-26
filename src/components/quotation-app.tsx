"use client";

import { useEffect, useMemo, useState } from "react";
import {
  acknowledgeUnit,
  addLine,
  assembleDraft,
  canApprove,
  chooseItem,
  customerQuestions,
  decodeCsvBytes,
  formatAmount,
  formatTHB,
  formatVatRate,
  parseCatalogCsv,
  previewTotals,
  priceQuotation,
  removeLine,
  SELECT_LIMITS,
  setQuantity,
  shortlist,
  type CatalogItem,
  type CsvIssue,
  type QuotationDraft,
  type QuotationSettings,
  type RequestedLine,
  type Selection,
} from "@/lib/quotation";
import { CheckIcon } from "./icons";
import { ModeSwitch, type Availability, type MatchMode } from "./mode-switch";
import { QuotationDocument, type QuotationMeta } from "./quotation-document";
import { CatalogSearch, ReviewTable } from "./review-table";

type SampleCatalog = "construction-th" | "office-en";

const SAMPLE_CATALOGS: Record<SampleCatalog, string> = {
  "construction-th": "วัสดุก่อสร้างและไฟฟ้า (ตัวอย่าง)",
  "office-en": "Office supplies (sample)",
};

const SAMPLE_INQUIRIES: { file: string; label: string; catalog: SampleCatalog }[] = [
  { file: "01-thai-line-chat.txt", label: "แชต LINE ภาษาไทย", catalog: "construction-th" },
  { file: "02-mixed-electrical.txt", label: "ไทยปนอังกฤษ งานไฟ", catalog: "construction-th" },
  { file: "03-ambiguous-missing.txt", label: "กำกวม / ข้อมูลไม่ครบ", catalog: "construction-th" },
  { file: "05-unit-mismatch.txt", label: "หน่วยไม่ตรง", catalog: "construction-th" },
  { file: "04-english-office.txt", label: "English email", catalog: "office-en" },
];

const MODE_KEY = "tqc:match-mode";

interface EngineInfo {
  mode: "ai" | "offline";
  model: string | null;
  warning?: string;
}

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (res.status === 429) throw new Error("ใช้งานถี่เกินไป กรุณารอสักครู่แล้วลองใหม่ / Too many requests, please wait a minute.");
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json() as Promise<T>;
}

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function Step({ n, title, children, aside }: { n: number; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
        <h2 className="flex items-center gap-2.5 font-semibold text-navy">
          <span className="flex size-6 items-center justify-center rounded-full bg-navy text-xs text-white">{n}</span>
          {title}
        </h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

export function QuotationApp() {
  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null);
  const [catalogLabel, setCatalogLabel] = useState("");
  const [importErrors, setImportErrors] = useState<CsvIssue[]>([]);
  const [importWarnings, setImportWarnings] = useState<CsvIssue[]>([]);

  const [inquiry, setInquiry] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<EngineInfo | null>(null);
  const [mode, setMode] = useState<MatchMode>("ai");
  const [availability, setAvailability] = useState<Availability | null>(null);

  // Ask the server whether AI can be used here; restore the viewer's last choice.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/engine")
      .then((r) => r.json() as Promise<Availability>)
      .then((a) => {
        if (cancelled) return;
        setAvailability(a);
        let saved: string | null = null;
        try {
          saved = localStorage.getItem(MODE_KEY);
        } catch {}
        setMode(!a.aiAvailable || saved === "offline" ? "offline" : "ai");
      })
      .catch(() => !cancelled && setAvailability({ aiAvailable: false, model: null }));
    return () => {
      cancelled = true;
    };
  }, []);

  const changeMode = (next: MatchMode) => {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {}
  };

  const [draft, setDraft] = useState<QuotationDraft | null>(null);
  const [settings, setSettings] = useState<QuotationSettings>({ vatRateBps: 700, pricesIncludeVat: false });
  const [reviewed, setReviewed] = useState(false);
  const [approved, setApproved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [meta, setMeta] = useState<QuotationMeta>({
    quoteNo: "",
    date: "",
    validDays: 30,
    sellerName: "บริษัท ตัวอย่าง วัสดุภัณฑ์ จำกัด",
    sellerDetails: "99/9 ถนนตัวอย่าง แขวงตัวอย่าง กรุงเทพฯ 10000\nเลขประจำตัวผู้เสียภาษี 0000000000000",
    customerName: "",
    customerDetails: "",
    notes: "",
  });

  /** Any change to lines or pricing settings voids a previous approval. */
  const updateDraft = (next: QuotationDraft) => {
    setDraft(next);
    setApproved(false);
    setReviewed(false);
  };
  const updateSettings = (next: QuotationSettings) => {
    setSettings(next);
    setApproved(false);
    setReviewed(false);
  };
  const revokeApproval = () => {
    setApproved(false);
    setReviewed(false);
  };

  function applyCatalogText(text: string, label: string) {
    const result = parseCatalogCsv(text);
    setImportErrors(result.errors);
    setImportWarnings(result.warnings);
    if (result.errors.length === 0) {
      setCatalog(result.items);
      setCatalogLabel(label);
      setDraft(null);
      setApproved(false);
      return true;
    }
    return false;
  }

  async function onUpload(file: File) {
    const decoded = decodeCsvBytes(new Uint8Array(await file.arrayBuffer()));
    if ("error" in decoded) {
      setImportErrors([decoded.error]);
      setImportWarnings([]);
      return;
    }
    applyCatalogText(decoded.text, file.name);
  }

  async function loadSampleCatalog(name: SampleCatalog) {
    const text = await (await fetch(`/samples/catalog-${name}.csv`)).text();
    applyCatalogText(text, SAMPLE_CATALOGS[name]);
  }

  async function loadSampleInquiry(sample: (typeof SAMPLE_INQUIRIES)[number]) {
    if (catalogLabel !== SAMPLE_CATALOGS[sample.catalog]) await loadSampleCatalog(sample.catalog);
    setInquiry(await (await fetch(`/samples/inquiries/${sample.file}`)).text());
  }

  async function analyze() {
    if (!catalog || !inquiry.trim()) return;
    setBusy(true);
    setError(null);
    try {
      // 1) Extraction sees only the inquiry text.
      const extracted = await postJson<EngineInfo & { lines: RequestedLine[] }>("/api/extract", { inquiry, mode });
      // 2) The catalog never leaves the browser: shortlist locally…
      const requests = shortlist(extracted.lines, catalog);
      if (requests.length > SELECT_LIMITS.lines) {
        throw new Error(
          `ข้อความมี ${requests.length} รายการ เกินขีดจำกัด ${SELECT_LIMITS.lines} รายการต่อครั้ง กรุณาแบ่งส่ง / Too many items (limit ${SELECT_LIMITS.lines}).`,
        );
      }
      // 3) …and send only names/units of the shortlisted items (no prices) for selection.
      const selected = await postJson<EngineInfo & { selections: Selection[] }>("/api/select", { requests, mode });
      updateDraft(assembleDraft(requests, selected.selections, catalog));
      setEngine({
        mode: extracted.mode === "ai" && selected.mode === "ai" ? "ai" : "offline",
        model: extracted.model ?? selected.model,
        warning: extracted.warning ?? selected.warning,
      });
      setMeta((m) => ({
        ...m,
        date: m.date || todayIso(),
        quoteNo: m.quoteNo || `QT-${todayIso().replace(/-/g, "")}-${String(Math.floor(Math.random() * 900) + 100)}`,
      }));
    } catch (e) {
      setError(`วิเคราะห์ไม่สำเร็จ: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const totals = useMemo(
    () => (draft && catalog ? previewTotals(draft, catalog, settings) : null),
    [draft, catalog, settings],
  );
  const approval = useMemo(() => (draft && catalog ? canApprove(draft, catalog) : null), [draft, catalog]);
  const questions = useMemo(() => (draft && catalog ? customerQuestions(draft, catalog) : []), [draft, catalog]);
  const quote = useMemo(
    () => (approved && draft && catalog && approval?.ok ? priceQuotation(draft, catalog, settings) : null),
    [approved, draft, catalog, settings, approval],
  );

  function downloadCsv() {
    if (!quote) return;
    const rows: (string | number)[][] = [
      ["quote_no", meta.quoteNo, "date", meta.date, "customer", meta.customerName],
      [],
      ["#", "sku", "name", "quantity", "unit", "unit_price", "line_total"],
      ...quote.lines.map((l, i) => [i + 1, l.sku, l.name, l.quantity, l.unit, (l.unitPriceSatang / 100).toFixed(2), (l.lineTotalSatang / 100).toFixed(2)]),
      [],
      ["subtotal", (quote.subtotalSatang / 100).toFixed(2)],
      [`vat_${formatVatRate(settings.vatRateBps)}`, (quote.vatSatang / 100).toFixed(2)],
      ["grand_total", (quote.grandTotalSatang / 100).toFixed(2)],
    ];
    // BOM so Excel opens Thai text as UTF-8.
    const blob = new Blob(["﻿" + rows.map((r) => r.map(csvEscape).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${meta.quoteNo || "quotation"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <div className="no-print mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-navy">Thai Quotation Copilot</h1>
            <p className="text-sm text-slate-600">
              แปะข้อความลูกค้า แล้วได้ร่างใบเสนอราคาจากแคตตาล็อกและราคาจริงของคุณ · ราคาทุกบรรทัดมาจากแคตตาล็อกเท่านั้น
            </p>
          </div>
          <ModeSwitch value={mode} onChange={changeMode} availability={availability} />
        </header>

        <Step
          n={1}
          title="แคตตาล็อกสินค้าและราคา (CSV)"
          aside={
            catalog && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-800">
                <CheckIcon />
                {catalogLabel} · {catalog.length.toLocaleString("th-TH")} รายการ
              </span>
            )
          }
        >
          <div className="space-y-3 px-5 py-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex min-h-10 cursor-pointer items-center rounded-md bg-navy px-3 font-medium text-white hover:bg-navy/90 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent sm:min-h-9">
                อัปโหลด CSV
                <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
              </label>
              <span className="text-slate-500">หรือใช้ตัวอย่าง:</span>
              {(Object.keys(SAMPLE_CATALOGS) as SampleCatalog[]).map((name) => (
                <button key={name} type="button" onClick={() => loadSampleCatalog(name)} className="min-h-10 rounded-md border border-slate-300 px-3 hover:bg-slate-50 sm:min-h-9">
                  {SAMPLE_CATALOGS[name]}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              คอลัมน์: <code>sku, name, unit, unit_price</code> (จำเป็น) · <code>name_en, aliases, category</code> (ไม่บังคับ) · คั่นชื่อเรียกอื่นด้วย <code>|</code> ·
              ไฟล์อยู่ในเบราว์เซอร์นี้เท่านั้น ไม่ถูกอัปโหลดหรือบันทึกที่เซิร์ฟเวอร์ ·{" "}
              <a href="/samples/catalog-construction-th.csv" download className="text-accent hover:underline">
                ดาวน์โหลดไฟล์ตัวอย่าง
              </a>
            </p>
            {importErrors.length > 0 && (
              <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-900" role="alert">
                <p className="font-medium">นำเข้าไม่สำเร็จ แก้ไฟล์ตามนี้แล้วอัปโหลดใหม่ ({importErrors.length} จุด)</p>
                <ul className="mt-1 max-h-48 space-y-0.5 overflow-auto text-xs">
                  {importErrors.map((e, i) => (
                    <li key={i}>
                      {e.row > 0 && <b>แถว {e.row}{e.column ? ` · ${e.column}` : ""}: </b>}
                      {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {importWarnings.length > 0 && (
              <ul className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                {importWarnings.map((w, i) => (
                  <li key={i}>
                    แถว {w.row}: {w.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Step>

        <Step n={2} title="ข้อความจากลูกค้า (ไทย / English)">
          <div className="space-y-3 px-5 py-4">
            <div className="flex flex-wrap gap-1.5 text-xs">
              <span className="py-1 text-slate-500">ตัวอย่าง:</span>
              {SAMPLE_INQUIRIES.map((s) => (
                <button key={s.file} type="button" onClick={() => loadSampleInquiry(s)} className="min-h-10 rounded-full border border-slate-300 px-3 hover:bg-slate-50 sm:min-h-8">
                  {s.label}
                </button>
              ))}
            </div>
            <textarea
              value={inquiry}
              onChange={(e) => setInquiry(e.target.value)}
              rows={7}
              aria-label="ข้อความจากลูกค้า"
              placeholder={"เช่น\nขอราคาท่อฟ้า 4 หุน 50 เส้น ข้องอ 30 ตัว\nbreaker 20A 6 ตัว"}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-relaxed outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!catalog || !inquiry.trim() || busy}
                onClick={analyze}
                className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "กำลังวิเคราะห์…" : "สร้างร่างใบเสนอราคา"}
              </button>
              {!catalog && <span className="text-sm text-slate-500">โหลดแคตตาล็อกก่อน</span>}
              <span role="status" aria-live="polite" className="text-sm text-slate-600">
                {busy ? "กำลังวิเคราะห์ข้อความ…" : draft ? `สร้างร่างแล้ว ${draft.lines.length} บรรทัด` : ""}
              </span>
              {error && (
                <span role="alert" className="text-sm text-rose-700">
                  {error}
                </span>
              )}
            </div>
          </div>
        </Step>

        {draft && catalog && totals && approval && (
          <Step
            n={3}
            title="ตรวจและแก้ไขร่าง"
            aside={
              <span className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                {engine?.mode === "ai" ? `สร้างด้วย AI · ${engine.model}` : "สร้างด้วยโหมดไม่ใช้ AI"} · คนเป็นผู้ตัดสินทุกบรรทัด
                {engine && engine.mode !== mode && (availability?.aiAvailable || mode === "offline") && (
                  <button
                    type="button"
                    onClick={analyze}
                    disabled={busy}
                    className="min-h-8 rounded-md border border-accent/40 px-2.5 text-accent hover:bg-cyan-50 disabled:opacity-40"
                  >
                    สร้างใหม่ด้วย{mode === "ai" ? " AI" : "โหมดไม่ใช้ AI"}
                  </button>
                )}
              </span>
            }
          >
            {engine?.warning && <p className="border-b border-amber-100 bg-amber-50 px-5 py-2 text-sm text-amber-900">{engine.warning}</p>}
            <ReviewTable
              lines={draft.lines}
              lineTotals={totals.lineTotals}
              catalog={catalog}
              onChoose={(id, item) => updateDraft(chooseItem(draft, id, item))}
              onQuantity={(id, q) => updateDraft(setQuantity(draft, id, q))}
              onAcknowledgeUnit={(id) => updateDraft(acknowledgeUnit(draft, id))}
              onRemove={(id) => updateDraft(removeLine(draft, id))}
            />
            <div className="grid gap-5 border-t border-slate-100 px-5 py-4 md:grid-cols-[1fr_auto]">
              <div className="space-y-4">
                <div className="max-w-md">
                  <p className="mb-1 text-xs font-medium text-slate-600">เพิ่มรายการที่ลูกค้าไม่ได้พูดถึง (เช่น ค่าขนส่ง)</p>
                  <CatalogSearch
                    catalog={catalog}
                    onPick={(item) => updateDraft(addLine(draft, item, 1))}
                    placeholder="ค้นหาเพื่อเพิ่มบรรทัด…"
                    label="เพิ่มรายการจากแคตตาล็อก"
                  />
                </div>
                {questions.length > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-amber-950">ต้องถามลูกค้าเพิ่ม ({questions.length})</p>
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(questions.map((q, i) => `${i + 1}. ${q}`).join("\n"));
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1500);
                        }}
                        className="min-h-9 rounded-md border border-amber-300 bg-white px-2.5 text-xs text-amber-900 hover:bg-amber-100 sm:min-h-7"
                      >
                        {copied ? "คัดลอกแล้ว" : "คัดลอกข้อความ"}
                      </button>
                    </div>
                    <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-amber-950">
                      {questions.map((q) => (
                        <li key={q}>{q}</li>
                      ))}
                    </ol>
                  </div>
                )}
                {draft.ignored.length > 0 && (
                  <details className="text-xs text-slate-600">
                    <summary className="cursor-pointer">ข้อความที่ไม่ได้นำมาเป็นรายการสินค้า ({draft.ignored.length})</summary>
                    <ul className="mt-1 list-disc pl-5">
                      {draft.ignored.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>

              <div className="min-w-72 space-y-3">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <label className="flex items-center gap-1.5">
                    VAT
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={settings.vatRateBps / 100}
                      onChange={(e) => updateSettings({ ...settings, vatRateBps: Math.max(0, Math.round(Number(e.target.value) * 100)) })}
                      className="num h-9 w-16 rounded-md border border-slate-300 px-2 text-right"
                    />
                    %
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={settings.pricesIncludeVat}
                      onChange={(e) => updateSettings({ ...settings, pricesIncludeVat: e.target.checked })}
                    />
                    ราคาในแคตตาล็อกรวม VAT แล้ว
                  </label>
                </div>
                <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
                  <dt className="text-slate-600">มูลค่าก่อนภาษี</dt>
                  <dd className="num text-right">{formatAmount(totals.subtotalSatang)}</dd>
                  <dt className="text-slate-600">VAT {formatVatRate(settings.vatRateBps)}</dt>
                  <dd className="num text-right">{formatAmount(totals.vatSatang)}</dd>
                  <dt className="border-t border-slate-200 pt-1 font-semibold">รวมทั้งสิ้น</dt>
                  <dd className="num border-t border-slate-200 pt-1 text-right text-lg font-bold text-navy">{formatTHB(totals.grandTotalSatang)}</dd>
                </dl>
              </div>
            </div>
          </Step>
        )}

        {draft && catalog && approval && (
          <Step n={4} title="ข้อมูลเอกสาร อนุมัติ และส่งออก">
            <div className="grid gap-5 px-5 py-4 text-sm md:grid-cols-2">
              <div className="grid gap-2">
                {(
                  [
                    ["quoteNo", "เลขที่ใบเสนอราคา"],
                    ["customerName", "ชื่อลูกค้า"],
                    ["sellerName", "ชื่อบริษัทผู้ขาย"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="grid gap-0.5">
                    <span className="text-xs text-slate-600">{label}</span>
                    <input value={meta[key]} onChange={(e) => setMeta({ ...meta, [key]: e.target.value })} className="h-10 rounded-md border border-slate-300 px-3" />
                  </label>
                ))}
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-0.5">
                    <span className="text-xs text-slate-600">วันที่</span>
                    <input type="date" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} className="h-10 rounded-md border border-slate-300 px-3" />
                  </label>
                  <label className="grid gap-0.5">
                    <span className="text-xs text-slate-600">ยืนราคา (วัน)</span>
                    <input
                      type="number"
                      min={1}
                      value={meta.validDays}
                      onChange={(e) => setMeta({ ...meta, validDays: Math.max(1, Number(e.target.value) || 1) })}
                      className="num h-10 rounded-md border border-slate-300 px-3"
                    />
                  </label>
                </div>
              </div>
              <div className="grid gap-2">
                {(
                  [
                    ["customerDetails", "ที่อยู่ / ผู้ติดต่อของลูกค้า"],
                    ["sellerDetails", "ที่อยู่ / เลขผู้เสียภาษีของผู้ขาย"],
                    ["notes", "หมายเหตุ (เงื่อนไขชำระเงิน การส่งของ ฯลฯ)"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="grid gap-0.5">
                    <span className="text-xs text-slate-600">{label}</span>
                    <textarea rows={2} value={meta[key]} onChange={(e) => setMeta({ ...meta, [key]: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2" />
                  </label>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-100 px-5 py-4 text-sm">
              {!approval.ok ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="font-medium text-slate-800">ยังอนุมัติไม่ได้ แก้ให้ครบก่อน:</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-700">
                    {approval.blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              ) : approved ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-2 flex items-center gap-1.5 font-medium text-emerald-800">
                    <CheckIcon />
                    อนุมัติแล้ว ส่งออกได้
                  </span>
                  <button type="button" onClick={() => window.print()} className="rounded-md bg-navy px-4 py-2 font-semibold text-white hover:bg-navy/90">
                    พิมพ์ / บันทึกเป็น PDF
                  </button>
                  <button type="button" onClick={downloadCsv} className="rounded-md border border-slate-300 px-4 py-2 hover:bg-slate-50">
                    ดาวน์โหลด CSV
                  </button>
                  <button type="button" onClick={revokeApproval} className="text-xs text-slate-500 hover:underline">
                    ยกเลิกการอนุมัติ
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
                    ฉันตรวจรายการ จำนวน และราคาทุกบรรทัดแล้ว
                  </label>
                  <button
                    type="button"
                    disabled={!reviewed}
                    onClick={() => setApproved(true)}
                    className="rounded-md bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    อนุมัติใบเสนอราคา
                  </button>
                  <span className="text-xs text-slate-500">ส่งออกได้หลังอนุมัติเท่านั้น · ระบบไม่ส่งถึงลูกค้าเอง</span>
                </div>
              )}
            </div>
          </Step>
        )}

        {quote && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-600">ตัวอย่างเอกสาร</h2>
            <QuotationDocument quote={quote} meta={meta} />
          </section>
        )}

        <footer className="pt-4 text-center text-xs text-slate-500">
          Open source (MIT) · ข้อมูลตัวอย่างทั้งหมดเป็นข้อมูลสมมติ · ตรวจสอบเอกสารทุกครั้งก่อนส่งให้ลูกค้า
        </footer>
      </div>

      {quote && (
        <div className="print-only">
          <QuotationDocument quote={quote} meta={meta} />
        </div>
      )}
    </>
  );
}
