import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { NHIT_PROJECTS } from "./nhit-data";

const db = new PrismaClient();

const hashPw = (s: string) => bcrypt.hash(s, 12);

// Real masters from docs/NHIT Project List.xlsx (via scripts/parse-nhit.py):
// 28 projects / 46 plazas. Every manager name becomes a MANAGER login;
// the PM-vs-Toll distinction lives on the assignment rows, not the role.
// Default password for generated logins: Tracker@123 (distribute + rotate).

const DEFAULT_PASSWORD = "Tracker@123";

function slug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".");
  return base || "user";
}

function roundEnum(
  r: string | null,
): "ROUND_1" | "ROUND_2" | "ROUND_3" | "ROUND_4" {
  if (r === "Round 2") return "ROUND_2";
  if (r === "Round 3") return "ROUND_3";
  if (r === "Round 4") return "ROUND_4";
  return "ROUND_1";
}

// 40 sample task titles, round-robin over plazas.
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
];

const TASK_STATUSES = [
  ...Array<string>(20).fill("TODO"),
  ...Array<string>(10).fill("IN_PROGRESS"),
  ...Array<string>(4).fill("BLOCKED"),
  ...Array<string>(6).fill("COMPLETED"),
] as ("TODO" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED")[];

const TASK_PRIORITIES = [
  "MEDIUM",
  "HIGH",
  "LOW",
  "HIGH",
  "MEDIUM",
  "CRITICAL",
  "LOW",
  "MEDIUM",
] as ("LOW" | "MEDIUM" | "HIGH" | "CRITICAL")[];

const COMMENT_POOL = [
  "Visited site, work in progress as planned.",
  "Material delivery delayed by a day, catching up.",
  "Verified on ground with shift in-charge.",
  "Noted in site register for record.",
];

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

async function main(): Promise<{
  projects: number;
  plazas: number;
  users: number;
  tasks: number;
}> {
  if (process.env.SEED_RESET === "1") {
    // Pre-pilot full wipe only (FK-safe order). Default runs never delete.
    await db.taskEvent.deleteMany();
    await db.task.deleteMany();
    await db.plazaAssignment.deleteMany();
    await db.projectAssignment.deleteMany();
    await db.plaza.deleteMany();
    await db.project.deleteMany();
    await db.user.deleteMany();
  }

  // ---- Projects (upsert by [name, round]) ----
  const projectIds: string[] = [];
  for (const p of NHIT_PROJECTS) {
    const round = roundEnum(p.round);
    const project = await db.project.upsert({
      where: { name_round: { name: p.name, round } },
      update: { acronym: p.acronym, status: "ACTIVE" },
      create: {
        name: p.name,
        acronym: p.acronym,
        round,
        status: "ACTIVE",
      },
    });
    projectIds.push(project.id);
  }

  // ---- Plazas (upsert by [projectId, name]) ----
  const plazaIds: string[] = [];
  const plazaNames: string[] = [];
  const flatPlazas: { projectIndex: number; plazaIndex: number }[] = [];
  NHIT_PROJECTS.forEach((p, projectIndex) => {
    p.plazas.forEach((_z, plazaIndex) => {
      flatPlazas.push({ projectIndex, plazaIndex });
    });
  });
  for (let i = 0; i < flatPlazas.length; i++) {
    const { projectIndex, plazaIndex } = flatPlazas[i];
    const z = NHIT_PROJECTS[projectIndex].plazas[plazaIndex];
    const plaza = await db.plaza.upsert({
      where: {
        projectId_name: { projectId: projectIds[projectIndex], name: z.name },
      },
      update: {
        lengthKm: z.lengthKm,
        state: z.state,
        piu: z.piu,
        ro: z.ro,
        status: "ACTIVE",
      },
      create: {
        projectId: projectIds[projectIndex],
        name: z.name,
        lengthKm: z.lengthKm,
        state: z.state,
        piu: z.piu,
        ro: z.ro,
        status: "ACTIVE",
      },
    });
    plazaIds.push(plaza.id);
    plazaNames.push(z.name);
  }
  const N_PLAZAS = plazaIds.length;

  // ---- Users ----
  const admin = await db.user.upsert({
    where: { email: "admin@tracker.local" },
    update: {
      name: "Tracker Admin",
      role: "ADMIN",
      active: true,
      passwordHash: await hashPw("Admin@123"),
    },
    create: {
      name: "Tracker Admin",
      email: "admin@tracker.local",
      passwordHash: await hashPw("Admin@123"),
      role: "ADMIN",
      active: true,
    },
  });

  const managementPassword = await hashPw(
    process.env.SEED_MANAGEMENT_PASSWORD ?? "Manage@123",
  );
  await db.user.upsert({
    where: {
      email: process.env.SEED_MANAGEMENT_EMAIL ?? "management@tracker.local",
    },
    update: { name: "NHIT Management", role: "MANAGEMENT", active: true },
    create: {
      name: "NHIT Management",
      email: process.env.SEED_MANAGEMENT_EMAIL ?? "management@tracker.local",
      passwordHash: managementPassword,
      role: "MANAGEMENT",
      active: true,
    },
  });

  // Collect people: name -> { leadProjects: Set<projectIndex>, plazas: roles per flatIdx }
  const people = new Map<string, { leadProjects: Set<number> }>();
  const touch = (name: string) => {
    let e = people.get(name);
    if (!e) {
      e = { leadProjects: new Set() };
      people.set(name, e);
    }
    return e;
  };
  NHIT_PROJECTS.forEach((p, projectIndex) => {
    for (const pm of p.pms) touch(pm).leadProjects.add(projectIndex);
    p.plazas.forEach((z) => {
      for (const n of [...z.toll, ...z.maintenance, ...z.corridor]) touch(n);
    });
  });

  // Deterministic emails: slug + collision suffixes.
  const usedEmails = new Set<string>([
    "admin@tracker.local",
    process.env.SEED_MANAGEMENT_EMAIL ?? "management@tracker.local",
  ]);
  const emailFor = (name: string) => {
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
  };

  const passwordHash = await hashPw(DEFAULT_PASSWORD);
  const userIdByName = new Map<string, string>();
  const sortedNames = Array.from(people.keys()).sort((a, b) =>
    a.localeCompare(b),
  );
  for (const name of sortedNames) {
    const email = emailFor(name);
    const user = await db.user.upsert({
      where: { email },
      update: { name, role: "MANAGER", active: true, passwordHash },
      create: { name, email, passwordHash, role: "MANAGER", active: true },
    });
    userIdByName.set(name, user.id);
  }

  // Project-index -> flat plaza indices.
  const projectFlatIdx = NHIT_PROJECTS.map((_, pi) =>
    flatPlazas
      .map((f, idx) => (f.projectIndex === pi ? idx : -1))
      .filter((idx) => idx >= 0),
  );
  void projectFlatIdx;

  // ---- Assignments (wipe + recreate for idempotency) ----
  await db.plazaAssignment.deleteMany();
  await db.projectAssignment.deleteMany();

  for (let pi = 0; pi < NHIT_PROJECTS.length; pi++) {
    const p = NHIT_PROJECTS[pi];
    for (let k = 0; k < p.pms.length; k++) {
      const userId = userIdByName.get(p.pms[k]);
      if (!userId) continue;
      await db.projectAssignment.create({
        data: {
          projectId: projectIds[pi],
          userId,
          isPrimary: k === 0,
          assignedById: admin.id,
        },
      });
    }
  }

  const plazaMembers = new Map<number, string[]>(); // flatIdx -> userIds, toll-first
  for (let i = 0; i < flatPlazas.length; i++) {
    const { projectIndex, plazaIndex } = flatPlazas[i];
    const z = NHIT_PROJECTS[projectIndex].plazas[plazaIndex];
    const plazaId = plazaIds[i];
    const roles: ("TOLL" | "MAINTENANCE" | "CORRIDOR")[] = [
      "TOLL",
      "MAINTENANCE",
      "CORRIDOR",
    ];
    const lists = [z.toll, z.maintenance, z.corridor];
    const ordered: string[] = [];
    for (let r = 0; r < roles.length; r++) {
      for (let k = 0; k < lists[r].length; k++) {
        const userId = userIdByName.get(lists[r][k]);
        if (!userId) continue;
        ordered.push(userId);
        await db.plazaAssignment.create({
          data: {
            plazaId,
            userId,
            role: roles[r],
            isPrimary: k === 0,
            assignedById: admin.id,
          },
        });
      }
    }
    plazaMembers.set(
      i,
      Array.from(new Set(ordered)),
    );
  }

  // ---- Tasks (40 sample, deterministic; only missing plazaId+title pairs created) ----
  const existing = await db.task.findMany({
    select: { plazaId: true, title: true },
  });
  const existingKeys = new Set(
    existing.map((t) => `${t.plazaId}::${t.title}`),
  );

  const now = new Date();
  const plazaCursor = new Map<number, number>();
  for (let i = 0; i < TASK_TITLES.length; i++) {
    const flatIdx = i % N_PLAZAS;
    const plazaId = plazaIds[flatIdx];
    const title = TASK_TITLES[i];
    if (existingKeys.has(`${plazaId}::${title}`)) continue;

    const members = plazaMembers.get(flatIdx) ?? [];
    const cursor = plazaCursor.get(flatIdx) ?? 0;
    const assigneeId =
      members.length > 0 ? members[cursor % members.length] : null;
    plazaCursor.set(flatIdx, cursor + 1);

    const status = TASK_STATUSES[i];
    const task = await db.task.create({
      data: {
        plazaId,
        title,
        description: `Sample task ${i + 1}/40: ${title} at ${plazaNames[flatIdx]} plaza.`,
        status,
        priority: TASK_PRIORITIES[i % TASK_PRIORITIES.length],
        assigneeId,
        createdById: admin.id,
        dueDate: dueDateFor(i, now),
        completedAt: status === "COMPLETED" ? now : null,
      },
    });

    await db.taskEvent.create({
      data: {
        taskId: task.id,
        actorId: admin.id,
        type: "CREATED",
        toStatus: status,
        text: "Seeded sample task",
      },
    });
    if (status !== "TODO") {
      await db.taskEvent.create({
        data: {
          taskId: task.id,
          actorId: assigneeId ?? admin.id,
          type: "STATUS",
          fromStatus: "TODO",
          toStatus: status,
          text: `Moved to ${status}`,
        },
      });
    }
    if (i % 3 === 0) {
      await db.taskEvent.create({
        data: {
          taskId: task.id,
          actorId: assigneeId ?? admin.id,
          type: "COMMENT",
          text: COMMENT_POOL[i % COMMENT_POOL.length],
        },
      });
    }
  }

  const [projects, plazas, users, tasks] = await Promise.all([
    db.project.count(),
    db.plaza.count(),
    db.user.count(),
    db.task.count(),
  ]);

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ projects, plazas, users, tasks }));
  return { projects, plazas, users, tasks };
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
