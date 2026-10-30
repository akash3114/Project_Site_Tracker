import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/access";
import { logAudit, snapshot } from "@/lib/audit";
import { db } from "@/lib/db";
import { updateCategorySchema } from "@/lib/validations";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body: unknown = await req.json().catch(() => null);
  const parsed = updateCategorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const exists = await db.taskCategory.findUnique({ where: { id } });
  if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await db
    .$transaction(async (tx) => {
      const next = await tx.taskCategory.update({
        where: { id },
        data: parsed.data,
      });
      await logAudit(tx, {
        actorId: user.id,
        entity: "TaskCategory",
        entityId: next.id,
        action: parsed.data.active === false ? "ARCHIVE" : "UPDATE",
        before: snapshot(exists, ["name", "active"]),
        after: snapshot(next, ["name", "active"]),
      });
      return next;
    })
    .catch((e: unknown) => {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        return null;
      }
      throw e;
    });
  if (!updated) {
    return NextResponse.json(
      { error: "A category with that name already exists" },
      { status: 409 },
    );
  }
  return NextResponse.json(updated);
}
