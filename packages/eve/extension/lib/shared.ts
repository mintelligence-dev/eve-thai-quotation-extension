/**
 * Shared draft storage: a draft kept outside the conversation, so a web page can open the same
 * draft the agent is working on. Each draft has an unguessable token that is both its storage
 * key and the last part of its link; whoever holds the link can read and change the draft.
 */
import { createHash, randomBytes } from "node:crypto";

import { formatAmount, type CatalogItem } from "@eve-thai-quotation-extension/core";

import type { StoredDraft } from "./service";

/**
 * Where shared drafts and catalogs are kept.
 * - `dir`: a folder of files, for one machine or a mounted volume.
 * - `blob`: Vercel Blob with private access, for serverless hosting.
 */
export type DraftStorageConfig = { dir: string } | { blob: { prefix?: string } };

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

/** A flat set of text files: all the storage needs. */
interface Files {
  /** null when there is no such file. */
  read(path: string): Promise<string | null>;
  /** Replaces the file as a whole; a reader never sees half of it. */
  write(path: string, text: string, contentType: string): Promise<void>;
}

function dirFiles(dir: string): Files {
  return {
    async read(path) {
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      try {
        return await readFile(join(dir, path), "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async write(path, text) {
      const { mkdir, rename, writeFile } = await import("node:fs/promises");
      const { dirname, join } = await import("node:path");
      const target = join(dir, path);
      await mkdir(dirname(target), { recursive: true });
      // Write beside the file and rename, so a reader never sees half a draft.
      const temp = `${target}.${randomBytes(4).toString("hex")}.tmp`;
      await writeFile(temp, text, "utf8");
      await rename(temp, target);
    },
  };
}

/**
 * Vercel Blob, with private access: the files can only be read with the store's token, never
 * by URL. Needs the `@vercel/blob` package and BLOB_READ_WRITE_TOKEN in the environment.
 */
function blobFiles(prefix: string): Files {
  const key = (path: string) => `${prefix.replace(/^\/+|\/+$/g, "")}/${path}`;
  const sdk = () => import("@vercel/blob");
  return {
    async read(path) {
      const { get } = await sdk();
      // Straight from storage: a cached copy could be a draft from before the last change.
      const found = await get(key(path), { access: "private", useCache: false });
      if (!found || found.statusCode !== 200) return null;
      return new Response(found.stream).text();
    },
    async write(path, text, contentType) {
      const { put } = await sdk();
      await put(key(path), text, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType });
    },
  };
}

function storageOn(files: Files): DraftStorage {
  return {
    async get(token) {
      if (!isToken(token)) return null;
      const text = await files.read(`drafts/${token}.json`);
      if (text === null) return null;
      const record = JSON.parse(text) as SharedDraft;
      return Date.parse(record.expiresAt) > Date.now() ? record : null;
    },
    async put(record) {
      if (!isToken(record.token)) throw new Error("Not a draft token.");
      await files.write(`drafts/${record.token}.json`, JSON.stringify(record), "application/json");
    },
    async getCatalog(catalogId) {
      return isCatalogId(catalogId) ? files.read(`catalogs/${catalogId}.csv`) : null;
    },
    async putCatalog(csv) {
      if (Buffer.byteLength(csv, "utf8") > MAX_CATALOG_BYTES) throw new Error("The catalog file is too large (limit 1 MB).");
      const catalogId = createHash("sha256").update(csv).digest("hex").slice(0, 32);
      await files.write(`catalogs/${catalogId}.csv`, csv, "text/csv; charset=utf-8");
      return catalogId;
    },
    async getShopCatalog() {
      const text = await files.read("shop-catalog.json");
      return text === null ? null : (JSON.parse(text) as ShopCatalogPointer);
    },
    async setShopCatalog(pointer) {
      if (!isCatalogId(pointer.catalogId)) throw new Error("Not a catalog id.");
      await files.write("shop-catalog.json", JSON.stringify(pointer), "application/json");
    },
  };
}

export function openStorage(config: DraftStorageConfig): DraftStorage {
  return storageOn("blob" in config ? blobFiles(config.blob.prefix ?? "quotation") : dirFiles(config.dir));
}

export const draftUrl = (baseUrl: string, token: string): string => `${baseUrl.replace(/\/+$/, "")}/q/${token}`;
