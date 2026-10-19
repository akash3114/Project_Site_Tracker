import { redirect } from "next/navigation";

import { RoleDashboard } from "@/components/role-dashboards";
import { getSessionUser } from "@/lib/access";

export default async function ManagementPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role === "MANAGER") redirect("/my-work");
  return <RoleDashboard view="management" />;
}
