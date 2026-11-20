/**
 * Shared draft storage: a draft kept outside the conversation, so a web page can open the same
 * draft the agent is working on. Each draft has an unguessable token that is both its storage
 * key and the last part of its link; whoever holds the link can read and change the draft.
 */
import { createHash, randomBytes } from "node:crypto";

import { formatAmount, type CatalogItem } from "@eve-thai-quotation-extension/core";

import type { StoredDraft } from "./service";

/** Where shared drafts are kept. `dir` is a folder of JSON files, for one machine or a mounted volume. */
export type DraftStorageConfig = { dir: string };

export interface SharedDraft extends StoredDraft {
  token: string;
  updatedAt: string;
  /** After this moment the draft can no longer be opened. */
  expiresAt: string;
}

export interface DraftStorage {
  /** null when there is no such draft or it has expired. */
  get(token: string): Promise<SharedDraft | null>;
  put(record: SharedDraft): Promise<void>;
  /** The CSV text of an uploaded catalog, or null when there is none with this id. */
  getCatalog(catalogId: string): Promise<string | null>;
  /** Keeps an uploaded catalog and returns its id. The same text always gets the same id. */
  putCatalog(csv: string): Promise<string>;
  /** Which kept catalog is the shop's own right now, or null when none was ever set. */
  getShopCatalog(): Promise<ShopCatalogPointer | null>;
  setShopCatalog(pointer: ShopCatalogPointer): Promise<void>;
}

export interface ShopCatalogPointer {
  catalogId: string;
  updatedAt: string;
  /** Who changed it, as the caller named them. */
  updatedBy: string;
  /** The catalog before this change, so one step back is possible. */
  previousCatalogId?: string;
}

const csvCell = (value: string): string => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** Writes catalog items back as CSV, in the columns the importer reads. */
export function serializeCatalog(items: CatalogItem[]): string {
  const rows = [
    ["sku", "name", "name_en", "aliases", "unit", "unit_price", "category"],
    ...items.map((item) => [
      item.sku,
      item.name,
      item.nameEn ?? "",
      item.aliases.join("|"),
      item.unit,
      // Plain digits: a thousands separator would not survive the next import in every tool.
      formatAmount(item.unitPriceSatang).replace(/,/g, ""),
      item.category ?? "",
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

/** An uploaded catalog larger than this is refused. */
export const MAX_CATALOG_BYTES = 1_000_000;

const CATALOG_ID = /^[a-f0-9]{32}$/;
export const isCatalogId = (value: string): boolean => CATALOG_ID.test(value);

const TOKEN = /^[A-Za-z0-9_-]{22}$/;

/** 128 random bits, URL-safe. */
export const newToken = (): string => randomBytes(16).toString("base64url");

/** Tokens become file names, so anything that is not exactly a token is refused. */
export const isToken = (value: string): boolean => TOKEN.test(value);

export function toShared(stored: StoredDraft, token: string, expiresDays: number, now = new Date()): SharedDraft {
  const previous = stored as Partial<SharedDraft>;
  return {
    ...stored,
    token,
    updatedAt: now.toISOString(),
    // The clock starts when the draft is first shared; later changes do not extend it.
    expiresAt: previous.expiresAt ?? new Date(now.getTime() + expiresDays * 86_400_000).toISOString(),
  };
}

function dirStorage(dir: string): DraftStorage {
  const file = async (token: string) => {
    const { join } = await import("node:path");
    return join(dir, `${token}.json`);
  };
  return {
    async get(token) {
      if (!isToken(token)) return null;
      const { readFile } = await import("node:fs/promises");
      let text: string;
      try {
        text = await readFile(await file(token), "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
      const record = JSON.parse(text) as SharedDraft;
      return Date.parse(record.expiresAt) > Date.now() ? record : null;
    },
    async put(record) {
      if (!isToken(record.token)) throw new Error("Not a draft token.");
      const { mkdir, rename, writeFile } = await import("node:fs/promises");
      await mkdir(dir, { recursive: true });
      const target = await file(record.token);
      // Write beside the file and rename, so a reader never sees half a draft.
      const temp = `${target}.${randomBytes(4).toString("hex")}.tmp`;
      await writeFile(temp, JSON.stringify(record), "utf8");
      await rename(temp, target);
    },
    async getCatalog(catalogId) {
      if (!isCatalogId(catalogId)) return null;
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      try {
        return await readFile(join(dir, "catalogs", `${catalogId}.csv`), "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async putCatalog(csv) {
      if (Buffer.byteLength(csv, "utf8") > MAX_CATALOG_BYTES) throw new Error("The catalog file is too large (limit 1 MB).");
      const { mkdir, rename, writeFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const catalogId = createHash("sha256").update(csv).digest("hex").slice(0, 32);
      const folder = join(dir, "catalogs");
      await mkdir(folder, { recursive: true });
      const target = join(folder, `${catalogId}.csv`);
      const temp = `${target}.${randomBytes(4).toString("hex")}.tmp`;
      await writeFile(temp, csv, "utf8");
      await rename(temp, target);
      return catalogId;
    },
    async getShopCatalog() {
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      try {
        return JSON.parse(await readFile(join(dir, "shop-catalog.json"), "utf8")) as ShopCatalogPointer;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async setShopCatalog(pointer) {
      if (!isCatalogId(pointer.catalogId)) throw new Error("Not a catalog id.");
      const { mkdir, rename, writeFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      await mkdir(dir, { recursive: true });
      const target = join(dir, "shop-catalog.json");
      const temp = `${target}.${randomBytes(4).toString("hex")}.tmp`;
      await writeFile(temp, JSON.stringify(pointer), "utf8");
      await rename(temp, target);
    },
  };
}

export function openStorage(config: DraftStorageConfig): DraftStorage {
  return dirStorage(config.dir);
}

export const draftUrl = (baseUrl: string, token: string): string => `${baseUrl.replace(/\/+$/, "")}/q/${token}`;
