import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/access";

/** /admin → Users for Admins, Access for Head Office. APIs enforce per route. */
export default async function AdminIndex() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.isAdmin) redirect("/admin/users");
  if (user.role === "HEAD_OFFICE") redirect("/admin/access");
  redirect("/management");
}
