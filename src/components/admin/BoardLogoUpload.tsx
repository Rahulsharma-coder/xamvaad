"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { BoardIcon } from "@/components/BoardIcon";

/** The rail never draws a board larger than 48px, so 256 is generous. */
const TARGET_PX = 256;
const ACCEPT = "image/png,image/webp,image/jpeg";

/**
 * Fits the chosen file onto a square transparent canvas, in the browser.
 *
 * Two deliberate differences from the avatar resizer. It *contains* rather
 * than cover-crops, because a board logo is a mark with its own proportions
 * and cropping one to fill a square cuts the wordmark off. And it encodes to
 * PNG rather than JPEG, because most official logos are flat art on
 * transparency — JPEG would paint a white rectangle behind them that the
 * tinted tile then frames.
 */
async function fitToSquare(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  const scale = Math.min(TARGET_PX / bitmap.width, TARGET_PX / bitmap.height);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = TARGET_PX;
  canvas.height = TARGET_PX;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser can't process images.");
  ctx.drawImage(bitmap, (TARGET_PX - w) / 2, (TARGET_PX - h) / 2, w, h);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not process that image.")),
      "image/png"
    );
  });
}

export function BoardLogoUpload({
  boardId,
  boardName,
  icon,
  color,
  initialImage,
}: {
  boardId: string;
  boardName: string;
  icon: string | null;
  color: string | null;
  initialImage: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState(initialImage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Let the same file be re-picked after a failure.
    event.target.value = "";
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      const blob = await fitToSquare(file);
      const form = new FormData();
      form.append("file", blob, "logo.png");

      const res = await fetch(`/api/admin/boards/${boardId}/image`, {
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
      const res = await fetch(`/api/admin/boards/${boardId}/image`, {
        method: "DELETE",
      });
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
    <div className="flex items-center gap-3">
      <span className="relative shrink-0">
        <BoardIcon icon={icon} color={color} image={image} size={40} />
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-slate-900/50">
            <Loader2 size={14} className="animate-spin text-white" />
          </span>
        )}
      </span>

      <span className="min-w-0">
        <span className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-[11px] font-semibold text-ink transition hover:bg-canvas disabled:opacity-50"
          >
            <ImagePlus size={13} />
            {image ? "Change logo" : "Upload logo"}
          </button>

          {image && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-[11px] font-semibold text-object transition hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 size={13} />
              Remove
            </button>
          )}
        </span>

        {error && (
          <p role="alert" className="mt-1 text-[11px] text-object">
            {error}
          </p>
        )}
      </span>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={onPick}
        className="hidden"
        aria-label={`Choose a logo for ${boardName}`}
      />
    </div>
  );
}
