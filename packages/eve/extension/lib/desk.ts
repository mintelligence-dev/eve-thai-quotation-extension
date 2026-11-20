/**
 * The quotation desk: read, change and issue a shared draft without an agent in between.
 * A web page uses this so a person can adjust the draft in a table; every change is priced
 * by the same rules the agent's tools use. No model is involved.
 *
 * Whoever can reach the functions below with a draft's token can change and issue that draft.
 * Put your own sign-in in front of the page if the link may travel further than your staff.
 */
import {
  formatAmount,
  parseBahtToSatang,
  parseCatalogCsv,
  type CatalogItem,
  type QuotationSettings,
} from "@eve-thai-quotation-extension/core";

import { loadCatalog, type CatalogSource } from "./catalog";
import {
  createDraft,
  emptyStore,
  issueQuotation,
  reviseDraft,
  searchCatalog,
  viewDraft,
  type DraftStore,
  type DraftView,
  type IssuedQuotation,
  type ItemView,
  type Revision,
} from "./service";
import {
  newToken,
  openStorage,
  serializeCatalog,
  toShared,
  type DraftStorageConfig,
  type SharedDraft,
  type ShopCatalogPointer,
} from "./shared";

export interface DeskOptions {
  /** The same catalog the agent's extension uses. */
  catalog: CatalogSource;
  /** The same storage the agent's extension shares drafts to. */
  storage: DraftStorageConfig;
  vatRateBps?: number;
  pricesIncludeVat?: boolean;
  validDays?: number;
  sellerName?: string;
  refreshSeconds?: number;
  expiresDays?: number;
  /**
   * Let the page upload a catalog and price a draft from it instead of the configured one.
   * Off by default: with it on, whoever can reach the page chooses the prices.
   */
  allowUploadedCatalogs?: boolean;
  /**
   * Let the shop's own catalog be replaced or edited here, and use the stored one once it has
   * been. Off by default. Whoever can reach `setShopCatalog` and `setShopPrice` sets the prices.
   */
  managedCatalog?: boolean;
}

/** What is printed on the quotation besides the lines. Every field is optional when saving. */
export interface DocumentDetails {
  customerName: string;
  customerDetails: string;
  sellerName: string;
  sellerDetails: string;
  notes: string;
  /** Empty: a number is made at the moment of issue. */
  quoteNo: string;
  /** yyyy-mm-dd. Empty: the day of issue. */
  date: string;
  validDays: number;
  /** 700 is 7%. */
  vatRateBps: number;
  pricesIncludeVat: boolean;
}

export interface ShopCatalog {
  items: { sku: string; name: string; nameEn: string; unit: string; unitPrice: string; category: string; aliases: string[] }[];
  /** "stored" once the catalog was set through the desk; "configured" while it is still the one in the settings. */
  source: "stored" | "configured";
  updatedAt: string | null;
  updatedBy: string | null;
  canUndo: boolean;
}

export interface DeskDraft {
  view: DraftView;
  inquiry: string;
  customerName: string;
  notes: string;
  details: DocumentDetails;
  /** Present once the draft has been issued. */
  issued: IssuedQuotation | null;
  expiresAt: string;
  /** true when the draft is priced from an uploaded catalog, not the configured one. */
  usesUploadedCatalog: boolean;
}

export class DraftNotFoundError extends Error {
  constructor() {
    super("This draft does not exist or its link has expired.");
    this.name = "DraftNotFoundError";
  }
}

const ID = "draft";

export function openDesk(options: DeskOptions) {
  const storage = openStorage(options.storage);
  const settings: QuotationSettings = {
    vatRateBps: options.vatRateBps ?? 700,
    pricesIncludeVat: options.pricesIncludeVat ?? false,
  };
  /** A draft may carry its own VAT settings; otherwise the configured ones apply. */
  const settingsOf = (record: { vatRateBps?: number; pricesIncludeVat?: boolean }): QuotationSettings => ({
    vatRateBps: record.vatRateBps ?? settings.vatRateBps,
    pricesIncludeVat: record.pricesIncludeVat ?? settings.pricesIncludeVat,
  });
  const expiresDays = options.expiresDays ?? 30;
  const fromSettings = () => loadCatalog(options.catalog, { refreshSeconds: options.refreshSeconds ?? 300 });
  const pointer = async (): Promise<ShopCatalogPointer | null> => (options.managedCatalog ? storage.getShopCatalog() : null);
  /** The shop's catalog: the stored one once it was set through the desk, else the one in the settings. */
  const configured = async (): Promise<CatalogItem[]> => {
    const current = await pointer();
    const csv = current ? await storage.getCatalog(current.catalogId) : null;
    return csv !== null ? loadCatalog({ csv }) : fromSettings();
  };
  const requireManaged = () => {
    if (!options.managedCatalog) throw new Error("Changing the shop catalog here is turned off.");
  };
  const keepShopCatalog = async (csv: string, by: string): Promise<number> => {
    const items = await loadCatalog({ csv });
    const before = await storage.getShopCatalog();
    const catalogId = await storage.putCatalog(csv);
    if (before?.catalogId !== catalogId) {
      await storage.setShopCatalog({
        catalogId,
        updatedAt: new Date().toISOString(),
        updatedBy: by.slice(0, 100),
        previousCatalogId: before?.catalogId,
      });
    }
    return items.length;
  };
  const uploaded = async (catalogId: string) => {
    if (!options.allowUploadedCatalogs) throw new Error("Uploaded catalogs are turned off.");
    const csv = await storage.getCatalog(catalogId);
    if (csv === null) throw new Error("The uploaded catalog is no longer available. Upload it again.");
    return loadCatalog({ csv });
  };
  /** The catalog a draft is priced from. */
  const catalogOf = (record: { catalogId?: string }) => (record.catalogId ? uploaded(record.catalogId) : configured());

  const open = async (token: string): Promise<SharedDraft> => {
    const record = await storage.get(token);
    if (!record) throw new DraftNotFoundError();
    return record;
  };
  const asStore = (record: SharedDraft): DraftStore => ({ drafts: { [ID]: record }, next: 0 });
  const present = async (record: SharedDraft): Promise<DeskDraft> => ({
    view: viewDraft(ID, record, await catalogOf(record), settingsOf(record)),
    inquiry: record.inquiry ?? "",
    customerName: record.customerName ?? "",
    notes: record.notes ?? "",
    details: {
      customerName: record.customerName ?? "",
      customerDetails: record.customerDetails ?? "",
      sellerName: record.sellerName ?? options.sellerName ?? "",
      sellerDetails: record.sellerDetails ?? "",
      notes: record.notes ?? "",
      quoteNo: record.quoteNo ?? "",
      date: record.date ?? "",
      validDays: record.validDays ?? options.validDays ?? 30,
      ...settingsOf(record),
    },
    issued: record.issued ?? null,
    expiresAt: record.expiresAt,
    usesUploadedCatalog: Boolean(record.catalogId),
  });
  const save = async (token: string, store: DraftStore): Promise<DeskDraft> => {
    const record = toShared(store.drafts[ID], token, expiresDays);
    await storage.put(record);
    return present(record);
  };

  return {
    async read(token: string): Promise<DeskDraft> {
      return present(await open(token));
    },

    async revise(token: string, revision: Revision): Promise<DeskDraft> {
      const record = await open(token);
      return save(token, reviseDraft(asStore(record), ID, revision, await catalogOf(record)));
    },

    /** What is printed besides the lines. Kept with the draft; only the fields given change. */
    async setDetails(token: string, details: Partial<DocumentDetails>): Promise<DeskDraft> {
      const record = await open(token);
      if (record.issuedAs) throw new Error(`This draft was issued as ${record.issuedAs} and can no longer be changed.`);
      const next = { ...record };
      const text = (value: string | undefined, max: number) => (value === undefined ? undefined : value.trim().slice(0, max));
      const put = <K extends "customerName" | "customerDetails" | "sellerName" | "sellerDetails" | "notes" | "quoteNo">(
        key: K,
        max: number,
      ) => {
        const value = text(details[key], max);
        if (value !== undefined) next[key] = value;
      };
      put("customerName", 200);
      put("customerDetails", 500);
      put("sellerName", 200);
      put("sellerDetails", 500);
      put("notes", 1000);
      put("quoteNo", 40);
      if (details.date !== undefined) {
        const date = details.date.trim();
        if (date !== "" && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)))) {
          throw new Error("The date must be written as yyyy-mm-dd.");
        }
        // Empty means "the day of issue" again.
        next.date = date === "" ? undefined : date;
      }
      if (details.validDays !== undefined) {
        if (!Number.isInteger(details.validDays) || details.validDays < 1 || details.validDays > 365) {
          throw new Error("Valid days must be a whole number from 1 to 365.");
        }
        next.validDays = details.validDays;
      }
      if (details.vatRateBps !== undefined) {
        if (!Number.isInteger(details.vatRateBps) || details.vatRateBps < 0 || details.vatRateBps > 10_000) {
          throw new Error("The VAT rate must be from 0 to 100 percent.");
        }
        next.vatRateBps = details.vatRateBps;
      }
      if (details.pricesIncludeVat !== undefined) next.pricesIncludeVat = details.pricesIncludeVat;
      return save(token, asStore(next));
    },

    /** The shop's catalog as it is used right now. */
    async shopCatalog(): Promise<ShopCatalog> {
      const current = await pointer();
      const stored = current ? (await storage.getCatalog(current.catalogId)) !== null : false;
      return {
        items: (await configured()).map((item) => ({
          sku: item.sku,
          name: item.name,
          nameEn: item.nameEn ?? "",
          unit: item.unit,
          unitPrice: formatAmount(item.unitPriceSatang),
          category: item.category ?? "",
          aliases: item.aliases,
        })),
        source: stored ? "stored" : "configured",
        updatedAt: stored ? current!.updatedAt : null,
        updatedBy: stored ? current!.updatedBy : null,
        canUndo: Boolean(stored && current!.previousCatalogId),
      };
    },

    /** The shop's catalog as a CSV file, ready to edit in a spreadsheet and upload again. */
    async shopCatalogCsv(): Promise<string> {
      return serializeCatalog(await configured());
    },

    /**
     * Replaces the shop's catalog. A file with errors is refused and nothing changes.
     * `by` names who did it, for the record. Needs `managedCatalog`. Open drafts are priced
     * from the new catalog the next time they are opened; issued quotations do not change.
     */
    async setShopCatalog(csv: string, by: string): Promise<{ items: number }> {
      requireManaged();
      return { items: await keepShopCatalog(csv, by) };
    },

    /** Changes one item's price in the shop's catalog. Needs `managedCatalog`. */
    async setShopPrice(sku: string, price: string, by: string): Promise<{ sku: string; name: string; unitPrice: string }> {
      requireManaged();
      const satang = parseBahtToSatang(price);
      if (satang === null || satang <= 0) throw new Error(`"${price}" is not a price. Write it like 62 or 62.50.`);
      const items = await configured();
      const wanted = sku.trim().toLowerCase();
      const item = items.find((candidate) => candidate.sku.toLowerCase() === wanted);
      if (!item) throw new Error(`There is no item with SKU ${sku} in the shop catalog.`);
      await keepShopCatalog(serializeCatalog(items.map((each) => (each === item ? { ...each, unitPriceSatang: satang } : each))), by);
      return { sku: item.sku, name: item.name, unitPrice: formatAmount(satang) };
    },

    /** Goes back to the catalog before the last change. One step only. Needs `managedCatalog`. */
    async undoShopCatalog(by: string): Promise<void> {
      requireManaged();
      const current = await storage.getShopCatalog();
      if (!current?.previousCatalogId) throw new Error("There is no earlier catalog to go back to.");
      await storage.setShopCatalog({
        catalogId: current.previousCatalogId,
        updatedAt: new Date().toISOString(),
        updatedBy: by.slice(0, 100),
      });
    },

    /** Searches the catalog the draft is priced from. */
    async search(token: string, query: string): Promise<ItemView[]> {
      return searchCatalog(query, await catalogOf(await open(token)));
    },

    /**
     * Checks an uploaded catalog and keeps it. A catalog with errors is refused, with the first
     * errors in the message. Needs `allowUploadedCatalogs`.
     */
    async uploadCatalog(csv: string): Promise<{ catalogId: string; items: number; warnings: string[] }> {
      if (!options.allowUploadedCatalogs) throw new Error("Uploaded catalogs are turned off.");
      const items = await loadCatalog({ csv });
      // Things worth a look that do not stop the import, such as a price of 0.
      const warnings = parseCatalogCsv(csv).warnings.map((w) => (w.row > 0 ? `แถว ${w.row}: ${w.message}` : w.message));
      return { catalogId: await storage.putCatalog(csv), items: items.length, warnings };
    },

    /**
     * Starts a draft from a customer message with the built-in reading, without an agent.
     * Returns the draft's token. Give `catalogId` to price it from an uploaded catalog.
     */
    async create(input: { inquiry: string; catalogId?: string }): Promise<string> {
      const items = await catalogOf(input);
      const { store, draftId } = await createDraft(emptyStore(), { inquiry: input.inquiry }, items);
      const record = toShared({ ...store.drafts[draftId], catalogId: input.catalogId }, newToken(), expiresDays);
      await storage.put(record);
      return record.token;
    },

    /**
     * Issues the quotation. Calling this is the approval: only call it for a person who is
     * allowed to approve. `grandTotal` is the total that person was shown; if the draft
     * changed since, nothing is issued.
     */
    async issue(token: string, input: { grandTotal: string; customerName?: string; notes?: string }): Promise<DeskDraft> {
      const record = await open(token);
      const { store } = issueQuotation(asStore(record), { draftId: ID, ...input }, await catalogOf(record), settingsOf(record), {
        validDays: options.validDays ?? 30,
        sellerName: options.sellerName ?? "",
      });
      return save(token, store);
    },
  };
}

export type Desk = ReturnType<typeof openDesk>;
export type { DraftView, IssuedQuotation, ItemView, LineChange, LineView, Revision } from "./service";
export type { ShopCatalogPointer } from "./shared";
