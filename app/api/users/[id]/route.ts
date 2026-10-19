import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { getSessionUser } from "@/lib/access";
import { db } from "@/lib/db";
import { updateUserSchema } from "@/lib/validations";

type Ctx = { params: { id: string } };

const safeSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * PATCH /api/users/:id → ADMIN only.
 * Supports { name?, phone?, role?, active?, password? }.
 * Deactivation via { active: false } — users are NEVER deleted
 * (no DELETE export exists on this route).
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const target = await db.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body: unknown = await req.json().catch(() => null);
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );

  const data: {
    name?: string;
    phone?: string | null;
    role?: typeof target.role;
    active?: boolean;
    passwordHash?: string;
  } = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.phone !== undefined) data.phone = parsed.data.phone;
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.active !== undefined) data.active = parsed.data.active;
  if (parsed.data.password !== undefined)
    data.passwordHash = await bcrypt.hash(parsed.data.password, 12);

  const updated = await db.user.update({
    where: { id: params.id },
    data,
    select: safeSelect,
  });
  return NextResponse.json(updated);
}
