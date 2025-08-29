-- Fix function search path security warnings
-- Generated on 2025-01-08

-- =============================================
-- SET SEARCH_PATH FOR ALL FUNCTIONS TO PREVENT SQL INJECTION
-- =============================================

-- Fix calculate_quest_quality_score function
ALTER FUNCTION public.calculate_quest_quality_score(quest_id uuid)
SET search_path = public, pg_catalog;

-- Fix award_xp_on_completion function
ALTER FUNCTION public.award_xp_on_completion()
SET search_path = public, pg_catalog;

-- Fix get_user_total_xp function
ALTER FUNCTION public.get_user_total_xp(user_id uuid)
SET search_path = public, pg_catalog;

-- Fix recalculate_user_skill_xp function
ALTER FUNCTION public.recalculate_user_skill_xp(p_user_id uuid)
SET search_path = public, pg_catalog;

-- Fix initialize_user_skills function
ALTER FUNCTION public.initialize_user_skills()
SET search_path = public, pg_catalog;

-- Fix update_quest_quality_score function
ALTER FUNCTION public.update_quest_quality_score()
SET search_path = public, pg_catalog;

-- Fix add_default_quest_xp function
ALTER FUNCTION public.add_default_quest_xp()
SET search_path = public, pg_catalog;

-- Fix get_monthly_active_users function
ALTER FUNCTION public.get_monthly_active_users()
SET search_path = public, pg_catalog;

-- Fix get_user_xp_by_subject function
ALTER FUNCTION public.get_user_xp_by_subject(p_user_id uuid)
SET search_path = public, pg_catalog;

-- Fix update_updated_at_column function
ALTER FUNCTION public.update_updated_at_column()
SET search_path = public, pg_catalog;

-- Fix check_quest_duplicate function
ALTER FUNCTION public.check_quest_duplicate()
SET search_path = public, pg_catalog;

-- Fix both versions of generate_portfolio_slug function
-- First version (with parameters if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' 
    AND p.proname = 'generate_portfolio_slug'
    AND p.pronargs > 0
  ) THEN
    EXECUTE 'ALTER FUNCTION public.generate_portfolio_slug(text, text) SET search_path = public, pg_catalog';
  END IF;
END $$;

-- Second version (without parameters if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' 
    AND p.proname = 'generate_portfolio_slug'
    AND p.pronargs = 0
  ) THEN
    EXECUTE 'ALTER FUNCTION public.generate_portfolio_slug() SET search_path = public, pg_catalog';
  END IF;
END $$;

-- =============================================
-- FIX EXTENSIONS IN PUBLIC SCHEMA
-- Note: Moving extensions requires superuser privileges
-- These commands may need to be run manually in Supabase dashboard
-- =============================================

-- Create a dedicated schema for extensions if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Grant usage on extensions schema to necessary roles
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- The following commands require superuser privileges and may need to be run manually:
-- ALTER EXTENSION pg_net SET SCHEMA extensions;
-- ALTER EXTENSION pg_trgm SET SCHEMA extensions;
-- ALTER EXTENSION vector SET SCHEMA extensions;

-- Add comments for manual execution
COMMENT ON SCHEMA extensions IS 'Schema for PostgreSQL extensions - keeps them out of public schema for security';

-- =============================================
-- ADD RLS POLICIES FOR TABLES WITH RLS ENABLED BUT NO POLICIES
-- =============================================

-- Policies for ai_cycle_logs
CREATE POLICY "Admins can manage AI cycle logs" ON public.ai_cycle_logs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

-- Policies for ai_generated_quests
CREATE POLICY "Users can view their AI generated quests" ON public.ai_generated_quests
  FOR SELECT USING (created_by = (SELECT auth.uid()));

CREATE POLICY "Users can create AI generated quests" ON public.ai_generated_quests
  FOR INSERT WITH CHECK (created_by = (SELECT auth.uid()));

CREATE POLICY "Admins can manage all AI generated quests" ON public.ai_generated_quests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

-- Policies for ai_generation_jobs
CREATE POLICY "Users can view their AI generation jobs" ON public.ai_generation_jobs
  FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can create AI generation jobs" ON public.ai_generation_jobs
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update their AI generation jobs" ON public.ai_generation_jobs
  FOR UPDATE USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Admins can manage all AI generation jobs" ON public.ai_generation_jobs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

-- Policies for ai_prompt_templates
CREATE POLICY "All users can view AI prompt templates" ON public.ai_prompt_templates
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage AI prompt templates" ON public.ai_prompt_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

-- Policies for ai_quest_review_history
CREATE POLICY "Users can view AI quest review history for their quests" ON public.ai_quest_review_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.ai_generated_quests
      WHERE ai_generated_quests.id = ai_quest_review_history.quest_id
      AND ai_generated_quests.created_by = (SELECT auth.uid())
    )
  );

CREATE POLICY "System can create AI quest review history" ON public.ai_quest_review_history
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

-- Policies for ai_seeds
CREATE POLICY "All users can view AI seeds" ON public.ai_seeds
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage AI seeds" ON public.ai_seeds
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );