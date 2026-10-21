"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import type { Role } from "@/lib/labels";

type AppRole = Role;

export function AppHeader({
  role,
  title,
}: {
  role: AppRole;
  title: string;
}) {
  const pathname = usePathname();
  const home = role === "PROJECT_MANAGER" ? "/my-work" : "/management";
  const items = role === "PROJECT_MANAGER"
    ? [
        { label: "My work", href: "/my-work" },
        { label: "Projects", href: "/projects" },
        { label: "My tasks", href: "/my-tasks" },
      ]
    : [
        { label: "Portfolio", href: "/management" },
        { label: "Projects", href: "/projects" },
        { label: "My tasks", href: "/my-tasks" },
        { label: "Administration", href: "/admin" },
      ];
  function isActive(href: string) {
    if (href === home) return pathname === href || pathname === "/";
    if (href === "/projects") return pathname.startsWith("/projects") || pathname.startsWith("/plazas");
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <header className="cockpit-header">
      <div className="cockpit-header-inner">
        <Link className="cockpit-brand" href={home}>
          <span className="cockpit-mark" aria-hidden="true">NH</span>
          <span>Site Operations</span>
        </Link>
        <nav className="cockpit-nav" aria-label="Main navigation">
          {items.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={active ? "active" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="cockpit-user-tools">
          <span className="cockpit-role">{title}</span>
          <button type="button" onClick={() => void signOut({ callbackUrl: "/login" })}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
