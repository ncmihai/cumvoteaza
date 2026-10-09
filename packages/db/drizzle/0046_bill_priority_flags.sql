CREATE TABLE "bill_priority_flags" (
	"bill_id" text NOT NULL,
	"session_id" text NOT NULL,
	"session_label" text NOT NULL,
	"session_starts_on" date NOT NULL,
	"session_ends_on" date NOT NULL,
	"bulletin_url" text NOT NULL,
	"bulletin_page" integer NOT NULL,
	"senate_number" text NOT NULL,
	"urgency" boolean DEFAULT false NOT NULL,
	"law_kind" text,
	CONSTRAINT "bill_priority_flags_bill_id_session_id_pk" PRIMARY KEY("bill_id","session_id")
);
--> statement-breakpoint
ALTER TABLE "bill_priority_flags" ADD CONSTRAINT "bill_priority_flags_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bill_priority_flags_session_idx" ON "bill_priority_flags" USING btree ("session_id");