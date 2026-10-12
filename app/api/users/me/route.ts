import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

/** GET /api/users/me → current session identity (for role-gated UI). */
export async function GET(): Promise<Response> {
  const session = await auth();
  const u = session?.user as { id?: string; email?: string; name?: string; role?: string } | undefined;
  if (!u?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ id: u.id, email: u.email, name: u.name, role: u.role });
}
