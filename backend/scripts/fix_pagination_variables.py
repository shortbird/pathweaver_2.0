"""
Fix pagination variable references after migration.

This script finds files where get_pagination_params() is used but
the code still references 'limit' and 'offset' variables.
"""

import re
from pathlib import Path


def fix_file(file_path: Path) -> bool:
    """Fix a single file's pagination variable references."""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content

    # Pattern: file has get_pagination_params but still uses limit/offset variables
    if 'get_pagination_params' in content:
        # Look for usage of 'limit' or 'offset' without being defined
        lines = content.split('\n')
        new_lines = []
        added_conversion = False

        for i, line in enumerate(lines):
            # If this line has get_pagination_params and we haven't added conversion yet
            if 'get_pagination_params' in line and not added_conversion:
                new_lines.append(line)
                # Add blank line and conversion
                new_lines.append('')
                new_lines.append(' ' * 8 + '# Convert page/per_page to limit/offset for backward compatibility')
                new_lines.append(' ' * 8 + 'limit = per_page')
                new_lines.append(' ' * 8 + 'offset = (page - 1) * per_page')
                added_conversion = True
            # Replace response limit/offset with page/per_page
            elif re.search(r"['\"]limit['\"]\s*:\s*limit", line):
                new_lines.append(line.replace("'limit': limit", "'per_page': per_page"))
            elif re.search(r"['\"]offset['\"]\s*:\s*offset", line):
                new_lines.append(line.replace("'offset': offset", "'page': page"))
            else:
                new_lines.append(line)

        content = '\n'.join(new_lines)

    # Only write if changed
    if content != original_content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Fixed: {file_path}")
        return True

    return False


def main():
    """Main entry point."""
    routes_dir = Path('backend/routes').resolve()
    files_fixed = 0

    for file_path in routes_dir.rglob('*.py'):
        if fix_file(file_path):
            files_fixed += 1

    print(f"\nFixed {files_fixed} files")


if __name__ == '__main__':
    main()
