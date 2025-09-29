#!/usr/bin/env python3
"""
Script to analyze and fix multiple permissive policies issues.
This script identifies tables with multiple permissive policies for the same action
and generates SQL to consolidate them.
"""

import json
import re
from collections import defaultdict
from typing import Dict, List, Set, Tuple

def load_warnings(file_path: str) -> List[Dict]:
    """Load the Supabase warnings JSON file."""
    with open(file_path, 'r') as f:
        return json.load(f)

def parse_multiple_policy_warning(detail: str) -> Tuple[str, str, str, List[str]]:
    """
    Parse a multiple permissive policies warning.
    Returns: (table_name, role, action, policy_list)
    """
    # Extract table name: "Table \`public.table_name\`" (note escaped backticks)
    table_match = re.search(r'Table \\`public\.([^`]+)\\`', detail)
    table_name = table_match.group(1) if table_match else "UNKNOWN"

    # Extract role: "for role \`role_name\`"
    role_match = re.search(r'for role \\`([^`]+)\\`', detail)
    role = role_match.group(1) if role_match else "UNKNOWN"

    # Extract action: "for action \`ACTION\`"
    action_match = re.search(r'for action \\`([^`]+)\\`', detail)
    action = action_match.group(1) if action_match else "UNKNOWN"

    # Extract policies: "Policies include \`{policy1,policy2,...}\`"
    policies_match = re.search(r'Policies include \\`\{([^}]+)\}\\`', detail)
    if policies_match:
        policies_str = policies_match.group(1)
        # Split by comma and clean up policy names
        policies = [p.strip().strip('"') for p in policies_str.split(',')]
    else:
        policies = []

    return table_name, role, action, policies

def analyze_multiple_policies(warnings: List[Dict]) -> Dict[str, Dict[str, Dict[str, List[str]]]]:
    """
    Analyze multiple permissive policies warnings.
    Returns: {table_name: {action: {role: [policy_names]}}}
    """
    multiple_policy_warnings = [w for w in warnings if w['name'] == 'multiple_permissive_policies']

    # Structure: table -> action -> role -> list of policies
    policy_structure = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))

    for warning in multiple_policy_warnings:
        table_name, role, action, policies = parse_multiple_policy_warning(warning['detail'])

        if table_name != "UNKNOWN" and role != "UNKNOWN" and action != "UNKNOWN":
            policy_structure[table_name][action][role] = policies

    return dict(policy_structure)

def generate_consolidation_sql(policy_structure: Dict) -> str:
    """Generate SQL to consolidate multiple permissive policies."""

    sql_parts = []

    sql_parts.append("-- ========================================")
    sql_parts.append("-- Fix Multiple Permissive Policies")
    sql_parts.append("-- ========================================")
    sql_parts.append("-- This script consolidates multiple permissive RLS policies")
    sql_parts.append("-- into single policies for better performance.")
    sql_parts.append("--")
    sql_parts.append("-- WARNING: This affects security! Test thoroughly!")
    sql_parts.append("-- ========================================")
    sql_parts.append("")

    # Summary
    total_tables = len(policy_structure)
    total_issues = sum(
        len(actions) for actions in policy_structure.values()
    )

    sql_parts.append(f"-- Summary: {total_tables} tables with {total_issues} action/role combinations to fix")
    sql_parts.append("")

    # Generate queries for each table
    for table_name in sorted(policy_structure.keys()):
        actions = policy_structure[table_name]

        sql_parts.append(f"-- ========================================")
        sql_parts.append(f"-- Table: {table_name}")
        sql_parts.append(f"-- Actions to consolidate: {list(actions.keys())}")
        sql_parts.append(f"-- ========================================")
        sql_parts.append("")

        # Step 1: Review current policies
        sql_parts.append(f"-- Step 1: Review current policies for {table_name}")
        sql_parts.append(f"SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check")
        sql_parts.append(f"FROM pg_policies ")
        sql_parts.append(f"WHERE tablename = '{table_name}'")
        sql_parts.append(f"ORDER BY cmd, policyname;")
        sql_parts.append("")

        # Step 2: Generate consolidation plan for each action
        for action in sorted(actions.keys()):
            roles_policies = actions[action]

            sql_parts.append(f"-- Step 2: Consolidate {action} policies for {table_name}")
            sql_parts.append(f"-- Current multiple policies by role:")

            for role in sorted(roles_policies.keys()):
                policies = roles_policies[role]
                sql_parts.append(f"--   Role '{role}': {policies}")

            sql_parts.append("")

            # Generate consolidation strategy
            if len(roles_policies) == 1:
                # Single role, multiple policies - can combine with OR
                role = list(roles_policies.keys())[0]
                policies = roles_policies[role]

                sql_parts.append(f"-- Strategy: Combine {len(policies)} policies for role '{role}' using OR")
                sql_parts.append(f"-- 1. Get current policy definitions:")

                for policy in policies:
                    sql_parts.append(f"--    SELECT qual, with_check FROM pg_policies")
                    sql_parts.append(f"--    WHERE tablename = '{table_name}' AND policyname = '{policy}';")

                sql_parts.append(f"-- 2. Create consolidated policy:")
                new_policy_name = f"{table_name}_{action.lower()}_consolidated"
                sql_parts.append(f"-- CREATE POLICY \"{new_policy_name}\" ON public.{table_name}")
                sql_parts.append(f"--   FOR {action} TO {role}")
                sql_parts.append(f"--   USING (policy1_condition OR policy2_condition OR ...);")
                sql_parts.append(f"-- 3. Drop old policies:")

                for policy in policies:
                    sql_parts.append(f"-- DROP POLICY IF EXISTS \"{policy}\" ON public.{table_name};")

            else:
                # Multiple roles - more complex consolidation needed
                sql_parts.append(f"-- Strategy: Multiple roles detected - manual review required")
                sql_parts.append(f"-- Consider creating role-specific consolidated policies")

                for role in sorted(roles_policies.keys()):
                    policies = roles_policies[role]
                    if len(policies) > 1:
                        new_policy_name = f"{table_name}_{action.lower()}_{role}"
                        sql_parts.append(f"-- CREATE POLICY \"{new_policy_name}\" ON public.{table_name}")
                        sql_parts.append(f"--   FOR {action} TO {role}")
                        sql_parts.append(f"--   USING (combined_conditions_for_{role});")

            sql_parts.append("")

        sql_parts.append("")

    # Add helper queries
    sql_parts.append("-- ========================================")
    sql_parts.append("-- Helper Queries")
    sql_parts.append("-- ========================================")
    sql_parts.append("")

    sql_parts.append("-- Get all policies that need consolidation:")
    affected_tables = list(policy_structure.keys())
    table_list = "'" + "', '".join(affected_tables) + "'"

    sql_parts.append(f"""
SELECT
  tablename,
  cmd,
  array_agg(policyname) as policies,
  count(*) as policy_count
FROM pg_policies
WHERE tablename IN ({table_list})
  AND permissive = 'PERMISSIVE'
GROUP BY tablename, cmd, roles
HAVING count(*) > 1
ORDER BY tablename, cmd;
""")

    sql_parts.append("")
    sql_parts.append("-- Get policy definitions for manual review:")
    sql_parts.append(f"""
SELECT
  tablename || '.' || policyname as policy_id,
  cmd,
  roles,
  'USING: ' || COALESCE(qual, 'NULL') as using_clause,
  'CHECK: ' || COALESCE(with_check, 'NULL') as check_clause
FROM pg_policies
WHERE tablename IN ({table_list})
  AND permissive = 'PERMISSIVE'
ORDER BY tablename, cmd, policyname;
""")

    return '\n'.join(sql_parts)

def print_summary(policy_structure: Dict):
    """Print summary of multiple policies issues."""
    total_tables = len(policy_structure)
    total_combinations = 0
    total_policies = 0

    for table_name, actions in policy_structure.items():
        for action, roles in actions.items():
            for role, policies in roles.items():
                total_combinations += 1
                total_policies += len(policies)

    print(f"Multiple Permissive Policies Summary:")
    print(f"Total affected tables: {total_tables}")
    print(f"Total action/role combinations: {total_combinations}")
    print(f"Total policies involved: {total_policies}")
    print()

    # Show most affected tables
    table_policy_counts = {}
    for table_name, actions in policy_structure.items():
        count = 0
        for action, roles in actions.items():
            for role, policies in roles.items():
                count += len(policies)
        table_policy_counts[table_name] = count

    print("Most affected tables:")
    sorted_tables = sorted(table_policy_counts.items(), key=lambda x: x[1], reverse=True)
    for table_name, count in sorted_tables[:15]:
        actions_count = len(policy_structure[table_name])
        print(f"  {table_name}: {count} policies across {actions_count} actions")

def main():
    warnings = load_warnings('../../supabase_warnings.json')
    policy_structure = analyze_multiple_policies(warnings)

    print_summary(policy_structure)

    # Generate SQL
    sql_content = generate_consolidation_sql(policy_structure)

    # Write to file
    output_file = "consolidate_multiple_policies.sql"
    with open(output_file, 'w') as f:
        f.write(sql_content)

    print(f"\nGenerated policy consolidation SQL: {output_file}")
    print("\nNext steps:")
    print("1. Review the generated SQL file")
    print("2. Connect to your Supabase database")
    print("3. Run the helper queries to understand current policies")
    print("4. Manually create consolidated policies (security-sensitive!)")
    print("5. Test thoroughly in development")
    print("6. Apply to production when verified")

if __name__ == "__main__":
    main()