-- CreateEnum
CREATE TYPE "AutomationStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DRAFT');

-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('COMMENT', 'DM_KEYWORD', 'STORY_REPLY', 'STORY_MENTION', 'DEFAULT_REPLY');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'WAITING_BUTTON', 'WAITING_INPUT', 'WAITING_DELAY', 'WAITING_INBOUND', 'DONE', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('TRIGGERED', 'MESSAGE_SENT', 'MESSAGE_FAILED', 'BUTTON_CLICK', 'LINK_CLICK', 'INPUT_CAPTURED', 'FOLLOW_GATE_PASSED', 'FOLLOW_GATE_BLOCKED', 'PUBLIC_REPLY', 'BREVO_SYNCED', 'RUN_FINISHED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "ig_user_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT,
    "profile_picture_url" TEXT,
    "access_token_enc" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3) NOT NULL,
    "token_refreshed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "webhook_subscribed_at" TIMESTAMP(3),
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "igsid" TEXT NOT NULL,
    "username" TEXT,
    "name" TEXT,
    "profile_pic" TEXT,
    "follower_count" INTEGER,
    "follows_us" BOOLEAN,
    "profile_fetched_at" TIMESTAMP(3),
    "email" TEXT,
    "phone" TEXT,
    "fields" JSONB NOT NULL DEFAULT '{}',
    "source" TEXT,
    "last_inbound_at" TIMESTAMP(3),
    "last_outbound_at" TIMESTAMP(3),
    "automation_paused" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_tags" (
    "contact_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_tags_pkey" PRIMARY KEY ("contact_id","tag_id")
);

-- CreateTable
CREATE TABLE "automations" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AutomationStatus" NOT NULL DEFAULT 'DRAFT',
    "trigger_type" "TriggerType" NOT NULL,
    "trigger_config" JSONB NOT NULL,
    "flow" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow_runs" (
    "id" TEXT NOT NULL,
    "automation_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "current_node_id" TEXT,
    "comment_id" TEXT,
    "comment_created_at" TIMESTAMP(3),
    "private_reply_used" BOOLEAN NOT NULL DEFAULT false,
    "state" JSONB NOT NULL DEFAULT '{}',
    "waiting_until" TIMESTAMP(3),
    "error" TEXT,
    "step_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "flow_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "direction" "Direction" NOT NULL,
    "mid" TEXT,
    "kind" TEXT NOT NULL,
    "text" TEXT,
    "payload" JSONB,
    "run_id" TEXT,
    "automation_id" TEXT,
    "external" BOOLEAN NOT NULL DEFAULT false,
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "media_product_type" TEXT,
    "from_igsid" TEXT NOT NULL,
    "from_username" TEXT,
    "text" TEXT NOT NULL,
    "parent_id" TEXT,
    "automation_id" TEXT,
    "public_reply_id" TEXT,
    "public_reply_text" TEXT,
    "public_reply_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "automation_id" TEXT,
    "contact_id" TEXT,
    "run_id" TEXT,
    "node_id" TEXT,
    "type" "EventType" NOT NULL,
    "meta" JSONB,
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracked_links" (
    "id" TEXT NOT NULL,
    "automation_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "button_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracked_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "lock_key" TEXT,
    "locked_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_ig_user_id_key" ON "accounts"("ig_user_id");

-- CreateIndex
CREATE INDEX "contacts_account_id_last_inbound_at_idx" ON "contacts"("account_id", "last_inbound_at");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_account_id_igsid_key" ON "contacts"("account_id", "igsid");

-- CreateIndex
CREATE UNIQUE INDEX "tags_account_id_name_key" ON "tags"("account_id", "name");

-- CreateIndex
CREATE INDEX "automations_account_id_trigger_type_status_idx" ON "automations"("account_id", "trigger_type", "status");

-- CreateIndex
CREATE INDEX "flow_runs_contact_id_status_idx" ON "flow_runs"("contact_id", "status");

-- CreateIndex
CREATE INDEX "flow_runs_automation_id_created_at_idx" ON "flow_runs"("automation_id", "created_at");

-- CreateIndex
CREATE INDEX "flow_runs_status_waiting_until_idx" ON "flow_runs"("status", "waiting_until");

-- CreateIndex
CREATE UNIQUE INDEX "messages_mid_key" ON "messages"("mid");

-- CreateIndex
CREATE INDEX "messages_contact_id_created_at_idx" ON "messages"("contact_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_account_id_created_at_idx" ON "messages"("account_id", "created_at");

-- CreateIndex
CREATE INDEX "comments_account_id_created_at_idx" ON "comments"("account_id", "created_at");

-- CreateIndex
CREATE INDEX "comments_media_id_idx" ON "comments"("media_id");

-- CreateIndex
CREATE INDEX "events_account_id_type_created_at_idx" ON "events"("account_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "events_automation_id_type_idx" ON "events"("automation_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "tracked_links_automation_id_node_id_button_id_url_key" ON "tracked_links"("automation_id", "node_id", "button_id", "url");

-- CreateIndex
CREATE INDEX "webhook_events_received_at_idx" ON "webhook_events"("received_at");

-- CreateIndex
CREATE INDEX "jobs_status_run_at_idx" ON "jobs"("status", "run_at");

-- CreateIndex
CREATE INDEX "jobs_lock_key_status_idx" ON "jobs"("lock_key", "status");

-- CreateIndex
CREATE INDEX "login_attempts_ip_created_at_idx" ON "login_attempts"("ip", "created_at");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "flow_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracked_links" ADD CONSTRAINT "tracked_links_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
