"use client";

import { useState } from "react";
import clsx from "clsx";
import { avatarColor, initials } from "@/lib/format";
import { LogoTile } from "./Logo";

/**
 * Profile picture, falling back to coloured initials.
 *
 * Client-side because a remote avatar can fail after render — Google rotates
 * its photo URLs when a user changes their picture, and privacy extensions
 * block googleusercontent outright. Without an onError fallback those cases
 * leave a broken-image icon instead of the initials.
 */
export function Avatar({
  name,
  image,
  size = 32,
  official = false,
  className,
}: {
  name: string;
  image?: string | null;
  size?: number;
  /**
   * The platform's own account. Falls back to the brand mark instead of
   * initials — but only as a fallback: an administrator who is a real person
   * with a real photo keeps their photo.
   */
  official?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (image && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt={name}
        width={size}
        height={size}
        onError={() => setFailed(true)}
        // Google serves these cross-origin; no-referrer avoids the 403 some
        // CDNs return for an unexpected Referer header.
        referrerPolicy="no-referrer"
        // shrink-0 matters: without it the image collapses to a sliver when it
        // sits next to a long name in a tight flex row.
        className={clsx("shrink-0 rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  if (official) {
    return (
      <LogoTile
        size={size}
        radius={size / 2}
        className={clsx("rounded-full", className)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        className
      )}
      style={{
        width: size,
        height: size,
        background: avatarColor(name),
        fontSize: Math.max(10, size * 0.38),
      }}
    >
      {initials(name)}
    </span>
  );
}
