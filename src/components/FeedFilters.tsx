"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { POST_TYPE_LABEL } from "@/lib/rules";

type Option = { value: string; label: string };

/** Top filter rail on the board feed: Exam, Date, Shift, Post Type. */
export function FeedFilters({
  basePath,
  exams,
  dates,
  shifts,
  current,
}: {
  basePath: string;
  exams: Option[];
  dates: Option[];
  shifts: Option[];
  current: {
    exam?: string;
    date?: string;
    shift?: string;
    type?: string;
    sort?: string;
  };
}) {
  const router = useRouter();

  function apply(key: string, value: string) {
    const params = new URLSearchParams(
      Object.entries(current).filter(([, v]) => Boolean(v)) as [string, string][]
    );
    if (value) params.set(key, value);
    else params.delete(key);
    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath);
  }

  const active = Object.entries(current).filter(
    ([key, value]) => value && key !== "sort"
  );

  return (
    <div className="space-y-2">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        <FilterSelect
          label="Exam"
          value={current.exam ?? ""}
          options={exams}
          onChange={(value) => apply("exam", value)}
        />
        <FilterSelect
          label="Date"
          value={current.date ?? ""}
          options={dates}
          onChange={(value) => apply("date", value)}
        />
        <FilterSelect
          label="Shift"
          value={current.shift ?? ""}
          options={shifts}
          onChange={(value) => apply("shift", value)}
        />
        <FilterSelect
          label="Type"
          value={current.type ?? ""}
          options={Object.entries(POST_TYPE_LABEL).map(([value, label]) => ({
            value,
            label,
          }))}
          onChange={(value) => apply("type", value)}
        />
        <FilterSelect
          label="Sort"
          value={current.sort ?? ""}
          options={[
            { value: "latest", label: "Latest" },
            { value: "top", label: "Top" },
          ]}
          onChange={(value) => apply("sort", value)}
        />
      </div>

      {active.length > 0 && (
        <button
          type="button"
          onClick={() => router.push(basePath)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted transition hover:text-ink"
        >
          <X size={13} /> Clear {active.length}{" "}
          {active.length === 1 ? "filter" : "filters"}
        </button>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="shrink-0">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold outline-none transition ${
          value
            ? "border-brand-400 bg-brand-50 text-brand-700"
            : "border-hairline bg-surface text-ink"
        }`}
      >
        <option value="">{label}: All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
