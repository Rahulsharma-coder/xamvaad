import { Prisma } from "@/prisma/client";
import type { ExamStage, FeedItemStatus, FeedRunStatus, PhaseKind } from "@/prisma/client";
import { db } from "./db";
import { audit } from "./audit";
import { publishOfficialUpdate } from "./officialUpdates";
import { STAGE_LABEL, stagesFor } from "./lifecycle";
import { istDay } from "./stageOps";
import type { SessionUser } from "./auth";
import { type Button, esc, notifyAdmins, siteUrl } from "./telegram";

/**
 * Official Updates from the Sarkari Result feed.
 *
 * Sarkari Result is used as a trigger, never as a source. Its feed says that
 * something happened ("RRB NTPC UG Online Form 2026"); the post we publish is
 * our own Hindi sentence about it, and the only link in it is the board's own
 * `.gov.in` / `.nic.in` page. Their page text, tables and the PDFs they mirror
 * on their own domain are never copied — if no government link can be found,
 * nothing is published.
 *
 * The job runs hourly, which is how often the feed itself updates, and an
 * entry's page is fetched only once it has matched one of our exams — a
 * couple of times a day.
 */

export const FEED_URL = "https://www.sarkariresult.com/feed_rss.xml";

const USER_AGENT = "XamvaadBot/1.0 (+https://xamvaad.vercel.app)";
const FETCH_TIMEOUT_MS = 15_000;
/** Far longer than a run can take, so an older claim was abandoned. */
const STALE_CLAIM_MS = 30 * 60 * 1000;

type UpdateKind = {
  id: string;
  /** Matched against the normalised feed title. */
  title: RegExp;
  /** Picks the right link on the entry's page, which lists every past one too. */
  link: RegExp;
  headline: (feedTitle: string) => string;
  sentence: (exam: string) => string;
  /** The lifecycle stage this kind of update completes, if any. */
  stage?: ExamStage;
};

const RESULT: UpdateKind = {
  id: "RESULT",
  title: /\b(result|merit list|score ?card)\b/,
  link: /result|marks|merit|score/i,
  headline: (t) => (/\bfinal result\b/.test(t) ? "अंतिम परिणाम जारी" : "परिणाम जारी"),
  sentence: (exam) =>
    `${exam} का परिणाम जारी कर दिया गया है। अपना परिणाम आधिकारिक वेबसाइट पर देखें।`,
  stage: "RESULT",
};

/**
 * Ordered: the first match wins. A final key comes before the answer key it
 * also names, answer keys before results because a title can name both, and
 * corrections before "online form" because a correction window is announced
 * as "Online Form Correction".
 */
const KINDS: UpdateKind[] = [
  {
    id: "FINAL_KEY",
    title: /\bfinal (answer )?key\b/,
    link: /final|answer key/i,
    headline: () => "फाइनल आंसर की जारी",
    sentence: (exam) =>
      `${exam} की फाइनल आंसर की जारी कर दी गई है। आपत्तियों के बाद तय हुए अंतिम उत्तर आधिकारिक वेबसाइट पर देखें।`,
    stage: "FINAL_KEY",
  },
  {
    id: "ANSWER_KEY",
    title: /\banswer key\b/,
    link: /answer key|objection/i,
    headline: () => "आंसर की जारी",
    sentence: (exam) =>
      `${exam} की आंसर की जारी कर दी गई है। अपने उत्तर मिलाएँ और किसी उत्तर पर आपत्ति हो तो तय समय-सीमा में दर्ज करें।`,
    stage: "ANSWER_KEY_RELEASED",
  },
  RESULT,
  {
    id: "CUTOFF",
    title: /\bcut ?off\b/,
    link: /cut ?off/i,
    headline: () => "कट-ऑफ जारी",
    sentence: (exam) =>
      `${exam} के कट-ऑफ अंक जारी कर दिए गए हैं। श्रेणीवार कट-ऑफ आधिकारिक सूचना में देखें।`,
  },
  // "Marks" alone is a result ("Result / Marks"), but "Cut Off Marks" is a
  // cutoff, so it is only read as a result once cutoff has had its turn.
  { ...RESULT, title: /\bmarks\b/ },
  {
    id: "ADMIT_CARD",
    title: /\b(admit card|hall ticket|call letter)\b/,
    link: /admit card|hall ticket|call letter/i,
    headline: () => "एडमिट कार्ड जारी",
    sentence: (exam) =>
      `${exam} के एडमिट कार्ड जारी कर दिए गए हैं। आधिकारिक वेबसाइट से अपना एडमिट कार्ड डाउनलोड करें और परीक्षा केंद्र, तिथि व शिफ्ट जाँच लें।`,
    // Only typing tests, PETs and the like track an admit card; on a written
    // paper there is no such stage and nothing is marked.
    stage: "ADMIT_CARD",
  },
  {
    id: "EXAM_CITY",
    title: /\b(exam city|city intimation|city slip)\b/,
    link: /city/i,
    headline: () => "परीक्षा शहर की सूचना जारी",
    sentence: (exam) =>
      `${exam} के लिए परीक्षा शहर की सूचना जारी कर दी गई है। अपना परीक्षा शहर आधिकारिक वेबसाइट पर देखें।`,
  },
  {
    id: "EXAM_DATE",
    title: /\b(exam date|exam schedule|exam calendar|date sheet|time table)\b/,
    link: /date|schedule|calendar|time table/i,
    headline: () => "परीक्षा तिथि घोषित",
    sentence: (exam) =>
      `${exam} की परीक्षा तिथि घोषित कर दी गई है। पूरा परीक्षा कार्यक्रम आधिकारिक सूचना में देखें।`,
  },
  {
    id: "APPLICATION_STATUS",
    title: /\bapplication status\b/,
    link: /status/i,
    headline: () => "आवेदन की स्थिति जारी",
    sentence: (exam) =>
      `${exam} के आवेदन की स्थिति जारी कर दी गई है। आपका आवेदन स्वीकार हुआ या नहीं, आधिकारिक वेबसाइट पर देखें।`,
  },
  {
    id: "CORRECTION",
    title: /\b(correction|edit form|modification)\b/,
    link: /correction|edit|modif/i,
    headline: () => "आवेदन में सुधार का मौका",
    sentence: (exam) =>
      `${exam} के आवेदन फ़ॉर्म में सुधार का मौका दिया गया है। अंतिम तिथि से पहले अपना फ़ॉर्म जाँच लें।`,
  },
  {
    id: "SYLLABUS",
    title: /\bsyllabus\b/,
    link: /syllabus/i,
    headline: () => "सिलेबस जारी",
    sentence: (exam) =>
      `${exam} का सिलेबस और परीक्षा पैटर्न जारी कर दिया गया है।`,
  },
  {
    id: "APPLY",
    title: /\b(online form|apply online|registration)\b/,
    link: /apply|registration|login/i,
    headline: () => "ऑनलाइन आवेदन शुरू",
    sentence: (exam) =>
      `${exam} के लिए ऑनलाइन आवेदन शुरू हो गए हैं। आवेदन करने से पहले आधिकारिक अधिसूचना में योग्यता, शुल्क और अंतिम तिथि ध्यान से पढ़ें।`,
  },
  {
    id: "NOTIFICATION",
    title: /\bnotification\b/,
    link: /notification/i,
    headline: () => "अधिसूचना जारी",
    sentence: (exam) =>
      `${exam} की आधिकारिक अधिसूचना जारी कर दी गई है। पद, योग्यता और महत्वपूर्ण तिथियों की जानकारी अधिसूचना में देखें।`,
  },
];

const FOOTER =
  "पूरी जानकारी नीचे दिए गए आधिकारिक लिंक पर देखें। यह सूचना आधिकारिक वेबसाइट के आधार पर अपने आप तैयार की गई है, इसलिए कोई भी कदम उठाने से पहले वहाँ जानकारी ज़रूर जाँच लें।";

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export type FeedEntry = {
  title: string;
  link: string;
  guid: string;
  publishedAt: Date | null;
};

function decodeEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

function tag(block: string, name: string): string | null {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return match ? decodeEntities(match[1]!) : null;
}

export function parseFeed(xml: string): FeedEntry[] {
  const entries: FeedEntry[] = [];
  for (const [, block] of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const title = tag(block!, "title");
    const link = tag(block!, "link");
    if (!title || !link) continue;
    const pubDate = tag(block!, "pubDate");
    const date = pubDate ? new Date(pubDate) : null;
    entries.push({
      title,
      link,
      guid: tag(block!, "guid") ?? link,
      publishedAt: date && !Number.isNaN(date.getTime()) ? date : null,
    });
  }
  return entries;
}

/** Lowercase words, keeping "+" so "10+2" survives. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, " ")
    .trim();
}

export function classify(title: string): UpdateKind | null {
  const words = normalise(title);
  return KINDS.find((kind) => kind.title.test(words)) ?? null;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export type FeedExam = {
  id: string;
  name: string;
  shortName: string;
  year: number;
  boardId: string;
  feedKeywords: string[];
  board: { name: string };
  phases: FeedPhase[];
};

type FeedPhase = { id: string; name: string; shortName: string; kind: PhaseKind };

type ExamMatch =
  | { kind: "match"; exam: FeedExam }
  | { kind: "ambiguous"; exams: FeedExam[] }
  | { kind: "none" };

/**
 * The exam whose longest phrase appears in the title, as whole words.
 *
 * Longest wins so "RRB NTPC Under Graduate" beats a bare "RRB NTPC". Two exams
 * tying is a refusal rather than a guess: announcing the wrong exam to every
 * user is worse than not announcing at all.
 */
export function matchExam(title: string, exams: FeedExam[]): ExamMatch {
  const haystack = ` ${normalise(title)} `;
  const contains = (phrase: string) => {
    const words = normalise(phrase);
    return words.length > 0 && haystack.includes(` ${words} `);
  };

  let best: FeedExam[] = [];
  let bestLength = 0;

  for (const exam of exams) {
    const exclusions = exam.feedKeywords.filter((p) => p.trim().startsWith("-"));
    if (exclusions.some((p) => contains(p.trim().slice(1)))) continue;

    const length = Math.max(
      0,
      ...exam.feedKeywords
        .filter((p) => !p.trim().startsWith("-") && contains(p))
        .map((p) => normalise(p).length)
    );
    if (length === 0) continue;

    if (length > bestLength) {
      best = [exam];
      bestLength = length;
    } else if (length === bestLength) {
      best.push(exam);
    }
  }

  if (best.length === 0) return { kind: "none" };
  if (best.length > 1) return { kind: "ambiguous", exams: best };
  return { kind: "match", exam: best[0]! };
}

/**
 * Our exams are one cycle each. A title naming years, none of them ours, is
 * about another cycle — "CGL 2025 Final Result" is not news for CGL 2026.
 */
export function sameCycle(title: string, year: number): boolean {
  const years = title.match(/\b20\d{2}\b/g);
  return !years || years.includes(String(year));
}

// ---------------------------------------------------------------------------
// The lifecycle stage
// ---------------------------------------------------------------------------

/** Words in nearly every feed title, so useless for telling tiers apart. */
const GENERIC_PHASE_WORDS = new Set(["exam", "test", "paper", "phase", "written"]);

const ROMAN: Record<string, string> = { "1": "i", "2": "ii", "3": "iii", "4": "iv" };
const ARABIC: Record<string, string> = { i: "1", ii: "2", iii: "3", iv: "4" };

/** "Tier 1" also as "Tier I", "Prelims" also as "Pre", and so on. */
function phaseAliases(phase: FeedPhase): string[] {
  const aliases = new Set<string>();
  for (const raw of [phase.name, phase.shortName]) {
    const words = normalise(raw);
    // "T" or "P" alone would match half the titles in the feed.
    if (words.length < 2 || GENERIC_PHASE_WORDS.has(words)) continue;
    aliases.add(words);
    aliases.add(words.replace(/\b([1-4])\b/g, (d) => ROMAN[d]!));
    aliases.add(words.replace(/\b(i{1,3}|iv)\b/g, (r) => ARABIC[r]!));
    if (/\bprelim/.test(words)) ["pre", "prelims", "preliminary"].forEach((a) => aliases.add(a));
    if (/\bmains?\b/.test(words)) ["main", "mains"].forEach((a) => aliases.add(a));
  }
  return [...aliases];
}

/**
 * Which tier a feed title is about: the one it names, or the only one the
 * exam has. Null when that can't be told — "CGL Result" for an exam with
 * three tiers is left for an admin rather than guessed.
 */
export function resolvePhase(title: string, phases: FeedPhase[]): FeedPhase | null {
  if (phases.length === 1) return phases[0]!;
  const haystack = ` ${normalise(title)} `;
  const named = phases.filter((p) =>
    phaseAliases(p).some((alias) => haystack.includes(` ${alias} `))
  );
  return named.length === 1 ? named[0]! : null;
}

/** The phases that have this stage at all: an admit card only off paper. */
export function phasesWithStage<T extends { kind: PhaseKind }>(phases: T[], stage: ExamStage): T[] {
  return phases.filter((p) => stagesFor(p.kind).includes(stage));
}

/**
 * The stage an update marks, and on which phase.
 *
 * Nothing when no phase of the exam has that stage (an admit card for a
 * written-only exam) or when the title names a phase without it. A phase
 * left null is for an admin to choose, from the phases that do have it.
 */
function stageFor(
  kind: UpdateKind,
  phase: FeedPhase | null,
  phases: FeedPhase[]
): { stage: ExamStage; phase: FeedPhase | null } | undefined {
  if (!kind.stage) return undefined;
  const eligible = phasesWithStage(phases, kind.stage);
  if (eligible.length === 0) return undefined;
  if (phase) return eligible.includes(phase) ? { stage: kind.stage, phase } : undefined;
  return { stage: kind.stage, phase: null };
}

/**
 * Marks a stage as having happened on the day of the update.
 *
 * An admin's own entry wins: a stage they dated in the past or pinned with an
 * override is left alone. A date still in the future was only a forecast, and
 * the update is proof it has now happened, so that one is replaced.
 *
 * The stage's own notification is marked as sent, because the Official Update
 * already told everyone — otherwise the same news would arrive twice.
 */
export async function markStageFromFeed(
  phaseId: string,
  stage: ExamStage,
  at: Date
): Promise<{ marked: boolean; note: string; phaseName: string }> {
  const day = istDay(at);
  const [phase, existing] = await Promise.all([
    db.examPhase.findUniqueOrThrow({ where: { id: phaseId }, select: { name: true, kind: true } }),
    db.examStageEntry.findUnique({
      where: { phaseId_stage: { phaseId, stage } },
      select: { startsAt: true, statusOverride: true },
    }),
  ]);
  const label = STAGE_LABEL[stage];

  if (existing?.statusOverride || (existing?.startsAt && existing.startsAt <= day)) {
    return {
      marked: false,
      phaseName: phase.name,
      note: `${phase.name} already had ${label} set, so it was left as the admin set it.`,
    };
  }

  const data = { startsAt: day, startAnnouncedAt: new Date() };
  await db.examStageEntry.upsert({
    where: { phaseId_stage: { phaseId, stage } },
    create: { phaseId, stage, sortOrder: stagesFor(phase.kind).indexOf(stage) + 1, ...data },
    update: data,
  });

  return {
    marked: true,
    phaseName: phase.name,
    note: `Marked ${label} on ${phase.name} for ${day.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })}.`,
  };
}

/**
 * Finishes a published update whose phase the job couldn't tell, once an
 * admin has said which phase it was — from the admin panel or Telegram.
 */
export async function resolveFeedItemStage(input: {
  itemId: string;
  phaseId: string;
  actor: SessionUser;
  /** Board scope check, for a board moderator in the admin panel. */
  allowBoard?: (boardId: string) => boolean;
}): Promise<{ note: string }> {
  const item = await db.feedItem.findUnique({
    where: { id: input.itemId },
    select: {
      title: true,
      stage: true,
      publishedAt: true,
      createdAt: true,
      exam: { select: { id: true, name: true, boardId: true } },
    },
  });
  if (!item?.stage || !item.exam) {
    throw new FeedStageError(404, "That feed update has no stage to mark.");
  }
  if (input.allowBoard && !input.allowBoard(item.exam.boardId)) {
    throw new FeedStageError(403, "That exam is outside the boards you moderate.");
  }

  const phase = await db.examPhase.findFirst({
    where: { id: input.phaseId, examId: item.exam.id },
    select: { id: true, name: true, kind: true },
  });
  if (!phase) throw new FeedStageError(400, "That phase doesn't belong to this exam.");
  if (!stagesFor(phase.kind).includes(item.stage)) {
    throw new FeedStageError(400, `${phase.name} has no ${STAGE_LABEL[item.stage]} stage.`);
  }

  const result = await markStageFromFeed(phase.id, item.stage, item.publishedAt ?? item.createdAt);

  await db.feedItem.update({
    where: { id: input.itemId },
    data: { stagePhaseId: phase.id, stageNote: result.note },
  });

  await audit({
    actor: input.actor,
    action: "exam.stage.update",
    targetType: "Exam",
    targetId: item.exam.id,
    summary: result.marked
      ? `Marked ${STAGE_LABEL[item.stage]} for ${item.exam.name} ${result.phaseName} from the feed update "${item.title}"`
      : `Left ${STAGE_LABEL[item.stage]} for ${item.exam.name} ${result.phaseName} as already set`,
  });

  return { note: result.note };
}

export class FeedStageError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "FeedStageError";
  }
}

// ---------------------------------------------------------------------------
// The official link
// ---------------------------------------------------------------------------

function isGovernmentHost(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return (
    (url.protocol === "https:" || url.protocol === "http:") &&
    (host.endsWith(".gov.in") || host.endsWith(".nic.in"))
  );
}

/**
 * The board's own link for this update, from the entry's page.
 *
 * The page keeps every past link for the exam, so the one whose label names
 * this kind of update is preferred, then the board's website. Links to their
 * own mirror of the PDF are never taken.
 */
export function findOfficialLink(html: string, kind: UpdateKind): string | null {
  const links: { url: string; label: string }[] = [];

  for (const [, attrs, inner] of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attrs!.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;

    let url: URL;
    try {
      url = new URL(decodeEntities(href));
    } catch {
      continue;
    }
    if (!isGovernmentHost(url)) continue;

    const title = attrs!.match(/title\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
    const text = inner!.replace(/<[^>]+>/g, " ");
    links.push({ url: url.toString(), label: decodeEntities(`${title} ${text}`) });
  }

  return (
    links.find((l) => kind.link.test(l.label))?.url ??
    links.find((l) => /official website/i.test(l.label))?.url ??
    null
  );
}

// ---------------------------------------------------------------------------
// Writing the post
// ---------------------------------------------------------------------------

/** "SSC Combined Graduate Level 2026" — the board and cycle always named. */
export function examLabel(exam: FeedExam): string {
  let label = exam.name.replace(/\s+/g, " ").trim();
  const board = exam.board.name.trim();
  // Only a one-word board name reads as a prefix; "Rajasthan Exams" does not.
  if (!/\s/.test(board) && !label.toLowerCase().includes(board.toLowerCase())) {
    label = `${board} ${label}`;
  }
  if (!/\b(19|20)\d{2}\b/.test(label)) label = `${label} ${exam.year}`;
  return label;
}

export function composePost(
  exam: FeedExam,
  kind: UpdateKind,
  feedTitle: string,
  phase: FeedPhase | null = null
) {
  // Name the tier when there is more than one: "admit card out" means nothing
  // to an aspirant who can't tell whether it is for the written exam or the
  // typing test.
  const label =
    phase && exam.phases.length > 1 ? `${examLabel(exam)} ${phase.name}` : examLabel(exam);
  return {
    title: `${label}: ${kind.headline(normalise(feedTitle))}`,
    body: `${kind.sentence(label)}\n\n${FOOTER}`,
  };
}

// ---------------------------------------------------------------------------
// The job
// ---------------------------------------------------------------------------

/** A fetch from Sarkari Result that failed, sorted by what an admin can do. */
export class FeedFetchError extends Error {
  constructor(
    public status: Exclude<FeedRunStatus, "OK">,
    message: string,
    public httpStatus: number | null = null
  ) {
    super(message);
    this.name = "FeedFetchError";
  }
}

async function fetchText(url: string, { expectFeed = false } = {}): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xml" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new FeedFetchError(
      "UNREACHABLE",
      timedOut
        ? `Sarkari Result did not answer within ${FETCH_TIMEOUT_MS / 1000} seconds.`
        : `Could not reach Sarkari Result: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (res.status === 401 || res.status === 403 || res.status === 429) {
    throw new FeedFetchError(
      "BLOCKED",
      `Sarkari Result refused the request (HTTP ${res.status}${res.status === 429 ? ", too many requests" : ""}).`,
      res.status
    );
  }
  if (res.status >= 500) {
    throw new FeedFetchError("UNREACHABLE", `Sarkari Result is down (HTTP ${res.status}).`, res.status);
  }
  if (!res.ok) {
    throw new FeedFetchError("FAILED", `Sarkari Result answered HTTP ${res.status} for ${url}.`, res.status);
  }

  const text = await res.text();
  // A bot check answers 200 with an HTML page, so a block can look like success.
  if (expectFeed && !/<rss[\s>]/i.test(text)) {
    throw new FeedFetchError(
      "BLOCKED",
      "Sarkari Result sent a web page instead of the feed, which is usually a bot check.",
      res.status
    );
  }
  return text;
}

/** The account the updates are published under. */
async function feedAuthor(): Promise<{ id: string }> {
  const username = process.env.OFFICIAL_FEED_AUTHOR?.trim();
  const author = await db.user.findFirst({
    where: username ? { username, role: "ADMIN" } : { role: "ADMIN", isBanned: false },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!author) {
    throw new Error(
      username
        ? `OFFICIAL_FEED_AUTHOR "${username}" is not an admin account.`
        : "There is no admin account to publish under."
    );
  }
  return author;
}

export type FeedReport = {
  title: string;
  status: FeedItemStatus | "SEEN";
  exam?: string;
  officialUrl?: string;
  post?: { id: string; title: string };
  /** What became of the lifecycle stage this update marks, if any. */
  stage?: string;
  error?: string;
};

type Outcome = {
  status: FeedItemStatus;
  exam?: FeedExam;
  officialUrl?: string;
  draft?: { title: string; body: string };
  /** Set when the update completes a stage; `phase` null means unclear. */
  stage?: { stage: ExamStage; phase: FeedPhase | null };
  error?: string;
};

async function evaluate(
  entry: FeedEntry,
  kind: UpdateKind | null,
  exams: FeedExam[]
): Promise<Outcome> {
  // The exam first, so the admin log can show updates about our exams that
  // were skipped for their type — those are the ones worth a manual post.
  const match = matchExam(entry.title, exams);
  if (match.kind === "none") return { status: "NO_EXAM_MATCH" };
  if (match.kind === "ambiguous") {
    return {
      status: "AMBIGUOUS",
      error: `Matches ${match.exams.map((e) => e.name).join(", ")}`,
    };
  }

  const { exam } = match;
  if (!sameCycle(entry.title, exam.year)) return { status: "OTHER_YEAR", exam };
  if (!kind) return { status: "UNKNOWN_TYPE", exam };

  const officialUrl = findOfficialLink(await fetchText(entry.link), kind);
  const phase = resolvePhase(entry.title, exam.phases);
  if (!officialUrl) return { status: "NO_OFFICIAL_LINK", exam };

  return {
    status: "PUBLISHED",
    exam,
    officialUrl,
    draft: composePost(exam, kind, entry.title, phase),
    stage: stageFor(kind, phase, exam.phases),
  };
}

const UNCLEAR_PHASE = "Which phase this is about isn't clear. Choose it below.";

export type FeedRunResult = {
  status: FeedRunStatus;
  error: string | null;
  httpStatus: number | null;
  results: FeedReport[];
};

/** How long run history is kept; the alert only ever reads the last day. */
const RUN_HISTORY_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Runs the job and records how it went, so the admin dashboard can say when
 * the feed was last fetched and why it failed. A block on an entry's page is
 * reported as a block of the run: it is the same site refusing the same bot.
 */
export async function runOfficialFeed({ dryRun = false } = {}): Promise<FeedRunResult> {
  let run: FeedRunResult;

  try {
    const { reports, blocked } = await processFeed(dryRun);
    run = blocked
      ? { status: "BLOCKED", error: blocked.message, httpStatus: blocked.httpStatus, results: reports }
      : { status: "OK", error: null, httpStatus: null, results: reports };
  } catch (err) {
    console.error("[official-feed]", err);
    run =
      err instanceof FeedFetchError
        ? { status: err.status, error: err.message, httpStatus: err.httpStatus, results: [] }
        : {
            status: "FAILED",
            error: err instanceof Error ? err.message : String(err),
            httpStatus: null,
            results: [],
          };
  }

  if (!dryRun) {
    const previous = await db.feedRun.findFirst({
      orderBy: { createdAt: "desc" },
      select: { status: true, createdAt: true },
    });
    await db.feedRun.create({
      data: {
        status: run.status,
        error: run.error,
        httpStatus: run.httpStatus,
        published: run.results.filter((r) => r.status === "PUBLISHED").length,
      },
    });
    await db.feedRun.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - RUN_HISTORY_MS) } },
    });

    // On the change only: an alert every hour of a long block is noise.
    const wasOk = !previous || previous.status === "OK";
    if (wasOk && run.status !== "OK") {
      await notifyAdmins(
        `🔴 <b>${run.status === "BLOCKED" ? "Sarkari Result ne feed block kar di" : run.status === "UNREACHABLE" ? "Sarkari Result tak pahunch nahi paaye" : "Official feed fail ho gayi"}</b>
` +
          `${esc(run.error ?? "")}

Jab tak theek na ho, zaroori updates admin panel se daalo. Theek hote hi bata dunga.`
      );
    } else if (!wasOk && run.status === "OK") {
      await notifyAdmins("✅ <b>Official feed phir se chal rahi hai.</b>");
    }
  }

  return run;
}

/**
 * Reads the feed and announces every new entry about one of our exams.
 *
 * Each entry is claimed by inserting its FeedItem row before anything is
 * published, so two overlapping runs cannot announce it twice. A failure is
 * recorded as FAILED and retried on the next run; every other outcome is
 * final.
 *
 * With `dryRun`, nothing is written and entries already handled are evaluated
 * again, so the matching can be checked against the live feed.
 */
async function processFeed(
  dryRun: boolean
): Promise<{ reports: FeedReport[]; blocked: FeedFetchError | null }> {
  const entries = parseFeed(await fetchText(FEED_URL, { expectFeed: true }));
  if (entries.length === 0) {
    throw new FeedFetchError("FAILED", "The feed had no entries; its format may have changed.");
  }
  let blocked: FeedFetchError | null = null;
  const noteBlock = (err: unknown) => {
    if (err instanceof FeedFetchError && err.status === "BLOCKED") blocked ??= err;
  };

  const exams: FeedExam[] = await db.exam.findMany({
    where: { archivedAt: null, NOT: { feedKeywords: { isEmpty: true } } },
    select: {
      id: true,
      name: true,
      shortName: true,
      year: true,
      boardId: true,
      feedKeywords: true,
      board: { select: { name: true } },
      phases: {
        select: { id: true, name: true, shortName: true, kind: true },
        orderBy: { sequence: "asc" },
      },
    },
  });

  const keyed = entries.map((entry) => {
    const kind = classify(entry.title);
    return { entry, kind, key: `${entry.guid}#${kind?.id ?? "OTHER"}` };
  });

  const done = new Set(
    (
      await db.feedItem.findMany({
        where: {
          key: { in: keyed.map((k) => k.key) },
          status: { notIn: ["FAILED", "PROCESSING"] },
        },
        select: { key: true },
      })
    ).map((row) => row.key)
  );

  const author = dryRun ? null : await feedAuthor();
  const reports: FeedReport[] = [];

  for (const { entry, kind, key } of keyed) {
    if (done.has(key) && !dryRun) {
      reports.push({ title: entry.title, status: "SEEN" });
      continue;
    }

    if (dryRun) {
      try {
        const outcome = await evaluate(entry, kind, exams);
        reports.push({
          title: entry.title,
          status: outcome.status,
          exam: outcome.exam?.name,
          officialUrl: outcome.officialUrl,
          post: outcome.draft && { id: "(dry run)", title: outcome.draft.title },
          stage:
            outcome.stage &&
            (outcome.stage.phase
              ? `Would mark ${STAGE_LABEL[outcome.stage.stage]} on ${outcome.stage.phase.name}`
              : UNCLEAR_PHASE),
          error: outcome.error,
        });
      } catch (err) {
        noteBlock(err);
        reports.push({ title: entry.title, status: "FAILED", error: String(err) });
      }
      continue;
    }

    if (!(await claim(key, entry, kind))) continue;

    try {
      const outcome = await evaluate(entry, kind, exams);
      let postId: string | null = null;

      if (outcome.status === "PUBLISHED" && outcome.exam && outcome.draft) {
        const post = await publishOfficialUpdate({
          authorId: author!.id,
          exam: outcome.exam,
          ...outcome.draft,
          sourceUrl: outcome.officialUrl,
        });
        postId = post.id;

        await audit({
          actor: null,
          action: "update.auto_publish",
          targetType: "Post",
          targetId: post.id,
          summary: `Published "${outcome.draft.title}" from the Sarkari Result feed (${post.notified} notified)`,
          metadata: { feedTitle: entry.title, feedLink: entry.link },
        });
      }

      // After the post, and never able to fail it: the post is already out,
      // and a FAILED entry would be retried and announced a second time.
      let stagePhaseId: string | null = null;
      let stageNote: string | null = null;
      if (postId && outcome.stage) {
        if (!outcome.stage.phase) {
          stageNote = UNCLEAR_PHASE;
        } else {
          try {
            const marked = await markStageFromFeed(
              outcome.stage.phase.id,
              outcome.stage.stage,
              entry.publishedAt ?? new Date()
            );
            stagePhaseId = outcome.stage.phase.id;
            stageNote = marked.note;
          } catch (err) {
            console.error("[official-feed] stage", entry.title, err);
            stageNote = `Could not mark ${STAGE_LABEL[outcome.stage.stage]}. Choose the phase below to try again.`;
          }
        }
      }

      const item = await db.feedItem.update({
        where: { key },
        data: {
          status: outcome.status,
          examId: outcome.exam?.id ?? null,
          officialUrl: outcome.officialUrl ?? null,
          postId,
          stage: postId ? (outcome.stage?.stage ?? null) : null,
          stagePhaseId,
          stageNote,
        },
        select: { id: true },
      });

      if (postId && outcome.draft && outcome.exam) {
        const unclear = outcome.stage && !stagePhaseId && outcome.exam.phases.length > 0;
        const rows: Button[][] = unclear
          ? [
              phasesWithStage(outcome.exam.phases, outcome.stage!.stage).map((p) => ({
                text: p.name,
                data: `fs:${item.id}:${p.id}`,
              })),
            ]
          : [];
        rows.push([{ text: "Post dekho", url: `${siteUrl()}/posts/${postId}` }]);
        await notifyAdmins(
          `📢 <b>Nayi Official Update publish hui</b>
${esc(outcome.draft.title)}

` +
            `Feed: <i>${esc(entry.title)}</i>` +
            (stageNote ? `
${esc(stageNote)}` : ""),
          rows
        );
      }

      reports.push({
        title: entry.title,
        status: outcome.status,
        exam: outcome.exam?.name,
        officialUrl: outcome.officialUrl,
        post: postId && outcome.draft ? { id: postId, title: outcome.draft.title } : undefined,
        stage: stageNote ?? undefined,
        error: outcome.error,
      });
    } catch (err) {
      console.error("[official-feed]", entry.title, err);
      noteBlock(err);
      await db.feedItem.update({ where: { key }, data: { status: "FAILED" } });
      reports.push({ title: entry.title, status: "FAILED", error: String(err) });
    }
  }

  return { reports, blocked };
}

/**
 * Takes an entry for this run: a new row, a previous run's failure, or one a
 * run died holding. A recent PROCESSING row belongs to a run still going.
 */
async function claim(key: string, entry: FeedEntry, kind: UpdateKind | null) {
  const retried = await db.feedItem.updateMany({
    where: {
      key,
      OR: [
        { status: "FAILED" },
        { status: "PROCESSING", createdAt: { lt: new Date(Date.now() - STALE_CLAIM_MS) } },
      ],
    },
    data: { status: "PROCESSING", createdAt: new Date() },
  });
  if (retried.count > 0) return true;

  try {
    await db.feedItem.create({
      data: {
        key,
        title: entry.title,
        sourceUrl: entry.link,
        publishedAt: entry.publishedAt,
        kind: kind?.id ?? null,
        status: "PROCESSING",
      },
    });
    return true;
  } catch (err) {
    // Another run got there first.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return false;
    }
    throw err;
  }
}
