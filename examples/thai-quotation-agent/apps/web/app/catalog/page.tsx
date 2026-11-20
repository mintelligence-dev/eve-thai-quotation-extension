import type { Metadata } from "next";

import { adminState } from "@/lib/admin";
import { desk } from "@/lib/desk";

import { CatalogAdmin, SignIn } from "./catalog-admin";

export const metadata: Metadata = { title: "แคตตาล็อกของร้าน", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Page() {
  const state = await adminState();
  if (state === "locked") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="font-heading text-xl font-semibold">หน้านี้ถูกปิดไว้</h1>
        <p className="text-muted-foreground text-sm">
          ตั้งค่า <code>QUOTATION_ADMIN_PASSWORD</code> ในระบบที่ deploy ก่อน จึงจะแก้ไขแคตตาล็อกของร้านจากหน้าเว็บได้
        </p>
      </main>
    );
  }
  if (state === "needs-password") return <SignIn />;
  return <CatalogAdmin initial={await desk.shopCatalog()} />;
}
