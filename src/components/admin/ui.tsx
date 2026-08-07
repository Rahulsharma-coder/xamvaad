import Link from "next/link";
import clsx from "clsx";

/** Shared building blocks for the admin screens. */

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold text-ink">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
        )}
      </div>
      {action}
    </header>
  );
}

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={clsx(
        "rounded-2xl border border-hairline bg-surface p-4",
        className
      )}
    >
      {children}
    </section>
  );
}

/** A headline number with a label, used across the dashboard. */
export function Stat({
  label,
  value,
  hint,
  href,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  tone?: "default" | "warn" | "danger" | "good";
}) {
  const toneClass = {
    default: "text-ink",
    warn: "text-amber-600",
    danger: "text-object",
    good: "text-settled",
  }[tone];

  const body = (
    <>
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className={clsx("mt-1 text-2xl font-extrabold tabular-nums", toneClass)}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-ink-muted">{hint}</p>}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="rounded-xl border border-hairline bg-surface p-3.5 transition hover:border-brand-300 hover:shadow-sm"
      >
        {body}
      </Link>
    );
  }

  return (
    <div className="rounded-xl border border-hairline bg-surface p-3.5">
      {body}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "live" | "warn" | "danger" | "done";
}) {
  const toneClass = {
    neutral: "bg-slate-100 text-ink-muted",
    live: "bg-emerald-50 text-settled",
    warn: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-object",
    done: "bg-brand-50 text-brand-700",
  }[tone];

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
        toneClass
      )}
    >
      {children}
    </span>
  );
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-hairline bg-surface p-8 text-center text-sm text-ink-muted">
      {children}
    </div>
  );
}

/** Consistent field label + control wrapper for the admin forms. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-ink">{label}</span>
      {hint && (
        <span className="mt-0.5 block text-[11px] text-ink-muted">{hint}</span>
      )}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none transition focus:border-brand-400 focus:bg-surface";
