import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/access";

/** Send each signed-in user straight to the dashboard for their access role. */
export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  redirect(user.role === "MANAGER" ? "/my-work" : "/management");
}
