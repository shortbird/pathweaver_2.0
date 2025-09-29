#!/usr/bin/env python3
"""
Script to analyze RLS policies with auth function inefficiencies.
Based on Supabase warnings, identifies policies that call auth.uid() or auth.jwt()
without proper subquery wrapping.
"""

import json
import sys
from collections import defaultdict
from typing import Dict, List, Set

def load_warnings(file_path: str) -> List[Dict]:
    """Load the Supabase warnings JSON file."""
    try:
        with open(file_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading warnings file: {e}")
        sys.exit(1)

def analyze_auth_rls_issues(warnings: List[Dict]) -> Dict[str, List[Dict]]:
    """
    Analyze auth RLS initialization plan warnings.
    Returns a dictionary mapping table names to their auth RLS issues.
    """
    auth_issues = defaultdict(list)

    for warning in warnings:
        if warning['name'] == 'auth_rls_initplan':
            table_name = warning['metadata']['name']
            policy_info = {
                'detail': warning['detail'],
                'table': table_name,
                'schema': warning['metadata']['schema']
            }

            # Extract policy name from detail
            detail = warning['detail']
            if 'row level security policy' in detail:
                start = detail.find('row level security policy `') + len('row level security policy `')
                end = detail.find('`', start)
                if start > 0 and end > start:
                    policy_info['policy_name'] = detail[start:end]

            auth_issues[table_name].append(policy_info)

    return dict(auth_issues)

def generate_fix_queries(auth_issues: Dict[str, List[Dict]]) -> List[str]:
    """
    Generate SQL queries to fix auth RLS issues.
    Note: This generates template queries - actual policy definitions need to be retrieved from database.
    """
    queries = []

    queries.append("-- SQL to fix auth RLS initialization issues")
    queries.append("-- Note: These are template queries. You need to get current policy definitions")
    queries.append("-- and replace auth.uid() with (select auth.uid()) and auth.jwt() with (select auth.jwt())")
    queries.append("")

    for table_name, issues in auth_issues.items():
        queries.append(f"-- Table: {table_name}")

        for issue in issues:
            policy_name = issue.get('policy_name', 'UNKNOWN_POLICY')
            queries.append(f"-- Policy: {policy_name}")
            queries.append(f"-- Issue: {issue['detail']}")
            queries.append(f"-- TODO: Get current definition and replace auth functions with subqueries")
            queries.append(f"-- ALTER POLICY \"{policy_name}\" ON {table_name}")
            queries.append(f"--   USING (...replace auth.uid() with (select auth.uid())...);")
            queries.append("")

    return queries

def print_summary(auth_issues: Dict[str, List[Dict]]):
    """Print a summary of auth RLS issues."""
    total_issues = sum(len(issues) for issues in auth_issues.values())

    print(f"Auth RLS Initialization Issues Summary:")
    print(f"Total issues: {total_issues}")
    print(f"Affected tables: {len(auth_issues)}")
    print()

    # Sort tables by number of issues
    sorted_tables = sorted(auth_issues.items(), key=lambda x: len(x[1]), reverse=True)

    print("Most affected tables:")
    for table_name, issues in sorted_tables[:15]:  # Top 15
        print(f"  {table_name}: {len(issues)} policies")

    if len(sorted_tables) > 15:
        remaining_issues = sum(len(issues) for _, issues in sorted_tables[15:])
        print(f"  ... and {len(sorted_tables) - 15} more tables with {remaining_issues} total issues")

def main():
    if len(sys.argv) != 2:
        print("Usage: python analyze_rls_auth_issues.py <supabase_warnings.json>")
        sys.exit(1)

    warnings_file = sys.argv[1]
    warnings = load_warnings(warnings_file)

    print(f"Loaded {len(warnings)} total warnings")

    # Analyze auth RLS issues
    auth_issues = analyze_auth_rls_issues(warnings)
    print_summary(auth_issues)

    # Generate fix queries
    fix_queries = generate_fix_queries(auth_issues)

    # Write to output file
    output_file = "fix_auth_rls_issues.sql"
    with open(output_file, 'w') as f:
        f.write('\n'.join(fix_queries))

    print(f"\nGenerated template fix queries in: {output_file}")
    print("\nNext steps:")
    print("1. Connect to your database")
    print("2. Query pg_policies to get current policy definitions")
    print("3. Replace auth.uid() with (select auth.uid()) in policy expressions")
    print("4. Replace auth.jwt() with (select auth.jwt()) in policy expressions")
    print("5. Test the updated policies thoroughly")

if __name__ == "__main__":
    main()