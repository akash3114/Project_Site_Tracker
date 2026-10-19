import { redirect } from "next/navigation";

import { PlazasManager } from "@/components/admin/plazas-manager";
import { auth } from "@/lib/auth";

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

/** ADMIN + MANAGEMENT plazas console. */
export default async function AdminPlazasPage() {
  const session = await auth();
  const role = (session?.user as unknown as { role?: string } | undefined)
    ?.role;
  if (!session?.user) redirect("/login");
  if (role !== "ADMIN" && role !== "MANAGEMENT") return <Forbidden />;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-[#1C2824]">
          Admin — Plazas
        </h1>
        <p className="text-sm text-[#586760]">
          Plaza names are unique per project; duplicates return 409.
        </p>
      </div>
      <PlazasManager />
    </main>
  );
}
