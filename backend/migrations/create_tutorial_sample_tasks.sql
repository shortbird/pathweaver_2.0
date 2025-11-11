-- Migration: Create Tutorial Quest Sample Tasks
-- Created: 2025-01-10
-- Description: Creates sample task templates for the tutorial quest

-- First, get the tutorial quest ID
DO $$
DECLARE
    v_quest_id UUID;
BEGIN
    -- Get tutorial quest ID
    SELECT id INTO v_quest_id FROM quests WHERE is_tutorial = TRUE LIMIT 1;

    IF v_quest_id IS NULL THEN
        RAISE EXCEPTION 'Tutorial quest not found. Run create_tutorial_quest.sql first.';
    END IF;

    -- Delete existing sample tasks for tutorial quest if any
    DELETE FROM quest_sample_tasks WHERE quest_id = v_quest_id;

    -- Insert sample tasks for tutorial quest
    -- Note: auto_complete and verification_query will be set when tasks are copied to user_quest_tasks

    -- PHASE 1: Profile Setup (Easy) --

    -- Task 1: Complete your profile
    INSERT INTO quest_sample_tasks (
        quest_id, title, description, pillar, xp_value, order_index, diploma_subjects
    ) VALUES (
        v_quest_id,
        'Complete your profile',
        'Add your first and last name to your profile. This helps us personalize your learning experience. (Auto-verified when you update your profile)',
        'communication',
        10,
        1,
        '{}'::jsonb
    );

    -- Task 2: Write your bio
    INSERT INTO quest_sample_tasks (
        quest_id, title, description, pillar, xp_value, order_index, diploma_subjects
    ) VALUES (
        v_quest_id,
        'Write your bio',
        'Tell us about yourself! Write a bio of at least 20 characters. Share your interests, goals, or what excites you about learning. (Auto-verified when you write your bio)',
        'communication',
        15,
        2,
        '{}'::jsonb
    );

    -- Task 3: Make your portfolio public
    INSERT INTO quest_sample_tasks (
        quest_id, title, description, pillar, xp_value, order_index, diploma_subjects
    ) VALUES (
        v_quest_id,
        'Make your portfolio public',
        'Share your learning journey with the world! Making your portfolio public allows you to showcase your achievements on your resume. (Auto-verified when you enable public portfolio)',
        'communication',
        10,
        3,
        '{}'::jsonb
    );

    -- PHASE 2: Core Learning (Medium) --

    -- Task 4: Pick up your first quest
    INSERT INTO quest_sample_tasks (
        quest_id, title, description, pillar, xp_value, order_index, diploma_subjects
    ) VALUES (
        v_quest_id,
        'Pick up your first quest',
        'Browse the quest hub and start a learning adventure! Choose any quest that interests you to get started. (Auto-verified when you start another quest)',
        'stem',
        20,
        4,
        '{}'::jsonb
    );

    -- Task 5: Customize a task
    INSERT INTO quest_sample_tasks (
        quest_id, title, description, pillar, xp_value, order_index, diploma_subjects
    ) VALUES (
        v_quest_id,
        'Customize a task',
        'Make a quest your own! Use the task personalization wizard to add or modify a task based on your interests. (Auto-verified when you add a custom task)',
        'art',
        25,
        5,
        '{}'::jsonb
    );

    -- Task 6: Complete your first task
    INSERT INTO quest_sample_tasks (
        quest_id, title, description, pillar, xp_value, order_index, diploma_subjects
    ) VALUES (
        v_quest_id,
        'Complete your first task',
        'Submit evidence for any task and earn your first XP! Evidence can be text, links, images, or documents. (Auto-verified when you complete any task)',
        'stem',
        30,
        6,
        '{}'::jsonb
    );

    -- Task 7: Ask the AI tutor
    INSERT INTO quest_sample_tasks (
        quest_id, title, description, pillar, xp_value, order_index, diploma_subjects
    ) VALUES (
        v_quest_id,
        'Ask the AI tutor',
        'Get help with your learning! Start a conversation with the AI tutor and ask a question about anything you''re working on. (Auto-verified when you send a tutor message)',
        'communication',
        20,
        7,
        '{}'::jsonb
    );

    -- PHASE 3: Social Features (Medium) --

    -- Task 8: Make a connection
    INSERT INTO quest_sample_tasks (
        quest_id, title, description, pillar, xp_value, order_index, diploma_subjects
    ) VALUES (
        v_quest_id,
        'Make a connection',
        'Build your learning community! Send a friend request to connect with other students and see what they''re learning. (Auto-verified when you make a connection)',
        'communication',
        15,
        8,
        '{}'::jsonb
    );

    -- Task 9: Connect with a parent (OPTIONAL)
    INSERT INTO quest_sample_tasks (
        quest_id, title, description, pillar, xp_value, order_index, diploma_subjects
    ) VALUES (
        v_quest_id,
        'Connect with a parent (Optional)',
        'Ask your admin to link your parent''s account so they can support your learning journey. This task is optional and can be skipped. (Auto-verified when parent connects)',
        'communication',
        10,
        9,
        '{}'::jsonb
    );

    -- Task 10: Add an observer (OPTIONAL)
    INSERT INTO quest_sample_tasks (
        quest_id, title, description, pillar, xp_value, order_index, diploma_subjects
    ) VALUES (
        v_quest_id,
        'Add an observer (Optional)',
        'Ask your admin to add extended family members who can follow your progress and celebrate your achievements. This task is optional and can be skipped. (Auto-verified when observer added)',
        'communication',
        10,
        10,
        '{}'::jsonb
    );

    -- PHASE 4: Achievement (Hard) --

    -- Task 11: Start a badge
    INSERT INTO quest_sample_tasks (
        quest_id, title, description, pillar, xp_value, order_index, diploma_subjects
    ) VALUES (
        v_quest_id,
        'Start a badge',
        'Choose a badge to pursue! Badges represent mastery in specific areas and show your unique strengths. (Auto-verified when you select a badge)',
        'civics',
        25,
        11,
        '{}'::jsonb
    );

    -- Task 12: Complete your first quest
    INSERT INTO quest_sample_tasks (
        quest_id, title, description, pillar, xp_value, order_index, diploma_subjects
    ) VALUES (
        v_quest_id,
        'Complete your first quest',
        'Finish all tasks in any quest to complete it! This is a major milestone in your learning journey. (Auto-verified when you complete a quest)',
        'stem',
        50,
        12,
        '{}'::jsonb
    );

    RAISE NOTICE 'Tutorial sample tasks created successfully! Total: 12 tasks, Total XP: 240';
END $$;

-- Verify the tasks were created
SELECT
    COUNT(*) as task_count,
    SUM(xp_value) as total_xp
FROM quest_sample_tasks st
JOIN quests q ON st.quest_id = q.id
WHERE q.is_tutorial = TRUE;
