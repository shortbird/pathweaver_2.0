-- Badge System Redesign: Pick Up/Set Down + OnFire Pathways
-- Migration Script for Database Schema Changes
-- Run this in Supabase SQL Editor

-- ============================================
-- PART 1: Update user_quests table
-- ============================================

-- Add new columns for pick up/set down lifecycle
ALTER TABLE user_quests
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'picked_up',
ADD COLUMN IF NOT EXISTS times_picked_up INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS last_picked_up_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS last_set_down_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS reflection_notes JSONB DEFAULT '[]';

-- Migrate existing data: is_active=true means picked_up, false means set_down
UPDATE user_quests
SET status = CASE
    WHEN is_active = true THEN 'picked_up'
    ELSE 'set_down'
END
WHERE status IS NULL OR status = 'picked_up';

-- Update last_picked_up_at for existing active quests
UPDATE user_quests
SET last_picked_up_at = started_at
WHERE last_picked_up_at IS NULL AND started_at IS NOT NULL;

-- Update last_set_down_at for completed quests
UPDATE user_quests
SET last_set_down_at = completed_at
WHERE last_set_down_at IS NULL AND completed_at IS NOT NULL AND is_active = false;

-- Add constraint for valid status values
ALTER TABLE user_quests
ADD CONSTRAINT valid_quest_status CHECK (status IN ('available', 'picked_up', 'set_down'));

-- ============================================
-- PART 2: Update badges table
-- ============================================

-- Add new columns for badge types and OnFire requirements
ALTER TABLE badges
ADD COLUMN IF NOT EXISTS badge_type TEXT DEFAULT 'exploration',
ADD COLUMN IF NOT EXISTS onfire_course_requirement INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS optio_quest_requirement INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS visual_stages JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS quest_source_filter TEXT DEFAULT 'any';

-- Add constraint for valid badge types
ALTER TABLE badges
ADD CONSTRAINT valid_badge_type CHECK (badge_type IN ('exploration', 'onfire_pathway'));

-- Add constraint for valid quest source filters
ALTER TABLE badges
ADD CONSTRAINT valid_quest_source_filter CHECK (quest_source_filter IN ('any', 'optio', 'lms'));

-- Migrate existing badges to 'exploration' type
UPDATE badges
SET badge_type = 'exploration',
    quest_source_filter = 'any'
WHERE badge_type IS NULL;

-- ============================================
-- PART 3: Update badge_quests table
-- ============================================

-- Add new columns for OnFire course tracking
ALTER TABLE badge_quests
ADD COLUMN IF NOT EXISTS quest_source TEXT DEFAULT 'optio',
ADD COLUMN IF NOT EXISTS is_onfire_course BOOLEAN DEFAULT false;

-- Add constraint for valid quest sources
ALTER TABLE badge_quests
ADD CONSTRAINT valid_quest_source CHECK (quest_source IN ('optio', 'lms'));

-- ============================================
-- PART 4: Update user_badges table
-- ============================================

-- Add claiming functionality columns
ALTER TABLE user_badges
ADD COLUMN IF NOT EXISTS available_to_claim_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS is_displayed BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS claim_notification_sent BOOLEAN DEFAULT false;

-- Migrate existing earned badges to claimed status
UPDATE user_badges
SET claimed_at = earned_at,
    available_to_claim_at = earned_at,
    is_displayed = true
WHERE claimed_at IS NULL AND earned_at IS NOT NULL;

-- ============================================
-- PART 5: Create quest_reflection_prompts table
-- ============================================

CREATE TABLE IF NOT EXISTS quest_reflection_prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_text TEXT NOT NULL,
    category TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add constraint for valid categories
ALTER TABLE quest_reflection_prompts
ADD CONSTRAINT valid_prompt_category CHECK (category IN ('discovery', 'growth', 'challenge', 'connection', 'identity'));

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_reflection_prompts_active ON quest_reflection_prompts(is_active);
CREATE INDEX IF NOT EXISTS idx_reflection_prompts_category ON quest_reflection_prompts(category);

-- ============================================
-- PART 6: Create helpful indexes for performance
-- ============================================

-- Index for user quest status lookups
CREATE INDEX IF NOT EXISTS idx_user_quests_status ON user_quests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_quests_pickup_count ON user_quests(user_id, times_picked_up);

-- Index for badge claiming workflow
CREATE INDEX IF NOT EXISTS idx_user_badges_available_to_claim ON user_badges(user_id, available_to_claim_at) WHERE available_to_claim_at IS NOT NULL AND claimed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_badges_claimed ON user_badges(user_id, claimed_at) WHERE claimed_at IS NOT NULL;

-- Index for badge type filtering
CREATE INDEX IF NOT EXISTS idx_badges_type ON badges(badge_type, status);

-- Index for OnFire course filtering
CREATE INDEX IF NOT EXISTS idx_badge_quests_onfire ON badge_quests(badge_id, is_onfire_course);

-- ============================================
-- PART 7: Create helper functions
-- ============================================

-- Function to check if a user is eligible to claim a badge
CREATE OR REPLACE FUNCTION check_badge_eligibility(
    p_user_id UUID,
    p_badge_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_badge RECORD;
    v_onfire_count INTEGER;
    v_optio_count INTEGER;
    v_total_required INTEGER;
BEGIN
    -- Get badge requirements
    SELECT * INTO v_badge FROM badges WHERE id = p_badge_id;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- For OnFire pathway badges
    IF v_badge.badge_type = 'onfire_pathway' THEN
        -- Count OnFire courses picked up and set down
        SELECT COUNT(DISTINCT uq.quest_id) INTO v_onfire_count
        FROM user_quests uq
        JOIN badge_quests bq ON bq.quest_id = uq.quest_id
        JOIN quests q ON q.id = uq.quest_id
        WHERE uq.user_id = p_user_id
          AND bq.badge_id = p_badge_id
          AND bq.is_onfire_course = true
          AND uq.status = 'set_down';

        -- Count custom Optio quests picked up and set down
        SELECT COUNT(DISTINCT uq.quest_id) INTO v_optio_count
        FROM user_quests uq
        JOIN badge_quests bq ON bq.quest_id = uq.quest_id
        JOIN quests q ON q.id = uq.quest_id
        WHERE uq.user_id = p_user_id
          AND bq.badge_id = p_badge_id
          AND bq.is_onfire_course = false
          AND uq.status = 'set_down';

        -- Check if requirements are met
        RETURN (v_onfire_count >= v_badge.onfire_course_requirement
                AND v_optio_count >= v_badge.optio_quest_requirement);

    -- For exploration badges
    ELSE
        -- Count quests picked up and set down
        SELECT COUNT(DISTINCT uq.quest_id) INTO v_total_required
        FROM user_quests uq
        JOIN badge_quests bq ON bq.quest_id = uq.quest_id
        WHERE uq.user_id = p_user_id
          AND bq.badge_id = p_badge_id
          AND uq.status = 'set_down';

        -- Check if min_quests requirement is met
        RETURN (v_total_required >= v_badge.min_quests);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-update available_to_claim_at when eligibility is met
CREATE OR REPLACE FUNCTION update_badge_claim_availability() RETURNS TRIGGER AS $$
DECLARE
    v_badge_id UUID;
BEGIN
    -- Loop through all badges to check eligibility
    FOR v_badge_id IN
        SELECT DISTINCT bq.badge_id
        FROM badge_quests bq
        WHERE bq.quest_id = NEW.quest_id
    LOOP
        -- Check if user is now eligible and hasn't claimed yet
        IF check_badge_eligibility(NEW.user_id, v_badge_id) THEN
            -- Insert or update user_badges record
            INSERT INTO user_badges (user_id, badge_id, available_to_claim_at, claim_notification_sent)
            VALUES (NEW.user_id, v_badge_id, NOW(), false)
            ON CONFLICT (user_id, badge_id)
            DO UPDATE SET
                available_to_claim_at = COALESCE(user_badges.available_to_claim_at, NOW()),
                claim_notification_sent = false
            WHERE user_badges.claimed_at IS NULL;
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to check badge eligibility when quest is set down
DROP TRIGGER IF EXISTS trigger_check_badge_eligibility ON user_quests;
CREATE TRIGGER trigger_check_badge_eligibility
    AFTER UPDATE OF status ON user_quests
    FOR EACH ROW
    WHEN (NEW.status = 'set_down' AND OLD.status != 'set_down')
    EXECUTE FUNCTION update_badge_claim_availability();

-- ============================================
-- PART 8: Verification queries
-- ============================================

-- Verify user_quests columns
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'user_quests'
  AND column_name IN ('status', 'times_picked_up', 'last_picked_up_at', 'last_set_down_at', 'reflection_notes')
ORDER BY column_name;

-- Verify badges columns
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'badges'
  AND column_name IN ('badge_type', 'onfire_course_requirement', 'optio_quest_requirement', 'visual_stages', 'quest_source_filter')
ORDER BY column_name;

-- Verify badge_quests columns
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'badge_quests'
  AND column_name IN ('quest_source', 'is_onfire_course')
ORDER BY column_name;

-- Verify user_badges columns
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'user_badges'
  AND column_name IN ('available_to_claim_at', 'claimed_at', 'is_displayed', 'claim_notification_sent')
ORDER BY column_name;

-- Verify quest_reflection_prompts table exists
SELECT COUNT(*) as prompt_table_exists
FROM information_schema.tables
WHERE table_name = 'quest_reflection_prompts';

COMMIT;
