-- Head Office departments.
--
-- Replaces CompanyAssignment(role = HEAD_OFFICE) with HeadOfficeMembership:
-- department membership *is* the Head Office grant. Departments affect no
-- permissions; they are organisational metadata only.
--
-- Everything below runs in one transaction, in this order:
--   1. copy CompanyAssignment aside for the pilot (dropped later)
--   2. create the new tables / columns / foreign keys / partial unique index
--   3. insert the catalogue rows the backfill needs (explicit ids: Prisma's
--      cuid() defaults are client-side, raw SQL must supply ids)
--   4. backfill memberships and office from CompanyAssignment
--   5. drop CompanyAssignment, then its enum
-- Re-run safety: the whole migration is atomic, so a failure leaves both the
-- old table and the backup untouched.

-- 1. Backup (kept for the pilot; a later migration drops it) ----------------
-- `role` is cast to text so the copy does not depend on the CompanyRole type
-- (which is dropped in step 5); the values are preserved verbatim.
CREATE TABLE "_CompanyAssignment_backup" AS
SELECT
    "companyId",
    "userId",
    "role"::text AS "role",
    "assignedById",
    "assignedAt"
FROM "CompanyAssignment";

-- 2. New structure ----------------------------------------------------------
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Office" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Office_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "officeId" TEXT;

CREATE TABLE "HeadOfficeMembership" (
    "userId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HeadOfficeMembership_pkey" PRIMARY KEY ("userId","departmentId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE INDEX "Department_active_idx" ON "Department"("active");

-- CreateIndex
CREATE UNIQUE INDEX "Office_name_key" ON "Office"("name");

-- CreateIndex
CREATE INDEX "HeadOfficeMembership_departmentId_idx" ON "HeadOfficeMembership"("departmentId");

-- Hand-written invariant: exactly one primary department per user. Prisma
-- cannot express a partial unique index, so it lives here only.
CREATE UNIQUE INDEX "HeadOfficeMembership_userId_primary_key"
  ON "HeadOfficeMembership"("userId") WHERE "isPrimary";

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeadOfficeMembership" ADD CONSTRAINT "HeadOfficeMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeadOfficeMembership" ADD CONSTRAINT "HeadOfficeMembership_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Catalogue rows the backfill depends on ---------------------------------
INSERT INTO "Department" ("id", "name", "code", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('dept_admin', 'Admin', 'ADMIN', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "Office" ("id", "name", "city", "active", "createdAt") VALUES
    ('office_delhi', 'Delhi', 'Delhi', true, CURRENT_TIMESTAMP),
    ('office_mumbai', 'Mumbai', 'Mumbai', true, CURRENT_TIMESTAMP);

-- 4. Backfill ---------------------------------------------------------------
-- One primary Admin membership per distinct former HO user (DISTINCT: the old
-- table had one row per company), all based in Delhi. The seed upserts the
-- same Admin department by code, so this row survives.
INSERT INTO "HeadOfficeMembership" ("userId", "departmentId", "isPrimary", "assignedById", "assignedAt")
SELECT DISTINCT "userId", 'dept_admin', true, NULL, CURRENT_TIMESTAMP
FROM "CompanyAssignment";

UPDATE "User"
SET "officeId" = 'office_delhi'
WHERE "id" IN (SELECT "userId" FROM "CompanyAssignment");

-- 5. Remove the superseded model -------------------------------------------
-- DropForeignKey
ALTER TABLE "CompanyAssignment" DROP CONSTRAINT "CompanyAssignment_companyId_fkey";

-- DropForeignKey
ALTER TABLE "CompanyAssignment" DROP CONSTRAINT "CompanyAssignment_userId_fkey";

-- DropTable
DROP TABLE "CompanyAssignment";

-- DropEnum
DROP TYPE "CompanyRole";
