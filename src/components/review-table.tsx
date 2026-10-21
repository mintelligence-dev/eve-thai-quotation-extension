"use client";

import { useDeferredValue, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  findCandidates,
  formatAmount,
  type CatalogItem,
  type DraftIssue,
  type DraftLine,
  type MatchStatus,
} from "@/lib/quotation";
import { CheckIcon, ChevronIcon, CrossIcon } from "./icons";

const STATUS: Record<MatchStatus, { label: string; className: string }> = {
  matched: { label: "จับคู่แล้ว", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  ambiguous: { label: "ต้องเลือก", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  not_found: { label: "ไม่พบในแคตตาล็อก", className: "bg-rose-50 text-rose-800 ring-rose-200" },
};

function issueText(issue: DraftIssue): string {
  switch (issue.kind) {
    case "missing_quantity":
      return "ลูกค้าไม่ได้ระบุจำนวน";
    case "unit_mismatch":
      return `ลูกค้าขอเป็น "${issue.requested}" แต่ขายเป็น "${issue.catalog}"`;
    case "ambiguous":
      return "ตรงได้หลายรายการ เลือกให้ถูกรุ่น";
    case "not_found":
      return "ไม่มีรายการที่ตรง เลือกเองหรือลบบรรทัดนี้";
    case "rejected_sku":
      return `AI เสนอรหัส ${issue.sku} ที่ไม่อยู่ในรายการที่ค้นได้ จึงไม่ใช้`;
  }
}

const inputBase =
  "rounded-md border bg-white outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25";

/** Search box over the whole catalog; used to add a line. */
export function CatalogSearch({
  catalog,
  onPick,
  placeholder = "ค้นหาสินค้าในแคตตาล็อก…",
  label,
}: {
  catalog: CatalogItem[];
  onPick: (item: CatalogItem) => void;
  placeholder?: string;
  label: string;
}) {
  const [query, setQuery] = useState("");
  const bySku = useMemo(() => new Map(catalog.map((i) => [i.sku, i])), [catalog]);
  // Scoring the whole catalog per keystroke is the slow part; let typing stay responsive.
  const deferred = useDeferredValue(query);
  const results = useMemo(
    () =>
      deferred.trim()
        ? findCandidates(deferred, catalog, { limit: 6, minScore: 0.15 }).map((c) => bySku.get(c.sku)!)
        : [],
    [deferred, catalog, bySku],
  );
  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={`${inputBase} h-10 w-full border-slate-300 px-3 text-sm`}
      />
      {results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full min-w-72 overflow-auto rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-[0_8px_24px_-6px_rgb(15_27_45/0.18)]">
          {results.map((item) => (
            <li key={item.sku}>
              <OptionRow
                item={item}
                selected={false}
                onPick={() => {
                  onPick(item);
                  setQuery("");
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OptionRow({ item, selected, onPick }: { item: CatalogItem; selected: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onPick}
      className="flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left hover:bg-slate-50 focus-visible:bg-cyan-50 focus-visible:outline-none"
    >
      <span className="min-w-0 flex-1">
        <span className="block leading-snug">{item.name}</span>
        <span className="mt-0.5 block text-xs text-slate-600">
          {item.sku} · {item.unit} · <span className="num">฿{formatAmount(item.unitPriceSatang)}</span>
        </span>
      </span>
      {selected && <CheckIcon className="size-4 shrink-0 text-accent" />}
    </button>
  );
}

/**
 * Picks the catalog item for one line: suggestions first, with a search over the whole
 * catalog inside the same popover. Same height as the quantity field so the row aligns.
 */
function ItemPicker({
  line,
  item,
  catalog,
  bySku,
  label,
  onChoose,
}: {
  line: DraftLine;
  item: CatalogItem | undefined;
  catalog: CatalogItem[];
  bySku: Map<string, CatalogItem>;
  label: string;
  onChoose: (item: CatalogItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [popStyle, setPopStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  // The table scrolls horizontally, which would clip an absolutely positioned popover,
  // so the popover is fixed to the viewport and follows the trigger. Layout effect: placed before paint.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(480, window.innerWidth - 32);
      const left = Math.max(16, Math.min(r.left, window.innerWidth - width - 16));
      const below = window.innerHeight - r.bottom;
      setPopStyle(
        below >= 340 || below >= r.top
          ? { position: "fixed", top: r.bottom + 4, left, width, maxHeight: below - 16 }
          : { position: "fixed", bottom: window.innerHeight - r.top + 4, left, width, maxHeight: r.top - 16 },
      );
    };
    place();
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  };

  const deferred = useDeferredValue(query);
  const searching = deferred.trim().length > 0;
  const options = useMemo(
    () =>
      (searching
        ? findCandidates(deferred, catalog, { limit: 8, minScore: 0.15 }).map((c) => bySku.get(c.sku))
        : line.candidates.map((c) => bySku.get(c.sku))
      ).filter((x): x is CatalogItem => Boolean(x)),
    [searching, deferred, catalog, bySku, line.candidates],
  );

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={item ? `${label}: ${item.name}` : `${label}: ยังไม่ได้เลือก`}
        onClick={() => setOpen((o) => !o)}
        className={`${inputBase} flex h-10 w-full items-center gap-2 px-3 text-left text-sm ${
          item ? "border-slate-300 hover:border-slate-400" : "border-amber-400 bg-amber-50/40 hover:border-amber-500"
        }`}
      >
        {item ? (
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="truncate">{item.name}</span>
            <span className="shrink-0 text-xs text-slate-600">{item.sku}</span>
          </span>
        ) : (
          <span className="flex-1 text-amber-900">เลือกสินค้า…</span>
        )}
        <ChevronIcon />
      </button>

      {open && (
        <div
          style={popStyle}
          className="z-30 flex flex-col rounded-lg border border-slate-200 bg-white p-1.5 shadow-[0_12px_32px_-8px_rgb(15_27_45/0.22)]"
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                rootRef.current?.querySelector<HTMLButtonElement>('[role="option"]')?.focus();
              }
            }}
            placeholder="ค้นหาสินค้าอื่นในแคตตาล็อก…"
            aria-label="ค้นหาสินค้าในแคตตาล็อก"
            className={`${inputBase} h-9 w-full border-slate-300 px-2.5 text-sm`}
          />
          <p className="px-2.5 pt-2 pb-1 text-xs font-medium text-slate-600">
            {searching ? "ผลการค้นหา" : line.candidates.length ? "ที่ระบบแนะนำ" : "ไม่มีรายการแนะนำ ลองค้นหา"}
          </p>
          <div id={listId} role="listbox" aria-label="สินค้า" className="max-h-72 min-h-0 overflow-auto">
            {options.map((opt) => (
              <OptionRow
                key={opt.sku}
                item={opt}
                selected={opt.sku === item?.sku}
                onPick={() => {
                  onChoose(opt);
                  close();
                }}
              />
            ))}
            {searching && options.length === 0 && (
              <p className="px-2.5 py-3 text-sm text-slate-600">ไม่พบ &quot;{query}&quot; ในแคตตาล็อก</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  lines: DraftLine[];
  lineTotals: number[];
  catalog: CatalogItem[];
  onChoose: (lineId: string, item: CatalogItem) => void;
  onQuantity: (lineId: string, quantity: number | null) => void;
  onAcknowledgeUnit: (lineId: string) => void;
  onRemove: (lineId: string) => void;
}

/** Text cells share the control height so every column lines up on the first row. */
const cellText = "flex h-10 items-center";

function StatusBlock({ line }: { line: DraftLine }) {
  const status = STATUS[line.status];
  return (
    <>
      <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-xs ring-1 ${status.className}`}>{status.label}</span>
      {line.issues.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-amber-800">
          {line.issues.map((issue, k) => (
            <li key={k}>• {issueText(issue)}</li>
          ))}
        </ul>
      )}
    </>
  );
}

function QuantityInput({ line, index, onQuantity }: { line: DraftLine; index: number; onQuantity: Props["onQuantity"] }) {
  return (
    <input
      type="number"
      min={0}
      step="any"
      inputMode="decimal"
      value={line.quantity ?? ""}
      onChange={(e) => onQuantity(line.id, e.target.value === "" ? null : Number(e.target.value))}
      className={`${inputBase} num no-spin h-10 w-full px-3 text-right ${
        line.quantity ? "border-slate-300" : "border-amber-400 bg-amber-50/40"
      }`}
      aria-label={`จำนวน บรรทัด ${index + 1}`}
    />
  );
}

function RemoveButton({ line, index, onRemove }: { line: DraftLine; index: number; onRemove: Props["onRemove"] }) {
  return (
    <button
      type="button"
      onClick={() => onRemove(line.id)}
      className="flex size-10 shrink-0 items-center justify-center rounded-md text-slate-500 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-accent"
      aria-label={`ลบบรรทัด ${index + 1}`}
      title="ลบบรรทัด"
    >
      <CrossIcon />
    </button>
  );
}

function UnitConfirm({ line, item, onAcknowledgeUnit }: { line: DraftLine; item?: CatalogItem; onAcknowledgeUnit: Props["onAcknowledgeUnit"] }) {
  if (!line.issues.some((x) => x.kind === "unit_mismatch")) return null;
  return (
    <button
      type="button"
      onClick={() => onAcknowledgeUnit(line.id)}
      className="mt-2 min-h-10 rounded-md border border-amber-300 bg-amber-50 px-3 text-xs text-amber-900 hover:bg-amber-100 lg:min-h-8"
    >
      ยืนยันจำนวนในหน่วย &quot;{item?.unit}&quot; แล้ว
    </button>
  );
}

/**
 * Review grid: a fixed-layout table from lg up; stacked cards below that (phones and
 * tablets) so item, quantity and money stay visible without sideways scrolling.
 */
export function ReviewTable({ lines, lineTotals, catalog, onChoose, onQuantity, onAcknowledgeUnit, onRemove }: Props) {
  const bySku = useMemo(() => new Map(catalog.map((i) => [i.sku, i])), [catalog]);

  if (lines.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-slate-600">ไม่มีรายการ เพิ่มสินค้าจากช่องค้นหาด้านล่าง</p>;
  }

  const rows = lines.map((line, i) => {
    const item = line.sku ? bySku.get(line.sku) : undefined;
    return {
      line,
      i,
      item,
      unit: item?.unit ?? line.request.unit ?? "-",
      price: item ? formatAmount(item.unitPriceSatang) : "-",
      total: item && line.quantity ? formatAmount(lineTotals[i]) : "-",
      picker: (
        <ItemPicker
          line={line}
          item={item}
          catalog={catalog}
          bySku={bySku}
          label={`สินค้า บรรทัด ${i + 1}`}
          onChoose={(picked) => onChoose(line.id, picked)}
        />
      ),
    };
  });

  return (
    <>
      <ul className="divide-y divide-slate-100 lg:hidden">
        {rows.map(({ line, i, item, unit, price, total, picker }) => (
          <li key={line.id} className="space-y-3 px-4 py-4">
            <div className="flex items-start gap-3">
              <span className="num pt-2.5 text-slate-600">{i + 1}</span>
              <div className="min-w-0 flex-1 pt-2">
                <p className="break-words">{line.request.text}</p>
                <StatusBlock line={line} />
              </div>
              <RemoveButton line={line} index={i} onRemove={onRemove} />
            </div>
            <div>
              {picker}
              <UnitConfirm line={line} item={item} onAcknowledgeUnit={onAcknowledgeUnit} />
            </div>
            <div className="flex items-center gap-3">
              <div className="w-28 shrink-0">
                <QuantityInput line={line} index={i} onQuantity={onQuantity} />
              </div>
              <span className="text-slate-700">{unit}</span>
              <dl className="ml-auto text-right">
                <dt className="sr-only">ราคาต่อหน่วย</dt>
                <dd className="num text-xs text-slate-600">@ {price}</dd>
                <dt className="sr-only">รวม</dt>
                <dd className="num font-semibold">{total}</dd>
              </dl>
            </div>
          </li>
        ))}
      </ul>

      {/* `relative` so absolutely positioned descendants (sr-only labels) are clipped by the scroller. */}
      <div className="relative hidden overflow-x-auto lg:block">
        {/* Fixed layout: column widths are honoured, so the quantity field can never be squeezed shut. */}
        <table className="w-full table-fixed text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold whitespace-nowrap text-slate-600">
            <tr>
              <th className="w-10 px-3 py-2">#</th>
              <th className="w-[22%] px-3 py-2">ลูกค้าขอ</th>
              <th className="px-3 py-2">สินค้าในแคตตาล็อก</th>
              <th className="w-24 px-3 py-2 text-right">จำนวน</th>
              <th className="w-20 px-3 py-2">หน่วย</th>
              <th className="w-24 px-3 py-2 text-right">ราคา/หน่วย</th>
              <th className="w-28 px-3 py-2 text-right">รวม</th>
              <th className="w-14 px-2 py-2">
                <span className="sr-only">ลบ</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ line, i, item, unit, price, total, picker }) => (
              <tr key={line.id} className="align-top">
                <td className="px-3 py-3 text-slate-600">
                  <span className={cellText}>{i + 1}</span>
                </td>
                <td className="px-3 py-3">
                  <p className="pt-2.5 break-words">{line.request.text}</p>
                  <StatusBlock line={line} />
                </td>
                <td className="px-3 py-3">
                  {picker}
                  <UnitConfirm line={line} item={item} onAcknowledgeUnit={onAcknowledgeUnit} />
                </td>
                <td className="px-3 py-3">
                  <QuantityInput line={line} index={i} onQuantity={onQuantity} />
                </td>
                <td className="px-3 py-3 text-slate-700">
                  <span className={cellText}>{unit}</span>
                </td>
                <td className="num px-3 py-3 text-slate-700">
                  <span className={`${cellText} justify-end`}>{price}</span>
                </td>
                <td className="num px-3 py-3 font-medium">
                  <span className={`${cellText} justify-end`}>{total}</span>
                </td>
                <td className="px-2 py-3">
                  <RemoveButton line={line} index={i} onRemove={onRemove} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
