/**
 * Seed data for Xamvaad.
 *
 * Mirrors the content shown in the wireframes (SSC CGL 2024, 25 July, Shift 2,
 * Question 46) so the running app looks like the design instead of an empty
 * shell.
 *
 * Note on scale: the wireframes show counts like "1.2K votes". Rather than
 * faking the denormalised counters, this seed creates real users and real vote
 * rows, so every percentage on screen is computed from actual data. The
 * absolute numbers are therefore smaller than the mockups — the ratios match.
 *
 *   npm run db:seed
 */

import { PrismaClient, type PostType, type Prisma } from "../src/prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const DEMO_PASSWORD = "xamvaad123";

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

/**
 * Exam dates are anchored to "today" rather than hard-coded.
 *
 * The wireframes show 25 July 2024, but a fixed past date means the demo's
 * objection window is permanently expired — and an expired window makes the
 * Objection Tracker unusable, since objections can only be raised while it is
 * open. Relative dates keep the seed correct whenever it is run.
 *
 * UTC midnight, so the generated "#25July"-style tags don't shift with the
 * server's timezone.
 */
function todayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

/** Days from today; negative is the past. */
function dayOffset(days: number): Date {
  const date = todayUtc();
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

/** Stable map key for a session, since dates are now computed. */
const sessionKey = (slug: string, date: Date, shift: string) =>
  `${slug}|${date.toISOString().slice(0, 10)}|${shift}`;

/** CGL_DATE_TAG — matches autoTagsFor() in src/lib/rules.ts. */
function dateTagLabel(date: Date): string {
  const day = date.getUTCDate();
  const month = date.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  return `${day}${month}`;
}

/**
 * Refuses to run against anything but a local database.
 *
 * This script is a development fixture, and its first act is to delete every
 * row in the schema. Pointed at production it would wipe real accounts and
 * then plant demo users — including an ADMIN whose password is committed to
 * this repository. Production gets its boards and exams from the admin
 * dashboard instead; there is no legitimate reason to run this against it.
 *
 * SEED_FORCE=1 overrides, for the case where a remote *staging* database
 * genuinely wants the demo data.
 */
function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);

  if (isLocal || process.env.SEED_FORCE === "1") return;

  const host = url.replace(/\/\/[^@]*@/, "//***@") || "(DATABASE_URL not set)";
  console.error(
    [
      "",
      "Refusing to seed: DATABASE_URL does not point at a local database.",
      `  ${host}`,
      "",
      "This script deletes every row, then creates demo users including an",
      "admin whose password is in the repo. On production, create boards and",
      "exams through the admin dashboard instead.",
      "",
      "If you really mean it (a staging database), re-run with SEED_FORCE=1.",
      "",
    ].join("\n")
  );
  process.exit(1);
}

async function main() {
  assertLocalDatabase();

  console.log("Resetting database...");
  // Order matters: children before parents.
  await db.objectionVote.deleteMany();
  await db.pollVote.deleteMany();
  await db.pollOption.deleteMany();
  await db.poll.deleteMany();
  await db.notification.deleteMany();
  await db.report.deleteMany();
  await db.commentLike.deleteMany();
  await db.comment.deleteMany();
  await db.postLike.deleteMany();
  await db.savedPost.deleteMany();
  await db.postTag.deleteMany();
  await db.tag.deleteMany();
  await db.post.deleteMany();
  await db.question.deleteMany();
  await db.examStageEntry.deleteMany();
  await db.examSession.deleteMany();
  await db.exam.deleteMany();
  await db.boardModerator.deleteMany();
  await db.board.deleteMany();
  await db.user.deleteMany();

  // Hash once — bcrypt at cost 12 is deliberately slow.
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // -------------------------------------------------------------------------
  // Users
  // -------------------------------------------------------------------------
  console.log("Creating users...");

  const named = [
    { name: "Rahul Verma", username: "rahulverma", email: "rahul@xamvaad.test", role: "USER" as const, bio: "SSC CGL aspirant. Maths & Reasoning." },
    { name: "Priya Sharma", username: "priyasharma", email: "priya@xamvaad.test", role: "USER" as const, bio: "Banking aspirant — IBPS PO 2024." },
    { name: "Aman Gupta", username: "amangupta", email: "aman@xamvaad.test", role: "MODERATOR" as const, bio: "Quant faculty. 8 years teaching SSC/Banking." },
    { name: "Rohit Kumar", username: "rohitkumar", email: "rohit@xamvaad.test", role: "USER" as const, bio: "SSC CGL 2024 · Shift 2" },
    { name: "Ankit Jain", username: "ankitjain", email: "ankit@xamvaad.test", role: "USER" as const, bio: "Repeater. GS is my weak area." },
    { name: "Xamvaad Admin", username: "admin", email: "admin@xamvaad.test", role: "ADMIN" as const, bio: "Official Xamvaad account." },
  ];

  await db.user.createMany({
    data: named.map((u) => ({ ...u, passwordHash })),
  });

  // A pool of ordinary aspirants so votes and percentages are real.
  const POOL_SIZE = 60;
  await db.user.createMany({
    data: Array.from({ length: POOL_SIZE }, (_, i) => ({
      name: `Aspirant ${i + 1}`,
      username: `aspirant${i + 1}`,
      email: `aspirant${i + 1}@xamvaad.test`,
      passwordHash,
    })),
  });

  const users = await db.user.findMany({ select: { id: true, username: true } });
  const byName = Object.fromEntries(users.map((u) => [u.username, u.id]));
  const pool = users
    .filter((u) => u.username.startsWith("aspirant"))
    .map((u) => u.id);

  const rahul = byName["rahulverma"]!;
  const priya = byName["priyasharma"]!;
  const aman = byName["amangupta"]!;
  const rohit = byName["rohitkumar"]!;
  const ankit = byName["ankitjain"]!;
  const admin = byName["admin"]!;

  // -------------------------------------------------------------------------
  // Boards (wireframe 03, "Popular Boards" rail)
  // -------------------------------------------------------------------------
  console.log("Creating boards...");

  const boardSpecs = [
    { slug: "ssc", name: "SSC", fullName: "Staff Selection Commission", icon: "Landmark", color: "#DC2626", sortOrder: 1, description: "CGL, CHSL, MTS, GD Constable and more." },
    { slug: "rrb", name: "RRB", fullName: "Railway Recruitment Board", icon: "TrainFront", color: "#0891B2", sortOrder: 2, description: "NTPC, Group D, ALP and JE." },
    { slug: "ibps", name: "IBPS", fullName: "Institute of Banking Personnel Selection", icon: "Landmark", color: "#2563EB", sortOrder: 3, description: "PO, Clerk, RRB and SO." },
    { slug: "upsc", name: "UPSC", fullName: "Union Public Service Commission", icon: "Building2", color: "#7C3AED", sortOrder: 4, description: "Civil Services, CDS, CAPF and NDA." },
    { slug: "state-psc", name: "State PSC", fullName: "State Public Service Commissions", icon: "MapPin", color: "#059669", sortOrder: 5, description: "BPSC, UPPSC, MPPSC and other states." },
    { slug: "teaching", name: "Teaching", fullName: "Teaching Recruitment Exams", icon: "GraduationCap", color: "#D97706", sortOrder: 6, description: "CTET, UPTET, KVS and NVS." },
  ];

  await db.board.createMany({ data: boardSpecs });
  const boards = await db.board.findMany({ select: { id: true, slug: true } });
  const boardId = Object.fromEntries(boards.map((b) => [b.slug, b.id]));

  await db.boardModerator.create({
    data: { boardId: boardId["ssc"]!, userId: aman },
  });

  // -------------------------------------------------------------------------
  // Exams + sessions (wireframe 03, "Today's Active Exams")
  // -------------------------------------------------------------------------
  console.log("Creating exams and sessions...");

  // SSC CGL sat 10 days ago — recent enough that its objection window is open.
  const year = dayOffset(-10).getUTCFullYear();

  /**
   * Lifecycle expressed as day offsets from today, so the demo is always in a
   * sensible state. `null` means TBA, which derives to PENDING.
   */
  type Lifecycle = {
    /**
     * The exam window. A tuple spans several days of sittings — which is the
     * normal case, since almost no national exam is sat in one sitting — and a
     * bare number is a single-day exam.
     */
    conducted?: number | [number, number] | null;
    answerKey?: number | null;
    objection?: [number, number] | null;
    finalKey?: number | null;
    result?: number | null;
    note?: string;
  };

  type PhaseSpec = {
    slug: string;
    name: string;
    shortName: string;
    kind: "WRITTEN" | "SKILL_TEST" | "PHYSICAL" | "INTERVIEW" | "DOCUMENT_VERIFICATION";
    sessions: { date: Date; shift: string }[];
    lifecycle: Lifecycle;
  };

  /**
   * Real multi-tier structures.
   *
   * Every exam here has several phases, because that is the norm rather than
   * the exception: SSC runs Tier 1 then Tier 2, RRB runs CBT 1, CBT 2, a
   * typing test and document verification, banking runs Prelims, Mains and an
   * interview. Each phase carries its own lifecycle — only Tier 1 has an open
   * objection window today; Tier 2 has not been held yet.
   */
  const examSpecs: {
    slug: string;
    board: string;
    name: string;
    shortName: string;
    year: number;
    description: string;
    phases: PhaseSpec[];
  }[] = [
    {
      slug: `ssc-cgl-${year}`,
      board: "ssc",
      name: `SSC CGL ${year}`,
      shortName: "CGL",
      year,
      description: "Combined Graduate Level Examination.",
      phases: [
        {
          slug: "tier-1",
          name: "Tier 1",
          shortName: "T1",
          kind: "WRITTEN",
          sessions: [
            { date: dayOffset(-10), shift: "Shift 1" },
            { date: dayOffset(-10), shift: "Shift 2" },
            { date: dayOffset(-9), shift: "Shift 1" },
          ],
          lifecycle: {
            // Three sittings across two days — the window matches them.
            conducted: [-10, -9],
            answerKey: -4,
            objection: [-3, 5],
            note: "Objections accepted on the official portal until the window closes.",
          },
        },
        {
          slug: "tier-2",
          name: "Tier 2",
          shortName: "T2",
          kind: "WRITTEN",
          // Not yet held: no sittings exist until the notification lands.
          sessions: [],
          // Still to come, so only Discussions and Polls are allowed here.
          lifecycle: { conducted: [75, 78] },
        },
      ],
    },
    {
      slug: `rrb-ntpc-${year}`,
      board: "rrb",
      name: `RRB NTPC ${year}`,
      shortName: "NTPC",
      year,
      description: "Non-Technical Popular Categories.",
      phases: [
        {
          slug: "cbt-1",
          name: "CBT 1",
          shortName: "CBT1",
          kind: "WRITTEN",
          sessions: [
            { date: dayOffset(-11), shift: "Shift 1" },
            { date: dayOffset(-11), shift: "Shift 2" },
          ],
          lifecycle: { conducted: -11, answerKey: 0 },
        },
        {
          slug: "cbt-2",
          name: "CBT 2",
          shortName: "CBT2",
          kind: "WRITTEN",
          // A paper part-way through its window: the first two shifts are
          // sat, two more are still ahead. Candidates who have sat theirs can
          // already file memory questions and cutoffs; the answer key is
          // nowhere near, so there is nothing to object to yet.
          sessions: [
            { date: dayOffset(-1), shift: "Shift 1" },
            { date: dayOffset(-1), shift: "Shift 2" },
            { date: dayOffset(1), shift: "Shift 1" },
            { date: dayOffset(2), shift: "Shift 1" },
          ],
          lifecycle: { conducted: [-1, 2] },
        },
        {
          slug: "typing-test",
          name: "Typing Skill Test",
          shortName: "TST",
          kind: "SKILL_TEST",
          sessions: [],
          lifecycle: {},
        },
        {
          slug: "document-verification",
          name: "Document Verification",
          shortName: "DV",
          kind: "DOCUMENT_VERIFICATION",
          sessions: [],
          lifecycle: {},
        },
      ],
    },
    {
      slug: `ibps-po-${year}`,
      board: "ibps",
      name: `IBPS PO ${year}`,
      shortName: "PO",
      year,
      description: "Probationary Officer recruitment.",
      phases: [
        {
          slug: "prelims",
          name: "Prelims",
          shortName: "Pre",
          kind: "WRITTEN",
          sessions: [{ date: dayOffset(-10), shift: "All Shifts" }],
          lifecycle: { conducted: -10, answerKey: 0 },
        },
        {
          slug: "mains",
          name: "Mains",
          shortName: "Mains",
          kind: "WRITTEN",
          sessions: [],
          lifecycle: { conducted: [45, 46] },
        },
        {
          slug: "interview",
          name: "Interview",
          shortName: "Int",
          kind: "INTERVIEW",
          sessions: [],
          lifecycle: {},
        },
      ],
    },
    {
      slug: `upsc-cse-${year}`,
      board: "upsc",
      name: `UPSC CSE ${year}`,
      shortName: "CSE",
      year,
      description: "Civil Services Examination.",
      phases: [
        {
          slug: "prelims",
          name: "Prelims",
          shortName: "Pre",
          kind: "WRITTEN",
          sessions: [
            { date: dayOffset(-14), shift: "GS Paper 1" },
            { date: dayOffset(-14), shift: "CSAT" },
          ],
          // Its objection window has already closed — the state Tier 1 will
          // reach in a few days, so both sides of the gate are demonstrable.
          lifecycle: {
            conducted: -14,
            answerKey: -10,
            objection: [-9, -3],
            finalKey: -1,
          },
        },
        {
          slug: "mains",
          name: "Mains",
          shortName: "Mains",
          kind: "WRITTEN",
          sessions: [],
          lifecycle: { conducted: [90, 94] },
        },
        {
          slug: "interview",
          name: "Interview",
          shortName: "Int",
          kind: "INTERVIEW",
          sessions: [],
          lifecycle: {},
        },
      ],
    },
  ];

  const CGL = examSpecs[0]!.slug;
  const NTPC = examSpecs[1]!.slug;
  const PO = examSpecs[2]!.slug;
  const CSE = examSpecs[3]!.slug;

  const examId: Record<string, string> = {};
  const phaseId: Record<string, string> = {};
  const sessionId: Record<string, string> = {};
  /** session id -> phase id, so a post can inherit its phase from its shift. */
  const sessionPhase: Record<string, string> = {};

  /** Past transitions are stamped as announced so seeding sends no alerts. */
  const announced = (date: Date | null) =>
    date && date <= new Date() ? new Date() : null;

  const stageRows = (
    phase: string,
    life: Lifecycle
  ): Prisma.ExamStageEntryCreateManyInput[] => {
    const at = (offset: number | null | undefined) =>
      offset === null || offset === undefined ? null : dayOffset(offset);

    const rows: [
      "CONDUCTED" | "ANSWER_KEY_RELEASED" | "OBJECTION_WINDOW" | "FINAL_KEY" | "RESULT",
      Date | null,
      Date | null,
    ][] = [
      [
        "CONDUCTED",
        Array.isArray(life.conducted)
          ? dayOffset(life.conducted[0])
          : at(life.conducted),
        Array.isArray(life.conducted) ? dayOffset(life.conducted[1]) : null,
      ],
      ["ANSWER_KEY_RELEASED", at(life.answerKey), null],
      [
        "OBJECTION_WINDOW",
        life.objection ? dayOffset(life.objection[0]) : null,
        life.objection ? dayOffset(life.objection[1]) : null,
      ],
      ["FINAL_KEY", at(life.finalKey), null],
      ["RESULT", at(life.result), null],
    ];

    return rows.map(([stage, startsAt, endsAt], index) => ({
      phaseId: phaseId[phase]!,
      stage,
      sortOrder: index + 1,
      startsAt,
      endsAt,
      note: stage === "OBJECTION_WINDOW" ? life.note : undefined,
      startAnnouncedAt: announced(startsAt),
      endAnnouncedAt: announced(endsAt),
    }));
  };

  for (const spec of examSpecs) {
    const exam = await db.exam.create({
      data: {
        slug: spec.slug,
        boardId: boardId[spec.board]!,
        name: spec.name,
        shortName: spec.shortName,
        year: spec.year,
        description: spec.description,
        isActive: true,
      },
      select: { id: true },
    });
    examId[spec.slug] = exam.id;

    for (const [index, phase] of spec.phases.entries()) {
      const created = await db.examPhase.create({
        data: {
          examId: exam.id,
          slug: phase.slug,
          name: phase.name,
          shortName: phase.shortName,
          kind: phase.kind,
          sequence: index + 1,
        },
        select: { id: true },
      });
      const key = `${spec.slug}|${phase.slug}`;
      phaseId[key] = created.id;

      for (const s of phase.sessions) {
        const session = await db.examSession.create({
          data: {
            phaseId: created.id,
            examId: exam.id,
            date: s.date,
            shift: s.shift,
          },
          select: { id: true },
        });
        sessionId[sessionKey(key, s.date, s.shift)] = session.id;
        sessionPhase[session.id] = created.id;
      }

      await db.examStageEntry.createMany({
        data: stageRows(key, phase.lifecycle),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Tracked questions + objection votes (wireframes 07-11)
  // -------------------------------------------------------------------------
  console.log("Creating tracked questions and objection votes...");

  const cglTier1 = `${CGL}|tier-1`;
  const cglShift2 = sessionId[sessionKey(cglTier1, dayOffset(-10), "Shift 2")]!;

  const questionSpecs = [
    { number: 46, subject: "Maths", officialAnswer: "B", objectRatio: 0.82, text: "If the compound interest on a sum for 2 years at 10% per annum is Rs. 2,100, what is the simple interest on the same sum for the same period and rate?" },
    { number: 81, subject: "GK", officialAnswer: "D", objectRatio: 0.76, text: "Which of the following states shares a border with the largest number of other Indian states?" },
    { number: 13, subject: "Reasoning", officialAnswer: "A", objectRatio: 0.62, text: "Select the option that is related to the third term in the same way as the second term is related to the first." },
    { number: 92, subject: "English", officialAnswer: "C", objectRatio: 0.18, text: "Select the most appropriate synonym of the highlighted word in the given sentence." },
  ];

  const questionId: Record<number, string> = {};

  for (const q of questionSpecs) {
    const question = await db.question.create({
      data: {
        examId: examId[CGL]!,
        phaseId: phaseId[cglTier1]!,
        sessionId: cglShift2,
        number: q.number,
        subject: q.subject,
        text: q.text,
        officialAnswer: q.officialAnswer,
      },
      select: { id: true },
    });
    questionId[q.number] = question.id;

    // Real vote rows, split to hit the target ratio.
    const voters = pool.slice(0, 50);
    const objectCount = Math.round(voters.length * q.objectRatio);

    await db.objectionVote.createMany({
      data: voters.map((userId, i) => ({
        questionId: question.id,
        userId,
        stance: i < objectCount ? ("OBJECT" as const) : ("CORRECT" as const),
      })),
    });

    await db.question.update({
      where: { id: question.id },
      data: {
        objectVotes: objectCount,
        correctVotes: voters.length - objectCount,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Tags
  // -------------------------------------------------------------------------
  console.log("Creating tags...");

  // The date tag follows the computed exam day, so it always matches what
  // autoTagsFor() would generate for these posts.
  const cglDateLabel = dateTagLabel(dayOffset(-10));
  const CGL_DATE_TAG = cglDateLabel.toLowerCase();

  const tagSpecs = [
    { name: "ssc", label: "SSC", kind: "AUTO" as const },
    { name: "cgl", label: "CGL", kind: "AUTO" as const },
    { name: CGL_DATE_TAG, label: cglDateLabel, kind: "AUTO" as const },
    { name: "shift2", label: "Shift2", kind: "AUTO" as const },
    { name: "shift1", label: "Shift1", kind: "AUTO" as const },
    { name: "rrb", label: "RRB", kind: "AUTO" as const },
    { name: "ntpc", label: "NTPC", kind: "AUTO" as const },
    { name: "ibps", label: "IBPS", kind: "AUTO" as const },
    { name: "po", label: "PO", kind: "AUTO" as const },
    { name: "maths", label: "Maths", kind: "MANUAL" as const },
    { name: "gk", label: "GK", kind: "MANUAL" as const },
    { name: "reasoning", label: "Reasoning", kind: "MANUAL" as const },
    { name: "english", label: "English", kind: "MANUAL" as const },
    { name: "cutoff", label: "Cutoff", kind: "MANUAL" as const },
  ];
  await db.tag.createMany({ data: tagSpecs });
  const tags = await db.tag.findMany({ select: { id: true, name: true } });
  const tagId = Object.fromEntries(tags.map((t) => [t.name, t.id]));

  // -------------------------------------------------------------------------
  // Posts
  // -------------------------------------------------------------------------
  console.log("Creating posts...");

  type PostSpec = {
    key: string;
    author: string;
    board: string;
    exam: string;
    /** "slug|phase-slug" — only needed when the post has no shift. */
    phase?: string;
    session?: string;
    type: PostType;
    title: string;
    body: string;
    tags: string[];
    questionNumber?: number;
    createdAt: Date;
    likes: number;
  };

  const postSpecs: PostSpec[] = [
    {
      key: "q46",
      author: rahul,
      board: "ssc",
      exam: CGL,
      session: cglShift2,
      type: "DISCUSSION",
      title: "Let's discuss Question 46",
      body:
        "I think option C should be correct because the compound interest formula gives a principal of Rs. 10,000, " +
        "which makes the simple interest Rs. 2,000 — not the Rs. 1,950 that option B implies.\n\n" +
        "The official key says B. Am I missing something, or is the key wrong here?\n\nWhat do you think?",
      tags: ["ssc", "cgl", CGL_DATE_TAG, "shift2", "maths"],
      questionNumber: 46,
      createdAt: minutesAgo(10),
      likes: 152,
    },
    {
      key: "q32",
      author: priya,
      board: "ssc",
      exam: CGL,
      // Discussions are exam-wide, not tied to one sitting.
      type: "DISCUSSION",
      title: "Question 32 - Explanation?",
      body:
        "Answer is showing B but I think the question itself was ambiguous. Two of the options can be defended " +
        "depending on how you read the second statement. Has anyone found an official clarification?",
      tags: ["ssc", "cgl", "gk"],
      createdAt: minutesAgo(15),
      likes: 98,
    },
    {
      key: "objection81",
      author: aman,
      board: "ssc",
      exam: CGL,
      session: cglShift2,
      type: "OBJECTION_QUESTION",
      title: "Question 81 - official answer D cannot be right",
      body:
        "The question asks which state shares a border with the largest number of other states. " +
        "The key says D, but on the current administrative map that distinction belongs to a different " +
        "state entirely, and every standard reference agrees.\n\n" +
        "I've filed an objection on the official portal. Vote below if you think this one should be challenged.",
      tags: ["ssc", "cgl", CGL_DATE_TAG, "shift2", "gk"],
      questionNumber: 81,
      createdAt: minutesAgo(55),
      likes: 187,
    },
    {
      key: "poll46",
      author: rohit,
      board: "ssc",
      exam: CGL,
      session: cglShift2,
      type: "POLL",
      title: "Question 46 - which option do you think is correct?",
      body: "Official key says B. Curious what the shift actually marked. Vote honestly, no peeking at the key.",
      tags: ["ssc", "cgl", CGL_DATE_TAG, "shift2", "maths"],
      questionNumber: 46,
      createdAt: minutesAgo(40),
      likes: 64,
    },
    {
      key: "memory-maths",
      author: ankit,
      board: "ssc",
      exam: CGL,
      session: cglShift2,
      type: "MEMORY_QUESTION",
      title: "Maths questions I remember from Shift 2",
      body:
        "Posting what I can recall from the Maths section, roughly in order:\n\n" +
        "1. CI/SI 2-year problem at 10%\n2. Boat and stream, downstream 12 km in 2 hrs\n" +
        "3. Trigonometry identity simplification\n4. Profit and loss with two successive discounts\n\n" +
        "Add whatever you remember in the comments and I'll keep this updated.",
      tags: ["ssc", "cgl", CGL_DATE_TAG, "shift2", "maths"],
      createdAt: minutesAgo(120),
      likes: 214,
    },
    {
      key: "cutoff",
      author: aman,
      board: "ssc",
      exam: CGL,
      phase: cglTier1,
      type: "EXPECTED_CUTOFF",
      title: "Expected cutoff for CGL 2024 Tier 1 based on shift difficulty",
      body:
        "Across all shifts the Maths section ran harder than last year while English stayed comparable. " +
        "My working estimate for the general category is 148-152, roughly 4-6 marks below 2023.\n\n" +
        "This is an estimate from shift feedback, not an official figure.",
      tags: ["ssc", "cgl", "cutoff"],
      createdAt: minutesAgo(300),
      likes: 431,
    },
    {
      key: "official",
      author: admin,
      board: "ssc",
      exam: CGL,
      phase: cglTier1,
      type: "OFFICIAL_UPDATE",
      title: "Official answer key released for SSC CGL 2024 Tier 1",
      body:
        "The provisional answer key is now live on the official SSC portal. The objection window is open from " +
        "25 July to 30 July, with a fee of Rs. 100 per question challenged.\n\n" +
        "Xamvaad's Objection Tracker shows what the community believes is wrong, but objections must be filed " +
        "on the official portal — we do not file them on your behalf.",
      tags: ["ssc", "cgl", CGL_DATE_TAG],
      createdAt: minutesAgo(140),
      likes: 890,
    },
    {
      key: "ntpc",
      author: priya,
      board: "rrb",
      exam: NTPC,
      session: sessionId[sessionKey(`${NTPC}|cbt-1`, dayOffset(-11), "Shift 1")]!,
      type: "DISCUSSION",
      title: "RRB NTPC Shift 1 - how was the GK section?",
      body:
        "Static GK felt heavier than the previous cycle, with at least six questions on polity. " +
        "Current affairs stayed within the last six months. How did others find it?",
      tags: ["rrb", "ntpc", "gk"],
      createdAt: minutesAgo(200),
      likes: 76,
    },
    {
      key: "ibps",
      author: priya,
      board: "ibps",
      exam: PO,
      session: sessionId[sessionKey(`${PO}|prelims`, dayOffset(-10), "All Shifts")]!,
      type: "DISCUSSION",
      title: "IBPS PO Prelims - reasoning was the deciding section",
      body:
        "Puzzles took far longer than usual. Anyone who cleared the reasoning sectional cutoff comfortably, " +
        "what was your approach to the seating arrangement set?",
      tags: ["ibps", "po", "reasoning"],
      createdAt: minutesAgo(420),
      likes: 58,
    },
  ];

  const postId: Record<string, string> = {};

  for (const spec of postSpecs) {
    const post = await db.post.create({
      data: {
        authorId: spec.author,
        boardId: boardId[spec.board]!,
        examId: examId[spec.exam]!,
        // A shift-scoped post inherits its phase; the rest name one explicitly
        // (an Expected Cutoff is about Tier 1, not the exam in the abstract).
        phaseId: spec.session
          ? (sessionPhase[spec.session] ?? null)
          : (spec.phase ? phaseId[spec.phase]! : null),
        sessionId: spec.session ?? null,
        type: spec.type,
        title: spec.title,
        body: spec.body,
        createdAt: spec.createdAt,
        likeCount: spec.likes,
        questionId: spec.questionNumber
          ? questionId[spec.questionNumber]!
          : null,
        tags: {
          create: spec.tags.map((name) => ({ tagId: tagId[name]! })),
        },
      },
      select: { id: true },
    });
    postId[spec.key] = post.id;

    // Real like rows from the pool, matching the counter where possible.
    const likers = pool.slice(0, Math.min(spec.likes, pool.length));
    if (likers.length) {
      await db.postLike.createMany({
        data: likers.map((userId) => ({ postId: post.id, userId })),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Poll (wireframes 06 and 11)
  // -------------------------------------------------------------------------
  console.log("Creating poll...");

  const poll = await db.poll.create({
    data: {
      postId: postId["poll46"]!,
      question: "Question 46 - which option is correct?",
      options: {
        create: [
          { label: "A", sortOrder: 1 },
          { label: "B", sortOrder: 2 },
          { label: "C", sortOrder: 3 },
          { label: "D", sortOrder: 4 },
        ],
      },
    },
    select: { id: true, options: { select: { id: true, label: true } } },
  });

  const optionByLabel = Object.fromEntries(
    poll.options.map((o) => [o.label, o.id])
  );

  // Distribution follows the wireframe: C leads at ~54%, then B, A, D.
  const distribution: Record<string, number> = { A: 7, B: 17, C: 32, D: 4 };
  let cursor = 0;
  for (const [label, count] of Object.entries(distribution)) {
    const voters = pool.slice(cursor, cursor + count);
    cursor += count;
    if (!voters.length) continue;
    await db.pollVote.createMany({
      data: voters.map((userId) => ({
        pollId: poll.id,
        optionId: optionByLabel[label]!,
        userId,
      })),
    });
    await db.pollOption.update({
      where: { id: optionByLabel[label]! },
      data: { voteCount: voters.length },
    });
  }

  // -------------------------------------------------------------------------
  // Comments (wireframe 05)
  // -------------------------------------------------------------------------
  console.log("Creating comments...");

  const commentSpecs = [
    { post: "q46", author: rohit, body: "I think option B is correct. Here's why - the question asks for simple interest on the same principal, and once you back out P = 10,000 from the CI figure, SI works out to exactly 2,000. Option B rounds it.", likes: 12, createdAt: minutesAgo(8) },
    { post: "q46", author: ankit, body: "No, answer is definitely C. Because the CI given is for 2 years compounded annually, the principal is 10,000 and SI = 2,000 flat. B is off by 50.", likes: 8, createdAt: minutesAgo(6) },
    { post: "q46", author: aman, body: "Both of you are computing the principal correctly. The disagreement is only about whether the paper wanted the rounded value. Given the key says B, I'd file an objection but not expect it to be upheld.", likes: 31, createdAt: minutesAgo(4) },
    { post: "q32", author: rahul, body: "Same doubt here. The second statement can be read two ways and the options don't disambiguate.", likes: 5, createdAt: minutesAgo(12) },
    { post: "memory-maths", author: priya, body: "There was also a time-and-work question with 3 people and alternate days. I'll try to recall the exact numbers.", likes: 9, createdAt: minutesAgo(90) },
    { post: "cutoff", author: rahul, body: "148 feels optimistic to me given how many people are reporting 155+ in the easier shifts. Normalisation will decide this.", likes: 22, createdAt: minutesAgo(200) },
  ];

  for (const spec of commentSpecs) {
    const comment = await db.comment.create({
      data: {
        postId: postId[spec.post]!,
        authorId: spec.author,
        body: spec.body,
        likeCount: spec.likes,
        createdAt: spec.createdAt,
      },
      select: { id: true },
    });

    const likers = pool.slice(0, Math.min(spec.likes, pool.length));
    if (likers.length) {
      await db.commentLike.createMany({
        data: likers.map((userId) => ({ commentId: comment.id, userId })),
      });
    }
  }

  // A threaded reply, to exercise the parent/child path.
  const firstComment = await db.comment.findFirst({
    where: { postId: postId["q46"]!, authorId: rohit },
    select: { id: true },
  });
  if (firstComment) {
    await db.comment.create({
      data: {
        postId: postId["q46"]!,
        authorId: rahul,
        parentId: firstComment.id,
        body: "That's fair, but the key's value doesn't match either reading exactly. That's what bothers me.",
        createdAt: minutesAgo(3),
      },
    });
  }

  // Sync comment counters with reality.
  for (const key of Object.keys(postId)) {
    const count = await db.comment.count({
      where: { postId: postId[key]!, deletedAt: null },
    });
    await db.post.update({
      where: { id: postId[key]! },
      data: { commentCount: count },
    });
  }

  // -------------------------------------------------------------------------
  // Saved posts + notifications (wireframe 14)
  // -------------------------------------------------------------------------
  console.log("Creating saves and notifications...");

  await db.savedPost.createMany({
    data: [
      { userId: rahul, postId: postId["official"]! },
      { userId: rahul, postId: postId["cutoff"]! },
      { userId: priya, postId: postId["memory-maths"]! },
    ],
  });

  await db.notification.createMany({
    data: [
      { userId: rahul, actorId: aman, type: "COMMENT_REPLY", message: "Aman Gupta replied to your comment on Question 46", postId: postId["q46"]!, createdAt: minutesAgo(2) },
      { userId: rahul, type: "OBJECTION_MILESTONE", message: "Your objection on Question 46 received 25 new votes", postId: postId["q46"]!, createdAt: minutesAgo(10) },
      { userId: rahul, actorId: priya, type: "MENTION", message: "Priya Sharma mentioned you in a post", postId: postId["q32"]!, createdAt: minutesAgo(60) },
      { userId: rahul, type: "OFFICIAL_UPDATE", message: "Official update for SSC CGL 2024 released", postId: postId["official"]!, isRead: true, createdAt: minutesAgo(120) },
      { userId: priya, actorId: rahul, type: "POST_LIKE", message: "Rahul Verma liked your post", postId: postId["q32"]!, createdAt: minutesAgo(30) },
    ],
  });

  // -------------------------------------------------------------------------
  console.log("\nSeed complete.");
  console.log(`  ${await db.user.count()} users`);
  console.log(`  ${await db.board.count()} boards`);
  console.log(`  ${await db.exam.count()} exams`);
  console.log(`  ${await db.post.count()} posts`);
  console.log(`  ${await db.question.count()} tracked questions`);
  console.log(`  ${await db.objectionVote.count()} objection votes`);
  console.log(`\nSign in with any of these (password: ${DEMO_PASSWORD}):`);
  console.log("  rahul@xamvaad.test   — ordinary user");
  console.log("  aman@xamvaad.test    — moderator");
  console.log("  admin@xamvaad.test   — admin, can post Official Updates");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
