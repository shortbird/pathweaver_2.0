-- Create lesson_reflections table for optional student reflection prompts
CREATE TABLE IF NOT EXISTS lesson_reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  lesson_id UUID NOT NULL,
  quest_id UUID NOT NULL,
  prompt TEXT NOT NULL,
  response TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, lesson_id)
);

-- Enable RLS
ALTER TABLE lesson_reflections ENABLE ROW LEVEL SECURITY;

-- Users can read their own reflections
CREATE POLICY "Users can read own reflections"
  ON lesson_reflections FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own reflections
CREATE POLICY "Users can insert own reflections"
  ON lesson_reflections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own reflections
CREATE POLICY "Users can update own reflections"
  ON lesson_reflections FOR UPDATE
  USING (auth.uid() = user_id);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_lesson_reflections_user_lesson
  ON lesson_reflections(user_id, lesson_id);
