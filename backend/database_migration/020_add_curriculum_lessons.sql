-- Migration 020: Add Curriculum Lessons System
-- Purpose: Support ordered curriculum lessons with progress tracking and search
-- Created: 2025-12-27
-- Part of: LMS Transformation - Sequential Learning Paths

BEGIN;

-- ========================================
-- 1. Create curriculum_lessons table
-- ========================================

-- Stores individual lessons within a quest's curriculum
CREATE TABLE IF NOT EXISTS curriculum_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to quest
  quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,

  -- Lesson metadata
  title TEXT NOT NULL,
  description TEXT,
  content JSONB NOT NULL DEFAULT '{"blocks": []}'::JSONB,  -- Same format as curriculum_content

  -- Ordering within the quest
  sequence_order INTEGER NOT NULL,  -- 1, 2, 3, etc. - determines lesson order

  -- Lesson status
  is_published BOOLEAN NOT NULL DEFAULT TRUE,  -- Draft vs published
  is_required BOOLEAN NOT NULL DEFAULT FALSE,  -- Required for quest completion?

  -- Estimated completion time (minutes)
  estimated_duration_minutes INTEGER,

  -- Prerequisites (array of lesson IDs that must be completed first)
  prerequisite_lesson_ids UUID[] DEFAULT ARRAY[]::UUID[],

  -- Search optimization
  search_vector TSVECTOR,  -- Full-text search index

  -- Authorship tracking
  created_by UUID NOT NULL REFERENCES users(id),
  last_edited_by UUID REFERENCES users(id),
  last_edited_at TIMESTAMPTZ DEFAULT NULL,

  -- Organization linkage (for multi-tenancy)
  organization_id UUID NOT NULL REFERENCES organizations(id),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint: prevent duplicate sequence numbers within a quest
  UNIQUE(quest_id, sequence_order)
);

-- Indexes for curriculum_lessons
CREATE INDEX IF NOT EXISTS idx_curriculum_lessons_quest_id ON curriculum_lessons(quest_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_lessons_organization_id ON curriculum_lessons(organization_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_lessons_sequence_order ON curriculum_lessons(quest_id, sequence_order);
CREATE INDEX IF NOT EXISTS idx_curriculum_lessons_is_published ON curriculum_lessons(is_published);
CREATE INDEX IF NOT EXISTS idx_curriculum_lessons_search_vector ON curriculum_lessons USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_curriculum_lessons_content ON curriculum_lessons USING GIN (content);
CREATE INDEX IF NOT EXISTS idx_curriculum_lessons_created_by ON curriculum_lessons(created_by);

-- ========================================
-- 2. Create curriculum_settings table
-- ========================================

-- Stores global curriculum settings per quest (mode, completion rules, etc.)
CREATE TABLE IF NOT EXISTS curriculum_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to quest (one-to-one relationship)
  quest_id UUID NOT NULL UNIQUE REFERENCES quests(id) ON DELETE CASCADE,

  -- Navigation mode
  navigation_mode TEXT NOT NULL DEFAULT 'sequential',  -- 'sequential' or 'free'
  CHECK (navigation_mode IN ('sequential', 'free')),

  -- Completion requirements
  require_all_lessons BOOLEAN NOT NULL DEFAULT TRUE,  -- Must complete all lessons?
  minimum_lessons_required INTEGER DEFAULT NULL,  -- Or just a minimum number?

  -- Progress visibility
  show_progress_bar BOOLEAN NOT NULL DEFAULT TRUE,
  show_lesson_count BOOLEAN NOT NULL DEFAULT TRUE,

  -- UI preferences
  auto_advance_on_complete BOOLEAN NOT NULL DEFAULT FALSE,  -- Auto-advance to next lesson?
  show_table_of_contents BOOLEAN NOT NULL DEFAULT TRUE,

  -- Organization linkage
  organization_id UUID NOT NULL REFERENCES organizations(id),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for curriculum_settings
CREATE INDEX IF NOT EXISTS idx_curriculum_settings_quest_id ON curriculum_settings(quest_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_settings_organization_id ON curriculum_settings(organization_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_settings_navigation_mode ON curriculum_settings(navigation_mode);

-- ========================================
-- 3. Create curriculum_lesson_progress table
-- ========================================

-- Tracks individual user progress through lessons
CREATE TABLE IF NOT EXISTS curriculum_lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Links
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES curriculum_lessons(id) ON DELETE CASCADE,
  quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,  -- Denormalized for perf

  -- Progress status
  status TEXT NOT NULL DEFAULT 'not_started',  -- 'not_started', 'in_progress', 'completed'
  CHECK (status IN ('not_started', 'in_progress', 'completed')),

  -- Progress tracking
  progress_percentage INTEGER NOT NULL DEFAULT 0,  -- 0-100
  CHECK (progress_percentage >= 0 AND progress_percentage <= 100),

  -- Time tracking
  time_spent_seconds INTEGER NOT NULL DEFAULT 0,  -- Total time spent on this lesson
  started_at TIMESTAMPTZ DEFAULT NULL,
  completed_at TIMESTAMPTZ DEFAULT NULL,

  -- Last position (for resuming)
  last_position JSONB DEFAULT NULL,  -- { "scrollY": 0, "blockIndex": 0, etc. }

  -- Organization linkage
  organization_id UUID NOT NULL REFERENCES organizations(id),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint: one progress record per user per lesson
  UNIQUE(user_id, lesson_id)
);

-- Indexes for curriculum_lesson_progress
CREATE INDEX IF NOT EXISTS idx_curriculum_lesson_progress_user_id ON curriculum_lesson_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_lesson_progress_lesson_id ON curriculum_lesson_progress(lesson_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_lesson_progress_quest_id ON curriculum_lesson_progress(quest_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_lesson_progress_status ON curriculum_lesson_progress(status);
CREATE INDEX IF NOT EXISTS idx_curriculum_lesson_progress_organization_id ON curriculum_lesson_progress(organization_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_lesson_progress_user_quest ON curriculum_lesson_progress(user_id, quest_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_lesson_progress_completed_at ON curriculum_lesson_progress(completed_at);

-- ========================================
-- 4. Row-Level Security (RLS) Policies
-- ========================================

-- Enable RLS on all three tables
ALTER TABLE curriculum_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_lesson_progress ENABLE ROW LEVEL SECURITY;

-- === curriculum_lessons RLS ===

-- Policy: Users can view published lessons from their organization
CREATE POLICY curriculum_lessons_org_isolation ON curriculum_lessons
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM users WHERE id = auth.uid()
  )
  AND is_published = TRUE
);

-- Policy: Teachers/admins can insert lessons for their org's quests
CREATE POLICY curriculum_lessons_insert ON curriculum_lessons
FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM users WHERE id = auth.uid()
  )
  AND quest_id IN (
    SELECT id FROM quests WHERE organization_id = curriculum_lessons.organization_id
  )
  AND EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('teacher', 'admin', 'superadmin')
  )
);

-- Policy: Teachers/admins can update lessons in their org
CREATE POLICY curriculum_lessons_update ON curriculum_lessons
FOR UPDATE
USING (
  organization_id IN (
    SELECT organization_id FROM users WHERE id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('teacher', 'admin', 'superadmin')
  )
);

-- Policy: Teachers/admins can delete lessons in their org
CREATE POLICY curriculum_lessons_delete ON curriculum_lessons
FOR DELETE
USING (
  organization_id IN (
    SELECT organization_id FROM users WHERE id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('teacher', 'admin', 'superadmin')
  )
);

-- === curriculum_settings RLS ===

-- Policy: Users can view settings from their organization's quests
CREATE POLICY curriculum_settings_org_isolation ON curriculum_settings
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM users WHERE id = auth.uid()
  )
);

-- Policy: Teachers/admins can insert settings for their org's quests
CREATE POLICY curriculum_settings_insert ON curriculum_settings
FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM users WHERE id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('teacher', 'admin', 'superadmin')
  )
);

-- Policy: Teachers/admins can update settings in their org
CREATE POLICY curriculum_settings_update ON curriculum_settings
FOR UPDATE
USING (
  organization_id IN (
    SELECT organization_id FROM users WHERE id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('teacher', 'admin', 'superadmin')
  )
);

-- === curriculum_lesson_progress RLS ===

-- Policy: Users can view their own progress
CREATE POLICY curriculum_lesson_progress_select ON curriculum_lesson_progress
FOR SELECT
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('teacher', 'admin', 'superadmin')
  )
);

-- Policy: Users can insert their own progress records
CREATE POLICY curriculum_lesson_progress_insert ON curriculum_lesson_progress
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND organization_id IN (
    SELECT organization_id FROM users WHERE id = auth.uid()
  )
);

-- Policy: Users can update their own progress
CREATE POLICY curriculum_lesson_progress_update ON curriculum_lesson_progress
FOR UPDATE
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('teacher', 'admin', 'superadmin')
  )
);

-- ========================================
-- 5. Full-Text Search Function
-- ========================================

-- Function to update search_vector when lesson content changes
CREATE OR REPLACE FUNCTION update_curriculum_lesson_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.content::TEXT, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update search vector
CREATE TRIGGER trigger_update_curriculum_lesson_search_vector
BEFORE INSERT OR UPDATE OF title, description, content ON curriculum_lessons
FOR EACH ROW
EXECUTE FUNCTION update_curriculum_lesson_search_vector();

-- ========================================
-- 6. Updated_at Triggers
-- ========================================

-- Trigger for curriculum_lessons
CREATE OR REPLACE FUNCTION update_curriculum_lessons_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_curriculum_lessons_updated_at
BEFORE UPDATE ON curriculum_lessons
FOR EACH ROW
EXECUTE FUNCTION update_curriculum_lessons_updated_at();

-- Trigger for curriculum_settings
CREATE OR REPLACE FUNCTION update_curriculum_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_curriculum_settings_updated_at
BEFORE UPDATE ON curriculum_settings
FOR EACH ROW
EXECUTE FUNCTION update_curriculum_settings_updated_at();

-- Trigger for curriculum_lesson_progress
CREATE OR REPLACE FUNCTION update_curriculum_lesson_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_curriculum_lesson_progress_updated_at
BEFORE UPDATE ON curriculum_lesson_progress
FOR EACH ROW
EXECUTE FUNCTION update_curriculum_lesson_progress_updated_at();

-- ========================================
-- 7. Comments for Documentation
-- ========================================

COMMENT ON TABLE curriculum_lessons IS 'Individual lessons within a quest curriculum (ordered, with prerequisites)';
COMMENT ON COLUMN curriculum_lessons.sequence_order IS 'Order of lesson within quest (1, 2, 3, ...) - enforced unique per quest';
COMMENT ON COLUMN curriculum_lessons.content IS 'Structured JSONB: { "blocks": [{ "type": "text|iframe|document", "content": "...", "data": {...} }] }';
COMMENT ON COLUMN curriculum_lessons.prerequisite_lesson_ids IS 'Array of lesson IDs that must be completed before this one (for sequential mode)';
COMMENT ON COLUMN curriculum_lessons.search_vector IS 'Full-text search index (auto-updated via trigger)';

COMMENT ON TABLE curriculum_settings IS 'Global curriculum settings per quest (navigation mode, completion rules, UI preferences)';
COMMENT ON COLUMN curriculum_settings.navigation_mode IS 'sequential = must complete in order | free = can access any lesson';
COMMENT ON COLUMN curriculum_settings.require_all_lessons IS 'TRUE = must complete all lessons | FALSE = use minimum_lessons_required';

COMMENT ON TABLE curriculum_lesson_progress IS 'Tracks individual user progress through curriculum lessons';
COMMENT ON COLUMN curriculum_lesson_progress.status IS 'not_started | in_progress | completed';
COMMENT ON COLUMN curriculum_lesson_progress.last_position IS 'JSONB snapshot of user scroll/position for resuming lesson';
COMMENT ON COLUMN curriculum_lesson_progress.time_spent_seconds IS 'Total seconds spent on this lesson (for analytics)';

-- ========================================
-- 8. Create curriculum_lesson_tasks table
-- ========================================

-- Links tasks to specific lessons for Just-in-Time Teaching
CREATE TABLE IF NOT EXISTS curriculum_lesson_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Links
  lesson_id UUID NOT NULL REFERENCES curriculum_lessons(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES user_quest_tasks(id) ON DELETE CASCADE,
  quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,

  -- Display order within lesson
  display_order INTEGER NOT NULL DEFAULT 0,

  -- Organization linkage
  organization_id UUID REFERENCES organizations(id),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint: one task can only be linked to one lesson
  UNIQUE(lesson_id, task_id)
);

-- Indexes for curriculum_lesson_tasks
CREATE INDEX IF NOT EXISTS idx_curriculum_lesson_tasks_lesson_id ON curriculum_lesson_tasks(lesson_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_lesson_tasks_task_id ON curriculum_lesson_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_lesson_tasks_quest_id ON curriculum_lesson_tasks(quest_id);

-- Enable RLS
ALTER TABLE curriculum_lesson_tasks ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view task links from their organization's quests
CREATE POLICY curriculum_lesson_tasks_select ON curriculum_lesson_tasks
FOR SELECT
USING (
  quest_id IN (
    SELECT id FROM quests WHERE organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  )
);

-- Policy: Teachers/admins can insert/delete task links
CREATE POLICY curriculum_lesson_tasks_modify ON curriculum_lesson_tasks
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('teacher', 'admin', 'superadmin')
  )
);

COMMENT ON TABLE curriculum_lesson_tasks IS 'Links quest tasks to curriculum lessons for Just-in-Time Teaching';

COMMIT;
