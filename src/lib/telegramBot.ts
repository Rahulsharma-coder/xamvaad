import type { ExamStage, StageStatus } from "@/prisma/client";
import { db } from "./db";
import type { SessionUser } from "./auth";
import { STAGE_LABEL, deriveStageStatus, phaseStages, stageHasEnd, stageLabel, stagesFor } from "./lifecycle";
import { VISIBLE_POST } from "./queries";
import { getFeedAlert } from "./feedHealth";
import { dateTime } from "./format";
import { FeedStageError, resolveFeedItemStage } from "./officialFeed";
import {
  applyStageChange,
  formatStageDates,
  istDay,
  parseStageDates,
  type StageChange,
} from "./stageOps";
import { type Button, esc, keyboard, send, siteUrl, telegramAdmins, tg } from "./telegram";

/**
 * The admin bot: exam lifecycles, the official feed, and the numbers that
 * need a decision — from a phone.
 *
 * Navigation edits one message in place (exam -> phase -> stage), so a chat
 * doesn't fill with menus. Every change goes through a confirm button,
 * because a stage's dates gate what aspirants may post.
 *
 * Callback data stays under Telegram's 64 bytes by using one-letter stage
 * codes and ids only:
 *   ex:<examId>  ph:<phaseId>  sg:<phaseId>:<code>  td / dt / tb same shape
 *   ov:<phaseId>:<code>:<D|A|P|X>   ok:<phaseId>:<code>:<op>   fs:<itemId>:<phaseId>
 */

// ---------------------------------------------------------------------------
// Telegram shapes, as much of them as the bot reads
// ---------------------------------------------------------------------------

type TgUser = { id: number; first_name?: string };
type TgEntity = { type: string; url?: string };
type TgMessage = {
  message_id: number;
  chat: { id: number };
  from?: TgUser;
  text?: string;
  entities?: TgEntity[];
  reply_to_message?: TgMessage;
};
type TgCallback = { id: string; from: TgUser; data?: string; message?: TgMessage };
export type TgUpdate = { message?: TgMessage; callback_query?: TgCallback };

type Screen = { text: string; rows: Button[][] };

const CODE: Record<ExamStage, string> = {
  ADMIT_CARD: "K",
  CONDUCTED: "C",
  ANSWER_KEY_RELEASED: "A",
  OBJECTION_WINDOW: "O",
  FINAL_KEY: "F",
  RESULT: "R",
};
const STAGE_BY_CODE = Object.fromEntries(
  Object.entries(CODE).map(([stage, code]) => [code, stage as ExamStage])
) as Record<string, ExamStage>;

const OVERRIDE: Record<string, StageStatus | null> = { D: "DONE", A: "ACTIVE", P: "PENDING", X: null };

const ICON: Record<StageStatus, string> = { DONE: "✅", ACTIVE: "🟢", PENDING: "⏳" };

// ---------------------------------------------------------------------------
// Who is asking
// ---------------------------------------------------------------------------

async function actorFor(telegramId: number): Promise<SessionUser | null> {
  const username = telegramAdmins().get(telegramId);
  if (!username) return null;
  const user = await db.user.findFirst({
    where: { username, role: "ADMIN", isBanned: false },
    select: { id: true, name: true, username: true, email: true, image: true, role: true },
  });
  return user;
}

export async function handleUpdate(update: TgUpdate): Promise<void> {
  const callback = update.callback_query;
  const message = update.message;
  const from = callback?.from ?? message?.from;
  if (!from) return;

  const actor = await actorFor(from.id);

  if (callback) {
    if (!actor) {
      await answer(callback.id, "Yeh bot sirf Xamvaad admins ke liye hai.");
      return;
    }
    await onCallback(callback, actor);
    return;
  }

  if (message) {
    if (!actor) {
      await send(
        message.chat.id,
        `Yeh bot sirf Xamvaad admins ke liye hai.\n\nAapki Telegram ID: <code>${from.id}</code>`
      );
      return;
    }
    await onMessage(message, actor);
  }
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

const HELP = [
  "<b>Xamvaad Admin Bot</b>",
  "",
  "/exams — exam cycle dekho aur badlo",
  "/feed — Sarkari Result feed ka haal",
  "/stats — users, posts, reports",
  "/help — yeh list",
  "",
  "Feed fail ho, nayi auto-post bane ya koi report aaye, toh alert yahin aayega.",
].join("\n");

async function onMessage(message: TgMessage, actor: SessionUser) {
  const chatId = message.chat.id;
  const text = message.text?.trim() ?? "";

  // A reply to a "type the dates" prompt.
  const ref = message.reply_to_message && promptRef(message.reply_to_message);
  if (ref) {
    await onDatesTyped(chatId, ref.phaseId, ref.stage, text);
    return;
  }

  const command = text.split(/\s+/)[0]!.replace(/@.*$/, "").toLowerCase();
  switch (command) {
    case "/start":
      await send(chatId, `Namaste ${esc(actor.name)}! Aap <b>${esc(actor.username)}</b> ke roop mein jude ho.\n\n${HELP}`);
      return;
    case "/exams": {
      const screen = await examsScreen();
      await send(chatId, screen.text, screen.rows);
      return;
    }
    case "/feed": {
      const screen = await feedScreen();
      await send(chatId, screen.text, screen.rows);
      return;
    }
    case "/stats":
      await send(chatId, await statsText());
      return;
    default:
      await send(chatId, HELP);
  }
}

// ---------------------------------------------------------------------------
// Callbacks
// ---------------------------------------------------------------------------

async function onCallback(callback: TgCallback, actor: SessionUser) {
  const message = callback.message;
  const [action, a = "", b = "", c = ""] = (callback.data ?? "").split(":");
  if (!message) {
    await answer(callback.id);
    return;
  }
  const chatId = message.chat.id;
  const show = (screen: Screen) => edit(chatId, message.message_id, screen);

  try {
    switch (action) {
      case "exl":
        await show(await examsScreen());
        break;
      case "ex":
        await show(await phasesScreen(a));
        break;
      case "ph":
        await show(await stagesScreen(a));
        break;
      case "sg":
        await show(await stageScreen(a, STAGE_BY_CODE[b]!));
        break;
      case "td":
        await show(await confirmScreen(a, STAGE_BY_CODE[b]!, `d${ymd(istDay())}`));
        break;
      case "ov":
        await show(await confirmScreen(a, STAGE_BY_CODE[b]!, `o${c}`));
        break;
      case "tb":
        await show(await confirmScreen(a, STAGE_BY_CODE[b]!, "t"));
        break;
      case "dt":
        await promptDates(chatId, a, STAGE_BY_CODE[b]!);
        break;
      case "ok": {
        const stage = STAGE_BY_CODE[b]!;
        const result = await applyStageChange({
          phaseId: a,
          stage,
          change: decodeOp(c),
          actor,
          via: "Telegram",
        });
        await show({
          text:
            `✅ ${esc(result.summary)}` +
            (result.notified > 0 ? `\n\n${result.notified} users ko notification gayi.` : ""),
          rows: [[{ text: "« Stages par wapas", data: `ph:${a}` }]],
        });
        break;
      }
      case "fs": {
        const { note } = await resolveFeedItemStage({ itemId: a, phaseId: b, actor });
        await edit(chatId, message.message_id, {
          text: `${message.text ? esc(message.text) + "\n\n" : ""}✅ ${esc(note)}`,
          rows: [],
        });
        break;
      }
      default:
        break;
    }
    await answer(callback.id);
  } catch (err) {
    const text =
      err instanceof FeedStageError || err instanceof Error ? err.message : "Kuch galat ho gaya.";
    console.error("[telegram] callback", callback.data, err);
    await answer(callback.id, text.slice(0, 190), true);
  }
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

async function examsScreen(): Promise<Screen> {
  const exams = await db.exam.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, year: true },
  });
  if (exams.length === 0) return { text: "Koi active exam nahi hai.", rows: [] };

  const rows: Button[][] = [];
  for (let i = 0; i < exams.length; i += 2) {
    rows.push(exams.slice(i, i + 2).map((e) => ({ text: examTitle(e), data: `ex:${e.id}` })));
  }
  return { text: "<b>Kaun sa exam?</b>", rows };
}

async function phasesScreen(examId: string): Promise<Screen> {
  const exam = await db.exam.findUniqueOrThrow({
    where: { id: examId },
    select: {
      name: true,
      year: true,
      phases: { select: { id: true, name: true }, orderBy: { sequence: "asc" } },
    },
  });
  // One phase: there is nothing to choose, so go straight to its stages.
  if (exam.phases.length === 1) return stagesScreen(exam.phases[0]!.id);

  return {
    text: `<b>${esc(examTitle(exam))}</b>\nKaun sa phase?`,
    rows: [
      exam.phases.map((p) => ({ text: p.name, data: `ph:${p.id}` })),
      [{ text: "« Exams", data: "exl" }],
    ],
  };
}

async function stagesScreen(phaseId: string): Promise<Screen> {
  const phase = await loadPhase(phaseId);
  const entries = phaseStages(phase.kind, phase.stages);
  const lines = entries.map((entry) => {
    const status = deriveStageStatus(entry);
    const manual = entry.statusOverride ? " (manual)" : "";
    return `${ICON[status]} ${stageLabel(entry.stage, phase)} — ${formatStageDates(entry.startsAt, entry.endsAt)}${manual}`;
  });

  const buttons = entries.map(({ stage }) => ({ text: stageLabel(stage, phase), data: `sg:${phaseId}:${CODE[stage]}` }));
  const buttonRows: Button[][] = [];
  for (let i = 0; i < buttons.length; i += 2) buttonRows.push(buttons.slice(i, i + 2));
  return {
    text: `<b>${esc(phaseTitle(phase))}</b>\n\n${lines.join("\n")}`,
    rows: [
      ...buttonRows,
      [
        phase.exam.phases.length > 1
          ? { text: "« Phases", data: `ex:${phase.exam.id}` }
          : { text: "« Exams", data: "exl" },
      ],
    ],
  };
}

async function stageScreen(phaseId: string, stage: ExamStage): Promise<Screen> {
  const phase = await loadPhase(phaseId);
  const entry = phase.stages.find((s) => s.stage === stage) ?? emptyStage(stage);
  const status = deriveStageStatus(entry);
  const code = CODE[stage];

  const rows: Button[][] = [
    [
      { text: "📅 Aaj hua", data: `td:${phaseId}:${code}` },
      { text: "✏️ Dates likho", data: `dt:${phaseId}:${code}` },
    ],
    [
      { text: "✅ Done", data: `ov:${phaseId}:${code}:D` },
      { text: "🟢 Active", data: `ov:${phaseId}:${code}:A` },
      { text: "⏳ Pending", data: `ov:${phaseId}:${code}:P` },
    ],
    [
      ...(entry.statusOverride ? [{ text: "↩️ Dates se chalne do", data: `ov:${phaseId}:${code}:X` }] : []),
      { text: "🗑 TBA karo", data: `tb:${phaseId}:${code}` },
    ],
    [{ text: "« Stages", data: `ph:${phaseId}` }],
  ];

  return {
    text:
      `<b>${esc(phaseTitle(phase))} · ${stageLabel(stage, phase)}</b>\n\n` +
      `Abhi: ${ICON[status]} ${formatStageDates(entry.startsAt, entry.endsAt)}` +
      (entry.statusOverride ? ` (manual: ${entry.statusOverride.toLowerCase()})` : "") +
      (stage === "OBJECTION_WINDOW"
        ? "\n\n⚠️ Isi window se tay hota hai ki users objection post kar sakte hain ya nahi."
        : stage === "CONDUCTED" && phase.kind === "WRITTEN"
          ? "\n\n⚠️ Exam Window shuru hone par hi Memory Question aur Cutoff posts khulte hain."
          : ""),
    rows,
  };
}

async function confirmScreen(phaseId: string, stage: ExamStage, op: string): Promise<Screen> {
  const phase = await loadPhase(phaseId);
  const change = decodeOp(op);
  const what =
    change.kind === "dates"
      ? `<b>${formatStageDates(change.startsAt, change.endsAt)}</b> set karoon?`
      : change.kind === "override"
        ? change.status
          ? `<b>${change.status.toLowerCase()}</b> par pin karoon? Dates ko ignore karega.`
          : "Override hata kar dates se chalne doon?"
        : "<b>TBA</b> karoon? Dates aur override dono hat jayenge.";

  return {
    text: `<b>${esc(phaseTitle(phase))} · ${stageLabel(stage, phase)}</b>\n\n${what}`,
    rows: [
      [
        { text: "✅ Haan", data: `ok:${phaseId}:${CODE[stage]}:${op}` },
        { text: "❌ Nahi", data: `sg:${phaseId}:${CODE[stage]}` },
      ],
    ],
  };
}

async function feedScreen(): Promise<Screen> {
  const [alert, lastRun, items] = await Promise.all([
    getFeedAlert(),
    db.feedRun.findFirst({ orderBy: { createdAt: "desc" }, select: { status: true, createdAt: true } }),
    db.feedItem.findMany({
      where: { status: { not: "NO_EXAM_MATCH" } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        title: true,
        status: true,
        postId: true,
        stage: true,
        stagePhaseId: true,
        createdAt: true,
        exam: { select: { phases: { select: { id: true, name: true, kind: true }, orderBy: { sequence: "asc" } } } },
      },
    }),
  ]);

  const head = alert
    ? alert.kind === "failing"
      ? `🔴 <b>Feed fail ho rahi hai</b> ${dateTime(alert.since)} se (${alert.failedRuns} runs).\n${esc(alert.error ?? "")}`
      : `🟠 <b>Feed ${dateTime(alert.lastRun)} se nahi chali.</b> GitHub Actions check karo.`
    : lastRun
      ? `✅ Feed theek chal rahi hai. Aakhri run: ${dateTime(lastRun.createdAt)}`
      : "Feed abhi tak ek baar bhi nahi chali.";

  const lines = items.map((item) => {
    const mark = item.status === "PUBLISHED" ? "📢" : "⏭";
    const post = item.postId ? ` · <a href="${siteUrl()}/posts/${item.postId}">post</a>` : "";
    return `${mark} ${esc(item.title)} <i>(${item.status.toLowerCase().replace(/_/g, " ")})</i>${post}`;
  });

  // Updates still waiting to be placed on a phase.
  const rows: Button[][] = [];
  for (const item of items) {
    if (!item.stage || item.stagePhaseId || !item.exam) continue;
    rows.push([{ text: `${STAGE_LABEL[item.stage]} kis phase ka? (${item.title.slice(0, 30)}…)`, data: "noop" }]);
    const stage = item.stage;
    rows.push(
      item.exam.phases
        .filter((p) => stagesFor(p.kind).includes(stage))
        .map((p) => ({ text: p.name, data: `fs:${item.id}:${p.id}` }))
    );
  }

  return {
    text: `${head}\n\n<b>Hamare exams ki recent updates</b>\n${lines.join("\n") || "Abhi koi nahi."}`,
    rows,
  };
}

async function statsText(): Promise<string> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [users, newUsers, posts, openReports, updates] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: weekAgo } } }),
    db.post.count({ where: VISIBLE_POST }),
    db.report.count({ where: { status: "OPEN" } }),
    db.post.count({ where: { ...VISIBLE_POST, type: "OFFICIAL_UPDATE", createdAt: { gte: weekAgo } } }),
  ]);
  return [
    "<b>Xamvaad abhi</b>",
    "",
    `👥 Users: ${users} (is hafte ${newUsers} naye)`,
    `📝 Posts: ${posts}`,
    `📢 Official Updates is hafte: ${updates}`,
    `🚩 Open reports: ${openReports}${openReports ? ` · <a href="${siteUrl()}/admin/reports">dekho</a>` : ""}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Typing dates
// ---------------------------------------------------------------------------

/**
 * Asks for dates as a forced reply. Which stage the answer belongs to rides
 * along as the link on the phase name, so it comes back in the reply without
 * the bot keeping any conversation state.
 */
async function promptDates(chatId: number, phaseId: string, stage: ExamStage) {
  const phase = await loadPhase(phaseId);
  const link = `${siteUrl()}/admin/exams/${phase.exam.slug}?tg=${phaseId}.${CODE[stage]}`;
  const example = stageHasEnd(stage) ? "<code>4-10 Oct</code> ya <code>28 Sep - 3 Oct</code>" : "<code>15 Oct</code> ya <code>aaj</code>";

  await send(
    chatId,
    `<b>${esc(phase.exam.name)} · <a href="${link}">${esc(phase.name)}</a> · ${stageLabel(stage, phase)}</b>\n\nIs message ka reply karke date likho, jaise ${example}.`,
    undefined,
    { reply_markup: { force_reply: true, input_field_placeholder: stageHasEnd(stage) ? "4-10 Oct" : "15 Oct" } }
  );
}

function promptRef(message: TgMessage): { phaseId: string; stage: ExamStage } | null {
  for (const entity of message.entities ?? []) {
    const match = entity.url?.match(/[?&]tg=([a-z0-9]+)\.([A-Z])$/);
    if (match && STAGE_BY_CODE[match[2]!]) return { phaseId: match[1]!, stage: STAGE_BY_CODE[match[2]!]! };
  }
  return null;
}

async function onDatesTyped(chatId: number, phaseId: string, stage: ExamStage, text: string) {
  const parsed = parseStageDates(text);
  if (!parsed) {
    await send(chatId, `"${esc(text)}" samajh nahi aaya. Aise likho: <code>15 Oct</code>, <code>4-10 Oct</code> ya <code>28 Sep - 3 Oct</code>.`);
    await promptDates(chatId, phaseId, stage);
    return;
  }
  if (parsed.endsAt && !stageHasEnd(stage)) {
    await send(chatId, `${STAGE_LABEL[stage]} ek hi din hota hai, toh ek date likho.`);
    await promptDates(chatId, phaseId, stage);
    return;
  }
  if (parsed.endsAt && parsed.endsAt < parsed.startsAt) {
    await send(chatId, "Aakhri date pehli date se pehle hai. Dobara likho.");
    await promptDates(chatId, phaseId, stage);
    return;
  }
  const op = `d${ymd(parsed.startsAt)}${parsed.endsAt ? `-${ymd(parsed.endsAt)}` : ""}`;
  const screen = await confirmScreen(phaseId, stage, op);
  await send(chatId, screen.text, screen.rows);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function fromYmd(text: string): Date {
  return new Date(`${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T00:00:00.000Z`);
}

function decodeOp(op: string): StageChange {
  if (op === "t") return { kind: "tba" };
  if (op.startsWith("o")) return { kind: "override", status: OVERRIDE[op.slice(1)] ?? null };
  const [start, end] = op.slice(1).split("-");
  return { kind: "dates", startsAt: fromYmd(start!), endsAt: end ? fromYmd(end) : null };
}

function emptyStage(stage: ExamStage) {
  return { stage, statusOverride: null, startsAt: null, endsAt: null };
}

function examTitle(exam: { name: string; year: number }): string {
  const name = exam.name.replace(/\s+/g, " ").trim();
  return /\b20\d{2}\b/.test(name) ? name : `${name} ${exam.year}`;
}

function phaseTitle(phase: { name: string; exam: { name: string; year: number; phases: unknown[] } }): string {
  const exam = examTitle(phase.exam);
  return phase.exam.phases.length > 1 ? `${exam} · ${phase.name}` : exam;
}

async function loadPhase(phaseId: string) {
  return db.examPhase.findUniqueOrThrow({
    where: { id: phaseId },
    select: {
      id: true,
      name: true,
      kind: true,
      exam: {
        select: { id: true, name: true, slug: true, year: true, phases: { select: { id: true } } },
      },
      stages: { select: { stage: true, statusOverride: true, startsAt: true, endsAt: true } },
    },
  });
}

async function edit(chatId: number, messageId: number, screen: Screen) {
  try {
    await tg("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: screen.text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: keyboard(screen.rows),
    });
  } catch (err) {
    // Pressing the same button twice leaves the text unchanged, which
    // Telegram reports as an error. Nothing to do about it.
    if (!String(err).includes("message is not modified")) throw err;
  }
}

async function answer(callbackId: string, text?: string, alert = false) {
  await tg("answerCallbackQuery", {
    callback_query_id: callbackId,
    ...(text ? { text, show_alert: alert } : {}),
  }).catch(() => {});
}
