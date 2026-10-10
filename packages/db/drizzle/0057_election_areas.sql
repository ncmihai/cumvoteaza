CREATE TABLE "election_area_results" (
	"election_id" text NOT NULL,
	"chamber" "chamber" NOT NULL,
	"area_key" text NOT NULL,
	"circumscription_number" integer NOT NULL,
	"name" text NOT NULL,
	"sections" integer NOT NULL,
	"registered" integer NOT NULL,
	"present" integer NOT NULL,
	"valid" integer NOT NULL,
	"invalid" integer NOT NULL,
	"list_codes" integer[] NOT NULL,
	"list_votes" integer[] NOT NULL,
	CONSTRAINT "election_area_results_election_id_chamber_area_key_pk" PRIMARY KEY("election_id","chamber","area_key")
);
--> statement-breakpoint
CREATE TABLE "election_lists" (
	"election_id" text NOT NULL,
	"chamber" "chamber" NOT NULL,
	"code" integer NOT NULL,
	"name" text NOT NULL,
	"independents" boolean DEFAULT false NOT NULL,
	"party_id" text,
	CONSTRAINT "election_lists_election_id_chamber_code_pk" PRIMARY KEY("election_id","chamber","code")
);
--> statement-breakpoint
ALTER TABLE "election_area_results" ADD CONSTRAINT "election_area_results_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_lists" ADD CONSTRAINT "election_lists_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_lists" ADD CONSTRAINT "election_lists_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "election_area_results_circumscription_idx" ON "election_area_results" USING btree ("election_id","chamber","circumscription_number");