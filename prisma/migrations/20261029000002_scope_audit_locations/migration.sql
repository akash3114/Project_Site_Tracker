-- Phase 2: explicit task scope, one source of truth for location data,
-- canonical reference ids, and the master-data audit log.
--
-- 1. Task.scope discriminator + one CHECK per scope kind (replaces the two
--    loose checks from 20261027000000_head_office_task_scope).
-- 2. Plaza loses state/piu/ro: the project is authoritative for location
--    metadata; only the plaza bracket length stays plaza-specific.
-- 3. Reference/catalogue rows (Company, Department, Office, TaskCategory) use
--    stable slug ids owned by the seed. The UPDATEs cascade through FKs
--    (every FK is ON UPDATE CASCADE), so existing rows keep their links.
-- 4. AuditLog records master-data mutations. Task history stays in
--    TaskActivity.

-- 1. Task scope -------------------------------------------------------------
CREATE TYPE "TaskScopeKind" AS ENUM ('PROJECT', 'PLAZA', 'DEPARTMENT', 'HEAD_OFFICE');

ALTER TABLE "Task" DROP CONSTRAINT "Task_scope_at_most_one";
ALTER TABLE "Task" DROP CONSTRAINT "Task_plaza_requires_project";

ALTER TABLE "Task" ADD COLUMN "scope" "TaskScopeKind";

UPDATE "Task"
SET "scope" = CASE
    WHEN "departmentId" IS NOT NULL THEN 'DEPARTMENT'::"TaskScopeKind"
    WHEN "projectId" IS NOT NULL AND "plazaId" IS NOT NULL THEN 'PLAZA'::"TaskScopeKind"
    WHEN "projectId" IS NOT NULL THEN 'PROJECT'::"TaskScopeKind"
    ELSE 'HEAD_OFFICE'::"TaskScopeKind"
END;

ALTER TABLE "Task" ALTER COLUMN "scope" SET NOT NULL;

ALTER TABLE "Task"
  ADD CONSTRAINT "Task_scope_kind_check"
  CHECK (
    ("scope" = 'PROJECT'     AND "projectId" IS NOT NULL AND "plazaId" IS NULL     AND "departmentId" IS NULL) OR
    ("scope" = 'PLAZA'       AND "projectId" IS NOT NULL AND "plazaId" IS NOT NULL AND "departmentId" IS NULL) OR
    ("scope" = 'DEPARTMENT'  AND "projectId" IS NULL     AND "plazaId" IS NULL     AND "departmentId" IS NOT NULL) OR
    ("scope" = 'HEAD_OFFICE' AND "projectId" IS NULL     AND "plazaId" IS NULL     AND "departmentId" IS NULL)
  );

CREATE INDEX "Task_scope_status_dueDate_idx" ON "Task"("scope", "status", "dueDate");

-- 2. Location metadata lives on Project -------------------------------------
ALTER TABLE "Plaza" DROP COLUMN "piu", DROP COLUMN "ro", DROP COLUMN "state";

-- 3. Canonical reference ids ------------------------------------------------
-- Generated rows keep cuid(); catalogue rows get stable slugs so every
-- environment is identical and validation no longer needs a cuid exception.
UPDATE "Department"
SET "id" = 'dept_' || trim(both '-' from regexp_replace(lower("code"), '[^a-z0-9]+', '-', 'g'))
WHERE "id" IS DISTINCT FROM
      'dept_' || trim(both '-' from regexp_replace(lower("code"), '[^a-z0-9]+', '-', 'g'));

UPDATE "Office"
SET "id" = 'office_' || trim(both '-' from regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g'))
WHERE "id" IS DISTINCT FROM
      'office_' || trim(both '-' from regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g'));

UPDATE "Company"
SET "id" = 'company_' || trim(both '-' from regexp_replace(lower("code"), '[^a-z0-9]+', '-', 'g'))
WHERE "id" IS DISTINCT FROM
      'company_' || trim(both '-' from regexp_replace(lower("code"), '[^a-z0-9]+', '-', 'g'));

UPDATE "TaskCategory"
SET "id" = 'cat_' || trim(both '_' from regexp_replace(lower("name"), '[^a-z0-9]+', '_', 'g'))
WHERE "id" IS DISTINCT FROM
      'cat_' || trim(both '_' from regexp_replace(lower("name"), '[^a-z0-9]+', '_', 'g'));

-- 4. Master-data audit ------------------------------------------------------
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_entity_entityId_createdAt_idx" ON "AuditLog"("entity", "entityId", "createdAt");
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
