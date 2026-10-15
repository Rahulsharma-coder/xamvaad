/**
 * A thin Telegram Bot API client, and the list of admins the bot serves.
 *
 * Configured by three env vars:
 *   TELEGRAM_BOT_TOKEN       from @BotFather
 *   TELEGRAM_WEBHOOK_SECRET  sent back by Telegram on every webhook call
 *   TELEGRAM_ADMINS          "telegramId:username,telegramId:username" — each
 *                            Telegram account and the Xamvaad admin it acts as
 *
 * Every send is best-effort. An alert that fails to reach Telegram must never
 * be why a post failed to publish or a report failed to file.
 */

const TIMEOUT_MS = 8_000;

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://xamvaad.vercel.app").replace(/\/$/, "");
}

/** Escapes text for Telegram's HTML parse mode. */
export function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type Button = { text: string; data?: string; url?: string };

export function keyboard(rows: Button[][]) {
  return {
    inline_keyboard: rows.map((row) =>
      row.map((b) => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data! }))
    ),
  };
}

export async function tg<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set.");

  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const payload = (await res.json().catch(() => null)) as
    | { ok: true; result: T }
    | { ok: false; description?: string }
    | null;
  if (!payload?.ok) {
    throw new Error(`Telegram ${method}: ${payload && "description" in payload ? payload.description : res.status}`);
  }
  return payload.result;
}

export function send(chatId: number, text: string, rows?: Button[][], extra: Record<string, unknown> = {}) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(rows ? { reply_markup: keyboard(rows) } : {}),
    ...extra,
  });
}

/** Telegram id -> Xamvaad username, from TELEGRAM_ADMINS. */
export function telegramAdmins(): Map<number, string> {
  const admins = new Map<number, string>();
  // Forgiving about what a dashboard paste brings along: quotes, which Vercel
  // keeps as part of the value, spaces, newlines, and an "@" on the username.
  const raw = (process.env.TELEGRAM_ADMINS ?? "").replace(/["'\s@]/g, "");
  for (const pair of raw.split(/[,;]/)) {
    const [id, username] = pair.split(":");
    if (id && username && /^\d+$/.test(id)) admins.set(Number(id), username);
  }
  return admins;
}

/** Sends an alert to every admin. Never throws. */
export async function notifyAdmins(text: string, rows?: Button[][]): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  await Promise.all(
    [...telegramAdmins().keys()].map((chatId) =>
      send(chatId, text, rows).catch((err) => console.error("[telegram] alert", chatId, err))
    )
  );
}
