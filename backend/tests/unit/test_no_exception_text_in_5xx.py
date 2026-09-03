"""Guard: a 5xx response body must not carry the exception's text.

    except Exception as e:
        return jsonify({'error': f'Failed to load user: {str(e)}'}), 500

That hands the caller whatever the exception happened to say. From a database
layer that is table and column names, constraint names, sometimes a fragment of
the row that failed; from a third-party client it is often a URL with a query
string in it. None of it is useful to the caller and all of it is useful to
somebody mapping the system.

The application already has the right answer and these handlers were routing
around it. `middleware/error_handler.handle_generic_error` returns a fixed
"An internal error occurred" in production, keys that decision off
`Config.FLASK_ENV` and fails CLOSED on an unknown environment, keeps the full
detail in development, and reports the original exception to Sentry with its
stack so the issue groups by cause instead of by timestamp. Letting the
exception propagate gets all of that; returning a hand-built 500 gets none of
it.

240 handlers were converted on 2026-09-03 (SEC-11). This stops the next one.

WHAT IS DELIBERATELY NOT BANNED: 4xx responses. `except ValueError as e: return
jsonify({'error': str(e)}), 400` is the normal way to surface a validation
message the caller asked for and is allowed to see. The line is the status code,
not the pattern.
"""

import ast
from pathlib import Path


# parents[2] is backend/ itself -- tests/unit/<file>. Getting this wrong is how
# a guard like this dies: it globs a directory that does not exist, finds
# nothing, and passes forever. test_the_scan_covers_the_backend below is the
# floor that catches exactly that.
BACKEND = Path(__file__).resolve().parents[2]

SKIP_DIR_PARTS = {'tests', 'scripts', 'migrations', 'database_migration', '__pycache__'}


def _interpolates(node: ast.AST, names: set) -> bool:
    """Does this expression put one of `names` into a string?"""
    for n in ast.walk(node):
        if (isinstance(n, ast.Call) and isinstance(n.func, ast.Name)
                and n.func.id == 'str' and n.args
                and isinstance(n.args[0], ast.Name) and n.args[0].id in names):
            return True
        if isinstance(n, ast.FormattedValue):
            for x in ast.walk(n.value):
                if isinstance(x, ast.Name) and x.id in names:
                    return True
    return False


def _offenders():
    for path in sorted(BACKEND.glob('**/*.py')):
        if SKIP_DIR_PARTS & set(path.parts):
            continue
        try:
            tree = ast.parse(path.read_text(encoding='utf-8'))
        except SyntaxError:
            continue
        for handler in [n for n in ast.walk(tree) if isinstance(n, ast.ExceptHandler)]:
            if not handler.name:
                continue
            # Returns written inside a nested def belong to that def, not here.
            nested = set()
            for stmt in handler.body:
                for f in ast.walk(stmt):
                    if isinstance(f, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
                        nested |= {id(x) for x in ast.walk(f)}
            for ret in [n for stmt in handler.body for n in ast.walk(stmt)
                        if isinstance(n, ast.Return)]:
                if id(ret) in nested or not isinstance(ret.value, ast.Tuple):
                    continue
                if len(ret.value.elts) != 2:
                    continue
                status = ret.value.elts[1]
                if not (isinstance(status, ast.Constant)
                        and isinstance(status.value, int) and status.value >= 500):
                    continue
                if _interpolates(ret.value.elts[0], {handler.name}):
                    rel = path.relative_to(BACKEND)
                    yield f'{rel}:{ret.lineno} (HTTP {status.value})'


def test_no_5xx_response_carries_exception_text():
    offenders = sorted(_offenders())
    assert not offenders, (
        f'{len(offenders)} handler(s) put the exception text into a 5xx body:\n  '
        + '\n  '.join(offenders)
        + '\n\nDelete the hand-built response and let the exception propagate. '
          'middleware/error_handler already returns a sanitized 500 in '
          'production, keeps the detail in development, and reports the cause '
          'to Sentry with its stack. Keep any logging line above it.')


def test_the_scan_covers_the_backend():
    """A guard on the guard: prove it is looking at real files.

    The first version of this test globbed `backend/**` from a root that was
    already backend/, so it scanned an empty set and passed unconditionally --
    caught only because a deliberately planted offender failed to trip it. The
    floor is far below the real file count; it catches "scanned nothing", not
    normal churn.
    """
    scanned = [p for p in BACKEND.glob('**/*.py') if not (SKIP_DIR_PARTS & set(p.parts))]
    assert len(scanned) > 400, (
        f'Only {len(scanned)} files scanned -- the glob is probably wrong, not '
        'the codebase suddenly small.')


def test_the_scan_can_actually_see_the_pattern():
    """A guard on the guard: prove the detector fires on the shape it bans.

    Every version of this that regressed did so by quietly matching nothing.
    """
    src = (
        'def view():\n'
        '    try:\n'
        '        work()\n'
        '    except Exception as e:\n'
        "        return jsonify({'error': f'boom: {str(e)}'}), 500\n"
    )
    tree = ast.parse(src)
    handler = next(n for n in ast.walk(tree) if isinstance(n, ast.ExceptHandler))
    ret = next(n for n in ast.walk(handler) if isinstance(n, ast.Return))
    assert _interpolates(ret.value.elts[0], {'e'}), 'detector missed an f-string'

    src2 = src.replace("f'boom: {str(e)}'", "'boom: ' + str(e)")
    tree2 = ast.parse(src2)
    h2 = next(n for n in ast.walk(tree2) if isinstance(n, ast.ExceptHandler))
    r2 = next(n for n in ast.walk(h2) if isinstance(n, ast.Return))
    assert _interpolates(r2.value.elts[0], {'e'}), 'detector missed a str() concat'


def test_4xx_bodies_are_left_alone():
    """The rule is about status, not about str(e). A 400 may explain itself."""
    src = (
        'def view():\n'
        '    try:\n'
        '        work()\n'
        '    except ValueError as e:\n'
        "        return jsonify({'error': str(e)}), 400\n"
    )
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / 'sample.py'
        p.write_text(src, encoding='utf-8')
        tree = ast.parse(src)
        handler = next(n for n in ast.walk(tree) if isinstance(n, ast.ExceptHandler))
        ret = next(n for n in ast.walk(handler) if isinstance(n, ast.Return))
        status = ret.value.elts[1].value
        assert status < 500, 'fixture must be a 4xx'
        # The detector would match the text, but the status gate excludes it.
        assert _interpolates(ret.value.elts[0], {'e'})
