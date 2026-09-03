"""Guard: a function-local import must not be read from its own try's handler.

    def register():
        try:
            ...validate...                       # can raise
            from app_config import Config        # binds Config, locally
            ...
        except Exception as e:
            if Config.FLASK_ENV == 'development':   # UnboundLocalError
                ...

`from app_config import Config` inside a function makes `Config` a LOCAL name
for the whole function -- the compiler decides that statically, from the
presence of the binding, not from whether the line ran. So every path that
raises before the import reaches the handler with the name unbound, and the
handler dies with UnboundLocalError instead of doing its job. What the caller
sees is a bare 500 from a completely different place than the real failure, and
what Sentry groups on is the UnboundLocalError, so the original exception is
gone.

A module-level import of the same name does NOT save it: the local binding
shadows the global one throughout the function.

Found on 2026-09-03 in routes/auth/registration.py (SEC-11's log noted it; this
item fixed it). The whole of `register()` is one try, so any unexpected
exception in the ~75 lines of validation before the import -- anything whose
message did not match one of the handler's known-error branches -- hit the
`Config.FLASK_ENV` line and raised UnboundLocalError. Fix was to hoist the
import to module scope, which is what every other module in routes/auth does.

WHAT IS DELIBERATELY NOT CHECKED: ordinary assignments made inside a try and
read from its handler (`user_id = ...` on line 2, logged on failure). Whether
those are safe depends on where the first statement that can raise sits, which
needs flow analysis; 11 such sites were triaged by hand on 2026-09-03 and all
were either bound before anything could raise or explicitly guarded with
`if 'name' in locals()`. Imports are the tractable, unambiguous half: a lazy
import is never the first statement of a handler-relevant try by accident.
"""

import ast
from pathlib import Path


# parents[2] is backend/ -- this file is backend/tests/unit/<name>.py.
BACKEND = Path(__file__).resolve().parents[2]

SKIP_DIR_PARTS = {'tests', 'scripts', 'migrations', 'database_migration', '__pycache__'}


def _names_bound_by_imports(stmts) -> dict[str, int]:
    """Names these statements bind by importing, mapped to the import's line.

    Nested defs are skipped: their imports bind in their own scope, not here.
    """
    bound: dict[str, int] = {}
    for stmt in stmts:
        for node in ast.walk(stmt):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda,
                                 ast.ClassDef)) and node is not stmt:
                continue
            if isinstance(node, ast.Import):
                for alias in node.names:
                    bound.setdefault(alias.asname or alias.name.split('.')[0], node.lineno)
            elif isinstance(node, ast.ImportFrom):
                for alias in node.names:
                    bound.setdefault(alias.asname or alias.name, node.lineno)
    return bound


def _handler_offenders(try_node: ast.Try):
    """Yield (name, import_line, use_line) for lazy imports read after a raise.

    `else:` is excluded on purpose -- it only runs when the body completed, so
    the binding is guaranteed there. Handlers and `finally:` are not.
    """
    imported = _names_bound_by_imports(try_node.body)
    if not imported:
        return
    blocks = [h.body for h in try_node.handlers] + [try_node.finalbody]
    for block in blocks:
        already = set(_names_bound_by_imports(block))
        for stmt in block:
            for node in ast.walk(stmt):
                if (isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load)
                        and node.id in imported and node.id not in already):
                    yield node.id, imported[node.id], node.lineno


def _offenders():
    for path in sorted(BACKEND.glob('**/*.py')):
        if SKIP_DIR_PARTS & set(path.parts):
            continue
        try:
            tree = ast.parse(path.read_text(encoding='utf-8'))
        except SyntaxError:
            continue
        for func in ast.walk(tree):
            if not isinstance(func, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for node in ast.walk(func):
                if isinstance(node, ast.Try):
                    for name, imp_line, use_line in _handler_offenders(node):
                        rel = path.relative_to(BACKEND)
                        yield (f'{rel}:{use_line} reads {name}, imported inside '
                               f'the same try at line {imp_line}')


def test_no_handler_reads_a_lazy_import_from_its_own_try():
    offenders = sorted(set(_offenders()))
    assert not offenders, (
        f'{len(offenders)} handler(s) read a name that may be unbound:\n  '
        + '\n  '.join(offenders)
        + '\n\nHoist the import to module scope. A function-local import makes '
          'the name local for the entire function, so any path that raises '
          'before it reaches the handler with the name unbound and the handler '
          'raises UnboundLocalError instead of handling anything.')


def test_the_scan_covers_the_backend():
    """A guard on the guard: prove it is looking at real files.

    Guards of this shape regress by globbing a path that does not exist,
    scanning nothing and passing forever. The floor is far below the real count.
    """
    scanned = [p for p in BACKEND.glob('**/*.py') if not (SKIP_DIR_PARTS & set(p.parts))]
    assert len(scanned) > 400, (
        f'Only {len(scanned)} files scanned -- the glob is wrong, not the '
        'codebase suddenly small.')


def test_the_scan_can_actually_see_the_pattern():
    """A guard on the guard: the detector fires on the shape it bans."""
    src = (
        'def view():\n'
        '    try:\n'
        '        validate()\n'
        '        from app_config import Config\n'
        '        use(Config.FRONTEND_URL)\n'
        '    except Exception:\n'
        '        log(Config.FLASK_ENV)\n'
    )
    node = next(n for n in ast.walk(ast.parse(src)) if isinstance(n, ast.Try))
    assert [x[0] for x in _handler_offenders(node)] == ['Config']


def test_a_handler_that_imports_for_itself_is_fine():
    """`import traceback` inside the handler binds it there. Not an offender.

    routes/auth/password.py does exactly this in two nested handlers, and a
    detector that ignored handler-local imports would have called both bugs.
    """
    src = (
        'def view():\n'
        '    try:\n'
        '        import traceback\n'
        '        work()\n'
        '    except Exception:\n'
        '        import traceback\n'
        '        log(traceback.format_exc())\n'
    )
    node = next(n for n in ast.walk(ast.parse(src)) if isinstance(n, ast.Try))
    assert list(_handler_offenders(node)) == []


def test_the_else_branch_is_not_an_offender():
    """`else:` runs only when the body finished, so the import definitely ran."""
    src = (
        'def view():\n'
        '    try:\n'
        '        from app_config import Config\n'
        '    except Exception:\n'
        '        pass\n'
        '    else:\n'
        '        use(Config.FRONTEND_URL)\n'
    )
    node = next(n for n in ast.walk(ast.parse(src)) if isinstance(n, ast.Try))
    assert list(_handler_offenders(node)) == []
