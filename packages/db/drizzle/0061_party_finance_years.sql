CREATE TABLE "party_finance_years" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"report_number" text,
	"report_date" date,
	"gazette_number" text,
	"gazette_on" date,
	"portal_url" text NOT NULL,
	"party_name" text NOT NULL,
	"party_id" text,
	"year" integer NOT NULL,
	"income_total" numeric(16, 2),
	"income_dues" numeric(16, 2) DEFAULT '0' NOT NULL,
	"income_donations" numeric(16, 2) DEFAULT '0' NOT NULL,
	"income_loans" numeric(16, 2) DEFAULT '0' NOT NULL,
	"income_subsidy" numeric(16, 2) DEFAULT '0' NOT NULL,
	"income_refund" numeric(16, 2) DEFAULT '0' NOT NULL,
	"income_interest" numeric(16, 2) DEFAULT '0' NOT NULL,
	"income_other" numeric(16, 2) DEFAULT '0' NOT NULL,
	"expenses_total" numeric(16, 2),
	"lines_add_up" boolean NOT NULL,
	"nothing_registered" boolean DEFAULT false NOT NULL,
	"note" text,
	"fine_lei" numeric(16, 2),
	"confiscated_lei" numeric(16, 2),
	"violations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"read_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "party_finance_years" ADD CONSTRAINT "party_finance_years_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "party_finance_years_party_idx" ON "party_finance_years" USING btree ("party_id","year");--> statement-breakpoint
CREATE INDEX "party_finance_years_year_idx" ON "party_finance_years" USING btree ("year");