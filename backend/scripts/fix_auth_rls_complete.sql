-- ========================================
-- Fix Auth RLS Initialization Issues
-- ========================================
-- This script fixes auth.uid() and auth.jwt() calls in RLS policies
-- by wrapping them in subqueries for better performance.
--
-- IMPORTANT: Test this in development environment first!
-- ========================================

-- ========================================
-- Table: UNKNOWN_TABLE
-- Policies to fix: 93
-- ========================================

-- Step 1: Review current policies for UNKNOWN_TABLE
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'UNKNOWN_TABLE' 
  AND policyname IN ('UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY', 'UNKNOWN_POLICY');

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);

-- Step 2: Fix policy 'UNKNOWN_POLICY' on table 'UNKNOWN_TABLE'
-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);
-- 
-- ALTER POLICY "UNKNOWN_POLICY" ON public.UNKNOWN_TABLE
--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);


-- ========================================
-- Helper: Function to get policy definition with fixes
-- ========================================


-- Function to generate fixed policy definitions
-- Run this to see what the fixed policies should look like:

WITH policy_fixes AS (
  SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    -- Fix USING clause
    CASE
      WHEN qual IS NOT NULL THEN
        REPLACE(
          REPLACE(qual, 'auth.uid()', '(select auth.uid())'),
          'auth.jwt()', '(select auth.jwt())'
        )
      ELSE NULL
    END as fixed_qual,
    -- Fix WITH CHECK clause
    CASE
      WHEN with_check IS NOT NULL THEN
        REPLACE(
          REPLACE(with_check, 'auth.uid()', '(select auth.uid())'),
          'auth.jwt()', '(select auth.jwt())'
        )
      ELSE NULL
    END as fixed_with_check,
    -- Check if policy needs fixing
    (qual LIKE '%auth.uid()%' OR qual LIKE '%auth.jwt()%' OR
     with_check LIKE '%auth.uid()%' OR with_check LIKE '%auth.jwt()%') as needs_fix
  FROM pg_policies
  WHERE tablename IN (
    'UNKNOWN_TABLE'
  )
)
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd,
  'ALTER POLICY "' || policyname || '" ON ' || schemaname || '.' || tablename ||
  CASE 
    WHEN fixed_qual IS NOT NULL THEN ' USING (' || fixed_qual || ')'
    ELSE ''
  END ||
  CASE 
    WHEN fixed_with_check IS NOT NULL THEN ' WITH CHECK (' || fixed_with_check || ')'
    ELSE ''
  END || ';' as alter_statement
FROM policy_fixes
WHERE needs_fix = true
ORDER BY tablename, policyname;

-- ========================================
-- Verification Query
-- ========================================
-- Run this after applying fixes to verify no auth.uid() or auth.jwt() remain:

SELECT 
  schemaname,
  tablename,
  policyname,
  cmd,
  CASE 
    WHEN qual LIKE '%auth.uid()%' OR qual LIKE '%auth.jwt()%' THEN 'USING: ' || qual
    WHEN with_check LIKE '%auth.uid()%' OR with_check LIKE '%auth.jwt()%' THEN 'CHECK: ' || with_check
    ELSE 'FIXED'
  END as status
FROM pg_policies
WHERE tablename IN ('UNKNOWN_TABLE')
  AND (qual LIKE '%auth.uid()%' OR qual LIKE '%auth.jwt()%' OR 
       with_check LIKE '%auth.uid()%' OR with_check LIKE '%auth.jwt()%')
ORDER BY tablename, policyname;
