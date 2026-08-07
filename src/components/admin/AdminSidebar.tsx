"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  Flag,
  Hash,
  LayoutGrid,
  Library,
  Megaphone,
  ScrollText,
  UserMinus,
  Users,
} from "lucide-react";
import clsx from "clsx";
import { LogoTile } from "@/components/Logo";

/**
 * Admin navigation.
 *
 * Grouped the way the work actually flows — run the exam, police the
 * community, then look at people and numbers — rather than by data model.
 */
const GROUPS: {
  items: { href: string; label: string; icon: typeof LayoutGrid; adminOnly?: boolean }[];
}[] = [
  {
    items: [{ href: "/admin", label: "Dashboard", icon: LayoutGrid }],
  },
  {
    items: [
      { href: "/admin/exams", label: "Exam Operations", icon: CalendarDays },
      { href: "/admin/boards", label: "Boards & Exams", icon: Library, adminOnly: true },
      { href: "/admin/taxonomy", label: "Shifts & Tags", icon: Hash },
      { href: "/admin/updates", label: "Official Updates", icon: Megaphone },
    ],
  },
  {
    items: [
      // Named "Reports", not "Reported Posts": comments can be reported too.
      { href: "/admin/reports", label: "Reports", icon: Flag },
      { href: "/admin/blocked", label: "Blocked Users", icon: UserMinus },
    ],
  },
  {
    items: [
      { href: "/admin/users", label: "All Users", icon: Users },
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/admin/audit", label: "Audit Log", icon: ScrollText },
    ],
  },
];

export function AdminSidebar({
  name,
  role,
  scopeLabel,
}: {
  name: string;
  role: string;
  scopeLabel: string;
}) {
  const pathname = usePathname();
  const isFullAdmin = role === "ADMIN";

  return (
    <nav
      aria-label="Admin"
      className="rounded-2xl border border-hairline bg-surface p-2"
    >
      <div className="flex items-center gap-2.5 px-2 py-3">
        {/* The brand tile, not a generic shield — this is the platform's own
            account, and it should look the same here as it does in the tab. */}
        <LogoTile size={36} radius={10} />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-ink">{name}</p>
          <p className="truncate text-[11px] text-ink-muted">{scopeLabel}</p>
        </div>
      </div>

      {GROUPS.map((group, groupIndex) => {
        const items = group.items.filter(
          (item) => !item.adminOnly || isFullAdmin
        );
        if (items.length === 0) return null;

        return (
          <div
            key={groupIndex}
            className={clsx(
              groupIndex > 0 && "mt-1 border-t border-hairline pt-1"
            )}
          >
            <ul>
              {items.map((item) => {
                const Icon = item.icon;
                // Exact match for the dashboard, prefix match elsewhere, so
                // /admin/exams/ssc-cgl still highlights Exam Operations.
                const active =
                  item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(item.href);

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={clsx(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition",
                        active
                          ? "bg-brand-50 text-brand-700"
                          : "text-ink-muted hover:bg-canvas hover:text-ink"
                      )}
                    >
                      <Icon size={16} strokeWidth={2.1} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <div className="mt-1 border-t border-hairline pt-1">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-ink-muted transition hover:bg-canvas hover:text-ink"
        >
          <ClipboardList size={16} strokeWidth={2.1} />
          Back to Xamvaad
        </Link>
      </div>
    </nav>
  );
}
