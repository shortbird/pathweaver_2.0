-- Create RLS Policies for Tables with RLS Enabled but No Policies
-- These tables have RLS enabled but no policies, making them inaccessible

-- ==========================================
-- ai_cycle_logs table
-- ==========================================
CREATE POLICY "ai_cycle_logs_admin_only" ON public.ai_cycle_logs
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = (SELECT auth.uid()) 
            AND role = 'admin'
        )
    );

-- ==========================================
-- ai_generated_quests table
-- ==========================================
CREATE POLICY "ai_generated_quests_admin_all" ON public.ai_generated_quests
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = (SELECT auth.uid()) 
            AND role = 'admin'
        )
    );

CREATE POLICY "ai_generated_quests_educator_view" ON public.ai_generated_quests
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = (SELECT auth.uid()) 
            AND role = 'educator'
        )
    );

-- ==========================================
-- ai_generation_jobs table
-- ==========================================
CREATE POLICY "ai_generation_jobs_creator" ON public.ai_generation_jobs
    FOR ALL
    USING (
        created_by = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = (SELECT auth.uid()) 
            AND role = 'admin'
        )
    );

-- ==========================================
-- ai_prompt_templates table
-- ==========================================
CREATE POLICY "ai_prompt_templates_admin_modify" ON public.ai_prompt_templates
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = (SELECT auth.uid()) 
            AND role = 'admin'
        )
    );

CREATE POLICY "ai_prompt_templates_public_read" ON public.ai_prompt_templates
    FOR SELECT
    USING (is_active = true);

-- ==========================================
-- ai_quest_review_history table
-- ==========================================
CREATE POLICY "ai_quest_review_history_reviewers" ON public.ai_quest_review_history
    FOR ALL
    USING (
        reviewer_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = (SELECT auth.uid()) 
            AND role IN ('admin', 'educator')
        )
    );

-- ==========================================
-- ai_seeds table
-- ==========================================
CREATE POLICY "ai_seeds_admin_only" ON public.ai_seeds
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = (SELECT auth.uid()) 
            AND role = 'admin'
        )
    );

CREATE POLICY "ai_seeds_public_read" ON public.ai_seeds
    FOR SELECT
    USING (true);