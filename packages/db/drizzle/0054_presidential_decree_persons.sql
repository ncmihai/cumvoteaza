CREATE TABLE "presidential_decree_persons" (
	"decree_id" text NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"person_id" text,
	CONSTRAINT "presidential_decree_persons_decree_id_position_pk" PRIMARY KEY("decree_id","position")
);
--> statement-breakpoint
ALTER TABLE "presidential_decree_persons" ADD CONSTRAINT "presidential_decree_persons_decree_id_presidential_decrees_id_fk" FOREIGN KEY ("decree_id") REFERENCES "public"."presidential_decrees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presidential_decree_persons" ADD CONSTRAINT "presidential_decree_persons_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "presidential_decree_persons_person_idx" ON "presidential_decree_persons" USING btree ("person_id");