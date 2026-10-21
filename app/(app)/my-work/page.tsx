import { redirect } from "next/navigation";

import { RoleDashboard } from "@/components/role-dashboards";
import { getSessionUser } from "@/lib/access";

export default async function MyWorkPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "PROJECT_MANAGER") redirect("/management");
  return <RoleDashboard view="manager" />;
}
