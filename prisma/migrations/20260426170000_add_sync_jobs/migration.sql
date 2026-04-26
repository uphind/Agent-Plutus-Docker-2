-- Live progress tracker for long-running syncs (directory pull, provider
-- usage backfill, etc.). Powers the "syncing… 47%" row in the notification
-- bell so admins see something is happening without tailing container logs.
CREATE TABLE "sync_jobs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sync_jobs_org_id_status_started_at_idx"
    ON "sync_jobs"("org_id", "status", "started_at");

ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
