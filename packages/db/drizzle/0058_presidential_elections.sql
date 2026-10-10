CREATE TYPE "public"."ballot" AS ENUM('senate', 'deputies', 'president');--> statement-breakpoint
ALTER TABLE "election_area_results" ALTER COLUMN "chamber" SET DATA TYPE "public"."ballot" USING "chamber"::text::"public"."ballot";--> statement-breakpoint
ALTER TABLE "election_list_results" ALTER COLUMN "chamber" SET DATA TYPE "public"."ballot" USING "chamber"::text::"public"."ballot";--> statement-breakpoint
ALTER TABLE "election_lists" ALTER COLUMN "chamber" SET DATA TYPE "public"."ballot" USING "chamber"::text::"public"."ballot";--> statement-breakpoint
ALTER TABLE "elections" ADD COLUMN "kind" text DEFAULT 'parliamentary' NOT NULL;--> statement-breakpoint
ALTER TABLE "elections" ADD COLUMN "note_ro" text;--> statement-breakpoint
ALTER TABLE "elections" ADD COLUMN "note_en" text;