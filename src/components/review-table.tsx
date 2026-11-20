"use client";

import { useDeferredValue, useId, useMemo, useState } from "react";
import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  findCandidates,
  formatAmount,
  type CatalogItem,
  type DraftIssue,
  type DraftLine,
  type MatchStatus,
} from "@eve-thai-quotation-extension/core";
import { cn } from "@/lib/utils";

const STATUS: Record<MatchStatus, { label: string; variant: "success" | "warning" | "destructive" }> = {
  matched: { label: "จับคู่แล้ว", variant: "success" },
  ambiguous: { label: "ต้องเลือก", variant: "warning" },
  not_found: { label: "ไม่พบในแคตตาล็อก", variant: "destructive" },
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
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} aria-label={label} />
      {results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full min-w-72 overflow-auto rounded-xl border bg-popover p-1 text-sm text-popover-foreground shadow-lg shadow-brand/5">
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
      className="flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
    >
      <span className="min-w-0 flex-1">
        <span className="block leading-snug">{item.name}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {item.sku} · {item.unit} · <span className="num">฿{formatAmount(item.unitPriceSatang)}</span>
        </span>
      </span>
      {selected && <CheckIcon className="size-4 shrink-0 text-brand" />}
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
  const listId = useId();

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
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
    // The popover is rendered in a portal, so the horizontally scrolling table cannot clip it.
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        aria-label={item ? `${label}: ${item.name}` : `${label}: ยังไม่ได้เลือก`}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-md border bg-transparent px-3 text-left text-sm shadow-xs outline-none transition-[color,box-shadow,border-color] duration-200 dark:bg-input/30",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          item ? "border-input hover:border-ring/60" : "border-warning/60 bg-warning/5 hover:border-warning",
        )}
      >
        {item ? (
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="truncate">{item.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{item.sku}</span>
          </span>
        ) : (
          <span className="flex-1 text-warning">เลือกสินค้า…</span>
        )}
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>

      <PopoverContent
        align="start"
        collisionPadding={16}
        className="flex max-h-(--radix-popover-content-available-height) w-[min(30rem,calc(100vw-2rem))] flex-col p-1.5"
      >
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              document.getElementById(listId)?.querySelector<HTMLButtonElement>('[role="option"]')?.focus();
            }
          }}
          placeholder="ค้นหาสินค้าอื่นในแคตตาล็อก…"
          aria-label="ค้นหาสินค้าในแคตตาล็อก"
        />
        <p className="px-2.5 pt-2 pb-1 text-xs font-medium text-muted-foreground">
          {searching ? "ผลการค้นหา" : line.candidates.length ? "ที่ระบบแนะนำ" : "ไม่มีรายการแนะนำ ลองค้นหา"}
        </p>
        <div id={listId} role="listbox" aria-label="สินค้า" className="max-h-72 min-h-0 overflow-auto text-sm">
          {options.map((opt) => (
            <OptionRow
              key={opt.sku}
              item={opt}
              selected={opt.sku === item?.sku}
              onPick={() => {
                onChoose(opt);
                onOpenChange(false);
              }}
            />
          ))}
          {searching && options.length === 0 && (
            <p className="px-2.5 py-3 text-sm text-muted-foreground">ไม่พบ &quot;{query}&quot; ในแคตตาล็อก</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
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
const cellText = "flex h-9 items-center";

function StatusBlock({ line }: { line: DraftLine }) {
  const status = STATUS[line.status];
  return (
    <>
      <Badge variant={status.variant} className="mt-1">
        {status.label}
      </Badge>
      {line.issues.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-warning">
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
    <NumberInput
      value={line.quantity}
      onValueChange={(q) => onQuantity(line.id, q)}
      decimals={3}
      min={0}
      // A missing quantity is something to fill in, not an error: warning color instead of aria-invalid.
      className={line.quantity ? undefined : "[&_input]:border-warning/60 [&_input]:bg-warning/5"}
      aria-label={`จำนวน บรรทัด ${index + 1}`}
    />
  );
}

function RemoveButton({ line, index, onRemove }: { line: DraftLine; index: number; onRemove: Props["onRemove"] }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => onRemove(line.id)}
      className="shrink-0 text-muted-foreground hover:text-destructive"
      aria-label={`ลบบรรทัด ${index + 1}`}
      title="ลบบรรทัด"
    >
      <XIcon />
    </Button>
  );
}

function UnitConfirm({ line, item, onAcknowledgeUnit }: { line: DraftLine; item?: CatalogItem; onAcknowledgeUnit: Props["onAcknowledgeUnit"] }) {
  if (!line.issues.some((x) => x.kind === "unit_mismatch")) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => onAcknowledgeUnit(line.id)}
      className="mt-2 border-warning/40 bg-warning/5 text-warning hover:bg-warning/10 hover:text-warning"
    >
      ยืนยันจำนวนในหน่วย &quot;{item?.unit}&quot; แล้ว
    </Button>
  );
}

/**
 * Review grid: a fixed-layout table from lg up; stacked cards below that (phones and
 * tablets) so item, quantity and money stay visible without sideways scrolling.
 */
export function ReviewTable({ lines, lineTotals, catalog, onChoose, onQuantity, onAcknowledgeUnit, onRemove }: Props) {
  const bySku = useMemo(() => new Map(catalog.map((i) => [i.sku, i])), [catalog]);

  if (lines.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">ไม่มีรายการ เพิ่มสินค้าจากช่องค้นหาด้านล่าง</p>;
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
      <ul className="divide-y divide-border lg:hidden">
        {rows.map(({ line, i, item, unit, price, total, picker }) => (
          <li key={line.id} className="space-y-3 px-4 py-4">
            <div className="flex items-start gap-3">
              <span className="num pt-2 text-muted-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1 pt-1.5">
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
              <span>{unit}</span>
              <dl className="ml-auto text-right">
                <dt className="sr-only">ราคาต่อหน่วย</dt>
                <dd className="num text-xs text-muted-foreground">@ {price}</dd>
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
          <thead className="bg-muted/60 text-left text-xs font-semibold whitespace-nowrap text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2">#</th>
              <th className="w-[22%] px-3 py-2">ลูกค้าขอ</th>
              <th className="px-3 py-2">สินค้าในแคตตาล็อก</th>
              <th className="w-28 px-3 py-2 text-right">จำนวน</th>
              <th className="w-20 px-3 py-2">หน่วย</th>
              <th className="w-24 px-3 py-2 text-right">ราคา/หน่วย</th>
              <th className="w-28 px-3 py-2 text-right">รวม</th>
              <th className="w-14 px-2 py-2">
                <span className="sr-only">ลบ</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(({ line, i, item, unit, price, total, picker }) => (
              <tr key={line.id} className="align-top">
                <td className="px-3 py-3 text-muted-foreground">
                  <span className={cellText}>{i + 1}</span>
                </td>
                <td className="px-3 py-3">
                  <p className="pt-2 break-words">{line.request.text}</p>
                  <StatusBlock line={line} />
                </td>
                <td className="px-3 py-3">
                  {picker}
                  <UnitConfirm line={line} item={item} onAcknowledgeUnit={onAcknowledgeUnit} />
                </td>
                <td className="px-3 py-3">
                  <QuantityInput line={line} index={i} onQuantity={onQuantity} />
                </td>
                <td className="px-3 py-3">
                  <span className={cellText}>{unit}</span>
                </td>
                <td className="num px-3 py-3">
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
