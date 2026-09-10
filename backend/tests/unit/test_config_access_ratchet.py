"""Every secret and setting comes from `Config`, and the exceptions shrink.

This is the mechanical half of what CLAUDE.md used to state as rule 9: "API keys
via Config class only -- all API keys and secrets must be accessed via `Config`
from `app_config.py`, never `os.getenv()` directly."

There are two halves, and only one of them existed.

  The app layers -- routes, services, repositories, middleware, utils -- are at
  ZERO and stay at zero. `test_no_raw_env_in_routes.py` has enforced that since
  the S4 lint sweep and nothing here changes it.

  Everything else in backend/ -- scripts, jobs, spec generators, the module
  gate -- was never covered by anything. 113 direct reads live there today. A
  rule that a reader believes covers the whole backend, and that in fact covers
  five directories, is worse than a rule that states its own boundary: somebody
  moves a helper from `services/` into `scripts/` and the check silently stops
  applying to it.

So this file draws the boundary explicitly, ratchets the uncovered half, and
asserts that the two halves together account for all of backend/. A new
top-level directory falls into the ratchet by default rather than into a gap.

WHY THE SCRIPTS ARE NOT SIMPLY FIXED. `backend/scripts/` is 71 one-off repair
and backfill scripts (OPS-08), most of which build their own Supabase client
from SUPABASE_URL and SUPABASE_SERVICE_KEY before any app code is imported.
Routing those through `Config` is a rewrite of 53 files that nothing runs on a
schedule, to satisfy a rule whose actual risk -- a key read from an unexpected
place inside a request -- does not apply to them. The ratchet says: fine, but
there may never be more of them.

The number moves DOWN only. If you are here because it failed, you added a
direct environment read outside the bootstrap. Read it from `Config`.
"""

from __future__ import annotations

import ast
from collections import Counter
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]

#: Layers that are at zero, enforced by test_no_raw_env_in_routes.py.
APP_LAYERS = ('routes', 'services', 'repositories', 'middleware', 'utils')

#: Bootstrap. These run before there is a Config to read, or they ARE the
#: config: gunicorn's own conf file, the app factory, the WSGI entrypoint, and
#: app_config itself, which is where the env belongs.
BOOTSTRAP = {
    'app.py',
    'main.py',
    'gunicorn.conf.py',
    'app_config.py',
}

#: Measured 2026-09-10 across backend/, excluding tests, the app layers and the
#: bootstrap files above. Ratchet down, never up.
DIRECT_ENV_READS = 113


def _is_env_read(node: ast.AST) -> bool:
    """os.getenv(...), os.environ.get/setdefault/pop(...), os.environ[...]."""
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
        func = node.func
        value = func.value
        if isinstance(value, ast.Name) and value.id == 'os' and func.attr == 'getenv':
            return True
        if (
            isinstance(value, ast.Attribute)
            and isinstance(value.value, ast.Name)
            and value.value.id == 'os'
            and value.attr == 'environ'
            and func.attr in {'get', 'setdefault', 'pop'}
        ):
            return True
    if isinstance(node, ast.Subscript):
        value = node.value
        if (
            isinstance(value, ast.Attribute)
            and isinstance(value.value, ast.Name)
            and value.value.id == 'os'
            and value.attr == 'environ'
        ):
            return True
    return False


def _env_reads(path: Path) -> int:
    try:
        tree = ast.parse(path.read_text(encoding='utf-8'))
    except (SyntaxError, UnicodeDecodeError):
        return 0
    return sum(1 for node in ast.walk(tree) if _is_env_read(node))


def _scanned_files() -> list[Path]:
    files = []
    for path in BACKEND.rglob('*.py'):
        rel = path.relative_to(BACKEND)
        if '__pycache__' in rel.parts or 'tests' in rel.parts:
            continue
        if rel.parts[0] in APP_LAYERS or path.name in BOOTSTRAP:
            continue
        files.append(path)
    return files


def test_direct_environment_reads_do_not_grow():
    counts = Counter()
    for path in _scanned_files():
        found = _env_reads(path)
        if found:
            counts[str(path.relative_to(BACKEND))] = found
    total = sum(counts.values())

    assert total <= DIRECT_ENV_READS, (
        f'Direct os.getenv / os.environ reads outside the app layers grew from '
        f'{DIRECT_ENV_READS} to {total}. Read the value from app_config.Config '
        f'instead -- see backend/docs/ENV_KEYS_REFERENCE.md.\n\n'
        + '\n'.join(f'  {n:>3}  {name}' for name, n in counts.most_common(15))
    )
    assert total >= DIRECT_ENV_READS - 40, (
        f'Only {total} direct env reads found, against a ratchet of '
        f'{DIRECT_ENV_READS}. Either a real cleanup happened -- in which case '
        f'lower DIRECT_ENV_READS to {total} in this file and say so in the '
        f'commit -- or this scan stopped finding call sites, which is the '
        f'failure mode that makes a ratchet pass by measuring nothing.'
    )


def test_the_scan_still_sees_the_backend():
    """A ratchet that globs nothing passes forever. Prove it globbed."""
    files = _scanned_files()
    assert len(files) > 100, (
        f'The scan found only {len(files)} files outside the app layers. It is '
        'supposed to see all of backend/scripts, backend/jobs and the module '
        'code -- roughly 200 files. Something in the filtering broke.'
    )


def test_the_two_halves_account_for_every_backend_directory():
    """No directory falls between this ratchet and the zero-tolerance test.

    The gap this closes: a helper moved from `services/` to a new top-level
    directory would be covered by neither check, and nothing would say so.
    """
    covered = set(APP_LAYERS)
    uncovered_dirs = set()
    for path in BACKEND.rglob('*.py'):
        rel = path.relative_to(BACKEND)
        if '__pycache__' in rel.parts or 'tests' in rel.parts:
            continue
        if len(rel.parts) == 1:
            continue
        uncovered_dirs.add(rel.parts[0])

    unaccounted = uncovered_dirs - covered - set(_ratcheted_dirs())
    assert not unaccounted, (
        f'These backend directories are covered by neither the zero-tolerance '
        f'check (test_no_raw_env_in_routes.py) nor this ratchet: '
        f'{sorted(unaccounted)}. Add them to one or the other.'
    )


def _ratcheted_dirs() -> set[str]:
    dirs = set()
    for path in _scanned_files():
        rel = path.relative_to(BACKEND)
        if len(rel.parts) > 1:
            dirs.add(rel.parts[0])
    return dirs
