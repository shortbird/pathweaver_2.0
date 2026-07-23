-- Fix announcements.target_audience: text[] -> text
--
-- The live column still had the old LMS-era shape (TEXT[] DEFAULT ARRAY['all'],
-- from database_migration/018_create_announcements.sql), but all current code
-- treats it as a plain string: routes/announcements.py writes 'everyone' or a
-- comma-joined role list ('parents,students'), and the archive endpoint filters
-- with target_audience.eq.everyone / target_audience.ilike.%<role>%.
--
-- The mismatch made the archive endpoint 500 for students/parents
-- ("operator does not exist: text[] ~~* unknown", SQLSTATE 42883, seen in
-- Sentry) and made every announcement row insert fail silently (the insert is
-- best-effort, so delivery still worked but the durable record was never
-- written -- the table is empty as of this migration).
--
-- No constraints, views, RLS policies, or other code reference the column's
-- array shape, so converting the column is the whole fix.

ALTER TABLE public.announcements
    ALTER COLUMN target_audience DROP DEFAULT;

ALTER TABLE public.announcements
    ALTER COLUMN target_audience TYPE text
    USING CASE
        WHEN target_audience = ARRAY['all']::text[] THEN 'everyone'
        ELSE array_to_string(target_audience, ',')
    END;

ALTER TABLE public.announcements
    ALTER COLUMN target_audience SET DEFAULT 'everyone';

COMMENT ON COLUMN public.announcements.target_audience IS
    '''everyone'' or a comma-joined role list, e.g. ''parents,students''';
