-- Which of a person's documents the office is actually asking them to SIGN.
--
-- iCreate, 2026-08-19. A staff onboarding template carries the item "Review &
-- Sign Your Contract" with no document attached to it -- the description says
-- "your contract will be uploaded to your teacher portal" -- so the item signs
-- against a POOL: every document the office has shared with that person
-- (services/sis_onboarding_service.office_documents). That was fine while the
-- only thing a school shared was the contract. Once iCreate also shared each
-- person's background check, the pool held two documents and the item offered
-- both under "Review before signing"; for the four people whose check was
-- shared and whose contract was not, it offered the background check AS the
-- contract. Molly, reading her own checklist: "it assigned the background check
-- to be the contract."
--
-- Nothing in the store said which file was the one to sign, so:
--
--   sis_secure_documents.requires_signature
--       The office is asking the owner to sign THIS document. Ticked where the
--       office already decides what the person may see (the upload form's "Let
--       them see it", and the list's bulk actions), because that is the moment
--       they have the file in front of them and know what it is.
--
-- How the pool uses it (office_documents): flagged documents WIN. When a person
-- has none flagged, the answer depends on whether their school uses the tick at
-- all -- a school that has never ticked anything keeps its whole shared pool
-- exactly as today, and a school that has starts meaning it when it says
-- nothing. The first half is the upgrade guarantee: an empty pool reads "your
-- document is not here yet" against an item the office believes it has already
-- satisfied, which is the failure this codebase shipped on 2026-08-18 (nineteen
-- contracts sat unshared and every teacher's checklist said exactly that), and
-- no school is to fall into it by deploying. The second half is the report
-- itself: the person the office never had a contract for was being offered
-- whatever else sat in her portal, which was her background check.
--
-- Default false for the same reason it is not backfilled to true wholesale:
-- "everything shared is signable" is the behaviour being fixed, so writing it
-- into every existing row would freeze the bug in place. Existing rows keep
-- working through the fallback above until somebody ticks the contract.
--
-- Sharing is implied, not separate: you cannot sign what you were never given,
-- so the routes force shared_with_owner on when this is set (see
-- routes/sis/secure_documents.py). The column is deliberately still its own
-- boolean rather than a state on shared_with_owner -- "they may read this" and
-- "they must sign this" are different decisions, and a background check a
-- teacher is allowed to keep a copy of is exactly the row where they differ.

ALTER TABLE public.sis_secure_documents
    ADD COLUMN IF NOT EXISTS requires_signature boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sis_secure_documents.requires_signature IS
    'The office is asking the owner to sign this document. Narrows the pool a '
    'checklist signature item signs against (services/sis_onboarding_service.'
    'office_documents); when a person has none flagged, every shared document '
    'stays in the pool as before.';

-- The pool read is per person and already filtered on organization_id +
-- owner_user_id + shared_with_owner; this partial index keeps the flagged
-- lookup cheap without carrying the (large majority) unflagged rows.
CREATE INDEX IF NOT EXISTS idx_secure_documents_requires_signature
    ON public.sis_secure_documents (owner_user_id)
    WHERE requires_signature;
