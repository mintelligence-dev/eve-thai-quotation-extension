import { bahtText, formatAmount, formatVatRate } from "@eve-thai-quotation-extension/core";
import type { IssuedQuotation } from "@eve-thai-quotation-extension/eve/desk";

const thaiDate = (iso: string) =>
  new Date(`${iso}T00:00:00+07:00`).toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

/** The printable quotation. The browser renders it, so Thai shaping and line breaks are correct. */
export function QuotationDocument({ issued }: { issued: IssuedQuotation }) {
  const quote = issued.quotation;
  const { settings } = quote;
  return (
    <article className="print-sheet mx-auto max-w-[210mm] bg-white p-10 font-doc text-[13.5px] leading-relaxed text-black shadow-sm ring-1 ring-slate-200">
      <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-4">
        <div className="min-w-0">
          <p className="text-lg font-bold">{issued.sellerName || "ชื่อบริษัทผู้ขาย"}</p>
          <p className="text-[12.5px] whitespace-pre-line">{issued.sellerDetails}</p>
        </div>
        <div className="shrink-0 text-right">
          <h1 className="text-2xl font-bold">ใบเสนอราคา</h1>
          <p className="text-[12px] tracking-[0.2em]">QUOTATION</p>
        </div>
      </header>

      <section className="mt-4 grid grid-cols-[1fr_auto] gap-6">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold">ลูกค้า / Customer</p>
          <p className="font-semibold">{issued.customerName || "-"}</p>
          <p className="text-[12.5px] whitespace-pre-line">{issued.customerDetails}</p>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 text-[12.5px]">
          <dt>เลขที่ / No.</dt>
          <dd className="text-right font-semibold">{issued.quoteNo}</dd>
          <dt>วันที่ / Date</dt>
          <dd className="text-right">{thaiDate(issued.date)}</dd>
          <dt>ยืนราคา / Valid</dt>
          <dd className="text-right">{issued.validDays} วัน</dd>
        </dl>
      </section>

      <table className="mt-5 w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-y border-black">
            <th className="py-1.5 pr-2 text-left font-semibold">#</th>
            <th className="py-1.5 pr-2 text-left font-semibold">รหัส</th>
            <th className="py-1.5 pr-2 text-left font-semibold">รายการ</th>
            <th className="py-1.5 pr-2 text-right font-semibold">จำนวน</th>
            <th className="py-1.5 pr-2 text-left font-semibold">หน่วย</th>
            <th className="py-1.5 pr-2 text-right font-semibold">ราคา/หน่วย</th>
            <th className="py-1.5 text-right font-semibold">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {quote.lines.map((l, i) => (
            <tr key={`${l.sku}-${i}`} className="border-b border-slate-300 align-top">
              <td className="py-1.5 pr-2">{i + 1}</td>
              <td className="py-1.5 pr-2 whitespace-nowrap">{l.sku}</td>
              <td className="py-1.5 pr-2">{l.name}</td>
              <td className="num py-1.5 pr-2 text-right">{l.quantity.toLocaleString("th-TH")}</td>
              <td className="py-1.5 pr-2">{l.unit}</td>
              <td className="num py-1.5 pr-2 text-right">{formatAmount(l.unitPriceSatang)}</td>
              <td className="num py-1.5 text-right">{formatAmount(l.lineTotalSatang)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-3 grid grid-cols-[1fr_auto] gap-6">
        <div className="min-w-0 text-[12.5px]">
          <p className="rounded bg-slate-100 px-2 py-1 font-semibold">({bahtText(quote.grandTotalSatang)})</p>
          {settings.pricesIncludeVat && <p className="mt-1">* ราคาสินค้ารวมภาษีมูลค่าเพิ่มแล้ว</p>}
          {issued.notes && <p className="mt-2 whitespace-pre-line">หมายเหตุ: {issued.notes}</p>}
        </div>
        <dl className="grid min-w-56 grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-[12.5px]">
          <dt>มูลค่าก่อนภาษี</dt>
          <dd className="num text-right">{formatAmount(quote.subtotalSatang)}</dd>
          <dt>ภาษีมูลค่าเพิ่ม {formatVatRate(settings.vatRateBps)}</dt>
          <dd className="num text-right">{formatAmount(quote.vatSatang)}</dd>
          <dt className="border-t border-black pt-1 font-bold">รวมทั้งสิ้น (บาท)</dt>
          <dd className="num border-t border-black pt-1 text-right font-bold">{formatAmount(quote.grandTotalSatang)}</dd>
        </dl>
      </section>

      <footer className="mt-16 grid grid-cols-3 gap-6 text-center text-[12px]">
        {["ผู้เสนอราคา", "ผู้อนุมัติ", "ลูกค้ายืนยันการสั่งซื้อ"].map((role) => (
          <div key={role}>
            <div className="mx-4 border-b border-dotted border-black pb-8" />
            <p className="mt-1">{role}</p>
            <p>วันที่ ____/____/______</p>
          </div>
        ))}
      </footer>
    </article>
  );
}

function csvEscape(value: string | number): string {
  const text = String(value);
  // A leading =, +, - or @ would run as a formula when the file is opened in a spreadsheet.
  const safe = typeof value === "string" && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function quotationCsv(issued: IssuedQuotation): string {
  const quote = issued.quotation;
  const baht = (satang: number) => (satang / 100).toFixed(2);
  const rows: (string | number)[][] = [
    ["quote_no", issued.quoteNo, "date", issued.date, "customer", issued.customerName],
    [],
    ["#", "sku", "name", "quantity", "unit", "unit_price", "line_total"],
    ...quote.lines.map((l, i) => [i + 1, l.sku, l.name, l.quantity, l.unit, baht(l.unitPriceSatang), baht(l.lineTotalSatang)]),
    [],
    ["subtotal", baht(quote.subtotalSatang)],
    [`vat_${formatVatRate(quote.settings.vatRateBps)}`, baht(quote.vatSatang)],
    ["grand_total", baht(quote.grandTotalSatang)],
  ];
  // BOM so Excel opens Thai text as UTF-8.
  return "﻿" + rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
}
