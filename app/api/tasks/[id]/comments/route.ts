import { NextResponse } from "next/server";

import { getSessionUser, requireTaskAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { commentSchema } from "@/lib/validations";

/** POST /api/tasks/:id/comments → append a comment (allowed when completed). */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: unknown = await req.json().catch(() => null);
    const parsed = commentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    await requireTaskAccess(user, params.id);

    const attachmentIds = parsed.data.attachmentIds ?? [];
    if (attachmentIds.length > 0) {
      const attachments = await db.taskAttachment.findMany({
        where: { id: { in: attachmentIds }, taskId: params.id },
        select: { id: true, activityId: true },
      });
      if (
        attachments.length !== attachmentIds.length ||
        attachments.some((a) => a.activityId !== null)
      ) {
        return NextResponse.json(
          { error: "One or more attachments are invalid for this task" },
          { status: 422 },
        );
      }
    }

    const event = await db.$transaction(async (tx) => {
      const comment = await tx.taskActivity.create({
        data: {
          taskId: params.id,
          actorId: user.id,
          type: "COMMENT",
          text: parsed.data.text,
        },
      });
      if (attachmentIds.length > 0) {
        await tx.taskAttachment.updateMany({
          where: { id: { in: attachmentIds }, taskId: params.id },
          data: { activityId: comment.id },
        });
      }
      return tx.taskActivity.findUnique({
        where: { id: comment.id },
        include: {
          actor: { select: { id: true, name: true } },
          attachments: {
            select: {
              id: true,
              fileName: true,
              mimeType: true,
              sizeBytes: true,
            },
          },
        },
      });
    });

    return NextResponse.json(event, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
