- SPARK Integration Test Data Setup
-- Run this via Supabase SQL Editor or MCP execute_sql
-- Creates test quest and tasks for Spark webhook testing

-- =====================================================
-- STEP 1: Create Test Quest
-- =====================================================

-- First, check if test quest already exists
-- If it does, update it instead of inserting
DO $$
DECLARE
    test_quest_id UUID;
BEGIN
    -- Check if quest exists
    SELECT id INTO test_quest_id
    FROM quests
    WHERE lms_assignment_id = 'test_assignment_001'
    AND lms_platform = 'spark';

    IF test_quest_id IS NULL THEN
        -- Create new test quest
        INSERT INTO quests (
            id,
            title,
            description,
            quest_type,
            lms_platform,
            lms_assignment_id,
            lms_course_id,
            is_active,
            created_at
        ) VALUES (
            gen_random_uuid(),
            'Spark Test Assignment - Introduction to Python',
            'This is a test quest for Spark LMS integration. Students will complete basic Python programming tasks and submit their work via Spark LMS.',
            'course',
            'spark',
            'test_assignment_001',
            'test_course_001',
            true,
            NOW()
        ) RETURNING id INTO test_quest_id;

        RAISE NOTICE 'Created new test quest with ID: %', test_quest_id;
    ELSE
        -- Update existing quest
        UPDATE quests
        SET
            title = 'Spark Test Assignment - Introduction to Python',
            description = 'This is a test quest for Spark LMS integration. Students will complete basic Python programming tasks and submit their work via Spark LMS.',
            is_active = true,
            updated_at = NOW()
        WHERE id = test_quest_id;

        RAISE NOTICE 'Updated existing test quest with ID: %', test_quest_id;
    END IF;

    -- =====================================================
    -- STEP 2: Create Preset Tasks for the Quest
    -- =====================================================

    -- Delete existing preset tasks (if any)
    DELETE FROM quest_preset_tasks WHERE quest_id = test_quest_id;

    -- Insert preset tasks
    INSERT INTO quest_preset_tasks (
        id,
        quest_id,
        title,
        description,
        pillar,
        xp_value,
        order_index,
        is_required,
        created_at
    ) VALUES
    (
        gen_random_uuid(),
        test_quest_id,
        'Complete Python Basics Module',
        'Learn Python fundamentals including variables, data types, loops, and functions. Complete all exercises in the basics module.',
        'stem',
        100,
        1,
        true,
        NOW()
    ),
    (
        gen_random_uuid(),
        test_quest_id,
        'Build Calculator Program',
        'Create a simple calculator program that can perform addition, subtraction, multiplication, and division. Include error handling for division by zero.',
        'stem',
        150,
        2,
        true,
        NOW()
    ),
    (
        gen_random_uuid(),
        test_quest_id,
        'Debug Existing Code',
        'Download the provided Python script and fix 5 common errors including syntax errors, logic errors, and runtime errors.',
        'stem',
        100,
        3,
        true,
        NOW()
    );

    RAISE NOTICE 'Created 3 preset tasks for quest';

END $$;

-- =====================================================
-- STEP 3: Verify Test Data
-- =====================================================

-- Show the created quest
SELECT
    id,
    title,
    quest_type,
    lms_platform,
    lms_assignment_id,
    lms_course_id,
    is_active
FROM quests
WHERE lms_assignment_id = 'test_assignment_001'
AND lms_platform = 'spark';

-- Show the created preset tasks
SELECT
    qpt.id,
    qpt.title,
    qpt.pillar,
    qpt.xp_value,
    qpt.order_index,
    qpt.is_required
FROM quest_preset_tasks qpt
JOIN quests q ON qpt.quest_id = q.id
WHERE q.lms_assignment_id = 'test_assignment_001'
AND q.lms_platform = 'spark'
ORDER BY qpt.order_index;

-- =====================================================
-- STEP 4: Setup Instructions
-- =====================================================

/*
NEXT STEPS FOR TESTING:

1. Verify test data created successfully (see output above)

2. Run SSO test to create test user:
   export SPARK_SSO_SECRET=your_secret_here
   node test_spark_sso.js
   # Open the URL in browser to create user account

3. Log in as spark-test@optioeducation.com

4. Start the test quest:
   - Navigate to Quest Badge Hub
   - Find "Spark Test Assignment - Introduction to Python"
   - Click "Pick Up Quest"
   - Verify 3 tasks appear in your quest

5. Run webhook test (text only):
   export SPARK_WEBHOOK_SECRET=your_secret_here
   node test_spark_webhook.js
   # Check response is 200 with completion_id

6. Run webhook test (with files):
   node test_spark_webhook_multipart.js
   # Check files appear in portfolio

7. Verify evidence in UI:
   - Navigate to diploma/portfolio page
   - Find test submissions
   - Verify text and files display correctly
   - Try editing evidence to confirm it's editable

TROUBLESHOOTING:

If webhook returns 404 "Quest not found":
  - Check lms_assignment_id matches between webhook and quest
  - Verify quest has lms_platform = 'spark'
  - Run the verification queries above

If webhook returns 404 "User not found":
  - User must log in via SSO first
  - Run test_spark_sso.js to create user
  - Verify lms_integrations record exists

If webhook returns 404 "User has not started quest":
  - User must pick up the quest first
  - Log in to Optio and start the quest manually
  - Or use API to start quest programmatically

If tasks don't appear after pickup:
  - Check quest_preset_tasks records exist
  - Verify tasks are copied to user_quest_tasks on pickup
  - Check backend logs for errors during task creation
*/
