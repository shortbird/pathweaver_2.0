"""Guard: no `[DEBUG]`-tagged log line in application code.

    logger.warning(f"[DEBUG] Calling get_quests_for_user: user_id={user_id}, ...")

Two things are wrong with that and only one of them is the tag.

The tag says what the line is: a trace somebody added while working on
something, which then shipped. The LEVEL says the opposite — WARNING is what
Sentry alerts on and what a person scanning Render logs is looking for. A
permanent trace at WARNING trains everyone to skim the level that is supposed
to mean "look at this".

And a trace prints whatever was in scope. Four `[DIPLOMA]` lines in
routes/parent/child_overview.py logged the raw PostgREST rows of a student's
completed tasks at WARNING, on the parent dashboard's main read — student
record data, into the logs, and on to Sentry. The PII filter in utils/logger
masks emails; it does not know that a list of task rows is a student record.

Eleven such lines were removed on 2026-09-03 (FU-04): six at WARNING, three at
INFO, and three at ERROR in routes/auth/registration.py that logged one
exception across three records. They were hand-written scaffolding from
December 2025 and January 2026, not fallout from the print-to-logger conversion
(QB-03) — that script skipped anything containing 'DEBUG'.

The rule is the tag, not the level, because the tag is the part that is
decidable. `[REGISTRATION]`, `[FORGOT_PASSWORD]`, `[BugReport]` and the rest of
the module tags this codebase uses are fine and deliberately untouched. Raw
`print()` is separately banned in app code (CI-06).

If you want a trace: `logger.debug()`, no tag. It costs nothing in production
and nobody has to decide whether it means something.
"""

import ast
from pathlib import Path


# parents[2] is backend/ -- this file is backend/tests/unit/<name>.py.
BACKEND = Path(__file__).resolve().parents[2]

SCAN_DIRS = ('routes', 'services', 'repositories', 'utils', 'jobs', 'middleware')

BANNED_TAG = '[debug]'

LOG_METHODS = {'debug', 'info', 'warning', 'warn', 'error', 'exception', 'critical'}


def _leading_text(node: ast.AST) -> str:
    """The literal text a log message starts with, f-string or not."""
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.JoinedStr):
        for part in node.values:
            if isinstance(part, ast.Constant) and isinstance(part.value, str):
                return part.value
            return ''  # starts with an interpolation
    return ''


def _is_log_call(node: ast.Call) -> bool:
    fn = node.func
    return isinstance(fn, ast.Attribute) and fn.attr in LOG_METHODS


def _offenders():
    for directory in SCAN_DIRS:
        for path in sorted((BACKEND / directory).glob('**/*.py')):
            if '__pycache__' in path.parts:
                continue
            try:
                tree = ast.parse(path.read_text(encoding='utf-8'))
            except SyntaxError:
                continue
            for node in ast.walk(tree):
                if not isinstance(node, ast.Call) or not _is_log_call(node):
                    continue
                if not node.args:
                    continue
                text = _leading_text(node.args[0]).lstrip()
                if text[:len(BANNED_TAG)].lower() == BANNED_TAG:
                    rel = path.relative_to(BACKEND)
                    yield f'{rel}:{node.lineno} ({node.func.attr})'


def test_no_debug_tagged_log_lines_in_app_code():
    offenders = sorted(set(_offenders()))
    assert not offenders, (
        f'{len(offenders)} log line(s) tagged [DEBUG]:\n  '
        + '\n  '.join(offenders)
        + '\n\nDelete it, or make it a real logger.debug() with no tag. A trace '
          'that ships at INFO or above spends an alerting level on something '
          'nobody meant to alert on, and prints whatever was in scope.')


def test_the_scan_covers_the_app_directories():
    """A guard on the guard: prove it is looking at real files.

    This shape of test regresses by globbing a path that does not exist and
    passing over an empty set. The floor is far below the real count.
    """
    scanned = [p for d in SCAN_DIRS for p in (BACKEND / d).glob('**/*.py')
               if '__pycache__' not in p.parts]
    assert len(scanned) > 250, (
        f'Only {len(scanned)} files scanned -- the glob is wrong, not the '
        'codebase suddenly small.')


def test_the_scan_can_actually_see_the_pattern():
    """A guard on the guard: the detector fires on both string shapes."""
    fstring = 'logger.warning(f"[DEBUG] user_id={user_id}")'
    plain = 'logger.info("[DEBUG] made it here")'
    for src in (fstring, plain):
        call = next(n for n in ast.walk(ast.parse(src)) if isinstance(n, ast.Call))
        assert _is_log_call(call)
        assert _leading_text(call.args[0]).lower().startswith(BANNED_TAG), src


def test_module_tags_are_left_alone():
    """`[REGISTRATION]` and friends are the house convention, not the target."""
    for src in ('logger.info("[REGISTRATION] created")',
                'logger.warning(f"[BugReport] screenshot skipped (size={size})")'):
        call = next(n for n in ast.walk(ast.parse(src)) if isinstance(n, ast.Call))
        assert not _leading_text(call.args[0]).lower().startswith(BANNED_TAG), src
