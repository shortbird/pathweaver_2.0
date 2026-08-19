-- Documents a family must sign before the platform opens for them.
--
-- Sending a document for signature has existed since the secure-document store
-- shipped: the office uploads a file, picks recipients, and each one gets their
-- own copy plus a one-item checklist to sign it. What it could never express is
-- that signing is a CONDITION rather than a request. iCreate's ask (2026-08-18)
-- is the enrollment paperwork case -- the media release, the handbook
-- acknowledgement, the updated policy -- where "we'd like you to sign this"
-- and "you cannot use the platform until you sign this" are different things
-- and only the second one actually gets signed.
--
-- One boolean, on the row that already models "a thing this person must do":
--
--   sis_onboarding_assignments.blocks_access
--       This assignment holds the person's access until every required item on
--       it is done. Enforced in middleware/signature_gate.py and mirrored in
--       the web app's PrivateRoute, so it is a real gate rather than a redirect.
--
--   sis_onboarding_templates.blocks_access
--       The same flag on a template, copied onto each assignment when the
--       template is assigned. Templates are snapshotted at assign time already
--       (items are copied, not referenced), so the copy is the existing idiom
--       rather than a new one -- and it means editing a template later cannot
--       silently lock out families who were assigned the old version.
--
-- Deliberately NOT a users column. The hold belongs to the paperwork, so it
-- lifts by signing the paperwork or by the office releasing that one send; a
-- flag on the user would be a second piece of state to keep in step with the
-- assignments, and the way those go wrong is that the paperwork is signed and
-- the family stays locked out.
--
-- Default false: every existing assignment keeps behaving exactly as it does
-- today, and a send that nobody marked as required can never be the one that
-- locks a family out.

ALTER TABLE public.sis_onboarding_assignments
    ADD COLUMN IF NOT EXISTS blocks_access boolean NOT NULL DEFAULT false;

ALTER TABLE public.sis_onboarding_templates
    ADD COLUMN IF NOT EXISTS blocks_access boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sis_onboarding_assignments.blocks_access IS
    'Holds the recipient out of the platform until every required item is done. '
    'Enforced by backend/middleware/signature_gate.py.';

COMMENT ON COLUMN public.sis_onboarding_templates.blocks_access IS
    'Copied onto assignments created from this template (see assignments.blocks_access).';

-- The gate runs on requests, so its query has to be an index hit and nothing
-- else. Partial on the flag: the overwhelming majority of assignments are not
-- blocking, and those rows should not be in this index at all.
CREATE INDEX IF NOT EXISTS idx_onboarding_assignments_blocking
    ON public.sis_onboarding_assignments (user_id)
    WHERE blocks_access;
