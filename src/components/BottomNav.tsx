"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Compass, Home, Plus, User } from "lucide-react";
import clsx from "clsx";
import { Avatar } from "./Avatar";

/** Wireframe 15 — persistent on the app screens. */
const items = [
  { href: "/", label: "Home", icon: Home },
  { href: "/search", label: "Explore", icon: Compass },
  { href: "/create", label: "Create Post", icon: Plus, primary: true },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/profile", label: "Profile", icon: User },
];

/**
 * Routes that own the full viewport. The nav would sit on top of their
 * content — and there is nothing to navigate to before you're signed in.
 *
 * /admin has its own sidebar and its own navigation model; the aspirant-facing
 * tab bar floating over the dashboard belongs to a different product.
 */
const HIDDEN_ON = ["/welcome", "/login", "/register", "/admin"];

export function BottomNav({
  unreadCount = 0,
  user = null,
}: {
  unreadCount?: number;
  /** Signed-in user, so the Profile tab can show their own picture. */
  user?: { name: string; image: string | null } | null;
}) {
  const pathname = usePathname();

  if (HIDDEN_ON.some((route) => pathname.startsWith(route))) return null;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:inset-x-auto md:left-1/2 md:w-full md:max-w-3xl md:-translate-x-1/2 md:rounded-t-2xl md:border-x md:shadow-[0_-2px_16px_rgba(15,23,42,0.06)]"
    >
      <ul className="flex items-stretch justify-around">
        {items.map(({ href, label, icon: Icon, primary }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);

          if (primary) {
            return (
              <li key={href} className="flex items-center px-1">
                <Link
                  href={href}
                  aria-label={label}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-white shadow-md shadow-brand-600/25 transition hover:bg-brand-700"
                >
                  <Icon size={22} strokeWidth={2.6} />
                </Link>
              </li>
            );
          }

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition",
                  active ? "text-brand-600" : "text-ink-muted hover:text-ink"
                )}
              >
                <span className="relative">
                  {href === "/profile" && user ? (
                    <Avatar
                      name={user.name}
                      image={user.image}
                      size={20}
                      className={clsx(
                        "ring-offset-1",
                        active && "ring-2 ring-brand-500"
                      )}
                    />
                  ) : (
                    <Icon size={20} strokeWidth={active ? 2.4 : 2} />
                  )}
                  {href === "/notifications" && unreadCount > 0 && (
                    <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-object px-1 text-[9px] font-bold text-white">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
