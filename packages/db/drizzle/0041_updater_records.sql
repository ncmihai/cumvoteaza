CREATE TABLE "data_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"source_url" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "updater_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text DEFAULT 'catch_up' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"requested_by" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"run_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "updater_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"trigger" text NOT NULL,
	"worker_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"git_sha" text,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"held" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"issue_url" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "worker_heartbeats" (
	"worker_id" text PRIMARY KEY NOT NULL,
	"host" text NOT NULL,
	"version" text,
	"state" text DEFAULT 'idle' NOT NULL,
	"current_run_id" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "data_revisions_entity_idx" ON "data_revisions" USING btree ("entity_type","entity_id","recorded_at");--> statement-breakpoint
CREATE INDEX "data_revisions_run_idx" ON "data_revisions" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "updater_jobs_status_idx" ON "updater_jobs" USING btree ("status","requested_at");--> statement-breakpoint
CREATE INDEX "updater_runs_started_idx" ON "updater_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "updater_runs_status_idx" ON "updater_runs" USING btree ("status","started_at");