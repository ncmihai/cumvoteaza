CREATE TABLE "party_campaign_finance" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"report_number" text,
	"report_date" date,
	"gazette_number" text,
	"gazette_on" date,
	"portal_url" text NOT NULL,
	"party_name" text NOT NULL,
	"party_id" text,
	"election_kind" text NOT NULL,
	"election_year" integer NOT NULL,
	"election_label" text NOT NULL,
	"contributions" numeric(16, 2),
	"expenses" numeric(16, 2),
	"reimbursement_requested" numeric(16, 2),
	"invalidated" numeric(16, 2),
	"note" text,
	"fine_lei" numeric(16, 2),
	"warned" boolean DEFAULT false NOT NULL,
	"violations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"read_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "party_campaign_finance" ADD CONSTRAINT "party_campaign_finance_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "party_campaign_finance_party_idx" ON "party_campaign_finance" USING btree ("party_id","election_year");--> statement-breakpoint
CREATE INDEX "party_campaign_finance_election_idx" ON "party_campaign_finance" USING btree ("election_kind","election_year");