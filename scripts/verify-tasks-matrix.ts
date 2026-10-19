/* Task API verify matrix (T-021/T-022/T-023). Run against dev server :3000. */
export {};
const BASE = process.env.BASE ?? "http://localhost:3000";

async function login(email: string, password: string): Promise<string> {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const rawCookies = csrfRes.headers.getSetCookie?.() ?? [];
  const csrfCookie = rawCookies.map((c) => c.split(";")[0]).join("; ");
  const body = new URLSearchParams({
    csrfToken,
    callbackUrl: `${BASE}/`,
    email,
    password,
    json: "true",
  });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: csrfCookie,
    },
    body,
    redirect: "manual",
  });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const session = setCookies.map((c) => c.split(";")[0]).join("; ");
  if (!session) {
    const txt = await res.text();
    throw new Error(`login failed for ${email}: ${res.status} ${txt}`);
  }
  return session;
}

async function req(
  cookie: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
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
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function check(
  name: string,
  got: number,
  want: number | number[],
  extra?: unknown,
) {
  const wants = Array.isArray(want) ? want : [want];
  const ok = wants.includes(got);
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}: got ${got}, want ${wants.join("/")} ${extra !== undefined ? JSON.stringify(extra)?.slice(0, 160) : ""}`,
  );
  if (!ok) process.exitCode = 1;
}

async function main() {
  const admin = await login("admin@tracker.local", "Admin@123");
  const mgmt = await login("management@tracker.local", "Manage@123");
  const site = await login("sunil.shukla@tracker.local", "Tracker@123");
  console.log("logins ok");

  // 0. unauthenticated -> 401
  check("unauth GET /api/tasks", (await req(null, "GET", "/api/tasks")).status, 401);

  // site's view: own plazas
  const siteList = await req(site, "GET", "/api/tasks?pageSize=5");
  check("site GET /api/tasks", siteList.status, 200);
  const siteItems = (siteList.json as { items: { plazaId: string }[] }).items;
  const sitePlazaIds = Array.from(new Set(siteItems.map((t) => t.plazaId)));
  console.log(`  site sees plazas: ${sitePlazaIds.join(",")}`);

  // admin plaza list via tasks (find a plaza site05 cannot access)
  const adminList = await req(admin, "GET", "/api/tasks?pageSize=100");
  const adminItems = (adminList.json as { items: { plazaId: string }[] }).items;
  const unmapped = adminItems.map((t) => t.plazaId).find((id) => !sitePlazaIds.includes(id))!;
  const ownPlaza = sitePlazaIds[0];
  console.log(`  unmapped=${unmapped} own=${ownPlaza}`);

  // 1. site POST to unmapped plaza -> 403
  check(
    "site POST unmapped plaza",
    (await req(site, "POST", "/api/tasks", { plazaId: unmapped, title: "Probe task xyz" })).status,
    403,
  );

  // site user id (for bad-assignee test): use site's own id on unmapped plaza via admin
  const meRes = await req(site, "GET", `/api/tasks?plazaId=${ownPlaza}&pageSize=1`);
  void meRes;

  // 2. bad assignee -> 422 (admin creates in unmapped plaza, assignee = site05 who lacks access there)
  // get site05 id from detail of own task assignee? Use known: fetch users? No users API (other agent). Use task createdBy id? Instead: create task with assigneeId = a cuid that doesn't exist -> 422.
  const badAssignee = await req(admin, "POST", "/api/tasks", {
    plazaId: unmapped,
    title: "Bad assignee probe task",
    assigneeId: "cmv0000000000000000000000",
  });
  check("admin POST bad assignee", badAssignee.status, 422);

  // 3. illegal transition -> 422: COMPLETED -> TODO via /status
  const completedItem = adminItems.find(
    (t) => (t as unknown as { status: string }).status === "COMPLETED",
  ) as unknown as { id: string };
  console.log(`  completedTask=${completedItem.id}`);
  check(
    "status COMPLETED->TODO",
    (await req(admin, "POST", `/api/tasks/${completedItem.id}/status`, { to: "TODO" })).status,
    422,
  );

  // 4. PATCH completed -> 423
  check(
    "PATCH completed",
    (await req(admin, "PATCH", `/api/tasks/${completedItem.id}`, { title: "Edited title xyz" })).status,
    423,
  );

  // need a task inside site's plaza for site assign/comment tests
  const ownList = (await req(site, "GET", `/api/tasks?plazaId=${ownPlaza}&pageSize=5`)).json as {
    items: { id: string }[];
  };
  const ownTaskId = ownList.items[0]?.id;
  if (!ownTaskId) throw new Error("no task in site plaza");
  console.log(`  ownTask=${ownTaskId}`);

  // 5. site assign -> 403
  check(
    "site POST assign",
    (await req(site, "POST", `/api/tasks/${ownTaskId}/assign`, { assigneeId: "cmv0000000000000000000000" })).status,
    403,
  );

  // 6. site reopen -> 403. Ensure a COMPLETED task in site's plaza: create + complete as admin.
  const created = await req(admin, "POST", "/api/tasks", {
    plazaId: ownPlaza,
    title: "Reopen probe task",
  });
  check("admin POST in site plaza", created.status, 201);
  const probeId = (created.json as { id: string }).id;
  const completeRes = await req(admin, "POST", `/api/tasks/${probeId}/status`, { to: "COMPLETED" });
  check("admin complete probe", completeRes.status, 200);
  check(
    "site POST reopen",
    (await req(site, "POST", `/api/tasks/${probeId}/reopen`, { text: "please" })).status,
    403,
  );

  // 7. management reopen -> 200 (management sees all plazas)
  const mgmtList = (await req(mgmt, "GET", "/api/tasks?pageSize=100")).json as {
    items: { id: string; plazaId: string; status: string }[];
  };
  let target = mgmtList.items.find((t) => t.status === "COMPLETED");
  if (!target) {
    const mgmtPlaza = mgmtList.items[0]?.plazaId;
    if (!mgmtPlaza) throw new Error("management sees no tasks");
    const c = (await req(mgmt, "POST", "/api/tasks", { plazaId: mgmtPlaza, title: "Management reopen probe" }))
      .json as unknown as { id: string };
    const lid = (c as { id: string }).id;
    await req(mgmt, "POST", `/api/tasks/${lid}/status`, { to: "COMPLETED" });
    target = { id: lid, plazaId: mgmtPlaza, status: "COMPLETED" };
  }
  const reopen = await req(mgmt, "POST", `/api/tasks/${target.id}/reopen`, { text: "reopening for pilot" });
  check("management POST reopen", reopen.status, 200);
  console.log(`  reopened status=${(reopen.json as { status: string }).status}`);

  // 8. comment -> 201 + feed grows
  const before = (await req(site, "GET", `/api/tasks/${ownTaskId}`)).json as {
    events: unknown[];
  };
  const comment = await req(site, "POST", `/api/tasks/${ownTaskId}/comments`, { text: "field note: rebar checked" });
  check("site POST comment", comment.status, 201);
  const after = (await req(site, "GET", `/api/tasks/${ownTaskId}`)).json as {
    events: { type: string }[];
  };
  const grew = after.events.length === before.events.length + 1;
  console.log(`${grew ? "PASS" : "FAIL"}  feed grows: ${before.events.length} -> ${after.events.length}`);
  if (!grew) process.exitCode = 1;
  const lastType = after.events[after.events.length - 1]?.type;
  console.log(`${lastType === "COMMENT" ? "PASS" : "FAIL"}  last event is COMMENT: ${lastType}`);
  if (lastType !== "COMMENT") process.exitCode = 1;

  // 9. DELETE -> 404/405
  check(
    "DELETE task",
    (await req(admin, "DELETE", `/api/tasks/${ownTaskId}`)).status,
    [404, 405],
  );

  // 10. new task has CREATED event
  const nt = await req(admin, "POST", "/api/tasks", { plazaId: unmapped, title: "CREATED-event probe task" });
  check("admin POST new task", nt.status, 201);
  const detail = (await req(admin, "GET", `/api/tasks/${(nt.json as { id: string }).id}`)).json as {
    events: { type: string }[];
  };
  const hasCreated = detail.events.some((e) => e.type === "CREATED");
  console.log(`${hasCreated ? "PASS" : "FAIL"}  new task has CREATED event (${detail.events.map((e) => e.type).join(",")})`);
  if (!hasCreated) process.exitCode = 1;

  // extras: overdue + q + pagination shape
  const od = await req(admin, "GET", "/api/tasks?overdue=true&pageSize=100");
  check("GET overdue", od.status, 200, { total: (od.json as { total: number }).total });
  const q = await req(admin, "GET", "/api/tasks?q=canopy&pageSize=5");
  check("GET q=canopy", q.status, 200, { total: (q.json as { total: number }).total });
  const me = await req(site, "GET", "/api/tasks?assigneeId=me&pageSize=5");
  check("GET assigneeId=me", me.status, 200);
}

main().catch((e) => {
  console.error("MATRIX ERROR", e);
  process.exit(1);
});
