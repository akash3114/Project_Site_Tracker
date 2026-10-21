import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/access";
import { db } from "@/lib/db";
import { updateCategorySchema } from "@/lib/validations";

type Ctx = { params: { id: string } };

export async function PATCH(req: Request, { params }: Ctx): Promise<Response> {
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

  const exists = await db.taskCategory.findUnique({ where: { id: params.id } });
  if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await db.taskCategory
    .update({
      where: { id: params.id },
      data: parsed.data,
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
