CREATE TABLE "foreign_missions" (
	"id" text PRIMARY KEY NOT NULL,
	"country_name" text NOT NULL,
	"official_name" text,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"url" text,
	"read_on" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mission_heads" (
	"id" text PRIMARY KEY NOT NULL,
	"mission_id" text NOT NULL,
	"country_name" text NOT NULL,
	"name_text" text NOT NULL,
	"person_id" text,
	"role_text" text NOT NULL,
	"head_kind" text NOT NULL,
	"first_seen_on" date NOT NULL,
	"last_seen_on" date NOT NULL,
	"source_url" text NOT NULL,
	"content_hash" text NOT NULL,
	"read_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mission_heads" ADD CONSTRAINT "mission_heads_mission_id_foreign_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."foreign_missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_heads" ADD CONSTRAINT "mission_heads_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "foreign_missions_country_idx" ON "foreign_missions" USING btree ("country_name");--> statement-breakpoint
CREATE INDEX "mission_heads_mission_idx" ON "mission_heads" USING btree ("mission_id","last_seen_on");--> statement-breakpoint
CREATE INDEX "mission_heads_country_idx" ON "mission_heads" USING btree ("country_name","last_seen_on");