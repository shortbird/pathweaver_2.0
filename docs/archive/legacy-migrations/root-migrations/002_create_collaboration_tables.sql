-- Migration: Create collaboration infrastructure tables
-- Phase 3: Collaborative quests
-- Date: 2026-01-01

-- Quest collaborations - groups of students working together
CREATE TABLE IF NOT EXISTS quest_collaborations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Collaboration members - students in each collaboration group
CREATE TABLE IF NOT EXISTS quest_collaboration_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collaboration_id UUID NOT NULL REFERENCES quest_collaborations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(collaboration_id, user_id)
);

-- Shared evidence - evidence submitted by one student for the whole group
CREATE TABLE IF NOT EXISTS shared_evidence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_completion_id UUID REFERENCES quest_task_completions(id) ON DELETE CASCADE,
    submitted_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    collaboration_id UUID NOT NULL REFERENCES quest_collaborations(id) ON DELETE CASCADE,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shared evidence approvals - other group members approve evidence
CREATE TABLE IF NOT EXISTS shared_evidence_approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shared_evidence_id UUID NOT NULL REFERENCES shared_evidence(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('approved', 'rejected', 'pending')),
    approved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(shared_evidence_id, user_id)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_quest_collaborations_quest_id ON quest_collaborations(quest_id);
CREATE INDEX IF NOT EXISTS idx_quest_collaborations_org_id ON quest_collaborations(org_id);
CREATE INDEX IF NOT EXISTS idx_collaboration_members_user_id ON quest_collaboration_members(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_evidence_collaboration_id ON shared_evidence(collaboration_id);
CREATE INDEX IF NOT EXISTS idx_shared_evidence_approvals_user_id ON shared_evidence_approvals(user_id);

-- Enable RLS
ALTER TABLE quest_collaborations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quest_collaboration_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_evidence_approvals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for quest_collaborations
CREATE POLICY "Users can view collaborations in their org"
    ON quest_collaborations FOR SELECT
    USING (org_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Students can create collaborations"
    ON quest_collaborations FOR INSERT
    WITH CHECK (created_by = auth.uid());

-- RLS Policies for quest_collaboration_members
CREATE POLICY "Users can view their collaboration memberships"
    ON quest_collaboration_members FOR SELECT
    USING (user_id = auth.uid() OR collaboration_id IN (
        SELECT id FROM quest_collaborations WHERE org_id IN (
            SELECT organization_id FROM users WHERE id = auth.uid()
        )
    ));

CREATE POLICY "Collaboration creators can add members"
    ON quest_collaboration_members FOR INSERT
    WITH CHECK (collaboration_id IN (
        SELECT id FROM quest_collaborations WHERE created_by = auth.uid()
    ));

-- RLS Policies for shared_evidence
CREATE POLICY "Users can view evidence from their collaborations"
    ON shared_evidence FOR SELECT
    USING (collaboration_id IN (
        SELECT collaboration_id FROM quest_collaboration_members WHERE user_id = auth.uid()
    ));

CREATE POLICY "Collaboration members can submit evidence"
    ON shared_evidence FOR INSERT
    WITH CHECK (submitted_by = auth.uid() AND collaboration_id IN (
        SELECT collaboration_id FROM quest_collaboration_members WHERE user_id = auth.uid()
    ));

-- RLS Policies for shared_evidence_approvals
CREATE POLICY "Users can view approvals for their collaboration evidence"
    ON shared_evidence_approvals FOR SELECT
    USING (shared_evidence_id IN (
        SELECT id FROM shared_evidence WHERE collaboration_id IN (
            SELECT collaboration_id FROM quest_collaboration_members WHERE user_id = auth.uid()
        )
    ));

CREATE POLICY "Collaboration members can approve evidence"
    ON shared_evidence_approvals FOR INSERT
    WITH CHECK (user_id = auth.uid() AND shared_evidence_id IN (
        SELECT se.id FROM shared_evidence se
        JOIN quest_collaboration_members qcm ON se.collaboration_id = qcm.collaboration_id
        WHERE qcm.user_id = auth.uid()
    ));
