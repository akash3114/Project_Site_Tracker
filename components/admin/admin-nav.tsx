"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { label: "Users", href: "/admin/users", adminOnly: true },
  { label: "Access", href: "/admin/access", adminOnly: false },
  { label: "Projects", href: "/admin/projects", adminOnly: false },
  { label: "Plazas", href: "/admin/plazas", adminOnly: false },
  { label: "Categories", href: "/admin/categories", adminOnly: true },
  { label: "Audit", href: "/admin/audit", adminOnly: false },
];

/** Sub-navigation shared by every admin page. Active state comes from the path. */
export function AdminNav({ isAdmin }: Readonly<{ isAdmin: boolean }>) {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav
      aria-label="Administration"
      className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-1 px-4 pt-4 pb-1 md:px-6"
    >
      {links
        .filter((link) => isAdmin || !link.adminOnly)
        .map((link) => {
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-[44px] items-center border-b-2 px-2 font-mono text-[11px] uppercase tracking-[0.08em] ${
                active
                  ? "border-[#173B33] font-semibold text-[#173B33]"
                  : "border-transparent text-[#586760] hover:text-[#1C2824]"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
    </nav>
  );
}
