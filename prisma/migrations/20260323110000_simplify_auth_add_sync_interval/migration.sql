-- AlterTable
ALTER TABLE "organizations" DROP COLUMN "api_key_hash",
ADD COLUMN     "sync_interval_hours" INTEGER NOT NULL DEFAULT 6;
