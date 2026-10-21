import { NextResponse } from "next/server";

import { getSessionUser, requireTaskAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { canTransition } from "@/lib/transitions";
import { statusSchema } from "@/lib/validations";

/** POST /api/tasks/:id/status → move status; COMPLETED locks further moves. */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: unknown = await req.json().catch(() => null);
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { to, text } = parsed.data;

    const access = await requireTaskAccess(user, params.id);
    if (access.task.status === "COMPLETED") {
      return NextResponse.json(
        { error: "Task is completed. Request or approve a reopen first." },
        { status: 422 },
      );
    }
    if (!canTransition(access.task.status, to)) {
      return NextResponse.json(
        { error: `Illegal transition ${access.task.status} -> ${to}` },
        { status: 422 },
      );
    }

    const updated = await db.$transaction(async (tx) => {
      const next = await tx.task.update({
        where: { id: params.id },
        data: {
          status: to,
          ...(to === "COMPLETED"
            ? { completedAt: new Date(), completedById: user.id }
            : { completedAt: null, completedById: null }),
        },
      });
      await tx.taskActivity.create({
        data: {
          taskId: params.id,
          actorId: user.id,
          type: "STATUS_CHANGED",
          fromStatus: access.task.status,
          toStatus: to,
          text: text ?? null,
        },
      });
      return next;
    });

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
