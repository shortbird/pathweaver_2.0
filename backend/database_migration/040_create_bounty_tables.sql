-- Migration: Create Bounty Board tables
-- Purpose: Community-driven educational challenges with XP and sponsored rewards
-- Date: March 2026

-- ============================================
-- Part 1: bounties - Challenge listings
-- ============================================

CREATE TABLE IF NOT EXISTS bounties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poster_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    requirements TEXT NOT NULL,
    pillar TEXT NOT NULL CHECK (pillar IN ('stem', 'art', 'communication', 'civics', 'wellness')),
    bounty_type TEXT NOT NULL CHECK (bounty_type IN ('open', 'challenge', 'family', 'org', 'sponsored')),
    xp_reward INTEGER NOT NULL CHECK (xp_reward >= 25 AND xp_reward <= 500),
    sponsored_reward JSONB,
    max_participants INTEGER NOT NULL DEFAULT 10 CHECK (max_participants > 0),
    deadline TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'active', 'completed', 'expired', 'rejected')),
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    moderation_status TEXT NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'ai_approved', 'manually_approved', 'rejected')),
    moderation_notes TEXT,
    platform_fee_cents INTEGER CHECK (platform_fee_cents IS NULL OR platform_fee_cents >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bounties_poster_id ON bounties(poster_id);
CREATE INDEX IF NOT EXISTS idx_bounties_status ON bounties(status);
CREATE INDEX IF NOT EXISTS idx_bounties_pillar ON bounties(pillar);
CREATE INDEX IF NOT EXISTS idx_bounties_bounty_type ON bounties(bounty_type);
CREATE INDEX IF NOT EXISTS idx_bounties_organization_id ON bounties(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bounties_deadline ON bounties(deadline) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_bounties_moderation ON bounties(moderation_status) WHERE moderation_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_bounties_created_at ON bounties(created_at DESC);

COMMENT ON TABLE bounties IS 'Educational challenges posted by parents, organizations, or sponsors. Students claim and complete them for XP and optional real-world rewards.';
COMMENT ON COLUMN bounties.sponsored_reward IS 'For sponsored bounties: {type, description, value, sponsor_name, sponsor_logo_url}. NULL for non-sponsored.';
COMMENT ON COLUMN bounties.platform_fee_cents IS 'Platform fee charged to sponsor in cents. Only set for sponsored bounties.';

-- ============================================
-- Part 2: bounty_claims - Student participation
-- ============================================

CREATE TABLE IF NOT EXISTS bounty_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bounty_id UUID NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'submitted', 'approved', 'rejected', 'revision_requested')),
    evidence JSONB,
    submitted_at TIMESTAMPTZ,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_student_bounty UNIQUE (bounty_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_bounty_claims_bounty_id ON bounty_claims(bounty_id);
CREATE INDEX IF NOT EXISTS idx_bounty_claims_student_id ON bounty_claims(student_id);
CREATE INDEX IF NOT EXISTS idx_bounty_claims_status ON bounty_claims(status);

COMMENT ON TABLE bounty_claims IS 'Tracks student participation in bounties. One claim per student per bounty.';
COMMENT ON COLUMN bounty_claims.evidence IS 'Submission evidence: {text, media_urls[], links[]}';

-- ============================================
-- Part 3: bounty_reviews - Poster feedback
-- ============================================

CREATE TABLE IF NOT EXISTS bounty_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES bounty_claims(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected', 'revision_requested')),
    feedback TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bounty_reviews_claim_id ON bounty_reviews(claim_id);
CREATE INDEX IF NOT EXISTS idx_bounty_reviews_reviewer_id ON bounty_reviews(reviewer_id);

COMMENT ON TABLE bounty_reviews IS 'Review decisions on bounty claim submissions. Multiple reviews possible (revision cycles).';

-- ============================================
-- Part 4: RLS Policies
-- ============================================

ALTER TABLE bounties ENABLE ROW LEVEL SECURITY;
ALTER TABLE bounty_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE bounty_reviews ENABLE ROW LEVEL SECURITY;

-- Service role: full access
CREATE POLICY "Service role full access on bounties"
    ON bounties FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on bounty_claims"
    ON bounty_claims FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on bounty_reviews"
    ON bounty_reviews FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- Bounties: anyone can view active bounties, posters can manage their own
CREATE POLICY "Anyone can view active bounties"
    ON bounties FOR SELECT
    USING (status = 'active' OR poster_id = auth.uid());

CREATE POLICY "Users can create bounties"
    ON bounties FOR INSERT
    WITH CHECK (poster_id = auth.uid());

CREATE POLICY "Posters can update own bounties"
    ON bounties FOR UPDATE
    USING (poster_id = auth.uid())
    WITH CHECK (poster_id = auth.uid());

CREATE POLICY "Posters can delete own draft bounties"
    ON bounties FOR DELETE
    USING (poster_id = auth.uid() AND status = 'draft');

-- Claims: students manage their own, posters can view claims on their bounties
CREATE POLICY "Students can view own claims"
    ON bounty_claims FOR SELECT
    USING (
        student_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM bounties b
            WHERE b.id = bounty_claims.bounty_id
            AND b.poster_id = auth.uid()
        )
    );

CREATE POLICY "Students can create claims"
    ON bounty_claims FOR INSERT
    WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can update own claims"
    ON bounty_claims FOR UPDATE
    USING (student_id = auth.uid())
    WITH CHECK (student_id = auth.uid());

-- Reviews: posters can create reviews on their bounty claims
CREATE POLICY "Reviewers can view own reviews"
    ON bounty_reviews FOR SELECT
    USING (
        reviewer_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM bounty_claims bc
            WHERE bc.id = bounty_reviews.claim_id
            AND bc.student_id = auth.uid()
        )
    );

CREATE POLICY "Posters can create reviews"
    ON bounty_reviews FOR INSERT
    WITH CHECK (
        reviewer_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM bounty_claims bc
            JOIN bounties b ON b.id = bc.bounty_id
            WHERE bc.id = bounty_reviews.claim_id
            AND b.poster_id = auth.uid()
        )
    );
