import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();

const hashPw = (s: string) => bcrypt.hash(s, 12);

// ---------------------------------------------------------------------------
// Dummy masters (TASKS.md §0)
// ---------------------------------------------------------------------------

const PROJECTS = [
  {
    name: 'NH-48 Gujarat Corridor',
    status: 'ACTIVE' as const,
    description: 'Pilot package: 10 plazas on NH-48',
  },
  {
    name: 'NH-27 Saurashtra Stretch',
    status: 'ACTIVE' as const,
    description: 'Pilot package: 10 plazas on NH-27',
  },
  {
    name: 'NH-147 Ahmedabad Ring',
    status: 'ON_HOLD' as const,
    description: 'Pilot package: 8 plazas on NH-147',
  },
];

interface PlazaSeed {
  name: string;
  chainage: string;
  highway: string;
  status: 'ACTIVE' | 'ON_HOLD';
}

// Index 0 -> P1 (NH-48), 1 -> P2 (NH-27), 2 -> P3 (NH-147).
// P3: last two plazas ON_HOLD, rest ACTIVE.
const PLAZAS: PlazaSeed[][] = [
  [
    { name: 'Karjan', chainage: 'KM 123+450', highway: 'NH-48', status: 'ACTIVE' },
    { name: 'Ankleshwar', chainage: 'KM 157+200', highway: 'NH-48', status: 'ACTIVE' },
    { name: 'Bharuch', chainage: 'KM 178+900', highway: 'NH-48', status: 'ACTIVE' },
    { name: 'Narmada', chainage: 'KM 192+300', highway: 'NH-48', status: 'ACTIVE' },
    { name: 'Surat-Kamrej', chainage: 'KM 215+600', highway: 'NH-48', status: 'ACTIVE' },
    { name: 'Navsari', chainage: 'KM 238+100', highway: 'NH-48', status: 'ACTIVE' },
    { name: 'Valsad', chainage: 'KM 256+800', highway: 'NH-48', status: 'ACTIVE' },
    { name: 'Vapi', chainage: 'KM 278+400', highway: 'NH-48', status: 'ACTIVE' },
    { name: 'Palsana', chainage: 'KM 205+000', highway: 'NH-48', status: 'ACTIVE' },
    { name: 'Olpad', chainage: 'KM 198+700', highway: 'NH-48', status: 'ACTIVE' },
  ],
  [
    { name: 'Rajkot-Jetpur', chainage: 'KM 45+200', highway: 'NH-27', status: 'ACTIVE' },
    { name: 'Gondal', chainage: 'KM 62+800', highway: 'NH-27', status: 'ACTIVE' },
    { name: 'Dhoraji', chainage: 'KM 84+100', highway: 'NH-27', status: 'ACTIVE' },
    { name: 'Upleta', chainage: 'KM 98+500', highway: 'NH-27', status: 'ACTIVE' },
    { name: 'Junagadh Bypass', chainage: 'KM 112+300', highway: 'NH-27', status: 'ACTIVE' },
    { name: 'Keshod', chainage: 'KM 128+900', highway: 'NH-27', status: 'ACTIVE' },
    { name: 'Mangrol', chainage: 'KM 145+200', highway: 'NH-27', status: 'ACTIVE' },
    { name: 'Porbandar', chainage: 'KM 168+000', highway: 'NH-27', status: 'ACTIVE' },
    { name: 'Kutiyana', chainage: 'KM 152+400', highway: 'NH-27', status: 'ACTIVE' },
    { name: 'Ranavav', chainage: 'KM 160+700', highway: 'NH-27', status: 'ACTIVE' },
  ],
  [
    { name: 'Sanand', chainage: 'KM 12+300', highway: 'NH-147', status: 'ACTIVE' },
    { name: 'Bavla', chainage: 'KM 28+600', highway: 'NH-147', status: 'ACTIVE' },
    { name: 'Dholka', chainage: 'KM 44+100', highway: 'NH-147', status: 'ACTIVE' },
    { name: 'Bagodara', chainage: 'KM 58+900', highway: 'NH-147', status: 'ACTIVE' },
    { name: 'Vataman', chainage: 'KM 71+200', highway: 'NH-147', status: 'ACTIVE' },
    { name: 'Fedara', chainage: 'KM 82+500', highway: 'NH-147', status: 'ACTIVE' },
    { name: 'Dhandhuka', chainage: 'KM 95+800', highway: 'NH-147', status: 'ON_HOLD' },
    { name: 'Limbdi', chainage: 'KM 110+400', highway: 'NH-147', status: 'ON_HOLD' },
  ],
];

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
  const plazaIds: string[] = []; // creation order: P1 x10, P2 x10, P3 x8 (index 0..27)
  const plazaNames: string[] = [];
  for (let pi = 0; pi < PLAZAS.length; pi++) {
    for (const pl of PLAZAS[pi]) {
      const plaza = await db.plaza.upsert({
        where: { projectId_name: { projectId: projectIds[pi], name: pl.name } },
        update: {
          chainage: pl.chainage,
          highway: pl.highway,
          location: `${pl.name}, Gujarat`,
          status: pl.status,
        },
        create: {
          projectId: projectIds[pi],
          name: pl.name,
          chainage: pl.chainage,
          highway: pl.highway,
          location: `${pl.name}, Gujarat`,
          status: pl.status,
        },
      });
      plazaIds.push(plaza.id);
      plazaNames.push(pl.name);
    }
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
    { name: 'Lead P1', email: 'lead.p1@tracker.local', projectIndex: 0 },
    { name: 'Lead P2', email: 'lead.p2@tracker.local', projectIndex: 1 },
    { name: 'Lead P3', email: 'lead.p3@tracker.local', projectIndex: 2 },
  ];
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
  // Leads: all plazas in own project.
  for (let li = 0; li < leadDefs.length; li++) {
    const ownPlazaIds = plazaIds.slice(leadDefs[li].projectIndex * 10, leadDefs[li].projectIndex * 10 + (leadDefs[li].projectIndex < 2 ? 10 : 8));
    await db.userPlazaAccess.deleteMany({ where: { userId: leadIds[li] } });
    await db.userPlazaAccess.createMany({
      data: ownPlazaIds.map((plazaId) => ({ userId: leadIds[li], plazaId })),
      skipDuplicates: true,
    });
  }

  // Site users: siteNN (n = 1..23, i = n-1 zero-based) ->
  // plazas[(i*3)%28, (i*3+1)%28], every 5th (i%5==0) also gets (i*3+2)%28.
  const plazaMembers = new Map<string, string[]>(); // plazaId -> member userIds
  for (const pid of plazaIds) plazaMembers.set(pid, []);
  for (let li = 0; li < leadDefs.length; li++) {
    const ownPlazaIds = plazaIds.slice(leadDefs[li].projectIndex * 10, leadDefs[li].projectIndex * 10 + (leadDefs[li].projectIndex < 2 ? 10 : 8));
    for (const pid of ownPlazaIds) plazaMembers.get(pid)!.push(leadIds[li]);
  }
  for (let n = 1; n <= 23; n++) {
    const i = n - 1;
    const idxs = [(i * 3) % 28, (i * 3 + 1) % 28];
    if (i % 5 === 0) idxs.push((i * 3 + 2) % 28);
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
    const plazaId = plazaIds[i % 28];
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
        description: `Dummy task ${i + 1}/40: ${title} at ${plazaNames[i % 28]} plaza. Seeded for pilot development.`,
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
        text: 'Seeded dummy task',
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
