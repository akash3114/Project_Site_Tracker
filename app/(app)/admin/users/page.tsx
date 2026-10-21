import { redirect } from "next/navigation";

import { UsersManager } from "@/components/admin/users-manager";
import { PageHeader } from "@/components/page-header";
import { getSessionUser } from "@/lib/access";

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
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.isAdmin) return <Forbidden />;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeader
        overline="Administration"
        title="Users"
        subtitle="Create, change account type, reset password, or deactivate. Users are never deleted."
      />
      <UsersManager />
    </main>
  );
}
