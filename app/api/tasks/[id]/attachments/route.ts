import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { getSessionUser, requireTaskAccess } from "@/lib/access";
import { db } from "@/lib/db";
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MIME_TYPES,
} from "@/lib/validations";

export const runtime = "nodejs";

const EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

function uploadDir(): string {
  return process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
}

/** GET /api/tasks/:id/attachments → files linked to this task. */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await requireTaskAccess(user, params.id);

    const attachments = await db.taskAttachment.findMany({
      where: { taskId: params.id },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(attachments);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

/** POST /api/tasks/:id/attachments → multipart upload (10 MB max). */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await requireTaskAccess(user, params.id);

    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
      return NextResponse.json(
        { error: "File is larger than 10 MB" },
        { status: 413 },
      );
    }
    if (
      !(ATTACHMENT_MIME_TYPES as readonly string[]).includes(file.type)
    ) {
      return NextResponse.json(
        { error: "Only JPG, PNG, WebP or PDF files are allowed" },
        { status: 415 },
      );
    }

    const activityId = (form.get("activityId") as string | null) || null;
    if (activityId) {
      const activity = await db.taskActivity.findFirst({
        where: { id: activityId, taskId: params.id },
        select: { id: true },
      });
      if (!activity) {
        return NextResponse.json(
          { error: "Activity not found for this task" },
          { status: 422 },
        );
      }
    }

    const url = new URL(req.url);
    const silent = url.searchParams.get("silent") === "1";

    const dir = uploadDir();
    await mkdir(dir, { recursive: true });
    const storedName = `${randomUUID()}${EXT[file.type]}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, storedName), bytes);

    const attachment = await db.$transaction(async (tx) => {
      let feedActivityId = activityId;
      if (!feedActivityId && !silent) {
        const activity = await tx.taskActivity.create({
          data: {
            taskId: params.id,
            actorId: user.id,
            type: "ATTACHMENT",
            text: file.name,
          },
        });
        feedActivityId = activity.id;
      }

      return tx.taskAttachment.create({
        data: {
          taskId: params.id,
          activityId: feedActivityId,
          uploadedById: user.id,
          fileName: file.name,
          storedName,
          mimeType: file.type,
          sizeBytes: file.size,
        },
      });
    });

    return NextResponse.json(attachment, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
