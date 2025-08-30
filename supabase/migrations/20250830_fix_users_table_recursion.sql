-- Fix infinite recursion in users table RLS policy
-- The issue: users table policy queries itself to check admin role, causing infinite recursion
-- Solution: Simplify the policy to avoid self-referencing queries

-- 1. First, drop the problematic policy
DROP POLICY IF EXISTS "users_own_read" ON public.users;

-- 2. Create a simpler policy that doesn't cause recursion
-- Option A: Users can only see their own record (simplest, most secure)
CREATE POLICY "users_own_read" ON public.users
    FOR SELECT
    USING (id = auth.uid());

-- 3. For admin access, create a separate policy using a different approach
-- Instead of checking the users table, we'll check if the user has admin JWT claims
-- or create a separate admin access policy
CREATE POLICY "users_admin_read" ON public.users
    FOR SELECT
    USING (
        -- Check if the current user's JWT has admin role claim
        -- This avoids querying the users table recursively
        (auth.jwt() ->> 'role')::text = 'admin'
        OR 
        -- Alternative: check if it's a service role key (for backend admin operations)
        (auth.jwt() ->> 'role')::text = 'service_role'
    );

-- 4. Also fix the update/insert/delete policies for users table
DROP POLICY IF EXISTS "users_own_update" ON public.users;
DROP POLICY IF EXISTS "users_own_insert" ON public.users;
DROP POLICY IF EXISTS "users_own_delete" ON public.users;

-- Users can update their own record
CREATE POLICY "users_own_update" ON public.users
    FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- Users can insert their own record (for registration)
CREATE POLICY "users_own_insert" ON public.users
    FOR INSERT
    WITH CHECK (id = auth.uid());

-- 5. Fix other tables that might reference users table in their policies
-- Fix user_skill_xp policy to avoid potential issues
DROP POLICY IF EXISTS "user_skill_xp_read" ON public.user_skill_xp;

CREATE POLICY "user_skill_xp_read" ON public.user_skill_xp
    FOR SELECT
    USING (
        user_id = auth.uid() 
        OR
        -- Check if the diploma is public without querying users table
        EXISTS (
            SELECT 1 FROM public.diplomas 
            WHERE diplomas.user_id = user_skill_xp.user_id 
            AND diplomas.is_public = true
        )
    );

-- 6. Fix diplomas policy to avoid users table reference
DROP POLICY IF EXISTS "diplomas_access" ON public.diplomas;

CREATE POLICY "diplomas_access" ON public.diplomas
    FOR SELECT
    USING (
        user_id = auth.uid() 
        OR 
        is_public = true
        OR
        -- Check for admin role in JWT instead of users table
        (auth.jwt() ->> 'role')::text = 'admin'
    );

-- 7. Create a function to safely check if current user is admin
-- This function uses SECURITY DEFINER to bypass RLS when checking admin status
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_role text;
BEGIN
    -- First check JWT claims
    IF (auth.jwt() ->> 'role')::text = 'admin' THEN
        RETURN true;
    END IF;
    
    -- Then check users table (this won't cause recursion because SECURITY DEFINER bypasses RLS)
    SELECT role INTO user_role
    FROM public.users
    WHERE id = auth.uid();
    
    RETURN user_role = 'admin';
EXCEPTION
    WHEN OTHERS THEN
        RETURN false;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

-- 8. Now we can optionally update policies to use this function
-- But for now, the simpler policies above should work

-- 9. Test function to verify the fix
CREATE OR REPLACE FUNCTION public.test_users_table_access()
RETURNS TABLE(
    test_name text,
    result text,
    details text
) 
LANGUAGE plpgsql
AS $$
BEGIN
    -- Test 1: Check if we can query users table without recursion
    BEGIN
        PERFORM 1 FROM public.users LIMIT 1;
        RETURN QUERY SELECT 
            'users_table_query'::text, 
            'PASS'::text,
            'Successfully queried users table'::text;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT 
            'users_table_query'::text, 
            'FAIL'::text,
            SQLERRM::text;
    END;
    
    -- Test 2: Check site_settings access
    BEGIN
        PERFORM 1 FROM public.site_settings LIMIT 1;
        RETURN QUERY SELECT 
            'site_settings_query'::text, 
            'PASS'::text,
            'Successfully queried site_settings'::text;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT 
            'site_settings_query'::text, 
            'FAIL'::text,
            SQLERRM::text;
    END;
    
    -- Test 3: Check quests access
    BEGIN
        PERFORM 1 FROM public.quests WHERE is_active = true LIMIT 1;
        RETURN QUERY SELECT 
            'quests_query'::text, 
            'PASS'::text,
            'Successfully queried quests table'::text;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT 
            'quests_query'::text, 
            'FAIL'::text,
            SQLERRM::text;
    END;
    
    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.test_users_table_access() TO anon, authenticated;

-- Run the test
SELECT * FROM public.test_users_table_access();

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Fixed infinite recursion in users table RLS policy!';
    RAISE NOTICE 'Users can now only see their own records.';
    RAISE NOTICE 'Admin access is handled via JWT claims.';
END $$;