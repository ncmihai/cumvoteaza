ALTER TABLE "member_group_memberships" ADD COLUMN "starts_on_precision" text DEFAULT 'day' NOT NULL;--> statement-breakpoint
ALTER TABLE "member_group_memberships" ADD COLUMN "ends_on_precision" text DEFAULT 'day' NOT NULL;--> statement-breakpoint
ALTER TABLE "member_party_affiliations" ADD COLUMN "starts_on_precision" text DEFAULT 'day' NOT NULL;--> statement-breakpoint
ALTER TABLE "member_party_affiliations" ADD COLUMN "ends_on_precision" text DEFAULT 'day' NOT NULL;