"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { AvatarUpload } from "./AvatarUpload";

const BIO_MAX = 200;

/** Edit display name and bio (settings page). */
export function ProfileForm({
  initialName,
  initialBio,
  initialImage,
}: {
  initialName: string;
  initialBio: string;
  initialImage: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [bio, setBio] = useState(initialBio);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = name !== initialName || bio !== initialBio;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    try {
      await api("/api/profile", {
        method: "PATCH",
        json: { name: name.trim(), bio: bio.trim() },
      });
      setSaved(true);
      // Re-render the server components so the header picks up the new name.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-hairline bg-surface p-4"
    >
      <h2 className="text-sm font-bold text-ink">Edit profile</h2>

      {/* Picture first — it's the part people come here to change, and it
          saves on its own rather than waiting for the form below. */}
      <div className="mt-3 border-b border-hairline pb-4">
        <AvatarUpload name={initialName} initialImage={initialImage} />
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <label
            htmlFor="profile-name"
            className="mb-1 block text-xs font-semibold text-ink"
          >
            Display name
          </label>
          <input
            id="profile-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            required
            className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
          />
        </div>

        <div>
          <label
            htmlFor="profile-bio"
            className="mb-1 block text-xs font-semibold text-ink"
          >
            Bio
          </label>
          <textarea
            id="profile-bio"
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            maxLength={BIO_MAX}
            rows={3}
            placeholder="Which exams are you preparing for?"
            className="w-full resize-y rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
          />
          <p className="mt-1 text-right text-[11px] text-ink-muted">
            {bio.length}/{BIO_MAX}
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-object">
          {error}
        </p>
      )}
      {saved && !dirty && (
        <p role="status" className="mt-2 text-xs font-semibold text-correct">
          Profile updated.
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !dirty}
        className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
      >
        {busy ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}
