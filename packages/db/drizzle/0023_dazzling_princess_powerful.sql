CREATE TYPE "public"."ministry_lineage_type" AS ENUM('renamed_to', 'replaced_by', 'merged_into', 'split_into', 'responsibility_transferred_to');--> statement-breakpoint
CREATE TABLE "ministry_incarnation_portfolios" (
	"id" text PRIMARY KEY NOT NULL,
	"incarnation_id" text NOT NULL,
	"ministry_id" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"source_snapshot_id" text
);
--> statement-breakpoint
CREATE TABLE "ministry_incarnations" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"source_snapshot_id" text
);
--> statement-breakpoint
CREATE TABLE "ministry_lineage" (
	"id" text PRIMARY KEY NOT NULL,
	"from_incarnation_id" text NOT NULL,
	"to_incarnation_id" text NOT NULL,
	"relationship" "ministry_lineage_type" NOT NULL,
	"effective_on" date NOT NULL,
	"notes" text,
	"source_snapshot_id" text
);
--> statement-breakpoint
ALTER TABLE "government_roles" ADD COLUMN "ministry_incarnation_id" text;--> statement-breakpoint
ALTER TABLE "ministry_incarnation_portfolios" ADD CONSTRAINT "ministry_incarnation_portfolios_incarnation_id_ministry_incarnations_id_fk" FOREIGN KEY ("incarnation_id") REFERENCES "public"."ministry_incarnations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministry_incarnation_portfolios" ADD CONSTRAINT "ministry_incarnation_portfolios_ministry_id_ministries_id_fk" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministry_incarnation_portfolios" ADD CONSTRAINT "ministry_incarnation_portfolios_source_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministry_incarnations" ADD CONSTRAINT "ministry_incarnations_source_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministry_lineage" ADD CONSTRAINT "ministry_lineage_from_incarnation_id_ministry_incarnations_id_fk" FOREIGN KEY ("from_incarnation_id") REFERENCES "public"."ministry_incarnations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministry_lineage" ADD CONSTRAINT "ministry_lineage_to_incarnation_id_ministry_incarnations_id_fk" FOREIGN KEY ("to_incarnation_id") REFERENCES "public"."ministry_incarnations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministry_lineage" ADD CONSTRAINT "ministry_lineage_source_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ministry_incarnation_portfolios_incarnation_idx" ON "ministry_incarnation_portfolios" USING btree ("incarnation_id");--> statement-breakpoint
CREATE INDEX "ministry_incarnation_portfolios_portfolio_period_idx" ON "ministry_incarnation_portfolios" USING btree ("ministry_id","starts_on","ends_on");--> statement-breakpoint
CREATE UNIQUE INDEX "ministry_incarnation_portfolios_unique_idx" ON "ministry_incarnation_portfolios" USING btree ("incarnation_id","ministry_id","starts_on");--> statement-breakpoint
CREATE UNIQUE INDEX "ministry_incarnations_slug_idx" ON "ministry_incarnations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "ministry_incarnations_period_idx" ON "ministry_incarnations" USING btree ("starts_on","ends_on");--> statement-breakpoint
CREATE INDEX "ministry_lineage_from_idx" ON "ministry_lineage" USING btree ("from_incarnation_id");--> statement-breakpoint
CREATE INDEX "ministry_lineage_to_idx" ON "ministry_lineage" USING btree ("to_incarnation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ministry_lineage_unique_idx" ON "ministry_lineage" USING btree ("from_incarnation_id","to_incarnation_id","relationship","effective_on");--> statement-breakpoint
ALTER TABLE "government_roles" ADD CONSTRAINT "government_roles_ministry_incarnation_id_ministry_incarnations_id_fk" FOREIGN KEY ("ministry_incarnation_id") REFERENCES "public"."ministry_incarnations"("id") ON DELETE no action ON UPDATE no action;