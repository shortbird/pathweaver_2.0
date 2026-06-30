-- Class Attendance (iCreate SIS)
-- Migration: 20260630_create_class_attendance.sql
-- Description:
--   Attendance for org classes. There is NO student check-in/check-out: a teacher
--   (class advisor) marks each meeting's roster, defaulting everyone to present and
--   flagging absences. One row per (class, student, meeting_date).
--
--   Notification rules (enforced in the service layer, not here):
--     * When a student becomes 'absent', their parent(s) are notified.
--     * When a student who was 'present' is later changed to 'absent', the
--       parent(s) AND the org admin(s) are notified.
--   This migration also widens notifications.type to allow the two new types:
--     'student_absent'      (parent / org_admin absence notice)
--     'attendance_reminder' (teacher reminder to mark absences at class start)

-- 1. class_attendance ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS class_attendance (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id        UUID NOT NULL REFERENCES org_classes(id) ON DELETE CASCADE,
    student_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    meeting_date    DATE NOT NULL,
    status          TEXT NOT NULL DEFAULT 'present'
                    CHECK (status IN ('present', 'absent', 'excused')),
    marked_by       UUID REFERENCES users(id),
    marked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (class_id, student_id, meeting_date)
);

CREATE INDEX IF NOT EXISTS idx_class_attendance_class_date
    ON class_attendance (class_id, meeting_date);
CREATE INDEX IF NOT EXISTS idx_class_attendance_org_date
    ON class_attendance (organization_id, meeting_date);
CREATE INDEX IF NOT EXISTS idx_class_attendance_student
    ON class_attendance (student_id);

COMMENT ON TABLE  class_attendance              IS 'Per-meeting attendance for org classes. Teacher marks absences; no student check-in/out.';
COMMENT ON COLUMN class_attendance.meeting_date IS 'Calendar date of the class meeting (one roster per class per date).';
COMMENT ON COLUMN class_attendance.status       IS 'present (default), absent, or excused.';
COMMENT ON COLUMN class_attendance.marked_by    IS 'Advisor/org_admin user who recorded this status.';

-- keep updated_at fresh on status changes
CREATE OR REPLACE FUNCTION update_class_attendance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS class_attendance_updated_at_trigger ON class_attendance;
CREATE TRIGGER class_attendance_updated_at_trigger
    BEFORE UPDATE ON class_attendance
    FOR EACH ROW
    EXECUTE FUNCTION update_class_attendance_updated_at();

-- 2. RLS (mirrors org_classes / class_enrollments) ---------------------------
ALTER TABLE class_attendance ENABLE ROW LEVEL SECURITY;

-- Org admins (and superadmin) manage attendance for classes in their org
DROP POLICY IF EXISTS class_attendance_admin_policy ON class_attendance;
CREATE POLICY class_attendance_admin_policy ON class_attendance
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM org_classes oc
            JOIN users u ON u.id = auth.uid()
            WHERE oc.id = class_attendance.class_id
            AND (
                u.role = 'superadmin'
                OR (u.organization_id = oc.organization_id AND u.org_role = 'org_admin')
            )
        )
    );

-- Advisors manage attendance for classes they teach
DROP POLICY IF EXISTS class_attendance_advisor_policy ON class_attendance;
CREATE POLICY class_attendance_advisor_policy ON class_attendance
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM class_advisors ca
            WHERE ca.class_id = class_attendance.class_id
            AND ca.advisor_id = auth.uid()
            AND ca.is_active = TRUE
        )
    );

-- Students can view their own attendance
DROP POLICY IF EXISTS class_attendance_student_policy ON class_attendance;
CREATE POLICY class_attendance_student_policy ON class_attendance
    FOR SELECT
    USING (student_id = auth.uid());

-- Parents can view their dependents' attendance
DROP POLICY IF EXISTS class_attendance_parent_policy ON class_attendance;
CREATE POLICY class_attendance_parent_policy ON class_attendance
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users s
            WHERE s.id = class_attendance.student_id
            AND s.managed_by_parent_id = auth.uid()
        )
    );

-- 3. Widen notifications.type CHECK -------------------------------------------
-- Preserve every type currently allowed in production and add the two new ones.
ALTER TABLE notifications
    DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type = ANY (ARRAY[
        -- existing (preserve verbatim)
        'quest_invitation',
        'quest_started',
        'task_approved',
        'task_revision_requested',
        'announcement',
        'observer_comment',
        'observer_like',
        'badge_earned',
        'friendship_request',
        'message_received',
        'advisor_note',
        'system_alert',
        'parent_approval_required',
        'bounty_submission',
        'diploma_credit_approved',
        'diploma_credit_grow_this',
        'class_submitted_for_review',
        'bounty_posted',
        'bounty_claimed',
        'diploma_credit_requested',
        'observer_accepted',
        'observer_added',
        'org_approved_credit',
        'video_processing',
        'treehouse_help',
        'treehouse_proud',
        'treehouse_task_completed',
        'treehouse_quest_completed',
        'treehouse_showcase_joined',
        -- new (SIS attendance)
        'student_absent',
        'attendance_reminder'
    ]::text[]));
