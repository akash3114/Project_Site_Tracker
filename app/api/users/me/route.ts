import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getSessionUser } from "@/lib/access";

/** GET /api/users/me → current session identity and display level. */
export async function GET(): Promise<Response> {
  const session = await auth();
  const u = session?.user as { id?: string; email?: string; name?: string } | undefined;
  if (!u?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    id: user.id,
    email: u.email,
    name: u.name,
    role: user.role,
    isAdmin: user.isAdmin,
  });
}
