CREATE TABLE "reading_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"paper_id" text NOT NULL,
	"paper_title" text NOT NULL,
	"paper_meta" jsonb,
	"source" varchar(20) NOT NULL,
	"language" varchar(2) DEFAULT 'en',
	"mind_override" text,
	"total_pages" integer DEFAULT 0 NOT NULL,
	"current_page" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'active',
	"total_cost" numeric(10, 4) DEFAULT '0',
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "page_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"parent_version_id" uuid,
	"main_idea" text,
	"table_data" text,
	"library_link" jsonb,
	"phd_relevance" text,
	"tags" jsonb,
	"highlights" jsonb,
	"question" text,
	"refinement_request" text,
	"model_used" text,
	"token_cost" numeric(10, 6),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "participant_agent_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "kind" varchar(20) DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "workflow_step_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "reply_to_agent_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "artifacts_json" jsonb;--> statement-breakpoint
ALTER TABLE "workflow_steps" ADD COLUMN "timeout_ms" integer DEFAULT 3600000;--> statement-breakpoint
ALTER TABLE "workflow_steps" ADD COLUMN "attempt_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "workflow_steps" ADD COLUMN "max_attempts" integer DEFAULT 3;--> statement-breakpoint
ALTER TABLE "page_analyses" ADD CONSTRAINT "page_analyses_session_id_reading_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."reading_sessions"("id") ON DELETE no action ON UPDATE no action;