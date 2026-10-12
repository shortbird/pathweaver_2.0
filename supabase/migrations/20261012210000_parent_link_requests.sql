-- A platform student with no parent asks for one to be linked.
--
-- Until now only a superadmin could link a parent to an existing student
-- account, and nothing in the app said so: a parent and her 15-year-old spent
-- a day looking for the button (bounty report, 2026-09-09). This table is the
-- request. The student names a parent email; the parent proves the address by
-- signing in from the emailed link (status 'accepted'); a superadmin approves
-- and only then is a parent_student_links row written. A linked parent
-- approves the child's friends and portfolio, so a student must not be able to
-- name any adult and have the link go live -- that is why the last step is a
-- person.
--
-- Read and written only by the backend (admin client), so RLS is on with no
-- policies.

CREATE TABLE IF NOT EXISTS public.parent_link_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    parent_email text NOT NULL,
    code_hash text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'invited'
        CHECK (status IN ('invited', 'accepted', 'approved', 'declined', 'cancelled', 'expired')),
    parent_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    expires_at timestamptz NOT NULL,
    accepted_at timestamptz,
    decided_at timestamptz,
    decided_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    link_id uuid REFERENCES public.parent_student_links(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- One open request per student: a new one replaces the old.
CREATE UNIQUE INDEX IF NOT EXISTS parent_link_requests_one_open
    ON public.parent_link_requests (student_id)
    WHERE status IN ('invited', 'accepted');

CREATE INDEX IF NOT EXISTS parent_link_requests_status
    ON public.parent_link_requests (status, accepted_at);

ALTER TABLE public.parent_link_requests ENABLE ROW LEVEL SECURITY;
