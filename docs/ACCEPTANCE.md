# ACCEPTANCE — Project Site Tracker Pilot (T-042)

Tester: ______________  Date: __________  Env: __________ (VM/dev)  Seed: 3/28/27/40

## A. Automated (must all be green)
- [ ] `npm.cmd run lint` clean
- [ ] `npx prisma validate` OK
- [ ] `npm.cmd exec -- tsx scripts/verify-masters-matrix.ts` — 18/18 (run vs dev server)
- [ ] `npm.cmd exec -- tsx scripts/verify-tasks-matrix.ts` — 20/20
- [ ] `BASE=<server> npm.cmd exec -- tsx scripts/verify-regression.ts` — ALL GREEN
- [ ] `docker compose -f docker/compose.yml up -d --build` + `/api/health` 200

## B. Manual walkthrough (5 pilot users minimum)
- [ ] Admin creates user, maps to 2 plazas; site user sees exactly those 2
- [ ] Engineer creates task in allowed plaza → assignee gets it in My Tasks
- [ ] Status todo → in_progress → blocked → in_progress → completed, each with feed entry
- [ ] Comment appears as bubble with author + IST timestamp
- [ ] Completed task locked (edit → 423 message); lead reopens, history intact
- [ ] Overdue highlights red; blocked counts amber on dashboard; % bars match manual count
- [ ] No delete control exists for tasks/events anywhere in UI; direct DELETE → 404/405
- [ ] Tablet 768px: tables → cards, targets ≥44px, drawer full-width bottom sheet
- [ ] Backup `.gz` created and restored to scratch DB with matching counts

## C. Sign-off
Issues found: ______. Pilot approved: [ ] yes [ ] no — Initials: ______
