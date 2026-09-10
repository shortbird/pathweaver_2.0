"""Two role rules that were prose in CLAUDE.md, made mechanical.

**Rule 8: superadmin belongs in every role list.** A route that names
`('advisor', 'org_admin')` and omits superadmin locks the platform's only
superadmin out of a page they are meant to be able to reach. The decorator has
a superadmin early-break, so the practical effect varies by decorator -- which
is exactly why a reader cannot tell by eye and a test can.

  Today: 483 `@require_role(...)` decorators, and every one of them either
  includes 'superadmin' as a literal or unpacks one of the sis_roles tuples,
  all four of which contain it. Zero exceptions, so this is asserted at zero
  rather than ratcheted.

**`users.is_org_admin` is derived, never written.** The `sync_is_org_admin`
trigger computes it from role/org_role/org_roles (migration 20260807; the
trigger is live in production, confirmed in pg_trigger on 2026-09-10). The flag
alone grants org admin access in `require_school_admin`, `require_org_admin`,
`require_advisor` and PrivateRoute.jsx, and before the trigger existed the ~11
paths that set roles without also setting the flag left demoted admins holding
admin access.

  Today: 6 writes remain, in two admin route modules. All six write the same
  value the trigger computes, so they are redundant rather than wrong -- the
  trigger overwrites them either way. Ratcheted, not banned, because removing
  them is a behaviour change and this phase makes none.

Both rules were in CLAUDE.md. Neither had anything watching it.
"""

from __future__ import annotations

import ast
import re
from collections import Counter
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
SCAN_DIRS = ('routes', 'services', 'repositories', 'utils', 'middleware', 'modules')

#: Measured 2026-09-10. The floor exists so the scan cannot pass by finding
#: nothing; the repo has ~480 of these and that number only goes up.
DECORATOR_FLOOR = 400

#: Writes to users.is_org_admin. Ratchet down, never up.
IS_ORG_ADMIN_WRITES = 6

#: The role tuples in utils/sis_roles.py. Each is checked below for superadmin
#: rather than assumed, because a decorator that unpacks one of these inherits
#: whatever the tuple holds.
SIS_ROLE_TUPLES = (
    'STAFF_ROLES',
    'ADMIN_ROLES',
    'FINANCE_ROLES',
    'ROLE_GRANT_ROLES',
    'HR_ROLES',
)


def _python_files():
    for directory in SCAN_DIRS:
        base = BACKEND / directory
        if not base.exists():
            continue
        for path in base.rglob('*.py'):
            if '__pycache__' not in path.parts:
                yield path


def _require_role_calls():
    """(path, lineno, arg nodes) for every @require_role decorator."""
    for path in _python_files():
        try:
            tree = ast.parse(path.read_text(encoding='utf-8'))
        except (SyntaxError, UnicodeDecodeError):
            continue
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for decorator in node.decorator_list:
                if not isinstance(decorator, ast.Call):
                    continue
                func = decorator.func
                name = (
                    func.id if isinstance(func, ast.Name)
                    else func.attr if isinstance(func, ast.Attribute)
                    else None
                )
                if name == 'require_role':
                    yield path, decorator.lineno, decorator.args


def test_every_sis_role_tuple_includes_superadmin():
    """The tuples most decorators unpack. If one loses superadmin, ~200 routes do."""
    from utils import sis_roles

    for name in SIS_ROLE_TUPLES:
        tuple_value = getattr(sis_roles, name)
        assert 'superadmin' in tuple_value, (
            f'sis_roles.{name} = {tuple_value} does not contain superadmin. '
            'Every route that unpacks it just lost the platform owner.'
        )


def test_literal_role_lists_include_superadmin():
    missing = []
    scanned = 0
    for path, lineno, args in _require_role_calls():
        scanned += 1
        if any(isinstance(arg, ast.Starred) for arg in args):
            # `@require_role(*ADMIN_ROLES)` -- covered by the tuple test above.
            continue
        names = [a.value for a in args if isinstance(a, ast.Constant) and isinstance(a.value, str)]
        if len(names) != len(args):
            # A non-literal argument. Rare, and not decidable here.
            continue
        if 'superadmin' not in names:
            missing.append(f'{path.relative_to(BACKEND)}:{lineno}: {names}')

    assert not missing, (
        'These @require_role decorators name roles without including '
        'superadmin, so the platform owner cannot reach the route '
        '(CLAUDE.md rule 8):\n' + '\n'.join(missing)
    )
    assert scanned >= DECORATOR_FLOOR, (
        f'Only {scanned} @require_role decorators found, expected at least '
        f'{DECORATOR_FLOOR}. The scan broke; it is passing by measuring nothing.'
    )


#: `'is_org_admin': <anything>` as a dict key -- how a Supabase update payload
#: is built in this codebase. A read (`.select('is_org_admin')`) is fine and is
#: not matched.
IS_ORG_ADMIN_WRITE = re.compile(r"""['"]is_org_admin['"]\s*:""")


def test_writes_to_is_org_admin_do_not_grow():
    found: Counter = Counter()
    for path in _python_files():
        try:
            text = path.read_text(encoding='utf-8')
        except (OSError, UnicodeDecodeError):
            continue
        hits = len(IS_ORG_ADMIN_WRITE.findall(text))
        if hits:
            found[str(path.relative_to(BACKEND))] = hits
    total = sum(found.values())

    assert total <= IS_ORG_ADMIN_WRITES, (
        f'Writes to users.is_org_admin grew from {IS_ORG_ADMIN_WRITES} to '
        f'{total}. The column is derived by the sync_is_org_admin trigger from '
        f'role/org_role/org_roles -- write those and read the flag back. A '
        f'hand-written value is overwritten by the trigger, so a payload that '
        f'disagrees with the role columns is a silent no-op at best.\n\n'
        + '\n'.join(f'  {n:>3}  {name}' for name, n in found.most_common())
    )


def test_is_org_admin_is_never_the_only_thing_written():
    """A payload setting the flag without the role columns is the 2026-08 bug.

    That is the shape the trigger exists to make impossible: eleven paths set a
    role without the flag and left demoted admins holding admin access. The
    mirror image -- setting the flag and not the role -- would now be silently
    reverted by the trigger, which is worse, because the caller sees a
    successful write.
    """
    offenders = []
    for path in _python_files():
        try:
            tree = ast.parse(path.read_text(encoding='utf-8'))
        except (SyntaxError, UnicodeDecodeError):
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.Dict):
                continue
            keys = {
                k.value for k in node.keys
                if isinstance(k, ast.Constant) and isinstance(k.value, str)
            }
            if 'is_org_admin' in keys and not (keys & {'role', 'org_role', 'org_roles'}):
                offenders.append(f'{path.relative_to(BACKEND)}:{node.lineno}: {sorted(keys)}')

    assert not offenders, (
        'These payloads write is_org_admin without writing any role column. '
        'The sync_is_org_admin trigger recomputes the flag from the role '
        'columns, so this write is reverted and the caller is told it '
        'succeeded:\n' + '\n'.join(offenders)
    )
