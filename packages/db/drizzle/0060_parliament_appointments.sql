CREATE TABLE "parliament_appointments" (
	"id" text NOT NULL,
	"position" integer NOT NULL,
	"body" text NOT NULL,
	"number" integer NOT NULL,
	"year" integer NOT NULL,
	"adopted_on" date NOT NULL,
	"title" text NOT NULL,
	"gazette_number" text,
	"gazette_on" date,
	"office" text NOT NULL,
	"action" text NOT NULL,
	"person_name" text,
	"person_id" text,
	"sentence" text NOT NULL,
	"portal_url" text NOT NULL,
	"read_at" timestamp with time zone NOT NULL,
	CONSTRAINT "parliament_appointments_id_position_pk" PRIMARY KEY("id","position")
);
--> statement-breakpoint
ALTER TABLE "parliament_appointments" ADD CONSTRAINT "parliament_appointments_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parliament_appointments_office_idx" ON "parliament_appointments" USING btree ("office","adopted_on");