import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

/**
 * Who may change the shop's prices on the web. Set QUOTATION_ADMIN_PASSWORD to require a
 * password. Without one, the catalog page is open in development and locked in production,
 * so a deployment never exposes price editing by accident.
 */
const COOKIE = "quotation_admin";
const password = () => process.env.QUOTATION_ADMIN_PASSWORD ?? "";
const proof = (secret: string) => createHmac("sha256", secret).update("quotation-admin").digest("hex");

export type AdminState = "admin" | "needs-password" | "locked";

export async function adminState(): Promise<AdminState> {
  const secret = password();
  if (secret === "") return process.env.NODE_ENV === "production" ? "locked" : "admin";
  const given = (await cookies()).get(COOKIE)?.value ?? "";
  const expected = proof(secret);
  const ok = given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  return ok ? "admin" : "needs-password";
}

export async function requireAdmin(): Promise<void> {
  if ((await adminState()) !== "admin") throw new Error("ต้องเข้าสู่ระบบผู้ดูแลก่อน");
}

/** true when the password was right; the browser then holds a cookie for 12 hours. */
export async function signInAdmin(given: string): Promise<boolean> {
  const secret = password();
  if (secret === "") return false;
  const a = Buffer.from(proof(given));
  const b = Buffer.from(proof(secret));
  if (!timingSafeEqual(a, b)) return false;
  (await cookies()).set(COOKIE, proof(secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/catalog",
    maxAge: 60 * 60 * 12,
  });
  return true;
}
