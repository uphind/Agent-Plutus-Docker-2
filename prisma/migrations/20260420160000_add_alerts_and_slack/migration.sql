-- CreateEnum
CREATE TYPE "AlertChannelKind" AS ENUM ('email_smtp', 'slack_webhook', 'slack_bot');

-- CreateEnum
CREATE TYPE "AlertTriggerKind" AS ENUM (
    'over_budget',
    'budget_warning',
    'anomaly',
    'inactive_user',
    'cost_spike',
    'no_budget',
    'high_cost_model',
    'underutilized',
    'sync_failure',
    'daily_digest',
    'weekly_digest'
);

-- CreateTable
CREATE TABLE "alert_channels" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "kind" "AlertChannelKind" NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_channels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alert_channels_org_id_idx" ON "alert_channels"("org_id");

-- AddForeignKey
ALTER TABLE "alert_channels" ADD CONSTRAINT "alert_channels_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "alert_rules" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" "AlertTriggerKind" NOT NULL,
    "filter" JSONB NOT NULL DEFAULT '{}',
    "channel_ids" TEXT[],
    "recipients" JSONB NOT NULL DEFAULT '[]',
    "throttle_hours" INTEGER NOT NULL DEFAULT 24,
    "mute_until" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alert_rules_org_id_trigger_idx" ON "alert_rules"("org_id", "trigger");

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "alert_deliveries" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "rule_id" TEXT,
    "channel_id" TEXT,
    "trigger" "AlertTriggerKind" NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "recipient" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alert_deliveries_org_id_rule_id_trigger_entity_id_created_at_idx"
    ON "alert_deliveries"("org_id", "rule_id", "trigger", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "alert_deliveries_org_id_created_at_idx" ON "alert_deliveries"("org_id", "created_at");

-- AddForeignKey
ALTER TABLE "alert_deliveries" ADD CONSTRAINT "alert_deliveries_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "slack_installations" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "team_name" TEXT NOT NULL,
    "bot_user_id" TEXT NOT NULL,
    "bot_token_encrypted" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "installed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slack_installations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "slack_installations_org_id_key" ON "slack_installations"("org_id");

-- AddForeignKey
ALTER TABLE "slack_installations" ADD CONSTRAINT "slack_installations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
