import type { ReactNode } from "react";

import { AdminNav } from "@/components/admin/admin-nav";
import { getSessionUser } from "@/lib/access";

/**
 * Admin shell: the shared sub-navigation sits above every admin page. Access
 * control stays with each page because users/categories are ADMIN-only while
 * projects/plazas/access/audit also allow Head Office.
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const user = await getSessionUser();
  if (!user || (!user.isAdmin && user.role !== "HEAD_OFFICE")) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col">
      <AdminNav isAdmin={user.isAdmin} />
      {children}
    </div>
  );
}
