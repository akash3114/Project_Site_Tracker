import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/access";
import { logAudit, snapshot } from "@/lib/audit";
import { db } from "@/lib/db";
import { updateCompanySchema } from "@/lib/validations";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body: unknown = await req.json().catch(() => null);
  const parsed = updateCompanySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const exists = await db.company.findUnique({ where: { id } });
  if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await db.$transaction(async (tx) => {
    const next = await tx.company.update({
      where: { id },
      data: parsed.data,
    });
    await logAudit(tx, {
      actorId: user.id,
      entity: "Company",
      entityId: next.id,
      action: parsed.data.active === false ? "ARCHIVE" : "UPDATE",
      before: snapshot(exists, ["name", "code", "active"]),
      after: snapshot(next, ["name", "code", "active"]),
    });
    return next;
  });
  return NextResponse.json(updated);
}
