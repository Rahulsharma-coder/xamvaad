"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { Avatar } from "./Avatar";

/** Avatars are square and never displayed larger than 64px, so 256 is ample. */
const TARGET_PX = 256;
const ACCEPT = "image/jpeg,image/png,image/webp";

/**
 * Downscales and re-encodes the chosen file in the browser.
 *
 * A phone photo is several megabytes of 4000px JPEG; uploading that to render
 * a 64px circle would be wasteful at every layer. Doing it client-side also
 * avoids a native image library on the server.
 */
async function resize(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  // Cover-crop to a square so portraits aren't squashed into the circle.
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = TARGET_PX;
  canvas.height = TARGET_PX;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser can't process images.");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, TARGET_PX, TARGET_PX);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not process that image.")),
      "image/jpeg",
      0.85
    );
  });
}

export function AvatarUpload({
  name,
  initialImage,
}: {
  name: string;
  initialImage: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState(initialImage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Allow re-picking the same file after a failure.
    event.target.value = "";
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      const blob = await resize(file);

      const form = new FormData();
      form.append("file", blob, "avatar.jpg");

      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        body: form,
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Upload failed.");

      setImage(payload.image);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/avatar", { method: "DELETE" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Could not remove it.");

      setImage(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0">
        {/* Avatar already falls back to initials when image is null. */}
        <Avatar name={name} image={image} size={72} />

        {busy && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-900/50">
            <Loader2 size={20} className="animate-spin text-white" />
          </span>
        )}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-canvas disabled:opacity-50"
          >
            <Camera size={14} />
            {image ? "Change photo" : "Upload photo"}
          </button>

          {image && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-object transition hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 size={14} />
              Remove
            </button>
          )}
        </div>

        <p className="mt-1.5 text-[11px] leading-tight text-ink-muted">
          JPEG, PNG or WebP. Cropped to a square and resized automatically.
        </p>

        {error && (
          <p role="alert" className="mt-1 text-xs text-object">
            {error}
          </p>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={onPick}
        className="hidden"
        aria-label="Choose a profile picture"
      />
    </div>
  );
}
