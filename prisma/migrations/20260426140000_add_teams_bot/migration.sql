-- Extend AlertChannelKind with Teams variants
ALTER TYPE "AlertChannelKind" ADD VALUE IF NOT EXISTS 'teams_webhook';
ALTER TYPE "AlertChannelKind" ADD VALUE IF NOT EXISTS 'teams_bot';

-- CreateTable
CREATE TABLE "teams_bot_settings" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "microsoft_app_id" TEXT NOT NULL,
    "microsoft_app_password_encrypted" TEXT NOT NULL,
    "tenant_id" TEXT,
    "public_base_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_bot_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teams_bot_settings_org_id_key" ON "teams_bot_settings"("org_id");

-- AddForeignKey
ALTER TABLE "teams_bot_settings" ADD CONSTRAINT "teams_bot_settings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "teams_conversations" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "conversation_type" TEXT NOT NULL,
    "display_name" TEXT,
    "team_name" TEXT,
    "tenant_id" TEXT,
    "service_url" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL DEFAULT 'msteams',
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teams_conversations_org_id_idx" ON "teams_conversations"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "teams_conversations_org_id_conversation_id_key" ON "teams_conversations"("org_id", "conversation_id");

-- AddForeignKey
ALTER TABLE "teams_conversations" ADD CONSTRAINT "teams_conversations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
