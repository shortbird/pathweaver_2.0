-- Migration: Create Collaboration Tables
-- Date: 2026-01-01
-- Description: Create tables for collaborative quests and shared evidence approval
--
-- IMPORTANT: This migration should be executed manually via Supabase Dashboard
-- or with appropriate database admin credentials

-- Table: quest_collaborations
-- Stores collaborative quest instances
CREATE TABLE IF NOT EXISTS quest_collaborations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: quest_collaboration_members
-- Tracks which users are part of each collaboration
CREATE TABLE IF NOT EXISTS quest_collaboration_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collaboration_id UUID NOT NULL REFERENCES quest_collaborations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(collaboration_id, user_id)
);

-- Table: shared_evidence
-- Evidence submitted in collaborative quests that needs peer approval
CREATE TABLE IF NOT EXISTS shared_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_completion_id UUID NOT NULL REFERENCES quest_task_completions(id) ON DELETE CASCADE,
    submitted_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    collaboration_id UUID NOT NULL REFERENCES quest_collaborations(id) ON DELETE CASCADE,
    evidence_url TEXT,
    description TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(task_completion_id)
);

-- Table: shared_evidence_approvals
-- Tracks peer approvals for shared evidence
CREATE TABLE IF NOT EXISTS shared_evidence_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shared_evidence_id UUID NOT NULL REFERENCES shared_evidence(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('approved', 'rejected', 'pending')),
    responded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    comments TEXT,
    UNIQUE(shared_evidence_id, user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_quest_collaborations_quest_id ON quest_collaborations(quest_id);
CREATE INDEX IF NOT EXISTS idx_quest_collaborations_organization_id ON quest_collaborations(organization_id);
CREATE INDEX IF NOT EXISTS idx_quest_collaboration_members_collaboration_id ON quest_collaboration_members(collaboration_id);
CREATE INDEX IF NOT EXISTS idx_quest_collaboration_members_user_id ON quest_collaboration_members(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_evidence_collaboration_id ON shared_evidence(collaboration_id);
CREATE INDEX IF NOT EXISTS idx_shared_evidence_submitted_by ON shared_evidence(submitted_by);
CREATE INDEX IF NOT EXISTS idx_shared_evidence_approvals_shared_evidence_id ON shared_evidence_approvals(shared_evidence_id);
CREATE INDEX IF NOT EXISTS idx_shared_evidence_approvals_user_id ON shared_evidence_approvals(user_id);

-- RLS (Row Level Security) Policies
-- Enable RLS on all tables
ALTER TABLE quest_collaborations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quest_collaboration_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_evidence_approvals ENABLE ROW LEVEL SECURITY;

-- quest_collaborations policies
CREATE POLICY "Users can view collaborations in their organization"
    ON quest_collaborations FOR SELECT
    USING (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can create collaborations in their organization"
    ON quest_collaborations FOR INSERT
    WITH CHECK (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));

-- quest_collaboration_members policies
CREATE POLICY "Users can view collaboration members"
    ON quest_collaboration_members FOR SELECT
    USING (collaboration_id IN (
        SELECT id FROM quest_collaborations
        WHERE organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid())
    ));

CREATE POLICY "Users can join collaborations"
    ON quest_collaboration_members FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- shared_evidence policies
CREATE POLICY "Collaboration members can view shared evidence"
    ON shared_evidence FOR SELECT
    USING (collaboration_id IN (
        SELECT collaboration_id FROM quest_collaboration_members WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can submit evidence to their collaborations"
    ON shared_evidence FOR INSERT
    WITH CHECK (
        submitted_by = auth.uid() AND
        collaboration_id IN (
            SELECT collaboration_id FROM quest_collaboration_members WHERE user_id = auth.uid()
        )
    );

-- shared_evidence_approvals policies
CREATE POLICY "Collaboration members can view approvals"
    ON shared_evidence_approvals FOR SELECT
    USING (shared_evidence_id IN (
        SELECT id FROM shared_evidence
        WHERE collaboration_id IN (
            SELECT collaboration_id FROM quest_collaboration_members WHERE user_id = auth.uid()
        )
    ));

CREATE POLICY "Collaboration members can approve evidence"
    ON shared_evidence_approvals FOR INSERT
    WITH CHECK (
        user_id = auth.uid() AND
        shared_evidence_id IN (
            SELECT id FROM shared_evidence
            WHERE collaboration_id IN (
                SELECT collaboration_id FROM quest_collaboration_members WHERE user_id = auth.uid()
            )
        )
    );

-- Verification query (run after migration)
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name IN (
--   'quest_collaborations',
--   'quest_collaboration_members',
--   'shared_evidence',
--   'shared_evidence_approvals'
-- );
-- Expected result: 4 rows
