import { defineState } from "eve/context";

import extension from "../extension";
import { loadCatalog } from "./catalog";
import { emptyStore, viewDraft, type DraftStore, type DraftView } from "./service";
import { draftUrl, newToken, openStorage, toShared } from "./shared";

/**
 * The drafts of this conversation. Without `sharing` they live and end with the session.
 * With `sharing`, the copy in shared storage is the one that counts: a person may have
 * changed it on the web page since the agent last looked.
 */
export const drafts = defineState<DraftStore>("drafts", emptyStore);

export const settings = () => ({
  vatRateBps: extension.config.vatRateBps,
  pricesIncludeVat: extension.config.pricesIncludeVat,
});

export const catalog = (signal?: AbortSignal) =>
  loadCatalog(extension.config.catalog, { refreshSeconds: extension.config.refreshSeconds, signal });

const sharing = () => extension.config.sharing;

/** The session's drafts, with `draftId` refreshed from shared storage when drafts are shared. */
export async function loadDrafts(draftId?: string): Promise<DraftStore> {
  const store = drafts.get();
  const share = sharing();
  const token = draftId ? store.drafts[draftId]?.token : undefined;
  if (!share || !draftId || !token) return store;
  const shared = await openStorage(share.storage).get(token);
  if (!shared) throw new Error(`Draft ${draftId} has expired. Create a new draft.`);
  return { ...store, drafts: { ...store.drafts, [draftId]: shared } };
}

/** Keeps the result of a tool call: in the session, and in shared storage when drafts are shared. */
export async function saveDrafts(store: DraftStore, draftId: string): Promise<DraftStore> {
  const share = sharing();
  let next = store;
  if (share) {
    const stored = store.drafts[draftId];
    const record = toShared(stored, stored.token ?? newToken(), share.expiresDays);
    await openStorage(share.storage).put(record);
    next = { ...store, drafts: { ...store.drafts, [draftId]: record } };
  }
  drafts.update(() => next);
  return next;
}

export async function view(store: DraftStore, draftId: string, signal?: AbortSignal): Promise<DraftView> {
  const stored = store.drafts[draftId];
  const result = viewDraft(draftId, stored, await catalog(signal), settings());
  const share = sharing();
  return share && stored.token ? { ...result, editUrl: draftUrl(share.baseUrl, stored.token) } : result;
}
