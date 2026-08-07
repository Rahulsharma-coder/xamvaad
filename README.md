# Xamvaad — Where Aspirants Discuss

A structured discussion platform for Indian competitive exam aspirants (SSC, RRB, IBPS, UPSC, State PSC, Teaching).

Every post is bound to **Board → Exam → Exam Date → Shift → Post Type**, which is what makes discussion searchable months later instead of scrolling away in a Telegram group. On top of that sits the **Objection Tracker**: after an answer key drops, aspirants vote on whether each question's official answer should be challenged, and the platform surfaces the most-challenged questions.

---

## Quick start

Nothing to install beyond Node. No Docker, no database account, no admin rights.

```bash
npm install
npm run db:setup     # downloads + starts a local PostgreSQL (one time, ~370 MB)
npm run db:migrate   # create the schema
npm run db:seed      # load demo data
npm run dev          # http://localhost:3000
```

`npm run db:setup` fetches the official PostgreSQL binaries, initialises a cluster under `%LOCALAPPDATA%\Xamvaad`, and runs it as an ordinary user process — no Windows service is registered and no elevation is needed. It's idempotent, so re-running it is safe.

A `.env` is already present with a generated `AUTH_SECRET`, pointing at that local database. It's gitignored — see `.env.example` and generate a fresh secret for production.

### Managing the database

| Command | Does |
| --- | --- |
| `npm run db:setup` | Install, initialise and start (idempotent) |
| `npm run db:start` | Start the server (after a reboot) |
| `npm run db:stop` | Stop the server |
| `npm run db:status` | Is it running? |
| `npm run db:psql` | Interactive SQL shell |

The server does **not** start automatically on boot — run `npm run db:start` before `npm run dev` after restarting your machine.

The cluster lives outside the project folder deliberately: Postgres writes WAL files constantly, and a data directory inside the repo would keep the Next.js dev server rebuilding.

### Enabling "Continue with Google"

The button is always shown. Until credentials are set it redirects to `/login` with an explanatory message rather than failing silently. To make it work:

1. Open the [Google Cloud Console credentials page](https://console.cloud.google.com/apis/credentials) and select or create a project.
2. **OAuth consent screen** → choose **External**, fill in an app name and your email, and save. While the app is in *Testing*, add your own Google address under **Test users** — otherwise sign-in is refused.
3. **Create Credentials → OAuth client ID** → application type **Web application**.
4. Under **Authorised redirect URIs** add exactly:
   ```
   http://localhost:3000/api/auth/google/callback
   ```
   It must match character for character, including the scheme and port.
5. Copy the client ID and client secret into `.env`:
   ```
   GOOGLE_CLIENT_ID="1234...apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="GOCSPX-..."
   ```
6. Restart the dev server — `.env` is read at startup, not per request.

An account that signs in with Google and matches an existing email is linked to that account rather than duplicated, so you can use both sign-in methods with one profile.

For production, add your deployed callback URL as a second redirect URI and set `NEXT_PUBLIC_APP_URL` to the live origin.

### Alternatives

`docker compose up -d` works if you'd rather use Docker, and any hosted Postgres (Neon, Supabase, Railway) works by swapping `DATABASE_URL`. Both use the same migrate/seed/dev steps.

### A note on seed dates

Exam dates are computed **relative to the day you seed**, not hard-coded to the wireframes' 25 July 2024. A fixed past date leaves the objection window permanently expired, which makes the Objection Tracker untestable — you can't raise an objection outside the window. The seed places SSC CGL's sitting 10 days ago and its objection window from 3 days ago to 5 days out, so the tracker is always live. Auto-generated date hashtags follow the computed dates.

### Demo accounts

After seeding, password is `xamvaad123` for all of them:

| Email | Role | Why it's useful |
| --- | --- | --- |
| `rahul@xamvaad.test` | Registered user | The ordinary experience |
| `aman@xamvaad.test` | Moderator | Can moderate, can post Official Updates |
| `admin@xamvaad.test` | Administrator | Full permissions |

You can also browse signed-out — "Explore as Guest" is the read-only path.

---

## What's built

All 15 wireframe screens, backed by a real database and API.

| # | Screen | Route |
| --- | --- | --- |
| 01 | Splash | `app/loading.tsx` (route transitions) |
| 02 | Welcome / Landing | `/welcome` |
| 03 | Home (Explore Exams) | `/` |
| 04 | Exam Hub + lifecycle + tabs | `/exams/[slug]` |
| 05 | Post detail + comments | `/posts/[id]` |
| 06 | Poll view | inline on post detail |
| 07 | Objection Tracker tab | `/exams/[slug]?tab=objections` |
| 08 | Objection Tracker list | `/exams/[slug]/objections` |
| 09 | Question objection detail | `/exams/[slug]/questions/[number]` |
| 10 | Raise Objection dialog | modal on the above |
| 11 | After-voting result | same screen, voted state |
| 12 | Create Post — type picker | `/create` |
| 13 | Create Post — form | `/create` (step 2) |
| 14 | Notifications | `/notifications` |
| 15 | Bottom navigation | on every screen |

Plus the screens the PRD listed but the wireframes didn't draw: `/search`, `/boards`, `/boards/[slug]` (the board-scoped feed with Exam/Date/Shift/Type filters), `/profile`, `/settings`.

---

## Two decisions worth knowing about

The PRD and the wireframes disagreed in a few places. Both were resolved in favour of the wireframes:

**1. Objection Tracker is in V1.** The PRD explicitly excluded it (*"Do not include objection tracking… in V1"*) and listed it under future roadmap. The wireframes make it the flagship feature. It's built, and the exam lifecycle stepper exists to support it.

**2. The homepage is exam-first, not board-first.** The PRD specified boards as the primary entry point with no cross-board feed. The wireframe home shows "Today's Active Exams" across boards. Both are available: `/` is exam-first, and `/boards/[slug]` gives the board-scoped feed the PRD described.

Also: **post types are the union of both documents, plus one.** The PRD listed five (Discussion, Memory Question, Doubtful Question, Expected Cutoff, Official Update); the wireframe picker showed four, including Poll, which the PRD never mentions. A seventh — **Objection Question** — was added later; see below.

### Objection Question

The only post type that carries the objection meter. It challenges one numbered question's official answer, and readers vote on whether it should be raised with the exam authority.

Rules enforced in both the UI and the API:

- Requires an **exam date/shift** and a **question number** — without them there is nothing to object to.
- Only creatable while that exam's **objection window is `ACTIVE`** and not past its end date. Outside the window the official portal won't accept a challenge, so collecting votes would imply an action the aspirant can't take. The type is hidden from the picker entirely when no exam has an open window, and the exam dropdown narrows to eligible exams once it's selected.
- Appears under the exam hub's **Objection Tracker** tab, below the tracker summary.

Other question-shaped posts (Memory Question, Doubtful Question) may still reference a question number — they link to it in the tracker — but they **do not** show the objection meter. A Memory Question records what was asked; it makes no claim the answer is wrong, so a "should this be challenged?" meter on it would solicit votes on a question nobody disputed.

The controlling helpers are `showsObjectionMeter`, `requiresQuestionNumber` and `requiresOpenObjectionWindow` in `lib/rules.ts`.

---

## Troubleshooting

**`ChunkLoadError`, or pages 404 that worked a moment ago.**
The `.next` dev cache is corrupt. The tell is a line like `[webpack.cache.PackFileCacheStrategy] Caching failed for pack: ENOENT: rename '4.pack.gz_' -> '4.pack.gz'` in the dev server output. Fix:

```powershell
# stop every dev server first, then:
Remove-Item -Recurse -Force .next
npm run dev
```

The usual cause is **two dev servers running against the same `.next` directory** — e.g. one left over in another terminal. Only one may run at a time. Check with `netstat -ano | findstr :3000`; you should see exactly one PID. Windows Defender scanning `.next` can also cause the rename to fail.

**"Sign-in session expired. Please try again." after Google sign-in.**
Expected, not a bug. The OAuth `state` cookie is single-use CSRF protection, so re-visiting or refreshing the callback URL invalidates it. Start again from the sign-in button.

**`Environment variable not found: DATABASE_URL`.**
`.env` is read at startup. Restart the dev server after editing it.

**`P3009: migrate found failed migrations`.**
A migration failed partway. Mark it rolled back, then re-apply:

```powershell
npx prisma migrate resolve --rolled-back 20240101000000_init
npx prisma migrate deploy
```

## Architecture

```
prisma/
  schema.prisma        Data model — 17 models
  seed.ts              Demo data matching the wireframes
  migrations/          Initial SQL migration
src/
  app/
    (screens)          Server components, dynamically rendered
    api/               REST route handlers
  components/          Shared UI; client components only where interactive
  lib/
    auth.ts            Session cookie, password hashing, permission helpers
    google.ts          Google OAuth 2.0 code flow
    rules.ts           Business rules — thresholds, tag generation, limits
    queries.ts         Shared read queries
    validation.ts      Zod schemas for every write endpoint
```

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4 · Prisma 6 · PostgreSQL

### Auth

Session cookie (HTTP-only, JWT signed with `jose`) plus bcrypt password hashing, and a hand-rolled Google OAuth code flow. No auth library — this keeps the dependency surface small and the session logic legible. Swapping in Auth.js later means replacing `lib/auth.ts` and `lib/google.ts`.

Guest is not a stored role: it's simply the absence of a session. Read paths tolerate `null`; write paths call `requireUser()`.

### Business rules (`lib/rules.ts`)

The PRD left Part 6 as bare bullets, so these are decisions I made — change the constants, not the call sites:

| Rule | Value |
| --- | --- |
| Strong Objection | ≥ 70% of votes |
| Under Review | 40–69% |
| Low Objection | < 40% |
| Minimum votes before a percentage counts | 20 |
| Post edit window | 30 minutes (staff exempt) |
| Rate limits | 10 posts/hour, 60 comments/hour |
| Duplicate detection | same board+exam+shift+type with an equivalent title, within 24h |

Thresholds are calibrated against the wireframes, which showed 82% and 76% as "Strong Objection", 62% as "Under Review" and 18% as "Low Objection".

Only moderators and admins can publish **Official Update** posts — the wireframe gives them an authority badge, so ordinary users must not be able to forge one.

### Objection votes are anonymous

`userId` is stored to enforce one vote per person, but no endpoint ever returns a voter list. The UI states this ("Your vote is anonymous").

### A note on counters

`likeCount`, `commentCount`, `objectVotes` and `voteCount` are denormalised so feeds sort without aggregate joins. Every mutation updates the row and the counter inside one transaction. At scale these should be reconciled by a periodic job.

---

## API

All endpoints return JSON. Errors are `{ error, details? }` with a meaningful status.

```
POST   /api/auth/register        POST /api/auth/login     POST /api/auth/logout
GET    /api/auth/me              GET  /api/auth/google    GET  /api/auth/google/callback

GET    /api/boards
GET    /api/exams?active=1
GET    /api/exams/:slug/questions      Objection Tracker list

GET    /api/posts                      Feed: ?board= &exam= &date= &shift= &type= &tag= &sort=
POST   /api/posts
GET    /api/posts/:id            PATCH /api/posts/:id     DELETE /api/posts/:id
POST   /api/posts/:id/like       POST  /api/posts/:id/save
GET    /api/posts/:id/comments   POST  /api/posts/:id/comments
DELETE /api/comments/:id         POST  /api/comments/:id/like

POST   /api/polls/:id/vote
POST   /api/questions/:id/vote         Raise objection / mark correct

GET    /api/search?q=
GET    /api/notifications        PATCH /api/notifications
POST   /api/reports
```

---

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:setup` | Install + start local PostgreSQL (idempotent) |
| `npm run db:start` / `db:stop` / `db:status` | Control the local server |
| `npm run db:psql` | Interactive SQL shell |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Load demo data (destructive — clears tables first) |
| `npm run db:studio` | Prisma Studio |
| `npm run db:reset` | Drop, re-migrate and re-seed |

---

## Status and what's next

Verified end to end against a live PostgreSQL 16 database:

- Production build passes; TypeScript clean across all 37 routes
- Migration applies; seed loads 66 users, 6 boards, 4 exams, 8 posts, 4 tracked questions, 200 objection votes
- Every screen returns 200 and renders real data — objection verdicts compute correctly (82% Strong, 76% Strong, 62% Under Review, 18% Low), and the lifecycle stepper shows the live objection window
- Write paths exercised through the UI: login/logout, comment creation, comment likes, objection voting, poll voting, post creation
- Dev server log is clean — no errors, warnings or stack traces. The only non-2xx responses are `401` on wrong passwords and `422` on invalid post submissions, both intended

Not built (deliberately out of MVP scope, per PRD Part 10): answer-key module, evidence upload, expert verification, AI assistance, reputation and leaderboards, memory paper reconstruction, analytics.

Worth doing next:
- **Moderation queue UI.** Reports are captured and roles enforced, but there's no admin screen to work the queue yet.
- **Full-text search.** Currently `ILIKE`; a Postgres `tsvector` index with ranking is the natural upgrade.
- **Tests.** None yet. `lib/rules.ts` is pure and is the highest-value place to start.
- **Real-time counts.** The "12.4K discussing" figure is computed per request; cache it.
