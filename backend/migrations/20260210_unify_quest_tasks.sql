-- Migration: Unify Quest Tasks
-- Date: 2026-02-10
-- Description: Create unified quest_template_tasks table, migrate data from
--              course_quest_tasks and quest_sample_tasks, deprecate quest_type column

-- =====================================================
-- PHASE 1: Create new unified quest_template_tasks table
-- =====================================================

CREATE TABLE IF NOT EXISTS quest_template_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,

  -- Task content
  title VARCHAR(500) NOT NULL,
  description TEXT,
  pillar VARCHAR(50) NOT NULL DEFAULT 'stem',
  xp_value INTEGER DEFAULT 100,

  -- Ordering and requirements
  order_index INTEGER DEFAULT 0,
  is_required BOOLEAN DEFAULT false,  -- TRUE = auto-copy on enrollment, FALSE = optional suggestion

  -- Subject/diploma tracking
  diploma_subjects TEXT[] DEFAULT ARRAY['Electives']::TEXT[],
  subject_xp_distribution JSONB DEFAULT '{}'::JSONB,

  -- Tracking metadata
  usage_count INTEGER DEFAULT 0,
  flag_count INTEGER DEFAULT 0,
  is_flagged BOOLEAN DEFAULT false,

  -- Source tracking (for AI-generated or imported tasks)
  ai_generated BOOLEAN DEFAULT false,
  spark_assignment_id UUID,  -- Optional reference to spark_assignments (if table exists)
  source_metadata JSONB DEFAULT '{}'::JSONB,  -- flexible metadata storage

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_quest_template_tasks_quest_id
  ON quest_template_tasks(quest_id);

CREATE INDEX IF NOT EXISTS idx_quest_template_tasks_quest_required
  ON quest_template_tasks(quest_id, is_required);

CREATE INDEX IF NOT EXISTS idx_quest_template_tasks_quest_order
  ON quest_template_tasks(quest_id, order_index);

CREATE INDEX IF NOT EXISTS idx_quest_template_tasks_pillar
  ON quest_template_tasks(quest_id, pillar);

CREATE INDEX IF NOT EXISTS idx_quest_template_tasks_flagged
  ON quest_template_tasks(quest_id, is_flagged) WHERE is_flagged = true;

CREATE INDEX IF NOT EXISTS idx_quest_template_tasks_usage
  ON quest_template_tasks(quest_id, usage_count DESC);

-- Add comments
COMMENT ON TABLE quest_template_tasks IS 'Unified template tasks for quests - replaces both course_quest_tasks and quest_sample_tasks';
COMMENT ON COLUMN quest_template_tasks.is_required IS 'If TRUE, task is auto-copied to user on enrollment. If FALSE, shown as optional suggestion in wizard.';
COMMENT ON COLUMN quest_template_tasks.flag_count IS 'Number of times this task has been flagged by users';
COMMENT ON COLUMN quest_template_tasks.is_flagged IS 'Auto-set to true when flag_count >= 3, requires admin review';
COMMENT ON COLUMN quest_template_tasks.source_metadata IS 'Flexible JSON storage for tracking task origin (migrated_from, original_table, etc.)';

-- =====================================================
-- PHASE 2: Migrate data from course_quest_tasks (required tasks)
-- =====================================================

-- Only migrate if course_quest_tasks table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'course_quest_tasks') THEN
    INSERT INTO quest_template_tasks (
      quest_id,
      title,
      description,
      pillar,
      xp_value,
      order_index,
      is_required,
      diploma_subjects,
      subject_xp_distribution,
      source_metadata,
      created_at,
      updated_at
    )
    SELECT
      quest_id,
      title,
      description,
      pillar,
      COALESCE(xp_value, 100),
      COALESCE(order_index, 0),
      COALESCE(is_required, true),  -- Course tasks default to required
      ARRAY['Electives']::TEXT[],  -- Default value, actual subjects tracked in subject_xp_distribution
      COALESCE(subject_xp_distribution, '{}'::JSONB),
      jsonb_build_object(
        'migrated_from', 'course_quest_tasks',
        'original_id', id,
        'migrated_at', NOW()
      ),
      COALESCE(created_at, NOW()),
      COALESCE(updated_at, NOW())
    FROM course_quest_tasks
    WHERE NOT EXISTS (
      SELECT 1 FROM quest_template_tasks tt
      WHERE tt.quest_id = course_quest_tasks.quest_id
        AND tt.title = course_quest_tasks.title
        AND (tt.source_metadata->>'migrated_from') = 'course_quest_tasks'
    );
    RAISE NOTICE 'Migrated data from course_quest_tasks';
  ELSE
    RAISE NOTICE 'course_quest_tasks table does not exist, skipping migration';
  END IF;
END $$;

-- =====================================================
-- PHASE 3: Migrate data from quest_sample_tasks (optional suggestions)
-- =====================================================

-- Only migrate if quest_sample_tasks table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'quest_sample_tasks') THEN
    INSERT INTO quest_template_tasks (
      quest_id,
      title,
      description,
      pillar,
      xp_value,
      order_index,
      is_required,
      diploma_subjects,
      subject_xp_distribution,
      ai_generated,
      usage_count,
      flag_count,
      is_flagged,
      source_metadata,
      created_at,
      updated_at
    )
    SELECT
      quest_id,
      title,
      description,
      pillar,
      COALESCE(xp_value, 100),
      COALESCE(order_index, 0),
      false,  -- Sample tasks are optional suggestions
      ARRAY['Electives']::TEXT[],  -- Default value, actual subjects tracked in subject_xp_distribution
      COALESCE(subject_xp_distribution, '{}'::JSONB),
      COALESCE(ai_generated, false),
      COALESCE(usage_count, 0),
      COALESCE(flag_count, 0),
      COALESCE(is_flagged, false),
      jsonb_build_object(
        'migrated_from', 'quest_sample_tasks',
        'original_id', id,
        'migrated_at', NOW()
      ),
      COALESCE(created_at, NOW()),
      COALESCE(updated_at, NOW())
    FROM quest_sample_tasks
    WHERE NOT EXISTS (
      SELECT 1 FROM quest_template_tasks tt
      WHERE tt.quest_id = quest_sample_tasks.quest_id
        AND tt.title = quest_sample_tasks.title
        AND (tt.source_metadata->>'migrated_from') = 'quest_sample_tasks'
    );
    RAISE NOTICE 'Migrated data from quest_sample_tasks';
  ELSE
    RAISE NOTICE 'quest_sample_tasks table does not exist, skipping migration';
  END IF;
END $$;

-- =====================================================
-- PHASE 4: Add allow_custom_tasks column to quests table
-- =====================================================

-- Add column to control whether students can add custom tasks
ALTER TABLE quests
  ADD COLUMN IF NOT EXISTS allow_custom_tasks BOOLEAN DEFAULT true;

COMMENT ON COLUMN quests.allow_custom_tasks IS 'If TRUE, students can add their own custom tasks in addition to template tasks';

-- =====================================================
-- PHASE 5: Update quest_task_flags to reference new table
-- =====================================================

-- Create new quest_task_flags table referencing quest_template_tasks
-- (keeping old table intact for now)
CREATE TABLE IF NOT EXISTS quest_template_task_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_task_id UUID REFERENCES quest_template_tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  flag_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quest_template_task_flags_task
  ON quest_template_task_flags(template_task_id);

-- =====================================================
-- PHASE 6: Add source_template_task_id to user_quest_tasks for tracking
-- =====================================================

ALTER TABLE user_quest_tasks
  ADD COLUMN IF NOT EXISTS source_template_task_id UUID REFERENCES quest_template_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_quest_tasks_source_template
  ON user_quest_tasks(source_template_task_id) WHERE source_template_task_id IS NOT NULL;

COMMENT ON COLUMN user_quest_tasks.source_template_task_id IS 'Reference to the template task this was copied from (for analytics and updates)';

-- =====================================================
-- VERIFICATION QUERIES (run these to verify migration)
-- =====================================================

-- Check migration counts:
-- SELECT 'course_quest_tasks' as source, count(*) FROM course_quest_tasks
-- UNION ALL
-- SELECT 'quest_sample_tasks' as source, count(*) FROM quest_sample_tasks
-- UNION ALL
-- SELECT 'quest_template_tasks (total)' as source, count(*) FROM quest_template_tasks
-- UNION ALL
-- SELECT 'quest_template_tasks (required)' as source, count(*) FROM quest_template_tasks WHERE is_required = true
-- UNION ALL
-- SELECT 'quest_template_tasks (optional)' as source, count(*) FROM quest_template_tasks WHERE is_required = false;

-- Verify data integrity:
-- SELECT
--   q.id as quest_id,
--   q.title as quest_title,
--   q.quest_type,
--   count(tt.id) as template_task_count,
--   sum(case when tt.is_required then 1 else 0 end) as required_count,
--   sum(case when not tt.is_required then 1 else 0 end) as optional_count
-- FROM quests q
-- LEFT JOIN quest_template_tasks tt ON tt.quest_id = q.id
-- GROUP BY q.id, q.title, q.quest_type
-- ORDER BY template_task_count DESC
-- LIMIT 20;
