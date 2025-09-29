-- SQL to fix auth RLS initialization issues
-- Note: These are template queries. You need to get current policy definitions
-- and replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())

-- Table: quest_paths
-- Policy: \
-- Issue: Table \`public.quest_paths\` has a row level security policy \`Only admins can manage quest paths\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "\" ON quest_paths
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: quest_customizations
-- Policy: mizations\
-- Issue: Table \`public.quest_customizations\` has a row level security policy \`Users can view their own quest customizations\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "mizations\" ON quest_customizations
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: mizations\
-- Issue: Table \`public.quest_customizations\` has a row level security policy \`Users can create quest customizations\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "mizations\" ON quest_customizations
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: mizations\
-- Issue: Table \`public.quest_customizations\` has a row level security policy \`Users can update their own quest customizations\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "mizations\" ON quest_customizations
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: mizations\
-- Issue: Table \`public.quest_customizations\` has a row level security policy \`Admins can view all quest customizations\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "mizations\" ON quest_customizations
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: mizations\
-- Issue: Table \`public.quest_customizations\` has a row level security policy \`Admins can update quest customizations\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "mizations\" ON quest_customizations
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: user_badges
-- Policy: \
-- Issue: Table \`public.user_badges\` has a row level security policy \`Users can view their own badges\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "\" ON user_badges
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: \
-- Issue: Table \`public.user_badges\` has a row level security policy \`Only system can manage user badges\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "\" ON user_badges
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: tutor_settings
-- Policy: ngs\
-- Issue: Table \`public.tutor_settings\` has a row level security policy \`Users can view own settings\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "ngs\" ON tutor_settings
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: tutor_safety_reports
-- Policy: y_reports\
-- Issue: Table \`public.tutor_safety_reports\` has a row level security policy \`Users can view own safety reports\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "y_reports\" ON tutor_safety_reports
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: tutor_parent_access
-- Policy: t_access\
-- Issue: Table \`public.tutor_parent_access\` has a row level security policy \`Parents can view own access records\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "t_access\" ON tutor_parent_access
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: tutor_analytics
-- Policy: tics\
-- Issue: Table \`public.tutor_analytics\` has a row level security policy \`Users can view own analytics\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "tics\" ON tutor_analytics
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: quest_task_completions
-- Policy: completions\
-- Issue: Table \`public.quest_task_completions\` has a row level security policy \`quest_task_completions_own_read\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "completions\" ON quest_task_completions
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: completions\
-- Issue: Table \`public.quest_task_completions\` has a row level security policy \`quest_task_completions_own_insert\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "completions\" ON quest_task_completions
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: tutor_tier_limits
-- Policy: limits\
-- Issue: Table \`public.tutor_tier_limits\` has a row level security policy \`Service role can modify tier limits\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "limits\" ON tutor_tier_limits
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: diplomas
-- Policy: has a row level security policy \
-- Issue: Table \`public.diplomas\` has a row level security policy \`diplomas_select_public\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "has a row level security policy \" ON diplomas
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: has a row level security policy \
-- Issue: Table \`public.diplomas\` has a row level security policy \`diplomas_insert_own\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "has a row level security policy \" ON diplomas
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: has a row level security policy \
-- Issue: Table \`public.diplomas\` has a row level security policy \`diplomas_update_own\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "has a row level security policy \" ON diplomas
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: has a row level security policy \
-- Issue: Table \`public.diplomas\` has a row level security policy \`diplomas_access\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "has a row level security policy \" ON diplomas
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: user_xp
-- Policy: as a row level security policy \
-- Issue: Table \`public.user_xp\` has a row level security policy \`Service role can manage all XP\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "as a row level security policy \" ON user_xp
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: as a row level security policy \
-- Issue: Table \`public.user_xp\` has a row level security policy \`user_xp_insert_own\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "as a row level security policy \" ON user_xp
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: as a row level security policy \
-- Issue: Table \`public.user_xp\` has a row level security policy \`user_xp_update_own\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "as a row level security policy \" ON user_xp
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: user_skill_details
-- Policy: details\
-- Issue: Table \`public.user_skill_details\` has a row level security policy \`Service role can manage skill details\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "details\" ON user_skill_details
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: activity_log
-- Policy: g\
-- Issue: Table \`public.activity_log\` has a row level security policy \`activity_log_select_own\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "g\" ON activity_log
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: friendships
-- Policy: \
-- Issue: Table \`public.friendships\` has a row level security policy \`friendships_select_involved\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "\" ON friendships
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: \
-- Issue: Table \`public.friendships\` has a row level security policy \`friendships_insert_requester\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "\" ON friendships
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: \
-- Issue: Table \`public.friendships\` has a row level security policy \`friendships_update_involved\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "\" ON friendships
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: \
-- Issue: Table \`public.friendships\` has a row level security policy \`friendships_delete_involved\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "\" ON friendships
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: \
-- Issue: Table \`public.friendships\` has a row level security policy \`Users can view their friendships\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "\" ON friendships
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: \
-- Issue: Table \`public.friendships\` has a row level security policy \`Users can send friend requests\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "\" ON friendships
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: \
-- Issue: Table \`public.friendships\` has a row level security policy \`Users can update friendships they're part of\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "\" ON friendships
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: quest_ratings
-- Policy: gs\
-- Issue: Table \`public.quest_ratings\` has a row level security policy \`quest_ratings_insert_own\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "gs\" ON quest_ratings
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: gs\
-- Issue: Table \`public.quest_ratings\` has a row level security policy \`quest_ratings_update_own\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "gs\" ON quest_ratings
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: quest_ideas
-- Policy: \
-- Issue: Table \`public.quest_ideas\` has a row level security policy \`quest_ideas_insert_auth\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "\" ON quest_ideas
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: \
-- Issue: Table \`public.quest_ideas\` has a row level security policy \`quest_ideas_update_own\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "\" ON quest_ideas
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: quests
-- Policy: s a row level security policy \
-- Issue: Table \`public.quests\` has a row level security policy \`Only admins can manage quests\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "s a row level security policy \" ON quests
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: submissions
-- Policy: \
-- Issue: Table \`public.submissions\` has a row level security policy \`submissions_insert_educator\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "\" ON submissions
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: \
-- Issue: Table \`public.submissions\` has a row level security policy \`submissions_update_educator\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "\" ON submissions
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: quest_tasks
-- Policy: \
-- Issue: Table \`public.quest_tasks\` has a row level security policy \`Only admins can manage quest tasks\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "\" ON quest_tasks
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: user_quests
-- Policy: \
-- Issue: Table \`public.user_quests\` has a row level security policy \`Users can view their own quest enrollments\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "\" ON user_quests
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: \
-- Issue: Table \`public.user_quests\` has a row level security policy \`Users can enroll in quests\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "\" ON user_quests
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: \
-- Issue: Table \`public.user_quests\` has a row level security policy \`Users can update their own quest enrollments\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "\" ON user_quests
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: user_achievements
-- Policy: ements\
-- Issue: Table \`public.user_achievements\` has a row level security policy \`user_achievements_insert\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "ements\" ON user_achievements
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: ements\
-- Issue: Table \`public.user_achievements\` has a row level security policy \`user_achievements_update\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "ements\" ON user_achievements
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: ements\
-- Issue: Table \`public.user_achievements\` has a row level security policy \`user_achievements_delete\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "ements\" ON user_achievements
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: ements\
-- Issue: Table \`public.user_achievements\` has a row level security policy \`user_achievements_select_own\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "ements\" ON user_achievements
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: quest_reviews
-- Policy: ws\
-- Issue: Table \`public.quest_reviews\` has a row level security policy \`quest_reviews_insert_reviewer\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "ws\" ON quest_reviews
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: ws\
-- Issue: Table \`public.quest_reviews\` has a row level security policy \`quest_reviews_update_reviewer\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "ws\" ON quest_reviews
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: parent_child_relationships
-- Policy: d_relationships\
-- Issue: Table \`public.parent_child_relationships\` has a row level security policy \`parent_child_select_involved\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "d_relationships\" ON parent_child_relationships
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: d_relationships\
-- Issue: Table \`public.parent_child_relationships\` has a row level security policy \`parent_child_insert_parent\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "d_relationships\" ON parent_child_relationships
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: d_relationships\
-- Issue: Table \`public.parent_child_relationships\` has a row level security policy \`parent_child_update_involved\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "d_relationships\" ON parent_child_relationships
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: advisor_groups
-- Policy: ups\
-- Issue: Table \`public.advisor_groups\` has a row level security policy \`advisor_groups_select_involved\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "ups\" ON advisor_groups
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: ups\
-- Issue: Table \`public.advisor_groups\` has a row level security policy \`advisor_groups_insert_advisor\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "ups\" ON advisor_groups
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: ups\
-- Issue: Table \`public.advisor_groups\` has a row level security policy \`advisor_groups_update_advisor\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "ups\" ON advisor_groups
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: user_quest_tasks
-- Policy: tasks\
-- Issue: Table \`public.user_quest_tasks\` has a row level security policy \`Users can view their own task completions\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "tasks\" ON user_quest_tasks
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: tasks\
-- Issue: Table \`public.user_quest_tasks\` has a row level security policy \`Users can complete their own tasks\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "tasks\" ON user_quest_tasks
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: user_skill_xp
-- Policy: xp\
-- Issue: Table \`public.user_skill_xp\` has a row level security policy \`Users can view their own XP\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "xp\" ON user_skill_xp
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: quest_submissions
-- Policy: ssions\
-- Issue: Table \`public.quest_submissions\` has a row level security policy \`Users can view their own submissions\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "ssions\" ON quest_submissions
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: ssions\
-- Issue: Table \`public.quest_submissions\` has a row level security policy \`Users can create submissions\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "ssions\" ON quest_submissions
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: ssions\
-- Issue: Table \`public.quest_submissions\` has a row level security policy \`Admins can view all submissions\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "ssions\" ON quest_submissions
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: ssions\
-- Issue: Table \`public.quest_submissions\` has a row level security policy \`Admins can update submissions\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "ssions\" ON quest_submissions
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: advisor_group_members
-- Policy: up_members\
-- Issue: Table \`public.advisor_group_members\` has a row level security policy \`advisor_group_members_select_involved\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "up_members\" ON advisor_group_members
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: quest_collaborations
-- Policy: borations\
-- Issue: Table \`public.quest_collaborations\` has a row level security policy \`Users can view their collaborations\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "borations\" ON quest_collaborations
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: borations\
-- Issue: Table \`public.quest_collaborations\` has a row level security policy \`Users can create collaboration requests\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "borations\" ON quest_collaborations
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: borations\
-- Issue: Table \`public.quest_collaborations\` has a row level security policy \`Users can respond to collaborations\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "borations\" ON quest_collaborations
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: user_mastery
-- Policy: y\
-- Issue: Table \`public.user_mastery\` has a row level security policy \`Users can view their own mastery\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "y\" ON user_mastery
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: learning_logs
-- Policy: gs\
-- Issue: Table \`public.learning_logs\` has a row level security policy \`Users can manage their own learning logs\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "gs\" ON learning_logs
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: pillar_subcategories
-- Policy: ategories\
-- Issue: Table \`public.pillar_subcategories\` has a row level security policy \`Only admins can manage pillar subcategories\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "ategories\" ON pillar_subcategories
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: quest_sources
-- Policy: es\
-- Issue: Table \`public.quest_sources\` has a row level security policy \`Only admins can manage quest sources\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "es\" ON quest_sources
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: security_warnings_documentation
-- Policy: rnings_documentation\
-- Issue: Table \`public.security_warnings_documentation\` has a row level security policy \`Only admins can manage security documentation\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "rnings_documentation\" ON security_warnings_documentation
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: user_subject_xp
-- Policy: t_xp\
-- Issue: Table \`public.user_subject_xp\` has a row level security policy \`Users can view their own subject XP\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "t_xp\" ON user_subject_xp
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: t_xp\
-- Issue: Table \`public.user_subject_xp\` has a row level security policy \`System can manage subject XP\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "t_xp\" ON user_subject_xp
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: user_task_evidence_documents
-- Policy: vidence_documents\
-- Issue: Table \`public.user_task_evidence_documents\` has a row level security policy \`Users can view their own evidence documents\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "vidence_documents\" ON user_task_evidence_documents
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: vidence_documents\
-- Issue: Table \`public.user_task_evidence_documents\` has a row level security policy \`Users can insert their own evidence documents\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "vidence_documents\" ON user_task_evidence_documents
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: vidence_documents\
-- Issue: Table \`public.user_task_evidence_documents\` has a row level security policy \`Users can update their own evidence documents\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "vidence_documents\" ON user_task_evidence_documents
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: vidence_documents\
-- Issue: Table \`public.user_task_evidence_documents\` has a row level security policy \`Users can delete their own evidence documents\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "vidence_documents\" ON user_task_evidence_documents
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: evidence_document_blocks
-- Policy: cument_blocks\
-- Issue: Table \`public.evidence_document_blocks\` has a row level security policy \`Users can view blocks from their own documents\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "cument_blocks\" ON evidence_document_blocks
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: cument_blocks\
-- Issue: Table \`public.evidence_document_blocks\` has a row level security policy \`Users can insert blocks into their own documents\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "cument_blocks\" ON evidence_document_blocks
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: cument_blocks\
-- Issue: Table \`public.evidence_document_blocks\` has a row level security policy \`Users can update blocks in their own documents\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "cument_blocks\" ON evidence_document_blocks
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: cument_blocks\
-- Issue: Table \`public.evidence_document_blocks\` has a row level security policy \`Users can delete blocks from their own documents\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "cument_blocks\" ON evidence_document_blocks
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: tutor_conversations
-- Policy: rsations\
-- Issue: Table \`public.tutor_conversations\` has a row level security policy \`Users can view own conversations\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "rsations\" ON tutor_conversations
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: rsations\
-- Issue: Table \`public.tutor_conversations\` has a row level security policy \`Users can create own conversations\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "rsations\" ON tutor_conversations
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: rsations\
-- Issue: Table \`public.tutor_conversations\` has a row level security policy \`Users can update own conversations\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "rsations\" ON tutor_conversations
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: tutor_messages
-- Policy: ges\
-- Issue: Table \`public.tutor_messages\` has a row level security policy \`Users can view own messages\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "ges\" ON tutor_messages
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy: ges\
-- Issue: Table \`public.tutor_messages\` has a row level security policy \`Users can create messages in own conversations\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "ges\" ON tutor_messages
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: users
-- Policy:  a row level security policy \
-- Issue: Table \`public.users\` has a row level security policy \`users_insert_own\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY " a row level security policy \" ON users
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy:  a row level security policy \
-- Issue: Table \`public.users\` has a row level security policy \`users_admin_access\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY " a row level security policy \" ON users
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy:  a row level security policy \
-- Issue: Table \`public.users\` has a row level security policy \`users_select_own\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY " a row level security policy \" ON users
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy:  a row level security policy \
-- Issue: Table \`public.users\` has a row level security policy \`users_update_own\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY " a row level security policy \" ON users
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy:  a row level security policy \
-- Issue: Table \`public.users\` has a row level security policy \`users_can_read_own\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY " a row level security policy \" ON users
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy:  a row level security policy \
-- Issue: Table \`public.users\` has a row level security policy \`users_can_update_own\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY " a row level security policy \" ON users
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Policy:  a row level security policy \
-- Issue: Table \`public.users\` has a row level security policy \`users_can_insert_own\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY " a row level security policy \" ON users
--   USING (...replace auth.uid() with (select auth.uid())...);

-- Table: quest_metadata
-- Policy: ata\
-- Issue: Table \`public.quest_metadata\` has a row level security policy \`Only admins can manage quest metadata\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
-- TODO: Get current definition and replace auth functions with subqueries
-- ALTER POLICY "ata\" ON quest_metadata
--   USING (...replace auth.uid() with (select auth.uid())...);
