-- Student XP Goals — a weekly XP target a student works toward, visible to the
-- student, their parents, and their teachers.
--
-- Schools running Optio wanted something between "no target at all" and a
-- grade: a number the student is aiming at this week, that everyone around them
-- can see. XP is already the unit students think in, and it already accrues
-- from completed tasks, so the goal is a target on a number we compute rather
-- than a new kind of progress to track.
--
-- One row per *change*, not one row per week. `effective_from` is the Monday the
-- target starts applying, and it applies to that week and every later week until
-- a newer row supersedes it. That way a goal set once keeps standing (a student
-- shouldn't have to re-enter 500 every Monday), while the history of what the
-- target used to be survives — which matters, because "they hit their goal" is
-- meaningless if the goal was silently lowered afterward.
--
-- Progress is NOT stored. It is summed at read time from quest_task_completions
-- joined to user_quest_tasks.xp_value, the same derivation every other XP
-- rollup uses (quest_task_completions has no xp_awarded column). A stored
-- counter would drift the moment a completion is reversed or a task's XP edited.
--
-- Enabled per-org, opt-in, via the top-level feature_flags.xp_goals key read by
-- utils/org_features.org_has_feature — same idiom as lock_xp_editing and kiosk.
-- Turned on below for Optio Academy only.

CREATE TABLE IF NOT EXISTS public.student_weekly_xp_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Denormalized from users.organization_id at write time so the feature can be
  -- audited and reported per school without joining every read back to users.
  -- Nullable because a student can leave an org; the goal is still theirs.
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,

  -- XP to earn in a week. Bounded on both ends: 0 is not a goal, and the ceiling
  -- keeps a typo ("50000") from rendering a progress bar that can never move.
  target_xp integer NOT NULL CHECK (target_xp > 0 AND target_xp <= 10000),

  -- The Monday (in the org's timezone) this target starts applying from. The
  -- target in force for any given week is the newest row with
  -- effective_from <= that week's Monday.
  effective_from date NOT NULL,

  -- Who set it, and in what capacity. The role is captured at write time rather
  -- than looked up later: it is a record of who made this decision, and a
  -- teacher who later leaves the school should not retroactively become "the
  -- student" in their own goal history.
  set_by uuid NOT NULL REFERENCES public.users(id),
  set_by_role text NOT NULL
    CHECK (set_by_role IN ('student', 'parent', 'advisor', 'org_admin', 'superadmin')),

  -- Optional one-line encouragement or context from whoever set it. Shown to
  -- the student alongside the target.
  note text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Setting a goal twice in one week updates that week's row rather than
  -- stacking, so "the newest row at or before this Monday" is unambiguous.
  UNIQUE (student_user_id, effective_from)
);

-- The only read shape: "the goal in force for this student as of this Monday",
-- i.e. ORDER BY effective_from DESC LIMIT 1 with an upper bound.
CREATE INDEX IF NOT EXISTS idx_student_weekly_xp_goals_student
  ON public.student_weekly_xp_goals (student_user_id, effective_from DESC);
-- Org-wide reporting ("who set goals at this school this term").
CREATE INDEX IF NOT EXISTS idx_student_weekly_xp_goals_org
  ON public.student_weekly_xp_goals (organization_id, effective_from DESC);

DROP TRIGGER IF EXISTS set_student_weekly_xp_goals_updated_at ON public.student_weekly_xp_goals;
CREATE TRIGGER set_student_weekly_xp_goals_updated_at
  BEFORE UPDATE ON public.student_weekly_xp_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS on with no policies: service-role only. Every surface (the student's own
-- overview, the parent dashboard, the advisor check-in) reaches these rows
-- through Flask, which does the relationship check in
-- utils/portfolio_access.can_view_portfolio. Nothing should reach them through
-- the Data API, where a sibling's goal would be one query away.
ALTER TABLE public.student_weekly_xp_goals ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.student_weekly_xp_goals IS
  'Weekly XP targets for a student, set by the student, a parent, or a teacher. '
  'One row per change; the target in force for a week is the newest row with '
  'effective_from <= that week''s Monday. Opt-in per org via '
  'feature_flags.xp_goals.';
COMMENT ON COLUMN public.student_weekly_xp_goals.effective_from IS
  'Monday (org timezone) this target starts applying from. Standing until superseded.';
COMMENT ON COLUMN public.student_weekly_xp_goals.set_by_role IS
  'Capacity the setter acted in, recorded at write time — not re-derived later.';

-- Optio Academy only, for now.
UPDATE public.organizations
SET feature_flags = COALESCE(feature_flags, '{}'::jsonb) || jsonb_build_object('xp_goals', true)
WHERE id = '8ee22671-6e38-473c-a326-90ff86460310';
