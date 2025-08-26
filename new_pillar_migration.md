Quest & Diploma Pillar Refactor: Implementation Guide
Objective: To refactor the application's quest data structure and educational framework. This involves two major, interconnected changes:

Pillar Migration: Transitioning from the six legacy skill categories to the five new Diploma Pillars.

Quest Structure Refactor: Updating the quest format to be more narrative-driven and intrinsically motivating, focusing on the learning process itself.

Important Note: This plan includes a destructive step to delete all existing quest data to ensure a clean start with the new model.

This guide details the necessary changes across the database, backend, and frontend.

Phase 1: Database Schema Changes
This phase prepares the database for both the new quest structure and the five-pillar framework.

1.1. Create a Single Migration File
Create a new Supabase migration file: supabase/migrations/YYYYMMDD_full_quest_refactor.sql. This file will contain all schema changes.

1.2. Modify the quests Table & Clear Existing Data
This script adds all new columns for the refactored quest structure and then removes all existing quest-related data.

-- Add new columns for the refactored quest structure
ALTER TABLE quests ADD COLUMN IF NOT EXISTS big_idea TEXT;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS what_youll_create TEXT[];
ALTER TABLE quests ADD COLUMN IF NOT EXISTS primary_pillar TEXT;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS intensity TEXT; -- Replaces difficulty_level and effort_level
ALTER TABLE quests ADD COLUMN IF NOT EXISTS estimated_time TEXT; -- More flexible than integer hours
ALTER TABLE quests ADD COLUMN IF NOT EXISTS helpful_resources JSONB;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS your_mission TEXT[];
ALTER TABLE quests ADD COLUMN IF NOT EXISTS showcase_your_journey TEXT;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS collaboration_spark TEXT;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS real_world_bonus JSONB;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS log_bonus JSONB;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS heads_up TEXT;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS location TEXT;

-- Note: We will drop old columns in a later migration after data is verified.

-- DANGEROUS: This next step will delete all existing quest data to start fresh.
-- Ensure you have a backup if you need to preserve old data.
TRUNCATE TABLE
    quests,
    quest_skill_xp,
    user_quests
CASCADE;

1.3. Update skill_category to pillar Constraints
This script updates the CHECK constraints to enforce the five new Diploma Pillars.

-- Drop the old CHECK constraint from user_skill_xp
ALTER TABLE user_skill_xp DROP CONSTRAINT IF EXISTS user_skill_xp_skill_category_check;

-- Add the new CHECK constraint for the 5 pillars
ALTER TABLE user_skill_xp ADD CONSTRAINT user_skill_xp_pillar_check
CHECK (skill_category IN ('creativity', 'critical_thinking', 'practical_skills', 'communication', 'cultural_literacy'));

-- Drop the old CHECK constraint from quest_skill_xp
ALTER TABLE quest_skill_xp DROP CONSTRAINT IF EXISTS quest_skill_xp_skill_category_check;

-- Add the new CHECK constraint for the 5 pillars
ALTER TABLE quest_skill_xp ADD CONSTRAINT quest_skill_xp_pillar_check
CHECK (skill_category IN ('creativity', 'critical_thinking', 'practical_skills', 'communication', 'cultural_literacy'));

1.4. Create the learning_logs Table
This new table will store the log entries students make during a quest.

CREATE TABLE IF NOT EXISTS learning_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_quest_id INTEGER REFERENCES user_quests(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    log_entry TEXT NOT NULL,
    media_url TEXT, -- Optional URL for a photo or video
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes and RLS policies
CREATE INDEX IF NOT EXISTS idx_learning_logs_user_quest_id ON learning_logs(user_quest_id);
ALTER TABLE learning_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own learning logs" ON learning_logs
    FOR ALL USING (auth.uid() = user_id);

Phase 2: Backend Implementation
Update the backend logic to support the new data structures and framework.

2.1. Update Backend Constants & AI Prompts
File to Modify: backend/routes/ai_quest_bulk_generator.py

Action:

Replace the SKILL_CATEGORY_DETAILS dictionary with the new DIPLOMA_PILLAR_DETAILS structure, which includes pillars, competencies, and examples.

Rename generate_category_specific_prompt() to generate_pillar_specific_prompt().

Update the AI prompt template to generate quests using the new fields (big_idea, your_mission, etc.) and terminology (pillar, core_competencies). The AI should now be instructed to generate quests based on the five pillars.

2.2. Implement the Learning Log Feature
New File: Create backend/routes/learning_log.py.

Endpoint: POST /api/quests/:user_quest_id/log

Logic:

Accept { "log_entry": "...", "media_url": "..." }.

Create a new entry in the learning_logs table.

On the first log entry for a given user_quest_id, check the quest for a log_bonus.

If a log_bonus exists, award the specified XP to the user. This is a one-time bonus.

Phase 3: Frontend Implementation
Update the UI to reflect the new quest structure and five Diploma Pillars.

3.1. Admin Quest Manager (AdminQuestManager.jsx)
Redesign the quest creation/editing form to use the new fields (big_idea, intensity, helpful_resources, etc.).

The UI should now be organized around the five pillars and their associated competencies.

3.2. Quest Detail Page (QuestDetailPage.jsx)
This is the most critical UI change. Rebuild the page to present quests in the new narrative format:

The Big Picture

Your Toolkit

The Journey (including the new Learning Log feature)

Go Further

The Fine Print (conditional)

3.3. Dashboards and Diplomas
Files: DashboardPage.jsx, DiplomaPage.jsx

Action: Update all charts, labels, and data transformations to use the five pillars. The charts will now render five data points instead of six.

3.4. Quest Library and Cards
Files: QuestsPage.jsx, QuestCard.jsx

Action: Update filters and display components to use the five pillars and the new intensity metric.

Phase 4: Deployment & Testing Checklist
Backup: Create a full backup of the production database.

Deploy Schema: Run the comprehensive SQL migration from Phase 1. This will delete all quest data.

Deploy Backend: Deploy the updated backend code.

Deploy Frontend: Deploy the updated frontend code.

Test Thoroughly:

✅ Admin: Can a new quest be created and edited using the full new structure? Does the AI bulk generator work correctly?

✅ Student: Can a student view a quest in the new layout, add a learning log entry, and receive the log bonus?

✅ Public Diploma: Does the public diploma page correctly display the five pillars?

✅ New User: Does a new user get correctly initialized with the five pillars in their user_skill_xp table?