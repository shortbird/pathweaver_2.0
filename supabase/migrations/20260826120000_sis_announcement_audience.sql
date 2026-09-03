-- Board announcements written for staff were being shown to every family.
--
-- iCreate, 2026-08-26: "things Sent to teachers should not be showing up for
-- Families."
--
-- sis_events has carried an audience since it was built, and family_feed()
-- already drops anything that is not 'school'. sis_announcements never had one,
-- so family_feed returned every board post an admin had ever written, including
-- the ones aimed at teachers. This gives announcements the same column, the
-- same three values and the same default as events.
--
-- Existing rows default to 'school', which is what families could already see,
-- so nothing disappears from a family's feed on deploy.

ALTER TABLE public.sis_announcements
    ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'school';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'sis_announcements_audience_check'
    ) THEN
        ALTER TABLE public.sis_announcements
            ADD CONSTRAINT sis_announcements_audience_check
            CHECK (audience = ANY (ARRAY['school'::text, 'teachers'::text, 'admins'::text]));
    END IF;
END $$;
