-- Complete the Head Office department catalogue.
--
-- `20261023000000_head_office_departments` inserts only the `Admin` department:
-- that migration seeds the backfill, which puts every former CompanyAssignment
-- user into `dept_admin` as their primary department. The remaining 17 rows
-- are created by `prisma/seed.ts` in seeded environments.
--
-- This migration completes the catalogue for databases that are migrated but
-- not seeded (e.g. a pilot upgrade without `SEED_RESET=1`). The seed already
-- created every department, so on a seeded database every insert here is a
-- no-op: conflict target is the unique `code`, and the ids were chosen to match
-- the seed's `dept_<code-lower>` convention. `ON CONFLICT DO NOTHING` also
-- preserves any existing row (and its id) an operator may have renamed.
INSERT INTO "Department" ("id", "name", "code", "sortOrder", "active", "createdAt", "updatedAt")
VALUES
    ('dept_admin', 'Admin', 'ADMIN', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('dept_bms', 'BMS', 'BMS', 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('dept_ehs', 'EHS', 'EHS', 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('dept_fin', 'Finance & Accounts', 'FIN', 6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('dept_hr-ld', 'HR - Learning & Development', 'HR-LD', 7, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('dept_hr-comp', 'HR-Compliance', 'HR-COMP', 8, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('dept_hr-rp', 'HR-Recruitment & Payroll', 'HR-RP', 9, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('dept_mmr', 'Initial Improvement/MMR', 'MMR', 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('dept_ia', 'Internal Audit', 'IA', 11, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('dept_inv', 'Investment & Acquisitions', 'INV', 12, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('dept_it', 'IT', 'IT', 13, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('dept_its', 'ITS', 'ITS', 14, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('dept_legal', 'Legal', 'LEGAL', 15, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('dept_maint', 'Maintenance', 'MAINT', 16, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('dept_ops', 'Operations', 'OPS', 17, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('dept_proc', 'Procurement', 'PROC', 18, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('dept_sec', 'Secretarial', 'SEC', 19, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('dept_treas', 'Treasury', 'TREAS', 20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
