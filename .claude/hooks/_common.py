"""Shared plumbing for the repository's Claude Code hooks.

The hooks are the mechanical half of what CLAUDE.md used to ask for in prose.
Prose asks; a hook refuses. Everything in here exists to keep the three hook
scripts short and to make them fail *open* -- a hook that crashes must never
stop somebody working, so every helper returns something usable rather than
raising.

Hook contract, as used here:

  PreToolUse   exit 2 blocks the tool call; stderr is shown to the agent.
  PostToolUse  exit 2 does not undo the edit, but stderr is fed back to the
               agent, which is what makes it self-correct.
  Stop         exit 2 refuses the stop and feeds stderr back as the reason.

Anything other than 0 or 2 is a non-blocking error: it surfaces in the
transcript and work continues. That is the right disposition for a hook that
breaks, so unexpected exceptions are caught and reported as exit 1.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

#: Set by Claude Code for every hook command. Falls back to walking up from
#: this file, so the hooks also work when run by hand for testing.
PROJECT_DIR = Path(
    os.environ.get('CLAUDE_PROJECT_DIR') or Path(__file__).resolve().parents[2]
)

#: Where a session records which files it has touched, so the Stop hook can
#: run the tests that belong to them. One file per session, gitignored.
STATE_DIR = PROJECT_DIR / '.claude' / 'state'

# Directories no hook should ever lint, test or read.
SKIP_PARTS = {
    'node_modules', 'venv', '.venv', '__pycache__', 'dist', 'build',
    'coverage', '.git', '.expo', 'ios', 'android',
}


def read_event() -> dict:
    """The hook payload on stdin. An unparseable payload is an empty event."""
    try:
        raw = sys.stdin.read()
    except Exception:
        return {}
    if not raw.strip():
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def project_relative(path: str | Path) -> Path | None:
    """`path` relative to the repo root, or None if it is outside the repo.

    Hooks fire for every edit in the session, including ones in another
    worktree or in a scratch directory. Those are not ours to check.
    """
    try:
        resolved = Path(path).resolve()
    except Exception:
        return None
    try:
        rel = resolved.relative_to(PROJECT_DIR.resolve())
    except ValueError:
        return None
    if SKIP_PARTS & set(rel.parts):
        return None
    return rel


def venv_bin(name: str) -> str:
    """Prefer the repo's venv for a tool, fall back to whatever is on PATH.

    The backend venv is where ruff, pyflakes and pytest actually live on this
    machine. A hook that shelled out to a bare `ruff` would silently do nothing
    on a machine where it is only installed in the venv, and a lint gate that
    silently does nothing is worse than no lint gate.
    """
    candidate = PROJECT_DIR / 'venv' / 'bin' / name
    return str(candidate) if candidate.exists() else name


def run(cmd: list[str], cwd: Path | None = None, timeout: int = 120) -> tuple[int, str]:
    """Run `cmd`, returning (exit code, combined output). Never raises."""
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(cwd or PROJECT_DIR),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return 124, f'timed out after {timeout}s: {" ".join(cmd)}'
    except FileNotFoundError:
        return 127, f'not found: {cmd[0]}'
    except Exception as exc:  # pragma: no cover - defensive
        return 1, f'{type(exc).__name__}: {exc}'
    return proc.returncode, (proc.stdout or '') + (proc.stderr or '')


def state_file(event: dict, suffix: str = 'touched') -> Path:
    session = str(event.get('session_id') or 'unknown').replace('/', '_')[:64]
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    return STATE_DIR / f'{session}.{suffix}'


def record_touched(event: dict, rel: Path) -> None:
    """Append a touched file to this session's list, deduped, capped."""
    path = state_file(event)
    try:
        existing = path.read_text(encoding='utf-8').splitlines() if path.exists() else []
    except Exception:
        existing = []
    line = str(rel)
    if line in existing:
        return
    existing.append(line)
    # A session that touches hundreds of files is a bulk rewrite; the Stop hook
    # caps what it runs anyway, and an unbounded list only costs memory.
    try:
        path.write_text('\n'.join(existing[-400:]) + '\n', encoding='utf-8')
    except Exception:
        pass


def block(message: str) -> None:
    """Refuse, with a reason the agent will read. Exits."""
    sys.stderr.write(message.rstrip() + '\n')
    sys.exit(2)


def allow() -> None:
    sys.exit(0)
