-- Migration: Create Tutorial Quest (Final)
-- Created: 2025-01-10
-- Description: Creates the "Explore the Optio Platform" tutorial quest
-- Note: Tasks are created programmatically when users start the quest

-- Delete existing tutorial quest if any (for idempotency)
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
    'Welcome to Optio! Complete this quest to learn how the platform works. Your tasks will be automatically verified as you explore different features. Total XP available: 240 points across 12 tasks.',
    'optio',
    TRUE,
    TRUE,
    NOW(),
    NOW()
);

-- Verify the quest was created
SELECT id, title, is_tutorial, is_active FROM quests WHERE is_tutorial = TRUE;
