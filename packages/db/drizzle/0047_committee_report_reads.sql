CREATE TABLE "committee_report_annexes" (
	"document_id" text NOT NULL,
	"kind" text NOT NULL,
	"page" integer NOT NULL,
	CONSTRAINT "committee_report_annexes_document_id_kind_page_pk" PRIMARY KEY("document_id","kind","page")
);
--> statement-breakpoint
CREATE TABLE "committee_report_authors" (
	"document_id" text NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"group_label" text,
	"member_id" text,
	CONSTRAINT "committee_report_authors_document_id_position_pk" PRIMARY KEY("document_id","position")
);
--> statement-breakpoint
CREATE TABLE "committee_report_reads" (
	"document_id" text PRIMARY KEY NOT NULL,
	"pages" integer NOT NULL,
	"garbled_percent" real NOT NULL,
	"quality" text NOT NULL,
	"read_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "committee_report_annexes" ADD CONSTRAINT "committee_report_annexes_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_report_authors" ADD CONSTRAINT "committee_report_authors_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_report_authors" ADD CONSTRAINT "committee_report_authors_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_report_reads" ADD CONSTRAINT "committee_report_reads_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "committee_report_authors_member_idx" ON "committee_report_authors" USING btree ("member_id");