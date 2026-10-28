-- Head Office departments become a task location.
--
-- A task now belongs to exactly one scope: a project (optionally a plaza) or
-- Head Office (optionally a department). "Head Office level" is represented by
-- both projectId and departmentId being NULL. Prisma cannot express CHECK
-- constraints, so the two scope invariants are hand-written here:
--   * Task_scope_at_most_one       -> never both projectId and departmentId
--   * Task_plaza_requires_project  -> a plaza task always has its project
--
-- Existing rows are all project-scoped (projectId NOT NULL), so they satisfy
-- both constraints without a backfill. Re-run safety: the whole migration is
-- atomic; ALTER COLUMN ... DROP NOT NULL is idempotent in effect, the rest
-- fails cleanly and rolls back if the objects already exist.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "title" TEXT;

-- AlterTable
ALTER TABLE "Task" ALTER COLUMN "projectId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "departmentId" TEXT;

-- Scope invariants (hand-written: Prisma cannot express CHECK) --------------
ALTER TABLE "Task"
  ADD CONSTRAINT "Task_scope_at_most_one"
  CHECK (NOT ("projectId" IS NOT NULL AND "departmentId" IS NOT NULL));

ALTER TABLE "Task"
  ADD CONSTRAINT "Task_plaza_requires_project"
  CHECK ("plazaId" IS NULL OR "projectId" IS NOT NULL);

-- AddForeignKey
ALTER TABLE "Task"
  ADD CONSTRAINT "Task_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Task_departmentId_status_idx" ON "Task"("departmentId", "status");
