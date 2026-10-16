import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

import { NHIT_PROJECTS } from './nhit-data';

const db = new PrismaClient();

const hashPw = (s: string) => bcrypt.hash(s, 12);

// ---------------------------------------------------------------------------
// Real masters from docs/NHIT Project List.xlsx (via scripts/parse-nhit.py):
// 28 projects / 46 plazas. Users generated from manager names.
// Default password for generated logins: Tracker@123 (distribute + rotate).
// ---------------------------------------------------------------------------

const DEFAULT_PASSWORD = 'Tracker@123';

function slug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.{2,}/g, '.');
  return base || 'user';
}

// 40 sample task titles, round-robin over plazas (kept per pilot decision).
const TASK_TITLES = [
  'Canopy bolt tightening LHS',
  'Toll booth UPS wiring',
  'Lane marking refresh',
  'CCTV pole alignment',
  'Drain desilting RHS',
  'ETC antenna calibration lane 3',
  'Boom barrier replacement lane 5',
  'Solar panel cleaning canopy',
  'Fire extinguisher refill audit',
  'Signage retro-reflectivity check',
  'Pavement patch near weighbridge',
  'OFC cable splicing chamber 2',
  'UPS battery bank load test',
  'Toll collector cabin AC repair',
  'Lane controller software patch',
  'Weigh-in-motion sensor check',
  'Street light pole painting',
  'Water tank level sensor fix',
  'Server room temperature alert',
  'Intercom testing all booths',
  'Canopy LED strip replacement',
  'Anti-skid surfacing toll island',
  'Barrier boom reflector stickers',
  'DG set fuel top-up and trial run',
  'Fare display board calibration',
  'CCTV NVR storage expansion',
  'Lane 1 loop detector retune',
  'Pedestrian railing welding RHS',
  'Storm water drain cover replacement',
  'Booth glass shutter servicing',
  'Flag mast rope replacement',
  'Solar inverter firmware update',
  'Emergency SOS phone testing',
  'Weighbridge pit cleaning',
  'Toll plaza garden sprinkler repair',
  'Lane signal gantry bolt audit',
  'UPS room exhaust fan install',
  'RFID reader firmware upgrade',
  'Divider kerb painting white-yellow',
  'Night audit cash reconciliation SOP',
];

const TASK_STATUSES = [
  ...Array<string>(20).fill('TODO'),
  ...Array<string>(10).fill('IN_PROGRESS'),
  ...Array<string>(4).fill('BLOCKED'),
  ...Array<string>(6).fill('COMPLETED'),
] as ('TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED')[];

const TASK_PRIORITIES = [
  'MEDIUM',
  'HIGH',
  'LOW',
  'HIGH',
  'MEDIUM',
  'CRITICAL',
  'LOW',
  'MEDIUM',
] as ('LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL')[];

const COMMENT_POOL = [
  'Visited site, work in progress as planned.',
  'Material delivery delayed by a day, catching up.',
  'Verified on ground with shift in-charge.',
  'Noted in site register for record.',
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

async function main(): Promise<{ projects: number; plazas: number; users: number; tasks: number }> {
  if (process.env.SEED_RESET === '1') {
    // Pre-pilot full wipe only (FK-safe order). Default runs never delete.
    await db.taskEvent.deleteMany();
    await db.task.deleteMany();
    await db.userPlazaAccess.deleteMany();
    await db.plaza.deleteMany();
    await db.project.deleteMany();
    await db.user.deleteMany();
  }

  // ---- Projects (upsert by name) ----
  const projectIds: string[] = [];
  for (const p of NHIT_PROJECTS) {
    const project = await db.project.upsert({
      where: { name: p.name },
      update: {
        description: p.round,
        acronym: p.acronym,
        state: p.state,
        round: p.round,
        status: 'ACTIVE',
      },
      create: {
        name: p.name,
        description: p.round,
        acronym: p.acronym,
        state: p.state,
        round: p.round,
        status: 'ACTIVE',
      },
    });
    projectIds.push(project.id);
  }

  // ---- Plazas (upsert by [projectId, name]) ----
  const plazaIds: string[] = [];
  const plazaNames: string[] = [];
  const flatPlazas: { projectIndex: number; plazaIndex: number }[] = [];
  NHIT_PROJECTS.forEach((p, projectIndex) => {
    p.plazas.forEach((z, plazaIndex) => {
      flatPlazas.push({ projectIndex, plazaIndex });
      void z;
    });
  });
  for (let i = 0; i < flatPlazas.length; i++) {
    const { projectIndex, plazaIndex } = flatPlazas[i];
    const z = NHIT_PROJECTS[projectIndex].plazas[plazaIndex];
    const plaza = await db.plaza.upsert({
      where: { projectId_name: { projectId: projectIds[projectIndex], name: z.name } },
      update: {
        lengthKm: z.lengthKm,
        state: z.state,
        piu: z.piu,
        ro: z.ro,
        chainage: null,
        highway: null,
        location: null,
        status: 'ACTIVE',
      },
      create: {
        projectId: projectIds[projectIndex],
        name: z.name,
        lengthKm: z.lengthKm,
        state: z.state,
        piu: z.piu,
        ro: z.ro,
        status: 'ACTIVE',
      },
    });
    plazaIds.push(plaza.id);
    plazaNames.push(z.name);
  }
  const N_PLAZAS = plazaIds.length;

  // ---- Users ----
  const admin = await db.user.upsert({
    where: { email: 'admin@tracker.local' },
    update: { name: 'Tracker Admin', role: 'ADMIN', active: true, passwordHash: await hashPw('Admin@123') },
    create: {
      name: 'Tracker Admin',
      email: 'admin@tracker.local',
      passwordHash: await hashPw('Admin@123'),
      role: 'ADMIN',
      active: true,
    },
  });

  // Collect people: name -> { leadProjects: Set<projectIndex>, plazas: Set<flatIdx> }
  const people = new Map<string, { leadProjects: Set<number>; plazas: Set<number> }>();
  const touch = (name: string) => {
    let e = people.get(name);
    if (!e) {
      e = { leadProjects: new Set(), plazas: new Set() };
      people.set(name, e);
    }
    return e;
  };
  NHIT_PROJECTS.forEach((p, projectIndex) => {
    for (const pm of p.pms) touch(pm).leadProjects.add(projectIndex);
    p.plazas.forEach((z, plazaIndex) => {
      const flatIdx = flatPlazas.findIndex(
        (f) => f.projectIndex === projectIndex && f.plazaIndex === plazaIndex,
      );
      for (const n of [...z.toll, ...z.maintenance, ...z.corridor]) touch(n).plazas.add(flatIdx);
    });
  });

  // Deterministic emails: slug + collision suffixes.
  const usedEmails = new Set<string>(['admin@tracker.local']);
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
  const sortedNames = Array.from(people.keys()).sort((a, b) => a.localeCompare(b));
  for (const name of sortedNames) {
    const info = people.get(name)!;
    const role = info.leadProjects.size > 0 ? 'PROJECT_LEAD' : 'SITE_USER';
    const email = emailFor(name);
    const user = await db.user.upsert({
      where: { email },
      update: { name, role, active: true, passwordHash },
      create: { name, email, passwordHash, role, active: true },
    });
    userIdByName.set(name, user.id);
  }

  // ---- Access ----
  const grant = async (userId: string, flatIdxs: number[]) => {
    await db.userPlazaAccess.deleteMany({ where: { userId } });
    if (flatIdxs.length === 0) return;
    await db.userPlazaAccess.createMany({
      data: Array.from(new Set(flatIdxs)).map((idx) => ({ userId, plazaId: plazaIds[idx] })),
      skipDuplicates: true,
    });
  };
  // Project-index -> flat plaza indices.
  const projectFlatIdx = NHIT_PROJECTS.map((_, pi) =>
    flatPlazas.map((f, idx) => (f.projectIndex === pi ? idx : -1)).filter((idx) => idx >= 0),
  );
  for (const name of Array.from(userIdByName.keys())) {
    const id = userIdByName.get(name)!;
    const info = people.get(name)!;
    const idxs = new Set<number>(Array.from(info.plazas));
    for (const pi of Array.from(info.leadProjects))
      for (const idx of projectFlatIdx[pi]) idxs.add(idx);
    await grant(id, Array.from(idxs));
  }

  // Plaza members for task assignment (prefer toll manager, then others).
  const plazaMembers = new Map<number, string[]>(); // flatIdx -> userIds, toll-first
  NHIT_PROJECTS.forEach((p, projectIndex) => {
    p.plazas.forEach((z, plazaIndex) => {
      const flatIdx = flatPlazas.findIndex(
        (f) => f.projectIndex === projectIndex && f.plazaIndex === plazaIndex,
      );
      const ordered = [...z.toll, ...z.maintenance, ...z.corridor]
        .map((n) => userIdByName.get(n))
        .filter((id): id is string => !!id);
      plazaMembers.set(
        flatIdx,
        Array.from(new Set(ordered)),
      );
    });
  });

  // ---- Tasks (40 sample, deterministic; only missing plazaId+title pairs created) ----
  const existing = await db.task.findMany({ select: { plazaId: true, title: true } });
  const existingKeys = new Set(existing.map((t) => `${t.plazaId}::${t.title}`));

  const now = new Date();
  const plazaCursor = new Map<number, number>();
  for (let i = 0; i < TASK_TITLES.length; i++) {
    const flatIdx = i % N_PLAZAS;
    const plazaId = plazaIds[flatIdx];
    const title = TASK_TITLES[i];
    if (existingKeys.has(`${plazaId}::${title}`)) continue;

    const members = plazaMembers.get(flatIdx) ?? [];
    const cursor = plazaCursor.get(flatIdx) ?? 0;
    const assigneeId = members.length > 0 ? members[cursor % members.length] : null;
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
        completedAt: status === 'COMPLETED' ? now : null,
      },
    });

    await db.taskEvent.create({
      data: {
        taskId: task.id,
        actorId: admin.id,
        type: 'CREATED',
        toStatus: status,
        text: 'Seeded sample task',
      },
    });
    if (status !== 'TODO') {
      await db.taskEvent.create({
        data: {
          taskId: task.id,
          actorId: assigneeId ?? admin.id,
          type: 'STATUS',
          fromStatus: 'TODO',
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
          type: 'COMMENT',
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
