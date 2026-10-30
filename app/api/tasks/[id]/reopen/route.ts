import { NextResponse } from "next/server";

import {
  canApproveReopen,
  canReopenDirectly,
  canRequestReopen,
  getSessionUser,
  requireTaskAccess,
} from "@/lib/access";
import { db } from "@/lib/db";
import { reopenDecisionSchema, reopenRequestSchema } from "@/lib/validations";

/** GET /api/tasks/:id/reopen → the pending reopen request, if any. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await requireTaskAccess(user, id);
    const request = await db.taskReopenRequest.findFirst({
      where: { taskId: id, status: "PENDING" },
      include: {
        requestedBy: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ request });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

/**
 * POST /api/tasks/:id/reopen
 * - { reason } → Admin/HO reopen directly; PM/site managers create a request.
 * - { requestId, decision, note? } → Admin/HO approve or reject a request.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: unknown = await req.json().catch(() => null);
    const access = await requireTaskAccess(user, id);

    const isDecision =
      body !== null &&
      typeof body === "object" &&
      "decision" in (body as Record<string, unknown>);

    if (isDecision) {
      if (!canApproveReopen(access.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const parsed = reopenDecisionSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", issues: parsed.error.flatten() },
          { status: 400 },
        );
      }

      const request = await db.taskReopenRequest.findUnique({
        where: { id: parsed.data.requestId },
      });
      if (!request || request.taskId !== id) {
        return NextResponse.json({ error: "Request not found" }, { status: 404 });
      }
      if (request.status !== "PENDING") {
        return NextResponse.json(
          { error: "This request is no longer pending" },
          { status: 409 },
        );
      }

      const approve = parsed.data.decision === "APPROVE";
      const result = await db.$transaction(async (tx) => {
        const reviewed = await tx.taskReopenRequest.update({
          where: { id: request.id },
          data: {
            status: approve ? "APPROVED" : "REJECTED",
            reviewedById: user.id,
            reviewedAt: new Date(),
            reviewNote: parsed.data.note ?? null,
          },
          include: {
            requestedBy: { select: { id: true, name: true } },
            reviewedBy: { select: { id: true, name: true } },
          },
        });

        if (approve) {
          await tx.task.update({
            where: { id },
            data: {
              status: "IN_PROGRESS",
              completedAt: null,
              completedById: null,
            },
          });
        }

        await tx.taskActivity.create({
          data: {
            taskId: id,
            actorId: user.id,
            type: approve ? "REOPEN_APPROVED" : "REOPEN_REJECTED",
            fromStatus: "COMPLETED",
            toStatus: approve ? "IN_PROGRESS" : "COMPLETED",
            text: parsed.data.note
              ? `${request.reason} — ${parsed.data.note}`
              : request.reason,
          },
        });

        return reviewed;
      });

      return NextResponse.json(result);
    }

    const parsed = reopenRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "A reason of at least 10 characters is required", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    if (access.task.status !== "COMPLETED") {
      return NextResponse.json(
        { error: "Only completed tasks can be reopened" },
        { status: 422 },
      );
    }

    const pending = await db.taskReopenRequest.findFirst({
      where: { taskId: id, status: "PENDING" },
      select: { id: true },
    });
    if (pending) {
      return NextResponse.json(
        { error: "A reopen request is already pending for this task" },
        { status: 409 },
      );
    }

    if (canReopenDirectly(access.role)) {
      const updated = await db.$transaction(async (tx) => {
        await tx.taskReopenRequest.updateMany({
          where: { taskId: id, status: "PENDING" },
          data: {
            status: "APPROVED",
            reviewedById: user.id,
            reviewedAt: new Date(),
            reviewNote: "Direct reopen by approver",
          },
        });
        const task = await tx.task.update({
          where: { id },
          data: {
            status: "IN_PROGRESS",
            completedAt: null,
            completedById: null,
          },
        });
        await tx.taskActivity.create({
          data: {
            taskId: id,
            actorId: user.id,
            type: "REOPENED",
            fromStatus: "COMPLETED",
            toStatus: "IN_PROGRESS",
            text: parsed.data.reason,
          },
        });
        return task;
      });
      return NextResponse.json({ task: updated, request: null });
    }

    if (!canRequestReopen(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const request = await db.$transaction(async (tx) => {
      const created = await tx.taskReopenRequest.create({
        data: {
          taskId: id,
          requestedById: user.id,
          reason: parsed.data.reason,
          status: "PENDING",
        },
        include: {
          requestedBy: { select: { id: true, name: true } },
          reviewedBy: { select: { id: true, name: true } },
        },
      });
      await tx.taskActivity.create({
        data: {
          taskId: id,
          actorId: user.id,
          type: "REOPEN_REQUESTED",
          fromStatus: "COMPLETED",
          toStatus: "COMPLETED",
          text: parsed.data.reason,
        },
      });
      return created;
    });

    return NextResponse.json({ task: null, request }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

/** DELETE /api/tasks/:id/reopen?requestId= → requester cancels a pending request. */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const requestId = searchParams.get("requestId");
    if (!requestId) {
      return NextResponse.json({ error: "requestId is required" }, { status: 400 });
    }

    await requireTaskAccess(user, id);
    const request = await db.taskReopenRequest.findUnique({
      where: { id: requestId },
    });
    if (!request || request.taskId !== id) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    if (request.status !== "PENDING") {
      return NextResponse.json(
        { error: "This request is no longer pending" },
        { status: 409 },
      );
    }
    if (request.requestedById !== user.id && !user.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.$transaction(async (tx) => {
      await tx.taskReopenRequest.update({
        where: { id: request.id },
        data: { status: "CANCELLED", reviewedAt: new Date() },
      });
      await tx.taskActivity.create({
        data: {
          taskId: id,
          actorId: user.id,
          type: "REOPEN_CANCELLED",
          fromStatus: "COMPLETED",
          toStatus: "COMPLETED",
          text: "Reopen request cancelled",
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
