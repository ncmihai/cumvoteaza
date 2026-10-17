CREATE TABLE "member_sanctions" (
	"id" text PRIMARY KEY NOT NULL,
	"legislature" text NOT NULL,
	"member_id" text,
	"person_id" text,
	"name_text" text,
	"group_label" text,
	"held_on" date,
	"headline" text NOT NULL,
	"kind" text NOT NULL,
	"parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"article" text,
	"decision_label" text,
	"decision_number" text,
	"decision_dated" date,
	"decision_url" text,
	"contestation_filed_url" text,
	"contestation_outcome" text,
	"contestation_label" text,
	"contestation_url" text,
	"stenogram_url" text,
	"match_status" text NOT NULL,
	"source_url" text NOT NULL,
	"content_hash" text NOT NULL,
	"read_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_sanctions" ADD CONSTRAINT "member_sanctions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_sanctions" ADD CONSTRAINT "member_sanctions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_sanctions_person_idx" ON "member_sanctions" USING btree ("person_id","held_on");--> statement-breakpoint
CREATE INDEX "member_sanctions_member_idx" ON "member_sanctions" USING btree ("member_id");