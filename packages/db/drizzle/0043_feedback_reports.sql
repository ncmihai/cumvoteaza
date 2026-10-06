CREATE TABLE "feedback_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"page_path" text,
	"locale" text,
	"contact" text,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "feedback_reports_status_idx" ON "feedback_reports" USING btree ("status","created_at");