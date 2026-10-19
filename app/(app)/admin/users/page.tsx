import { redirect } from "next/navigation";

import { UsersManager } from "@/components/admin/users-manager";
import { auth } from "@/lib/auth";

function Forbidden() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-[#1C2824]">
        Admin — Users
      </h1>
      <p role="alert" className="text-sm text-[#8F2824]">
        Forbidden: admins only.
      </p>
    </main>
  );
}

/** ADMIN-gated users console (T-014). Deactivate only — never delete. */
export default async function AdminUsersPage() {
  const session = await auth();
  const role = (session?.user as unknown as { role?: string } | undefined)
    ?.role;
  if (!session?.user) redirect("/login");
  if (role !== "ADMIN") return <Forbidden />;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-[#1C2824]">
          Admin — Users
        </h1>
        <p className="text-sm text-[#586760]">
          Create, change role, reset password, or deactivate. Users are never
          deleted.
        </p>
      </div>
      <UsersManager />
    </main>
  );
}
