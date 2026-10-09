CREATE TABLE "person_biographies" (
	"person_id" text PRIMARY KEY NOT NULL,
	"birth_date" date,
	"birth_date_source_url" text,
	"read_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "person_biographies" ADD CONSTRAINT "person_biographies_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;