# ACCEPTANCE — Project Site Tracker Pilot (T-042)

> v2 design: `docs/DATABASE.md` is the source of truth (roles ADMIN | MANAGEMENT | MANAGER,
> `project_assignments` / `plaza_assignments`). Seed: 28 projects / 46 plazas / 94 users / 40 tasks.

Tester: ______________  Date: __________  Env: __________ (VM/dev)  Seed: 28/46/94/40

## A. Automated (must all be green)
- [ ] `npm.cmd run lint` clean
- [ ] `npx prisma validate` OK
- [ ] `npm.cmd exec -- tsx scripts/verify-masters-matrix.ts` — 20/20 (run vs dev server)
- [ ] `npm.cmd exec -- tsx scripts/verify-tasks-matrix.ts` — 20/20
- [ ] `BASE=<server> npm.cmd exec -- tsx scripts/verify-regression.ts` — ALL GREEN
- [ ] `docker compose -f docker/compose.yml up -d --build` + `/api/health` 200

## B. Access model (ADMIN | MANAGEMENT | MANAGER)
- [ ] Admin creates a user, assigns the user as **Project Manager** on a project → user sees every plaza of that project
- [ ] Admin/Management assigns **Toll (primary) / Maintenance / Corridor** roles per plaza → user sees those plazas only
- [ ] Revoke a plaza role (untick + save) → the user loses that plaza immediately
- [ ] A `MANAGER` sees exactly the assigned plazas — no more, no fewer; Admin nav is hidden
- [ ] `MANAGEMENT` can add/edit projects and plazas and assign/revoke managers, but cannot open Admin → Users
- [ ] `MANAGER` cannot create/delete projects or plazas, cannot reset passwords, cannot reopen tasks

## C. Task workflow
- [ ] Task created in an allowed plaza → assignee receives it in **My Tasks**
- [ ] Assigning a person without plaza/project access → rejected (422)
- [ ] Status todo → in_progress → blocked → in_progress → completed, each with a feed entry
- [ ] Comment appears as a bubble with author + IST timestamp
- [ ] Completed task locked (edit → 423 message); MANAGEMENT/ADMIN reopens, history intact
- [ ] Overdue highlights red; blocked counts amber on the dashboard; % bars match manual counts
- [ ] No delete control exists for tasks/events anywhere in UI; direct DELETE → 404/405

## D. Dashboards & register
- [ ] MANAGEMENT/ADMIN Portfolio: summary metrics sit at the **bottom** of the page
- [ ] MANAGER workbench: summary metrics sit at the **top** of the page
- [ ] Project register: acronym badge shows the acronym (or `—`), meta line reads `<n> plaza sites · Round <x>`
- [ ] Project register: rows are grouped under **Round 1–4** headings; Completion shows `<%> · <done>/<total>`
- [ ] Round filter + name/acronym search narrow the register and update the "x of y projects" count

## E. Responsive & operations
- [ ] Tablet 768px: tables → cards, tap targets ≥44px, drawer full-width bottom sheet
- [ ] Backup `.gz` created and restored to a scratch DB with matching counts (see `docs/BACKUP.md`)

## F. Sign-off
Issues found: ______. Pilot approved: [ ] yes [ ] no — Initials: ______
