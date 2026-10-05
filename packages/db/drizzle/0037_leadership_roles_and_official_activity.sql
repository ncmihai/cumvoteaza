CREATE TABLE "member_official_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"legislature_id" text NOT NULL,
	"chamber" "chamber" NOT NULL,
	"metric" text NOT NULL,
	"value" integer NOT NULL,
	"out_of" integer,
	"detail" integer,
	"as_of" date NOT NULL,
	"source_url" text NOT NULL,
	"source_snapshot_id" text
);
--> statement-breakpoint
ALTER TABLE "member_roles" ADD COLUMN "kind" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "member_roles" ADD COLUMN "group_id" text;--> statement-breakpoint
ALTER TABLE "member_roles" ADD COLUMN "starts_on_precision" text DEFAULT 'day' NOT NULL;--> statement-breakpoint
ALTER TABLE "member_roles" ADD COLUMN "ends_on_precision" text DEFAULT 'day' NOT NULL;--> statement-breakpoint
ALTER TABLE "member_official_activity" ADD CONSTRAINT "member_official_activity_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_official_activity" ADD CONSTRAINT "member_official_activity_legislature_id_legislatures_id_fk" FOREIGN KEY ("legislature_id") REFERENCES "public"."legislatures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_official_activity" ADD CONSTRAINT "member_official_activity_source_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_official_activity_member_metric_idx" ON "member_official_activity" USING btree ("member_id","legislature_id","metric");--> statement-breakpoint
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_group_id_parliamentary_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."parliamentary_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_roles_member_idx" ON "member_roles" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "member_roles_kind_period_idx" ON "member_roles" USING btree ("kind","chamber","starts_on");