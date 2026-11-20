import { defineState } from "eve/context";

import extension from "../extension";
import { loadCatalog } from "./catalog";
import { emptyStore, type DraftStore } from "./service";

/** The drafts of this conversation. They live and end with the session. */
export const drafts = defineState<DraftStore>("drafts", emptyStore);

export const settings = () => ({
  vatRateBps: extension.config.vatRateBps,
  pricesIncludeVat: extension.config.pricesIncludeVat,
});

export const catalog = (signal?: AbortSignal) =>
  loadCatalog(extension.config.catalog, { refreshSeconds: extension.config.refreshSeconds, signal });
