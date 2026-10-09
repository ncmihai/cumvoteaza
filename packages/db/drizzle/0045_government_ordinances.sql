CREATE TABLE "bill_ordinances" (
	"bill_id" text NOT NULL,
	"kind" text NOT NULL,
	"number" text NOT NULL,
	"year" integer NOT NULL,
	"ordinance_id" text,
	CONSTRAINT "bill_ordinances_bill_id_kind_number_year_pk" PRIMARY KEY("bill_id","kind","number","year")
);
--> statement-breakpoint
CREATE TABLE "government_ordinances" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"number" text NOT NULL,
	"year" integer NOT NULL,
	"issued_on" date NOT NULL,
	"title" text NOT NULL,
	"issuer" text NOT NULL,
	"gazette_number" text,
	"gazette_on" date,
	"portal_url" text NOT NULL,
	"portal_id" text,
	"read_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bill_ordinances" ADD CONSTRAINT "bill_ordinances_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_ordinances" ADD CONSTRAINT "bill_ordinances_ordinance_id_government_ordinances_id_fk" FOREIGN KEY ("ordinance_id") REFERENCES "public"."government_ordinances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bill_ordinances_ordinance_idx" ON "bill_ordinances" USING btree ("ordinance_id");--> statement-breakpoint
CREATE UNIQUE INDEX "government_ordinances_reference_idx" ON "government_ordinances" USING btree ("kind","number","year");