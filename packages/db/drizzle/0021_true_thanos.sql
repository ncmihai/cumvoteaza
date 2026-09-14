CREATE TABLE "ministries" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"description_ro" text NOT NULL,
	"description_en" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ministry_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"ministry_id" text NOT NULL,
	"name" text NOT NULL,
	"starts_on" date,
	"ends_on" date
);
--> statement-breakpoint
ALTER TABLE "government_roles" ADD COLUMN "ministry_id" text;--> statement-breakpoint
ALTER TABLE "ministry_aliases" ADD CONSTRAINT "ministry_aliases_ministry_id_ministries_id_fk" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ministries_slug_idx" ON "ministries" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "ministry_aliases_ministry_idx" ON "ministry_aliases" USING btree ("ministry_id");--> statement-breakpoint
CREATE INDEX "ministry_aliases_name_idx" ON "ministry_aliases" USING btree ("name");--> statement-breakpoint
ALTER TABLE "government_roles" ADD CONSTRAINT "government_roles_ministry_id_ministries_id_fk" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministries"("id") ON DELETE no action ON UPDATE no action;