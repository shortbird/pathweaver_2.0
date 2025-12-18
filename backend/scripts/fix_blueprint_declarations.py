"""
Fix Blueprint declarations that were corrupted by the print replacement script
"""

import re
from pathlib import Path

def fix_blueprint_in_file(file_path: str) -> bool:
    """Fix Blueprint declarations in a single file"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content

    # Fix pattern: Bluelogger.info( -> Blueprint(
    content = re.sub(r'Bluelogger\.info\(', 'Blueprint(', content)

    if content != original_content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"[FIXED] {file_path}")
        return True

    return False

def main():
    """Process all Python files in backend/routes"""
    backend_dir = Path(__file__).parent.parent
    routes_dir = backend_dir / 'routes'

    total_fixed = 0

    for py_file in routes_dir.rglob('*.py'):
        if '__pycache__' in str(py_file):
            continue
        if fix_blueprint_in_file(str(py_file)):
            total_fixed += 1

    print(f"\n{'='*60}")
    print(f"[DONE] Fixed {total_fixed} files")
    print(f"{'='*60}")

if __name__ == '__main__':
    main()
