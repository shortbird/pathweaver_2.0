-- Two-way Credit Review feedback thread
--
-- Extends Credit Review from one-directional ("Grow This" feedback) into a
-- conversation: a student can reply to reviewer feedback and ask questions without
-- having to resubmit evidence. A lightweight message thread keyed by the task
-- completion, independent of the round/resubmit cycle.

CREATE TABLE IF NOT EXISTS credit_review_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  completion_id uuid NOT NULL REFERENCES quest_task_completions(id) ON DELETE CASCADE,
  author_id     uuid NOT NULL REFERENCES users(id),
  author_role   text NOT NULL,          -- 'student' | 'reviewer'
  body          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_review_messages_completion
  ON credit_review_messages (completion_id, created_at);

-- Backend uses the service-role client; RLS on as defense in depth.
ALTER TABLE credit_review_messages ENABLE ROW LEVEL SECURITY;
