"use server";

import { getVercelOidcToken } from "@vercel/oidc";
import { Client } from "eve/client";

import { desk } from "@/lib/desk";

import { quotationConfig } from "../../../quotation.config";

export type UploadResult =
  | { ok: true; catalogId: string; items: number; warnings: string[] }
  | { ok: false; error: string };

/** Checks an uploaded price list and keeps it on the server so a draft can be priced from it. */
export async function uploadCatalog(csv: string): Promise<UploadResult> {
  try {
    return { ok: true, ...(await desk.uploadCatalog(csv)) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not read the catalog." };
  }
}

export type CreateResult = { ok: true; path: string } | { ok: false; error: string };

/** Makes a draft with the built-in rules only: no agent and no model. */
export async function createDraftWithoutAi(inquiry: string, catalogId?: string): Promise<CreateResult> {
  try {
    const token = await desk.create({ inquiry: inquiry.slice(0, 8000), catalogId });
    return { ok: true, path: `/q/${token}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not create the draft." };
  }
}

/** What the agent is asked to do with the pasted message. Only the link in its reply is used. */
const request = (message: string, catalogId?: string) =>
  [
    "A member of staff pasted the customer message below into the quotation desk.",
    "Create a quotation draft from it with the draft tool. Do not ask questions: unclear lines are settled on the draft's page.",
    catalogId
      ? `Price it from the uploaded catalog: pass catalogId "${catalogId}" to the draft tool.`
      : "Use the configured catalog: do not pass a catalogId.",
    "Reply with the draft's editUrl and nothing else.",
    "",
    "<customer_message>",
    message,
    "</customer_message>",
  ].join("\n");

/**
 * Makes a draft through the agent, so the model reads the message. The agent is called from
 * this server, as this deployment, and is never open to the browser: a visitor can only do
 * this one thing with it.
 */
export async function createDraftWithAi(inquiry: string, catalogId?: string): Promise<CreateResult> {
  const message = inquiry.trim().slice(0, 8000);
  if (message === "") return { ok: false, error: "ยังไม่มีข้อความจากลูกค้า" };
  if (catalogId !== undefined && !/^[a-f0-9]{32}$/.test(catalogId)) return { ok: false, error: "แคตตาล็อกไม่ถูกต้อง" };
  try {
    const client = new Client({
      // A fixed address from this project's settings, never one taken from the request.
      baseUrl: quotationConfig.sharing.baseUrl,
      auth: process.env.VERCEL ? { vercelOidc: { token: () => getVercelOidcToken() } } : undefined,
    });
    const { delivery } = await client.sessions.create({ message: request(message, catalogId) });
    const result = await delivery.result({ signal: AbortSignal.timeout(120_000) });
    const path = /\/q\/[A-Za-z0-9_-]{22}(?![A-Za-z0-9_-])/.exec(result.reply ?? "")?.[0];
    if (!path) {
      return {
        ok: false,
        error:
          result.status === "failed"
            ? "AI ไม่พร้อมใช้งานในขณะนี้ ลองอีกครั้ง หรือสลับเป็นโหมดไม่ใช้ AI"
            : "AI อ่านข้อความแล้วแต่ไม่ได้สร้างร่าง ตรวจว่าข้อความมีรายการสินค้า หรือสลับเป็นโหมดไม่ใช้ AI",
      };
    }
    return { ok: true, path };
  } catch {
    return { ok: false, error: "ติดต่อ AI ไม่สำเร็จ ลองอีกครั้ง หรือสลับเป็นโหมดไม่ใช้ AI" };
  }
}
