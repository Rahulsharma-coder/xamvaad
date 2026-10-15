import { Prisma } from "@/prisma/client";
import type { FeedItemStatus } from "@/prisma/client";
import { db } from "./db";
import { audit } from "./audit";
import { publishOfficialUpdate } from "./officialUpdates";

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
 * The job runs every few hours, so the feed is read a handful of times a day
 * and an entry's page is fetched only once it has matched one of our exams.
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
};

const RESULT: UpdateKind = {
  id: "RESULT",
  title: /\b(result|merit list|score ?card)\b/,
  link: /result|marks|merit|score/i,
  headline: (t) => (/\bfinal result\b/.test(t) ? "अंतिम परिणाम जारी" : "परिणाम जारी"),
  sentence: (exam) =>
    `${exam} का परिणाम जारी कर दिया गया है। अपना परिणाम आधिकारिक वेबसाइट पर देखें।`,
};

/**
 * Ordered: the first match wins. Answer keys come before results because a
 * title can name both, and corrections before "online form" because a
 * correction window is announced as "Online Form Correction".
 */
const KINDS: UpdateKind[] = [
  {
    id: "ANSWER_KEY",
    title: /\banswer key\b/,
    link: /answer key|objection/i,
    headline: () => "आंसर की जारी",
    sentence: (exam) =>
      `${exam} की आंसर की जारी कर दी गई है। अपने उत्तर मिलाएँ और किसी उत्तर पर आपत्ति हो तो तय समय-सीमा में दर्ज करें।`,
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
};

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

export function composePost(exam: FeedExam, kind: UpdateKind, feedTitle: string) {
  const label = examLabel(exam);
  return {
    title: `${label}: ${kind.headline(normalise(feedTitle))}`,
    body: `${kind.sentence(label)}\n\n${FOOTER}`,
  };
}

// ---------------------------------------------------------------------------
// The job
// ---------------------------------------------------------------------------

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/xml" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.text();
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
  error?: string;
};

type Outcome = {
  status: FeedItemStatus;
  exam?: FeedExam;
  officialUrl?: string;
  draft?: { title: string; body: string };
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
  if (!officialUrl) return { status: "NO_OFFICIAL_LINK", exam };

  return {
    status: "PUBLISHED",
    exam,
    officialUrl,
    draft: composePost(exam, kind, entry.title),
  };
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
export async function runOfficialFeed({ dryRun = false } = {}): Promise<FeedReport[]> {
  const entries = parseFeed(await fetchText(FEED_URL));

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
          error: outcome.error,
        });
      } catch (err) {
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

      await db.feedItem.update({
        where: { key },
        data: {
          status: outcome.status,
          examId: outcome.exam?.id ?? null,
          officialUrl: outcome.officialUrl ?? null,
          postId,
        },
      });

      reports.push({
        title: entry.title,
        status: outcome.status,
        exam: outcome.exam?.name,
        officialUrl: outcome.officialUrl,
        post: postId && outcome.draft ? { id: postId, title: outcome.draft.title } : undefined,
        error: outcome.error,
      });
    } catch (err) {
      console.error("[official-feed]", entry.title, err);
      await db.feedItem.update({ where: { key }, data: { status: "FAILED" } });
      reports.push({ title: entry.title, status: "FAILED", error: String(err) });
    }
  }

  return reports;
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
