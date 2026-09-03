"""Guard: application code logs, it does not print (CI-06).

`print()` bypasses everything the logging path provides. Concretely, in this
codebase it bypassed the PII scrubber: services/direct_message_service.py held
34 prints tracing message-permission decisions, each one putting two user UUIDs
on stdout, where `utils/log_scrubber` -- installed by SEC-05 precisely to stop
that -- never saw them. It also bypasses the JSON formatter, the correlation id,
the level filter, and Sentry's logging integration.

64 calls were converted on 2026-09-03 (QB-03). This keeps the next one out.

WHAT IS EXEMPT, and why:

  scripts/         one-off operational tools run by a human at a terminal.
                   stdout IS the interface.
  migrations/      the same.
  tests/           pytest captures stdout; a print in a test is a debugging aid.
  jobs/*trigger*, jobs/cron_dispatch.py, generate_spec.py, api_spec_generator.py
                   CLI entry points. They are invoked as commands, their output
                   is read by a person or a cron log, and a logger would be the
                   wrong shape.
  app_config.py    two warnings that fire during import, before logging is
                   configured. The file says so, and it is correct: there is a
                   genuine circular dependency and no logger exists yet.

Everything else -- routes, services, repositories, utils, middleware -- has a
logger available and must use it.
"""

import ast
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]

EXEMPT_DIRS = {'scripts', 'migrations', 'tests', 'database_migration', '__pycache__'}
EXEMPT_FILES = {
    'generate_spec.py',
    'api_spec_generator.py',
    'app_config.py',
    'cron_dispatch.py',
    'cron_trigger.py',
    'sis_attendance_sweep_trigger.py',
    'log_scrubber.py',      # its __main__ block demos the masking functions
}


def _offenders():
    for path in sorted(BACKEND.glob('**/*.py')):
        if EXEMPT_DIRS & set(path.parts) or path.name in EXEMPT_FILES:
            continue
        try:
            tree = ast.parse(path.read_text(encoding='utf-8'))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
                    and node.func.id == 'print'):
                yield f'{path.relative_to(BACKEND)}:{node.lineno}'


def test_app_code_uses_the_logger():
    offenders = sorted(_offenders())
    assert not offenders, (
        f'{len(offenders)} raw print() call(s) in application code:\n  '
        + '\n  '.join(offenders)
        + '\n\nUse the module logger. print() skips the PII scrubber, the JSON '
          'formatter, the correlation id and the level filter. If this file is '
          'genuinely a CLI entry point, add it to EXEMPT_FILES with a reason.')


def test_the_scan_covers_the_backend():
    """A guard on the guard -- a scan that reaches nothing passes forever."""
    scanned = [p for p in BACKEND.glob('**/*.py')
               if not (EXEMPT_DIRS & set(p.parts)) and p.name not in EXEMPT_FILES]
    assert len(scanned) > 400, (
        f'Only {len(scanned)} files scanned; the glob is wrong, not the codebase.')
