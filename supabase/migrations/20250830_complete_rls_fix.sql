-- Complete RLS Fix for Optio Database
-- This fixes all RLS policies based on the actual schema
-- Date: 2025-08-30

-- Create admin check function if it doesn't exist
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() 
        AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to safely create policies
CREATE OR REPLACE FUNCTION create_policy_if_not_exists(
    table_name text,
    policy_name text,
    policy_sql text
) RETURNS void AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = table_name 
        AND policyname = policy_name
    ) THEN
        EXECUTE policy_sql;
        RAISE NOTICE 'Created policy % on table %', policy_name, table_name;
    ELSE
        RAISE NOTICE 'Policy % already exists on table %', policy_name, table_name;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error creating policy % on table %: %', policy_name, table_name, SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Create all policies in a DO block
DO $$
BEGIN

-- 1. USERS TABLE - Core authentication table
PERFORM create_policy_if_not_exists('users', 'users_select_all', 
    'CREATE POLICY "users_select_all" ON public.users FOR SELECT USING (true)');
PERFORM create_policy_if_not_exists('users', 'users_insert_own',
    'CREATE POLICY "users_insert_own" ON public.users FOR INSERT WITH CHECK (id = auth.uid())');
PERFORM create_policy_if_not_exists('users', 'users_update_own',
    'CREATE POLICY "users_update_own" ON public.users FOR UPDATE USING (id = auth.uid())');
PERFORM create_policy_if_not_exists('users', 'users_admin_all',
    'CREATE POLICY "users_admin_all" ON public.users FOR ALL USING (is_admin())');

-- 2. QUESTS TABLE - Core quest content
PERFORM create_policy_if_not_exists('quests', 'quests_select_active',
    'CREATE POLICY "quests_select_active" ON public.quests FOR SELECT USING (is_active = true)');
PERFORM create_policy_if_not_exists('quests', 'quests_admin_all',
    'CREATE POLICY "quests_admin_all" ON public.quests FOR ALL USING (is_admin())');

-- 3. USER_QUESTS TABLE - User quest progress
PERFORM create_policy_if_not_exists('user_quests', 'user_quests_select_own',
    'CREATE POLICY "user_quests_select_own" ON public.user_quests FOR SELECT USING (user_id = auth.uid())');
PERFORM create_policy_if_not_exists('user_quests', 'user_quests_insert_own',
    'CREATE POLICY "user_quests_insert_own" ON public.user_quests FOR INSERT WITH CHECK (user_id = auth.uid())');
PERFORM create_policy_if_not_exists('user_quests', 'user_quests_update_own',
    'CREATE POLICY "user_quests_update_own" ON public.user_quests FOR UPDATE USING (user_id = auth.uid())');
PERFORM create_policy_if_not_exists('user_quests', 'user_quests_admin_all',
    'CREATE POLICY "user_quests_admin_all" ON public.user_quests FOR ALL USING (is_admin())');

-- 4. QUEST_TASKS TABLE - Quest task definitions
PERFORM create_policy_if_not_exists('quest_tasks', 'quest_tasks_select_all',
    'CREATE POLICY "quest_tasks_select_all" ON public.quest_tasks FOR SELECT USING (true)');
PERFORM create_policy_if_not_exists('quest_tasks', 'quest_tasks_admin_all',
    'CREATE POLICY "quest_tasks_admin_all" ON public.quest_tasks FOR ALL USING (is_admin())');

-- 5. USER_QUEST_TASKS TABLE - Task completions (this is the correct table name)
PERFORM create_policy_if_not_exists('user_quest_tasks', 'user_quest_tasks_select_own',
    'CREATE POLICY "user_quest_tasks_select_own" ON public.user_quest_tasks FOR SELECT USING (user_id = auth.uid())');
PERFORM create_policy_if_not_exists('user_quest_tasks', 'user_quest_tasks_insert_own',
    'CREATE POLICY "user_quest_tasks_insert_own" ON public.user_quest_tasks FOR INSERT WITH CHECK (user_id = auth.uid())');
PERFORM create_policy_if_not_exists('user_quest_tasks', 'user_quest_tasks_update_own',
    'CREATE POLICY "user_quest_tasks_update_own" ON public.user_quest_tasks FOR UPDATE USING (user_id = auth.uid())');
PERFORM create_policy_if_not_exists('user_quest_tasks', 'user_quest_tasks_admin_all',
    'CREATE POLICY "user_quest_tasks_admin_all" ON public.user_quest_tasks FOR ALL USING (is_admin())');

-- 6. LEARNING_LOGS TABLE
PERFORM create_policy_if_not_exists('learning_logs', 'learning_logs_select_own',
    'CREATE POLICY "learning_logs_select_own" ON public.learning_logs FOR SELECT USING (user_id = auth.uid())');
PERFORM create_policy_if_not_exists('learning_logs', 'learning_logs_insert_own',
    'CREATE POLICY "learning_logs_insert_own" ON public.learning_logs FOR INSERT WITH CHECK (user_id = auth.uid())');
PERFORM create_policy_if_not_exists('learning_logs', 'learning_logs_update_own',
    'CREATE POLICY "learning_logs_update_own" ON public.learning_logs FOR UPDATE USING (user_id = auth.uid())');
PERFORM create_policy_if_not_exists('learning_logs', 'learning_logs_delete_own',
    'CREATE POLICY "learning_logs_delete_own" ON public.learning_logs FOR DELETE USING (user_id = auth.uid())');
PERFORM create_policy_if_not_exists('learning_logs', 'learning_logs_admin_all',
    'CREATE POLICY "learning_logs_admin_all" ON public.learning_logs FOR ALL USING (is_admin())');

-- 7. DIPLOMAS TABLE (Note: uses is_public, not public_visibility)
PERFORM create_policy_if_not_exists('diplomas', 'diplomas_select_public',
    'CREATE POLICY "diplomas_select_public" ON public.diplomas FOR SELECT USING (is_public = true OR user_id = auth.uid())');
PERFORM create_policy_if_not_exists('diplomas', 'diplomas_insert_own',
    'CREATE POLICY "diplomas_insert_own" ON public.diplomas FOR INSERT WITH CHECK (user_id = auth.uid())');
PERFORM create_policy_if_not_exists('diplomas', 'diplomas_update_own',
    'CREATE POLICY "diplomas_update_own" ON public.diplomas FOR UPDATE USING (user_id = auth.uid())');
PERFORM create_policy_if_not_exists('diplomas', 'diplomas_admin_all',
    'CREATE POLICY "diplomas_admin_all" ON public.diplomas FOR ALL USING (is_admin())');

-- 8. USER_SKILL_XP TABLE
PERFORM create_policy_if_not_exists('user_skill_xp', 'user_skill_xp_select_all',
    'CREATE POLICY "user_skill_xp_select_all" ON public.user_skill_xp FOR SELECT USING (true)');
PERFORM create_policy_if_not_exists('user_skill_xp', 'user_skill_xp_insert_own',
    'CREATE POLICY "user_skill_xp_insert_own" ON public.user_skill_xp FOR INSERT WITH CHECK (user_id = auth.uid())');
PERFORM create_policy_if_not_exists('user_skill_xp', 'user_skill_xp_update_own',
    'CREATE POLICY "user_skill_xp_update_own" ON public.user_skill_xp FOR UPDATE USING (user_id = auth.uid())');
PERFORM create_policy_if_not_exists('user_skill_xp', 'user_skill_xp_admin_all',
    'CREATE POLICY "user_skill_xp_admin_all" ON public.user_skill_xp FOR ALL USING (is_admin())');

-- 9. QUEST_COLLABORATIONS TABLE
PERFORM create_policy_if_not_exists('quest_collaborations', 'quest_collaborations_select_involved',
    'CREATE POLICY "quest_collaborations_select_involved" ON public.quest_collaborations FOR SELECT USING (requester_id = auth.uid() OR partner_id = auth.uid())');
PERFORM create_policy_if_not_exists('quest_collaborations', 'quest_collaborations_insert_requester',
    'CREATE POLICY "quest_collaborations_insert_requester" ON public.quest_collaborations FOR INSERT WITH CHECK (requester_id = auth.uid())');
PERFORM create_policy_if_not_exists('quest_collaborations', 'quest_collaborations_update_involved',
    'CREATE POLICY "quest_collaborations_update_involved" ON public.quest_collaborations FOR UPDATE USING (requester_id = auth.uid() OR partner_id = auth.uid())');
PERFORM create_policy_if_not_exists('quest_collaborations', 'quest_collaborations_admin_all',
    'CREATE POLICY "quest_collaborations_admin_all" ON public.quest_collaborations FOR ALL USING (is_admin())');

-- 10. ACTIVITY_LOG TABLE
PERFORM create_policy_if_not_exists('activity_log', 'activity_log_select_own',
    'CREATE POLICY "activity_log_select_own" ON public.activity_log FOR SELECT USING (user_id = auth.uid())');
PERFORM create_policy_if_not_exists('activity_log', 'activity_log_insert_system',
    'CREATE POLICY "activity_log_insert_system" ON public.activity_log FOR INSERT WITH CHECK (true)');
PERFORM create_policy_if_not_exists('activity_log', 'activity_log_admin_all',
    'CREATE POLICY "activity_log_admin_all" ON public.activity_log FOR ALL USING (is_admin())');

-- 11. FRIENDSHIPS TABLE
PERFORM create_policy_if_not_exists('friendships', 'friendships_select_involved',
    'CREATE POLICY "friendships_select_involved" ON public.friendships FOR SELECT USING (requester_id = auth.uid() OR addressee_id = auth.uid())');
PERFORM create_policy_if_not_exists('friendships', 'friendships_insert_requester',
    'CREATE POLICY "friendships_insert_requester" ON public.friendships FOR INSERT WITH CHECK (requester_id = auth.uid())');
PERFORM create_policy_if_not_exists('friendships', 'friendships_update_involved',
    'CREATE POLICY "friendships_update_involved" ON public.friendships FOR UPDATE USING (requester_id = auth.uid() OR addressee_id = auth.uid())');
PERFORM create_policy_if_not_exists('friendships', 'friendships_delete_involved',
    'CREATE POLICY "friendships_delete_involved" ON public.friendships FOR DELETE USING (requester_id = auth.uid() OR addressee_id = auth.uid())');
PERFORM create_policy_if_not_exists('friendships', 'friendships_admin_all',
    'CREATE POLICY "friendships_admin_all" ON public.friendships FOR ALL USING (is_admin())');

-- 12. QUEST_RATINGS TABLE
PERFORM create_policy_if_not_exists('quest_ratings', 'quest_ratings_select_all',
    'CREATE POLICY "quest_ratings_select_all" ON public.quest_ratings FOR SELECT USING (true)');
PERFORM create_policy_if_not_exists('quest_ratings', 'quest_ratings_insert_own',
    'CREATE POLICY "quest_ratings_insert_own" ON public.quest_ratings FOR INSERT WITH CHECK (user_id = auth.uid())');
PERFORM create_policy_if_not_exists('quest_ratings', 'quest_ratings_update_own',
    'CREATE POLICY "quest_ratings_update_own" ON public.quest_ratings FOR UPDATE USING (user_id = auth.uid())');
PERFORM create_policy_if_not_exists('quest_ratings', 'quest_ratings_admin_all',
    'CREATE POLICY "quest_ratings_admin_all" ON public.quest_ratings FOR ALL USING (is_admin())');

-- 13. QUEST_IDEAS TABLE
PERFORM create_policy_if_not_exists('quest_ideas', 'quest_ideas_select_all',
    'CREATE POLICY "quest_ideas_select_all" ON public.quest_ideas FOR SELECT USING (true)');
PERFORM create_policy_if_not_exists('quest_ideas', 'quest_ideas_insert_auth',
    'CREATE POLICY "quest_ideas_insert_auth" ON public.quest_ideas FOR INSERT WITH CHECK (auth.uid() IS NOT NULL)');
PERFORM create_policy_if_not_exists('quest_ideas', 'quest_ideas_update_own',
    'CREATE POLICY "quest_ideas_update_own" ON public.quest_ideas FOR UPDATE USING (user_id = auth.uid())');
PERFORM create_policy_if_not_exists('quest_ideas', 'quest_ideas_admin_all',
    'CREATE POLICY "quest_ideas_admin_all" ON public.quest_ideas FOR ALL USING (is_admin())');

-- 14. SUBMISSIONS TABLE
PERFORM create_policy_if_not_exists('submissions', 'submissions_select_related',
    'CREATE POLICY "submissions_select_related" ON public.submissions FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.user_quests WHERE id = submissions.user_quest_id AND user_id = auth.uid())
        OR educator_id = auth.uid()
        OR is_admin()
    )');
PERFORM create_policy_if_not_exists('submissions', 'submissions_insert_educator',
    'CREATE POLICY "submissions_insert_educator" ON public.submissions FOR INSERT WITH CHECK (educator_id = auth.uid() OR is_admin())');
PERFORM create_policy_if_not_exists('submissions', 'submissions_update_educator',
    'CREATE POLICY "submissions_update_educator" ON public.submissions FOR UPDATE USING (educator_id = auth.uid() OR is_admin())');

-- 15. USER_XP TABLE
PERFORM create_policy_if_not_exists('user_xp', 'user_xp_select_all',
    'CREATE POLICY "user_xp_select_all" ON public.user_xp FOR SELECT USING (true)');
PERFORM create_policy_if_not_exists('user_xp', 'user_xp_insert_own',
    'CREATE POLICY "user_xp_insert_own" ON public.user_xp FOR INSERT WITH CHECK (user_id = auth.uid())');
PERFORM create_policy_if_not_exists('user_xp', 'user_xp_update_own',
    'CREATE POLICY "user_xp_update_own" ON public.user_xp FOR UPDATE USING (user_id = auth.uid())');
PERFORM create_policy_if_not_exists('user_xp', 'user_xp_admin_all',
    'CREATE POLICY "user_xp_admin_all" ON public.user_xp FOR ALL USING (is_admin())');

-- 16. SITE_SETTINGS TABLE
PERFORM create_policy_if_not_exists('site_settings', 'site_settings_select_all',
    'CREATE POLICY "site_settings_select_all" ON public.site_settings FOR SELECT USING (true)');
PERFORM create_policy_if_not_exists('site_settings', 'site_settings_admin_all',
    'CREATE POLICY "site_settings_admin_all" ON public.site_settings FOR ALL USING (is_admin())');

-- 17. LEADERBOARDS TABLE
PERFORM create_policy_if_not_exists('leaderboards', 'leaderboards_select_all',
    'CREATE POLICY "leaderboards_select_all" ON public.leaderboards FOR SELECT USING (true)');
PERFORM create_policy_if_not_exists('leaderboards', 'leaderboards_insert_system',
    'CREATE POLICY "leaderboards_insert_system" ON public.leaderboards FOR INSERT WITH CHECK (true)');
PERFORM create_policy_if_not_exists('leaderboards', 'leaderboards_admin_all',
    'CREATE POLICY "leaderboards_admin_all" ON public.leaderboards FOR ALL USING (is_admin())');

-- 18. USER_ACHIEVEMENTS TABLE
PERFORM create_policy_if_not_exists('user_achievements', 'user_achievements_select_own',
    'CREATE POLICY "user_achievements_select_own" ON public.user_achievements FOR SELECT USING (user_id = auth.uid())');
PERFORM create_policy_if_not_exists('user_achievements', 'user_achievements_insert_system',
    'CREATE POLICY "user_achievements_insert_system" ON public.user_achievements FOR INSERT WITH CHECK (true)');
PERFORM create_policy_if_not_exists('user_achievements', 'user_achievements_admin_all',
    'CREATE POLICY "user_achievements_admin_all" ON public.user_achievements FOR ALL USING (is_admin())');

-- 19. QUEST_REVIEWS TABLE
PERFORM create_policy_if_not_exists('quest_reviews', 'quest_reviews_select_related',
    'CREATE POLICY "quest_reviews_select_related" ON public.quest_reviews FOR SELECT USING (
        reviewer_id = auth.uid() 
        OR EXISTS (SELECT 1 FROM public.user_quests WHERE id = quest_reviews.user_quest_id AND user_id = auth.uid())
        OR is_admin()
    )');
PERFORM create_policy_if_not_exists('quest_reviews', 'quest_reviews_insert_reviewer',
    'CREATE POLICY "quest_reviews_insert_reviewer" ON public.quest_reviews FOR INSERT WITH CHECK (reviewer_id = auth.uid() OR is_admin())');
PERFORM create_policy_if_not_exists('quest_reviews', 'quest_reviews_update_reviewer',
    'CREATE POLICY "quest_reviews_update_reviewer" ON public.quest_reviews FOR UPDATE USING (reviewer_id = auth.uid() OR is_admin())');

-- 20. PARENT/ADVISOR RELATED TABLES
PERFORM create_policy_if_not_exists('parent_child_relationships', 'parent_child_select_involved',
    'CREATE POLICY "parent_child_select_involved" ON public.parent_child_relationships FOR SELECT USING (parent_id = auth.uid() OR child_id = auth.uid())');
PERFORM create_policy_if_not_exists('parent_child_relationships', 'parent_child_insert_parent',
    'CREATE POLICY "parent_child_insert_parent" ON public.parent_child_relationships FOR INSERT WITH CHECK (parent_id = auth.uid())');
PERFORM create_policy_if_not_exists('parent_child_relationships', 'parent_child_update_involved',
    'CREATE POLICY "parent_child_update_involved" ON public.parent_child_relationships FOR UPDATE USING (parent_id = auth.uid() OR child_id = auth.uid())');

PERFORM create_policy_if_not_exists('advisor_groups', 'advisor_groups_select_involved',
    'CREATE POLICY "advisor_groups_select_involved" ON public.advisor_groups FOR SELECT USING (
        advisor_id = auth.uid() 
        OR EXISTS (SELECT 1 FROM public.advisor_group_members WHERE group_id = advisor_groups.id AND student_id = auth.uid())
    )');
PERFORM create_policy_if_not_exists('advisor_groups', 'advisor_groups_insert_advisor',
    'CREATE POLICY "advisor_groups_insert_advisor" ON public.advisor_groups FOR INSERT WITH CHECK (advisor_id = auth.uid())');
PERFORM create_policy_if_not_exists('advisor_groups', 'advisor_groups_update_advisor',
    'CREATE POLICY "advisor_groups_update_advisor" ON public.advisor_groups FOR UPDATE USING (advisor_id = auth.uid())');

PERFORM create_policy_if_not_exists('advisor_group_members', 'advisor_group_members_select_involved',
    'CREATE POLICY "advisor_group_members_select_involved" ON public.advisor_group_members FOR SELECT USING (
        student_id = auth.uid() 
        OR EXISTS (SELECT 1 FROM public.advisor_groups WHERE id = advisor_group_members.group_id AND advisor_id = auth.uid())
    )');

-- 21. AI RELATED TABLES (Admin only for now)
PERFORM create_policy_if_not_exists('ai_generated_quests', 'ai_generated_quests_admin_all',
    'CREATE POLICY "ai_generated_quests_admin_all" ON public.ai_generated_quests FOR ALL USING (is_admin())');
PERFORM create_policy_if_not_exists('ai_generation_jobs', 'ai_generation_jobs_admin_all',
    'CREATE POLICY "ai_generation_jobs_admin_all" ON public.ai_generation_jobs FOR ALL USING (is_admin())');
PERFORM create_policy_if_not_exists('ai_prompt_templates', 'ai_prompt_templates_admin_all',
    'CREATE POLICY "ai_prompt_templates_admin_all" ON public.ai_prompt_templates FOR ALL USING (is_admin())');
PERFORM create_policy_if_not_exists('ai_quest_review_history', 'ai_quest_review_history_admin_all',
    'CREATE POLICY "ai_quest_review_history_admin_all" ON public.ai_quest_review_history FOR ALL USING (is_admin())');
PERFORM create_policy_if_not_exists('ai_seeds', 'ai_seeds_admin_all',
    'CREATE POLICY "ai_seeds_admin_all" ON public.ai_seeds FOR ALL USING (is_admin())');
PERFORM create_policy_if_not_exists('ai_cycle_logs', 'ai_cycle_logs_admin_all',
    'CREATE POLICY "ai_cycle_logs_admin_all" ON public.ai_cycle_logs FOR ALL USING (is_admin())');

END $$; -- Close the DO block

-- Clean up helper function
DROP FUNCTION IF EXISTS create_policy_if_not_exists(text, text, text);

-- Final status report
DO $$
DECLARE
    table_record RECORD;
    policy_count INTEGER;
    tables_with_rls INTEGER := 0;
    tables_with_policies INTEGER := 0;
    tables_without_policies INTEGER := 0;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '     RLS POLICY STATUS REPORT';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    
    FOR table_record IN 
        SELECT t.tablename 
        FROM pg_tables t
        WHERE t.schemaname = 'public'
        AND EXISTS (
            SELECT 1 
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
            AND c.relname = t.tablename
            AND c.relrowsecurity = true
        )
        ORDER BY t.tablename
    LOOP
        tables_with_rls := tables_with_rls + 1;
        
        SELECT COUNT(*) INTO policy_count
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = table_record.tablename;
        
        IF policy_count = 0 THEN
            tables_without_policies := tables_without_policies + 1;
            RAISE NOTICE '❌ %-30s: RLS enabled but NO policies!', table_record.tablename;
        ELSE
            tables_with_policies := tables_with_policies + 1;
            RAISE NOTICE '✅ %-30s: %s policies', table_record.tablename, policy_count;
        END IF;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'SUMMARY:';
    RAISE NOTICE '  Tables with RLS enabled: %', tables_with_rls;
    RAISE NOTICE '  Tables with policies: %', tables_with_policies;
    RAISE NOTICE '  Tables WITHOUT policies: %', tables_without_policies;
    RAISE NOTICE '';
    
    IF tables_without_policies = 0 THEN
        RAISE NOTICE '🎉 SUCCESS: All RLS-enabled tables have policies!';
        RAISE NOTICE 'Your application should now have full database access.';
    ELSE
        RAISE NOTICE '⚠️  WARNING: Some tables still need policies.';
        RAISE NOTICE 'Check the tables marked with ❌ above.';
    END IF;
    
    RAISE NOTICE '========================================';
END $$;