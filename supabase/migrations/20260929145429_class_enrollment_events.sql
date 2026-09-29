-- A dated history of every class a student was added to or dropped from.
--
-- iCreate, ticket fee0d486: "Could we get a place where we can see the history
-- of when classes were added and/or dropped by any particular student?"
--
-- class_enrollments is one row per (class, student) and a drop only flips its
-- status to 'withdrawn': no time, no actor. A re-add flips the same row back to
-- 'active' and the drop is gone. So before this migration the only answer to
-- "when was this dropped, and by whom" was "nobody knows".
--
-- Three parts:
--
--   1. class_enrollment_events: one row per add / drop / re-add / completion.
--      class_name is copied in so the history survives the class being
--      deleted (class_id goes NULL, the row stays). A student's events go
--      with the student (erasure). The actor's id goes NULL when they are
--      erased; the event stays.
--
--   2. class_enrollments.status_changed_by: the app writes the signed-in user
--      here in the same UPDATE that changes the status. Every write goes
--      through the service-role client, so auth.uid() is NULL inside the
--      trigger and cannot name anyone. The BEFORE trigger reads the column
--      and then clears it, so a later status change by a path that does not
--      set it records "unknown" rather than the previous actor.
--
--   3. Triggers on class_enrollments, so EVERY writer is recorded (routes,
--      services, repositories, scripts, the SQL editor) without each code path
--      having to remember. A path that forgets status_changed_by still gets a
--      dated event, only without a name.
--
-- Backfill (runs once, only when the table is empty):
--   * 'added' for every enrollment, at enrolled_at by enrolled_by. A re-add
--     never reset enrolled_at, so this is the FIRST add.
--   * dated 'dropped' from sis_billing_audit 'class_change_repriced' rows
--     (since 2026-09-21): detail.removed holds the class ids, the invoice
--     names the student (sis_invoices.student_user_id), actor_user_id is who
--     made the change. Verified read-only on 2026-09-29: all 74 (student,
--     class) pairs map to an existing enrollment in the same org; none
--     guessed. The time is when billing repriced, which the drop paths do
--     right after the drop.
--   * 'dropped' with date_known = false for every other withdrawn enrollment.
--     occurred_at is set to enrolled_at, the earliest it could have happened,
--     only so the row sorts after its add; the UI shows "date not recorded".
--   * 'readded' with date_known = false where a dated drop was followed by a
--     re-add (the enrollment is active again, or a later dated drop exists),
--     placed at the drop it followed.
--
-- RLS on, no policies: read through the service role by
-- backend/repositories/class_enrollment_event_repository.py, behind
-- ADMIN_ROLES and an org check. No per-table GRANT (Data API grants are
-- inherited).

BEGIN;

-- Writers wait for the few statements below instead of slipping an enrollment
-- change in between the backfill and the triggers.
LOCK TABLE public.class_enrollments IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS public.class_enrollment_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    class_id uuid REFERENCES public.org_classes(id) ON DELETE SET NULL,
    class_name text,
    student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    event text NOT NULL
        CONSTRAINT class_enrollment_events_event_check
        CHECK (event IN ('added', 'dropped', 'readded', 'completed')),
    actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    -- false only for backfilled rows whose real time was never recorded.
    date_known boolean NOT NULL DEFAULT true,
    backfilled boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS class_enrollment_events_org_student_idx
    ON public.class_enrollment_events (organization_id, student_id, occurred_at);
CREATE INDEX IF NOT EXISTS class_enrollment_events_class_idx
    ON public.class_enrollment_events (class_id);
CREATE INDEX IF NOT EXISTS class_enrollment_events_actor_idx
    ON public.class_enrollment_events (actor_id);

ALTER TABLE public.class_enrollment_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.class_enrollments
    ADD COLUMN IF NOT EXISTS status_changed_by uuid
        REFERENCES public.users(id) ON DELETE SET NULL;

-- ── Backfill ────────────────────────────────────────────────────────────────
DO $backfill$
BEGIN
    IF EXISTS (SELECT 1 FROM public.class_enrollment_events) THEN
        RETURN;
    END IF;

    -- 1. The first add of every enrollment.
    INSERT INTO public.class_enrollment_events
        (organization_id, class_id, class_name, student_id, event, actor_id,
         occurred_at, date_known, backfilled)
    SELECT c.organization_id, ce.class_id, c.name, ce.student_id, 'added',
           ce.enrolled_by, coalesce(ce.enrolled_at, now()),
           ce.enrolled_at IS NOT NULL, true
      FROM public.class_enrollments ce
      JOIN public.org_classes c ON c.id = ce.class_id;

    -- 2 + 4. Dated drops from billing, and the undated re-adds between them.
    CREATE TEMP TABLE _dated_drops ON COMMIT DROP AS
    SELECT c.organization_id, ce.class_id, c.name AS class_name, ce.student_id,
           ce.status, a.created_at,
           (SELECT u.id FROM public.users u WHERE u.id = a.actor_user_id) AS actor_id,
           row_number() OVER (PARTITION BY ce.id ORDER BY a.created_at DESC) AS rn_from_last
      FROM public.sis_billing_audit a
      JOIN public.sis_invoices i
        ON i.id = a.invoice_id AND i.organization_id = a.organization_id
      CROSS JOIN LATERAL jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(a.detail -> 'removed') = 'array'
                 THEN a.detail -> 'removed' ELSE '[]'::jsonb END) AS r(class_id)
      JOIN public.class_enrollments ce
        ON ce.student_id = i.student_user_id AND ce.class_id::text = r.class_id
      JOIN public.org_classes c
        ON c.id = ce.class_id AND c.organization_id = a.organization_id
     WHERE a.action = 'class_change_repriced'
       AND i.student_user_id IS NOT NULL;

    INSERT INTO public.class_enrollment_events
        (organization_id, class_id, class_name, student_id, event, actor_id,
         occurred_at, date_known, backfilled)
    SELECT organization_id, class_id, class_name, student_id, 'dropped',
           actor_id, created_at, true, true
      FROM _dated_drops;

    -- A dated drop that is not the enrollment's final state was undone.
    INSERT INTO public.class_enrollment_events
        (organization_id, class_id, class_name, student_id, event, actor_id,
         occurred_at, date_known, backfilled)
    SELECT organization_id, class_id, class_name, student_id, 'readded',
           NULL, created_at, false, true
      FROM _dated_drops
     WHERE rn_from_last > 1 OR status <> 'withdrawn';

    -- 3. Every other withdrawn enrollment: dropped, date never recorded.
    INSERT INTO public.class_enrollment_events
        (organization_id, class_id, class_name, student_id, event, actor_id,
         occurred_at, date_known, backfilled)
    SELECT c.organization_id, ce.class_id, c.name, ce.student_id, 'dropped',
           NULL, coalesce(ce.enrolled_at, now()), false, true
      FROM public.class_enrollments ce
      JOIN public.org_classes c ON c.id = ce.class_id
     WHERE ce.status = 'withdrawn'
       AND NOT EXISTS (SELECT 1 FROM _dated_drops d
                        WHERE d.student_id = ce.student_id
                          AND d.class_id = ce.class_id);
END
$backfill$;

-- ── Triggers ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.class_enrollment_log_event(
    p_class_id uuid, p_student_id uuid, p_event text, p_actor uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_org uuid;
    v_name text;
BEGIN
    SELECT organization_id, name INTO v_org, v_name
      FROM public.org_classes WHERE id = p_class_id;
    IF v_org IS NULL THEN
        RETURN;
    END IF;
    INSERT INTO public.class_enrollment_events
        (organization_id, class_id, class_name, student_id, event, actor_id)
    VALUES (v_org, p_class_id, v_name, p_student_id, p_event,
            (SELECT u.id FROM public.users u WHERE u.id = p_actor));
END;
$$;

-- Not an RPC: only the triggers below call it.
REVOKE EXECUTE ON FUNCTION public.class_enrollment_log_event(uuid, uuid, text, uuid)
    FROM PUBLIC, anon, authenticated;

-- BEFORE INSERT: status_changed_by on an insert means "who enrolled them".
-- Fold it into enrolled_by and clear it. This also runs for the proposed row of
-- an upsert, so EXCLUDED.status_changed_by is always NULL on the conflict path.
CREATE OR REPLACE FUNCTION public.class_enrollments_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.enrolled_by := coalesce(NEW.enrolled_by, NEW.status_changed_by);
    NEW.status_changed_by := NULL;
    RETURN NEW;
END;
$$;

-- AFTER INSERT, not BEFORE: an upsert fires BEFORE INSERT for a row that then
-- goes down the ON CONFLICT path and is never inserted.
CREATE OR REPLACE FUNCTION public.class_enrollments_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.status = 'active' THEN
        PERFORM public.class_enrollment_log_event(
            NEW.class_id, NEW.student_id, 'added', NEW.enrolled_by);
    END IF;
    RETURN NULL;
END;
$$;

-- BEFORE UPDATE: record a status change with the actor the app wrote in the
-- same statement, then clear the column so it never outlives that change.
-- A re-add through an upsert sets enrolled_by instead, hence the fallback.
CREATE OR REPLACE FUNCTION public.class_enrollments_before_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_event text;
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        v_event := CASE
            WHEN NEW.status = 'withdrawn' THEN 'dropped'
            WHEN NEW.status = 'completed' THEN 'completed'
            WHEN NEW.status = 'active' THEN 'readded'
        END;
        IF v_event IS NOT NULL THEN
            PERFORM public.class_enrollment_log_event(
                NEW.class_id, NEW.student_id, v_event,
                CASE WHEN v_event = 'readded'
                     THEN coalesce(NEW.status_changed_by, NEW.enrolled_by)
                     ELSE NEW.status_changed_by END);
        END IF;
    END IF;
    NEW.status_changed_by := NULL;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS class_enrollments_before_insert ON public.class_enrollments;
CREATE TRIGGER class_enrollments_before_insert
    BEFORE INSERT ON public.class_enrollments
    FOR EACH ROW EXECUTE FUNCTION public.class_enrollments_before_insert();

DROP TRIGGER IF EXISTS class_enrollments_after_insert ON public.class_enrollments;
CREATE TRIGGER class_enrollments_after_insert
    AFTER INSERT ON public.class_enrollments
    FOR EACH ROW EXECUTE FUNCTION public.class_enrollments_after_insert();

DROP TRIGGER IF EXISTS class_enrollments_before_update ON public.class_enrollments;
CREATE TRIGGER class_enrollments_before_update
    BEFORE UPDATE ON public.class_enrollments
    FOR EACH ROW EXECUTE FUNCTION public.class_enrollments_before_update();

COMMIT;
