import { redirect } from "next/navigation";

import { ManagementWorkspace } from "@/components/management/management-workspace";
import { getSessionUser } from "@/lib/access";

export default async function ManagementPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role === "PROJECT_MANAGER") redirect("/my-work");
  return <ManagementWorkspace userId={user.id} />;
}
