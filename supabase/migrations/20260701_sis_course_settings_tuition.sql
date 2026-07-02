-- Per-org Optio-course settings grow beyond the teacher: add tuition.
--
-- Tuition for a live class lives on org_classes.price_cents (already snapshotted
-- by the registration/billing flow). The Optio at-home-learning courses are
-- global rows, so their per-org tuition joins the per-org teacher mapping —
-- renamed org_course_teachers -> org_course_settings to match its wider role.
-- teacher_id becomes nullable: an org can set tuition without a teacher (and
-- vice versa).

alter table public.org_course_teachers rename to org_course_settings;
alter index if exists idx_org_course_teachers_org rename to idx_org_course_settings_org;
alter index if exists idx_org_course_teachers_teacher rename to idx_org_course_settings_teacher;

alter table public.org_course_settings alter column teacher_id drop not null;
alter table public.org_course_settings add column if not exists tuition_cents integer;
