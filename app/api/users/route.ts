import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { accessiblePlazaIds, getSessionUser } from "@/lib/access";
import { db } from "@/lib/db";
import { userSchema } from "@/lib/validations";

const safeSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * GET /api/users → ADMIN sees all; PROJECT_LEAD sees users sharing its
 * plazas; SITE_USER gets 403.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "SITE_USER")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (user.role === "ADMIN") {
    const users = await db.user.findMany({
      select: {
        ...safeSelect,
        accesses: { select: { plazaId: true } },
      },
      orderBy: { email: "asc" },
    });
    return NextResponse.json(
      users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        active: u.active,
        plazaIds: u.accesses.map((a) => a.plazaId),
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      })),
    );
  }

  // PROJECT_LEAD: users sharing at least one of the lead's plazas.
  const visible = await accessiblePlazaIds(user.id, user.role);
  const rows = await db.userPlazaAccess.findMany({
    where: { plazaId: { in: visible } },
    select: { userId: true },
  });
  const ids = Array.from(new Set(rows.map((r) => r.userId)));
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: {
      ...safeSelect,
      accesses: { select: { plazaId: true } },
    },
    orderBy: { email: "asc" },
  });
  return NextResponse.json(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
      // Only reveal plaza ids the lead may itself see.
      plazaIds: u.accesses
        .map((a) => a.plazaId)
        .filter((id) => visible.includes(id)),
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    })),
  );
}

/** POST /api/users → ADMIN only. bcrypt(12). 409 on duplicate email. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body: unknown = await req.json().catch(() => null);
  const parsed = userSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );

  const email = parsed.data.email.toLowerCase();
  const dup = await db.user.findUnique({ where: { email } });
  if (dup)
    return NextResponse.json(
      { error: "Email already exists" },
      { status: 409 },
    );

  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const created = await db.user.create({
      data: {
        name: parsed.data.name,
        email,
        passwordHash,
        role: parsed.data.role,
      },
      select: safeSelect,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json(
        { error: "Email already exists" },
        { status: 409 },
      );
    throw e;
  }
}
