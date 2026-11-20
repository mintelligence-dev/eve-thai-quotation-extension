import { decodeCsvBytes } from "@eve-thai-quotation-extension/core";
import { defaultTelegramAuth, telegramChannel, type TelegramContext, type TelegramMessage } from "eve/channels/telegram";

import { quotationConfig } from "../../quotation.config";
import { desk } from "../../quotation.desk";

const BOT_USERNAME = "thai_quotation_bot";
const MAX_CATALOG_BYTES = 1_000_000;

/**
 * Telegram user ids allowed to change the shop's prices, comma separated, in
 * QUOTATION_ADMIN_TELEGRAM_IDS. Nobody can until it is set. Send /myid to the bot to see yours.
 */
const admins = () =>
  new Set(
    (process.env.QUOTATION_ADMIN_TELEGRAM_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );

const HELP = [
  "คำสั่งสำหรับผู้ดูแลแคตตาล็อก",
  "• ส่งไฟล์ .csv เข้ามาในแชตนี้ เพื่อแทนที่แคตตาล็อกทั้งชุด",
  "• /price <รหัสสินค้า> <ราคา> เพื่อแก้ราคาหนึ่งรายการ เช่น /price PVC-050-85 65.50",
  "• /catalog เพื่อดูสถานะแคตตาล็อก",
  "• /myid เพื่อดูรหัสผู้ใช้ Telegram ของคุณ",
].join("\n");

const COMMAND = /^\/(price|catalog|myid)(?:@\w+)?(?:\s+([\s\S]*))?$/;

const isCsv = (attachment: TelegramMessage["attachments"][number]) =>
  attachment.kind === "document" &&
  (attachment.fileName?.toLowerCase().endsWith(".csv") === true || attachment.mediaType === "text/csv");

async function downloadCsv(ctx: TelegramContext, fileId: string): Promise<string> {
  const response = await ctx.telegram.request("getFile", { file_id: fileId });
  const filePath = (response.body as { result?: { file_path?: unknown } } | null)?.result?.file_path;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!response.ok || typeof filePath !== "string" || !token) throw new Error("ดาวน์โหลดไฟล์จาก Telegram ไม่สำเร็จ");
  const file = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!file.ok) throw new Error("ดาวน์โหลดไฟล์จาก Telegram ไม่สำเร็จ");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_CATALOG_BYTES) throw new Error("ไฟล์ใหญ่เกินไป (จำกัด 1 MB)");
  const decoded = decodeCsvBytes(bytes);
  if ("error" in decoded) throw new Error(decoded.error.message);
  return decoded.text;
}

/**
 * Catalog changes are handled here, by code: the model never sees or writes a price.
 * Returns true when the message was one of them, so it is not passed on to the agent.
 */
async function handleCatalogAdmin(ctx: TelegramContext, message: TelegramMessage): Promise<boolean> {
  const text = (message.text || message.caption).trim();
  const csv = message.attachments.find(isCsv);
  const command = COMMAND.exec(text);
  if (!csv && !command) return false;

  const reply = (body: string) => ctx.telegram.sendMessage(body);
  const userId = message.from?.id ?? "";

  if (command?.[1] === "myid") {
    await reply(`รหัสผู้ใช้ Telegram ของคุณคือ ${userId || "(ไม่ทราบ)"}`);
    return true;
  }
  // Prices are changed one-to-one with the bot, never in a group where others can read along.
  if (message.chat.type !== "private") {
    await reply("การแก้ไขแคตตาล็อกทำได้เฉพาะในแชตส่วนตัวกับบอท");
    return true;
  }
  if (!userId || !admins().has(userId)) {
    await reply(
      `คุณไม่มีสิทธิ์แก้ไขแคตตาล็อกของร้าน ให้ผู้ดูแลระบบเพิ่มรหัสผู้ใช้ของคุณ (${userId || "ไม่ทราบ"}) ใน QUOTATION_ADMIN_TELEGRAM_IDS ก่อน`,
    );
    return true;
  }

  const by = `telegram:${userId}`;
  try {
    if (csv) {
      const { items } = await desk.setShopCatalog(await downloadCsv(ctx, csv.fileId), by);
      await reply(
        `ใช้แคตตาล็อกใหม่แล้ว ${items.toLocaleString("th-TH")} รายการ มีผลกับทั้งแชตและหน้าเว็บทันที\nถ้าต้องการย้อนกลับ ทำได้ที่ ${quotationConfig.sharing.baseUrl}/catalog`,
      );
    } else if (command?.[1] === "price") {
      const [sku, price] = (command[2] ?? "").trim().split(/\s+/);
      if (!sku || !price) {
        await reply("รูปแบบ: /price <รหัสสินค้า> <ราคา> เช่น /price PVC-050-85 65.50");
        return true;
      }
      const changed = await desk.setShopPrice(sku, price, by);
      await reply(`แก้ราคาแล้ว\n${changed.name} (${changed.sku})\nราคาใหม่ ${changed.unitPrice} บาท`);
    } else {
      const shop = await desk.shopCatalog();
      await reply(
        [
          `แคตตาล็อกของร้านมี ${shop.items.length.toLocaleString("th-TH")} รายการ`,
          shop.source === "stored" ? `แก้ไขล่าสุดโดย ${shop.updatedBy ?? "-"}` : "ยังเป็นไฟล์ตั้งต้นของระบบ",
          `ดูและแก้ไขทั้งหมดได้ที่ ${quotationConfig.sharing.baseUrl}/catalog`,
          "",
          HELP,
        ].join("\n"),
      );
    }
  } catch (error) {
    // The desk's messages say what was wrong with the file or the price; nothing was changed.
    await reply(`ไม่ได้เปลี่ยนแปลงอะไร\n${error instanceof Error ? error.message : "เกิดข้อผิดพลาด"}`);
  }
  return true;
}

/** eve's default rule for groups: answer only a command, a mention, or a reply to the bot. */
function addressedToBot(message: TelegramMessage): boolean {
  if (message.chat.type === "private") return true;
  const text = message.text || message.caption;
  return (
    text.startsWith("/") ||
    text.toLowerCase().includes(`@${BOT_USERNAME}`) ||
    message.replyToMessage?.from?.isBot === true
  );
}

export default telegramChannel({
  botUsername: BOT_USERNAME,
  async onMessage(ctx, message) {
    if (await handleCatalogAdmin(ctx, message)) return null;
    if (!addressedToBot(message)) return null;
    return { auth: defaultTelegramAuth(message) };
  },
});
