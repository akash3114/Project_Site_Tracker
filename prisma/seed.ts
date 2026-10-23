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

async function main(): Promise<void> {
  // Fresh pilot data: wipe in FK-safe order, then rebuild from master-data.md.
  if (process.env.SEED_RESET === "1") {
    await db.taskAttachment.deleteMany();
    await db.taskActivity.deleteMany();
    await db.taskReopenRequest.deleteMany();
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

  // ---- Head Office catalogue --------------------------------------------
  // Upserted by their natural keys: the migration already created Admin /
  // Delhi / Mumbai with fixed ids and the backfilled memberships point at
  // them, so these rows must survive (and the ids must not change).
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
            state: masterProject.state || null,
            piu: null,
            ro: null,
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
  for (const masterDepartment of MASTER_DEPARTMENTS) {
    const departmentId = departmentIdByCode.get(masterDepartment.code)!;
    await db.user.create({
      data: {
        name: `${masterDepartment.name} Lead`,
        email: `dept.${masterDepartment.code.toLowerCase()}@tracker.local`,
        passwordHash: hoLeadPasswordHash,
        isAdmin: false,
        active: true,
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

  // ---- Categories --------------------------------------------------------
  const categories = await Promise.all(
    CATEGORY_NAMES.map((name) =>
      db.taskCategory.create({ data: { name, active: true } }),
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
    const assigneeId =
      members.length > 0
        ? members[i % members.length]
        : (pmId ?? null);
    const status = statuses[i] ?? "TODO";
    const priority = priorities[i % priorities.length];
    const createdById = i % 4 === 3 && pmId ? pmId : management.id;
    const completedAt =
      status === "COMPLETED"
        ? new Date(now.getTime() - (i % 9) * 24 * 60 * 60 * 1000)
        : null;

    const task = await db.task.create({
      data: {
        projectId: project.id,
        plazaId: plaza?.id ?? null,
        categoryId: categories[i % categories.length].id,
        title: TASK_TITLES[i],
        description: projectLevel
          ? `Portfolio-level task ${i + 1}/41 for ${project.name}.`
          : `Sample task ${i + 1}/41: ${TASK_TITLES[i]} at ${plaza?.name} plaza, ${project.name}.`,
        status,
        priority,
        assigneeId,
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

    if (assigneeId) {
      await db.taskActivity.create({
        data: {
          taskId: task.id,
          actorId: createdById,
          type: "ASSIGNED",
          fromStatus: "TODO",
          toStatus: "TODO",
          toAssigneeId: assigneeId,
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
    where: { status: "COMPLETED", assigneeId: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { id: true, assigneeId: true },
  });
  if (completed?.assigneeId) {
    const reason =
      "Pavement patch was re-opened by the contractor; please allow re-verification.";
    await db.taskReopenRequest.create({
      data: {
        taskId: completed.id,
        requestedById: completed.assigneeId,
        reason,
        status: "PENDING",
      },
    });
    await db.taskActivity.create({
      data: {
        taskId: completed.id,
        actorId: completed.assigneeId,
        type: "REOPEN_REQUESTED",
        fromStatus: "COMPLETED",
        toStatus: "COMPLETED",
        text: reason,
      },
    });
  }

  const [
    companies,
    projectsCount,
    plazas,
    users,
    tasks,
    offices,
    departments,
    headOfficeMemberships,
    activities,
    pendingReopen,
  ] = await Promise.all([
    db.company.count(),
    db.project.count(),
    db.plaza.count(),
    db.user.count(),
    db.task.count(),
    db.office.count(),
    db.department.count(),
    db.headOfficeMembership.count(),
    db.taskActivity.count(),
    db.taskReopenRequest.count({ where: { status: "PENDING" } }),
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
      activities,
      pendingReopen,
      categories: categories.length,
      taskIds: createdTaskIds.length,
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
