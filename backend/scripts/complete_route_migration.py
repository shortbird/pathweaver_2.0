"""
Complete Route Migration to Repository Pattern
Part of Phase 3 final cleanup - eliminate all direct database access in routes.
"""

import os
import re
from pathlib import Path

# Routes directory
ROUTES_DIR = Path(__file__).parent.parent / "routes"

# Common patterns to replace
PATTERNS = [
    # Pattern 1: supabase.table('friendships') -> friendship_repo.method()
    {
        'table': 'friendships',
        'repository': 'FriendshipRepository',
        'comment': '# Using FriendshipRepository instead of direct database access'
    },
    # Pattern 2: supabase.table('users') -> user_repo.method()
    {
        'table': 'users',
        'repository': 'UserRepository',
        'comment': '# Using UserRepository instead of direct database access'
    },
    # Pattern 3: supabase.table('evidence_document_blocks') -> evidence_repo.method()
    {
        'table': 'evidence_document_blocks',
        'repository': 'EvidenceRepository',
        'comment': '# Using EvidenceRepository instead of direct database access'
    },
    # Pattern 4: supabase.table('tutor_conversations') -> tutor_repo.method()
    {
        'table': 'tutor_conversations',
        'repository': 'TutorRepository',
        'comment': '# Using TutorRepository instead of direct database access'
    },
    # Pattern 5: supabase.table('parent_student_links') -> parent_repo.method()
    {
        'table': 'parent_student_links',
        'repository': 'ParentRepository',
        'comment': '# Using ParentRepository instead of direct database access'
    },
]


def analyze_route_file(filepath):
    """Analyze a route file for database access patterns."""

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Count direct table access
    table_access_count = content.count('.table(')

    # Check which tables are accessed
    tables_used = set()
    for match in re.finditer(r"\.table\(['\"](\w+)['\"]\)", content):
        tables_used.add(match.group(1))

    # Check if repositories are imported
    has_repo_imports = 'from backend.repositories import' in content

    # Check if get_supabase or get_user_client is used
    has_direct_db = 'get_supabase' in content or 'get_user_client' in content

    return {
        'file': filepath.name,
        'table_access_count': table_access_count,
        'tables_used': tables_used,
        'has_repo_imports': has_repo_imports,
        'has_direct_db': has_direct_db,
        'needs_migration': table_access_count > 0
    }


def generate_migration_report():
    """Generate a comprehensive migration report."""

    print("=" * 70)
    print("ROUTE MIGRATION ANALYSIS REPORT")
    print("=" * 70)
    print()

    all_routes = []

    # Scan all route files
    for root, dirs, files in os.walk(ROUTES_DIR):
        for file in files:
            if file.endswith('.py') and file != '__init__.py':
                filepath = Path(root) / file
                analysis = analyze_route_file(filepath)
                all_routes.append(analysis)

    # Sort by table access count (most to least)
    all_routes.sort(key=lambda x: x['table_access_count'], reverse=True)

    # Print summary
    total_routes = len(all_routes)
    routes_needing_migration = sum(1 for r in all_routes if r['needs_migration'])
    total_table_accesses = sum(r['table_access_count'] for r in all_routes)

    print(f"Total Routes: {total_routes}")
    print(f"Routes Needing Migration: {routes_needing_migration}")
    print(f"Total Direct Table Accesses: {total_table_accesses}")
    print()
    print("-" * 70)
    print("TOP 20 ROUTES BY DIRECT DATABASE ACCESS:")
    print("-" * 70)
    print(f"{'File':<35} {'Table Access':<15} {'Tables Used'}")
    print("-" * 70)

    for route in all_routes[:20]:
        if route['needs_migration']:
            tables_str = ', '.join(sorted(route['tables_used']))[:30]
            print(f"{route['file']:<35} {route['table_access_count']:<15} {tables_str}")

    print()
    print("-" * 70)
    print("TABLES ACCESSED ACROSS ALL ROUTES:")
    print("-" * 70)

    # Collect all tables
    all_tables = {}
    for route in all_routes:
        for table in route['tables_used']:
            if table not in all_tables:
                all_tables[table] = 0
            all_tables[table] += 1

    # Sort by frequency
    for table, count in sorted(all_tables.items(), key=lambda x: x[1], reverse=True):
        repo_available = "[OK] Repository Available" if table in ['friendships', 'users', 'evidence_document_blocks', 'tutor_conversations', 'parent_student_links', 'lms_integrations'] else "[WARN] No Repository"
        print(f"  {table:<30} {count:>3} routes    {repo_available}")

    print()
    print("=" * 70)
    print()

    # Prioritization
    print("MIGRATION PRIORITY RECOMMENDATION:")
    print()
    print("HIGH PRIORITY (Most Usage + Repository Available):")
    high_priority_tables = [
        ('friendships', 'FriendshipRepository'),
        ('users', 'UserRepository'),
        ('evidence_document_blocks', 'EvidenceRepository'),
        ('tutor_conversations', 'TutorRepository'),
        ('parent_student_links', 'ParentRepository'),
    ]

    for table, repo in high_priority_tables:
        if table in all_tables:
            print(f"  - {table:<30} → {repo:<25} ({all_tables[table]} routes)")

    print()
    print("MEDIUM PRIORITY (Need New Repository):")
    medium_priority_tables = [
        ('quests', 'QuestRepository (exists)'),
        ('user_quests', 'QuestRepository (exists)'),
        ('badges', 'BadgeRepository (exists)'),
        ('quest_task_completions', 'Need TaskRepository'),
        ('user_quest_tasks', 'Need TaskRepository'),
    ]

    for table, note in medium_priority_tables:
        if table in all_tables:
            print(f"  - {table:<30} → {note:<25} ({all_tables[table]} routes)")

    print()
    print("=" * 70)


if __name__ == "__main__":
    generate_migration_report()
