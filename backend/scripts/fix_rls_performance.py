#!/usr/bin/env python3
"""
Fix RLS Performance Issues

This script addresses the auth_rls_initplan warnings from Supabase by optimizing
Row Level Security (RLS) policies to cache auth function calls instead of
re-evaluating them for each row.

The fix involves replacing:
  auth.uid() = user_id
with:
  (select auth.uid()) = user_id

This ensures the auth function is evaluated once and cached, rather than
being called for every row in the query.
"""

import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_supabase_admin_client
from supabase import create_client
import json

def main():
    """Fix RLS performance issues identified in supabase_warnings.json"""

    print("Starting RLS Performance Optimization...")

    # Connect to Supabase with admin privileges
    supabase = get_supabase_admin_client()

    # SQL commands to optimize RLS policies
    optimizations = [
        {
            "description": "Optimize friendships RLS policies",
            "sql": """
            -- Drop existing policies
            DROP POLICY IF EXISTS "Users can update friendships they're part of" ON public.friendships;
            DROP POLICY IF EXISTS "friendships_update_involved" ON public.friendships;

            -- Create optimized policies with cached auth calls
            CREATE POLICY "Users can update friendships they're part of"
            ON public.friendships FOR UPDATE
            USING ((select auth.uid()) = requester_id OR (select auth.uid()) = addressee_id);

            CREATE POLICY "friendships_update_involved"
            ON public.friendships FOR UPDATE
            USING ((select auth.uid()) = requester_id OR (select auth.uid()) = addressee_id);
            """
        },
        {
            "description": "Optimize diplomas RLS policies",
            "sql": """
            -- Drop existing policy
            DROP POLICY IF EXISTS "diplomas_update_own" ON public.diplomas;

            -- Create optimized policy with cached auth call
            CREATE POLICY "diplomas_update_own"
            ON public.diplomas FOR UPDATE
            USING ((select auth.uid()) = user_id);
            """
        },
        {
            "description": "Optimize user_skill_details RLS policies",
            "sql": """
            -- Drop existing policy
            DROP POLICY IF EXISTS "Service role can manage skill details" ON public.user_skill_details;

            -- Create optimized policy with cached auth call
            CREATE POLICY "Service role can manage skill details"
            ON public.user_skill_details FOR ALL
            USING ((select auth.role()) = 'service_role' OR (select auth.uid()) = user_id);
            """
        },
        {
            "description": "Optimize user_xp RLS policies",
            "sql": """
            -- Drop existing policies
            DROP POLICY IF EXISTS "Service role can manage all XP" ON public.user_xp;
            DROP POLICY IF EXISTS "Users can view own XP" ON public.user_xp;

            -- Create optimized policies with cached auth calls
            CREATE POLICY "Service role can manage all XP"
            ON public.user_xp FOR ALL
            USING ((select auth.role()) = 'service_role');

            CREATE POLICY "Users can view own XP"
            ON public.user_xp FOR SELECT
            USING ((select auth.uid()) = user_id);
            """
        },
        {
            "description": "Optimize quest_ideas RLS policies",
            "sql": """
            -- Drop existing policy
            DROP POLICY IF EXISTS "Users can manage own quest ideas" ON public.quest_ideas;

            -- Create optimized policy with cached auth call
            CREATE POLICY "Users can manage own quest ideas"
            ON public.quest_ideas FOR ALL
            USING ((select auth.uid()) = user_id);
            """
        },
        {
            "description": "Optimize quest_ratings RLS policies",
            "sql": """
            -- Drop existing policy
            DROP POLICY IF EXISTS "Users can manage own ratings" ON public.quest_ratings;

            -- Create optimized policy with cached auth call
            CREATE POLICY "Users can manage own ratings"
            ON public.quest_ratings FOR ALL
            USING ((select auth.uid()) = user_id);
            """
        },
        {
            "description": "Optimize users RLS policies",
            "sql": """
            -- Drop existing policies
            DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
            DROP POLICY IF EXISTS "Users can view own profile" ON public.users;

            -- Create optimized policies with cached auth calls
            CREATE POLICY "Users can update own profile"
            ON public.users FOR UPDATE
            USING ((select auth.uid()) = id);

            CREATE POLICY "Users can view own profile"
            ON public.users FOR SELECT
            USING ((select auth.uid()) = id);
            """
        }
    ]

    success_count = 0
    error_count = 0

    for optimization in optimizations:
        try:
            print(f"Optimizing: {optimization['description']}...")

            # Execute the SQL optimization
            supabase.rpc('exec_sql', {'sql': optimization['sql']}).execute()

            print(f"COMPLETED: {optimization['description']}")
            success_count += 1

        except Exception as e:
            print(f"FAILED: {optimization['description']} - ERROR: {str(e)}")
            error_count += 1
            continue

    print(f"\nRLS Optimization Results:")
    print(f"   Successful optimizations: {success_count}")
    print(f"   Failed optimizations: {error_count}")

    if error_count == 0:
        print(f"\nAll RLS policies have been optimized for performance!")
        print(f"   Auth function calls are now cached instead of re-evaluated per row.")
        print(f"   This should significantly improve query performance at scale.")
    else:
        print(f"\nSome optimizations failed. Please review the errors above.")

    return success_count > 0

if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"Fatal error: {str(e)}")
        sys.exit(1)