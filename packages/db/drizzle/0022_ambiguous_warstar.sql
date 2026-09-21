CREATE TABLE "bill_ministry_relations" (
	"id" text PRIMARY KEY NOT NULL,
	"bill_id" text NOT NULL,
	"ministry_id" text NOT NULL,
	"relation" text NOT NULL,
	"confidence" text NOT NULL,
	"reason" text NOT NULL,
	"document_id" text,
	"source_url" text,
	"evidence_excerpt" text
);
--> statement-breakpoint
ALTER TABLE "bill_ministry_relations" ADD CONSTRAINT "bill_ministry_relations_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_ministry_relations" ADD CONSTRAINT "bill_ministry_relations_ministry_id_ministries_id_fk" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_ministry_relations" ADD CONSTRAINT "bill_ministry_relations_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bill_ministry_relations_bill_idx" ON "bill_ministry_relations" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "bill_ministry_relations_ministry_idx" ON "bill_ministry_relations" USING btree ("ministry_id","confidence");--> statement-breakpoint
CREATE UNIQUE INDEX "bill_ministry_relations_unique_idx" ON "bill_ministry_relations" USING btree ("bill_id","ministry_id","relation");