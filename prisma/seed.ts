import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

import { REAL_PROJECTS } from './real-data';

const db = new PrismaClient();

const hashPw = (s: string) => bcrypt.hash(s, 12);

// ---------------------------------------------------------------------------
// Masters from project_name_export.xlsx (28 projects / 41 plazas).
// Corporate Office rows excluded; one cell = one plaza (comma-split only).
// Chainage/highway/location unknown in source → null.
// ---------------------------------------------------------------------------

const PROJECTS = REAL_PROJECTS.map((p) => ({
  name: p.name,
  status: 'ACTIVE' as const,
  description: `${p.company} (${p.code})`,
}));

interface PlazaSeed {
  projectIndex: number;
  name: string;
}

const PLAZAS: PlazaSeed[] = REAL_PROJECTS.flatMap((p, projectIndex) =>
  p.plazas.map((name) => ({ projectIndex, name })),
);

const N_PLAZAS = PLAZAS.length; // 41

// 40 fixed realistic titles: 20 TODO / 10 IN_PROGRESS / 4 BLOCKED / 6 COMPLETED.
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
  'Photos uploaded to site register for record.',
];

function dueDateFor(index: number, now: Date): Date | null {
  const day = 24 * 60 * 60 * 1000;
  const atMidnightUTC = (t: number) => {
    const d = new Date(t);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  };
  if (index < 10) return atMidnightUTC(now.getTime() - ((index % 7) + 1) * day); // 10 overdue (past 7d)
  if (index < 25) return atMidnightUTC(now.getTime() + ((index % 7) + 1) * day); // 15 due next 7d
  if (index % 2 === 0) return null; // rest null...
  return atMidnightUTC(now.getTime() + (14 + (index % 7)) * day); // ...or future
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
  for (const p of PROJECTS) {
    const project = await db.project.upsert({
      where: { name: p.name },
      update: { status: p.status, description: p.description },
      create: { name: p.name, status: p.status, description: p.description },
    });
    projectIds.push(project.id);
  }

  // ---- Plazas (upsert by [projectId, name]) ----
  const plazaIds: string[] = []; // flat creation order over PLAZAS (41)
  const plazaNames: string[] = [];
  const plazaProjectIdx: number[] = [];
  for (const pl of PLAZAS) {
    const plaza = await db.plaza.upsert({
      where: { projectId_name: { projectId: projectIds[pl.projectIndex], name: pl.name } },
      update: { chainage: null, highway: null, location: null, status: 'ACTIVE' },
      create: {
        projectId: projectIds[pl.projectIndex],
        name: pl.name,
        chainage: null,
        highway: null,
        location: null,
        status: 'ACTIVE',
      },
    });
    plazaIds.push(plaza.id);
    plazaNames.push(pl.name);
    plazaProjectIdx.push(pl.projectIndex);
  }

  // ---- Users (upsert by email, bcrypt cost 12) ----
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

  const leadDefs = [
    { name: 'Lead East', email: 'lead.p1@tracker.local', fromProject: 0, toProject: 10 },
    { name: 'Lead South', email: 'lead.p2@tracker.local', fromProject: 10, toProject: 19 },
    { name: 'Lead West', email: 'lead.p3@tracker.local', fromProject: 19, toProject: 28 },
  ];
  const leadPlazaIdx: number[][] = leadDefs.map((lead) =>
    plazaProjectIdx
      .map((pi, idx) => (pi >= lead.fromProject && pi < lead.toProject ? idx : -1))
      .filter((idx) => idx >= 0),
  );
  const leadIds: string[] = [];
  for (const lead of leadDefs) {
    const user = await db.user.upsert({
      where: { email: lead.email },
      update: { name: lead.name, role: 'PROJECT_LEAD', active: true, passwordHash: await hashPw('Lead@123') },
      create: {
        name: lead.name,
        email: lead.email,
        passwordHash: await hashPw('Lead@123'),
        role: 'PROJECT_LEAD',
        active: true,
      },
    });
    leadIds.push(user.id);
  }

  const siteUserIds: string[] = [];
  for (let i = 1; i <= 23; i++) {
    const nn = String(i).padStart(2, '0');
    const email = `site${nn}@tracker.local`;
    const user = await db.user.upsert({
      where: { email },
      update: {
        name: `Site User ${nn}`,
        role: 'SITE_USER',
        active: true,
        passwordHash: await hashPw('Site@123'),
      },
      create: {
        name: `Site User ${nn}`,
        email,
        passwordHash: await hashPw('Site@123'),
        role: 'SITE_USER',
        active: true,
      },
    });
    siteUserIds.push(user.id);
  }

  // ---- Access ----
  // Leads: all plazas in their project slice (thirds of the 28 projects).
  for (let li = 0; li < leadDefs.length; li++) {
    const ownPlazaIds = leadPlazaIdx[li].map((idx) => plazaIds[idx]);
    await db.userPlazaAccess.deleteMany({ where: { userId: leadIds[li] } });
    await db.userPlazaAccess.createMany({
      data: ownPlazaIds.map((plazaId) => ({ userId: leadIds[li], plazaId })),
      skipDuplicates: true,
    });
  }

  // Site users: siteNN (n = 1..23, i = n-1 zero-based) ->
  // plazas[(i*3)%N, (i*3+1)%N], every 5th (i%5==0) also gets (i*3+2)%N.
  const plazaMembers = new Map<string, string[]>(); // plazaId -> member userIds
  for (const pid of plazaIds) plazaMembers.set(pid, []);
  for (let li = 0; li < leadDefs.length; li++) {
    const ownPlazaIds = leadPlazaIdx[li].map((idx) => plazaIds[idx]);
    for (const pid of ownPlazaIds) plazaMembers.get(pid)!.push(leadIds[li]);
  }
  for (let n = 1; n <= 23; n++) {
    const i = n - 1;
    const idxs = [(i * 3) % N_PLAZAS, (i * 3 + 1) % N_PLAZAS];
    if (i % 5 === 0) idxs.push((i * 3 + 2) % N_PLAZAS);
    const mapped = idxs.map((idx) => plazaIds[idx]);
    await db.userPlazaAccess.deleteMany({ where: { userId: siteUserIds[n - 1] } });
    await db.userPlazaAccess.createMany({
      data: mapped.map((plazaId) => ({ userId: siteUserIds[n - 1], plazaId })),
      skipDuplicates: true,
    });
    for (const pid of mapped) plazaMembers.get(pid)!.push(siteUserIds[n - 1]);
  }

  // Email lookup for deterministic round-robin assignee order.
  const memberEmail = new Map<string, string>();
  const allMemberIds = [...leadIds, ...siteUserIds];
  const usersForEmail = await db.user.findMany({
    where: { id: { in: allMemberIds } },
    select: { id: true, email: true },
  });
  for (const u of usersForEmail) memberEmail.set(u.id, u.email);

  // ---- Tasks (40, deterministic; only missing plazaId+title pairs are created) ----
  const existing = await db.task.findMany({ select: { plazaId: true, title: true } });
  const existingKeys = new Set(existing.map((t) => `${t.plazaId}::${t.title}`));

  const now = new Date();
  const plazaCursor = new Map<string, number>();
  let created = 0;
  for (let i = 0; i < TASK_TITLES.length; i++) {
    const plazaId = plazaIds[i % N_PLAZAS];
    const title = TASK_TITLES[i];
    if (existingKeys.has(`${plazaId}::${title}`)) continue;

    const members = (plazaMembers.get(plazaId) ?? [])
      .slice()
      .sort((a, b) => (memberEmail.get(a) ?? a).localeCompare(memberEmail.get(b) ?? b));
    const cursor = plazaCursor.get(plazaId) ?? 0;
    const assigneeId = members.length > 0 ? members[cursor % members.length] : null;
    plazaCursor.set(plazaId, cursor + 1);

    const status = TASK_STATUSES[i];
    const task = await db.task.create({
      data: {
        plazaId,
        title,
        description: `Seeded sample task ${i + 1}/40: ${title} at ${plazaNames[i % N_PLAZAS]} plaza.`,
        status,
        priority: TASK_PRIORITIES[i % TASK_PRIORITIES.length],
        assigneeId,
        createdById: admin.id,
        dueDate: dueDateFor(i, now),
        completedAt: status === 'COMPLETED' ? now : null,
      },
    });
    created++;

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
  void created;

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
