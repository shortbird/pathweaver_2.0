"""
Script to replace print() statements with appropriate logger calls.
Per P1-QUAL-2 from COMPREHENSIVE_CODEBASE_REVIEW.md

Replacements:
- print() with DEBUG prefix -> logger.debug()
- print() with ERROR/CRITICAL -> logger.error()
- print() with WARNING -> logger.warning()
- print() with regular info -> logger.info()
- traceback.print_exc() -> Remove (already logged)
"""

import re
import os
from pathlib import Path

def replace_print_in_file(file_path: str, dry_run: bool = True) -> int:
    """
    Replace print() statements with logger calls in a single file.

    Returns:
        Number of replacements made
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content
    replacements = 0

    # Pattern 1: print(f"[DEBUG]...") -> logger.debug()
    pattern = r'print\(f"\[DEBUG\]([^"]+)"\)'
    matches = re.findall(pattern, content)
    for match in matches:
        old = f'print(f"[DEBUG]{match}")'
        new = f'logger.debug(f"{match}")'
        content = content.replace(old, new)
        replacements += 1

    # Pattern 2: print("[DEBUG]...") -> logger.debug()
    pattern = r'print\("\[DEBUG\]([^"]+)"\)'
    matches = re.findall(pattern, content)
    for match in matches:
        old = f'print("[DEBUG]{match}")'
        new = f'logger.debug("{match}")'
        content = content.replace(old, new)
        replacements += 1

    # Pattern 3: print(f"ERROR...") or print(f"CRITICAL...") -> logger.error()
    pattern = r'print\(f"(ERROR|CRITICAL|Error|Failed)([^"]+)"\)'
    matches = re.findall(pattern, content)
    for match in matches:
        old = f'print(f"{match[0]}{match[1]}")'
        new = f'logger.error(f"{match[0]}{match[1]}")'
        content = content.replace(old, new)
        replacements += 1

    # Pattern 4: print("ERROR...") or print("CRITICAL...") -> logger.error()
    pattern = r'print\("(ERROR|CRITICAL|Error|Failed)([^"]+)"\)'
    matches = re.findall(pattern, content)
    for match in matches:
        old = f'print("{match[0]}{match[1]}")'
        new = f'logger.error("{match[0]}{match[1]}")'
        content = content.replace(old, new)
        replacements += 1

    # Pattern 5: print(f"WARNING...") -> logger.warning()
    pattern = r'print\(f"(WARNING|Warning)([^"]+)"\)'
    matches = re.findall(pattern, content)
    for match in matches:
        old = f'print(f"{match[0]}{match[1]}")'
        new = f'logger.warning(f"{match[0]}{match[1]}")'
        content = content.replace(old, new)
        replacements += 1

    # Pattern 6: print("WARNING...") -> logger.warning()
    pattern = r'print\("(WARNING|Warning)([^"]+)"\)'
    matches = re.findall(pattern, content)
    for match in matches:
        old = f'print("{match[0]}{match[1]}")'
        new = f'logger.warning("{match[0]}{match[1]}")'
        content = content.replace(old, new)
        replacements += 1

    # Pattern 7: Remove traceback.print_exc() (already logged with traceback.format_exc())
    pattern = r'\s*traceback\.print_exc\(\)\s*\n'
    old_count = len(re.findall(pattern, content))
    content = re.sub(pattern, '\n', content)
    replacements += old_count

    # Pattern 8: General print(f"...") -> logger.info()
    # Only replace if not already caught by patterns above
    pattern = r'print\(f"([^"]+)"\)'
    matches = re.findall(pattern, content)
    for match in matches:
        # Skip if it looks like debug/error/warning (already handled)
        if any(keyword in match for keyword in ['[DEBUG]', 'DEBUG', 'ERROR', 'CRITICAL', 'WARNING', 'Error', 'Failed', 'Warning']):
            continue
        old = f'print(f"{match}")'
        new = f'logger.info(f"{match}")'
        if old in content:
            content = content.replace(old, new, 1)
            replacements += 1

    # Pattern 9: General print("...") -> logger.info()
    pattern = r'print\("([^"]+)"\)'
    matches = re.findall(pattern, content)
    for match in matches:
        # Skip if it looks like debug/error/warning (already handled)
        if any(keyword in match for keyword in ['[DEBUG]', 'DEBUG', 'ERROR', 'CRITICAL', 'WARNING', 'Error', 'Failed', 'Warning']):
            continue
        old = f'print("{match}")'
        new = f'logger.info("{match}")'
        if old in content:
            content = content.replace(old, new, 1)
            replacements += 1

    # Pattern 10: print with variable or expression
    pattern = r'print\(([^)]+)\)'
    matches = re.findall(pattern, content)
    for match in matches:
        # Skip if it's a string we already handled
        if match.startswith('f"') or match.startswith('"'):
            continue
        # Skip if it's file=sys.stderr
        if 'file=' in match:
            continue
        old = f'print({match})'
        new = f'logger.info({match})'
        if old in content:
            content = content.replace(old, new, 1)
            replacements += 1

    if replacements > 0 and content != original_content:
        if not dry_run:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"[OK] {file_path}: {replacements} replacements")
        else:
            print(f"[DRY RUN] {file_path}: {replacements} replacements")

    return replacements

def main():
    """Process all Python files in backend/routes and backend/services"""
    backend_dir = Path(__file__).parent.parent

    routes_dir = backend_dir / 'routes'
    services_dir = backend_dir / 'services'

    total_replacements = 0
    files_modified = 0

    # Process routes
    for py_file in routes_dir.rglob('*.py'):
        if '__pycache__' in str(py_file):
            continue
        replacements = replace_print_in_file(str(py_file), dry_run=False)
        if replacements > 0:
            total_replacements += replacements
            files_modified += 1

    # Process services
    for py_file in services_dir.rglob('*.py'):
        if '__pycache__' in str(py_file):
            continue
        replacements = replace_print_in_file(str(py_file), dry_run=False)
        if replacements > 0:
            total_replacements += replacements
            files_modified += 1

    print(f"\n{'='*60}")
    print(f"[DONE] Completed: {total_replacements} print() statements replaced in {files_modified} files")
    print(f"{'='*60}")

if __name__ == '__main__':
    main()
