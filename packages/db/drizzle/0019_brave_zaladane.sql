ALTER TABLE "member_legislature_activity" ADD COLUMN "vote_records" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "member_legislature_activity" ADD COLUMN "major_vote_records" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "member_legislature_activity" ADD COLUMN "standard_vote_records" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "member_legislature_activity" ADD COLUMN "routine_vote_records" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "member_legislature_activity" ADD COLUMN "unclassified_vote_records" integer DEFAULT 0 NOT NULL;