"""
Migration script to replace print() statements with structured logging
Automatically migrates all Python files in the backend directory
"""

import re
import sys
from pathlib import Path
from typing import Tuple, List


def migrate_file(file_path: Path) -> Tuple[int, List[str]]:
    """
    Migrate print statements to logging in a file

    Returns:
        (changes_count, warnings_list)
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        return 0, [f"Error reading file: {e}"]

    # Skip if already has logger import
    if 'from utils.logger import get_logger' in content:
        return 0, ["Already migrated (has get_logger import)"]

    original_content = content
    changes = 0
    warnings = []

    # Find where to add logger import (after other imports)
    import_match = re.search(r'((?:^(?:from|import)\s+.+\n)+)', content, re.MULTILINE)

    if import_match:
        # Add logger import after other imports
        logger_import = f"\nfrom utils.logger import get_logger\n\nlogger = get_logger(__name__)\n"
        insert_pos = import_match.end()
        content = content[:insert_pos] + logger_import + content[insert_pos:]
        changes += 1
    else:
        # No imports found - add at top of file (after docstring if exists)
        docstring_match = re.match(r'^(""".*?"""|\'\'\'.*?\'\'\')\n', content, re.DOTALL)
        if docstring_match:
            insert_pos = docstring_match.end()
        else:
            insert_pos = 0
        logger_import = f"from utils.logger import get_logger\n\nlogger = get_logger(__name__)\n\n"
        content = content[:insert_pos] + logger_import + content[insert_pos:]
        changes += 1

    # Replace print statements
    # Pattern 1: print(f"...")
    pattern1 = r'print\(f["\']([^"\']+)["\']\)'
    matches = re.findall(pattern1, content)
    for match in matches:
        # Determine log level based on content
        log_level = 'info'
        if any(word in match.lower() for word in ['error', 'failed', 'exception']):
            log_level = 'error'
        elif any(word in match.lower() for word in ['warning', 'warn']):
            log_level = 'warning'
        elif any(word in match.lower() for word in ['debug', 'processing']):
            log_level = 'debug'

        content = re.sub(pattern1, f'logger.{log_level}(f"{match}")', content, count=1)
        changes += 1

    # Pattern 2: print("...")
    pattern2 = r'print\(["\']([^"\']+)["\']\)'
    matches = re.findall(pattern2, content)
    for match in matches:
        # Determine log level
        log_level = 'info'
        if any(word in match.lower() for word in ['error', 'failed', 'exception']):
            log_level = 'error'
        elif any(word in match.lower() for word in ['warning', 'warn']):
            log_level = 'warning'
        elif any(word in match.lower() for word in ['debug', 'processing']):
            log_level = 'debug'

        content = re.sub(pattern2, f'logger.{log_level}("{match}")', content, count=1)
        changes += 1

    # Pattern 3: print(..., ...) - complex cases
    pattern3 = r'print\(([^)]+)\)'
    complex_matches = re.findall(pattern3, content)
    for match in complex_matches:
        if ',' in match or match.startswith('f'):
            # Complex print statement - flag for manual review
            warnings.append(f"Complex print statement needs manual review: print({match})")

    # Only write if changed
    if content != original_content:
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            return changes, warnings
        except Exception as e:
            return 0, [f"Error writing file: {e}"]

    return 0, warnings


def main():
    backend_dir = Path(__file__).parent.parent
    total_changes = 0
    total_warnings = []
    files_modified = 0

    print(f"Migrating print statements to logging in: {backend_dir}")
    print("=" * 80)

    # Find all Python files
    python_files = []
    for py_file in backend_dir.rglob('*.py'):
        # Skip virtual environment, cache, and migration script itself
        if any(skip in str(py_file) for skip in ['venv', '__pycache__', 'migrate_print_to_logging']):
            continue
        python_files.append(py_file)

    print(f"Found {len(python_files)} Python files to check")
    print("=" * 80)

    for py_file in python_files:
        changes, warnings = migrate_file(py_file)

        if changes > 0:
            files_modified += 1
            total_changes += changes
            print(f"✅ {py_file.relative_to(backend_dir)} ({changes} changes)")

        if warnings:
            total_warnings.extend([f"{py_file.relative_to(backend_dir)}: {w}" for w in warnings])

    print("=" * 80)
    print(f"\n✅ Migration complete!")
    print(f"   Files modified: {files_modified}/{len(python_files)}")
    print(f"   Total changes: {total_changes}")

    if total_warnings:
        print(f"\n⚠️  {len(total_warnings)} warnings (manual review needed):")
        for warning in total_warnings[:20]:  # Show first 20
            print(f"   - {warning}")
        if len(total_warnings) > 20:
            print(f"   ... and {len(total_warnings) - 20} more")


if __name__ == '__main__':
    main()
