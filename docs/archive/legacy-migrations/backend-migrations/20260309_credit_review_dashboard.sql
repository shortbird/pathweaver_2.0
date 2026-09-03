-- Credit Review Dashboard Migration
-- Adds accreditor role, accreditor review pipeline, and task merge support

-- Add accreditor to users.role CHECK constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('student', 'parent', 'advisor', 'observer', 'org_managed', 'superadmin', 'accreditor'));

-- Add accreditor_status to quest_task_completions
ALTER TABLE quest_task_completions
  ADD COLUMN IF NOT EXISTS accreditor_status TEXT DEFAULT 'not_reviewed'
    CHECK (accreditor_status IN ('not_reviewed', 'pending_accreditor', 'confirmed', 'flagged', 'overridden'));

-- Add merged status to diploma_status
ALTER TABLE quest_task_completions DROP CONSTRAINT IF EXISTS quest_task_completions_diploma_status_check;
ALTER TABLE quest_task_completions ADD CONSTRAINT quest_task_completions_diploma_status_check
  CHECK (diploma_status IN ('none', 'draft', 'ready_for_credit', 'pending_review', 'grow_this', 'approved', 'finalized', 'merged'));

-- Track what a merged completion was merged into
ALTER TABLE quest_task_completions
  ADD COLUMN IF NOT EXISTS merged_into UUID REFERENCES quest_task_completions(id);

-- Accreditor review records (audit trail)
CREATE TABLE IF NOT EXISTS accreditor_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  completion_id UUID NOT NULL REFERENCES quest_task_completions(id),
  reviewer_id UUID NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('confirmed', 'flagged', 'overridden')),
  flag_reason TEXT,
  override_subjects JSONB,
  override_xp INTEGER,
  notes TEXT,
  reviewed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accreditor_reviews_completion ON accreditor_reviews(completion_id);
CREATE INDEX IF NOT EXISTS idx_accreditor_reviews_reviewer ON accreditor_reviews(reviewer_id);

-- Task merge records (audit trail)
CREATE TABLE IF NOT EXISTS task_merges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merged_by UUID NOT NULL REFERENCES users(id),
  student_id UUID NOT NULL REFERENCES users(id),
  survivor_completion_id UUID NOT NULL REFERENCES quest_task_completions(id),
  final_xp INTEGER NOT NULL,
  merge_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_merge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merge_id UUID NOT NULL REFERENCES task_merges(id) ON DELETE CASCADE,
  completion_id UUID NOT NULL REFERENCES quest_task_completions(id),
  original_xp INTEGER NOT NULL
);

-- RLS policies
ALTER TABLE accreditor_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_merges ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_merge_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON accreditor_reviews FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON task_merges FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON task_merge_sources FOR ALL USING (true) WITH CHECK (true);
