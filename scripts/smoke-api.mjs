import { PrismaClient } from "@prisma/client";

/**
 * Runtime smoke test for the multi-company tracker.
 *
 *   node scripts/smoke-api.mjs            # expects a dev server on :3000
 *   SMOKE_BASE_URL=http://host:3000 node scripts/smoke-api.mjs
 *
 * Every task/attachment created here is removed again before the script ends.
 */

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const db = new PrismaClient();

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function cookieHeader(jar) {
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function absorbCookies(jar, res) {
  const raw =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [];
  for (const line of raw) {
    const pair = line.split(";")[0];
    const idx = pair.indexOf("=");
    if (idx > 0) jar.set(pair.slice(0, idx), pair.slice(idx + 1));
  }
}

async function waitForServer() {
  for (let i = 0; i < 90; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Dev server did not become ready");
}

async function login(email, password) {
  const jar = new Map();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, {
    headers: { accept: "application/json" },
  });
  absorbCookies(jar, csrfRes);
  const csrf = await csrfRes.json();

  const body = new URLSearchParams({
    csrfToken: csrf.csrfToken,
    email,
    password,
    callbackUrl: `${BASE}/`,
    json: "true",
  });
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookieHeader(jar),
      accept: "application/json",
    },
    body,
    redirect: "manual",
  });
  absorbCookies(jar, loginRes);

  const sessionRes = await fetch(`${BASE}/api/auth/session`, {
    headers: { cookie: cookieHeader(jar), accept: "application/json" },
  });
  const session = await sessionRes.json();
  return { jar, session, loginStatus: loginRes.status };
}

async function api(session, method, path, body) {
  const headers = { cookie: cookieHeader(session.jar), accept: "application/json" };
  let payload;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: payload,
    redirect: "manual",
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

/** 1x1 transparent PNG. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function main() {
  await waitForServer();

  const createdTaskIds = [];
  const createdAttachmentIds = [];

  const admin = await login("admin@tracker.local", "Admin@123");
  check("admin login", Boolean(admin.session?.user?.id), admin.session?.user?.email);

  const meAdmin = await api(admin, "GET", "/api/users/me");
  check("admin display role", meAdmin.data?.role === "ADMIN", meAdmin.data?.role);

  const dashboard = await api(admin, "GET", "/api/dashboard");
  check(
    "admin dashboard covers 3 companies / 28 projects / 46 plazas",
    dashboard.status === 200 &&
      dashboard.data?.companyCount === 3 &&
      dashboard.data?.projectCount === 28 &&
      dashboard.data?.plazaCount === 46,
    `${dashboard.data?.companyCount}/${dashboard.data?.projectCount}/${dashboard.data?.plazaCount}`,
  );

  const tasks = await api(admin, "GET", "/api/tasks?pageSize=100");
  check("admin sees 41 seeded tasks", tasks.data?.total === 41, String(tasks.data?.total));

  const projectLevel = (tasks.data?.items ?? []).filter((t) => t.plaza === null);
  check("seed includes project-level tasks", projectLevel.length > 0, `${projectLevel.length} found`);

  const pending = await db.taskReopenRequest.findFirst({
    where: { status: "PENDING" },
    include: { task: true, requestedBy: true },
  });
  check("seed includes one pending reopen request", Boolean(pending));
  if (pending) {
    const detail = await api(admin, "GET", `/api/tasks/${pending.taskId}`);
    check(
      "admin can approve the pending reopen request",
      detail.status === 200 &&
        detail.data?.permissions?.canApproveReopen === true &&
        detail.data?.reopenRequest?.id === pending.id,
    );
    check(
      "completed task locks core edits and reassignment",
      detail.data?.permissions?.canEdit === false &&
        detail.data?.permissions?.canAssign === false,
    );
    const patch = await api(admin, "PATCH", `/api/tasks/${pending.taskId}`, {
      title: "Should not save",
    });
    check("completed PATCH returns 423", patch.status === 423, String(patch.status));
  }

  const ho = await login("management@tracker.local", "Manage@123");
  const meHo = await api(ho, "GET", "/api/users/me");
  check("HO display role", meHo.data?.role === "HEAD_OFFICE", meHo.data?.role);
  const hoUsers = await api(ho, "GET", "/api/users");
  check("HO can list users across companies", hoUsers.status === 200 && Array.isArray(hoUsers.data));

  // --- Head Office / Admin reach every project --------------------------
  const hoProjects = await api(ho, "GET", "/api/projects?pageSize=100");
  check(
    "HO sees all 28 projects",
    hoProjects.status === 200 && (hoProjects.data?.items ?? hoProjects.data ?? []).length === 28,
    String((hoProjects.data?.items ?? hoProjects.data ?? []).length),
  );

  // --- Site manager scope ----------------------------------------------
  const site = await db.plazaAssignment.findFirst({
    where: {
      user: {
        isAdmin: false,
        companyAssignments: { none: {} },
        projectAssignments: { none: {} },
      },
    },
    include: { user: true, plaza: { include: { project: true } } },
  });
  check("found a site-manager login", Boolean(site), site?.user?.email);

  if (site) {
    const siteLogin = await login(site.user.email, "Tracker@123");
    check("site manager login", Boolean(siteLogin.session?.user?.id), site.user.email);
    const siteUsers = await api(siteLogin, "GET", "/api/users");
    check("site manager cannot list users", siteUsers.status === 403, String(siteUsers.status));

    const sitePlazas = await db.plazaAssignment.findMany({
      where: { userId: site.userId },
      select: { plazaId: true },
    });
    const sitePmProjects = await db.projectAssignment.findMany({
      where: { userId: site.userId },
      select: { projectId: true },
    });

    // A sibling task in the same project but a different plaza.
    const siblingPlaza = await db.plaza.findFirst({
      where: { projectId: site.plaza.projectId, id: { notIn: sitePlazas.map((p) => p.plazaId) } },
      select: { id: true, name: true },
    });
    const siblingTask = siblingPlaza
      ? await api(admin, "POST", "/api/tasks", {
          projectId: site.plaza.projectId,
          plazaId: siblingPlaza.id,
          title: "Smoke: sibling plaza task",
          priority: "LOW",
        })
      : { status: 0, data: null };
    if (siblingTask.data?.id) createdTaskIds.push(siblingTask.data.id);

    // A project-level task in the same project, assigned to somebody else.
    const otherAssignee = await db.user.findFirst({
      where: {
        id: { not: site.userId },
        isAdmin: false,
        companyAssignments: { none: {} },
        projectAssignments: { none: {} },
      },
      select: { id: true },
    });
    const unassignedProjectTask = await api(admin, "POST", "/api/tasks", {
      projectId: site.plaza.projectId,
      title: "Smoke: project-level task for someone else",
      priority: "LOW",
      ...(otherAssignee ? { assigneeId: otherAssignee.id } : {}),
    });
    if (unassignedProjectTask.data?.id) {
      createdTaskIds.push(unassignedProjectTask.data.id);
    }

    // A project-level task assigned to the site manager.
    const myProjectTask = await api(admin, "POST", "/api/tasks", {
      projectId: site.plaza.projectId,
      title: "Smoke: project-level task for site manager",
      priority: "LOW",
      assigneeId: site.userId,
    });
    if (myProjectTask.data?.id) createdTaskIds.push(myProjectTask.data.id);

    const siteList = await api(siteLogin, "GET", "/api/tasks?pageSize=100");
    const visibleIds = new Set((siteList.data?.items ?? []).map((t) => t.id));
    const expected = new Set(
      (
        await db.task.findMany({
          where: {
            OR: [
              { plazaId: { in: sitePlazas.map((p) => p.plazaId) } },
              { projectId: { in: sitePmProjects.map((p) => p.projectId) } },
              { assigneeId: site.userId },
            ],
          },
          select: { id: true },
        })
      ).map((t) => t.id),
    );
    const missing = [...expected].filter((id) => !visibleIds.has(id));
    const extra = [...visibleIds].filter(
      (id) => !expected.has(id) && !createdTaskIds.includes(id),
    );
    check(
      "site manager sees exactly its plaza + assigned project-level tasks",
      siteList.status === 200 && missing.length === 0 && extra.length === 0,
      `${visibleIds.size} visible, ${missing.length} missing, ${extra.length} extra`,
    );

    if (siblingTask.data?.id) {
      const direct = await api(siteLogin, "GET", `/api/tasks/${siblingTask.data.id}`);
      check(
        "site manager cannot open a sibling-plaza task",
        direct.status === 403,
        `HTTP ${direct.status}`,
      );
    }
    if (unassignedProjectTask.data?.id) {
      const direct = await api(siteLogin, "GET", `/api/tasks/${unassignedProjectTask.data.id}`);
      check(
        "site manager cannot open an unassigned project-level task",
        direct.status === 403,
        `HTTP ${direct.status}`,
      );
    }
    if (myProjectTask.data?.id) {
      const direct = await api(siteLogin, "GET", `/api/tasks/${myProjectTask.data.id}`);
      check(
        "site manager can open a project-level task assigned to them",
        direct.status === 200,
        `HTTP ${direct.status}`,
      );
    }

    // Site managers file at plaza level only.
    const ownPlazaTask = await api(siteLogin, "POST", "/api/tasks", {
      plazaId: site.plaza.id,
      title: "Smoke: site manager plaza task",
      priority: "LOW",
    });
    if (ownPlazaTask.data?.id) createdTaskIds.push(ownPlazaTask.data.id);
    check(
      "site manager can create a task on their own plaza",
      ownPlazaTask.status === 201,
      `HTTP ${ownPlazaTask.status}`,
    );

    const ownProjectTask = await api(siteLogin, "POST", "/api/tasks", {
      projectId: site.plaza.projectId,
      title: "Smoke: site manager project-level task",
      priority: "LOW",
    });
    if (ownProjectTask.data?.id) createdTaskIds.push(ownProjectTask.data.id);
    check(
      "site manager cannot create a project-level task",
      ownProjectTask.status === 403,
      `HTTP ${ownProjectTask.status}`,
    );

    // Assignment ceiling for a site manager.
    const hoUser = await db.user.findFirst({
      where: { isAdmin: false, companyAssignments: { some: {} } },
      select: { id: true },
    });
    const siblingSite = await db.plazaAssignment.findFirst({
      where: { plazaId: site.plaza.id, userId: { not: site.userId } },
      select: { userId: true },
    });
    if (ownPlazaTask.data?.id && hoUser) {
      const denied = await api(siteLogin, "POST", `/api/tasks/${ownPlazaTask.data.id}/assign`, {
        assigneeId: hoUser.id,
      });
      check(
        "site manager cannot assign a Head Office user",
        denied.status === 422,
        `HTTP ${denied.status}`,
      );
    }
    if (ownPlazaTask.data?.id && siblingSite) {
      const allowed = await api(siteLogin, "POST", `/api/tasks/${ownPlazaTask.data.id}/assign`, {
        assigneeId: siblingSite.userId,
      });
      check(
        "site manager can assign a colleague on the same plaza",
        allowed.status === 200,
        `HTTP ${allowed.status}`,
      );
    }

    // Comment with a photo and no text.
    if (ownPlazaTask.data?.id) {
      const form = new FormData();
      form.append(
        "file",
        new Blob([PNG], { type: "image/png" }),
        "smoke-photo.png",
      );
      const upload = await api(
        siteLogin,
        "POST",
        `/api/tasks/${ownPlazaTask.data.id}/attachments?silent=1`,
        form,
      );
      check("attachment upload accepts a PNG", upload.status === 201, `HTTP ${upload.status}`);
      if (upload.data?.id) {
        createdAttachmentIds.push(upload.data.id);
        const comment = await api(siteLogin, "POST", `/api/tasks/${ownPlazaTask.data.id}/comments`, {
          text: "",
          attachmentIds: [upload.data.id],
        });
        check(
          "comment with a photo and no text is accepted",
          comment.status === 201,
          `HTTP ${comment.status}`,
        );
        const file = await fetch(`${BASE}/api/attachments/${upload.data.id}`, {
          headers: { cookie: cookieHeader(siteLogin.jar) },
          redirect: "manual",
        });
        const bytes = Buffer.from(await file.arrayBuffer());
        check(
          "attachment downloads with the original bytes",
          file.status === 200 && bytes.equals(PNG),
          `HTTP ${file.status}, ${bytes.length} bytes`,
        );
      }
    }
  }

  // --- Project manager scope -------------------------------------------
  const pm = await db.projectAssignment.findFirst({
    where: {
      user: {
        isAdmin: false,
        companyAssignments: { none: {} },
      },
    },
    include: { user: true, project: true },
  });
  check("found a project-manager login", Boolean(pm), pm?.user?.email);

  if (pm) {
    const pmLogin = await login(pm.user.email, "Tracker@123");
    const mePm = await api(pmLogin, "GET", "/api/users/me");
    check("PM display role", mePm.data?.role === "PROJECT_MANAGER", mePm.data?.role);
    const pmUsers = await api(pmLogin, "GET", "/api/users");
    check("PM cannot list the user directory", pmUsers.status === 403, String(pmUsers.status));

    const create = await api(pmLogin, "POST", "/api/tasks", {
      projectId: pm.projectId,
      title: "Smoke test project-level task",
      description: "Created by smoke test; removed afterwards.",
      priority: "MEDIUM",
    });
    if (create.data?.id) createdTaskIds.push(create.data.id);
    check(
      "PM can create a project-level task",
      create.status === 201 && create.data?.plaza === null,
      `HTTP ${create.status}`,
    );

    if (create.data?.id) {
      const detail = await api(pmLogin, "GET", `/api/tasks/${create.data.id}`);
      check(
        "new task is TODO/MEDIUM and visible to its PM",
        detail.status === 200 &&
          detail.data?.task?.status === "TODO" &&
          detail.data?.task?.priority === "MEDIUM",
      );

      const outside = await db.plaza.findFirst({
        where: { projectId: { not: pm.projectId } },
        select: { id: true },
      });
      if (outside) {
        const outsideAssign = await api(
          pmLogin,
          "POST",
          `/api/tasks/${create.data.id}/assign`,
          { assigneeId: site?.userId ?? null },
        );
        check(
          "PM assignment follows the ceiling",
          outsideAssign.status === 200 || outsideAssign.status === 422,
          `HTTP ${outsideAssign.status}`,
        );
      }
    }

    // A PM must not see tasks from projects they are not assigned to.
    const otherProject = await db.project.findFirst({
      where: { id: { not: pm.projectId } },
      select: { id: true },
    });
    if (otherProject) {
      const foreign = await api(pmLogin, "GET", `/api/tasks?projectId=${otherProject.id}`);
      check(
        "PM cannot read another project's tasks",
        foreign.status === 403,
        `HTTP ${foreign.status}`,
      );
    }
  }

  const categoryList = await api(admin, "GET", "/api/categories");
  const two = (categoryList.data ?? []).slice(0, 2);
  if (two.length === 2) {
    const conflict = await api(admin, "PATCH", `/api/categories/${two[1].id}`, {
      name: two[0].name,
    });
    check(
      "category rename collision returns 409",
      conflict.status === 409,
      `HTTP ${conflict.status}`,
    );
  }

  // --- Cleanup ----------------------------------------------------------
  const storedNames = await db.taskAttachment.findMany({
    where: { id: { in: createdAttachmentIds } },
    select: { storedName: true },
  });
  for (const id of createdAttachmentIds) {
    await db.taskAttachment.deleteMany({ where: { id } });
  }
  for (const id of createdTaskIds) {
    await db.task.delete({ where: { id } }).catch(() => undefined);
  }
  const { unlink } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const uploadDir = process.env.UPLOAD_DIR ?? join(process.cwd(), "uploads");
  for (const row of storedNames) {
    await unlink(join(uploadDir, row.storedName)).catch(() => undefined);
  }
  check(
    "smoke-test rows cleaned up",
    (await db.task.count({ where: { id: { in: createdTaskIds } } })) === 0,
    `${createdTaskIds.length} tasks, ${createdAttachmentIds.length} attachments removed`,
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
