ALTER TABLE "parties" ADD COLUMN "kind" text DEFAULT 'party' NOT NULL;--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "full_name_known" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "logo_asset_id" text;--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "logo_source_url" text;--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_logo_asset_id_stored_assets_id_fk" FOREIGN KEY ("logo_asset_id") REFERENCES "public"."stored_assets"("id") ON DELETE no action ON UPDATE no action;