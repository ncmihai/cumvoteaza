ALTER TABLE "presidential_decree_persons" ADD COLUMN "action" text;--> statement-breakpoint
ALTER TABLE "presidential_decree_persons" ADD COLUMN "office" text;--> statement-breakpoint
ALTER TABLE "presidential_decree_persons" ADD COLUMN "title" text;--> statement-breakpoint
CREATE INDEX "presidential_decree_persons_office_idx" ON "presidential_decree_persons" USING btree ("office");