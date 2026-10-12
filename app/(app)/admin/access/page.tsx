import { redirect } from "next/navigation";

import { AccessManager } from "@/components/admin/access-manager";
import { auth } from "@/lib/auth";

function Forbidden() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-[#17222C]">
        Admin — Access matrix
      </h1>
      <p role="alert" className="text-sm text-[#DC2626]">
        Forbidden: admins only.
      </p>
    </main>
  );
}

/** ADMIN-gated user↔plaza mapping console (T-014). */
export default async function AdminAccessPage() {
  const session = await auth();
  const role = (session?.user as unknown as { role?: string } | undefined)
    ?.role;
  if (!session?.user) redirect("/login");
  if (role !== "ADMIN") return <Forbidden />;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-[#17222C]">
          Admin — Access matrix
        </h1>
        <p className="text-sm text-[#5C6F7E]">
          Pick a user, tick plazas, save. Replaces mappings in one transaction.
        </p>
      </div>
      <AccessManager />
    </main>
  );
}
