/**
 * The quotation desk for this project: the same catalog, prices and shared drafts the agent
 * uses, for code that works on them without a model (the web pages, the Telegram admin
 * commands). Server only: it reads files.
 */
import { openDesk } from "@eve-thai-quotation-extension/eve/desk";

import { quotationConfig } from "./quotation.config";

export const desk = openDesk({
  catalog: quotationConfig.catalog,
  storage: quotationConfig.sharing.storage,
  expiresDays: quotationConfig.sharing.expiresDays,
  allowUploadedCatalogs: quotationConfig.sharing.allowUploadedCatalogs,
  managedCatalog: quotationConfig.sharing.managedCatalog,
  vatRateBps: quotationConfig.vatRateBps,
  pricesIncludeVat: quotationConfig.pricesIncludeVat,
  validDays: quotationConfig.validDays,
  sellerName: quotationConfig.sellerName,
});
