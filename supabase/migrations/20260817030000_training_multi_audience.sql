-- A training quest can go to more than one group, and students are one of them.
--
-- Background. sis_staff_training.audience was a single value, 'staff' or
-- 'family', and 'family' meant the guardians only. So a school's catalog could
-- express "all teachers" or "all parents" and nothing else.
--
-- iCreate, 2026-08-17, of the orientation quest: they do not want it on
-- everybody's account. They want it on "12+ students and all parents" -- two
-- groups at once, one of which did not exist here at all, and one of which
-- needs an age gate.
--
-- Three columns, and the old one stays:
--
--   audiences        who the row is actually for. The source of truth for
--                    assignment and for the catalog read.
--   student_min_age  the age gate, applied to students only. Both ends are
--   student_max_age  optional; "12 and up" is min 12, max NULL.
--
-- audience is kept, in step with audiences, as the row's PRIMARY group in a
-- fixed staff > family > student order. It carries the unique index (one
-- catalog row per quest per school) and it is what the guardian-facing family
-- portal still filters on, so a row that includes parents keeps showing there
-- whether or not it also reaches students.
--
-- Existing rows are backfilled to exactly what they already meant, so nothing
-- changes for a catalog nobody has edited.

ALTER TABLE public.sis_staff_training
    ADD COLUMN IF NOT EXISTS audiences text[],
    ADD COLUMN IF NOT EXISTS student_min_age smallint,
    ADD COLUMN IF NOT EXISTS student_max_age smallint;

UPDATE public.sis_staff_training
   SET audiences = ARRAY[audience]
 WHERE audiences IS NULL;

ALTER TABLE public.sis_staff_training
    ALTER COLUMN audiences SET DEFAULT ARRAY['staff']::text[];

-- A row aimed at nobody is not a row. Enforced here rather than in the route
-- because an empty array reads as "everyone" to anything that forgets to check.
ALTER TABLE public.sis_staff_training
    DROP CONSTRAINT IF EXISTS sis_staff_training_audiences_check;
ALTER TABLE public.sis_staff_training
    ADD CONSTRAINT sis_staff_training_audiences_check
    CHECK (audiences IS NOT NULL
           AND array_length(audiences, 1) >= 1
           AND audiences <@ ARRAY['staff'::text, 'family'::text, 'student'::text]);

-- 'student' joins the primary-audience values the old column accepts.
ALTER TABLE public.sis_staff_training
    DROP CONSTRAINT IF EXISTS sis_staff_training_audience_check;
ALTER TABLE public.sis_staff_training
    ADD CONSTRAINT sis_staff_training_audience_check
    CHECK (audience = ANY (ARRAY['staff'::text, 'family'::text, 'student'::text]));

-- An impossible window would silently assign to nobody, which looks identical
-- to a broken assign button.
ALTER TABLE public.sis_staff_training
    DROP CONSTRAINT IF EXISTS sis_staff_training_student_age_check;
ALTER TABLE public.sis_staff_training
    ADD CONSTRAINT sis_staff_training_student_age_check
    CHECK ((student_min_age IS NULL OR student_min_age BETWEEN 0 AND 120)
           AND (student_max_age IS NULL OR student_max_age BETWEEN 0 AND 120)
           AND (student_min_age IS NULL OR student_max_age IS NULL
                OR student_min_age <= student_max_age));

CREATE INDEX IF NOT EXISTS idx_sis_staff_training_audiences
    ON public.sis_staff_training USING gin (audiences);

COMMENT ON COLUMN public.sis_staff_training.audiences IS
    'Every group this quest is set for: staff, family (guardians), student. Source of truth for assignment and for the catalog read.';
COMMENT ON COLUMN public.sis_staff_training.audience IS
    'The row''s primary group (staff > family > student), kept in step with audiences. Carries the one-row-per-quest unique index and the guardian family-portal read.';
COMMENT ON COLUMN public.sis_staff_training.student_min_age IS
    'Youngest student this reaches, in whole years from date_of_birth. NULL means no floor. Students with no recorded DOB are left out whenever either bound is set.';
COMMENT ON COLUMN public.sis_staff_training.student_max_age IS
    'Oldest student this reaches, in whole years. NULL means no ceiling.';
