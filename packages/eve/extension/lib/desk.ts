/**
 * The quotation desk: read, change and issue a shared draft without an agent in between.
 * A web page uses this so a person can adjust the draft in a table; every change is priced
 * by the same rules the agent's tools use. No model is involved.
 *
 * Whoever can reach the functions below with a draft's token can change and issue that draft.
 * Put your own sign-in in front of the page if the link may travel further than your staff.
 */
import type { QuotationSettings } from "@eve-thai-quotation-extension/core";

import { loadCatalog, type CatalogSource } from "./catalog";
import {
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
import { openStorage, toShared, type DraftStorageConfig, type SharedDraft } from "./shared";

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
}

export interface DeskDraft {
  view: DraftView;
  inquiry: string;
  customerName: string;
  notes: string;
  /** Present once the draft has been issued. */
  issued: IssuedQuotation | null;
  expiresAt: string;
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
  const expiresDays = options.expiresDays ?? 30;
  const catalog = () => loadCatalog(options.catalog, { refreshSeconds: options.refreshSeconds ?? 300 });

  const open = async (token: string): Promise<SharedDraft> => {
    const record = await storage.get(token);
    if (!record) throw new DraftNotFoundError();
    return record;
  };
  const asStore = (record: SharedDraft): DraftStore => ({ drafts: { [ID]: record }, next: 0 });
  const present = async (record: SharedDraft): Promise<DeskDraft> => ({
    view: viewDraft(ID, record, await catalog(), settings),
    inquiry: record.inquiry ?? "",
    customerName: record.customerName ?? "",
    notes: record.notes ?? "",
    issued: record.issued ?? null,
    expiresAt: record.expiresAt,
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
      return save(token, reviseDraft(asStore(record), ID, revision, await catalog()));
    },

    /** Customer name and notes are kept with the draft and printed on the quotation. */
    async setDetails(token: string, details: { customerName?: string; notes?: string }): Promise<DeskDraft> {
      const record = await open(token);
      if (record.issuedAs) throw new Error(`This draft was issued as ${record.issuedAs} and can no longer be changed.`);
      // Only the fields that were given change; a missing one keeps its saved value.
      const next = { ...record };
      if (details.customerName !== undefined) next.customerName = details.customerName;
      if (details.notes !== undefined) next.notes = details.notes;
      return save(token, asStore(next));
    },

    async search(query: string): Promise<ItemView[]> {
      return searchCatalog(query, await catalog());
    },

    /**
     * Issues the quotation. Calling this is the approval: only call it for a person who is
     * allowed to approve. `grandTotal` is the total that person was shown; if the draft
     * changed since, nothing is issued.
     */
    async issue(token: string, input: { grandTotal: string; customerName?: string; notes?: string }): Promise<DeskDraft> {
      const record = await open(token);
      const { store } = issueQuotation(asStore(record), { draftId: ID, ...input }, await catalog(), settings, {
        validDays: options.validDays ?? 30,
        sellerName: options.sellerName ?? "",
      });
      return save(token, store);
    },
  };
}

export type Desk = ReturnType<typeof openDesk>;
export type { DraftView, IssuedQuotation, ItemView, LineChange, LineView, Revision } from "./service";
