import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/access";
import { db } from "@/lib/db";
import { updateCompanySchema } from "@/lib/validations";

type Ctx = { params: { id: string } };

export async function PATCH(req: Request, { params }: Ctx): Promise<Response> {
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

  const exists = await db.company.findUnique({ where: { id: params.id } });
  if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await db.company.update({
    where: { id: params.id },
    data: parsed.data,
  });
  return NextResponse.json(updated);
}
