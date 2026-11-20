import { defineState } from "eve/context";

import extension from "../extension";
import { loadCatalog } from "./catalog";
import { emptyStore, viewDraft, type DraftStore, type DraftView, type StoredDraft } from "./service";
import { draftUrl, newToken, openStorage, toShared } from "./shared";

/**
 * The drafts of this conversation. Without `sharing` they live and end with the session.
 * With `sharing`, the copy in shared storage is the one that counts: a person may have
 * changed it on the web page since the agent last looked.
 */
export const drafts = defineState<DraftStore>("drafts", emptyStore);

/** The VAT settings of a draft: its own when a person set them on the desk, else the configured ones. */
export const settings = (stored?: Pick<StoredDraft, "vatRateBps" | "pricesIncludeVat">) => ({
  vatRateBps: stored?.vatRateBps ?? extension.config.vatRateBps,
  pricesIncludeVat: stored?.pricesIncludeVat ?? extension.config.pricesIncludeVat,
});

/** The shop's catalog: the one set through the desk when that is turned on and used, else the configured one. */
export async function catalog(signal?: AbortSignal) {
  const share = extension.config.sharing;
  if (share?.managedCatalog) {
    const storage = openStorage(share.storage);
    const pointer = await storage.getShopCatalog();
    const csv = pointer ? await storage.getCatalog(pointer.catalogId) : null;
    if (csv !== null) return loadCatalog({ csv });
  }
  return loadCatalog(extension.config.catalog, { refreshSeconds: extension.config.refreshSeconds, signal });
}

/** An uploaded catalog, when the configuration allows drafts to be priced from one. */
export async function uploadedCatalog(catalogId: string) {
  const share = extension.config.sharing;
  if (!share?.allowUploadedCatalogs) throw new Error("Uploaded catalogs are turned off for this agent.");
  const csv = await openStorage(share.storage).getCatalog(catalogId);
  if (csv === null) throw new Error(`There is no uploaded catalog ${catalogId}. Use the configured catalog, or ask for the upload again.`);
  return loadCatalog({ csv });
}

/** The catalog a draft is priced from: its uploaded one when it has one, else the configured one. */
export const catalogFor = (stored: StoredDraft | undefined, signal?: AbortSignal) =>
  stored?.catalogId ? uploadedCatalog(stored.catalogId) : catalog(signal);

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
  const result = viewDraft(draftId, stored, await catalogFor(stored, signal), settings(stored));
  const share = sharing();
  return share && stored.token ? { ...result, editUrl: draftUrl(share.baseUrl, stored.token) } : result;
}
