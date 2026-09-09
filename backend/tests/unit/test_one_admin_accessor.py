"""Ratchet: the admin-client wrapper is defined once, and stays that way.

Sixty-one modules across `routes/`, `services/` and `utils/` had each written
the same three lines:

    def _admin():
        return get_supabase_admin_client()

Not a near-copy — the identical function, sixty-one times, arrived at
independently because every module that has to bypass RLS needs the same
one-line accessor and the shortest path is to type it again. It is now
`utils/admin_client.py`, imported as `_admin` so the ~1,100 call sites did not
have to change.

WHY THIS IS WORTH A TEST. Not tidiness — the copies did not disagree and could
not, because there was nothing in them to disagree about. What sixty-one
definitions cost is that there was no single place to put anything. Adding a
Sentry breadcrumb, a call counter or a "you are on the service role" assertion
meant sixty-one edits, so nobody made the change, and the RLS bypass stayed the
one thing in this codebase with no seam in front of it. One definition is one
seam.

WHAT THIS DOES NOT REPLACE. `tests/unit/test_admin_client_justified.py` is
still the test that matters, and it was extended in the same commit to treat
`from utils.admin_client import admin_client` as a call site: every module must
still say, in a comment, WHY it bypasses RLS. Consolidating the code without
carrying the reasons across would have been a bad trade — the reason is the
part a reviewer reads. Twenty-seven distinct justifications came through the
move intact.

The cap is 1 rather than 0 because the accessor has to be defined somewhere.
Ratchet it DOWN if the name is ever retired; never raise it.
"""

import ast
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]

# Where application code lives. tests/ is excluded on purpose: five test modules
# define a `_admin(...)` FIXTURE — a Mock builder that takes arguments and
# returns a fake client. Those are unrelated to this rule and share only a name.
SCAN_DIRS = ('routes', 'services', 'repositories', 'utils', 'jobs', 'middleware', 'modules', 'prompts', 'config')

MAX_DEFINITIONS = 1

ACCESSOR = BACKEND / 'utils' / 'admin_client.py'


def _accessor_definitions():
    """Every zero-argument function whose body just returns the admin client.

    Matched on SHAPE, not on the name `_admin`. A copy that came back as
    `_client()` or `_sb()` would be the same duplication with a different label,
    and a name-based check would report the codebase clean.
    """
    found = []
    for rel_dir in SCAN_DIRS:
        base = BACKEND / rel_dir
        if not base.is_dir():
            continue
        for py in sorted(base.rglob('*.py')):
            if '__pycache__' in py.parts:
                continue
            source = py.read_text(encoding='utf-8')
            if 'get_supabase_admin_client' not in source:
                continue
            try:
                tree = ast.parse(source)
            except SyntaxError:
                continue
            for node in ast.walk(tree):
                if not isinstance(node, ast.FunctionDef) or node.args.args:
                    continue
                statements = [s for s in node.body
                              if not (isinstance(s, ast.Expr)
                                      and isinstance(s.value, ast.Constant)
                                      and isinstance(s.value.value, str))]
                # Allow the lazy `from database import ...` the accessor uses.
                statements = [s for s in statements if not isinstance(s, ast.ImportFrom)]
                if len(statements) != 1:
                    continue
                only = statements[0]
                if not isinstance(only, ast.Return) or not isinstance(only.value, ast.Call):
                    continue
                fn = only.value.func
                name = fn.id if isinstance(fn, ast.Name) else getattr(fn, 'attr', None)
                if name == 'get_supabase_admin_client':
                    found.append((py.relative_to(BACKEND).as_posix(), node.lineno, node.name))
    return found


def test_the_admin_accessor_is_defined_once():
    definitions = _accessor_definitions()
    assert len(definitions) <= MAX_DEFINITIONS, (
        f'{len(definitions)} modules define their own admin-client accessor; the cap '
        f'is {MAX_DEFINITIONS}.\n\n'
        'Import the shared one instead, and bring your reason with it:\n\n'
        '    # admin client justified: <why this module must bypass RLS>\n'
        '    from utils.admin_client import admin_client as _admin\n\n'
        + '\n'.join(f'  {rel}:{line}: def {name}()' for rel, line, name in definitions))


def test_the_one_definition_is_the_shared_accessor():
    """A guard on the guard.

    The count above is satisfied by ANY single definition, including one that
    someone moved back into a route module while deleting utils/admin_client.py.
    That would pass a bare count while re-opening the thing this closed, so pin
    the location too.
    """
    definitions = _accessor_definitions()
    assert definitions, (
        'No admin-client accessor found at all. The scan is probably broken '
        '(renamed factory, moved directories) rather than the codebase suddenly '
        'having no way to reach the service-role client.')
    assert [d[0] for d in definitions] == ['utils/admin_client.py'], definitions


def test_the_shared_accessor_imports_database_lazily():
    """Importing utils.admin_client must be safe from anywhere.

    Five of the sixty-one copies deliberately imported `database` inside the
    function, because `database` imports Config and those modules are imported
    from inside Config-consuming code. Hoisting that import to module scope here
    would close the cycle they were avoiding — and would break
    utils/org_secrets.py's pure helpers, which CI imports and tests without any
    database configuration on every push.
    """
    tree = ast.parse(ACCESSOR.read_text(encoding='utf-8'))
    module_level = [n for n in tree.body if isinstance(n, (ast.Import, ast.ImportFrom))]
    # Measured, not assumed: hoisting this import was tried on 2026-09-09 and
    # `import database` from a utils/ module raises ImportError on a partially
    # initialised module -- database imports utils.log_scrubber, which closes
    # the loop.
    assert module_level == [], (
        'utils/admin_client.py imports at module scope: '
        f'{[ast.unparse(n) for n in module_level]}. Move it inside the function.')
