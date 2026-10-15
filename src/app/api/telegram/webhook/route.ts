import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { handleUpdate, type TgUpdate } from "@/lib/telegramBot";

export const maxDuration = 30;

function fromTelegram(req: Request): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("x-telegram-bot-api-secret-token") ?? "");
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * POST /api/telegram/webhook — every message and button press sent to the
 * admin bot.
 *
 * Telegram proves the call is its own by echoing the secret it was given in
 * setWebhook. A failure inside the bot still answers 200: anything else makes
 * Telegram redeliver the same update over and over.
 */
export async function POST(req: Request) {
  if (!fromTelegram(req)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  try {
    await handleUpdate((await req.json()) as TgUpdate);
  } catch (err) {
    console.error("[telegram] update", err);
  }
  return NextResponse.json({ ok: true });
}
