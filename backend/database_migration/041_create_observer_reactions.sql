-- Migration: Create observer_reactions table
-- Purpose: Richer emotional feedback beyond simple likes (proud, mind-blown, inspired, love_it, curious)
-- Date: March 2026
-- Note: This will eventually replace observer_likes. During transition, both tables coexist.
--       Existing likes will be migrated as reaction_type = 'love_it'.

-- ============================================
-- Part 1: observer_reactions table
-- ============================================

CREATE TABLE IF NOT EXISTS observer_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    observer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('completion', 'learning_event', 'bounty_claim')),
    target_id UUID NOT NULL,
    reaction_type TEXT NOT NULL CHECK (reaction_type IN ('proud', 'mind_blown', 'inspired', 'love_it', 'curious')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_observer_reaction UNIQUE (observer_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_observer_reactions_observer_id ON observer_reactions(observer_id);
CREATE INDEX IF NOT EXISTS idx_observer_reactions_target ON observer_reactions(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_observer_reactions_created_at ON observer_reactions(created_at DESC);

COMMENT ON TABLE observer_reactions IS 'Expressive reactions from observers on student feed items. One reaction per observer per target. Replaces simple likes with richer feedback.';
COMMENT ON COLUMN observer_reactions.target_type IS 'Type of feed item: completion (task), learning_event (journal), or bounty_claim.';
COMMENT ON COLUMN observer_reactions.target_id IS 'ID of the target record. Polymorphic - references different tables based on target_type.';

-- ============================================
-- Part 2: RLS Policies
-- ============================================

ALTER TABLE observer_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on observer_reactions"
    ON observer_reactions FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- Observers can view reactions on items they have access to
CREATE POLICY "Users can view reactions on accessible items"
    ON observer_reactions FOR SELECT
    USING (
        -- Own reactions
        observer_id = auth.uid()
        OR
        -- Reactions on completions of students they observe
        (target_type = 'completion' AND EXISTS (
            SELECT 1 FROM quest_task_completions qtc
            JOIN observer_student_links osl ON osl.student_id = qtc.user_id
            WHERE qtc.id = observer_reactions.target_id
            AND osl.observer_id = auth.uid()
        ))
        OR
        -- Reactions on learning events of students they observe
        (target_type = 'learning_event' AND EXISTS (
            SELECT 1 FROM learning_events le
            JOIN observer_student_links osl ON osl.student_id = le.user_id
            WHERE le.id = observer_reactions.target_id
            AND osl.observer_id = auth.uid()
        ))
        OR
        -- Students can see reactions on their own content
        (target_type = 'completion' AND EXISTS (
            SELECT 1 FROM quest_task_completions qtc
            WHERE qtc.id = observer_reactions.target_id
            AND qtc.user_id = auth.uid()
        ))
        OR
        (target_type = 'learning_event' AND EXISTS (
            SELECT 1 FROM learning_events le
            WHERE le.id = observer_reactions.target_id
            AND le.user_id = auth.uid()
        ))
    );

-- Observers can add reactions
CREATE POLICY "Observers can add reactions"
    ON observer_reactions FOR INSERT
    WITH CHECK (
        observer_id = auth.uid()
        AND (
            (target_type = 'completion' AND EXISTS (
                SELECT 1 FROM quest_task_completions qtc
                JOIN observer_student_links osl ON osl.student_id = qtc.user_id
                WHERE qtc.id = observer_reactions.target_id
                AND osl.observer_id = auth.uid()
            ))
            OR
            (target_type = 'learning_event' AND EXISTS (
                SELECT 1 FROM learning_events le
                JOIN observer_student_links osl ON osl.student_id = le.user_id
                WHERE le.id = observer_reactions.target_id
                AND osl.observer_id = auth.uid()
            ))
        )
    );

-- Observers can delete their own reactions
CREATE POLICY "Observers can delete own reactions"
    ON observer_reactions FOR DELETE
    USING (observer_id = auth.uid());

-- ============================================
-- Part 3: Migrate existing likes to reactions
-- ============================================

-- Migrate completion likes as 'love_it' reactions
INSERT INTO observer_reactions (observer_id, target_type, target_id, reaction_type, created_at)
SELECT observer_id, 'completion', completion_id, 'love_it', created_at
FROM observer_likes
WHERE completion_id IS NOT NULL
ON CONFLICT (observer_id, target_type, target_id) DO NOTHING;

-- Migrate learning event likes as 'love_it' reactions
INSERT INTO observer_reactions (observer_id, target_type, target_id, reaction_type, created_at)
SELECT observer_id, 'learning_event', learning_event_id, 'love_it', created_at
FROM observer_likes
WHERE learning_event_id IS NOT NULL
ON CONFLICT (observer_id, target_type, target_id) DO NOTHING;
