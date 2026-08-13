-- Add class-type quest fields to support the "Start a Class" mobile feature.
-- A class is a quest with quest_type='class' that targets a single transcript
-- subject and tracks progress toward 1000 XP (one semester credit). Per-task
-- credit review still flows through quest_task_completions; the class itself
-- gets a separate holistic review when the student submits at >=1000 XP.

ALTER TABLE quests
  ADD COLUMN IF NOT EXISTS transcript_subject text,
  ADD COLUMN IF NOT EXISTS class_review_status text,
  ADD COLUMN IF NOT EXISTS class_review_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS class_review_notes text;

ALTER TABLE quests
  DROP CONSTRAINT IF EXISTS quests_transcript_subject_check;

ALTER TABLE quests
  ADD CONSTRAINT quests_transcript_subject_check
  CHECK (
    transcript_subject IS NULL OR transcript_subject IN (
      'language_arts', 'math', 'science', 'social_studies',
      'financial_literacy', 'health', 'pe', 'fine_arts',
      'cte', 'digital_literacy', 'electives'
    )
  );

ALTER TABLE quests
  DROP CONSTRAINT IF EXISTS quests_class_review_status_check;

ALTER TABLE quests
  ADD CONSTRAINT quests_class_review_status_check
  CHECK (
    class_review_status IS NULL OR class_review_status IN (
      'submitted_for_review', 'credit_awarded', 'rejected'
    )
  );

CREATE INDEX IF NOT EXISTS idx_quests_class_type_subject
  ON quests(quest_type, transcript_subject)
  WHERE quest_type = 'class';

CREATE INDEX IF NOT EXISTS idx_quests_class_review_status
  ON quests(class_review_status)
  WHERE class_review_status IS NOT NULL;
