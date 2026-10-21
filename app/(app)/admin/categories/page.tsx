import { redirect } from "next/navigation";

import { CategoriesManager } from "@/components/admin/categories-manager";
import { PageHeader } from "@/components/page-header";
import { getSessionUser } from "@/lib/access";

function Forbidden() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-[#1C2824]">
        Admin — Task categories
      </h1>
      <p role="alert" className="text-sm text-[#8F2824]">
        Forbidden: admins only.
      </p>
    </main>
  );
}

/** ADMIN-gated task category console. One category per task. */
export default async function AdminCategoriesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.isAdmin) return <Forbidden />;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeader
        overline="Administration"
        title="Task categories"
        subtitle="Categories are managed here and selected one per task. Archiving keeps history but removes the category from new-task pickers."
      />
      <CategoriesManager />
    </main>
  );
}
