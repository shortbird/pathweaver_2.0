-- Create quest_collaborations table for Team Up functionality
CREATE TABLE IF NOT EXISTS quest_collaborations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'completed', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Ensure no duplicate collaborations
    CONSTRAINT unique_active_collaboration UNIQUE (quest_id, requester_id, partner_id),
    -- Ensure users can't invite themselves
    CONSTRAINT no_self_invitation CHECK (requester_id != partner_id)
);

-- Create indexes for performance
CREATE INDEX idx_quest_collaborations_quest_id ON quest_collaborations(quest_id);
CREATE INDEX idx_quest_collaborations_requester_id ON quest_collaborations(requester_id);
CREATE INDEX idx_quest_collaborations_partner_id ON quest_collaborations(partner_id);
CREATE INDEX idx_quest_collaborations_status ON quest_collaborations(status);

-- Add RLS policies
ALTER TABLE quest_collaborations ENABLE ROW LEVEL SECURITY;

-- Users can view their own collaborations
CREATE POLICY "Users can view own collaborations" ON quest_collaborations
    FOR SELECT
    USING (auth.uid() = requester_id OR auth.uid() = partner_id);

-- Users can insert collaboration invitations
CREATE POLICY "Users can send invitations" ON quest_collaborations
    FOR INSERT
    WITH CHECK (auth.uid() = requester_id);

-- Users can update collaborations they're involved in
CREATE POLICY "Users can update own collaborations" ON quest_collaborations
    FOR UPDATE
    USING (auth.uid() = requester_id OR auth.uid() = partner_id);