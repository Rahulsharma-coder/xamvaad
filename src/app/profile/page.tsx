import Link from "next/link";
import { redirect } from "next/navigation";
import { Pencil, Settings } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getFeed } from "@/lib/queries";
import { Avatar } from "@/components/Avatar";
import { PostCard } from "@/components/PostCard";
import { compactCount } from "@/lib/format";

export const metadata = { title: "Profile" };

type Props = { searchParams: Promise<{ tab?: string }> };

/** Profile (PRD Part 5) — the user's own posts and saved posts. */
export default async function ProfilePage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/profile");

  const { tab } = await searchParams;
  const showSaved = tab === "saved";

  const [profile, counts, feed] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { bio: true, createdAt: true, role: true },
    }),
    Promise.all([
      db.post.count({ where: { authorId: user.id, deletedAt: null } }),
      db.comment.count({ where: { authorId: user.id, deletedAt: null } }),
      db.savedPost.count({ where: { userId: user.id } }),
    ]),
    getFeed(
      showSaved
        ? { savedByUserId: user.id, sort: "latest" }
        : { authorId: user.id, sort: "latest" },
      { take: 30 }
    ),
  ]);

  const [postCount, commentCount, savedCount] = counts;

  return (
    <div className="page-shell">
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex max-w-3xl items-start gap-4 px-4 py-5">
          <Avatar name={user.name} image={user.image} size={64} />

          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-extrabold text-ink">{user.name}</h1>
            <p className="text-sm text-ink-muted">@{user.username}</p>
            {profile.bio ? (
              <p className="mt-1.5 text-sm text-ink">{profile.bio}</p>
            ) : (
              <Link
                href="/settings"
                className="mt-1.5 inline-block text-sm text-brand-600 hover:underline"
              >
                + Add a bio
              </Link>
            )}

            <dl className="mt-3 flex gap-5 text-sm">
              <Stat label="Posts" value={postCount} />
              <Stat label="Comments" value={commentCount} />
              <Stat label="Saved" value={savedCount} />
            </dl>

            <Link
              href="/settings"
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-canvas"
            >
              <Pencil size={13} /> Edit profile
            </Link>
          </div>

          <Link
            href="/settings"
            aria-label="Settings"
            className="rounded-lg p-2 text-ink-muted transition hover:bg-canvas"
          >
            <Settings size={20} />
          </Link>
        </div>

        <nav className="mx-auto max-w-3xl px-4">
          <ul className="-mb-px flex gap-1">
            {[
              { key: "posts", label: "Your Posts" },
              { key: "saved", label: "Saved" },
            ].map((item) => {
              const isActive = (item.key === "saved") === showSaved;
              return (
                <li key={item.key}>
                  <Link
                    href={`/profile?tab=${item.key}`}
                    className={`inline-block border-b-2 px-3 py-2.5 text-sm font-semibold transition ${
                      isActive
                        ? "border-brand-600 text-brand-700"
                        : "border-transparent text-ink-muted hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">
        {feed.posts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-hairline bg-surface p-10 text-center">
            <p className="font-semibold text-ink">
              {showSaved ? "Nothing saved yet" : "You haven't posted yet"}
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              {showSaved
                ? "Tap Save on any post to keep it here."
                : "Share a memory question or start a discussion."}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {feed.posts.map((post) => (
              <li key={post.id}>
                <PostCard post={post} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd>
        <span className="font-bold text-ink">{compactCount(value)}</span>{" "}
        <span className="text-ink-muted">{label}</span>
      </dd>
    </div>
  );
}
