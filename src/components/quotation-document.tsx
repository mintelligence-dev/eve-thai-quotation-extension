import { bahtText, formatAmount, formatVatRate, type PricedQuotation } from "@/lib/quotation";

export interface QuotationMeta {
  quoteNo: string;
  /** ISO date (yyyy-mm-dd). */
  date: string;
  validDays: number;
  sellerName: string;
  sellerDetails: string;
  customerName: string;
  customerDetails: string;
  notes: string;
}

const thaiDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });

/** Printable quotation template. Rendered by the browser, so Thai shaping and line breaks are correct. */
export function QuotationDocument({ quote, meta }: { quote: PricedQuotation; meta: QuotationMeta }) {
  const { settings } = quote;
  return (
    <article className="print-sheet mx-auto max-w-[210mm] bg-white p-10 font-doc text-[13.5px] leading-relaxed text-black shadow-sm ring-1 ring-slate-200">
      <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-4">
        <div className="min-w-0">
          <p className="text-lg font-bold">{meta.sellerName || "ชื่อบริษัทผู้ขาย"}</p>
          <p className="whitespace-pre-line text-[12.5px]">{meta.sellerDetails}</p>
        </div>
        <div className="shrink-0 text-right">
          <h1 className="text-2xl font-bold">ใบเสนอราคา</h1>
          <p className="text-[12px] tracking-[0.2em]">QUOTATION</p>
        </div>
      </header>

      <section className="mt-4 grid grid-cols-[1fr_auto] gap-6">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold">ลูกค้า / Customer</p>
          <p className="font-semibold">{meta.customerName || "-"}</p>
          <p className="whitespace-pre-line text-[12.5px]">{meta.customerDetails}</p>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 text-[12.5px]">
          <dt>เลขที่ / No.</dt>
          <dd className="text-right font-semibold">{meta.quoteNo}</dd>
          <dt>วันที่ / Date</dt>
          <dd className="text-right">{thaiDate(meta.date)}</dd>
          <dt>ยืนราคา / Valid</dt>
          <dd className="text-right">{meta.validDays} วัน</dd>
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
          {meta.notes && <p className="mt-2 whitespace-pre-line">หมายเหตุ: {meta.notes}</p>}
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
