-- A whole-day absence report can be filed twice.
--
-- uq_planned_absence_active has guarded (student_user_id, absence_date,
-- class_id) WHERE status = 'active' since the baseline, and the service treats
-- a rejected insert as "already reported, skip". But class_id is NULL for a
-- whole-day report -- which is the common case, and the only one the mobile app
-- can produce -- and in a btree unique index NULL is never equal to NULL. So
-- the guard has never applied to the reports it most needed to cover.
--
-- What that cost (Sentry OPTIO-MOBILE-4, 2026-09-02): reporting four children
-- absent takes ~18s, past the mobile client's 15s timeout, so the parent saw a
-- failure, submitted again, and the second submission wrote four more rows
-- instead of being skipped. Eight rows for four children on one date; she then
-- cancelled four of them by hand. The office had already been notified twice.
--
-- NULLS NOT DISTINCT (PG15+) makes the index mean what its name says. Existing
-- duplicates have to go first or the index cannot be built: the oldest active
-- row per (student, date, class) is kept -- it is the one the office was
-- notified about and the one the parent's list shows -- and later actives are
-- cancelled rather than deleted, so nothing disappears from an audit trail.

WITH ranked AS (
    SELECT id,
           row_number() OVER (
               PARTITION BY student_user_id, absence_date, class_id
               ORDER BY created_at, id
           ) AS n
    FROM public.student_planned_absences
    WHERE status = 'active'
)
UPDATE public.student_planned_absences a
SET status = 'cancelled',
    updated_at = now()
FROM ranked
WHERE a.id = ranked.id
  AND ranked.n > 1;

DROP INDEX IF EXISTS public.uq_planned_absence_active;

CREATE UNIQUE INDEX uq_planned_absence_active
    ON public.student_planned_absences
    USING btree (student_user_id, absence_date, class_id)
    NULLS NOT DISTINCT
    WHERE (status = 'active'::text);
