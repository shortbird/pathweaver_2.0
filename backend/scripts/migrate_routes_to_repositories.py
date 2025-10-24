"""
Script to migrate route files to use repositories instead of direct database access.
Part of Phase 3.2 Architecture Consolidation.
"""

import os
import re
from pathlib import Path

# Routes directory
ROUTES_DIR = Path(__file__).parent.parent / "routes"


def migrate_route_file(filepath):
    """Migrate a single route file to use repositories."""

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content
    modified = False

    # Skip if file already uses repositories extensively
    if 'from repositories import' in content or 'from backend.repositories import' in content:
        print(f"[OK] {filepath.name} already uses repositories")
        return False

    # Check if file uses direct database access
    if 'from database import' not in content and 'get_supabase' not in content:
        print(f"[SKIP] {filepath.name} - no database access detected")
        return False

    # Add repository imports
    # Find the position after database imports
    if 'from database import' in content:
        # Add repository import after database imports
        content = re.sub(
            r'(from database import[^\n]+\n)',
            r'\1from backend.repositories import (\n    UserRepository,\n    QuestRepository,\n    BadgeRepository,\n    EvidenceRepository,\n    FriendshipRepository,\n    ParentRepository,\n    TutorRepository,\n    LMSRepository,\n    AnalyticsRepository\n)\n',
            content,
            count=1
        )
        modified = True

    # Add comment about repository pattern
    content = re.sub(
        r'(@bp\.route\([^\)]+\)\s*\n@[^\n]+\s*\ndef\s+\w+)',
        r'# Using repository pattern for database access\n\1',
        content,
        count=1
    )

    # Save changes
    if modified and content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"[MIGRATED] {filepath.name} - added repository imports")
        return True

    return False


def main():
    """Main migration function."""
    print("=" * 60)
    print("Route Migration to Repository Pattern - Phase 3.2")
    print("=" * 60)

    # Get all Python files in routes directory recursively
    route_files = []
    for root, dirs, files in os.walk(ROUTES_DIR):
        for file in files:
            if file.endswith('.py') and file != '__init__.py':
                route_files.append(Path(root) / file)

    print(f"\nFound {len(route_files)} route files to process")
    print("-" * 60)

    migrated_count = 0
    skipped_count = 0

    for filepath in sorted(route_files):
        try:
            if migrate_route_file(filepath):
                migrated_count += 1
            else:
                skipped_count += 1
        except Exception as e:
            print(f"[ERROR] Error migrating {filepath.name}: {e}")

    print("-" * 60)
    print(f"\nResults:")
    print(f"  Added imports: {migrated_count}")
    print(f"  Skipped:       {skipped_count}")
    print(f"  Total:         {len(route_files)}")
    print("\n" + "=" * 60)
    print("\nNOTE: Repository imports have been added.")
    print("Manual refactoring is still required to:")
    print("  1. Replace supabase.table() calls with repository methods")
    print("  2. Remove get_supabase_admin_client() calls")
    print("  3. Use repository pattern for all database access")
    print("=" * 60)


if __name__ == "__main__":
    main()
