"""Regression guard for OPTIO-BACKEND-5M: never stack two user_id-injecting
auth decorators on one view function.

Every decorator in the family below calls f(user_id, *args, **kwargs), so
stacking two of them passes user_id twice and the view dies with
"takes N positional arguments but N+1 were given" at request time — imports
and route registration succeed, so nothing catches it before production
traffic does. That is exactly how /api/admin/flagged-tasks shipped broken
(@require_auth + @require_role('admin'), fixed 2026-08-11).

Each of these decorators authenticates on its own; a view needs exactly one.
"""
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
ROUTES_DIR = REPO_ROOT / 'backend' / 'routes'

# Decorators from utils.auth.decorators that inject user_id positionally.
# require_parental_consent is deliberately absent: it calls f(*args, **kwargs).
INJECTING_DECORATORS = re.compile(
    r'@require_('
    r'auth|admin|role|advisor|advisor_for_student|'
    r'superadmin|school_admin|org_admin'
    r')\b'
)


def _decorator_blocks(path):
    """Yield (line_num_of_def, [decorator lines]) for each decorated function."""
    lines = path.read_text(encoding='utf-8').splitlines()
    block = []
    for num, line in enumerate(lines, start=1):
        stripped = line.strip()
        if stripped.startswith('@'):
            block.append(stripped)
        elif stripped.startswith('def ') or stripped.startswith('async def '):
            if block:
                yield num, block
            block = []
        elif stripped and not stripped.startswith('#'):
            block = []


def test_no_view_stacks_two_injecting_auth_decorators():
    violations = []
    for py_file in sorted(ROUTES_DIR.rglob('*.py')):
        for def_line, decorators in _decorator_blocks(py_file):
            injectors = [d for d in decorators if INJECTING_DECORATORS.match(d)]
            if len(injectors) > 1:
                rel = py_file.relative_to(REPO_ROOT)
                violations.append(f'{rel}:{def_line} stacks {injectors}')

    assert not violations, (
        'These views stack multiple user_id-injecting auth decorators, which '
        'double-passes user_id and 500s at request time. Keep exactly one '
        '(each already authenticates):\n' + '\n'.join(violations)
    )
