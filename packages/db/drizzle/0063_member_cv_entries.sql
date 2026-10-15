CREATE TABLE "member_cv_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"section" text NOT NULL,
	"position" integer NOT NULL,
	"raw_text" text NOT NULL,
	"dates_text" text,
	"starts_on" date,
	"starts_on_precision" text,
	"ends_on" date,
	"ends_on_precision" text,
	"is_current" boolean DEFAULT false NOT NULL,
	"source_url" text NOT NULL,
	"cv_updated_on" date,
	"content_hash" text NOT NULL,
	"read_at" timestamp with time zone NOT NULL,
	"check_status" text DEFAULT 'unchecked' NOT NULL,
	"check_reason" text,
	"check_records" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"checked_on" date,
	"reviewed_on" date,
	"review_note" text
);
--> statement-breakpoint
ALTER TABLE "member_cv_entries" ADD CONSTRAINT "member_cv_entries_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_cv_entries_person_section_position_idx" ON "member_cv_entries" USING btree ("person_id","section","position");--> statement-breakpoint
CREATE INDEX "member_cv_entries_status_idx" ON "member_cv_entries" USING btree ("check_status","reviewed_on");