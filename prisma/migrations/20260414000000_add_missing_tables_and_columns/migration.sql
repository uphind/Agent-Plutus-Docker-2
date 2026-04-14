-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('budget_alert', 'anomaly', 'sync_failure', 'idle_seat', 'suggestion');

-- CreateTable: notifications
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable: cursor_dau
CREATE TABLE "cursor_dau" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dau_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cursor_dau_pkey" PRIMARY KEY ("id")
);

-- CreateTable: terminology_overrides
CREATE TABLE "terminology_overrides" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "system_term" TEXT NOT NULL,
    "custom_term" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terminology_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable: graph_configs
CREATE TABLE "graph_configs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "encrypted_secret" TEXT NOT NULL,
    "graph_endpoint" TEXT NOT NULL DEFAULT 'https://graph.microsoft.com/v1.0',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "graph_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: field_mappings
CREATE TABLE "field_mappings" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "source_field" TEXT NOT NULL,
    "target_field" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable: benchmark_snapshots
CREATE TABLE "benchmark_snapshots" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "company_size" TEXT NOT NULL,
    "median_cost_per_dev" DECIMAL(12,2) NOT NULL,
    "median_accept_rate" DECIMAL(5,4) NOT NULL,
    "median_cost_per_line" DECIMAL(12,6) NOT NULL,
    "provider_mix" JSONB NOT NULL,
    "sample_size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "benchmark_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable: chargeback_reports
CREATE TABLE "chargeback_reports" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data" JSONB NOT NULL,
    "total_cost" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "chargeback_reports_pkey" PRIMARY KEY ("id")
);

-- AlterTable: usage_records — add missing columns
ALTER TABLE "usage_records" ADD COLUMN "api_key_id" TEXT;
ALTER TABLE "usage_records" ADD COLUMN "input_audio_tokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "usage_records" ADD COLUMN "output_audio_tokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "usage_records" ADD COLUMN "is_batch" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: org_users — add missing columns
ALTER TABLE "org_users" ADD COLUMN "monthly_budget" DECIMAL(12,2);
ALTER TABLE "org_users" ADD COLUMN "alert_threshold" INTEGER NOT NULL DEFAULT 80;

-- AlterTable: departments — add missing columns
ALTER TABLE "departments" ADD COLUMN "cost_center" TEXT;
ALTER TABLE "departments" ADD COLUMN "gl_code" TEXT;

-- CreateIndex: notifications
CREATE INDEX "notifications_org_id_is_read_created_at_idx" ON "notifications"("org_id", "is_read", "created_at");

-- CreateIndex: cursor_dau
CREATE UNIQUE INDEX "cursor_dau_org_id_date_key" ON "cursor_dau"("org_id", "date");
CREATE INDEX "cursor_dau_org_id_idx" ON "cursor_dau"("org_id");

-- CreateIndex: terminology_overrides
CREATE UNIQUE INDEX "terminology_overrides_org_id_system_term_key" ON "terminology_overrides"("org_id", "system_term");
CREATE INDEX "terminology_overrides_org_id_idx" ON "terminology_overrides"("org_id");

-- CreateIndex: graph_configs
CREATE UNIQUE INDEX "graph_configs_org_id_key" ON "graph_configs"("org_id");

-- CreateIndex: field_mappings
CREATE UNIQUE INDEX "field_mappings_org_id_entity_type_target_field_key" ON "field_mappings"("org_id", "entity_type", "target_field");
CREATE INDEX "field_mappings_org_id_idx" ON "field_mappings"("org_id");

-- CreateIndex: benchmark_snapshots
CREATE UNIQUE INDEX "benchmark_snapshots_date_company_size_key" ON "benchmark_snapshots"("date", "company_size");

-- CreateIndex: chargeback_reports
CREATE INDEX "chargeback_reports_org_id_month_idx" ON "chargeback_reports"("org_id", "month");

-- CreateIndex: usage_records dedup constraint
CREATE UNIQUE INDEX "usage_dedup" ON "usage_records"("org_id", "user_id", "provider", "model", "date");

-- AddForeignKey: notifications
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: cursor_dau
ALTER TABLE "cursor_dau" ADD CONSTRAINT "cursor_dau_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: terminology_overrides
ALTER TABLE "terminology_overrides" ADD CONSTRAINT "terminology_overrides_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: graph_configs
ALTER TABLE "graph_configs" ADD CONSTRAINT "graph_configs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: field_mappings
ALTER TABLE "field_mappings" ADD CONSTRAINT "field_mappings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
