-- Migration: Feed moderation — content reports and user blocks
-- Purpose: App Store compliance (Guideline 1.2 for user-generated content)
-- Date: 2026-04-14

BEGIN;

-- ============================================================
-- content_reports: users flag posts/comments for admin review
-- ============================================================
CREATE TABLE IF NOT EXISTS content_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('learning_event', 'task_completion', 'comment', 'user')),
    target_id UUID NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN ('spam', 'harassment', 'inappropriate', 'self_harm', 'other')),
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed', 'actioned')),
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_reporter_target UNIQUE (reporter_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_content_reports_status ON content_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_reports_target ON content_reports(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_content_reports_reporter ON content_reports(reporter_id);

COMMENT ON TABLE content_reports IS 'User-submitted reports on feed content for admin moderation review.';

ALTER TABLE content_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on content_reports"
    ON content_reports FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Users can file reports"
    ON content_reports FOR INSERT
    WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "Users can view own reports"
    ON content_reports FOR SELECT
    USING (reporter_id = auth.uid());

-- ============================================================
-- user_blocks: users block other users from appearing in feed/contact
-- ============================================================
CREATE TABLE IF NOT EXISTS user_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_block UNIQUE (blocker_id, blocked_id),
    CONSTRAINT no_self_block CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_id);

COMMENT ON TABLE user_blocks IS 'User-to-user blocks. Blocked users are hidden from feed and cannot message the blocker.';

ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on user_blocks"
    ON user_blocks FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Users manage own blocks"
    ON user_blocks FOR ALL
    USING (blocker_id = auth.uid())
    WITH CHECK (blocker_id = auth.uid());

COMMIT;
