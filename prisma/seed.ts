import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import {
  MASTER_COMPANIES,
  MASTER_DEPARTMENTS,
  MASTER_OFFICES,
} from "./master-data";

const db = new PrismaClient();

const hashPw = (s: string) => bcrypt.hash(s, 12);

const FIELD_PASSWORD = "Tracker@123";
const ADMIN_PASSWORD = "Admin@123";
const HO_PASSWORD = "Manage@123";

function slug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".");
  return base || "user";
}

/** Lowercase, collapse runs of non-alphanumerics, trim the separator. */
function refSlug(value: string, separator: "-" | "_" = "-"): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, separator)
    .replace(new RegExp(`^\\${separator}+|\\${separator}+$`, "g"), "");
}

// Reference/catalogue rows use stable slugs so every environment is identical
// (see prisma/schema.prisma conventions and docs/DATABASE.md).
const departmentIdFor = (code: string) => `dept_${refSlug(code)}`;
const officeIdFor = (name: string) => `office_${refSlug(name)}`;
const companyIdFor = (code: string) => `company_${refSlug(code)}`;
const categoryIdFor = (name: string) => `cat_${refSlug(name, "_")}`;

function roundEnum(n: number): "ROUND_1" | "ROUND_2" | "ROUND_3" | "ROUND_4" {
  if (n === 2) return "ROUND_2";
  if (n === 3) return "ROUND_3";
  if (n === 4) return "ROUND_4";
  return "ROUND_1";
}

const TASK_TITLES = [
  "Canopy bolt tightening LHS",
  "Toll booth UPS wiring",
  "Lane marking refresh",
  "CCTV pole alignment",
  "Drain desilting RHS",
  "ETC antenna calibration lane 3",
  "Boom barrier replacement lane 5",
  "Solar panel cleaning canopy",
  "Fire extinguisher refill audit",
  "Signage retro-reflectivity check",
  "Pavement patch near weighbridge",
  "OFC cable splicing chamber 2",
  "UPS battery bank load test",
  "Toll collector cabin AC repair",
  "Lane controller software patch",
  "Weigh-in-motion sensor check",
  "Street light pole painting",
  "Water tank level sensor fix",
  "Server room temperature alert",
  "Intercom testing all booths",
  "Canopy LED strip replacement",
  "Anti-skid surfacing toll island",
  "Barrier boom reflector stickers",
  "DG set fuel top-up and trial run",
  "Fare display board calibration",
  "CCTV NVR storage expansion",
  "Lane 1 loop detector retune",
  "Pedestrian railing welding RHS",
  "Storm water drain cover replacement",
  "Booth glass shutter servicing",
  "Flag mast rope replacement",
  "Solar inverter firmware update",
  "Emergency SOS phone testing",
  "Weighbridge pit cleaning",
  "Toll plaza garden sprinkler repair",
  "Lane signal gantry bolt audit",
  "UPS room exhaust fan install",
  "RFID reader firmware upgrade",
  "Divider kerb painting white-yellow",
  "Night audit cash reconciliation SOP",
  "Pre-monsoon drain inspection",
];

const CATEGORY_NAMES = [
  "Toll Operations",
  "Maintenance",
  "Safety & Compliance",
  "IT & Systems",
  "Civil Works",
  "Documentation",
];

const COMMENT_POOL = [
  "Visited site, work in progress as planned.",
  "Material delivery delayed by a day, catching up.",
  "Verified on ground with shift in-charge.",
  "Noted in site register for record.",
];

// Departments whose demo lead sits in the Delhi office; the rest sit in
// Mumbai. Purely demo distribution, mirroring the plan.
const DELHI_DEPARTMENT_CODES = new Set([
  "ADMIN",
  "FIN",
  "SEC",
  "TREAS",
  "INV",
  "LEGAL",
  "IA",
  "HR-LD",
  "HR-COMP",
  "HR-RP",
]);

function dueDateFor(index: number, now: Date): Date | null {
  const day = 24 * 60 * 60 * 1000;
  const atMidnightUTC = (t: number) => {
    const d = new Date(t);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  };
  if (index < 10) return atMidnightUTC(now.getTime() - ((index % 7) + 1) * day);
  if (index < 25) return atMidnightUTC(now.getTime() + ((index % 7) + 1) * day);
  if (index % 2 === 0) return null;
  return atMidnightUTC(now.getTime() + (14 + (index % 7)) * day);
}

function dueDateInDays(days: number, now: Date): Date {
  const d = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// Six Head Office demo tasks: two each for Operations, Finance and IT, with a
// mix of statuses. Each is assigned to that department's seeded lead.
const HEAD_OFFICE_TASKS: {
  code: string;
  title: string;
  description: string;
  category: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED";
  dueInDays: number;
}[] = [
  {
    code: "OPS",
    title: "Monthly toll collection reconciliation",
    description:
      "Reconcile plaza collection reports against bank credits for the month.",
    category: "Toll Operations",
    priority: "HIGH",
    status: "IN_PROGRESS",
    dueInDays: 3,
  },
  {
    code: "OPS",
    title: "Shift roster sign-off for next quarter",
    description:
      "Confirm toll and maintenance shift rosters with each project manager.",
    category: "Documentation",
    priority: "MEDIUM",
    status: "TODO",
    dueInDays: 9,
  },
  {
    code: "FIN",
    title: "Vendor invoice ageing review",
    description:
      "Review invoices older than 45 days and clear disputed line items.",
    category: "Documentation",
    priority: "HIGH",
    status: "BLOCKED",
    dueInDays: -2,
  },
  {
    code: "FIN",
    title: "Quarterly budget variance pack",
    description:
      "Prepare the variance commentary for the Head Office review meeting.",
    category: "Documentation",
    priority: "MEDIUM",
    status: "TODO",
    dueInDays: 12,
  },
  {
    code: "IT",
    title: "Toll management system patch rollout",
    description:
      "Roll out the approved patch to all plaza lane controllers and verify.",
    category: "IT & Systems",
    priority: "HIGH",
    status: "COMPLETED",
    dueInDays: -5,
  },
  {
    code: "IT",
    title: "NVR storage health check across plazas",
    description:
      "Audit CCTV retention headroom and flag plazas below 21 days.",
    category: "IT & Systems",
    priority: "MEDIUM",
    status: "IN_PROGRESS",
    dueInDays: 5,
  },
];

async function main(): Promise<void> {
  // Fresh pilot data: wipe in FK-safe order, then rebuild from master-data.md.
  if (process.env.SEED_RESET === "1") {
    await db.auditLog.deleteMany();
    await db.taskAttachment.deleteMany();
    await db.taskActivity.deleteMany();
    await db.taskReopenRequest.deleteMany();
    await db.taskAssignee.deleteMany();
    await db.task.deleteMany();
    await db.plazaAssignment.deleteMany();
    await db.projectAssignment.deleteMany();
    await db.headOfficeMembership.deleteMany();
    await db.plaza.deleteMany();
    await db.project.deleteMany();
    await db.taskCategory.deleteMany();
    await db.company.deleteMany();
    await db.user.deleteMany();
    await db.office.deleteMany();
    await db.department.deleteMany();
  }

  // Seed assumes a fresh DB; skip (rather than crash) when data already
  // exists. SEED_RESET=1 above is the explicit wipe-and-rebuild path.
  const seededBefore = (await db.user.count()) > 0;
  if (seededBefore && process.env.SEED_RESET !== "1") {
    // eslint-disable-next-line no-console
    console.log(
      "Seed skipped: database already contains users. Set SEED_RESET=1 to wipe and re-seed.",
    );
    return;
  }

  // ---- Head Office catalogue --------------------------------------------
  // Upserted by their natural keys and created with stable slug ids. The
  // migration rewrites any older cuid/`dept_*` ids to the same slugs, so these
  // rows survive a reseed with their ids intact.
  const departmentIdByCode = new Map<string, string>();
  for (const masterDepartment of MASTER_DEPARTMENTS) {
    const department = await db.department.upsert({
      where: { code: masterDepartment.code },
      update: {
        name: masterDepartment.name,
        sortOrder: masterDepartment.sortOrder,
        active: true,
      },
      create: {
        id: departmentIdFor(masterDepartment.code),
        name: masterDepartment.name,
        code: masterDepartment.code,
        sortOrder: masterDepartment.sortOrder,
        active: true,
      },
    });
    departmentIdByCode.set(department.code, department.id);
  }

  const officeIdByName = new Map<string, string>();
  for (const masterOffice of MASTER_OFFICES) {
    const office = await db.office.upsert({
      where: { name: masterOffice.name },
      update: { city: masterOffice.city || null, active: true },
      create: {
        id: officeIdFor(masterOffice.name),
        name: masterOffice.name,
        city: masterOffice.city || null,
        active: true,
      },
    });
    officeIdByName.set(office.name, office.id);
  }

  const delhiOfficeId = officeIdByName.get("Delhi")!;
  const mumbaiOfficeId = officeIdByName.get("Mumbai")!;

  const admin = await db.user.create({
    data: {
      name: "Tracker Admin",
      email: "admin@tracker.local",
      passwordHash: await hashPw(ADMIN_PASSWORD),
      isAdmin: true,
      active: true,
    },
  });

  const fieldPasswordHash = await hashPw(FIELD_PASSWORD);
  // C-suite shared account: primary Secretarial, secondary Finance, Delhi.
  const management = await db.user.create({
    data: {
      name: "NHIT Head Office",
      email: process.env.SEED_MANAGEMENT_EMAIL ?? "management@tracker.local",
      passwordHash: await hashPw(
        process.env.SEED_MANAGEMENT_PASSWORD ?? HO_PASSWORD,
      ),
      isAdmin: false,
      active: true,
      title: "Operations Manager",
      officeId: delhiOfficeId,
    },
  });

  // ---- Companies / projects / plazas -------------------------------------
  const companyIdByName = new Map<string, string>();
  const projectIdByKey = new Map<string, string>(); // company::project
  const plazaIdByKey = new Map<string, string>(); // company::project::plaza

  for (const masterCompany of MASTER_COMPANIES) {
    const company = await db.company.create({
      data: {
        id: companyIdFor(masterCompany.code),
        name: masterCompany.name,
        code: masterCompany.code,
        active: true,
      },
    });
    companyIdByName.set(masterCompany.name, company.id);

    for (const masterProject of masterCompany.projects) {
      const project = await db.project.create({
        data: {
          companyId: company.id,
          name: masterProject.name,
          acronym: masterProject.code,
          round: roundEnum(masterProject.round),
          state: masterProject.state || null,
          // Project length is intentionally blank; plaza brackets are authoritative.
          lengthKm: null,
          piu: null,
          ro: null,
          active: true,
        },
      });
      projectIdByKey.set(
        `${masterCompany.name}::${masterProject.name}`,
        project.id,
      );

      for (const masterPlaza of masterProject.plazas) {
        const plaza = await db.plaza.create({
          data: {
            projectId: project.id,
            name: masterPlaza.name,
            lengthKm: masterPlaza.lengthKm,
            active: true,
          },
        });
        plazaIdByKey.set(
          `${masterCompany.name}::${masterProject.name}::${masterPlaza.name}`,
          plaza.id,
        );
      }
    }
  }

  // C-suite shared account: Secretarial primary, Finance & Accounts secondary.
  for (const [code, isPrimary] of [
    ["SEC", true],
    ["FIN", false],
  ] as const) {
    await db.headOfficeMembership.create({
      data: {
        userId: management.id,
        departmentId: departmentIdByCode.get(code)!,
        isPrimary,
        assignedById: admin.id,
      },
    });
  }

  // ---- People ------------------------------------------------------------
  const people = new Set<string>();
  for (const c of MASTER_COMPANIES) {
    for (const p of c.projects) {
      for (const name of p.pms) people.add(name);
      for (const z of p.plazas) {
        for (const name of [...z.toll, ...z.maintenance, ...z.corridor]) {
          people.add(name);
        }
      }
    }
  }

  const usedEmails = new Set<string>([
    admin.email,
    management.email,
    "admin@tracker.local",
    "management@tracker.local",
    ...MASTER_DEPARTMENTS.map(
      (department) => `dept.${department.code.toLowerCase()}@tracker.local`,
    ),
  ]);
  function emailFor(name: string): string {
    const base = `${slug(name)}@tracker.local`;
    if (!usedEmails.has(base)) {
      usedEmails.add(base);
      return base;
    }
    let i = 2;
    while (usedEmails.has(`${slug(name)}.${i}@tracker.local`)) i++;
    const email = `${slug(name)}.${i}@tracker.local`;
    usedEmails.add(email);
    return email;
  }

  const userIdByName = new Map<string, string>();
  for (const name of Array.from(people).sort((a, b) => a.localeCompare(b))) {
    const user = await db.user.create({
      data: {
        name,
        email: emailFor(name),
        passwordHash: fieldPasswordHash,
        isAdmin: false,
        active: true,
      },
    });
    userIdByName.set(name, user.id);
  }

  // One demo Head Office lead per department: dept.<code>@tracker.local,
  // password Manage@123, primary membership on their own department.
  const hoLeadPasswordHash = await hashPw(HO_PASSWORD);
  const headOfficeLeadIdByCode = new Map<string, string>();
  for (const masterDepartment of MASTER_DEPARTMENTS) {
    const departmentId = departmentIdByCode.get(masterDepartment.code)!;
    const lead = await db.user.create({
      data: {
        name: `${masterDepartment.name} Lead`,
        email: `dept.${masterDepartment.code.toLowerCase()}@tracker.local`,
        passwordHash: hoLeadPasswordHash,
        isAdmin: false,
        active: true,
        title: `${masterDepartment.name} Lead`,
        officeId: DELHI_DEPARTMENT_CODES.has(masterDepartment.code)
          ? delhiOfficeId
          : mumbaiOfficeId,
        headOfficeMemberships: {
          create: {
            departmentId,
            isPrimary: true,
            assignedById: admin.id,
          },
        },
      },
    });
    headOfficeLeadIdByCode.set(masterDepartment.code, lead.id);
  }

  // ---- Assignments -------------------------------------------------------
  for (const c of MASTER_COMPANIES) {
    for (const p of c.projects) {
      const projectId = projectIdByKey.get(`${c.name}::${p.name}`)!;
      for (let i = 0; i < p.pms.length; i++) {
        const userId = userIdByName.get(p.pms[i]);
        if (!userId) continue;
        await db.projectAssignment.create({
          data: {
            projectId,
            userId,
            isPrimary: i === 0,
            assignedById: admin.id,
          },
        });
      }

      for (const z of p.plazas) {
        const plazaId = plazaIdByKey.get(
          `${c.name}::${p.name}::${z.name}`,
        )!;
        const roleLists = [
          ["TOLL", z.toll],
          ["MAINTENANCE", z.maintenance],
          ["CORRIDOR", z.corridor],
        ] as const;
        for (const [role, names] of roleLists) {
          for (let i = 0; i < names.length; i++) {
            const userId = userIdByName.get(names[i]);
            if (!userId) continue;
            await db.plazaAssignment.create({
              data: {
                plazaId,
                userId,
                role,
                isPrimary: i === 0,
                assignedById: admin.id,
              },
            });
          }
        }
      }
    }
  }

  // ---- Reporting line ----------------------------------------------------
  // Derive a demo chain from the master data: field people report to the
  // first project manager of the first project they work on, project managers
  // and Head Office leads report to the C-suite account, which reports to the
  // admin. An Admin can change any link later in Admin -> Users.
  const managerIdByUserId = new Map<string, string>();
  for (const c of MASTER_COMPANIES) {
    for (const p of c.projects) {
      const pmId = p.pms.map((name) => userIdByName.get(name)).find(Boolean);
      for (const name of p.pms) {
        const userId = userIdByName.get(name);
        if (userId) managerIdByUserId.set(userId, management.id);
      }
      for (const z of p.plazas) {
        for (const name of [...z.toll, ...z.maintenance, ...z.corridor]) {
          const userId = userIdByName.get(name);
          if (userId && !managerIdByUserId.has(userId)) {
            managerIdByUserId.set(userId, pmId ?? management.id);
          }
        }
      }
    }
  }
  for (const leadId of Array.from(headOfficeLeadIdByCode.values())) {
    managerIdByUserId.set(leadId, management.id);
  }
  managerIdByUserId.set(management.id, admin.id);

  for (const [userId, managerId] of Array.from(managerIdByUserId.entries())) {
    if (userId === managerId) continue;
    await db.user.update({
      where: { id: userId },
      data: { managerId },
    });
  }

  // ---- Categories --------------------------------------------------------
  const categories = await Promise.all(
    CATEGORY_NAMES.map((name) =>
      db.taskCategory.create({
        data: { id: categoryIdFor(name), name, active: true },
      }),
    ),
  );

  // ---- Demo tasks --------------------------------------------------------
  const projects = await db.project.findMany({
    include: {
      company: { select: { name: true } },
      plazas: { select: { id: true, name: true } },
      assignments: { select: { userId: true } },
    },
    orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
  });

  const plazaMembers = new Map<string, string[]>();
  const plazaRows = await db.plazaAssignment.findMany({
    select: { plazaId: true, userId: true, role: true },
  });
  const roleOrder: Record<string, number> = {
    TOLL: 0,
    MAINTENANCE: 1,
    CORRIDOR: 2,
  };
  for (const row of plazaRows.sort(
    (a, b) => roleOrder[a.role] - roleOrder[b.role],
  )) {
    const list = plazaMembers.get(row.plazaId) ?? [];
    if (!list.includes(row.userId)) list.push(row.userId);
    plazaMembers.set(row.plazaId, list);
  }

  const statuses: ("TODO" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED")[] = [
    ...(Array(16).fill("TODO") as "TODO"[]),
    ...(Array(10).fill("IN_PROGRESS") as "IN_PROGRESS"[]),
    ...(Array(5).fill("BLOCKED") as "BLOCKED"[]),
    ...(Array(10).fill("COMPLETED") as "COMPLETED"[]),
  ];

  const priorities = ["MEDIUM", "HIGH", "LOW"] as const;
  const now = new Date();
  const createdTaskIds: string[] = [];

  for (let i = 0; i < TASK_TITLES.length; i++) {
    const project = projects[i % projects.length];
    const projectLevel = i % 6 === 5;
    const plaza = projectLevel
      ? null
      : project.plazas[i % project.plazas.length];
    const members = plaza ? (plazaMembers.get(plaza.id) ?? []) : [];
    const pmId = project.assignments[0]?.userId ?? null;
    const primaryAssigneeId =
      members.length > 0
        ? members[i % members.length]
        : (pmId ?? null);
    // Give a few plaza tasks a second assignee so the multi-assignee UI is
    // exercised immediately after a fresh seed.
    const assigneeIds = Array.from(
      new Set(
        [
          primaryAssigneeId,
          members.length > 1 && i % 7 === 0 ? members[(i + 1) % members.length] : null,
        ].filter((id): id is string => Boolean(id)),
      ),
    );
    const assigneeId = assigneeIds[0] ?? null;
    const status = statuses[i] ?? "TODO";
    const priority = priorities[i % priorities.length];
    const createdById = i % 4 === 3 && pmId ? pmId : management.id;
    const completedAt =
      status === "COMPLETED"
        ? new Date(now.getTime() - (i % 9) * 24 * 60 * 60 * 1000)
        : null;

    const task = await db.task.create({
      data: {
        scope: plaza ? "PLAZA" : "PROJECT",
        projectId: project.id,
        plazaId: plaza?.id ?? null,
        categoryId: categories[i % categories.length].id,
        title: TASK_TITLES[i],
        description: projectLevel
          ? `Portfolio-level task ${i + 1}/41 for ${project.name}.`
          : `Sample task ${i + 1}/41: ${TASK_TITLES[i]} at ${plaza?.name} plaza, ${project.name}.`,
        status,
        priority,
        assignees: {
          create: assigneeIds.map((userId) => ({
            userId,
            assignedById: createdById,
          })),
        },
        createdById,
        dueDate: dueDateFor(i, now),
        completedAt,
        completedById: status === "COMPLETED" ? (assigneeId ?? createdById) : null,
      },
    });
    createdTaskIds.push(task.id);

    await db.taskActivity.create({
      data: {
        taskId: task.id,
        actorId: createdById,
        type: "CREATED",
        toStatus: "TODO",
        toAssigneeId: assigneeId,
        text: projectLevel ? "Project-level task created" : "Task created",
      },
    });

    for (const userId of assigneeIds) {
      await db.taskActivity.create({
        data: {
          taskId: task.id,
          actorId: createdById,
          type: "ASSIGNED",
          fromStatus: "TODO",
          toStatus: "TODO",
          toAssigneeId: userId,
        },
      });
    }

    if (status !== "TODO") {
      await db.taskActivity.create({
        data: {
          taskId: task.id,
          actorId: assigneeId ?? createdById,
          type: "STATUS_CHANGED",
          fromStatus: "TODO",
          toStatus: status,
          text: `Moved to ${status.replace("_", " ").toLowerCase()}`,
        },
      });
    }

    if (i % 3 === 0) {
      await db.taskActivity.create({
        data: {
          taskId: task.id,
          actorId: assigneeId ?? createdById,
          type: "COMMENT",
          text: COMMENT_POOL[i % COMMENT_POOL.length],
        },
      });
    }
  }

  // One completed task carries a pending PM reopen request so the HO
  // approval workflow is visible immediately after a fresh seed.
  const completed = await db.task.findFirst({
    where: { status: "COMPLETED", assignees: { some: {} } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      assignees: { select: { userId: true }, take: 1 },
    },
  });
  const completedAssigneeId = completed?.assignees[0]?.userId ?? null;
  if (completed && completedAssigneeId) {
    const reason =
      "Pavement patch was re-opened by the contractor; please allow re-verification.";
    await db.taskReopenRequest.create({
      data: {
        taskId: completed.id,
        requestedById: completedAssigneeId,
        reason,
        status: "PENDING",
      },
    });
    await db.taskActivity.create({
      data: {
        taskId: completed.id,
        actorId: completedAssigneeId,
        type: "REOPEN_REQUESTED",
        fromStatus: "COMPLETED",
        toStatus: "COMPLETED",
        text: reason,
      },
    });
  }

  // ---- Head Office (department-scoped) demo tasks ------------------------
  // Created after the project tasks and the reopen request so those 41 tasks
  // and the pending reopen row are untouched. Each task sits at department
  // scope (projectId/plazaId null) and is assigned to that department's lead.
  const categoryIdByName = new Map(
    categories.map((category) => [category.name, category.id]),
  );
  let headOfficeTasks = 0;

  for (const demo of HEAD_OFFICE_TASKS) {
    const departmentId = departmentIdByCode.get(demo.code);
    const assigneeId = headOfficeLeadIdByCode.get(demo.code) ?? null;
    if (!departmentId) continue;

    const completedAt =
      demo.status === "COMPLETED"
        ? new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
        : null;

    const task = await db.task.create({
      data: {
        scope: "DEPARTMENT",
        projectId: null,
        plazaId: null,
        departmentId,
        categoryId: categoryIdByName.get(demo.category) ?? null,
        title: demo.title,
        description: demo.description,
        status: demo.status,
        priority: demo.priority,
        assignees: assigneeId
          ? { create: [{ userId: assigneeId, assignedById: management.id }] }
          : undefined,
        createdById: management.id,
        dueDate: dueDateInDays(demo.dueInDays, now),
        completedAt,
        completedById: demo.status === "COMPLETED" ? assigneeId : null,
      },
    });
    createdTaskIds.push(task.id);
    headOfficeTasks += 1;

    await db.taskActivity.create({
      data: {
        taskId: task.id,
        actorId: management.id,
        type: "CREATED",
        toStatus: "TODO",
        toAssigneeId: assigneeId,
        text: `Head Office task created · ${demo.code}`,
      },
    });

    if (assigneeId) {
      await db.taskActivity.create({
        data: {
          taskId: task.id,
          actorId: management.id,
          type: "ASSIGNED",
          fromStatus: "TODO",
          toStatus: "TODO",
          toAssigneeId: assigneeId,
        },
      });
    }

    if (demo.status !== "TODO") {
      await db.taskActivity.create({
        data: {
          taskId: task.id,
          actorId: assigneeId ?? management.id,
          type: "STATUS_CHANGED",
          fromStatus: "TODO",
          toStatus: demo.status,
          text: `Moved to ${demo.status.replace("_", " ").toLowerCase()}`,
        },
      });
    }
  }

  const [
    companies,
    projectsCount,
    plazas,
    users,
    tasks,
    projectTasks,
    departmentTasks,
    offices,
    departments,
    headOfficeMemberships,
    activities,
    pendingReopen,
    taskAssignees,
  ] = await Promise.all([
    db.company.count(),
    db.project.count(),
    db.plaza.count(),
    db.user.count(),
    db.task.count(),
    db.task.count({ where: { projectId: { not: null } } }),
    db.task.count({ where: { departmentId: { not: null } } }),
    db.office.count(),
    db.department.count(),
    db.headOfficeMembership.count(),
    db.taskActivity.count(),
    db.taskReopenRequest.count({ where: { status: "PENDING" } }),
    db.taskAssignee.count(),
  ]);

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      companies,
      projects: projectsCount,
      plazas,
      offices,
      departments,
      users,
      headOfficeMemberships,
      tasks,
      projectTasks,
      departmentTasks,
      activities,
      pendingReopen,
      taskAssignees,
      categories: categories.length,
      taskIds: createdTaskIds.length,
      headOfficeTasks,
    }),
  );
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
