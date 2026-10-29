# ACCEPTANCE — Project Site Tracker Pilot

> Source of truth: `docs/DATABASE.md`. Hierarchy: **Company → Project → Plaza**, plus **Head Office → Department** as a parallel task scope.
> Seed: 3 companies / 28 projects / 46 plazas / 18 departments / 2 offices / 112 users / 47 tasks.

Tester: ______________  Date: __________  Env: __________ (VM/dev)  Seed: 3/28/46/18/2/112/47

## A. Automated (must all be green)
- [ ] `npm.cmd run lint` clean
- [ ] `npm.cmd exec -- prisma validate` OK
- [ ] `npx.cmd tsc --noEmit` clean
- [ ] `npm.cmd run build` succeeds
- [ ] `node scripts/smoke-api.mjs` — 55/55 (run against a dev server; `SMOKE_BASE_URL` to change it)
- [ ] `docker compose -f docker/compose.yml up -d --build` + `/api/health` 200

## B. Access model (Admin | Head Office | Project Manager | Site Manager)
- [ ] Admin adds a **Head Office department membership** (Access page) → the user sees every company and project and the header badge reads `Head Office · <department>` (e.g. `Head Office · Secretarial`)
- [ ] Admin/Head Office assigns a **Project Manager** on a project → the user sees the project and all its plazas and can create project- and plaza-level tasks
- [ ] Admin/Head Office assigns **Toll (primary) / Maintenance / Corridor** roles per plaza → the user sees only those plazas
- [ ] A site manager sees a project-level task only when assigned to it
- [ ] Revoking a project/plaza assignment removes the corresponding access immediately; removing a department membership drops the user out of Head Office, including when it is their **last** membership (role falls back to project manager / plaza scope)
- [ ] Department membership is global: an HO user whose primary department is Treasury can open a task in every company (NEPPL, NSPPL, NWPPL); changing their primary department changes only the header badge, not access
- [ ] Choosing a department or changing the primary never changes project management, task or reopen-approval permissions; the department membership itself is the Head Office grant
- [ ] `HEAD_OFFICE` can manage projects, plazas and Head Office memberships, but cannot open **Admin → Users**
- [ ] A Project Manager/site manager cannot create or archive projects/plazas, manage users, or reopen a task directly
- [ ] A person holding multiple assignments sees the union of their scopes; effective role is Admin > HO > PM > site manager
- [ ] Admin → Users shows Department and Office for Head Office people; the Access page groups HO members by department and can add/remove a membership with the role flipping on the next request (no re-login)
- [ ] Admin → Users can create or edit a **Job title** (e.g. `Operations Manager`); the assignee picker uses it as the role label instead of the derived default

## C. Task workflow
- [ ] Project-level task created → visible to Admin/HO/PM; site managers see it only when assigned
- [ ] Plaza-level task created → visible to people assigned to that plaza
- [ ] **Head Office task** created at Head Office level (no project, no department) or on a department → visible to every Admin/HO; a PM/site manager sees it only when assigned
- [ ] Head Office tasks show the `HO` badge and department tag in the management canvas and a `Head Office › <department>` breadcrumb in the drawer
- [ ] Management composer selects multiple scopes (projects, plazas, departments, Head Office) and creates one task per scope in a single submit; the assignee picker is enabled only for a single scope
- [ ] Scope filter accepts multiple scopes, shows removable chips with `+N` overflow, and the Head Office facet narrows to HO work
- [ ] Group by **Department** groups HO tasks by department and leaves project work in a Projects lane
- [ ] Assignee picker shows `Role | Context` (e.g. `Toll Manager | AP Plaza`, `Operations Manager | Head Office · Delhi`) and searches by name, role, project, plaza or department; the current viewer is pinned as "Assign to me"
- [ ] No "Recent" section appears in the scope or assignee pickers
- [ ] Assignee dropdown lists only people associated with the selected project, plaza or department (plus yourself) and refreshes when the scope changes
- [ ] Assignee rows show designation/context first and the person's name second
- [ ] The scope picker's bulk actions (`Select all projects`, `Select all HO departments`, `Clear`, `N selected`) sit at the top of the dropdown, above the scrolling list
- [ ] `Select all HO departments` selects the department rows only; the Head Office level row is a separate scope and is never bulk-selected
- [ ] Assignment ceiling enforced at the API: PM may assign site managers/PMs in the project plus HO/Admin; site manager may assign site managers/PM and never HO/Admin
- [ ] Picker shows only scope-associated people, so ceiling-eligible HO/Admin accounts are not offered in a project scope
- [ ] PM/site manager cannot (re)assign a Head Office task; Admin/HO can
- [ ] Status todo → in_progress → blocked → in_progress → completed, each with a feed entry
- [ ] Comment appears as a bubble with author + IST timestamp; photos/PDFs can be attached to a task or a comment
- [ ] Completed task locked for core edits and reassignment (edit → 423); comments and photos remain allowed
- [ ] PM/site manager submits a reopen request with a mandatory reason; only one request may be pending
- [ ] Head Office/Admin approves or rejects the request; approval returns the task to **in_progress** and history stays intact
- [ ] Head Office/Admin can reopen a completed task directly (also to **in_progress**)
- [ ] Overdue highlights red; blocked counts amber on the dashboard; % bars match manual counts
- [ ] No delete control exists for tasks/events anywhere in UI; direct DELETE → 404/405

## D. Dashboards & registers
- [ ] Project/workbench snapshots show company, project and plaza counts
- [ ] Project register groups projects under their company and shows Active/Archived (no lifecycle completion state)
- [ ] Project detail shows company, code, round, state, length, PIU/RO and the plaza list
- [ ] Project detail lists project-level tasks (plaza = null) separately from plaza tasks
- [ ] Search/filters narrow the task list and update the visible count
- [ ] Projects rail pins a Head Office block (All Head Office + per-department rows) and its summary reads `28 projects · 18 departments · X open`
- [ ] Insights shows a Head Office card with member counts, open work and per-department progress
- [ ] Admin → Categories can create, rename and deactivate task categories

## E. Responsive & operations
- [ ] Tablet 768px: tables → cards, tap targets ≥44px, drawer full-width bottom sheet
- [ ] Backup `.gz` created and restored to a scratch DB with matching counts (see `docs/BACKUP.md`)

## F. Sign-off
Issues found: ______. Pilot approved: [ ] yes [ ] no — Initials: ______
