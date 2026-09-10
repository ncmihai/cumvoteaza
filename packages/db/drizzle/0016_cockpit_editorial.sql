ALTER TYPE "public"."stored_asset_storage_provider" ADD VALUE IF NOT EXISTS 'local';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cockpit_editorial" (
  "id" text PRIMARY KEY NOT NULL,
  "page" text NOT NULL,
  "entity_id" text,
  "content" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cockpit_topic_labels" (
  "id" text PRIMARY KEY NOT NULL,
  "bill_id" text NOT NULL REFERENCES "bills"("id"),
  "label" text NOT NULL,
  "relevance" text NOT NULL,
  "evidence" jsonb NOT NULL,
  "method_version" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cockpit_release_receipts" (
  "id" text PRIMARY KEY NOT NULL,
  "manifest_hash" text NOT NULL,
  "manifest" jsonb NOT NULL,
  "published_at" timestamp with time zone DEFAULT now() NOT NULL
);
