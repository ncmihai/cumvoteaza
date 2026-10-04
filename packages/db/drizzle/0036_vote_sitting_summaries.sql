CREATE TABLE "vote_sitting_summaries" (
	"id" text PRIMARY KEY NOT NULL,
	"chamber" "vote_chamber" NOT NULL,
	"held_on" date NOT NULL,
	"kind" text NOT NULL,
	"vote_count" integer NOT NULL,
	"first_official_id" text NOT NULL,
	"last_official_id" text NOT NULL,
	"official_url" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "vote_sitting_summaries_held_on_idx" ON "vote_sitting_summaries" USING btree ("held_on");