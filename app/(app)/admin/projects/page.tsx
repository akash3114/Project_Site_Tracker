import { redirect } from "next/navigation";

import { ProjectsManager } from "@/components/admin/projects-manager";
import { auth } from "@/lib/auth";

function Forbidden() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-[#17222C]">
        Admin — Projects
      </h1>
      <p role="alert" className="text-sm text-[#DC2626]">
        Forbidden: admins only.
      </p>
    </main>
  );
}

/** ADMIN-gated projects console (T-012). */
export default async function AdminProjectsPage() {
  const session = await auth();
  const role = (session?.user as unknown as { role?: string } | undefined)
    ?.role;
  if (!session?.user) redirect("/login");
  if (role !== "ADMIN") return <Forbidden />;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-[#17222C]">
          Admin — Projects
        </h1>
        <p className="text-sm text-[#5C6F7E]">
          Scoped stats come from the same /api/projects feed as dashboards.
        </p>
      </div>
      <ProjectsManager />
    </main>
  );
}
