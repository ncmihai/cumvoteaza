CREATE TABLE "id_aliases" (
	"alias_id" text PRIMARY KEY NOT NULL,
	"canonical_id" text NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "id_aliases_canonical_idx" ON "id_aliases" USING btree ("canonical_id");