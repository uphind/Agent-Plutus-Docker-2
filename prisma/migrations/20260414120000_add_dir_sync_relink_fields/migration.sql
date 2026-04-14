-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "dir_sync_interval_hours" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "organizations" ADD COLUMN "relink_interval_hours" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "organizations" ADD COLUMN "last_relink_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "usage_records" ADD COLUMN "user_ref" TEXT;
