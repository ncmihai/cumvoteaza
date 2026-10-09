CREATE TABLE "member_international_bodies" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"legislature_id" text NOT NULL,
	"kind" text NOT NULL,
	"official_id" text NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"body_url" text NOT NULL,
	"source_url" text NOT NULL,
	"as_of" date NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_international_bodies" ADD CONSTRAINT "member_international_bodies_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_international_bodies" ADD CONSTRAINT "member_international_bodies_legislature_id_legislatures_id_fk" FOREIGN KEY ("legislature_id") REFERENCES "public"."legislatures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_international_bodies_member_idx" ON "member_international_bodies" USING btree ("member_id","legislature_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_international_bodies_body_idx" ON "member_international_bodies" USING btree ("member_id","legislature_id","kind","official_id");