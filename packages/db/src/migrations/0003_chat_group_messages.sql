-- CHAT_V2 P1: per-agent message bubbles + workflow↔conversation bridge columns.
-- Adds message kind + workflow/thread linkage + conversation participant set.
-- Back-compat: all new columns nullable or defaulted; legacy rows read as kind='text'.

ALTER TABLE "messages" ADD COLUMN "kind" varchar(20) DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "workflow_step_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "reply_to_agent_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "artifacts_json" jsonb;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "participant_agent_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
