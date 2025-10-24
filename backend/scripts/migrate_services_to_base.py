"""
Script to migrate all service files to inherit from BaseService.
Part of Phase 3 Architecture Consolidation.
"""

import os
import re
from pathlib import Path

# Services directory
SERVICES_DIR = Path(__file__).parent.parent / "services"

# Files to skip
SKIP_FILES = ['base_service.py', 'xp_service.py', '__init__.py']


def migrate_service_file(filepath):
    """Migrate a single service file to inherit from BaseService."""

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Skip if already uses BaseService
    if 'from services.base_service import BaseService' in content or 'BaseService)' in content:
        print(f"[OK] {filepath.name} already migrated")
        return False

    original_content = content
    modified = False

    # Step 1: Add BaseService import if not present
    if 'from database import get_supabase_admin_client' in content:
        content = content.replace(
            'from database import get_supabase_admin_client',
            'from services.base_service import BaseService\nfrom database import get_supabase_admin_client'
        )
        modified = True
    elif 'from database import' in content:
        # Add import before other database imports
        content = re.sub(
            r'(from database import[^\n]+)',
            r'from services.base_service import BaseService\n\1',
            content,
            count=1
        )
        modified = True
    else:
        # Add import after typing imports or at beginning
        if 'from typing import' in content:
            content = re.sub(
                r'(from typing import[^\n]+\n)',
                r'\1from services.base_service import BaseService\n',
                content,
                count=1
            )
        else:
            # Add after docstring
            content = re.sub(
                r'("""\n)',
                r'\1\nfrom services.base_service import BaseService',
                content,
                count=1
            )
        modified = True

    # Step 2: Find class definitions and make them inherit from BaseService
    # Pattern: class ClassName: or class ClassName(object):
    class_pattern = r'class\s+(\w+Service)(\s*:|\s*\(object\):)'

    def replace_class(match):
        class_name = match.group(1)
        return f'class {class_name}(BaseService):'

    new_content = re.sub(class_pattern, replace_class, content)
    if new_content != content:
        content = new_content
        modified = True

    # Step 3: Update __init__ methods to call super().__init__()
    # Pattern: def __init__(self...):
    init_pattern = r'def __init__\(self([^)]*)\):\s*\n(\s+)"""?([^"]*"""?)?\s*\n(\s+)(self\.supabase\s*=\s*get_supabase_admin_client\(\))?'

    def replace_init(match):
        params = match.group(1)
        indent = match.group(2)
        docstring = match.group(3) or ''
        next_indent = match.group(4)

        # Add user_id parameter if not present
        if 'user_id' not in params:
            if params.strip():
                params = params.rstrip() + ', user_id: Optional[str] = None'
            else:
                params = ', user_id: Optional[str] = None'

        result = f'def __init__(self{params}):\n'
        if docstring:
            result += f'{indent}"""{docstring}\n'
        result += f'{indent}super().__init__(user_id)\n'

        return result

    new_content = re.sub(init_pattern, replace_init, content)
    if new_content != content:
        content = new_content
        modified = True

    # Step 4: Remove direct get_supabase_admin_client() calls in __init__
    content = re.sub(
        r'\s+self\.supabase\s*=\s*get_supabase_admin_client\(\)\s*\n',
        '',
        content
    )

    # Step 5: Add Optional import if using Optional[str] and not present
    if 'Optional[str]' in content and 'from typing import' in content:
        if 'Optional' not in content.split('from typing import')[1].split('\n')[0]:
            content = re.sub(
                r'from typing import ([^\n]+)',
                lambda m: f"from typing import {m.group(1)}, Optional" if 'Optional' not in m.group(1) else m.group(0),
                content,
                count=1
            )

    # Only write if modifications were made
    if modified and content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"[MIGRATED] {filepath.name}")
        return True

    return False


def main():
    """Main migration function."""
    print("=" * 60)
    print("Service Migration to BaseService - Phase 3.1")
    print("=" * 60)

    # Get all Python files in services directory
    service_files = list(SERVICES_DIR.glob("*.py"))
    service_files = [f for f in service_files if f.name not in SKIP_FILES]

    print(f"\nFound {len(service_files)} service files to process")
    print("-" * 60)

    migrated_count = 0
    skipped_count = 0

    for filepath in sorted(service_files):
        try:
            if migrate_service_file(filepath):
                migrated_count += 1
            else:
                skipped_count += 1
        except Exception as e:
            print(f"[ERROR] Error migrating {filepath.name}: {e}")

    print("-" * 60)
    print(f"\nResults:")
    print(f"  Migrated: {migrated_count}")
    print(f"  Skipped:  {skipped_count}")
    print(f"  Total:    {len(service_files)}")
    print("\n" + "=" * 60)


if __name__ == "__main__":
    main()
