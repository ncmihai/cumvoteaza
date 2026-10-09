CREATE TABLE "election_list_results" (
	"election_id" text NOT NULL,
	"chamber" "chamber" NOT NULL,
	"circumscription_number" integer NOT NULL,
	"circumscription" text NOT NULL,
	"list_name" text NOT NULL,
	"votes" integer NOT NULL,
	"mandates" integer DEFAULT 0 NOT NULL,
	"party_id" text,
	"independent" boolean DEFAULT false NOT NULL,
	CONSTRAINT "election_list_results_election_id_chamber_circumscription_number_list_name_pk" PRIMARY KEY("election_id","chamber","circumscription_number","list_name")
);
--> statement-breakpoint
CREATE TABLE "elections" (
	"id" text PRIMARY KEY NOT NULL,
	"label_ro" text NOT NULL,
	"label_en" text NOT NULL,
	"held_on" date NOT NULL,
	"legislature_year" text NOT NULL,
	"portal_url" text NOT NULL,
	"license" text NOT NULL,
	"read_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "election_list_results" ADD CONSTRAINT "election_list_results_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_list_results" ADD CONSTRAINT "election_list_results_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "election_list_results_party_idx" ON "election_list_results" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "election_list_results_scope_idx" ON "election_list_results" USING btree ("election_id","chamber");