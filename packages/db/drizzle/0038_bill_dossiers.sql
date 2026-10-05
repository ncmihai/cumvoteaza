ALTER TYPE "public"."bill_procedure_step_type" ADD VALUE 'urgency_requested';--> statement-breakpoint
ALTER TYPE "public"."bill_procedure_step_type" ADD VALUE 'urgency_decided';--> statement-breakpoint
ALTER TYPE "public"."bill_procedure_step_type" ADD VALUE 'government_view_requested';--> statement-breakpoint
ALTER TYPE "public"."bill_procedure_step_type" ADD VALUE 'government_view_received';--> statement-breakpoint
ALTER TYPE "public"."bill_procedure_step_type" ADD VALUE 'opinion_requested';--> statement-breakpoint
ALTER TYPE "public"."bill_procedure_step_type" ADD VALUE 'opinion_received';--> statement-breakpoint
ALTER TYPE "public"."bill_procedure_step_type" ADD VALUE 'agenda_scheduled';--> statement-breakpoint
ALTER TYPE "public"."bill_procedure_step_type" ADD VALUE 'adopted';--> statement-breakpoint
ALTER TYPE "public"."bill_procedure_step_type" ADD VALUE 'rejected';--> statement-breakpoint
ALTER TYPE "public"."bill_procedure_step_type" ADD VALUE 'withdrawn';--> statement-breakpoint
ALTER TYPE "public"."bill_procedure_step_type" ADD VALUE 'procedure_ended';--> statement-breakpoint
ALTER TYPE "public"."bill_procedure_step_type" ADD VALUE 'deadline_extended';--> statement-breakpoint
ALTER TYPE "public"."bill_procedure_step_type" ADD VALUE 'competence_decision';--> statement-breakpoint
ALTER TYPE "public"."bill_procedure_step_type" ADD VALUE 'constitutional_window';--> statement-breakpoint
ALTER TYPE "public"."bill_procedure_step_type" ADD VALUE 'sent_to_president';--> statement-breakpoint
ALTER TYPE "public"."bill_procedure_step_type" ADD VALUE 'published';--> statement-breakpoint
CREATE TABLE "bill_dossiers" (
	"bill_id" text PRIMARY KEY NOT NULL,
	"read_at" timestamp with time zone NOT NULL,
	"sources" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"registrations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"initiative_type" text,
	"initiative_kind" text,
	"urgent" boolean,
	"stage_text" text,
	"summary" text,
	"tacit_deadline" date,
	"initiator_count_text" text,
	"outcome" text DEFAULT 'in_progress' NOT NULL,
	"outcome_on" date,
	"law_number" text,
	"law_year" integer,
	"decree_number" text,
	"decree_year" integer,
	"decree_on" date,
	"gazette_number" text,
	"gazette_on" date
);
--> statement-breakpoint
ALTER TABLE "bill_procedure_steps" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "bill_procedure_steps" ADD COLUMN "institution" text;--> statement-breakpoint
ALTER TABLE "bill_procedure_steps" ADD COLUMN "committee_ref" text;--> statement-breakpoint
ALTER TABLE "bill_procedure_steps" ADD COLUMN "verdict" text;--> statement-breakpoint
ALTER TABLE "bill_procedure_steps" ADD COLUMN "document_number" text;--> statement-breakpoint
ALTER TABLE "bill_procedure_steps" ADD COLUMN "amendments_admitted" integer;--> statement-breakpoint
ALTER TABLE "bill_procedure_steps" ADD COLUMN "amendments_rejected" integer;--> statement-breakpoint
ALTER TABLE "bill_procedure_steps" ADD COLUMN "deadline_amendments_on" date;--> statement-breakpoint
ALTER TABLE "bill_procedure_steps" ADD COLUMN "deadline_on" date;--> statement-breakpoint
ALTER TABLE "bill_procedure_steps" ADD COLUMN "result_for" integer;--> statement-breakpoint
ALTER TABLE "bill_procedure_steps" ADD COLUMN "result_against" integer;--> statement-breakpoint
ALTER TABLE "bill_procedure_steps" ADD COLUMN "result_abstention" integer;--> statement-breakpoint
ALTER TABLE "bill_procedure_steps" ADD COLUMN "result_not_voting" integer;--> statement-breakpoint
ALTER TABLE "bill_procedure_steps" ADD COLUMN "vote_id" text;--> statement-breakpoint
ALTER TABLE "bill_procedure_steps" ADD COLUMN "vote_ref" text;--> statement-breakpoint
ALTER TABLE "bill_procedure_steps" ADD COLUMN "stenogram_url" text;--> statement-breakpoint
ALTER TABLE "bill_procedure_steps" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "bill_sponsors" ADD COLUMN "group_label" text;--> statement-breakpoint
ALTER TABLE "bill_sponsors" ADD COLUMN "member_chamber" text;--> statement-breakpoint
ALTER TABLE "bill_sponsors" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "bill_dossiers" ADD CONSTRAINT "bill_dossiers_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bill_dossiers_outcome_idx" ON "bill_dossiers" USING btree ("outcome");--> statement-breakpoint
CREATE INDEX "bill_dossiers_law_idx" ON "bill_dossiers" USING btree ("law_year","law_number");