/* Masters API verify matrix (T-012/T-013/T-014). Run against dev server :3300. */
export {};
const BASE = process.env.BASE ?? "http://localhost:3000";

async function login(email: string, password: string): Promise<string> {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const rawCookies = csrfRes.headers.getSetCookie?.() ?? [];
  const csrfCookie = rawCookies.map((c) => c.split(";")[0]).join("; ");
  const body = new URLSearchParams({ csrfToken, callbackUrl: `${BASE}/`, email, password, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: csrfCookie },
    body,
    redirect: "manual",
  });
  const session = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  if (!session) throw new Error(`login failed for ${email}: ${res.status} ${await res.text()}`);
  return session;
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

function asArray(j: unknown): unknown[] {
  if (Array.isArray(j)) return j;
  const o = j as { plazas?: unknown[]; items?: unknown[]; projects?: unknown[] } | null;
  return o?.plazas ?? o?.items ?? o?.projects ?? [];
}
function check(
  name: string,
  got: number,
  want: number | number[],
  extra?: unknown,
) {
  const wants = Array.isArray(want) ? want : [want];
  const ok = wants.includes(got);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: got ${got}, want ${wants.join("/")} ${extra !== undefined ? JSON.stringify(extra)?.slice(0, 200) : ""}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  const SUF = Date.now().toString(36);
  const PROBE_PROJECT = `X-Test-Probe-${SUF}`;
  const PROBE_EMAIL = `qa-probe-${SUF}@tracker.local`;
  const admin = await login("admin@tracker.local", "Admin@123");
  const mgmt = await login("management@tracker.local", "Manage@123");
  const site = await login("sunil.shukla@tracker.local", "Tracker@123");
  console.log("logins ok");

  // Projects
  const pAdmin = await req(admin, "GET", "/api/projects");
  check("admin GET /api/projects", pAdmin.status, 200, `count=${(pAdmin.json as { projects?: unknown[]; items?: unknown[] })?.projects?.length ?? (pAdmin.json as { items?: unknown[] })?.items?.length ?? JSON.stringify(pAdmin.json)?.slice(0, 80)}`);
  const pSite = await req(site, "GET", "/api/projects");
  check("site GET /api/projects", pSite.status, 200);
  check("site POST /api/projects → 403", (await req(site, "POST", "/api/projects", { name: "X-Test-Nope", round: "ROUND_1" })).status, 403);
  const pCreate = await req(admin, "POST", "/api/projects", { name: PROBE_PROJECT, round: "ROUND_1" });
  check("admin POST /api/projects", pCreate.status, [200, 201], (pCreate.json as { id?: string })?.id);
  const dupProj = await req(admin, "POST", "/api/projects", { name: PROBE_PROJECT, round: "ROUND_1" });
  check("dup project → 409", dupProj.status, [409, 400]);
  const probeId = (pCreate.json as { id?: string })?.id;
  if (probeId) {
    check("management PATCH project → 200", (await req(mgmt, "PATCH", `/api/projects/${probeId}`, { status: "ON_HOLD" })).status, 200);
    check("site PATCH project → 403", (await req(site, "PATCH", `/api/projects/${probeId}`, { status: "ACTIVE" })).status, 403);
  }

  // Plazas
  const plzSite = await req(site, "GET", "/api/plazas");
  const siteCount = asArray(plzSite.json);
  check("site GET /api/plazas == 1 mapped", siteCount.length === 1 ? 200 : 999, 200, `count=${siteCount.length}`);
  if (siteCount.length !== 1) process.exitCode = 1;
  const plzAdmin = await req(admin, "GET", "/api/plazas");
  check("admin GET /api/plazas", plzAdmin.status, 200);
  const firstPlaza = siteCount[0] as { projectId?: string; project?: { id?: string }; id?: string; name?: string } | undefined;
  const projId = firstPlaza?.projectId ?? firstPlaza?.project?.id;
  if (projId && firstPlaza?.name) {
    const dup = await req(admin, "POST", "/api/plazas", { projectId: projId, name: firstPlaza.name });
    check("dup plaza (projectId,name) → 409", dup.status, [409, 400]);
  } else console.log("SKIP dup-plaza check (shape unknown)");
  check("site POST /api/plazas → 403", (await req(site, "POST", "/api/plazas", { projectId: projId ?? "x", name: "X-Nope" })).status, [403, 400, 422]);

  // Users + access
  check("site GET /api/users → 403", (await req(site, "GET", "/api/users")).status, 403);
  check("management GET /api/users", (await req(mgmt, "GET", "/api/users")).status, 200);
  const uCreate = await req(admin, "POST", "/api/users", { name: "QA Probe", email: PROBE_EMAIL, password: "QaProbe@123", role: "MANAGER" });
  check("admin POST /api/users", uCreate.status, [200, 201], (uCreate.json as { id?: string })?.id);
  const qaId = (uCreate.json as { id?: string; user?: { id?: string } })?.id ?? (uCreate.json as { user?: { id?: string } })?.user?.id;
  check("DELETE /api/users/:id → 404/405", (await req(admin, "DELETE", `/api/users/${qaId ?? "x"}`)).status, [404, 405]);
  if (qaId) {
    const somePlaza = siteCount[0] as { id?: string };
    if (somePlaza?.id) {
      check("admin PUT /api/access", (await req(admin, "PUT", "/api/access", { userId: qaId, assignments: [{ plazaId: somePlaza.id, role: "TOLL" }] })).status, [200, 201]);
      check("site PUT /api/access → 403", (await req(site, "PUT", "/api/access", { userId: qaId, assignments: [] })).status, 403);
      check("management PUT /api/access", (await req(mgmt, "PUT", "/api/access", { userId: qaId, assignments: [] })).status, [200, 201]);
    }
    check("admin deactivate user", (await req(admin, "PATCH", `/api/users/${qaId}`, { active: false })).status, 200);
    try { await login(PROBE_EMAIL, "QaProbe@123"); console.log("FAIL  deactivated login blocked: got session"); process.exitCode = 1; }
    catch { console.log("PASS  deactivated login blocked"); }
  }

  // Cleanup probe project (delete forbidden — mark COMPLETED)
  if (probeId) await req(admin, "PATCH", `/api/projects/${probeId}`, { status: "COMPLETED" });
  console.log("done");
}

main().catch((e) => { console.error("FATAL", e); process.exitCode = 1; });
