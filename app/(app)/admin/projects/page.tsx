import { redirect } from "next/navigation";

import { ProjectsManager } from "@/components/admin/projects-manager";
import { PageHeader } from "@/components/page-header";
import { getSessionUser } from "@/lib/access";

function Forbidden() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-[#1C2824]">
        Admin — Projects
      </h1>
      <p role="alert" className="text-sm text-[#8F2824]">
        Forbidden: admins only.
      </p>
    </main>
  );
}

/** Admin + Head Office projects console. */
export default async function AdminProjectsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.isAdmin && user.role !== "HEAD_OFFICE") return <Forbidden />;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeader
        overline="Administration"
        title="Projects"
        subtitle="Scoped stats come from the same /api/projects feed as dashboards."
      />
      <ProjectsManager />
    </main>
  );
}
