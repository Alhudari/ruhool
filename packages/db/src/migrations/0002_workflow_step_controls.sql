ALTER TABLE "workflow_steps" ADD COLUMN "timeout_ms" integer DEFAULT 3600000;--> statement-breakpoint
ALTER TABLE "workflow_steps" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_steps" ADD COLUMN "max_attempts" integer DEFAULT 3 NOT NULL;
