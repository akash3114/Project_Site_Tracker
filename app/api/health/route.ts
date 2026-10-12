export async function GET(): Promise<Response> {
  return Response.json({ ok: true, time: new Date().toISOString() }, { status: 200 });
}
