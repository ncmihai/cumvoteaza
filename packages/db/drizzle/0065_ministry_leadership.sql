CREATE TABLE "ministry_leadership" (
	"id" text PRIMARY KEY NOT NULL,
	"ministry_id" text NOT NULL,
	"name_text" text NOT NULL,
	"person_id" text,
	"role_text" text NOT NULL,
	"kind" text NOT NULL,
	"since_text" text,
	"first_seen_on" date NOT NULL,
	"last_seen_on" date NOT NULL,
	"source_url" text NOT NULL,
	"content_hash" text NOT NULL,
	"read_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ministry_leadership" ADD CONSTRAINT "ministry_leadership_ministry_id_ministries_id_fk" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministry_leadership" ADD CONSTRAINT "ministry_leadership_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ministry_leadership_ministry_idx" ON "ministry_leadership" USING btree ("ministry_id","last_seen_on");--> statement-breakpoint
CREATE INDEX "ministry_leadership_person_idx" ON "ministry_leadership" USING btree ("person_id");