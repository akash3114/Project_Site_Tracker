import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { getSessionUser } from "@/lib/access";
import { db } from "@/lib/db";
import type { Role } from "@/lib/labels";
import { userSchema } from "@/lib/validations";

const assignmentInclude = {
  office: { select: { name: true } },
  headOfficeMemberships: {
    select: {
      departmentId: true,
      isPrimary: true,
      department: { select: { code: true, name: true, sortOrder: true } },
    },
  },
  projectAssignments: { select: { projectId: true } },
  plazaAssignments: { select: { plazaId: true, role: true } },
} as const;

function displayRole(user: {
  isAdmin: boolean;
  headOfficeMemberships: unknown[];
}): Role {
  if (user.isAdmin) return "ADMIN";
  if (user.headOfficeMemberships.length > 0) return "HEAD_OFFICE";
  return "PROJECT_MANAGER";
}

/** Primary membership, else the one with the lowest department sortOrder. */
function mainMembership<
  T extends { isPrimary: boolean; department: { sortOrder: number } },
>(memberships: T[]): T | null {
  const primary = memberships.find((m) => m.isPrimary);
  if (primary) return primary;
  const ordered = [...memberships].sort(
    (a, b) => a.department.sortOrder - b.department.sortOrder,
  );
  return ordered[0] ?? null;
}

/** GET /api/users → Admin/Head Office directory with assignment ids. */
export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin && user.role !== "HEAD_OFFICE") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      isAdmin: true,
      active: true,
      createdAt: true,
      updatedAt: true,
      ...assignmentInclude,
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    users.map((u) => {
      const memberships = [...u.headOfficeMemberships].sort(
        (a, b) =>
          Number(b.isPrimary) - Number(a.isPrimary) ||
          a.department.sortOrder - b.department.sortOrder,
      );
      const main = mainMembership(u.headOfficeMemberships);
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: displayRole(u),
        isAdmin: u.isAdmin,
        active: u.active,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        headOfficeMemberships: memberships.map((m) => ({
          departmentId: m.departmentId,
          code: m.department.code,
          name: m.department.name,
          isPrimary: m.isPrimary,
        })),
        departmentName: main?.department.name ?? null,
        departmentCode: main?.department.code ?? null,
        officeName: u.office?.name ?? null,
        projectIds: u.projectAssignments.map((r) => r.projectId),
        plazaIds: u.plazaAssignments.map((r) => r.plazaId),
        plazaRoles: u.plazaAssignments,
      };
    }),
  );
}

/** POST /api/users → Admin only. */
export async function POST(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body: unknown = await req.json().catch(() => null);
  const parsed = userSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase();
  const exists = await db.user.findUnique({ where: { email } });
  if (exists) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const created = await db.user.create({
    data: {
      name: parsed.data.name,
      email,
      phone: parsed.data.phone ?? null,
      passwordHash: await bcrypt.hash(parsed.data.password, 12),
      isAdmin: parsed.data.isAdmin,
      active: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      isAdmin: true,
      active: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(
    { ...created, role: created.isAdmin ? "ADMIN" : "PROJECT_MANAGER" },
    { status: 201 },
  );
}
