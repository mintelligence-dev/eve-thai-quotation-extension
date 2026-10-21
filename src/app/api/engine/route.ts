import { connection } from "next/server";
import { aiAvailable, configuredModel } from "@/lib/server/ai";

/** Tells the UI whether the AI switch can be turned on. Read per request, not at build time. */
export async function GET() {
  await connection();
  const available = aiAvailable();
  return Response.json({ aiAvailable: available, model: available ? configuredModel() : null });
}
