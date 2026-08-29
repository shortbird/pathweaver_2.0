-- A narrowed send (one class, named teachers, an age band) must not surface in
-- the archive of every member who merely holds the audience role: the archive
-- matches target_audience by role token, and "parents (1 class; ages 15+)"
-- ILIKE-matches '%parents%' for every parent in the org. Snapshot recipients
-- already see it via announcement_recipients; this flag lets the archive skip
-- the role-token match for targeted rows (iCreate, 2026-08-26).
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS is_targeted boolean NOT NULL DEFAULT false;

-- History: every narrowed label carries a parenthesised filter description.
UPDATE public.announcements SET is_targeted = true WHERE target_audience LIKE '%(%';
