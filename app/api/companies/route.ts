import { NextResponse } from "next/server";

import { accessibleProjectIds, getSessionUser } from "@/lib/access";
import { db } from "@/lib/db";
import { companySchema } from "@/lib/validations";

/** GET /api/companies → companies visible to the caller with project counts. */
export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectIds = await accessibleProjectIds(user);
  const companies = await db.company.findMany({
    where:
      user.isAdmin || user.role === "HEAD_OFFICE"
        ? undefined
        : { projects: { some: { id: { in: projectIds } } } },
    include: { _count: { select: { projects: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    companies.map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code,
      active: c.active,
      projectCount: c._count.projects,
    })),
  );
}

/** POST /api/companies → Admin only. */
export async function POST(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body: unknown = await req.json().catch(() => null);
  const parsed = companySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { name, code, active } = parsed.data;
  const created = await db.company.create({
    data: {
      name,
      code: code || name.replace(/[^A-Z]/g, "").slice(0, 8) || "COMPANY",
      active: active ?? true,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
