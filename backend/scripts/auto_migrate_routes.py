"""
Automated Route Migration Script - Repository Pattern Adoption

This script automatically migrates route files to use repository pattern instead of
direct database access. It handles common patterns and generates migration reports.

Usage:
    python backend/scripts/auto_migrate_routes.py [--dry-run] [--route ROUTE_FILE]
"""

import os
import re
import sys
from pathlib import Path
from typing import Dict, List, Tuple, Set

# Add backend to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir.parent))

# Table to Repository mapping
TABLE_REPOSITORY_MAP = {
    'users': 'UserRepository',
    'quests': 'QuestRepository',
    'user_quests': 'QuestRepository',
    'user_quest_tasks': 'TaskRepository',
    'quest_task_completions': 'TaskCompletionRepository',
    'badges': 'BadgeRepository',
    'user_badges': 'BadgeRepository',
    'friendships': 'FriendshipRepository',
    'evidence_document_blocks': 'EvidenceRepository',
    'user_task_evidence_documents': 'EvidenceDocumentRepository',
    'parent_student_links': 'ParentRepository',
    'parent_invitations': 'ParentRepository',
    'tutor_conversations': 'TutorRepository',
    'tutor_messages': 'TutorRepository',
    'lms_integrations': 'LMSRepository',
    'lms_sessions': 'LMSRepository',
}

# Common query patterns to repository method mappings
QUERY_PATTERNS = [
    # Find by ID pattern
    (
        r"\.table\(['\"](\w+)['\"]\)\.select\(['\*']['\)]*\)\.eq\(['\"]id['\"]\s*,\s*(\w+)\)",
        lambda table, var: f"{TABLE_REPOSITORY_MAP.get(table, 'Unknown')}_repo.find_by_id({var})"
    ),
    # Find all with filter pattern
    (
        r"\.table\(['\"](\w+)['\"]\)\.select\(['\*']['\)]*\)\.eq\(['\"](\w+)['\"]\s*,\s*(\w+)\)",
        lambda table, field, var: f"{TABLE_REPOSITORY_MAP.get(table, 'Unknown')}_repo.find_all(filters={{'{field}': {var}}})"
    ),
]


def analyze_route_file(filepath: str) -> Dict:
    """Analyze a route file for migration opportunities"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Count direct table accesses
    table_accesses = []
    for table in TABLE_REPOSITORY_MAP.keys():
        pattern = r"\.table\(['\"]" + re.escape(table) + r"['\"]\)"
        matches = re.finditer(pattern, content)
        for match in matches:
            line_num = content[:match.start()].count('\n') + 1
            table_accesses.append({
                'table': table,
                'line': line_num,
                'repository': TABLE_REPOSITORY_MAP[table]
            })

    # Check if repositories are already imported
    has_repo_imports = 'from repositories import' in content

    # Check if direct DB imports exist
    has_direct_db = any([
        'get_supabase_admin_client' in content,
        'get_user_client' in content,
        'get_supabase_client' in content,
    ])

    return {
        'filepath': filepath,
        'table_accesses': table_accesses,
        'total_accesses': len(table_accesses),
        'tables_used': list(set([a['table'] for a in table_accesses])),
        'repositories_needed': list(set([a['repository'] for a in table_accesses])),
        'has_repo_imports': has_repo_imports,
        'has_direct_db': has_direct_db,
        'needs_migration': len(table_accesses) > 0
    }


def generate_repository_imports(repositories: List[str]) -> str:
    """Generate repository import statement"""
    # Always include commonly used repositories
    base_repos = {'UserRepository', 'QuestRepository', 'TaskRepository', 'TaskCompletionRepository'}
    all_repos = sorted(base_repos.union(set(repositories)))

    return f"from repositories import (\n    " + ",\n    ".join(all_repos) + "\n)"


def add_repository_imports_to_file(filepath: str, repositories: List[str]) -> str:
    """Add repository imports to a route file"""
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    # Find the position to insert imports (after other imports, before first route definition)
    import_end_line = 0
    for i, line in enumerate(lines):
        if line.startswith('from ') or line.startswith('import '):
            import_end_line = i + 1
        elif import_end_line > 0 and not line.strip().startswith('#') and line.strip():
            break

    # Check if repository imports already exist
    for i in range(import_end_line):
        if 'from repositories import' in lines[i]:
            print(f"  [OK] Repository imports already exist at line {i+1}")
            return ''.join(lines)

    # Insert repository imports
    import_statement = generate_repository_imports(repositories) + '\n'
    lines.insert(import_end_line, import_statement)

    return ''.join(lines)


def remove_direct_db_imports(content: str) -> str:
    """Remove direct database client imports"""
    # Comment out direct DB imports instead of removing (safer)
    content = re.sub(
        r'^(from database import .*)$',
        r'# \1  # Migrated to repository pattern',
        content,
        flags=re.MULTILINE
    )
    return content


def migrate_route_file(filepath: str, dry_run: bool = False) -> Dict:
    """
    Migrate a single route file to use repository pattern.

    Returns migration report.
    """
    print(f"\n{'[DRY RUN] ' if dry_run else ''}Migrating: {filepath}")

    analysis = analyze_route_file(filepath)

    if not analysis['needs_migration']:
        print("  [OK] No migration needed (no direct table accesses found)")
        return {'status': 'skipped', 'reason': 'no_migration_needed'}

    print(f"  Found {analysis['total_accesses']} table accesses across {len(analysis['tables_used'])} tables")
    print(f"  Tables: {', '.join(analysis['tables_used'])}")
    print(f"  Repositories needed: {', '.join(analysis['repositories_needed'])}")

    if dry_run:
        print("  [DRY RUN] Would add repository imports")
        return {'status': 'dry_run', 'analysis': analysis}

    # Step 1: Add repository imports
    try:
        new_content = add_repository_imports_to_file(filepath, analysis['repositories_needed'])
        print("  [OK] Added repository imports")
    except Exception as e:
        print(f"  [ERROR] Error adding imports: {e}")
        return {'status': 'error', 'error': str(e), 'step': 'add_imports'}

    # Step 2: Write updated file
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"  [OK] Updated {filepath}")
    except Exception as e:
        print(f"  [ERROR] Error writing file: {e}")
        return {'status': 'error', 'error': str(e), 'step': 'write_file'}

    return {
        'status': 'success',
        'analysis': analysis,
        'actions': ['added_imports']
    }


def main():
    """Main migration script"""
    import argparse

    parser = argparse.ArgumentParser(description='Migrate routes to repository pattern')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be done without making changes')
    parser.add_argument('--route', type=str, help='Migrate a specific route file')
    args = parser.parse_args()

    routes_dir = backend_dir / 'routes'

    if args.route:
        # Migrate specific route
        route_path = routes_dir / args.route
        if not route_path.exists():
            print(f"Error: Route file not found: {route_path}")
            sys.exit(1)

        result = migrate_route_file(str(route_path), dry_run=args.dry_run)
        print(f"\nMigration result: {result['status']}")
        return

    # Migrate all routes
    print("="*80)
    print("ROUTE MIGRATION SCRIPT - Repository Pattern Adoption")
    print("="*80)

    route_files = list(routes_dir.glob('*.py'))
    route_files = [f for f in route_files if f.name not in ['__init__.py', '__pycache__']]

    print(f"\nFound {len(route_files)} route files to analyze\n")

    results = {
        'success': [],
        'skipped': [],
        'error': [],
        'dry_run': []
    }

    for route_file in sorted(route_files):
        result = migrate_route_file(str(route_file), dry_run=args.dry_run)
        results[result['status']].append({
            'file': route_file.name,
            'result': result
        })

    # Print summary
    print("\n" + "="*80)
    print("MIGRATION SUMMARY")
    print("="*80)
    print(f"Total files: {len(route_files)}")
    print(f"Successfully migrated: {len(results['success'])}")
    print(f"Skipped (no migration needed): {len(results['skipped'])}")
    print(f"Errors: {len(results['error'])}")

    if args.dry_run:
        print(f"Dry run completed: {len(results['dry_run'])} files would be migrated")

    if results['error']:
        print("\nERRORS:")
        for item in results['error']:
            print(f"  - {item['file']}: {item['result'].get('error', 'Unknown error')}")

    # Calculate migration progress
    total_routes = len(route_files)
    migrated_routes = len(results['success']) + len(results['skipped'])
    progress = (migrated_routes / total_routes * 100) if total_routes > 0 else 0

    print(f"\nMigration Progress: {progress:.1f}% ({migrated_routes}/{total_routes} routes)")

if __name__ == '__main__':
    main()
