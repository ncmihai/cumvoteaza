CREATE TABLE "bill_step_documents" (
	"step_id" text NOT NULL,
	"document_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "bill_step_documents_step_id_document_id_pk" PRIMARY KEY("step_id","document_id")
);
--> statement-breakpoint
ALTER TABLE "bill_step_documents" ADD CONSTRAINT "bill_step_documents_step_id_bill_procedure_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."bill_procedure_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_step_documents" ADD CONSTRAINT "bill_step_documents_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bill_step_documents_document_idx" ON "bill_step_documents" USING btree ("document_id");