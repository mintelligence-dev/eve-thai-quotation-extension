"use client";

import { useMemo, useState } from "react";
import {
  findCandidates,
  formatAmount,
  type CatalogItem,
  type DraftIssue,
  type DraftLine,
  type MatchStatus,
} from "@/lib/quotation";

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

/** Search box over the whole catalog; used to override a match or add a line. */
export function CatalogSearch({
  catalog,
  onPick,
  placeholder = "ค้นหาสินค้าในแคตตาล็อก…",
}: {
  catalog: CatalogItem[];
  onPick: (item: CatalogItem) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const bySku = useMemo(() => new Map(catalog.map((i) => [i.sku, i])), [catalog]);
  const results = query.trim()
    ? findCandidates(query, catalog, { limit: 6, minScore: 0.15 }).map((c) => bySku.get(c.sku)!)
    : [];
  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      {results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full min-w-72 overflow-auto rounded-md border border-slate-200 bg-white text-sm shadow-lg">
          {results.map((item) => (
            <li key={item.sku}>
              <button
                type="button"
                onClick={() => {
                  onPick(item);
                  setQuery("");
                }}
                className="flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left hover:bg-slate-50"
              >
                <span className="min-w-0">
                  <span className="block truncate">{item.name}</span>
                  <span className="text-xs text-slate-500">
                    {item.sku} · {item.unit}
                  </span>
                </span>
                <span className="num text-xs text-slate-600">฿{formatAmount(item.unitPriceSatang)}</span>
              </button>
            </li>
          ))}
        </ul>
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

export function ReviewTable({ lines, lineTotals, catalog, onChoose, onQuantity, onAcknowledgeUnit, onRemove }: Props) {
  const bySku = useMemo(() => new Map(catalog.map((i) => [i.sku, i])), [catalog]);
  const [searchingLine, setSearchingLine] = useState<string | null>(null);

  if (lines.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-slate-500">ไม่มีรายการ เพิ่มสินค้าจากช่องค้นหาด้านล่าง</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
          <tr>
            <th className="w-8 px-3 py-2">#</th>
            <th className="w-[26%] px-3 py-2">ลูกค้าขอ</th>
            <th className="px-3 py-2">สินค้าในแคตตาล็อก</th>
            <th className="w-24 px-3 py-2 text-right">จำนวน</th>
            <th className="w-16 px-3 py-2">หน่วย</th>
            <th className="w-24 px-3 py-2 text-right">ราคา/หน่วย</th>
            <th className="w-28 px-3 py-2 text-right">รวม</th>
            <th className="w-10 px-2 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lines.map((line, i) => {
            const item = line.sku ? bySku.get(line.sku) : undefined;
            const status = STATUS[line.status];
            const hasUnitIssue = line.issues.some((x) => x.kind === "unit_mismatch");
            return (
              <tr key={line.id} className="align-top">
                <td className="px-3 py-3 text-slate-500">{i + 1}</td>
                <td className="px-3 py-3">
                  <p className="break-words">{line.request.text}</p>
                  <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-xs ring-1 ${status.className}`}>
                    {status.label}
                  </span>
                  {line.issues.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-amber-800">
                      {line.issues.map((issue, k) => (
                        <li key={k}>• {issueText(issue)}</li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="px-3 py-3">
                  <select
                    value={line.sku ?? ""}
                    onChange={(e) => {
                      const picked = bySku.get(e.target.value);
                      if (picked) onChoose(line.id, picked);
                    }}
                    className={`w-full rounded-md border bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-accent/20 ${
                      line.sku ? "border-slate-300" : "border-amber-400"
                    }`}
                  >
                    <option value="" disabled>
                      — เลือกสินค้า —
                    </option>
                    {item && !line.candidates.some((c) => c.sku === item.sku) && (
                      <option value={item.sku}>
                        {item.name} ({item.sku})
                      </option>
                    )}
                    {line.candidates.map((c) => {
                      const cand = bySku.get(c.sku);
                      return cand ? (
                        <option key={c.sku} value={c.sku}>
                          {cand.name} ({c.sku})
                        </option>
                      ) : null;
                    })}
                  </select>
                  {searchingLine === line.id ? (
                    <div className="mt-1.5">
                      <CatalogSearch
                        catalog={catalog}
                        onPick={(picked) => {
                          onChoose(line.id, picked);
                          setSearchingLine(null);
                        }}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSearchingLine(line.id)}
                      className="mt-1 text-xs text-accent hover:underline"
                    >
                      ค้นหาจากทั้งแคตตาล็อก
                    </button>
                  )}
                  {hasUnitIssue && (
                    <button
                      type="button"
                      onClick={() => onAcknowledgeUnit(line.id)}
                      className="mt-1 block rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-900 hover:bg-amber-100"
                    >
                      ยืนยันจำนวนในหน่วย &quot;{item?.unit}&quot; แล้ว
                    </button>
                  )}
                </td>
                <td className="px-3 py-3">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    value={line.quantity ?? ""}
                    onChange={(e) => onQuantity(line.id, e.target.value === "" ? null : Number(e.target.value))}
                    className={`num w-full rounded-md border bg-white px-2 py-1.5 text-right outline-none focus:ring-2 focus:ring-accent/20 ${
                      line.quantity ? "border-slate-300" : "border-amber-400"
                    }`}
                    aria-label={`จำนวน บรรทัด ${i + 1}`}
                  />
                </td>
                <td className="px-3 py-3 pt-4 text-slate-700">{item?.unit ?? line.request.unit ?? "-"}</td>
                <td className="num px-3 py-3 pt-4 text-right text-slate-700">
                  {item ? formatAmount(item.unitPriceSatang) : "-"}
                </td>
                <td className="num px-3 py-3 pt-4 text-right font-medium">
                  {item && line.quantity ? formatAmount(lineTotals[i]) : "-"}
                </td>
                <td className="px-2 py-3 pt-3.5">
                  <button
                    type="button"
                    onClick={() => onRemove(line.id)}
                    className="rounded px-1.5 text-slate-500 hover:text-rose-700"
                    aria-label={`ลบบรรทัด ${i + 1}`}
                    title="ลบบรรทัด"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
