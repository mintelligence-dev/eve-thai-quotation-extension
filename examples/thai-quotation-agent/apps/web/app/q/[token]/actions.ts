"use server";

import type { DeskDraft, DocumentDetails, ItemView, Revision } from "@eve-thai-quotation-extension/eve/desk";

import { desk } from "@/lib/desk";

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

async function attempt<T>(run: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

export async function reviseDraft(token: string, revision: Revision): Promise<Result<DeskDraft>> {
  return attempt(() => desk.revise(token, revision));
}

/** Only the fields given change; the desk checks and trims each one. */
export async function saveDetails(token: string, details: Partial<DocumentDetails>): Promise<Result<DeskDraft>> {
  return attempt(() => desk.setDetails(token, details));
}

export async function searchItems(token: string, query: string): Promise<Result<ItemView[]>> {
  return attempt(() => desk.search(token, query.slice(0, 200)));
}

/** The person pressing the button is the approver; `grandTotal` is the total they were shown. */
export async function issueDraft(token: string, grandTotal: string): Promise<Result<DeskDraft>> {
  return attempt(() => desk.issue(token, { grandTotal }));
}
