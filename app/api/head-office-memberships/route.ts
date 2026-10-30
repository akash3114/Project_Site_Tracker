import { NextResponse } from "next/server";

import { canManageProjects, getSessionUser } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  headOfficeMembershipSchema,
  headOfficeMembershipUpdateSchema,
} from "@/lib/validations";

const membershipSelect = {
  userId: true,
  departmentId: true,
  isPrimary: true,
  assignedById: true,
  assignedAt: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      office: { select: { name: true } },
    },
  },
  department: {
    select: { id: true, name: true, code: true, sortOrder: true },
  },
} as const;

/**
 * GET /api/head-office-memberships?userId=&departmentId=
 * Head Office department memberships. Admin/Head Office only.
 */
export async function GET(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageProjects(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") ?? undefined;
  const departmentId = searchParams.get("departmentId") ?? undefined;

  const memberships = await db.headOfficeMembership.findMany({
    where: {
      ...(userId ? { userId } : {}),
      ...(departmentId ? { departmentId } : {}),
    },
    select: membershipSelect,
    orderBy: [
      { department: { sortOrder: "asc" } },
      { user: { name: "asc" } },
    ],
  });

  return NextResponse.json({ memberships });
}

/**
 * POST /api/head-office-memberships → grant a department.
 * `{ userId, departmentId, isPrimary? }`. A person with memberships always has
 * exactly one primary: the grant is primary when `isPrimary` is true or when it
 * is the user's first membership. A primary grant clears the user's other
 * primary membership in the same transaction.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageProjects(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: unknown = await req.json().catch(() => null);
  const parsed = headOfficeMembershipSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { userId, departmentId, isPrimary } = parsed.data;
  const [target, department, existingCount] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { id: true } }),
    db.department.findUnique({
      where: { id: departmentId },
      select: { id: true, active: true },
    }),
    db.headOfficeMembership.count({ where: { userId } }),
  ]);
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!department) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }
  if (!department.active) {
    return NextResponse.json(
      { error: "Department is inactive" },
      { status: 404 },
    );
  }

  // The first membership is always primary; otherwise only an explicit
  // isPrimary keeps the invariant satisfied.
  const becomePrimary = isPrimary === true || existingCount === 0;

  const membership = await db.$transaction(async (tx) => {
    if (becomePrimary) {
      await tx.headOfficeMembership.updateMany({
        where: { userId, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    const membership = await tx.headOfficeMembership.upsert({
      where: { userId_departmentId: { userId, departmentId } },
      update: becomePrimary ? { isPrimary: true } : {},
      create: {
        userId,
        departmentId,
        isPrimary: becomePrimary,
        assignedById: user.id,
      },
      select: membershipSelect,
    });
    await logAudit(tx, {
      actorId: user.id,
      entity: "HeadOfficeMembership",
      entityId: `${userId}:${departmentId}`,
      action: "GRANT",
      after: { userId, departmentId, isPrimary: membership.isPrimary },
    });
    return membership;
  });

  return NextResponse.json(membership, { status: 201 });
}

/**
 * PUT /api/head-office-memberships → set/clear the primary department.
 * `{ userId, departmentId, isPrimary }`, transactional. Clearing enforces the
 * invariant: a person with memberships keeps exactly one primary, so the only
 * membership cannot be demoted (400) and any other demotion promotes the
 * remaining membership with the lowest department `sortOrder`.
 */
export async function PUT(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageProjects(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: unknown = await req.json().catch(() => null);
  const parsed = headOfficeMembershipUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { userId, departmentId, isPrimary } = parsed.data;
  const existing = await db.headOfficeMembership.findUnique({
    where: { userId_departmentId: { userId, departmentId } },
    select: { userId: true, isPrimary: true },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Head Office membership not found" },
      { status: 404 },
    );
  }

  const result = await db.$transaction(async (tx) => {
    const record = (membership: { isPrimary: boolean }) =>
      logAudit(tx, {
        actorId: user.id,
        entity: "HeadOfficeMembership",
        entityId: `${userId}:${departmentId}`,
        action: "UPDATE",
        before: { isPrimary: existing.isPrimary },
        after: { isPrimary: membership.isPrimary },
      });

    if (isPrimary) {
      await tx.headOfficeMembership.updateMany({
        where: { userId, isPrimary: true, departmentId: { not: departmentId } },
        data: { isPrimary: false },
      });
      const membership = await tx.headOfficeMembership.update({
        where: { userId_departmentId: { userId, departmentId } },
        data: { isPrimary: true },
        select: membershipSelect,
      });
      await record(membership);
      return { kind: "ok" as const, membership };
    }

    const current = await tx.headOfficeMembership.findUnique({
      where: { userId_departmentId: { userId, departmentId } },
      select: { isPrimary: true },
    });
    if (!current) return { kind: "missing" as const };
    if (!current.isPrimary) {
      const membership = await tx.headOfficeMembership.update({
        where: { userId_departmentId: { userId, departmentId } },
        data: { isPrimary: false },
        select: membershipSelect,
      });
      await record(membership);
      return { kind: "ok" as const, membership };
    }

    const remaining = await tx.headOfficeMembership.findFirst({
      where: { userId, departmentId: { not: departmentId } },
      orderBy: [{ department: { sortOrder: "asc" } }, { departmentId: "asc" }],
      select: { departmentId: true },
    });
    if (!remaining) return { kind: "last-primary" as const };

    // Promote the successor before demoting this row so the partial unique
    // index always sees exactly one primary.
    await tx.headOfficeMembership.update({
      where: {
        userId_departmentId: {
          userId,
          departmentId: remaining.departmentId,
        },
      },
      data: { isPrimary: true },
    });
    const membership = await tx.headOfficeMembership.update({
      where: { userId_departmentId: { userId, departmentId } },
      data: { isPrimary: false },
      select: membershipSelect,
    });
    await record(membership);
    return { kind: "ok" as const, membership };
  });

  if (result.kind === "missing") {
    return NextResponse.json(
      { error: "Head Office membership not found" },
      { status: 404 },
    );
  }
  if (result.kind === "last-primary") {
    return NextResponse.json(
      { error: "A Head Office member must keep one primary department" },
      { status: 400 },
    );
  }
  return NextResponse.json(result.membership);
}

/**
 * DELETE /api/head-office-memberships?userId=&departmentId= → revoke.
 * Removing a user's last membership demotes them to their project/plaza
 * assignments (or no access); Admin can always re-grant, so the operation is
 * allowed. Users are never deleted. Revoking the primary membership promotes
 * the remaining membership with the lowest department `sortOrder`, so anyone
 * who keeps a membership also keeps exactly one primary.
 */
export async function DELETE(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageProjects(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const departmentId = searchParams.get("departmentId");
  if (!userId || !departmentId) {
    return NextResponse.json(
      { error: "userId and departmentId are required" },
      { status: 400 },
    );
  }

  const result = await db.$transaction(async (tx) => {
    const existing = await tx.headOfficeMembership.findUnique({
      where: { userId_departmentId: { userId, departmentId } },
      select: { isPrimary: true },
    });
    if (!existing) return { kind: "missing" as const };

    await tx.headOfficeMembership.delete({
      where: { userId_departmentId: { userId, departmentId } },
    });

    await logAudit(tx, {
      actorId: user.id,
      entity: "HeadOfficeMembership",
      entityId: `${userId}:${departmentId}`,
      action: "REVOKE",
      before: { userId, departmentId, isPrimary: existing.isPrimary },
    });

    if (existing.isPrimary) {
      const remaining = await tx.headOfficeMembership.findFirst({
        where: { userId },
        orderBy: [
          { department: { sortOrder: "asc" } },
          { departmentId: "asc" },
        ],
        select: { departmentId: true },
      });
      if (remaining) {
        await tx.headOfficeMembership.update({
          where: {
            userId_departmentId: {
              userId,
              departmentId: remaining.departmentId,
            },
          },
          data: { isPrimary: true },
        });
      }
    }
    return { kind: "ok" as const };
  });

  if (result.kind === "missing") {
    return NextResponse.json(
      { error: "Head Office membership not found" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
