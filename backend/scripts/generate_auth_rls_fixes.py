#!/usr/bin/env python3
"""
Generate actual SQL to fix auth RLS initialization issues.
This script extracts policy names and creates SQL to query current policies
and generate optimized replacements.
"""

import json
import re
from typing import Dict, List, Set

def load_warnings(file_path: str) -> List[Dict]:
    """Load the Supabase warnings JSON file."""
    with open(file_path, 'r') as f:
        return json.load(f)

def extract_policy_name(detail: str) -> str:
    """Extract policy name from the warning detail."""
    # Pattern: "row level security policy `policy_name`"
    pattern = r'row level security policy `([^`]+)`'
    match = re.search(pattern, detail)
    if match:
        return match.group(1)
    return "UNKNOWN_POLICY"

def extract_table_name(detail: str) -> str:
    """Extract table name from the warning detail."""
    # Pattern: "Table `public.table_name`"
    pattern = r'Table `public\.([^`]+)`'
    match = re.search(pattern, detail)
    if match:
        return match.group(1)
    return "UNKNOWN_TABLE"

def generate_auth_rls_fix_sql() -> str:
    """Generate comprehensive SQL to fix all auth RLS issues."""

    sql_parts = []

    # Header
    sql_parts.append("-- ========================================")
    sql_parts.append("-- Fix Auth RLS Initialization Issues")
    sql_parts.append("-- ========================================")
    sql_parts.append("-- This script fixes auth.uid() and auth.jwt() calls in RLS policies")
    sql_parts.append("-- by wrapping them in subqueries for better performance.")
    sql_parts.append("--")
    sql_parts.append("-- IMPORTANT: Test this in development environment first!")
    sql_parts.append("-- ========================================")
    sql_parts.append("")

    # Load warnings and process
    warnings = load_warnings('../../supabase_warnings.json')
    auth_warnings = [w for w in warnings if w['name'] == 'auth_rls_initplan']

    # Group by table for better organization
    tables_policies = {}

    for warning in auth_warnings:
        detail = warning['detail']
        table_name = extract_table_name(detail)
        policy_name = extract_policy_name(detail)

        if table_name not in tables_policies:
            tables_policies[table_name] = []

        tables_policies[table_name].append(policy_name)

    # Generate SQL for each table
    for table_name in sorted(tables_policies.keys()):
        policies = tables_policies[table_name]

        sql_parts.append(f"-- ========================================")
        sql_parts.append(f"-- Table: {table_name}")
        sql_parts.append(f"-- Policies to fix: {len(policies)}")
        sql_parts.append(f"-- ========================================")
        sql_parts.append("")

        # First, get current policy definitions
        sql_parts.append(f"-- Step 1: Review current policies for {table_name}")
        sql_parts.append(f"SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check")
        sql_parts.append(f"FROM pg_policies ")
        sql_parts.append(f"WHERE tablename = '{table_name}' ")
        policy_list = ', '.join([f"'{p}'" for p in policies])
        sql_parts.append(f"  AND policyname IN ({policy_list});")
        sql_parts.append("")

        # Generate ALTER statements for each policy
        for policy_name in sorted(policies):
            sql_parts.append(f"-- Step 2: Fix policy '{policy_name}' on table '{table_name}'")
            sql_parts.append(f"-- Replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())")
            sql_parts.append(f"-- ALTER POLICY \"{policy_name}\" ON public.{table_name}")
            sql_parts.append(f"--   USING ([CURRENT_USING_EXPRESSION_WITH_FIXED_AUTH_CALLS]);")
            sql_parts.append(f"-- ")
            sql_parts.append(f"-- ALTER POLICY \"{policy_name}\" ON public.{table_name}")
            sql_parts.append(f"--   WITH CHECK ([CURRENT_CHECK_EXPRESSION_WITH_FIXED_AUTH_CALLS]);")
            sql_parts.append("")

        sql_parts.append("")

    # Add helper function to batch replace auth calls
    sql_parts.append("-- ========================================")
    sql_parts.append("-- Helper: Function to get policy definition with fixes")
    sql_parts.append("-- ========================================")
    sql_parts.append("")
    sql_parts.append("""
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
  WHERE tablename IN (""")

    # Add all affected table names
    table_list = "'" + "', '".join(sorted(tables_policies.keys())) + "'"
    sql_parts.append(f"    {table_list}")
    sql_parts.append("  )")
    sql_parts.append(")")
    sql_parts.append("SELECT ")
    sql_parts.append("  schemaname,")
    sql_parts.append("  tablename,")
    sql_parts.append("  policyname,")
    sql_parts.append("  cmd,")
    sql_parts.append("  'ALTER POLICY \"' || policyname || '\" ON ' || schemaname || '.' || tablename ||")
    sql_parts.append("  CASE ")
    sql_parts.append("    WHEN fixed_qual IS NOT NULL THEN ' USING (' || fixed_qual || ')'")
    sql_parts.append("    ELSE ''")
    sql_parts.append("  END ||")
    sql_parts.append("  CASE ")
    sql_parts.append("    WHEN fixed_with_check IS NOT NULL THEN ' WITH CHECK (' || fixed_with_check || ')'")
    sql_parts.append("    ELSE ''")
    sql_parts.append("  END || ';' as alter_statement")
    sql_parts.append("FROM policy_fixes")
    sql_parts.append("WHERE needs_fix = true")
    sql_parts.append("ORDER BY tablename, policyname;")
    sql_parts.append("")

    sql_parts.append("-- ========================================")
    sql_parts.append("-- Verification Query")
    sql_parts.append("-- ========================================")
    sql_parts.append("-- Run this after applying fixes to verify no auth.uid() or auth.jwt() remain:")
    sql_parts.append("")
    sql_parts.append("SELECT ")
    sql_parts.append("  schemaname,")
    sql_parts.append("  tablename,")
    sql_parts.append("  policyname,")
    sql_parts.append("  cmd,")
    sql_parts.append("  CASE ")
    sql_parts.append("    WHEN qual LIKE '%auth.uid()%' OR qual LIKE '%auth.jwt()%' THEN 'USING: ' || qual")
    sql_parts.append("    WHEN with_check LIKE '%auth.uid()%' OR with_check LIKE '%auth.jwt()%' THEN 'CHECK: ' || with_check")
    sql_parts.append("    ELSE 'FIXED'")
    sql_parts.append("  END as status")
    sql_parts.append("FROM pg_policies")
    sql_parts.append(f"WHERE tablename IN ({table_list})")
    sql_parts.append("  AND (qual LIKE '%auth.uid()%' OR qual LIKE '%auth.jwt()%' OR ")
    sql_parts.append("       with_check LIKE '%auth.uid()%' OR with_check LIKE '%auth.jwt()%')")
    sql_parts.append("ORDER BY tablename, policyname;")
    sql_parts.append("")

    return '\n'.join(sql_parts)

def main():
    sql_content = generate_auth_rls_fix_sql()

    # Write to file
    output_file = "fix_auth_rls_complete.sql"
    with open(output_file, 'w') as f:
        f.write(sql_content)

    print(f"Generated comprehensive auth RLS fix SQL: {output_file}")
    print("\nNext steps:")
    print("1. Review the generated SQL file")
    print("2. Connect to your Supabase database")
    print("3. Run the helper query to generate actual ALTER statements")
    print("4. Test the ALTER statements in development first")
    print("5. Apply to production when verified")

if __name__ == "__main__":
    main()