import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { getSessionUser } from "@/lib/access";
import { badgeTitle } from "@/lib/badge";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const title = await badgeTitle(user);

  return (
    <div className="cockpit">
      <AppHeader role={user.role} title={title} />
      <div className="cockpit-route-content">{children}</div>
    </div>
  );
}
