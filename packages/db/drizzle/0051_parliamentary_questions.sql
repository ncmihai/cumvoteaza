CREATE TABLE "parliamentary_question_addressees" (
	"question_id" text NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"attention" text,
	"ministry_id" text,
	CONSTRAINT "parliamentary_question_addressees_question_id_position_pk" PRIMARY KEY("question_id","position")
);
--> statement-breakpoint
CREATE TABLE "parliamentary_question_askers" (
	"question_id" text NOT NULL,
	"position" integer NOT NULL,
	"member_id" text,
	"asker_text" text NOT NULL,
	CONSTRAINT "parliamentary_question_askers_question_id_position_pk" PRIMARY KEY("question_id","position")
);
--> statement-breakpoint
CREATE TABLE "parliamentary_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"chamber" "chamber" NOT NULL,
	"official_id" text NOT NULL,
	"kind" text NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"registered_on" date NOT NULL,
	"presented_on" date,
	"communicated_on" date,
	"ask_mode" text,
	"text_url" text,
	"answer_number" text,
	"answered_on" date,
	"answer_mode" text,
	"answer_from" text,
	"answer_signed_by" text,
	"answer_url" text,
	"source_url" text NOT NULL,
	"read_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "parliamentary_question_addressees" ADD CONSTRAINT "parliamentary_question_addressees_question_id_parliamentary_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."parliamentary_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parliamentary_question_addressees" ADD CONSTRAINT "parliamentary_question_addressees_ministry_id_ministries_id_fk" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parliamentary_question_askers" ADD CONSTRAINT "parliamentary_question_askers_question_id_parliamentary_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."parliamentary_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parliamentary_question_askers" ADD CONSTRAINT "parliamentary_question_askers_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parliamentary_question_addressees_ministry_idx" ON "parliamentary_question_addressees" USING btree ("ministry_id");--> statement-breakpoint
CREATE INDEX "parliamentary_question_askers_member_idx" ON "parliamentary_question_askers" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "parliamentary_questions_official_idx" ON "parliamentary_questions" USING btree ("chamber","official_id");--> statement-breakpoint
CREATE INDEX "parliamentary_questions_registered_idx" ON "parliamentary_questions" USING btree ("registered_on");