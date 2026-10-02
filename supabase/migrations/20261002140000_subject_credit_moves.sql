-- Moving a quest's credit from one diploma subject to another.
--
-- Kristine Waechtler (Optio Academy), 2026-10-02: her daughter's Archery quest
-- was credited as Electives and belongs in PE. A family asks from Courses and
-- Credits; Optio approves or declines it in the /credit-dashboard queue; the
-- move itself is services/subject_credit_move_service.move_quest_subject_credit,
-- which rewrites the approved splits, the pending splits, the quest's task
-- splits and user_subject_xp together.
--
-- subject_credit_move_requests  what a family asked for and what Optio decided.
--   One pending request per (student, quest, from_subject): asking twice is
--   the same request. xp_snapshot is the XP the move covered when it was
--   asked, so the reviewer sees the number the family saw.
--
-- subject_credit_moves  the audit row for every move that ran, from an
--   approval or from a script (request_id is null then). finalized_xp and
--   pending_xp are what was actually moved; clamped records any shortfall
--   where user_subject_xp held less than the records said it should.
--
-- RLS on, no policies: both are read and written through the service role by
-- backend/repositories/subject_credit_move_repository.py, behind the family
-- scope (@student_scope) and superadmin gates in routes/quest/courses_and_credits.py
-- and routes/credit_dashboard/subject_moves.py. No per-table GRANT (Data API
-- grants are inherited).

CREATE TABLE IF NOT EXISTS public.subject_credit_move_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    quest_id uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
    from_subject public.school_subject NOT NULL,
    to_subject public.school_subject NOT NULL,
    xp_snapshot integer NOT NULL DEFAULT 0,
    requested_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    reason text,
    status text NOT NULL DEFAULT 'pending',
    decided_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    decided_at timestamptz,
    decision_note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT subject_credit_move_requests_status
        CHECK (status IN ('pending', 'approved', 'declined', 'cancelled')),
    CONSTRAINT subject_credit_move_requests_subjects_differ
        CHECK (from_subject <> to_subject),
    CONSTRAINT subject_credit_move_requests_reason_length
        CHECK (reason IS NULL OR char_length(reason) <= 1000),
    CONSTRAINT subject_credit_move_requests_note_length
        CHECK (decision_note IS NULL OR char_length(decision_note) <= 1000)
);

CREATE UNIQUE INDEX IF NOT EXISTS subject_credit_move_requests_one_pending
    ON public.subject_credit_move_requests (student_id, quest_id, from_subject)
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS subject_credit_move_requests_status_created
    ON public.subject_credit_move_requests (status, created_at);
CREATE INDEX IF NOT EXISTS subject_credit_move_requests_student
    ON public.subject_credit_move_requests (student_id);

ALTER TABLE public.subject_credit_move_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.subject_credit_moves (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    quest_id uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
    from_subject public.school_subject NOT NULL,
    to_subject public.school_subject NOT NULL,
    finalized_xp integer NOT NULL DEFAULT 0,
    pending_xp integer NOT NULL DEFAULT 0,
    clamped jsonb NOT NULL DEFAULT '{}'::jsonb,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    request_id uuid REFERENCES public.subject_credit_move_requests(id) ON DELETE SET NULL,
    moved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    reason text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subject_credit_moves_student_quest
    ON public.subject_credit_moves (student_id, quest_id);

ALTER TABLE public.subject_credit_moves ENABLE ROW LEVEL SECURITY;
