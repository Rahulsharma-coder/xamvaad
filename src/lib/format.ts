/** Display helpers shared by server components and client components. */

/** "12.4K discussing" — the compact counts used across the wireframes. */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 100_000) {
    const k = n / 1000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}K`;
  }
  const m = n / 100_000;
  return `${m.toFixed(1).replace(/\.0$/, "")}L`;
}

/** "10 min ago", "2 hr ago", "3 d ago" */
export function timeAgo(date: Date | string): string {
  const then = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - then.getTime()) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} w ago`;
  return then.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** "25 July" — the shift/date label used on exam cards. */
export function examDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** "25 Jul" — the terser form used inside the lifecycle stepper. */
export function shortDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** "25 - 30 Jul" for the objection window node. */
export function dateRange(
  start: Date | string | null,
  end: Date | string | null
): string {
  if (!start && !end) return "TBA";
  if (start && !end) return shortDate(start);
  if (!start && end) return shortDate(end!);

  const s = typeof start === "string" ? new Date(start) : start!;
  const e = typeof end === "string" ? new Date(end) : end!;
  const sameMonth = s.getUTCMonth() === e.getUTCMonth();
  if (sameMonth) {
    const month = e.toLocaleDateString("en-IN", {
      month: "short",
      timeZone: "UTC",
    });
    return `${s.getUTCDate()} - ${e.getUTCDate()} ${month}`;
  }
  return `${shortDate(s)} - ${shortDate(e)}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/** Deterministic avatar tint so a user keeps the same colour everywhere. */
export function avatarColor(seed: string): string {
  const palette = [
    "#4F46E5",
    "#0EA5E9",
    "#059669",
    "#D97706",
    "#DC2626",
    "#7C3AED",
    "#DB2777",
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length]!;
}
