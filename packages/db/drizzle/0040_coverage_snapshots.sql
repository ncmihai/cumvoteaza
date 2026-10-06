CREATE TABLE "coverage_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"generated_on" date NOT NULL,
	"range_from" date,
	"range_to" date,
	"payload" jsonb NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
