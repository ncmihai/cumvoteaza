-- D-023 / Sprint 3 (F2): individual votes get compact integer keys.
-- Order matters: keys first, copy, verify, and only then replace the old table by a view with the same columns.
-- The whole file runs in one transaction; if the row counts differ, the guard below aborts and nothing changes.
ALTER TABLE "members" ADD COLUMN "num" integer NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "members_num_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);--> statement-breakpoint
ALTER TABLE "parliamentary_groups" ADD COLUMN "num" integer NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "parliamentary_groups_num_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN "num" integer NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "votes_num_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);--> statement-breakpoint
CREATE UNIQUE INDEX "members_num_idx" ON "members" USING btree ("num");--> statement-breakpoint
CREATE UNIQUE INDEX "parliamentary_groups_num_idx" ON "parliamentary_groups" USING btree ("num");--> statement-breakpoint
CREATE UNIQUE INDEX "votes_num_idx" ON "votes" USING btree ("num");--> statement-breakpoint
CREATE TABLE "individual_vote_rows" (
	"vote_num" integer NOT NULL,
	"member_num" integer NOT NULL,
	"group_num" integer,
	"choice" "vote_choice" NOT NULL,
	"vote_method" text,
	CONSTRAINT "individual_vote_rows_vote_num_member_num_pk" PRIMARY KEY("vote_num","member_num")
);
--> statement-breakpoint
INSERT INTO "individual_vote_rows" ("vote_num", "member_num", "group_num", "choice", "vote_method")
SELECT v."num", m."num", g."num", iv."choice", iv."vote_method"
FROM "individual_votes" iv
JOIN "votes" v ON v."id" = iv."vote_id"
JOIN "members" m ON m."id" = iv."member_id"
LEFT JOIN "parliamentary_groups" g ON g."id" = iv."group_id"
ORDER BY v."num", m."num";--> statement-breakpoint
DO $$
DECLARE old_rows bigint; new_rows bigint;
BEGIN
  SELECT count(*) INTO old_rows FROM "individual_votes";
  SELECT count(*) INTO new_rows FROM "individual_vote_rows";
  IF old_rows <> new_rows THEN
    RAISE EXCEPTION 'individual_votes copy is incomplete: % old rows, % copied', old_rows, new_rows;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "individual_vote_rows" ADD CONSTRAINT "individual_vote_rows_vote_num_votes_num_fk" FOREIGN KEY ("vote_num") REFERENCES "public"."votes"("num") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "individual_vote_rows" ADD CONSTRAINT "individual_vote_rows_member_num_members_num_fk" FOREIGN KEY ("member_num") REFERENCES "public"."members"("num") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "individual_vote_rows" ADD CONSTRAINT "individual_vote_rows_group_num_parliamentary_groups_num_fk" FOREIGN KEY ("group_num") REFERENCES "public"."parliamentary_groups"("num") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "individual_vote_rows_member_idx" ON "individual_vote_rows" USING btree ("member_num","vote_num");--> statement-breakpoint
DROP TABLE "individual_votes";--> statement-breakpoint
-- Left joins on unique keys: Postgres drops the joins a query does not use, so counting votes never touches members.
CREATE VIEW "individual_votes" AS
SELECT 'iv-' || v."id" || '-' || m."id" AS "id", v."id" AS "vote_id", m."id" AS "member_id", g."id" AS "group_id", r."choice", r."vote_method"
FROM "individual_vote_rows" r
LEFT JOIN "votes" v ON v."num" = r."vote_num"
LEFT JOIN "members" m ON m."num" = r."member_num"
LEFT JOIN "parliamentary_groups" g ON g."num" = r."group_num";
