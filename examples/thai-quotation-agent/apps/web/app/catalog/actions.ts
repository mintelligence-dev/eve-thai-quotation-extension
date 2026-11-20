"use server";

import type { ShopCatalog } from "@eve-thai-quotation-extension/eve/desk";

import { requireAdmin, signInAdmin } from "@/lib/admin";
import { desk } from "@/lib/desk";

export type CatalogResult = { ok: true; catalog: ShopCatalog; note: string } | { ok: false; error: string };

async function change(run: () => Promise<string>): Promise<CatalogResult> {
  try {
    await requireAdmin();
    const note = await run();
    return { ok: true, catalog: await desk.shopCatalog(), note };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "ดำเนินการไม่สำเร็จ" };
  }
}

export async function replaceCatalog(csv: string): Promise<CatalogResult> {
  return change(async () => {
    const { items } = await desk.setShopCatalog(csv, "web");
    return `ใช้แคตตาล็อกใหม่แล้ว ${items.toLocaleString("th-TH")} รายการ`;
  });
}

export async function setPrice(sku: string, price: string): Promise<CatalogResult> {
  return change(async () => {
    const changed = await desk.setShopPrice(sku, price, "web");
    return `${changed.sku} ราคาใหม่ ${changed.unitPrice} บาท`;
  });
}

export async function undoCatalog(): Promise<CatalogResult> {
  return change(async () => {
    await desk.undoShopCatalog("web");
    return "ย้อนกลับไปใช้แคตตาล็อกก่อนหน้าแล้ว";
  });
}

export async function signIn(password: string): Promise<{ ok: boolean }> {
  return { ok: await signInAdmin(password.slice(0, 200)) };
}
