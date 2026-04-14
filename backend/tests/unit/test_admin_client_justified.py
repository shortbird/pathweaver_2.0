"""H1 regression: every get_supabase_admin_client() call site in routes/services/repositories
must have a justification comment within 3 lines above it.

This enforces the H1 audit (see H1_ADMIN_CLIENT_AUDIT.md) so that new code can't silently
re-introduce un-justified RLS bypasses. Companion to the PR template checklist item.

Justification format expected:
    # admin client justified: <one-line reason>
    supabase = get_supabase_admin_client()

Files explicitly out of audit scope (scripts, migrations, tests, docs) are skipped.
"""
import os
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND = REPO_ROOT / 'backend'

# Enforced scope: H1 audit Passes 1-4 (all of backend/routes/ including admin/*).
# Pass 5 (services/repositories/utils/jobs) is still TODO — expand SCAN_DIRS
# when that work lands. See H1_ADMIN_CLIENT_AUDIT.md.
SCAN_DIRS = [
    BACKEND / 'routes',
    # TODO Pass 5: BACKEND / 'services',
    # TODO Pass 5: BACKEND / 'repositories',
    # TODO Pass 5: BACKEND / 'utils',
    # TODO Pass 5: BACKEND / 'jobs',
]

# Out of scope: ops scripts, db migrations, tests, docs, the database singleton itself.
SKIP_PATH_FRAGMENTS = (
    '/scripts/', '\\scripts\\',
    '/migrations/', '\\migrations\\',
    '/tests/', '\\tests\\',
    '/docs/', '\\docs\\',
)
SKIP_BASENAMES = {'database.py'}

# How many lines above the call we accept the justification comment on.
JUSTIFICATION_WINDOW = 3
JUSTIFICATION_MARKER = 'admin client justified'


def _iter_admin_client_calls():
    """Yield (path_str, line_num, line_text) for every admin-client call site in scope."""
    for scan_dir in SCAN_DIRS:
        if not scan_dir.is_dir():
            continue
        for py_file in scan_dir.rglob('*.py'):
            path_str = str(py_file).replace(os.sep, '/')
            if any(frag.replace('\\', '/') in path_str for frag in SKIP_PATH_FRAGMENTS):
                continue
            if py_file.name in SKIP_BASENAMES:
                continue
            with py_file.open(encoding='utf-8') as f:
                lines = f.readlines()
            for idx, line in enumerate(lines):
                if 'get_supabase_admin_client()' not in line:
                    continue
                # Skip imports, type hints, comments-about, docstrings.
                stripped = line.strip()
                if stripped.startswith(('#', 'from ', 'import ')):
                    continue
                if '=' not in line:  # only assignments are real call sites
                    continue
                yield path_str, idx + 1, line.rstrip(), lines


def _has_justification(lines, call_line_idx):
    """True if any of the JUSTIFICATION_WINDOW lines above the call has the marker."""
    start = max(0, call_line_idx - JUSTIFICATION_WINDOW)
    for line in lines[start:call_line_idx]:
        if JUSTIFICATION_MARKER in line:
            return True
    # Also accept marker on the same line as a trailing comment.
    return JUSTIFICATION_MARKER in lines[call_line_idx]


def test_every_admin_client_call_has_justification_comment():
    """H1 audit invariant: no un-justified get_supabase_admin_client() in route/service/repo code.

    To fix a failure, add a one-line comment immediately above the call:
        # admin client justified: <why this needs RLS bypass>
        supabase = get_supabase_admin_client()

    See H1_ADMIN_CLIENT_AUDIT.md for the audit context and accepted reasons.
    """
    unmarked = []
    for path, lineno, text, lines in _iter_admin_client_calls():
        # call_line_idx is 0-based; lineno is 1-based
        if not _has_justification(lines, lineno - 1):
            unmarked.append(f'{path}:{lineno}: {text.strip()}')

    assert not unmarked, (
        f'{len(unmarked)} get_supabase_admin_client() call(s) lack a '
        f'"# admin client justified: ..." comment within {JUSTIFICATION_WINDOW} lines above. '
        f'See H1_ADMIN_CLIENT_AUDIT.md.\n\n' + '\n'.join(unmarked)
    )
