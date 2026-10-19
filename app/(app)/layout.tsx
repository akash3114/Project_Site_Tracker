import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { getSessionUser } from "@/lib/access";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="cockpit">
      <AppHeader role={user.role} />
      <div className="cockpit-route-content">{children}</div>
    </div>
  );
}
