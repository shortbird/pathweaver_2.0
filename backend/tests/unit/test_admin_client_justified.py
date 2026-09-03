"""H1 regression: every get_supabase_admin_client() call site in
routes/services/repositories/utils/jobs must carry a justification comment
in the comment block above it.

The admin client bypasses RLS. Each use is a decision to read or write rows the
caller cannot see, and the comment is where that decision is recorded:

    # admin client justified: <one-line reason>
    supabase = get_supabase_admin_client()

WHY THIS IS AST-BASED. Until 2026-09-03 it matched lines textually and skipped
any line without an '=', on the reasoning that "only assignments are real call
sites". They are not. These are all real, and all were invisible:

    return get_supabase_admin_client()                       # module _admin()
    get_supabase_admin_client().table('users').select('role')  # inline
    if not caller_can_access_course(get_supabase_admin_client(), ...)

That blind spot was not academic. It hid 105 call sites, 85 of them
unjustified -- while the test passed, because the 965 sites it *could* see had
all been annotated. A gate that reports success over the exact population
nobody audited is worse than a red one: it reads as reviewed.

Parsing means a call is a call however it is written, and the reason is looked
for in the contiguous comment block above the enclosing STATEMENT plus a short
fixed lookback -- neither alone is right. A fixed 3-line window punished the
most careful justifications (utils/portfolio_access.py explains its bypass in
five lines, so the marker sat outside it); the comment block alone punished the
common shape where one line of setup sits between the reason and the call.

Files out of audit scope (scripts, migrations, tests, docs) are skipped, as is
database.py, which defines the client.
"""

import ast
import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND = REPO_ROOT / 'backend'

SCAN_DIRS = ['routes', 'services', 'repositories', 'utils', 'jobs']

SKIP_PATH_FRAGMENTS = ('/scripts/', '/migrations/', '/tests/', '/docs/')
SKIP_BASENAMES = {'database.py'}

JUSTIFICATION_MARKER = 'admin client justified'
NEARBY_LINES = 3
TARGET = 'get_supabase_admin_client'


def _called_name(node: ast.Call):
    fn = node.func
    if isinstance(fn, ast.Name):
        return fn.id
    if isinstance(fn, ast.Attribute):
        return fn.attr
    return None


def _statement_lines(tree):
    """Map every line owned by a statement back to that statement's first line,
    so a call inside a multi-line expression is anchored where an author would
    naturally have written the comment."""
    anchor = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.stmt):
            end = getattr(node, 'end_lineno', node.lineno) or node.lineno
            for ln in range(node.lineno, end + 1):
                # Innermost statement wins: a call inside a nested statement
                # anchors to that one, not the enclosing function def.
                if ln not in anchor or node.lineno > anchor[ln]:
                    anchor[ln] = node.lineno
    return anchor


def _iter_call_sites():
    """Yield (relpath, lineno, source_line, justified) for every real call."""
    for d in SCAN_DIRS:
        base = BACKEND / d
        if not base.is_dir():
            continue
        for py in base.rglob('*.py'):
            path = str(py).replace(os.sep, '/')
            if any(f in path for f in SKIP_PATH_FRAGMENTS):
                continue
            if py.name in SKIP_BASENAMES:
                continue
            text = py.read_text(encoding='utf-8')
            if TARGET not in text:
                continue
            try:
                tree = ast.parse(text)
            except SyntaxError:
                continue
            lines = text.splitlines()
            anchor = _statement_lines(tree)
            for node in ast.walk(tree):
                if not isinstance(node, ast.Call) or _called_name(node) != TARGET:
                    continue
                stmt_line = anchor.get(node.lineno, node.lineno)
                # The whole contiguous comment block above the statement, however
                # long...
                block, i = [], stmt_line - 2
                while i >= 0 and lines[i].strip().startswith('#'):
                    block.append(lines[i])
                    i -= 1
                # ...plus a short fixed lookback, because a justification is
                # sometimes separated from its call by a line of setup:
                #     # admin client justified: ...
                #     user_repo = UserRepository()
                #     supabase = get_supabase_admin_client()
                block += lines[max(0, stmt_line - 1 - NEARBY_LINES):stmt_line - 1]
                block.append(lines[node.lineno - 1])   # trailing same-line marker
                justified = any(JUSTIFICATION_MARKER in l for l in block)
                rel = path.split('/backend/')[-1]
                yield rel, node.lineno, lines[node.lineno - 1].strip(), justified


def test_every_admin_client_call_has_justification_comment():
    """No un-justified get_supabase_admin_client() in application code.

    To fix a failure, state the reason above the call:
        # admin client justified: <why this needs to bypass RLS>
        supabase = get_supabase_admin_client()

    If you cannot write an honest one, the call probably wants get_user_client()
    instead. See H1_ADMIN_CLIENT_AUDIT.md.
    """
    unmarked = [f'{rel}:{ln}: {src}'
                for rel, ln, src, ok in _iter_call_sites() if not ok]

    assert not unmarked, (
        f'{len(unmarked)} get_supabase_admin_client() call(s) lack a '
        f'"# {JUSTIFICATION_MARKER}: ..." comment above them.'
        f'\n\n' + '\n'.join(unmarked))


def test_the_scan_still_finds_call_sites():
    """A guard on the guard.

    Every previous weakening of this test was invisible because it kept
    passing. If a refactor renames the factory or moves the code, this test
    would go green over an empty scan and report nothing wrong. The floor is
    deliberately far below the ~1070 real sites: it catches "found nothing",
    not normal churn.
    """
    total = sum(1 for _ in _iter_call_sites())
    assert total > 500, (
        f'Only {total} admin-client call sites found. The scan is probably '
        'broken (renamed factory, moved directories, or a parse failure), not '
        'the codebase suddenly clean.')
