-- Office.updatedAt was added with a temporary default so existing rows could be
-- backfilled in the integrity migration. Prisma manages @updatedAt from the
-- client, so drop the default to match every other table.
ALTER TABLE "Office" ALTER COLUMN "updatedAt" DROP DEFAULT;
