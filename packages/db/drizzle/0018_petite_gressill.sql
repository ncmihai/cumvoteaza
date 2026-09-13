CREATE TYPE "public"."vote_classification_basis" AS ENUM('official_metadata', 'deterministic_rule', 'contextual_inference', 'manual_review', 'unclassified');--> statement-breakpoint
CREATE TYPE "public"."vote_classification_confidence" AS ENUM('verified', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."vote_motion_kind" AS ENUM('final_adoption', 'final_rejection', 'rejection_report', 'amendment', 'committee_referral', 'reconsideration', 'confidence', 'no_confidence', 'institutional_resolution', 'procedural_timing', 'agenda_or_schedule', 'quorum_or_presence', 'internal_procedure', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."vote_prominence" AS ENUM('major', 'standard', 'routine', 'unclassified');--> statement-breakpoint
CREATE TYPE "public"."vote_yes_meaning" AS ENUM('supports_adoption', 'supports_rejection', 'supports_amendment', 'supports_referral', 'supports_reconsideration', 'supports_confidence', 'supports_no_confidence', 'supports_resolution', 'supports_procedure', 'confirms_presence', 'unknown');--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN "motion_kind" "vote_motion_kind" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN "prominence" "vote_prominence" DEFAULT 'unclassified' NOT NULL;--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN "yes_meaning" "vote_yes_meaning" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN "classification_confidence" "vote_classification_confidence" DEFAULT 'low' NOT NULL;--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN "classification_basis" "vote_classification_basis" DEFAULT 'unclassified' NOT NULL;--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN "classification_version" text;--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN "classification_reason" text;--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN "classified_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "votes_classification_idx" ON "votes" USING btree ("prominence","classification_confidence","held_on");
