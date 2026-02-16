"""
Codebase Index Service
======================

Scans the project directory and extracts structured metadata from
backend routes, services, frontend pages, and components.

Builds a searchable in-memory index used by DocsAIService to provide
codebase context for AI article generation.

Usage:
    from services.codebase_index_service import CodebaseIndexService

    indexer = CodebaseIndexService()
    indexer.build_index()
    results = indexer.search("quest enrollment", top_n=15)
"""

import os
import re
import ast
from typing import Dict, List, Optional
from utils.logger import get_logger

logger = get_logger(__name__)

# Project root (two levels up from services/)
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

# Directories to exclude
EXCLUDE_DIRS = {'__pycache__', 'node_modules', '.git', 'dist', 'build', 'venv', '.venv'}

# Files to exclude
EXCLUDE_FILES = {'__init__.py', 'base_service.py', 'base_ai_service.py'}


class CodebaseIndexService:
    """
    Scans the project codebase and builds a searchable index
    of endpoints, services, pages, and components.
    """

    def __init__(self):
        self.index: List[Dict] = []
        self._built = False

    @property
    def is_built(self) -> bool:
        return self._built

    @property
    def entry_count(self) -> int:
        return len(self.index)

    def build_index(self) -> int:
        """
        Scan the project and rebuild the entire index.

        Returns:
            Number of entries indexed.
        """
        self.index = []

        # Scan backend routes
        routes_dir = os.path.join(PROJECT_ROOT, 'backend', 'routes')
        self._scan_routes(routes_dir)

        # Scan backend services
        services_dir = os.path.join(PROJECT_ROOT, 'backend', 'services')
        self._scan_services(services_dir)

        # Scan frontend pages
        pages_dir = os.path.join(PROJECT_ROOT, 'frontend', 'src', 'pages')
        self._scan_frontend_files(pages_dir, 'page')

        # Scan frontend components
        components_dir = os.path.join(PROJECT_ROOT, 'frontend', 'src', 'components')
        self._scan_frontend_files(components_dir, 'component')

        self._built = True
        logger.info(f"Codebase index built: {len(self.index)} entries")
        return len(self.index)

    def search(self, query: str, top_n: int = 15) -> List[Dict]:
        """
        Search the index using keyword scoring.

        Scoring weights:
        - tags match: 3x
        - name match: 2x
        - description match: 1.5x
        - snippet match: 1x

        Args:
            query: Search query string
            top_n: Maximum results to return

        Returns:
            List of matching index entries sorted by relevance score.
        """
        if not self.index:
            return []

        keywords = self._tokenize(query)
        if not keywords:
            return []

        scored = []
        for entry in self.index:
            score = self._score_entry(entry, keywords)
            if score > 0:
                scored.append({**entry, '_score': score})

        scored.sort(key=lambda x: x['_score'], reverse=True)
        return scored[:top_n]

    def get_file_content(self, file_path: str, max_chars: int = 2000) -> Optional[str]:
        """
        Read a source file and return its content, capped at max_chars.

        Args:
            file_path: Relative path from project root
            max_chars: Maximum characters to return

        Returns:
            File content string or None if not readable.
        """
        full_path = os.path.join(PROJECT_ROOT, file_path)
        try:
            with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read(max_chars)
            return content
        except Exception:
            return None

    def get_summary(self, max_entries: int = 100) -> str:
        """
        Get a compressed summary of indexed features for AI prompts.

        Returns:
            A text summary of all indexed features.
        """
        lines = []
        by_type = {}
        for entry in self.index:
            t = entry.get('type', 'unknown')
            by_type.setdefault(t, []).append(entry)

        for entry_type, entries in by_type.items():
            lines.append(f"\n## {entry_type.upper()} ({len(entries)} items)")
            for entry in entries[:max_entries]:
                name = entry.get('display_name') or entry.get('name', '')
                desc = entry.get('description', '')
                if desc:
                    lines.append(f"- {name}: {desc}")
                else:
                    lines.append(f"- {name}")

        return '\n'.join(lines)

    # ------------------------------------------------------------------
    # Private: scanning methods
    # ------------------------------------------------------------------

    def _scan_routes(self, routes_dir: str):
        """Scan backend route files for endpoint definitions."""
        if not os.path.isdir(routes_dir):
            return

        for root, dirs, files in os.walk(routes_dir):
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
            for fname in files:
                if not fname.endswith('.py') or fname in EXCLUDE_FILES:
                    continue

                fpath = os.path.join(root, fname)
                rel_path = os.path.relpath(fpath, PROJECT_ROOT).replace('\\', '/')
                self._parse_route_file(fpath, rel_path)

    def _parse_route_file(self, fpath: str, rel_path: str):
        """Parse a Python route file and extract endpoint entries."""
        try:
            with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
        except Exception:
            return

        # Find blueprint url_prefix
        bp_prefix = ''
        bp_match = re.search(
            r"Blueprint\([^)]*url_prefix=['\"]([^'\"]+)['\"]",
            content
        )
        if bp_match:
            bp_prefix = bp_match.group(1)

        # Find route decorators and their functions
        # Pattern: @bp.route('/path', methods=['GET']) followed by def func_name(...)
        route_pattern = re.compile(
            r"@\w+\.route\(\s*['\"]([^'\"]+)['\"]"
            r"(?:,\s*methods\s*=\s*\[([^\]]*)\])?\s*\)"
            r".*?def\s+(\w+)\s*\(([^)]*)\)",
            re.DOTALL
        )

        # Find auth decorators near routes
        auth_pattern = re.compile(
            r"@(require_superadmin|require_admin|require_auth|require_role|require_advisor|require_org_admin)"
        )

        for match in route_pattern.finditer(content):
            route_path = match.group(1)
            methods_str = match.group(2) or "'GET'"
            func_name = match.group(3)

            # Clean up methods
            methods = re.findall(r"'(\w+)'", methods_str)
            if not methods:
                methods = ['GET']

            full_path = bp_prefix + route_path if bp_prefix else route_path

            # Get the function body for docstring and snippet
            func_start = match.start()
            func_body = self._extract_function_body(content, match.end())
            docstring = self._extract_docstring(func_body)

            # Check for auth decorators before this route
            preceding = content[max(0, func_start - 300):func_start]
            roles = []
            for auth_match in auth_pattern.finditer(preceding):
                decorator = auth_match.group(1)
                if decorator == 'require_superadmin':
                    roles.append('superadmin')
                elif decorator == 'require_auth':
                    roles.append('authenticated')
                elif decorator == 'require_advisor':
                    roles.extend(['advisor', 'superadmin'])
                elif decorator == 'require_org_admin':
                    roles.extend(['org_admin', 'superadmin'])

            # Generate tags from path and function name
            tags = self._generate_tags(full_path, func_name, docstring)

            for method in methods:
                display_name = f"{method} {full_path}"
                self.index.append({
                    'type': 'endpoint',
                    'file_path': rel_path,
                    'name': func_name,
                    'display_name': display_name,
                    'description': docstring or '',
                    'tags': tags,
                    'roles': list(set(roles)),
                    'snippet': (func_body or '')[:500]
                })

    def _scan_services(self, services_dir: str):
        """Scan backend service files for class methods."""
        if not os.path.isdir(services_dir):
            return

        for fname in os.listdir(services_dir):
            if not fname.endswith('.py') or fname in EXCLUDE_FILES:
                continue

            fpath = os.path.join(services_dir, fname)
            rel_path = os.path.relpath(fpath, PROJECT_ROOT).replace('\\', '/')
            self._parse_service_file(fpath, rel_path)

    def _parse_service_file(self, fpath: str, rel_path: str):
        """Parse a Python service file and extract class + method entries."""
        try:
            with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
        except Exception:
            return

        # Find class definitions
        class_pattern = re.compile(
            r'class\s+(\w+)\s*(?:\([^)]*\))?\s*:',
        )

        # Find public methods (not starting with _)
        method_pattern = re.compile(
            r'def\s+([a-z]\w*)\s*\(self[^)]*\)',
        )

        classes = list(class_pattern.finditer(content))
        if not classes:
            return

        for cls_match in classes:
            class_name = cls_match.group(1)
            cls_start = cls_match.start()

            # Find the next class or end of file
            next_cls = None
            for other in classes:
                if other.start() > cls_start:
                    next_cls = other.start()
                    break
            cls_body = content[cls_start:next_cls] if next_cls else content[cls_start:]

            # Extract class docstring
            cls_docstring = self._extract_docstring(cls_body[len(cls_match.group(0)):])

            for method_match in method_pattern.finditer(cls_body):
                method_name = method_match.group(1)
                method_body = self._extract_function_body(cls_body, method_match.end())
                method_doc = self._extract_docstring(method_body)
                tags = self._generate_tags(class_name, method_name, method_doc)

                self.index.append({
                    'type': 'service_method',
                    'file_path': rel_path,
                    'name': f'{class_name}.{method_name}',
                    'display_name': f'{class_name}.{method_name}()',
                    'description': method_doc or cls_docstring or '',
                    'tags': tags,
                    'roles': [],
                    'snippet': (method_body or '')[:500]
                })

    def _scan_frontend_files(self, directory: str, entry_type: str):
        """Scan frontend JSX files for component definitions."""
        if not os.path.isdir(directory):
            return

        for root, dirs, files in os.walk(directory):
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
            for fname in files:
                if not fname.endswith('.jsx') and not fname.endswith('.tsx'):
                    continue

                fpath = os.path.join(root, fname)
                rel_path = os.path.relpath(fpath, PROJECT_ROOT).replace('\\', '/')
                self._parse_frontend_file(fpath, rel_path, entry_type)

    def _parse_frontend_file(self, fpath: str, rel_path: str, entry_type: str):
        """Parse a JSX/TSX file and extract component info."""
        try:
            with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
        except Exception:
            return

        # Extract component name from: const ComponentName = or export default function ComponentName
        comp_pattern = re.compile(
            r'(?:export\s+default\s+function|const)\s+([A-Z]\w+)'
        )
        comp_match = comp_pattern.search(content)
        if not comp_match:
            # Try: export default ComponentName at the end
            default_export = re.search(r'export\s+default\s+(?:memo\()?(\w+)', content)
            comp_name = default_export.group(1) if default_export else os.path.splitext(os.path.basename(fpath))[0]
        else:
            comp_name = comp_match.group(1)

        # Extract props
        props = []
        props_match = re.search(r'(?:const\s+\w+\s*=\s*\(\s*\{([^}]*)\}|function\s+\w+\s*\(\s*\{([^}]*)\})', content)
        if props_match:
            props_str = props_match.group(1) or props_match.group(2) or ''
            props = [p.strip().split('=')[0].strip() for p in props_str.split(',') if p.strip()]
            props = [p for p in props if p and not p.startswith('...')]

        # Generate tags from file path and component name
        tags = self._generate_tags(rel_path, comp_name, '')
        if props:
            tags.extend([p.lower() for p in props[:5]])

        # First 500 chars as snippet
        snippet = content[:500]

        self.index.append({
            'type': entry_type,
            'file_path': rel_path,
            'name': comp_name,
            'display_name': comp_name,
            'description': f'{entry_type.title()}: {comp_name}' + (f' (props: {", ".join(props[:5])})' if props else ''),
            'tags': list(set(tags)),
            'roles': [],
            'snippet': snippet
        })

    # ------------------------------------------------------------------
    # Private: utility methods
    # ------------------------------------------------------------------

    def _extract_function_body(self, content: str, start: int) -> str:
        """Extract the body of a function starting from after the def line."""
        # Find the colon after the function signature
        colon_pos = content.find(':', start)
        if colon_pos == -1:
            return ''

        body_start = colon_pos + 1
        # Find the end: next def or class at the same or lower indentation
        lines = content[body_start:body_start + 2000].split('\n')
        body_lines = []
        for i, line in enumerate(lines):
            if i > 0 and line.strip() and not line.startswith((' ', '\t')):
                break
            body_lines.append(line)

        return '\n'.join(body_lines)

    def _extract_docstring(self, body: str) -> str:
        """Extract the docstring from a function or class body."""
        if not body:
            return ''

        body = body.strip()
        # Match triple-quoted strings
        match = re.match(r'\s*"""(.*?)"""|\'\'\'(.*?)\'\'\'', body, re.DOTALL)
        if match:
            doc = (match.group(1) or match.group(2) or '').strip()
            # Take just the first line/sentence
            first_line = doc.split('\n')[0].strip()
            return first_line

        return ''

    def _tokenize(self, text: str) -> List[str]:
        """Tokenize a string into lowercase keywords."""
        # Split on non-alphanumeric, filter short words
        words = re.findall(r'[a-z0-9]+', text.lower())
        return [w for w in words if len(w) >= 2]

    def _generate_tags(self, *sources: str) -> List[str]:
        """Generate search tags from multiple text sources."""
        tags = set()
        for source in sources:
            if not source:
                continue
            # Split camelCase and snake_case
            words = re.findall(r'[a-z]+', re.sub(r'([A-Z])', r' \1', str(source)).lower())
            for word in words:
                if len(word) >= 2 and word not in ('the', 'and', 'for', 'with', 'this', 'def', 'api'):
                    tags.add(word)
            # Also split on path separators
            parts = re.split(r'[/\\._-]', str(source))
            for part in parts:
                if len(part) >= 2:
                    tags.add(part.lower())

        return list(tags)

    def _score_entry(self, entry: Dict, keywords: List[str]) -> float:
        """Score an index entry against search keywords."""
        score = 0.0
        tags_lower = [t.lower() for t in entry.get('tags', [])]
        name_lower = entry.get('name', '').lower()
        desc_lower = entry.get('description', '').lower()
        snippet_lower = entry.get('snippet', '').lower()

        for kw in keywords:
            # Tags match = 3x
            if any(kw in tag for tag in tags_lower):
                score += 3.0
            # Exact tag match bonus
            if kw in tags_lower:
                score += 2.0
            # Name match = 2x
            if kw in name_lower:
                score += 2.0
            # Description match = 1.5x
            if kw in desc_lower:
                score += 1.5
            # Snippet match = 1x
            if kw in snippet_lower:
                score += 1.0

        return score
