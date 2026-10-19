import { redirect } from "next/navigation";

import { AccessManager } from "@/components/admin/access-manager";
import { PageHeader } from "@/components/page-header";
import { auth } from "@/lib/auth";

function Forbidden() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-[#1C2824]">
        Admin — Access matrix
      </h1>
      <p role="alert" className="text-sm text-[#8F2824]">
        Forbidden: admins only.
      </p>
    </main>
  );
}

/** ADMIN + MANAGEMENT access console. */
export default async function AdminAccessPage() {
  const session = await auth();
  const role = (session?.user as unknown as { role?: string } | undefined)
    ?.role;
  if (!session?.user) redirect("/login");
  if (role !== "ADMIN" && role !== "MANAGEMENT") return <Forbidden />;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeader
        overline="Administration"
        title="Access matrix"
        subtitle="Pick a user, set their projects and plaza job titles, then save in one transaction."
      />
      <AccessManager />
    </main>
  );
}
