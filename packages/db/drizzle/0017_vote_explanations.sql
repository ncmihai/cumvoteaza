CREATE TABLE IF NOT EXISTS vote_explanations (
  id text PRIMARY KEY,
  vote_id text NOT NULL REFERENCES votes(id),
  input_hash text NOT NULL,
  prompt_version text NOT NULL,
  model text NOT NULL,
  context jsonb NOT NULL,
  output jsonb,
  status text NOT NULL CHECK (status IN ('generating','unreviewed','reviewed','hidden','failed')),
  lease_token text,
  lease_until timestamptz,
  retry_after timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS vote_explanations_review_idx ON vote_explanations(status, updated_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS vote_explanation_attempts (
  id text PRIMARY KEY,
  explanation_id text NOT NULL REFERENCES vote_explanations(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS vote_explanation_attempts_date_idx ON vote_explanation_attempts(created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS vote_explanation_reviews (
  id text PRIMARY KEY,
  explanation_id text NOT NULL REFERENCES vote_explanations(id),
  decision text NOT NULL CHECK (decision IN ('reviewed','hidden')),
  reason text NOT NULL,
  previous_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
