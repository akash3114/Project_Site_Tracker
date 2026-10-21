import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/access";
import { db } from "@/lib/db";
import { categorySchema } from "@/lib/validations";

/** GET /api/categories → active categories (admins also see archived). */
export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const categories = await db.taskCategory.findMany({
    where: user.isAdmin ? undefined : { active: true },
    include: { _count: { select: { tasks: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(
    categories.map((c) => ({
      id: c.id,
      name: c.name,
      active: c.active,
      taskCount: c._count.tasks,
    })),
  );
}

/** POST /api/categories → Admin only. */
export async function POST(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body: unknown = await req.json().catch(() => null);
  const parsed = categorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const exists = await db.taskCategory.findUnique({
    where: { name: parsed.data.name },
  });
  if (exists) {
    return NextResponse.json(
      { error: "A category with that name already exists" },
      { status: 409 },
    );
  }

  const created = await db.taskCategory.create({
    data: { name: parsed.data.name, active: parsed.data.active ?? true },
  });
  return NextResponse.json(created, { status: 201 });
}
