import { redirect } from "next/navigation";

/** /admin → default to user management. APIs enforce ADMIN per route. */
export default function AdminIndex() {
  redirect("/admin/users");
}
