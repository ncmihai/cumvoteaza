CREATE TABLE "policy_portfolios" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name_ro" text NOT NULL,
	"name_en" text NOT NULL,
	"description_ro" text NOT NULL,
	"description_en" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ministry_incarnation_portfolios" RENAME COLUMN "ministry_id" TO "portfolio_id";--> statement-breakpoint
ALTER TABLE "ministry_incarnation_portfolios" DROP CONSTRAINT "ministry_incarnation_portfolios_ministry_id_ministries_id_fk";
--> statement-breakpoint
DROP INDEX "ministry_incarnation_portfolios_portfolio_period_idx";--> statement-breakpoint
DROP INDEX "ministry_incarnation_portfolios_unique_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "policy_portfolios_slug_idx" ON "policy_portfolios" USING btree ("slug");--> statement-breakpoint
ALTER TABLE "ministry_incarnation_portfolios" ADD CONSTRAINT "ministry_incarnation_portfolios_portfolio_id_policy_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."policy_portfolios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ministry_incarnation_portfolios_portfolio_period_idx" ON "ministry_incarnation_portfolios" USING btree ("portfolio_id","starts_on","ends_on");--> statement-breakpoint
CREATE UNIQUE INDEX "ministry_incarnation_portfolios_unique_idx" ON "ministry_incarnation_portfolios" USING btree ("incarnation_id","portfolio_id","starts_on");