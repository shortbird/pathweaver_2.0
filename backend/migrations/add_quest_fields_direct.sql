-- Add new quest template fields directly to quests table
-- This migration adds fields needed for the new quest creation form

-- Add new columns to quests table if they don't exist
ALTER TABLE quests
ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'general',
ADD COLUMN IF NOT EXISTS subcategory VARCHAR(100),
ADD COLUMN IF NOT EXISTS difficulty_level VARCHAR(50) DEFAULT 'intermediate' CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced', 'expert')),
ADD COLUMN IF NOT EXISTS estimated_hours INTEGER,
ADD COLUMN IF NOT EXISTS materials_needed TEXT,
ADD COLUMN IF NOT EXISTS location_type VARCHAR(50) DEFAULT 'anywhere' CHECK (location_type IN ('anywhere', 'local_community', 'specific_location')),
ADD COLUMN IF NOT EXISTS specific_location TEXT,
ADD COLUMN IF NOT EXISTS location_radius INTEGER,
ADD COLUMN IF NOT EXISTS is_seasonal BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS seasonal_start_date DATE,
ADD COLUMN IF NOT EXISTS seasonal_end_date DATE,
ADD COLUMN IF NOT EXISTS collaboration_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS max_team_size INTEGER DEFAULT 5 CHECK (max_team_size BETWEEN 1 AND 5),
ADD COLUMN IF NOT EXISTS collaboration_prompt TEXT;

-- Add new columns to quest_tasks table if they don't exist
ALTER TABLE quest_tasks
ADD COLUMN IF NOT EXISTS evidence_types TEXT[] DEFAULT ARRAY['text', 'image'],
ADD COLUMN IF NOT EXISTS xp_value INTEGER DEFAULT 100;

-- Create index for frequently queried fields
CREATE INDEX IF NOT EXISTS idx_quests_category ON quests(category);
CREATE INDEX IF NOT EXISTS idx_quests_location_type ON quests(location_type);
CREATE INDEX IF NOT EXISTS idx_quests_seasonal ON quests(is_seasonal, seasonal_start_date, seasonal_end_date);

-- Add description column to quests if not exists
ALTER TABLE quests
ADD COLUMN IF NOT EXISTS description TEXT;