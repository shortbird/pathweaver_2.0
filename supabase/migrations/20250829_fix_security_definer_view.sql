-- Fix Security Definer View Issue
-- Removes SECURITY DEFINER from ai_generation_analytics view
-- This prevents privilege escalation and ensures RLS policies are properly enforced

-- Drop the existing view with SECURITY DEFINER
DROP VIEW IF EXISTS public.ai_generation_analytics CASCADE;

-- Recreate the view without SECURITY DEFINER
CREATE OR REPLACE VIEW public.ai_generation_analytics AS
SELECT 
    COUNT(*) AS total_generations,
    COUNT(DISTINCT user_id) AS unique_users,
    AVG((metadata->>'generation_time')::numeric) AS avg_generation_time,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) AS successful_generations,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) AS failed_generations
FROM public.ai_generation_jobs;

-- Grant appropriate permissions
GRANT SELECT ON public.ai_generation_analytics TO authenticated;
GRANT SELECT ON public.ai_generation_analytics TO service_role;