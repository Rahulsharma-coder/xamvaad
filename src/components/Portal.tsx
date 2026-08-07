"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Renders children into <body>.
 *
 * Necessary for any full-screen overlay: `backdrop-blur` on an ancestor — the
 * sticky headers use it — makes that ancestor the containing block for
 * `position: fixed` descendants, so a modal would be trapped inside the header
 * instead of covering the viewport. Same trap applies to `transform` and
 * `filter`, so overlays are portalled rather than relying on where they sit.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  // document doesn't exist during SSR, so wait for the client.
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}
