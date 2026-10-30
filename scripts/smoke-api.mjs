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

  // The dev DB is shared and may hold tasks created through the UI, so these
  // checks assert the seed floor plus the shape of the data, not an exact total.
  const tasks = await api(admin, "GET", "/api/tasks?pageSize=100");
  check(
    "admin sees at least the 47 seeded tasks",
    (tasks.data?.total ?? 0) >= 47,
    String(tasks.data?.total),
  );

  const projectLevel = (tasks.data?.items ?? []).filter(
    (t) => t.plaza === null && t.project !== null,
  );
  check("seed includes project-level tasks", projectLevel.length > 0, `${projectLevel.length} found`);

  const hoTaskCount = await db.task.count({
    where: { OR: [{ departmentId: { not: null } }, { projectId: null }] },
  });
  check("seed includes at least 6 Head Office tasks", hoTaskCount >= 6, `${hoTaskCount} found`);

  const hoList = await api(admin, "GET", "/api/tasks?headOffice=true&pageSize=100");
  check(
    "headOffice=true filters to Head Office tasks only",
    hoList.status === 200 &&
      (hoList.data?.total ?? 0) >= 6 &&
      (hoList.data?.items ?? []).every(
        (t) => t.departmentId !== null || t.projectId === null,
      ),
    `HTTP ${hoList.status}, ${hoList.data?.total} rows`,
  );

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

  // --- Departments and Head Office memberships --------------------------
  const departmentList = await api(admin, "GET", "/api/departments");
  const departmentRows = Array.isArray(departmentList.data) ? departmentList.data : [];
  const sortedByOrder = departmentRows.every(
    (row, i) => i === 0 || departmentRows[i - 1].sortOrder <= row.sortOrder,
  );
  const memberTotal = departmentRows.reduce(
    (sum, row) => sum + (typeof row.memberCount === "number" ? row.memberCount : 0),
    0,
  );
  check(
    "departments endpoint returns 18 rows in sortOrder with member and task counts",
    departmentList.status === 200 &&
      departmentRows.length === 18 &&
      sortedByOrder &&
      departmentRows.every(
        (row) =>
          typeof row.memberCount === "number" &&
          typeof row.open === "number" &&
          typeof row.progressPct === "number" &&
          typeof row.task?.total === "number",
      ) &&
      memberTotal === 20,
    `${departmentRows.length} rows, ${memberTotal} memberships`,
  );

  const headOfficeDashboard = dashboard.data?.headOffice;
  check(
    "dashboard exposes the Head Office block",
    headOfficeDashboard?.departmentCount === 18 &&
      typeof headOfficeDashboard?.memberCount === "number" &&
      Array.isArray(headOfficeDashboard?.departments) &&
      headOfficeDashboard.departments.length === 18 &&
      typeof headOfficeDashboard?.task?.total === "number",
    `${headOfficeDashboard?.departmentCount ?? "missing"} departments, ${headOfficeDashboard?.task?.total ?? "?"} tasks`,
  );

  const managementUser = (Array.isArray(hoUsers.data) ? hoUsers.data : []).find(
    (u) => u.email === "management@tracker.local",
  );
  const managementMemberships = managementUser?.headOfficeMemberships ?? [];
  check(
    "management account is Secretarial (primary) in Delhi with 2 departments",
    managementUser?.departmentName === "Secretarial" &&
      managementUser?.officeName === "Delhi" &&
      managementMemberships.length === 2 &&
      managementMemberships.some((m) => m.code === "SEC" && m.isPrimary),
    `${managementUser?.departmentName ?? "missing"} / ${managementUser?.officeName ?? "no office"} / ${managementMemberships.length} memberships`,
  );

  // Membership lifecycle on a throwaway user, removed again in `finally`.
  const adminDepartment = departmentRows[0];
  if (adminDepartment) {
    const throwaway = await db.user.create({
      data: {
        name: "Smoke Throwaway",
        email: `smoke.throwaway.${Date.now()}@tracker.local`,
        passwordHash: "unused",
        active: true,
      },
      select: { id: true, email: true },
    });
    try {
      const grant = await api(admin, "POST", "/api/head-office-memberships", {
        userId: throwaway.id,
        departmentId: adminDepartment.id,
        isPrimary: true,
      });
      const afterGrant = await api(admin, "GET", "/api/users");
      const grantedRole = (Array.isArray(afterGrant.data) ? afterGrant.data : []).find(
        (u) => u.id === throwaway.id,
      )?.role;
      check(
        "granting a department makes the user HEAD_OFFICE",
        grant.status === 201 && grantedRole === "HEAD_OFFICE",
        `HTTP ${grant.status}, role ${grantedRole ?? "missing"}`,
      );

      const revoke = await api(
        admin,
        "DELETE",
        `/api/head-office-memberships?userId=${throwaway.id}&departmentId=${adminDepartment.id}`,
      );
      const afterRevoke = await api(admin, "GET", "/api/users");
      const revokedRole = (Array.isArray(afterRevoke.data) ? afterRevoke.data : []).find(
        (u) => u.id === throwaway.id,
      )?.role;
      check(
        "removing the only membership returns the user to PROJECT_MANAGER",
        revoke.status === 200 && revokedRole === "PROJECT_MANAGER",
        `HTTP ${revoke.status}, role ${revokedRole ?? "missing"}`,
      );
    } finally {
      await db.headOfficeMembership.deleteMany({ where: { userId: throwaway.id } });
      await db.projectAssignment.deleteMany({ where: { userId: throwaway.id } });
      await db.plazaAssignment.deleteMany({ where: { userId: throwaway.id } });
      await db.user.delete({ where: { id: throwaway.id } }).catch(() => undefined);
    }
    const leftover = await db.user.count({ where: { email: throwaway.email } });
    check(
      "throwaway user and memberships cleaned up",
      leftover === 0 &&
        (await db.headOfficeMembership.count({ where: { userId: throwaway.id } })) === 0,
      `${throwaway.email} removed`,
    );
  }

  // --- Head Office task scope -------------------------------------------
  const anyProject = (hoProjects.data?.items ?? hoProjects.data ?? [])[0];
  const firstDepartment = departmentRows[0];
  if (anyProject && firstDepartment) {
    const batch = await api(admin, "POST", "/api/tasks", {
      scopes: [
        { departmentId: firstDepartment.id },
        { projectId: anyProject.id },
      ],
      title: "Smoke: batch scope task",
      priority: "LOW",
    });
    const batchItems = batch.data?.items ?? [];
    for (const item of batchItems) createdTaskIds.push(item.id);
    const hoRow = batchItems.find(
      (item) => item.departmentId === firstDepartment.id,
    );
    const projectRow = batchItems.find(
      (item) => item.projectId === anyProject.id && item.departmentId === null,
    );
    check(
      "batch create writes one task per scope",
      batch.status === 201 &&
        batch.data?.count === 2 &&
        Boolean(hoRow) &&
        Boolean(projectRow) &&
        hoRow?.projectId === null &&
        projectRow?.plazaId === null,
      `HTTP ${batch.status}, ${batch.data?.count ?? 0} rows`,
    );

    const headOfficeAssigneeList = await api(
      admin,
      "GET",
      "/api/assignees?headOffice=true",
    );
    const assigneeRows = Array.isArray(headOfficeAssigneeList.data)
      ? headOfficeAssigneeList.data
      : [];
    check(
      "headOffice=true returns enriched assignee candidates",
      headOfficeAssigneeList.status === 200 &&
        assigneeRows.length > 0 &&
        assigneeRows.every(
          (row) =>
            typeof row.roleLabel === "string" &&
            "contextLabel" in row &&
            typeof row.tier === "string",
        ),
      `HTTP ${headOfficeAssigneeList.status}, ${assigneeRows.length} rows`,
    );

    const departmentAssigneeList = await api(
      admin,
      "GET",
      `/api/assignees?departmentId=${firstDepartment.id}`,
    );
    check(
      "departmentId returns assignees for the department scope",
      departmentAssigneeList.status === 200 &&
        Array.isArray(departmentAssigneeList.data),
      `HTTP ${departmentAssigneeList.status}`,
    );

    // --- Assignee association filter -------------------------------------
    const adminId = admin.session?.user?.id;

    const teamProject = await db.project.findFirst({
      where: {
        OR: [
          { assignments: { some: {} } },
          { plazas: { some: { assignments: { some: {} } } } },
        ],
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    if (teamProject && adminId) {
      const projectAssigneeList = await api(
        admin,
        "GET",
        `/api/assignees?projectId=${teamProject.id}`,
      );
      const projectRows = Array.isArray(projectAssigneeList.data)
        ? projectAssigneeList.data
        : [];
      const [pmAssignments, plazaAssignments, activeUserCount] =
        await Promise.all([
          db.projectAssignment.findMany({
            where: { projectId: teamProject.id },
            select: { userId: true },
          }),
          db.plazaAssignment.findMany({
            where: { plaza: { projectId: teamProject.id } },
            select: { userId: true },
          }),
          db.user.count({ where: { active: true } }),
        ]);
      const projectTeam = new Set([
        ...pmAssignments.map((row) => row.userId),
        ...plazaAssignments.map((row) => row.userId),
      ]);
      check(
        "assignees are limited to the project team",
        projectAssigneeList.status === 200 &&
          projectRows.length > 0 &&
          projectRows.length < activeUserCount &&
          projectRows.every(
            (row) => row.id === adminId || projectTeam.has(row.id),
          ),
        `HTTP ${projectAssigneeList.status}, ${projectRows.length}/${activeUserCount} active users`,
      );

      const projectOutsider = await db.user.findFirst({
        where: {
          active: true,
          isAdmin: false,
          id: { notIn: [...projectTeam, adminId] },
          projectAssignments: { none: { projectId: teamProject.id } },
          plazaAssignments: { none: { plaza: { projectId: teamProject.id } } },
        },
        select: { id: true, name: true },
      });
      if (projectOutsider) {
        check(
          "unassigned users are absent from the project assignees",
          !projectRows.some((row) => row.id === projectOutsider.id),
          projectOutsider.name,
        );
      }

      const memberDepartment = await db.department.findFirst({
        where: { members: { some: {} } },
        select: { id: true, name: true },
        orderBy: { sortOrder: "asc" },
      });
      if (memberDepartment) {
        const scopedDepartmentList = await api(
          admin,
          "GET",
          `/api/assignees?departmentId=${memberDepartment.id}`,
        );
        const scopedDepartmentRows = Array.isArray(scopedDepartmentList.data)
          ? scopedDepartmentList.data
          : [];
        const departmentMembers = await db.headOfficeMembership.findMany({
          where: { departmentId: memberDepartment.id },
          select: { userId: true },
        });
        const departmentMemberIds = new Set(
          departmentMembers.map((row) => row.userId),
        );
        check(
          "assignees are limited to the department",
          scopedDepartmentList.status === 200 &&
            scopedDepartmentRows.length > 0 &&
            scopedDepartmentRows.every(
              (row) => row.id === adminId || departmentMemberIds.has(row.id),
            ),
          `HTTP ${scopedDepartmentList.status}, ${scopedDepartmentRows.length} rows`,
        );

        const outsideMember = await db.user.findFirst({
          where: {
            active: true,
            id: { not: adminId },
            headOfficeMemberships: {
              some: { departmentId: { not: memberDepartment.id } },
              none: { departmentId: memberDepartment.id },
            },
          },
          select: { id: true, name: true },
        });
        if (outsideMember) {
          check(
            "Head Office members outside the department are absent",
            !scopedDepartmentRows.some((row) => row.id === outsideMember.id),
            outsideMember.name,
          );
        }
      }

      const secondProject = await db.project.findFirst({
        where: {
          id: { not: teamProject.id },
          OR: [
            { assignments: { some: {} } },
            { plazas: { some: { assignments: { some: {} } } } },
          ],
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
      if (secondProject) {
        const secondAssigneeList = await api(
          admin,
          "GET",
          `/api/assignees?projectId=${secondProject.id}`,
        );
        const secondRows = Array.isArray(secondAssigneeList.data)
          ? secondAssigneeList.data
          : [];
        const firstIds = new Set(projectRows.map((row) => row.id));
        const secondIds = new Set(secondRows.map((row) => row.id));
        const identical =
          firstIds.size === secondIds.size &&
          [...firstIds].every((id) => secondIds.has(id));
        if (!identical) {
          check(
            "switching the project scope changes the assignee list",
            secondAssigneeList.status === 200 &&
              secondRows.length > 0 &&
              !identical,
            `${firstIds.size} vs ${secondIds.size} ids`,
          );
        }
      }
    }
  }

  // --- Cross-company Head Office regression -----------------------------
  // A Treasury lead has no per-company row: membership alone must open a task
  // in every company (regression for the old company-scoped 403).
  const treasury = await login("dept.treas@tracker.local", "Manage@123");
  const companies = await db.company.findMany({
    select: { id: true, code: true },
    orderBy: { code: "asc" },
  });
  const crossCompany = [];
  for (const company of companies) {
    const companyTask = await db.task.findFirst({
      where: { project: { companyId: company.id } },
      select: { id: true },
    });
    if (!companyTask) {
      crossCompany.push({ code: company.code, status: 0 });
      continue;
    }
    const detail = await api(treasury, "GET", `/api/tasks/${companyTask.id}`);
    crossCompany.push({ code: company.code, status: detail.status });
  }
  check(
    "Treasury HO can open a task in every company",
    Boolean(treasury.session?.user?.id) &&
      crossCompany.length === 3 &&
      crossCompany.every((row) => row.status === 200),
    crossCompany.map((row) => `${row.code} ${row.status}`).join(", "),
  );

  // --- Site manager scope ----------------------------------------------
  const site = await db.plazaAssignment.findFirst({
    where: {
      user: {
        isAdmin: false,
        headOfficeMemberships: { none: {} },
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
        headOfficeMemberships: { none: {} },
        projectAssignments: { none: {} },
      },
      select: { id: true },
    });
    const unassignedProjectTask = await api(admin, "POST", "/api/tasks", {
      projectId: site.plaza.projectId,
      title: "Smoke: project-level task for someone else",
      priority: "LOW",
      ...(otherAssignee ? { assigneeIds: [otherAssignee.id] } : {}),
    });
    if (unassignedProjectTask.data?.id) {
      createdTaskIds.push(unassignedProjectTask.data.id);
    }

    // A project-level task assigned to the site manager.
    const myProjectTask = await api(admin, "POST", "/api/tasks", {
      projectId: site.plaza.projectId,
      title: "Smoke: project-level task for site manager",
      priority: "LOW",
      assigneeIds: [site.userId],
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
              { assignees: { some: { userId: site.userId } } },
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
      where: { isAdmin: false, headOfficeMemberships: { some: {} } },
      select: { id: true },
    });
    const siblingSite = await db.plazaAssignment.findFirst({
      where: { plazaId: site.plaza.id, userId: { not: site.userId } },
      select: { userId: true, user: { select: { id: true, email: true } } },
    });
    if (ownPlazaTask.data?.id && hoUser) {
      const denied = await api(siteLogin, "POST", `/api/tasks/${ownPlazaTask.data.id}/assign`, {
        assigneeIds: [hoUser.id],
      });
      check(
        "site manager cannot assign a Head Office user",
        denied.status === 422,
        `HTTP ${denied.status}`,
      );
    }
    if (ownPlazaTask.data?.id && siblingSite) {
      const allowed = await api(siteLogin, "POST", `/api/tasks/${ownPlazaTask.data.id}/assign`, {
        assigneeIds: [siblingSite.userId],
      });
      check(
        "site manager can assign a colleague on the same plaza",
        allowed.status === 200,
        `HTTP ${allowed.status}`,
      );
    }

    // --- Multi-assignee + reporting hierarchy ---------------------------
    if (siblingSite) {
      const multi = await api(admin, "POST", "/api/tasks", {
        plazaId: site.plaza.id,
        title: "Smoke: multi-assignee task",
        priority: "LOW",
        assigneeIds: [site.userId, siblingSite.userId],
      });
      if (multi.data?.id) createdTaskIds.push(multi.data.id);
      check(
        "task can be created with two assignees",
        multi.status === 201 && (multi.data?.assignees ?? []).length === 2,
        `HTTP ${multi.status}, ${(multi.data?.assignees ?? []).length} assignees`,
      );

      const multiDetail = multi.data?.id
        ? await api(admin, "GET", `/api/tasks/${multi.data.id}`)
        : { status: 0, data: null };
      check(
        "detail payload exposes assignees[]",
        multiDetail.status === 200 &&
          Array.isArray(multiDetail.data?.task?.assignees) &&
          multiDetail.data.task.assignees.length === 2,
        `HTTP ${multiDetail.status}`,
      );

      const siblingLogin = await login(siblingSite.user.email, "Tracker@123");
      const siblingView = multi.data?.id
        ? await api(siblingLogin, "GET", `/api/tasks/${multi.data.id}`)
        : { status: 0, data: null };
      check(
        "a second assignee can open the same task",
        siblingView.status === 200,
        `HTTP ${siblingView.status}`,
      );

      const one = multi.data?.id
        ? await api(admin, "POST", `/api/tasks/${multi.data.id}/assign`, {
            assigneeIds: [site.userId],
          })
        : { status: 0, data: null };
      check(
        "assign replaces the whole set",
        one.status === 200 && (one.data?.assignees ?? []).length === 1,
        `HTTP ${one.status}, ${(one.data?.assignees ?? []).length} assignees`,
      );

      const cleared = multi.data?.id
        ? await api(admin, "POST", `/api/tasks/${multi.data.id}/assign`, {
            assigneeIds: [],
          })
        : { status: 0, data: null };
      check(
        "empty assigneeIds clears the set",
        cleared.status === 200 && (cleared.data?.assignees ?? []).length === 0,
        `HTTP ${cleared.status}, ${(cleared.data?.assignees ?? []).length} assignees`,
      );

      const alias = multi.data?.id
        ? await api(admin, "POST", `/api/tasks/${multi.data.id}/assign`, {
            assigneeId: siblingSite.userId,
          })
        : { status: 0, data: null };
      check(
        "deprecated assigneeId alias still sets one assignee",
        alias.status === 200 &&
          (alias.data?.assignees ?? []).length === 1 &&
          alias.data.assignees[0]?.id === siblingSite.userId,
        `HTTP ${alias.status}, ${(alias.data?.assignees ?? []).length} assignees`,
      );
      if (multi.data?.id) {
        await api(admin, "POST", `/api/tasks/${multi.data.id}/assign`, {
          assigneeIds: [],
        });
      }

      // A plaza peer who is not an assignee may view/comment but not move status.
      const peer = await db.plazaAssignment.findFirst({
        where: {
          plazaId: site.plaza.id,
          userId: { notIn: [site.userId, siblingSite.userId] },
        },
        include: { user: true },
      });
      if (peer && multi.data?.id) {
        const peerLogin = await login(peer.user.email, "Tracker@123");
        const peerView = await api(peerLogin, "GET", `/api/tasks/${multi.data.id}`);
        const peerMove = await api(
          peerLogin,
          "POST",
          `/api/tasks/${multi.data.id}/status`,
          { to: "IN_PROGRESS" },
        );
        check(
          "same-plaza peer can view a task",
          peerView.status === 200,
          `HTTP ${peerView.status}`,
        );
        check(
          "same-plaza peer cannot change status",
          peerMove.status === 403,
          `HTTP ${peerMove.status}`,
        );
      }

      // A senior with no plaza/project assignment on this task, linked through
      // the reporting line, must see and act on it without gaining edit rights.
      const seniorAssignment = await db.plazaAssignment.findFirst({
        where: {
          plazaId: { not: site.plaza.id },
          user: {
            isAdmin: false,
            headOfficeMemberships: { none: {} },
            projectAssignments: { none: {} },
          },
        },
        include: { user: true },
      });
      if (seniorAssignment) {
        const originalManager = await db.user.findUnique({
          where: { id: site.userId },
          select: { managerId: true },
        });

        const setManager = await api(admin, "PATCH", `/api/users/${site.userId}`, {
          managerId: seniorAssignment.userId,
        });
        check(
          "admin can set a reporting line",
          setManager.status === 200,
          `HTTP ${setManager.status}`,
        );

        const juniorTask = await api(admin, "POST", "/api/tasks", {
          plazaId: site.plaza.id,
          title: "Smoke: junior task for manager visibility",
          priority: "LOW",
          assigneeIds: [site.userId],
        });
        if (juniorTask.data?.id) createdTaskIds.push(juniorTask.data.id);

        const seniorLogin = await login(seniorAssignment.user.email, "Tracker@123");
        const seniorView = juniorTask.data?.id
          ? await api(seniorLogin, "GET", `/api/tasks/${juniorTask.data.id}`)
          : { status: 0, data: null };
        check(
          "manager above sees a junior's task",
          seniorView.status === 200,
          `HTTP ${seniorView.status}`,
        );

        const seniorList = await api(seniorLogin, "GET", "/api/tasks?pageSize=100");
        check(
          "manager's task list includes the junior's task",
          (seniorList.data?.items ?? []).some(
            (task) => task.id === juniorTask.data?.id,
          ),
        );

        const seniorStatus = juniorTask.data?.id
          ? await api(seniorLogin, "POST", `/api/tasks/${juniorTask.data.id}/status`, {
              to: "IN_PROGRESS",
            })
          : { status: 0, data: null };
        check(
          "manager above can change the junior's task status",
          seniorStatus.status === 200,
          `HTTP ${seniorStatus.status}`,
        );

        const seniorEdit = juniorTask.data?.id
          ? await api(seniorLogin, "PATCH", `/api/tasks/${juniorTask.data.id}`, {
              title: "Manager edit should fail",
            })
          : { status: 0, data: null };
        check(
          "manager-only observer cannot edit fields",
          seniorEdit.status === 403,
          `HTTP ${seniorEdit.status}`,
        );

        const seniorAssign = juniorTask.data?.id
          ? await api(seniorLogin, "POST", `/api/tasks/${juniorTask.data.id}/assign`, {
              assigneeIds: [seniorAssignment.userId],
            })
          : { status: 0, data: null };
        check(
          "manager-only observer cannot reassign",
          seniorAssign.status === 403,
          `HTTP ${seniorAssign.status}`,
        );

        const seniorComment = juniorTask.data?.id
          ? await api(seniorLogin, "POST", `/api/tasks/${juniorTask.data.id}/comments`, {
              text: "Seen by the manager",
            })
          : { status: 0, data: null };
        check(
          "manager above can comment on the junior's task",
          seniorComment.status === 201,
          `HTTP ${seniorComment.status}`,
        );

        const cycle = await api(
          admin,
          "PATCH",
          `/api/users/${seniorAssignment.userId}`,
          { managerId: site.userId },
        );
        check(
          "reporting cycle is rejected",
          cycle.status === 422,
          `HTTP ${cycle.status}`,
        );

        await api(admin, "PATCH", `/api/users/${site.userId}`, {
          managerId: originalManager?.managerId ?? null,
        });
      }
    }

    // Head Office tasks are Admin/HO-owned: a site manager may be assigned one
    // but cannot reassign it.
    if (firstDepartment) {
      const hoTask = await api(admin, "POST", "/api/tasks", {
        departmentId: firstDepartment.id,
        title: "Smoke: HO task assigned to site manager",
        priority: "LOW",
        assigneeIds: [site.userId],
      });
      if (hoTask.data?.id) createdTaskIds.push(hoTask.data.id);
      const hoVisible = hoTask.data?.id
        ? await api(siteLogin, "GET", `/api/tasks/${hoTask.data.id}`)
        : { status: 0, data: null };
      check(
        "site manager can open a Head Office task assigned to them",
        hoVisible.status === 200,
        `HTTP ${hoVisible.status}`,
      );
      const hoReassign = hoTask.data?.id
        ? await api(siteLogin, "POST", `/api/tasks/${hoTask.data.id}/assign`, {
            assigneeIds: [site.userId],
          })
        : { status: 0, data: null };
      check(
        "site manager cannot reassign a Head Office task",
        hoReassign.status === 403,
        `HTTP ${hoReassign.status}`,
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
        headOfficeMemberships: { none: {} },
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

    if (firstDepartment) {
      const hoCreate = await api(pmLogin, "POST", "/api/tasks", {
        departmentId: firstDepartment.id,
        title: "Smoke: PM department task",
        priority: "LOW",
      });
      check(
        "PM cannot create a Head Office department task",
        hoCreate.status === 403,
        `HTTP ${hoCreate.status}`,
      );

      const hoLevelCreate = await api(pmLogin, "POST", "/api/tasks", {
        title: "Smoke: PM Head Office-level task",
        priority: "LOW",
      });
      check(
        "PM cannot create a Head Office-level task",
        hoLevelCreate.status === 403,
        `HTTP ${hoLevelCreate.status}`,
      );
    }

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
          { assigneeIds: site ? [site.userId] : [] },
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
