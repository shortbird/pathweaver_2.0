-- Migration: Create Tutorial Quest
-- Created: 2025-01-10
-- Description: Creates the "Explore the Optio Platform" tutorial quest with 12 auto-verified tasks

-- First, check if tutorial quest already exists and delete it if so (for idempotency)
DELETE FROM quests WHERE is_tutorial = TRUE;

-- Insert the tutorial quest
INSERT INTO quests (
    id,
    title,
    description,
    quest_type,
    is_tutorial,
    is_active,
    created_at,
    updated_at
) VALUES (
    gen_random_uuid(),
    'Explore the Optio Platform',
    'Welcome to Optio! Complete this quest to learn how the platform works. Your tasks will be automatically verified as you explore different features.',
    'optio',
    TRUE,
    TRUE,
    NOW(),
    NOW()
) RETURNING id;

-- Store the quest ID for reference (this will be used when creating sample tasks)
-- Note: In production, you'll need to run this script and capture the quest_id
-- Then update the QUEST_ID variable below with the actual UUID

-- For now, we'll create a temporary function to get the tutorial quest ID
CREATE OR REPLACE FUNCTION get_tutorial_quest_id() RETURNS UUID AS $$
    SELECT id FROM quests WHERE is_tutorial = TRUE LIMIT 1;
$$ LANGUAGE SQL;

-- Note: Sample tasks will be created when a user starts the tutorial
-- The tasks are personalized per user in the user_quest_tasks table
-- This SQL file only creates the quest itself

-- Sample tasks configuration (for reference - actual tasks created via API)
-- These will be created in user_quest_tasks when users start the tutorial:

COMMENT ON COLUMN quests.is_tutorial IS 'Tutorial Quest Tasks (created in user_quest_tasks when started):

PHASE 1: Profile Setup (Easy)
1. Complete your profile - Add first and last name
   - Pillar: communication, XP: 10
   - Verification: {type: profile_complete}

2. Write your bio - Tell us about yourself (20+ characters)
   - Pillar: communication, XP: 15
   - Verification: {type: bio_written, min_length: 20}

3. Make your portfolio public - Share your learning journey
   - Pillar: communication, XP: 10
   - Verification: {type: portfolio_public}

PHASE 2: Core Learning (Medium)
4. Pick up your first quest - Start a learning adventure
   - Pillar: stem, XP: 20
   - Verification: {type: quest_started, min_count: 2}

5. Customize a task - Make a quest your own
   - Pillar: art, XP: 25
   - Verification: {type: task_customized}

6. Complete your first task - Submit evidence and earn XP
   - Pillar: stem, XP: 30
   - Verification: {type: task_completed, min_count: 1}

7. Ask the AI tutor - Get help with your learning
   - Pillar: communication, XP: 20
   - Verification: {type: tutor_used}

PHASE 3: Social Features (Medium)
8. Make a connection - Send a friend request
   - Pillar: communication, XP: 15
   - Verification: {type: connection_made}

9. Connect with a parent - Have admin link your parent account
   - Pillar: communication, XP: 10
   - Verification: {type: parent_connected}

10. Add an observer - Have admin add extended family member
    - Pillar: communication, XP: 10
    - Verification: {type: observer_added}

PHASE 4: Achievement (Hard)
11. Start a badge - Choose a badge to pursue
    - Pillar: civics, XP: 25
    - Verification: {type: badge_started}

12. Complete your first quest - Finish all tasks in a quest
    - Pillar: stem, XP: 50
    - Verification: {type: quest_completed}

Total Tutorial XP: 240 points';

-- Clean up temporary function
-- DROP FUNCTION IF EXISTS get_tutorial_quest_id();

SELECT 'Tutorial quest created successfully!' as result;
SELECT id, title, is_tutorial FROM quests WHERE is_tutorial = TRUE;
