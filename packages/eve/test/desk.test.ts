import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { clearCatalogCache, loadCatalog } from "../extension/lib/catalog";
import { DraftNotFoundError, openDesk } from "../extension/lib/desk";
import { createDraft, emptyStore } from "../extension/lib/service";
import { draftUrl, isToken, newToken, openStorage, toShared } from "../extension/lib/shared";

const SAMPLES = join(__dirname, "..", "..", "..", "public", "samples");
const csv = readFileSync(join(SAMPLES, "catalog-construction-th.csv"), "utf8");

let dir: string;
beforeEach(() => {
  clearCatalogCache();
  dir = mkdtempSync(join(tmpdir(), "quotation-desk-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const desk = () => openDesk({ catalog: { csv }, storage: { dir }, sellerName: "บริษัท ตัวอย่าง จำกัด" });

/** What the agent's draft tool does when drafts are shared. */
async function share(inquiry: string): Promise<string> {
  const catalog = await loadCatalog({ csv });
  const { store, draftId } = await createDraft(emptyStore(), { inquiry }, catalog);
  const record = toShared(store.drafts[draftId], newToken(), 30);
  await openStorage({ dir }).put(record);
  return record.token;
}

describe("shared storage", () => {
  it("makes tokens that are safe as file names and hard to guess", () => {
    const token = newToken();
    expect(isToken(token)).toBe(true);
    expect(newToken()).not.toBe(token);
    expect(isToken("../../etc/passwd")).toBe(false);
    expect(isToken("")).toBe(false);
  });

  it("does not read outside its folder", async () => {
    writeFileSync(join(dir, "..", "outside.json"), "{}");
    expect(await openStorage({ dir }).get("../outside")).toBeNull();
    rmSync(join(dir, "..", "outside.json"));
  });

  it("stops returning a draft once it has expired", async () => {
    const catalog = await loadCatalog({ csv });
    const { store, draftId } = await createDraft(emptyStore(), { inquiry: "ท่อ pvc 4 หุน 10 เส้น" }, catalog);
    const longAgo = new Date(Date.now() - 31 * 86_400_000);
    const record = toShared(store.drafts[draftId], newToken(), 30, longAgo);
    await openStorage({ dir }).put(record);
    expect(await openStorage({ dir }).get(record.token)).toBeNull();
    await expect(desk().read(record.token)).rejects.toBeInstanceOf(DraftNotFoundError);
  });

  it("keeps the first expiry when the draft changes later", async () => {
    const token = await share("ท่อ pvc 4 หุน 10 เส้น");
    const before = await desk().read(token);
    const after = await desk().setDetails(token, { customerName: "ร้านทดสอบ" });
    expect(after.expiresAt).toBe(before.expiresAt);
    expect(after.customerName).toBe("ร้านทดสอบ");
  });

  it("builds the link from the base address", () => {
    expect(draftUrl("https://example.com/", "abc")).toBe("https://example.com/q/abc");
  });
});

describe("uploaded catalogs", () => {
  const office = readFileSync(join(SAMPLES, "catalog-office-en.csv"), "utf8");
  const open = (allow: boolean) => openDesk({ catalog: { csv }, storage: { dir }, allowUploadedCatalogs: allow });

  it("are refused unless turned on", async () => {
    await expect(open(false).uploadCatalog(office)).rejects.toThrow(/turned off/);
  });

  it("refuses a catalog with errors and keeps nothing", async () => {
    await expect(open(true).uploadCatalog("sku,name\nA1,Thing\n")).rejects.toThrow(/was not loaded/);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("prices a draft from the uploaded catalog, not the configured one", async () => {
    const d = open(true);
    const { catalogId, items } = await d.uploadCatalog(office);
    expect(items).toBeGreaterThan(0);
    expect((await d.uploadCatalog(office)).catalogId).toBe(catalogId);

    const first = (await d.search(await d.create({ inquiry: "x", catalogId }), "paper"))[0];
    expect(first).toBeDefined();
    const token = await d.create({ inquiry: `${first.name} 3 ${first.unit}`, catalogId });
    const draft = await d.read(token);
    expect(draft.usesUploadedCatalog).toBe(true);
    expect(draft.view.lines[0]?.item?.sku).toBe(first.sku);

    // The configured (construction) catalog does not have this item.
    const plain = await d.read(await d.create({ inquiry: `${first.name} 3 ${first.unit}` }));
    expect(plain.usesUploadedCatalog).toBe(false);
    expect(plain.view.lines[0]?.item?.sku).not.toBe(first.sku);
  });

  it("stops serving a draft's uploaded catalog once the option is turned off", async () => {
    const d = open(true);
    const { catalogId } = await d.uploadCatalog(office);
    const token = await d.create({ inquiry: "paper 3", catalogId });
    await expect(open(false).read(token)).rejects.toThrow(/turned off/);
  });
});

describe("desk", () => {
  it("refuses a token it does not know", async () => {
    await expect(desk().read(newToken())).rejects.toBeInstanceOf(DraftNotFoundError);
  });

  it("lets a person settle an unclear line and then issue", async () => {
    const token = await share("ท่อ pvc 4 หุน 10 เส้น\nท่อ 5 เส้น");
    const d = desk();
    const first = await d.read(token);
    expect(first.view.readyToIssue).toBe(false);
    const unclear = first.view.lines.find((l) => l.problems.length > 0);
    expect(unclear, JSON.stringify(first.view.lines)).toBeDefined();

    const found = await d.search(token, "ท่อ pvc 1 นิ้ว");
    const settled = await d.revise(token, { changes: [{ lineId: unclear!.lineId, sku: found[0].sku, quantity: 5 }] });
    expect(settled.view.readyToIssue).toBe(true);

    const issued = await d.issue(token, { grandTotal: settled.view.totals.grandTotal, customerName: "ร้านทดสอบ" });
    expect(issued.issued?.quoteNo).toMatch(/^QT-\d{8}-\d{6}$/);
    expect(issued.issued?.customerName).toBe("ร้านทดสอบ");
    expect(issued.issued?.sellerName).toBe("บริษัท ตัวอย่าง จำกัด");
    expect(issued.view.issuedAs).toBe(issued.issued?.quoteNo);

    // The record on disk is the one the agent reads next.
    const onDisk = JSON.parse(readFileSync(join(dir, `${token}.json`), "utf8"));
    expect(onDisk.issuedAs).toBe(issued.issued?.quoteNo);
    expect(readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("does not issue a total the approver did not see", async () => {
    const token = await share("ท่อ pvc 4 หุน 10 เส้น");
    const d = desk();
    const shown = (await d.read(token)).view;
    await d.revise(token, { changes: [{ lineId: shown.lines[0].lineId, quantity: 20 }] });
    await expect(d.issue(token, { grandTotal: shown.totals.grandTotal })).rejects.toThrow(/Nothing was issued/);
    expect((await d.read(token)).issued).toBeNull();
  });

  it("does not change or re-issue an issued draft", async () => {
    const token = await share("ท่อ pvc 4 หุน 10 เส้น");
    const d = desk();
    const ready = (await d.read(token)).view;
    await d.issue(token, { grandTotal: ready.totals.grandTotal });
    await expect(d.revise(token, { changes: [{ lineId: ready.lines[0].lineId, quantity: 2 }] })).rejects.toThrow(/can no longer be changed/);
    await expect(d.setDetails(token, { notes: "x" })).rejects.toThrow(/can no longer be changed/);
    await expect(d.issue(token, { grandTotal: ready.totals.grandTotal })).rejects.toThrow(/already issued/);
  });

  it("keeps the other detail when only one is saved", async () => {
    const token = await share("ท่อ pvc 4 หุน 10 เส้น");
    const d = desk();
    await d.setDetails(token, { customerName: "ร้านทดสอบ", notes: undefined });
    const after = await d.setDetails(token, { customerName: undefined, notes: "ส่งฟรี" });
    expect(after.customerName).toBe("ร้านทดสอบ");
    expect(after.notes).toBe("ส่งฟรี");
  });

  it("uses the name and notes kept with the draft when issuing", async () => {
    const token = await share("ท่อ pvc 4 หุน 10 เส้น");
    const d = desk();
    const ready = await d.setDetails(token, { customerName: "หจก. ก่อสร้าง", notes: "ส่งฟรีในเขตเมือง" });
    const issued = await d.issue(token, { grandTotal: ready.view.totals.grandTotal });
    expect(issued.issued?.customerName).toBe("หจก. ก่อสร้าง");
    expect(issued.issued?.text).toContain("ส่งฟรีในเขตเมือง");
  });
});
