import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import {
  accessiblePlazaIds,
  expandedPlazaIds,
  getSessionUser,
} from "@/lib/access";
import { db } from "@/lib/db";
import { userSchema } from "@/lib/validations";

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
 * GET /api/users → ADMIN sees all; MANAGEMENT sees users sharing its
 * visible plazas; MANAGER gets 403. plazaIds are expanded (direct plaza
 * assignments + project-assignment plazas), filtered to visible for
 * non-admins.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "MANAGER")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const visible = await accessiblePlazaIds(user.id, user.role);
  const visibleSet = new Set(visible);

  if (user.role === "ADMIN") {
    const users = await db.user.findMany({
      select: safeSelect,
      orderBy: { email: "asc" },
    });
    const withPlazas = await Promise.all(
      users.map(async (u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        active: u.active,
        plazaIds: await expandedPlazaIds(u.id),
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      })),
    );
    return NextResponse.json(withPlazas);
  }

  // MANAGEMENT: users sharing at least one visible plaza.
  const [direct, viaProjects] = await Promise.all([
    db.plazaAssignment.findMany({
      where: { plazaId: { in: visible } },
      select: { userId: true, plazaId: true },
    }),
    db.projectAssignment.findMany({
      select: { userId: true, project: { select: { plazas: { select: { id: true } } } } },
    }),
  ]);
  const ids = new Set<string>(direct.map((r) => r.userId));
  for (const pa of viaProjects) {
    if (pa.project.plazas.some((z) => visibleSet.has(z.id))) ids.add(pa.userId);
  }
  ids.add(user.id);
  const users = await db.user.findMany({
    where: { id: { in: Array.from(ids) } },
    select: safeSelect,
    orderBy: { email: "asc" },
  });
  const withPlazas = await Promise.all(
    users.map(async (u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      active: u.active,
      // Only reveal plaza ids the manager may itself see.
      plazaIds: (await expandedPlazaIds(u.id)).filter((id) =>
        visibleSet.has(id),
      ),
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    })),
  );
  return NextResponse.json(withPlazas);
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
        phone: parsed.data.phone,
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
