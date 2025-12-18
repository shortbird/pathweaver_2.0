"""Fix print(file=sys.stderr) statements"""

import re
from pathlib import Path

def fix_stderr_prints(file_path: str) -> int:
    """Replace print(file=sys.stderr) with logger calls"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content
    replacements = 0

    # Pattern: print(f"...", file=sys.stderr, flush=True)
    pattern = r'print\(f"([^"]+)", file=sys\.stderr, flush=True\)'
    matches = re.findall(pattern, content)
    for match in matches:
        old = f'print(f"{match}", file=sys.stderr, flush=True)'
        # Determine log level based on content
        if 'DEBUG' in match or 'Found' in match:
            new = f'logger.debug(f"{match}")'
        elif 'Error' in match or 'Error' in match:
            new = f'logger.error(f"{match}")'
        else:
            new = f'logger.info(f"{match}")'
        content = content.replace(old, new)
        replacements += 1

    # Pattern: print("...", file=sys.stderr, flush=True)
    pattern = r'print\("([^"]+)", file=sys\.stderr, flush=True\)'
    matches = re.findall(pattern, content)
    for match in matches:
        old = f'print("{match}", file=sys.stderr, flush=True)'
        if 'DEBUG' in match or 'Found' in match:
            new = f'logger.debug("{match}")'
        elif 'Error' in match:
            new = f'logger.error("{match}")'
        else:
            new = f'logger.info("{match}")'
        content = content.replace(old, new)
        replacements += 1

    if content != original_content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"[FIXED] {file_path}: {replacements} replacements")
        return replacements

    return 0

def main():
    backend_dir = Path(__file__).parent.parent
    analytics_file = backend_dir / 'routes' / 'admin' / 'analytics.py'

    total = fix_stderr_prints(str(analytics_file))
    print(f"\n[DONE] Fixed {total} sys.stderr print statements")

if __name__ == '__main__':
    main()
