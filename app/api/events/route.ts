import { auth } from "@/lib/auth";
import { accessiblePlazaIds } from "@/lib/access";
import { db } from "@/lib/db";

/** GET /api/events?take=100 — read-only audit feed. Admin: all; Management: accessible plazas. */
export async function GET(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN" && role !== "MANAGEMENT") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const take = Math.min(Math.max(Number(url.searchParams.get("take") ?? 100), 1), 500);

  const userId = (session.user as { id: string }).id;
  const where =
    role === "ADMIN"
      ? {}
      : {
          task: { plazaId: { in: await accessiblePlazaIds(userId, role as "MANAGEMENT") } },
        };

  const events = await db.taskEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    include: {
      actor: { select: { id: true, name: true } },
      task: { select: { id: true, title: true, plazaId: true } },
    },
  });
  return Response.json({ items: events });
}
