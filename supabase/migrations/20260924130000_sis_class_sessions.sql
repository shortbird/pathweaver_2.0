-- Who took the roll: one row per class per day (P7, iCreate 2026-09-23).
--
-- sis_attendance is one row per student per class per day, and its
-- recorded_by is overwritten by every save, so the platform could not answer
-- the question iCreate's coordinators ask: did the assigned teacher teach this
-- class today, or did somebody cover it? In the thirty days to 2026-09-23,
-- 25 of 334 class-days at iCreate were rolled by someone who is not the class's
-- teacher (21 by three teachers of other classes, 4 by coordinators), and
-- nothing recorded it.
--
-- A session is the roll-call record the attendance save now upserts:
--   taken_by / taken_at        the FIRST person to save the roll. Later saves
--                              never replace it; they move last_saved_*.
--   substitute_id / sub_status the "covered by" flag. A save by someone who is
--                              not an assigned teacher is 'flagged' until a
--                              coordinator confirms what happened.
--   planned_by / planned_at    a substitute marked ahead of time by the office.
--                              It grants that person the class's roster and
--                              attendance for this date only.
-- It is also the record a later pay-from-attendance project reads.
--
-- Additive. A class has at most one meeting on a given day today (checked
-- 2026-09-23), but meeting_id is part of the key so a class that meets twice
-- can hold two sessions. NULLS NOT DISTINCT so two NULL-meeting rows for one
-- class and day collide instead of both inserting (PostgreSQL 15+; prod is 17).
--
-- meeting_id has no foreign key on purpose: ON DELETE SET NULL would turn two
-- sessions of one class and day into two NULL-meeting rows that break the
-- unique key, and the delete of a class meeting would then fail. A stale
-- meeting id on an old session is harmless; a class form that cannot save is not.

CREATE TABLE IF NOT EXISTS public.sis_class_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.org_classes(id) ON DELETE CASCADE,
  date date NOT NULL,
  meeting_id uuid,
  taken_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  taken_at timestamptz,
  last_saved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  last_saved_at timestamptz,
  substitute_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  sub_status text NOT NULL DEFAULT 'none'
    CHECK (sub_status IN ('none', 'flagged', 'confirmed_sub', 'teacher_present', 'other')),
  sub_note text,
  confirmed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  planned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  planned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sis_class_sessions_class_date_meeting_key
    UNIQUE NULLS NOT DISTINCT (class_id, date, meeting_id)
);
ALTER TABLE public.sis_class_sessions ENABLE ROW LEVEL SECURITY;

-- The dashboard reads one org's day; the report reads one org's date range.
CREATE INDEX IF NOT EXISTS idx_sis_class_sessions_org_date
  ON public.sis_class_sessions (organization_id, date);
-- "Teachers to check" lists the open flags.
CREATE INDEX IF NOT EXISTS idx_sis_class_sessions_flagged
  ON public.sis_class_sessions (organization_id)
  WHERE sub_status = 'flagged';
-- class_scope asks "which classes is this person covering on this date?".
CREATE INDEX IF NOT EXISTS idx_sis_class_sessions_substitute_date
  ON public.sis_class_sessions (substitute_id, date)
  WHERE substitute_id IS NOT NULL;

COMMENT ON TABLE public.sis_class_sessions IS
  'One roll call per class per day: who took it first (taken_by, never replaced), who saved last, and whether someone other than the assigned teacher covered the class (substitute_id, sub_status). Written by sis_attendance_service.record through sis_class_session_service.';
COMMENT ON COLUMN public.sis_class_sessions.taken_by IS
  'The first person who saved the roll for this class and day. Later saves move last_saved_by, never this. NULL while a planned substitute row waits for its roll.';
COMMENT ON COLUMN public.sis_class_sessions.sub_status IS
  'none: the assigned teacher took roll (or nothing to check). flagged: someone else took roll, or a planned substitute''s class was rolled by its teacher; a coordinator must decide. confirmed_sub / teacher_present / other: what the coordinator (or a matching planned substitute) decided.';
COMMENT ON COLUMN public.sis_class_sessions.planned_by IS
  'Set when the office marked the substitute ahead of time. Only a planned substitute gets roster and attendance access, and only for this class on this date (sis_service.class_scope with on_date).';
