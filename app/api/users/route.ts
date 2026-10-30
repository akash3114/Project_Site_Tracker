import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { getSessionUser } from "@/lib/access";
import { logAudit, snapshot } from "@/lib/audit";
import { db } from "@/lib/db";
import type { Role } from "@/lib/labels";
import { managerCycleError } from "@/lib/reporting";
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
  manager: { select: { id: true, name: true } },
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
      title: true,
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
        title: u.title,
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
        managerId: u.manager?.id ?? null,
        managerName: u.manager?.name ?? null,
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

  const managerId = parsed.data.managerId ?? null;
  const cycleError = await managerCycleError("", managerId);
  if (cycleError) {
    return NextResponse.json({ error: cycleError }, { status: 422 });
  }

  const created = await db.$transaction(async (tx) => {
    const next = await tx.user.create({
      data: {
        name: parsed.data.name,
        email,
        phone: parsed.data.phone ?? null,
        title: parsed.data.title?.trim() || null,
        passwordHash: await bcrypt.hash(parsed.data.password, 12),
        isAdmin: parsed.data.isAdmin,
        active: true,
        managerId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        title: true,
        isAdmin: true,
        active: true,
        managerId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    await logAudit(tx, {
      actorId: user.id,
      entity: "User",
      entityId: next.id,
      action: "CREATE",
      after: snapshot(next, [
        "name",
        "email",
        "phone",
        "title",
        "isAdmin",
        "active",
        "managerId",
      ]),
    });
    return next;
  });

  return NextResponse.json(
    { ...created, role: created.isAdmin ? "ADMIN" : "PROJECT_MANAGER" },
    { status: 201 },
  );
}
