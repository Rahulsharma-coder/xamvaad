"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Thin loading bar under the header.
 *
 * App Router navigation blocks on the server render before anything new can
 * paint, which reads as the page being frozen. A route-level `loading.tsx`
 * would cover that gap, but it wraps the page in a Suspense boundary — Next
 * then flushes the shell and commits HTTP 200 before `notFound()` can run,
 * which is what made missing posts return 200 instead of 404. This bar gives
 * the same feedback from the client, with no boundary and no effect on status
 * codes.
 *
 * It creeps towards 90% while waiting rather than tracking real progress,
 * because the server gives no progress events — the point is to show that
 * something is happening, then resolve honestly when the route arrives.
 */
export function ProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(false);

  const creepRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failsafeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (creepRef.current) clearInterval(creepRef.current);
    if (doneRef.current) clearTimeout(doneRef.current);
    if (failsafeRef.current) clearTimeout(failsafeRef.current);
    creepRef.current = null;
    doneRef.current = null;
    failsafeRef.current = null;
  }, []);

  const start = useCallback(() => {
    clearTimers();
    setActive(true);
    setProgress(12);

    // Decelerating creep: fast at first, asymptotic towards 90%.
    creepRef.current = setInterval(() => {
      setProgress((current) => {
        if (current >= 90) return current;
        const step = current < 40 ? 6 : current < 70 ? 3 : 1;
        return Math.min(90, current + step);
      });
    }, 180);

    // If a navigation is cancelled or fails, don't leave the bar stuck.
    failsafeRef.current = setTimeout(() => finish(), 12_000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearTimers]);

  const finish = useCallback(() => {
    clearTimers();
    setProgress(100);
    // Let the 100% state paint before fading out.
    doneRef.current = setTimeout(() => {
      setActive(false);
      setProgress(0);
    }, 280);
  }, [clearTimers]);

  // The route actually changed — the navigation is done.
  useEffect(() => {
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      // Ignore anything the browser handles itself.
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || anchor.target === "_blank" || anchor.hasAttribute("download")) {
        return;
      }

      const destination = new URL(anchor.href, window.location.href);
      // External links leave the app; the browser shows its own indicator.
      if (destination.origin !== window.location.origin) return;
      // Same URL, or a pure hash jump — nothing loads.
      if (destination.href === window.location.href) return;
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search &&
        destination.hash
      ) {
        return;
      }

      start();
    }

    // Back/forward also trigger a server round-trip.
    function onPopState() {
      start();
    }

    document.addEventListener("click", onClick, { capture: true });
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("popstate", onPopState);
      clearTimers();
    };
  }, [start, clearTimers]);

  if (!active) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-0.5"
    >
      <div
        className="h-full bg-brand-500 transition-[width,opacity] duration-200 ease-out"
        style={{
          width: `${progress}%`,
          opacity: progress === 100 ? 0 : 1,
          boxShadow: "0 0 8px rgba(79,70,229,0.6)",
        }}
      />
    </div>
  );
}
