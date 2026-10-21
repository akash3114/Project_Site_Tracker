# ACCEPTANCE — Project Site Tracker Pilot

> Source of truth: `docs/DATABASE.md`. Hierarchy: **Company → Project → Plaza**.
> Seed: 3 companies / 28 projects / 46 plazas / 94 users / 41 tasks.

Tester: ______________  Date: __________  Env: __________ (VM/dev)  Seed: 3/28/46/94/41

## A. Automated (must all be green)
- [ ] `npm.cmd run lint` clean
- [ ] `npm.cmd exec -- prisma validate` OK
- [ ] `npx.cmd tsc --noEmit` clean
- [ ] `npm.cmd run build` succeeds
- [ ] `node scripts/smoke-api.mjs` — 23/23 (run against a dev server; `SMOKE_BASE_URL` to change it)
- [ ] `docker compose -f docker/compose.yml up -d --build` + `/api/health` 200

## B. Access model (Admin | Head Office | Project Manager | Site Manager)
- [ ] Admin creates a user and assigns **Head Office** on a company → the user sees every company/project in the portfolio
- [ ] Admin/Head Office assigns a **Project Manager** on a project → the user sees the project and all its plazas and can create project- and plaza-level tasks
- [ ] Admin/Head Office assigns **Toll (primary) / Maintenance / Corridor** roles per plaza → the user sees only those plazas
- [ ] A site manager sees a project-level task only when assigned to it
- [ ] Revoking a company/project/plaza assignment removes the corresponding access immediately
- [ ] `HEAD_OFFICE` can manage projects, plazas, categories and assignments, but cannot open **Admin → Users**
- [ ] A Project Manager/site manager cannot create or archive projects/plazas, manage users, or reopen a task directly
- [ ] A person holding multiple assignments sees the union of their scopes; effective role is Admin > HO > PM > site manager

## C. Task workflow
- [ ] Project-level task created → visible to Admin/HO/PM; site managers see it only when assigned
- [ ] Plaza-level task created → visible to people assigned to that plaza
- [ ] Assignment ceiling enforced: PM may assign site managers/PMs in the project plus HO/Admin; site manager may assign site managers/PM and never HO/Admin
- [ ] Status todo → in_progress → blocked → in_progress → completed, each with a feed entry
- [ ] Comment appears as a bubble with author + IST timestamp; photos/PDFs can be attached to a task or a comment
- [ ] Completed task locked for core edits and reassignment (edit → 423); comments and photos remain allowed
- [ ] PM/site manager submits a reopen request with a mandatory reason; only one request may be pending
- [ ] Head Office/Admin approves or rejects the request; approval returns the task to **in_progress** and history stays intact
- [ ] Head Office/Admin can reopen a completed task directly (also to **in_progress**)
- [ ] Overdue highlights red; blocked counts amber on the dashboard; % bars match manual counts
- [ ] No delete control exists for tasks/events anywhere in UI; direct DELETE → 404/405

## D. Dashboards & registers
- [ ] Portfolio/workbench snapshots show company, project and plaza counts
- [ ] Project register groups projects under their company and shows Active/Archived (no lifecycle completion state)
- [ ] Project detail shows company, code, round, state, length, PIU/RO and the plaza list
- [ ] Project detail lists project-level tasks (plaza = null) separately from plaza tasks
- [ ] Search/filters narrow the task list and update the visible count
- [ ] Admin → Categories can create, rename and deactivate task categories

## E. Responsive & operations
- [ ] Tablet 768px: tables → cards, tap targets ≥44px, drawer full-width bottom sheet
- [ ] Backup `.gz` created and restored to a scratch DB with matching counts (see `docs/BACKUP.md`)

## F. Sign-off
Issues found: ______. Pilot approved: [ ] yes [ ] no — Initials: ______
