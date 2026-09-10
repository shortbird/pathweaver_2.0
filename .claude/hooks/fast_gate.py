#!/usr/bin/env python3
"""PostToolUse gate on Edit/Write/MultiEdit. Lints the one file that changed.

The full suites take about two minutes each, which is far too slow to run on
every edit and far too fast to be worth skipping at the end. So the per-edit
gate is per-file and per-tool, and the Stop hook (related_tests.py) runs the
tests that belong to the files a session touched.

What runs, by file type:

  backend/**.py       ruff (the CI ruleset, from ruff.toml) and pyflakes
                      filtered to undefined names. CI gates both, and the
                      pyflakes half exists because Python only discovers a
                      missing import when a request reaches that line: four
                      such bugs were live in production on 2026-09-02, each
                      reading as some other kind of 500.
  other **.py         pyflakes only. Scripts are not in the ruff gate.
  web/**, mobile/**   eslint, compared against the same file at HEAD.
  mobile/**.ts(x)     tsc --noEmit over the mobile project (~3s, and it is
                      clean today, so any error belongs to this edit).

Why eslint is compared against HEAD rather than asserted at zero: the web app
has 292 pre-existing eslint errors and 2,183 warnings (CI-03 ratchets them in
eslintRatchet.test.js). Blocking on the absolute count would fire on almost
every file and teach the agent to ignore this hook. Blocking on an *increase*
is the same ratchet discipline the test suite uses, one file at a time.

Warnings never block. Errors block, and stderr is what the agent reads.

Fails open: if a tool is missing or this script raises, the edit stands.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _common import (  # noqa: E402
    PROJECT_DIR,
    allow,
    block,
    project_relative,
    read_event,
    record_touched,
    run,
    venv_bin,
)

JS_SUFFIXES = {'.js', '.jsx', '.ts', '.tsx'}

# pyflakes reports plenty of style noise (unused imports, f-strings with no
# placeholder) -- about 1,200 findings, deliberately not gated. These three are
# the ones that are always a bug at runtime.
PYFLAKES_FATAL = re.compile(
    r'undefined name|referenced before assignment|invalid syntax'
)


def check_python(rel: Path) -> list[str]:
    problems: list[str] = []
    target = str(PROJECT_DIR / rel)

    if rel.parts[0] == 'backend':
        code, out = run([venv_bin('ruff'), 'check', target], timeout=60)
        if code not in (0, 127) and out.strip():
            problems.append('ruff:\n' + out.strip())

    code, out = run([venv_bin('python'), '-m', 'pyflakes', target], timeout=60)
    if code == 127:
        return problems
    fatal = [ln for ln in out.splitlines() if PYFLAKES_FATAL.search(ln)]
    if fatal:
        problems.append('pyflakes (these are runtime errors, not style):\n' + '\n'.join(fatal))
    return problems


def _eslint_binary(app_dir: Path) -> list[str]:
    local = app_dir / 'node_modules' / '.bin' / 'eslint'
    if local.exists():
        return [str(local)]
    return ['npx', '--no-install', 'eslint']


def _eslint_errors(app_dir: Path, target: str) -> tuple[int, str]:
    """(error count, readable messages) for one file. Warnings are ignored."""
    code, out = run(
        _eslint_binary(app_dir) + ['--format', 'json', target],
        cwd=app_dir,
        timeout=120,
    )
    if code == 127 or not out.strip():
        return 0, ''
    # eslint prints the JSON array last; anything npx says comes first.
    start = out.find('[')
    if start < 0:
        return 0, ''
    try:
        report = json.loads(out[start:])
    except json.JSONDecodeError:
        return 0, ''
    count = 0
    lines: list[str] = []
    for entry in report:
        for message in entry.get('messages', []):
            if message.get('severity') != 2:
                continue
            count += 1
            lines.append(
                f"  {message.get('line', '?')}:{message.get('column', '?')} "
                f"{message.get('message', '')} ({message.get('ruleId') or 'syntax'})"
            )
    return count, '\n'.join(lines[:20])


def check_javascript(rel: Path) -> list[str]:
    app = rel.parts[0]
    app_dir = PROJECT_DIR / app
    if not (app_dir / 'eslint.config.js').exists():
        return []

    target = str(PROJECT_DIR / rel)
    now, detail = _eslint_errors(app_dir, target)
    if now == 0:
        return []

    # How many errors did this file have before the session touched it? A file
    # that is new to git has no `before`, so every error in it is this edit's.
    #
    # The baseline copy is written NEXT TO the real file rather than in a temp
    # directory: eslint resolves both its config and its per-directory overrides
    # from the file's path, so a copy linted somewhere else would be linted by a
    # different rule set and the comparison would be meaningless.
    code, head_source = run(['git', 'show', f'HEAD:{rel}'], timeout=20)
    before = 0
    if code == 0:
        baseline_path = (PROJECT_DIR / rel).with_name(
            f'{rel.stem}.eslint-baseline-{os.getpid()}{rel.suffix}'
        )
        try:
            baseline_path.write_text(head_source, encoding='utf-8')
            before, _ = _eslint_errors(app_dir, str(baseline_path))
        except Exception:
            return []
        finally:
            baseline_path.unlink(missing_ok=True)

    if now <= before:
        return []
    return [
        f'eslint: {now} errors in this file, {before} before the edit '
        f'(+{now - before}).\n{detail}'
    ]


def check_mobile_types() -> list[str]:
    code, out = run(['npx', '--no-install', 'tsc', '--noEmit'], cwd=PROJECT_DIR / 'mobile', timeout=180)
    if code in (0, 127):
        return []
    errors = [ln for ln in out.splitlines() if re.search(r'error TS\d+', ln)]
    if not errors:
        return []
    return ['tsc --noEmit (mobile):\n' + '\n'.join(errors[:20])]


def main() -> None:
    event = read_event()
    if event.get('tool_name') not in {'Edit', 'Write', 'MultiEdit', 'NotebookEdit'}:
        allow()

    tool_input = event.get('tool_input') or {}
    raw_path = tool_input.get('file_path') or tool_input.get('notebook_path')
    if not raw_path:
        allow()

    rel = project_relative(raw_path)
    if rel is None or not (PROJECT_DIR / rel).exists():
        allow()

    record_touched(event, rel)

    problems: list[str] = []
    if rel.suffix == '.py':
        problems = check_python(rel)
    elif rel.suffix in JS_SUFFIXES:
        problems = check_javascript(rel)
        if rel.parts[0] == 'mobile' and rel.suffix in {'.ts', '.tsx'}:
            problems += check_mobile_types()

    if problems:
        block(
            f'{rel} does not pass the fast gate (.claude/hooks/fast_gate.py).\n\n'
            + '\n\n'.join(problems)
            + '\n\nCI gates all of these. Fix them now, while the change is in front of you.'
        )
    allow()


if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:  # pragma: no cover - fail open, loudly
        sys.stderr.write(f'fast_gate hook error (edit stands): {exc}\n')
        sys.exit(1)
