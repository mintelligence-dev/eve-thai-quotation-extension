import { DraftNotFoundError } from "@eve-thai-quotation-extension/eve/desk";
import type { Metadata } from "next";

import { desk } from "@/lib/desk";

import { QuotationDesk } from "./quotation-desk";

export const metadata: Metadata = { title: "ร่างใบเสนอราคา", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const draft = await desk.read(token);
    return <QuotationDesk token={token} initial={draft} />;
  } catch (error) {
    if (!(error instanceof DraftNotFoundError)) throw error;
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="font-heading text-xl font-semibold">ไม่พบร่างใบเสนอราคานี้</h1>
        <p className="text-muted-foreground text-sm">ลิงก์อาจไม่ถูกต้อง หรือหมดอายุแล้ว กรุณาสร้างร่างใหม่</p>
        <a className="text-primary text-sm underline underline-offset-4" href="/">
          สร้างร่างใหม่
        </a>
      </main>
    );
  }
}
