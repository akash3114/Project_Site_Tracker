import { readFile, unlink } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { getSessionUser, requireTaskAccess } from "@/lib/access";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function uploadDir(): string {
  return process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
}

/** GET /api/attachments/:id → stream the stored file after a task access check. */
export async function GET(_req: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const attachment = await db.taskAttachment.findUnique({
      where: { id },
    });
    if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await requireTaskAccess(user, attachment.taskId);

    const bytes = await readFile(path.join(uploadDir(), attachment.storedName));
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Length": String(attachment.sizeBytes),
        "Content-Disposition": `inline; filename="${attachment.fileName.replace(/["\\\r\n]/g, "_")}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}

/** DELETE /api/attachments/:id → uploader or Admin. */
export async function DELETE(_req: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const attachment = await db.taskAttachment.findUnique({
      where: { id },
    });
    if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await requireTaskAccess(user, attachment.taskId);
    if (attachment.uploadedById !== user.id && !user.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.taskAttachment.delete({ where: { id: attachment.id } });
    await unlink(path.join(uploadDir(), attachment.storedName)).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
