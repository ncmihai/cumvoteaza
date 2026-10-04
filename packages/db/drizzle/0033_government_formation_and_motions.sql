CREATE TABLE "government_formation_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"designee_person_id" text NOT NULL,
	"preceding_government_id" text,
	"resulting_government_id" text,
	"designated_on" date NOT NULL,
	"designation_decree" text,
	"designation_decree_url" text,
	"revoked_on" date,
	"revocation_decree" text,
	"revocation_decree_url" text,
	"vote_held_on" date,
	"present_count" integer,
	"votes_for" integer,
	"votes_against" integer,
	"votes_void" integer,
	"threshold" integer,
	"outcome" text NOT NULL,
	"parliament_decision" text,
	"parliament_decision_url" text,
	"appointment_decree" text,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "motion_signatories" (
	"motion_id" text NOT NULL,
	"member_id" text NOT NULL,
	"group_label" text,
	CONSTRAINT "motion_signatories_motion_id_member_id_pk" PRIMARY KEY("motion_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "parliamentary_motions" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"chamber" "vote_chamber" NOT NULL,
	"legislature_id" text,
	"number" integer NOT NULL,
	"filed_on" date NOT NULL,
	"presented_on" date,
	"voted_on" date,
	"title" text NOT NULL,
	"initiators" text,
	"outcome" text DEFAULT 'unknown' NOT NULL,
	"votes_for" integer,
	"votes_against" integer,
	"votes_abstain" integer,
	"votes_void" integer,
	"signatories_deputies" integer,
	"signatories_senators" integer,
	"target_government_id" text,
	"source_url" text NOT NULL,
	"document_url" text,
	"source_snapshot_id" text
);
--> statement-breakpoint
ALTER TABLE "government_formation_attempts" ADD CONSTRAINT "government_formation_attempts_designee_person_id_people_id_fk" FOREIGN KEY ("designee_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "government_formation_attempts" ADD CONSTRAINT "government_formation_attempts_preceding_government_id_governments_id_fk" FOREIGN KEY ("preceding_government_id") REFERENCES "public"."governments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "government_formation_attempts" ADD CONSTRAINT "government_formation_attempts_resulting_government_id_governments_id_fk" FOREIGN KEY ("resulting_government_id") REFERENCES "public"."governments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motion_signatories" ADD CONSTRAINT "motion_signatories_motion_id_parliamentary_motions_id_fk" FOREIGN KEY ("motion_id") REFERENCES "public"."parliamentary_motions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motion_signatories" ADD CONSTRAINT "motion_signatories_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parliamentary_motions" ADD CONSTRAINT "parliamentary_motions_legislature_id_legislatures_id_fk" FOREIGN KEY ("legislature_id") REFERENCES "public"."legislatures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parliamentary_motions" ADD CONSTRAINT "parliamentary_motions_target_government_id_governments_id_fk" FOREIGN KEY ("target_government_id") REFERENCES "public"."governments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parliamentary_motions" ADD CONSTRAINT "parliamentary_motions_source_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "government_formation_attempts_designated_idx" ON "government_formation_attempts" USING btree ("designated_on");--> statement-breakpoint
CREATE INDEX "motion_signatories_member_idx" ON "motion_signatories" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "parliamentary_motions_filed_idx" ON "parliamentary_motions" USING btree ("filed_on");--> statement-breakpoint
CREATE INDEX "parliamentary_motions_kind_idx" ON "parliamentary_motions" USING btree ("kind","chamber");