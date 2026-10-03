DROP INDEX "individual_votes_member_vote_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "individual_votes_member_vote_idx" ON "individual_votes" USING btree ("member_id","vote_id");