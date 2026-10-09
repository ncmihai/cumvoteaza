CREATE TABLE "presidential_decrees" (
	"id" text PRIMARY KEY NOT NULL,
	"number" integer NOT NULL,
	"year" integer NOT NULL,
	"issued_on" date NOT NULL,
	"subject" text NOT NULL,
	"kind" text NOT NULL,
	"action" text,
	"gazette_number" text,
	"gazette_on" date,
	"signer" text,
	"signed_as_interim" boolean DEFAULT false NOT NULL,
	"portal_url" text NOT NULL,
	"portal_id" text,
	"read_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "presidential_decrees_reference_idx" ON "presidential_decrees" USING btree ("year","number");--> statement-breakpoint
CREATE INDEX "presidential_decrees_kind_idx" ON "presidential_decrees" USING btree ("kind","issued_on");--> statement-breakpoint
CREATE INDEX "presidential_decrees_issued_idx" ON "presidential_decrees" USING btree ("issued_on");