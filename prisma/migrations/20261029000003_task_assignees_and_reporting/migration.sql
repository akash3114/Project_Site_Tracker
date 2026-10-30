-- Task assignees (many-to-many) and the user reporting line.
--
-- Order matters: the existing single `Task.assigneeId` values must be copied
-- into `TaskAssignee` before the column is dropped.

-- CreateTable
CREATE TABLE "TaskAssignee" (
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAssignee_pkey" PRIMARY KEY ("taskId","userId")
);

-- Backfill the existing single assignee into the join table.
INSERT INTO "TaskAssignee" ("taskId", "userId", "assignedAt")
SELECT "id", "assigneeId", "updatedAt"
FROM "Task"
WHERE "assigneeId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "TaskAssignee_userId_taskId_idx" ON "TaskAssignee"("userId", "taskId");

-- AlterTable
ALTER TABLE "User" ADD COLUMN "managerId" TEXT;

-- CreateIndex
CREATE INDEX "User_managerId_idx" ON "User"("managerId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_assigneeId_fkey";

-- DropIndex
DROP INDEX "Task_assigneeId_status_dueDate_idx";

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "assigneeId";
