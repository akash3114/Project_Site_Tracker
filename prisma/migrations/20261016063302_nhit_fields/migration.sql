-- AlterTable
ALTER TABLE "Plaza" ADD COLUMN     "lengthKm" DOUBLE PRECISION,
ADD COLUMN     "piu" TEXT,
ADD COLUMN     "ro" TEXT,
ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "acronym" TEXT,
ADD COLUMN     "round" TEXT,
ADD COLUMN     "state" TEXT;
