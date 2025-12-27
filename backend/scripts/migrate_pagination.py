"""
Script to automatically migrate endpoints to use standardized pagination helpers.

This script:
1. Scans all route files for manual pagination patterns
2. Replaces limit/offset with page/per_page
3. Adds imports for pagination helpers
4. Updates response formatting to include pagination metadata
5. Creates detailed logs of all changes

Usage:
    python backend/scripts/migrate_pagination.py --dry-run  # Preview changes
    python backend/scripts/migrate_pagination.py            # Apply changes
"""

import os
import re
import sys
from pathlib import Path
from typing import List, Tuple, Dict


class PaginationMigrator:
    """Migrates endpoints to use standardized pagination."""

    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
        self.changes = []
        self.files_modified = 0

    def find_route_files(self, routes_dir: str) -> List[Path]:
        """Find all Python files in routes directory."""
        routes_path = Path(routes_dir)
        return list(routes_path.rglob('*.py'))

    def has_limit_offset_pattern(self, content: str) -> bool:
        """Check if file uses limit/offset pagination."""
        patterns = [
            r"request\.args\.get\(['\"]limit['\"]",
            r"request\.args\.get\(['\"]offset['\"]\)",
        ]
        return any(re.search(pattern, content) for pattern in patterns)

    def has_page_per_page_pattern(self, content: str) -> bool:
        """Check if file uses page/per_page pagination."""
        patterns = [
            r"request\.args\.get\(['\"]page['\"]",
            r"request\.args\.get\(['\"]per_page['\"]\)",
        ]
        return any(re.search(pattern, content) for pattern in patterns)

    def needs_pagination_import(self, content: str) -> bool:
        """Check if file needs pagination import."""
        return 'from utils.pagination import' not in content

    def add_pagination_import(self, content: str) -> str:
        """Add pagination import after other utils imports."""
        # Find existing utils imports
        utils_import_pattern = r'(from utils\..*? import.*?\n)'
        matches = list(re.finditer(utils_import_pattern, content))

        if matches:
            # Add after last utils import
            last_match = matches[-1]
            insert_pos = last_match.end()
            new_import = 'from utils.pagination import get_pagination_params, build_pagination_meta\n'

            # Check if already exists
            if new_import.strip() not in content:
                content = content[:insert_pos] + new_import + content[insert_pos:]
                self.changes.append("Added pagination import")

        return content

    def migrate_limit_offset_to_page_per_page(self, content: str, file_path: str) -> str:
        """
        Convert limit/offset parameters to page/per_page.

        Transforms:
            limit = request.args.get('limit', 50, type=int)
            offset = request.args.get('offset', 0, type=int)

        Into:
            page, per_page = get_pagination_params(default_per_page=50)
        """
        # Pattern 1: limit = request.args.get('limit', DEFAULT, type=int)
        limit_pattern = r"limit\s*=\s*(?:min\()?(?:int\()?request\.args\.get\(['\"]limit['\"]\s*,\s*(\d+)(?:\s*,\s*type=int)?\)(?:\))?(?:,\s*\d+\))?"
        offset_pattern = r"offset\s*=\s*(?:max\()?(?:int\()?request\.args\.get\(['\"]offset['\"]\s*,\s*(\d+)(?:\s*,\s*type=int)?\)(?:\))?"

        limit_matches = list(re.finditer(limit_pattern, content))
        offset_matches = list(re.finditer(offset_pattern, content))

        if limit_matches:
            # Extract default limit value
            limit_match = limit_matches[0]
            default_limit = limit_match.group(1) if limit_match.lastindex >= 1 else '20'

            # Find the lines with limit and offset
            lines = content.split('\n')
            new_lines = []
            skip_next_offset = False

            for i, line in enumerate(lines):
                # If this line has limit pattern
                if re.search(limit_pattern, line):
                    # Check if next line has offset
                    if i + 1 < len(lines) and re.search(offset_pattern, lines[i + 1]):
                        # Replace both lines with single get_pagination_params call
                        indent = len(line) - len(line.lstrip())
                        new_line = ' ' * indent + f'page, per_page = get_pagination_params(default_per_page={default_limit})'
                        new_lines.append(new_line)
                        skip_next_offset = True
                        self.changes.append(f"Replaced limit/offset with page/per_page (default={default_limit})")
                    else:
                        new_lines.append(line)
                elif skip_next_offset and re.search(offset_pattern, line):
                    # Skip the offset line (already handled)
                    skip_next_offset = False
                else:
                    new_lines.append(line)

            content = '\n'.join(new_lines)

        return content

    def update_range_to_use_pagination(self, content: str) -> str:
        """
        Update manual .range() calls to use pagination helper.

        Transforms:
            offset = (page - 1) * per_page
            query = query.range(offset, offset + per_page - 1)

        Into:
            from utils.pagination import paginate
            paginated_query, meta_info = paginate(query, page, per_page)
        """
        # Look for manual offset calculation followed by range
        offset_calc_pattern = r'offset\s*=\s*\(page\s*-\s*1\)\s*\*\s*per_page'

        if re.search(offset_calc_pattern, content):
            # Replace offset calculation and range call
            content = re.sub(
                offset_calc_pattern + r'\s*\n\s*(.+?)\.range\(offset,\s*offset\s*\+\s*per_page\s*-\s*1\)',
                lambda m: f'paginated_query, _meta_info = paginate({m.group(1)}, page, per_page)\n' +
                          ' ' * (len(m.group(0)) - len(m.group(0).lstrip())) + f'{m.group(1)} = paginated_query',
                content
            )
            self.changes.append("Replaced manual range calculation with paginate() helper")

        return content

    def add_pagination_metadata_to_response(self, content: str) -> str:
        """
        Add pagination metadata to responses that don't have it.

        Looks for responses that return data but no pagination info.
        """
        # This is complex and file-specific, so we'll skip automatic modification
        # and just log a warning for manual review
        if re.search(r'\.range\(', content) and 'build_pagination_meta' not in content:
            self.changes.append("WARNING: File uses pagination but may need manual metadata addition")

        return content

    def migrate_file(self, file_path: Path) -> bool:
        """Migrate a single file. Returns True if file was modified."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                original_content = f.read()

            content = original_content
            file_changes = []
            self.changes = []  # Reset for this file

            # Check if file needs migration
            has_limit_offset = self.has_limit_offset_pattern(content)
            has_page_per_page = self.has_page_per_page_pattern(content)

            if not has_limit_offset and not has_page_per_page:
                return False  # No pagination in this file

            # Add import if needed
            if self.needs_pagination_import(content):
                content = self.add_pagination_import(content)

            # Migrate limit/offset to page/per_page
            if has_limit_offset:
                content = self.migrate_limit_offset_to_page_per_page(content, str(file_path))

            # Update range calculations
            content = self.update_range_to_use_pagination(content)

            # Add metadata warnings
            content = self.add_pagination_metadata_to_response(content)

            # Check if content changed
            if content != original_content:
                if not self.dry_run:
                    # Write changes
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(content)

                # Log changes
                rel_path = file_path.relative_to(Path.cwd())
                print(f"\n{'[DRY RUN] ' if self.dry_run else ''}Modified: {rel_path}")
                for change in self.changes:
                    print(f"  - {change}")

                self.files_modified += 1
                return True

            return False

        except Exception as e:
            print(f"Error processing {file_path}: {e}")
            return False

    def migrate_all(self, routes_dir: str) -> Dict[str, int]:
        """Migrate all route files."""
        files = self.find_route_files(routes_dir)
        stats = {
            'total_files': len(files),
            'modified_files': 0,
            'limit_offset_files': 0,
            'page_per_page_files': 0
        }

        print(f"{'[DRY RUN] ' if self.dry_run else ''}Scanning {len(files)} route files...")

        for file_path in files:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()

                has_limit_offset = self.has_limit_offset_pattern(content)
                has_page_per_page = self.has_page_per_page_pattern(content)

                if has_limit_offset:
                    stats['limit_offset_files'] += 1

                if has_page_per_page:
                    stats['page_per_page_files'] += 1

                if self.migrate_file(file_path):
                    stats['modified_files'] += 1

            except Exception as e:
                print(f"Error scanning {file_path}: {e}")

        return stats


def main():
    """Main entry point."""
    dry_run = '--dry-run' in sys.argv

    print("=" * 70)
    print("Pagination Migration Script")
    print("=" * 70)
    print()

    if dry_run:
        print("DRY RUN MODE - No files will be modified")
        print()

    # Get routes directory
    script_dir = Path(__file__).parent
    backend_dir = script_dir.parent
    routes_dir = backend_dir / 'routes'

    if not routes_dir.exists():
        print(f"Error: Routes directory not found at {routes_dir}")
        return 1

    # Run migration
    migrator = PaginationMigrator(dry_run=dry_run)
    stats = migrator.migrate_all(str(routes_dir))

    # Print summary
    print()
    print("=" * 70)
    print("Migration Summary")
    print("=" * 70)
    print(f"Total files scanned: {stats['total_files']}")
    print(f"Files with limit/offset: {stats['limit_offset_files']}")
    print(f"Files with page/per_page: {stats['page_per_page_files']}")
    print(f"Files modified: {stats['modified_files']}")
    print()

    if dry_run:
        print("This was a DRY RUN. Run without --dry-run to apply changes.")
    else:
        print("Migration complete!")
        print()
        print("Next steps:")
        print("1. Review the changes with: git diff")
        print("2. Test endpoints on dev environment")
        print("3. Update any custom response formatting manually")
        print("4. Commit changes when ready")

    return 0


if __name__ == '__main__':
    sys.exit(main())
