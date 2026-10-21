import { redirect } from "next/navigation";

import { PlazasManager } from "@/components/admin/plazas-manager";
import { PageHeader } from "@/components/page-header";
import { getSessionUser } from "@/lib/access";

function Forbidden() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-[#1C2824]">
        Admin — Plazas
      </h1>
      <p role="alert" className="text-sm text-[#8F2824]">
        Forbidden: admins only.
      </p>
    </main>
  );
}

/** Admin + Head Office plazas console. */
export default async function AdminPlazasPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.isAdmin && user.role !== "HEAD_OFFICE") return <Forbidden />;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeader
        overline="Administration"
        title="Plazas"
        subtitle="Plaza names are unique per project; duplicates return 409."
      />
      <PlazasManager />
    </main>
  );
}
