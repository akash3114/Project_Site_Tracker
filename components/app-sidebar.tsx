"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

export type NavKey = "Dashboard" | "My Tasks" | "Projects" | "Admin";

/** Current role for gating nav. null = loading, string = role, false = unauthenticated. */
export function useRole(): string | null | false {
  const [role, setRole] = useState<string | null | false>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/users/me", { credentials: "same-origin" });
        if (!res.ok) {
          if (!cancelled) setRole(false);
          return;
        }
        const me = (await res.json()) as { role?: string };
        if (!cancelled) setRole(me.role ?? false);
      } catch {
        if (!cancelled) setRole(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return role;
}

/** Shared sidebar. Admin link hidden from SITE_USER (no more dead-end nav). */
export function AppSidebar({ active }: { active: NavKey }) {
  const role = useRole();
  const items: NavKey[] = ["Dashboard", "My Tasks", "Projects"];
  if (role === "ADMIN" || role === "PROJECT_LEAD") items.push("Admin");
  return (
    <aside
      aria-label="Primary navigation"
      className="hidden w-60 shrink-0 flex-col gap-2 border-r border-[rgba(23,34,44,0.08)] bg-[#0E121B] p-4 text-white md:flex"
    >
      <p className="font-display text-lg font-semibold tracking-[-0.02em]">Site Tracker</p>
      <nav className="mt-4 flex flex-col gap-1">
        {items.map((item) => (
          <a
            key={item}
            href={item === "Dashboard" ? "/" : `/${item.toLowerCase().replace(" ", "-")}`}
            aria-current={item === active ? "page" : undefined}
            className={`flex min-h-[44px] items-center rounded-[6px] px-3 text-sm pst-transition hover:bg-white/10 ${
              item === active ? "bg-[#5E6AD2] font-semibold text-white" : "text-white/70"
            }`}
          >
            {item}
          </a>
        ))}
      </nav>
      <button
        type="button"
        onClick={() => void signOut({ callbackUrl: "/login" })}
        className="mt-auto flex min-h-[44px] items-center rounded-[6px] px-3 text-sm text-white/70 pst-transition hover:bg-white/10 hover:text-white"
      >
        Sign out
      </button>
    </aside>
  );
}
