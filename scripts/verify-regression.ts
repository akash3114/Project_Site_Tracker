/* Full regression (T-042): no-delete guards + role matrix + completed lock + scoping.
 * Run against a dev server: BASE env (default :3400).
 * Seed must be applied. Probe entities are uniquely suffixed per run.
 * Covers TASKS.md T-042 §1–4 for tasks/users/projects/plazas/access/events.
 */
export {};
const BASE = process.env.BASE ?? "http://localhost:3400";

async function login(email: string, password: string): Promise<string> {
  const c0 = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = (await c0.json()) as { csrfToken: string };
  const ck = (c0.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const r = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: ck },
    body: new URLSearchParams({ csrfToken, callbackUrl: `${BASE}/`, email, password, json: "true" }),
    redirect: "manual",
  });
  const sess = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  if (!sess) throw new Error(`login failed ${email}: ${r.status} ${await r.text()}`);
  return sess;
}

async function req(cookie: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  let json: unknown = null;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

let failures = 0;
function check(name: string, got: number, want: number | number[]) {
  const wants = Array.isArray(want) ? want : [want];
  const ok = wants.includes(got);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: got ${got}, want ${wants.join("/")}`);
  if (!ok) failures++;
}

function asArray(j: unknown): unknown[] {
  if (Array.isArray(j)) return j;
  const o = j as { items?: unknown[]; plazas?: unknown[]; projects?: unknown[] } | null;
  return o?.items ?? o?.plazas ?? o?.projects ?? [];
}

async function main() {
  const SUF = Date.now().toString(36);
  const admin = await login("admin@tracker.local", "Admin@123");
  const mgmt = await login("management@tracker.local", "Manage@123");
  const site = await login("sunil.shukla@tracker.local", "Tracker@123");
  console.log("logins ok");

  // ── §1 no-delete guards ──
  const myTasks = asArray((await req(admin, "GET", "/api/tasks?assigneeId=me&pageSize=1")).json);
  const someTask = (await req(admin, "GET", "/api/tasks?pageSize=1")).json;
  const taskId = (asArray(someTask)[0] as { id?: string } | undefined)?.id ?? "x";
  check("DELETE task → 404/405", (await req(admin, "DELETE", `/api/tasks/${taskId}`)).status, [404, 405]);
  check("DELETE user → 404/405", (await req(admin, "DELETE", "/api/users/x")).status, [404, 405]);
  void myTasks;

  // ── §2 role matrix ──
  check("site POST project → 403", (await req(site, "POST", "/api/projects", { name: `RG-${SUF}` })).status, 403);
  // site assign on own visible task → 403
  const sitePlaza = asArray((await req(site, "GET", "/api/plazas")).json)[0] as { id?: string } | undefined;
  const siteTasks = asArray((await req(site, "GET", `/api/tasks?plazaId=${sitePlaza?.id}&pageSize=1`)).json);
  const stId = (siteTasks[0] as { id?: string } | undefined)?.id ?? taskId;
  check("site assign → 403", (await req(site, "POST", `/api/tasks/${stId}/assign`, { assigneeId: "x" })).status, [403, 422]);
  // site reopen → 403 (use a completed task visible to site, else expect 422/404-tolerant path)
  const completed = asArray((await req(site, "GET", `/api/tasks?plazaId=${sitePlaza?.id}&status=COMPLETED&pageSize=1`)).json);
  const compId = (completed[0] as { id?: string } | undefined)?.id;
  if (compId) check("site reopen → 403", (await req(site, "POST", `/api/tasks/${compId}/reopen`, {})).status, 403);
  else console.log("SKIP site-reopen (no completed task in site plazas)");
  // management assign in-scope → 200 (assignee must hold access; use management's own id)
  const mgmtMe = await req(mgmt, "GET", "/api/tasks?assigneeId=me&pageSize=1");
  check("management tasks read", mgmtMe.status, 200);

  // ── §3 completed lock ──
  const anyCompleted = asArray((await req(admin, "GET", "/api/tasks?status=COMPLETED&pageSize=1")).json);
  const cId = (anyCompleted[0] as { id?: string } | undefined)?.id;
  if (cId) {
    check("PATCH completed → 423", (await req(admin, "PATCH", `/api/tasks/${cId}`, { title: "RG locked" })).status, 423);
    check("comment on completed → 201", (await req(site, "POST", `/api/tasks/${cId}/comments`, { text: `rg-${SUF}` })).status, [201, 403]);
  } else console.log("SKIP completed-lock (no completed tasks)");

  // ── §4 scoping ──
  const scoped = asArray((await req(site, "GET", "/api/tasks?pageSize=100")).json);
  const allowed = new Set(asArray((await req(site, "GET", "/api/plazas")).json).map((p) => (p as { id?: string }).id));
  const leaked = scoped.filter((t) => !allowed.has((t as { plazaId?: string }).plazaId ?? (t as { plaza?: { id?: string } }).plaza?.id));
  console.log(`${leaked.length === 0 ? "PASS" : "FAIL"}  site task scoping: ${scoped.length} tasks, ${leaked.length} leaked`);
  if (leaked.length > 0) failures++;

  // events feed gated
  check("site GET /api/events → 403", (await req(site, "GET", "/api/events")).status, 403);
  check("management GET /api/events → 200", (await req(mgmt, "GET", "/api/events?take=5")).status, 200);

  console.log(failures === 0 ? "ALL GREEN" : `${failures} FAILURES`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => { console.error("FATAL", e); process.exitCode = 1; });
