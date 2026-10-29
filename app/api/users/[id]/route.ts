import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { getSessionUser } from "@/lib/access";
import { logAudit, snapshot } from "@/lib/audit";
import { db } from "@/lib/db";
import { updateUserSchema } from "@/lib/validations";

type Ctx = { params: { id: string } };

/**
 * PATCH /api/users/:id → Admin only.
 * Supports { name?, phone?, title?, isAdmin?, active?, password? }.
 * Deactivation via { active: false } — users are NEVER deleted.
 */
export async function PATCH(req: Request, { params }: Ctx): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const target = await db.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body: unknown = await req.json().catch(() => null);
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updated = await db.$transaction(async (tx) => {
    const next = await tx.user.update({
      where: { id: params.id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.phone !== undefined
          ? { phone: parsed.data.phone }
          : {}),
        ...(parsed.data.title !== undefined
          ? { title: parsed.data.title?.trim() || null }
          : {}),
        ...(parsed.data.isAdmin !== undefined
          ? { isAdmin: parsed.data.isAdmin }
          : {}),
        ...(parsed.data.active !== undefined
          ? { active: parsed.data.active }
          : {}),
        ...(parsed.data.password !== undefined
          ? { passwordHash: await bcrypt.hash(parsed.data.password, 12) }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        title: true,
        isAdmin: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const keys = ["name", "email", "phone", "title", "isAdmin", "active"];
    await logAudit(tx, {
      actorId: user.id,
      entity: "User",
      entityId: next.id,
      action: parsed.data.active === false ? "ARCHIVE" : "UPDATE",
      before: snapshot(target, keys),
      after: {
        ...snapshot(next, keys),
        ...(parsed.data.password !== undefined ? { passwordChanged: true } : {}),
      },
    });
    return next;
  });

  return NextResponse.json(updated);
}
