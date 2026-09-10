#!/usr/bin/env python3
"""Stop hook. Runs the tests that belong to the files this session touched.

CLAUDE.md rule 7 asks for exactly this in prose -- "run only the affected test
files while iterating, the full suite once before commit" -- and prose cannot
run pytest. The full suites are about two minutes each, three of them, which is
too slow to spend on a session that changed one route. A scoped run is a few
seconds and catches the failure while the change is still in front of the agent.

How a source file is mapped to its tests:

  backend/x/foo.py     backend/tests/**/test_*foo*.py, plus any backend test
                       that imports the module by name.
  web/src/**/Foo.jsx   Foo.test.* anywhere under web/src, plus any web test
                       that imports it by path.
  mobile/**/Foo.tsx    the same, run by jest.
  a test file itself   itself.

The mapping is a heuristic and says so. It exists to make the common case
automatic, not to replace `npm run test:run` before a push -- the handoff and
CI still want the full suites.

Caps: at most 8 test files per suite and 240 seconds in total. A session that
touched forty files gets a sample, and the message says so rather than
pretending the whole surface was checked.

Fails open: if this script raises, the session ends normally.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _common import PROJECT_DIR, allow, block, read_event, run, state_file, venv_bin  # noqa: E402

MAX_FILES_PER_SUITE = 8
BACKEND_TIMEOUT = 240
WEB_TIMEOUT = 240
MOBILE_TIMEOUT = 180

TEST_SUFFIXES = ('.test.js', '.test.jsx', '.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx')


def _is_backend_test(rel: Path) -> bool:
    return rel.parts[:2] == ('backend', 'tests') and rel.name.startswith('test_')


def _is_js_test(rel: Path) -> bool:
    return rel.name.endswith(TEST_SUFFIXES) or '__tests__' in rel.parts


def _grep_importers(root: Path, needle: str, patterns: tuple[str, ...]) -> list[Path]:
    """Test files under `root` that mention `needle`. Cheap, and good enough."""
    found: list[Path] = []
    for pattern in patterns:
        for path in root.rglob(pattern):
            if 'node_modules' in path.parts or '__pycache__' in path.parts:
                continue
            try:
                if re.search(rf'\b{re.escape(needle)}\b', path.read_text(encoding='utf-8', errors='ignore')):
                    found.append(path)
            except OSError:
                continue
    return found


def backend_tests_for(rel: Path) -> set[Path]:
    if _is_backend_test(rel):
        return {rel}
    stem = rel.stem
    if stem in {'__init__', 'conftest'}:
        return set()
    tests_root = PROJECT_DIR / 'backend' / 'tests'
    if not tests_root.exists():
        return set()
    hits = {p for p in tests_root.rglob(f'test_*{stem}*.py')}
    if not hits:
        hits = set(_grep_importers(tests_root, stem, ('test_*.py',)))
    return {p.relative_to(PROJECT_DIR) for p in hits}


def js_tests_for(rel: Path, app: str) -> set[Path]:
    if _is_js_test(rel):
        return {rel}
    stem = rel.stem
    root = PROJECT_DIR / app
    if not root.exists():
        return set()
    hits: set[Path] = set()
    for suffix in TEST_SUFFIXES:
        hits |= {p for p in root.rglob(f'{stem}{suffix}') if 'node_modules' not in p.parts}
    if not hits:
        for pattern in ('**/__tests__/*.test.*', '**/*.test.*'):
            for path in root.rglob(pattern):
                if 'node_modules' in path.parts:
                    continue
                try:
                    text = path.read_text(encoding='utf-8', errors='ignore')
                except OSError:
                    continue
                if re.search(rf'''['"/]{re.escape(stem)}['"]''', text):
                    hits.add(path)
    return {p.relative_to(PROJECT_DIR) for p in hits}


def summarise(output: str, limit: int = 40) -> str:
    """The lines a person would actually read out of a failing run."""
    keep: list[str] = []
    for line in output.splitlines():
        if re.search(
            r'^(FAILED|ERROR|\s*✕|\s*×|●|E\s|assert|AssertionError|'
            r'Test Files|Tests:|Tests\s|=+ .*(failed|passed|error))',
            line,
        ):
            keep.append(line.rstrip())
    if not keep:
        keep = output.strip().splitlines()[-limit:]
    return '\n'.join(keep[-limit:])


def main() -> None:
    event = read_event()
    if event.get('stop_hook_active'):
        # Already continuing because of this hook. Running again would loop.
        allow()

    touched_path = state_file(event)
    if not touched_path.exists():
        allow()
    try:
        touched = [Path(line) for line in touched_path.read_text(encoding='utf-8').splitlines() if line.strip()]
    except OSError:
        allow()
    if not touched:
        allow()

    backend: set[Path] = set()
    web: set[Path] = set()
    mobile: set[Path] = set()
    for rel in touched:
        if not (PROJECT_DIR / rel).exists():
            continue
        head = rel.parts[0] if rel.parts else ''
        if head == 'backend' and rel.suffix == '.py':
            backend |= backend_tests_for(rel)
        elif head == 'web' and rel.suffix in {'.js', '.jsx', '.ts', '.tsx'}:
            web |= js_tests_for(rel, 'web')
        elif head == 'mobile' and rel.suffix in {'.js', '.jsx', '.ts', '.tsx'}:
            mobile |= js_tests_for(rel, 'mobile')

    failures: list[str] = []
    notes: list[str] = []

    def note_cap(name: str, files: set[Path]) -> list[str]:
        chosen = sorted(files)[:MAX_FILES_PER_SUITE]
        if len(files) > MAX_FILES_PER_SUITE:
            notes.append(
                f'{name}: {len(files)} related test files matched, ran {len(chosen)}. '
                'Run the suite in full before you commit.'
            )
        return [str(p) for p in chosen]

    if backend:
        files = note_cap('backend', backend)
        code, out = run(
            [venv_bin('python'), '-m', 'pytest', '-q', '--no-header', *[str(PROJECT_DIR / f) for f in files]],
            cwd=PROJECT_DIR / 'backend',
            timeout=BACKEND_TIMEOUT,
        )
        if code not in (0, 5, 127):
            failures.append(f'backend ({len(files)} files):\n{summarise(out)}')

    if web:
        files = note_cap('web', web)
        code, out = run(
            ['npx', '--no-install', 'vitest', 'run', *[str(PROJECT_DIR / f) for f in files]],
            cwd=PROJECT_DIR / 'web',
            timeout=WEB_TIMEOUT,
        )
        if code not in (0, 127):
            failures.append(f'web ({len(files)} files):\n{summarise(out)}')

    if mobile:
        files = note_cap('mobile', mobile)
        code, out = run(
            ['npx', '--no-install', 'jest', '--silent', *[str(PROJECT_DIR / f) for f in files]],
            cwd=PROJECT_DIR / 'mobile',
            timeout=MOBILE_TIMEOUT,
        )
        if code not in (0, 127):
            failures.append(f'mobile ({len(files)} files):\n{summarise(out)}')

    if failures:
        block(
            'Tests related to the files you changed are failing '
            '(.claude/hooks/related_tests.py).\n\n'
            + '\n\n'.join(failures)
            + ('\n\n' + '\n'.join(notes) if notes else '')
            + '\n\nZero failures is the bar. Fix them, or say plainly in your reply '
              'that they fail and why. Do not skip, xfail or delete a test to get there.'
        )

    # Passed, or nothing matched. Either way this set has been checked; clear it
    # so the next Stop does not re-run the same files.
    try:
        touched_path.unlink(missing_ok=True)
    except OSError:
        pass
    allow()


if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:  # pragma: no cover - fail open, loudly
        sys.stderr.write(f'related_tests hook error (session ends normally): {exc}\n')
        sys.exit(1)
