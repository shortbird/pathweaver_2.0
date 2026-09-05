-- Optio Academy credit requests go straight to Optio's review queue.
--
-- Credit routing asked "does this student have an organization_id?" and sent
-- everyone who did to a partner org admin for stage-one approval
-- (routes/tasks/credit.py). Optio Academy is Optio's OWN school, so its org has
-- no partner admin -- zero users in it hold org_admin or campus_coordinator.
-- Every request its students filed since April parked at
-- 'pending_org_approval', a queue with no owner, and never reached the
-- superadmin review page (which defaults to status='pending_review'). Clare
-- Bingham alone had 48 sitting there; 67 across the org.
--
-- This is the same wrong proxy that once dropped the WASC accreditation
-- statement off partner-credit transcripts -- "has an organization_id" is not
-- "is somebody else's student" (see services/academy_enrollment_service.py).
--
-- `feature_flags.credit_review_by_optio` is a generic per-org gate, not an
-- Optio Academy special case: any org whose credit Optio reviews directly can
-- set it, and partner orgs with real admins (Arete, Gryffin, iCreate) keep the
-- two-stage flow untouched. Absent or false = current behaviour.

UPDATE organizations
SET feature_flags = COALESCE(feature_flags, '{}'::jsonb)
                    || jsonb_build_object('credit_review_by_optio', true),
    updated_at = now()
WHERE slug = 'optio-academy';

-- Release the backlog these students are already waiting on. Only the parked
-- stage moves: 'grow_this' (returned to the student) and anything already
-- finalized are left alone, and no org outside the flag is touched. The org
-- stage was never acted on for these rows, so there is no org_reviewer_* data
-- to preserve -- platform-direct students have always reached 'pending_review'
-- without it.
UPDATE quest_task_completions c
SET diploma_status = 'pending_review'
FROM users u
WHERE u.id = c.user_id
  AND c.diploma_status = 'pending_org_approval'
  AND u.organization_id IN (
      SELECT id FROM organizations
      WHERE COALESCE((feature_flags ->> 'credit_review_by_optio')::boolean, false)
  );
