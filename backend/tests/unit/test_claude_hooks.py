"""The repository's Claude Code hooks do what they claim.

These hooks are the mechanical half of Phase 5: rules that used to be prose in
CLAUDE.md, moved into something that refuses rather than advises. That makes
them enforcement code, and enforcement code that has never been executed is the
recurring failure of this whole remediation -- migrate-prod.yml's pending count
returned 0 for any input from the day it was written, and the schema baseline
could not build a database. Both had been committed and described as working.

So the hooks get tested the way the app does: by running them.

Each hook is driven as a subprocess with a real payload on stdin, and asserted
on its exit code, because the exit code is the entire interface:

    0   allow
    2   block, and stderr is what the agent reads
    1   the hook itself broke -- the action proceeds anyway (fail open)

The last one matters as much as the first two. A hook that crashes on a payload
shape it did not expect must not stop somebody working, so there is a test for
a malformed event as well.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
HOOKS = REPO_ROOT / '.claude' / 'hooks'

ALLOW, BLOCK = 0, 2


def run_hook(script: str, event: dict, timeout: int = 120) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(HOOKS / script)],
        input=json.dumps(event),
        capture_output=True,
        text=True,
        timeout=timeout,
        cwd=str(REPO_ROOT),
        env={'CLAUDE_PROJECT_DIR': str(REPO_ROOT), 'PATH': _path()},
    )


def _path() -> str:
    import os
    return os.environ.get('PATH', '/usr/bin:/bin')


def bash(command: str) -> dict:
    return {'tool_name': 'Bash', 'session_id': 'pytest', 'tool_input': {'command': command}}


def test_hook_scripts_exist():
    """A missing script is a silently disarmed gate, which is the worst state."""
    for name in ('guard_bash.py', 'fast_gate.py', 'related_tests.py', '_common.py'):
        assert (HOOKS / name).exists(), f'{name} is missing from .claude/hooks/'


def test_settings_registers_every_hook():
    settings = json.loads((REPO_ROOT / '.claude' / 'settings.json').read_text(encoding='utf-8'))
    commands = json.dumps(settings.get('hooks', {}))
    for script in ('guard_bash.py', 'fast_gate.py', 'related_tests.py'):
        assert script in commands, (
            f'{script} exists but .claude/settings.json does not run it. '
            'An unregistered hook is a rule nobody enforces and everybody believes.'
        )
    events = set(settings.get('hooks', {}))
    assert {'PreToolUse', 'PostToolUse', 'Stop'} <= events


# --------------------------------------------------------------------------
# guard_bash.py
# --------------------------------------------------------------------------

# The 2026-08-14 incident: a parallel session reset the tree and took a
# half-finished feature and a security fix with it, from two other sessions.
DESTRUCTIVE = [
    'git reset --hard origin/main',
    'git reset --hard',
    'git checkout -- backend/app.py',
    'git checkout .',
    'git restore web/src/App.jsx',
    'git stash',
    'git stash push -m wip',
    'git clean -fd',
    'killall node',
    'pkill -f node',
]

# CLAUDE.md rule 12: stage the files you touched, not everybody's.
BROAD_STAGING = [
    'git add -A',
    'git add --all',
    'git add .',
    'git commit -am "wip"',
    'git commit -a -m "wip"',
]

# Ordinary work that must not be blocked. Half the value of a gate is what it
# lets through: one false refusal on a command somebody needs and the whole
# hook gets deleted.
ALLOWED = [
    'git status',
    'git add backend/app.py web/src/App.jsx',
    'git commit -m "Fix the thing"',
    'git checkout -b tooling/remediation-2026-09-phase5',
    'git checkout develop',
    'git restore --staged web/src/App.jsx',
    'git push origin develop',
    'lsof -tnP -iTCP:3000 -sTCP:LISTEN | xargs kill',
    'npm run test:run',
    'cd backend && pytest -q',
    # Read-only members of two otherwise-banned families. Found by the hook
    # refusing `git stash list` during the phase that added it: asking what is
    # stashed is how you discover somebody else's work is sitting in one, and
    # `git clean -n` only prints what would go.
    'git stash list',
    'git stash show -p',
    'git clean -n',
    'git clean --dry-run -d',
]


@pytest.mark.parametrize('command', DESTRUCTIVE)
def test_destructive_git_is_refused(command):
    result = run_hook('guard_bash.py', bash(command))
    assert result.returncode == BLOCK, f'{command!r} was allowed through'
    assert 'BLOCKED' in result.stderr


@pytest.mark.parametrize('command', BROAD_STAGING)
def test_broad_staging_is_refused(command):
    result = run_hook('guard_bash.py', bash(command))
    assert result.returncode == BLOCK, f'{command!r} was allowed through'


@pytest.mark.parametrize('command', ALLOWED)
def test_ordinary_commands_are_allowed(command):
    result = run_hook('guard_bash.py', bash(command))
    assert result.returncode == ALLOW, (
        f'{command!r} was refused, and it should not have been:\n{result.stderr}'
    )


def test_destructive_git_has_no_override():
    """The override is for the release gate, not for discarding other people's work."""
    result = run_hook('guard_bash.py', bash('OPTIO_HOOK_OVERRIDE=1 git clean -fd'))
    assert result.returncode == BLOCK


def test_emoji_in_a_commit_message_is_refused():
    result = run_hook('guard_bash.py', bash('git commit -m "Ship the thing \U0001F680"'))
    assert result.returncode == BLOCK
    assert 'emoji' in result.stderr.lower()


def test_arrows_and_dashes_in_a_commit_message_are_allowed():
    """The emoji check must not fire on ordinary punctuation."""
    result = run_hook('guard_bash.py', bash('git commit -m "Rename frontend -> web, per QF-01"'))
    assert result.returncode == ALLOW, result.stderr


def test_a_commit_message_may_describe_a_banned_command():
    """Found by this hook refusing its own first commit.

    The commit that introduced guard_bash.py explains, in its message, what a
    hard reset did to two sessions' work on 2026-08-14. The hook read the
    message as a command and refused it. A gate that makes its own reason
    undocumentable loses the reason first and then the rule.
    """
    message = (
        'Make the rules refuse instead of advise\n\n'
        'Rule 11 exists because a session ran `git reset --hard` on a shared '
        'tree and took two other sessions\' uncommitted work with it. '
        'git stash and git clean have the same shape.'
    )
    result = run_hook('guard_bash.py', bash(f'git commit -m "{message}"'))
    assert result.returncode == ALLOW, result.stderr


def test_a_heredoc_commit_message_may_describe_a_banned_command():
    command = (
        "git commit -F - <<'MSG'\n"
        'Document the 2026-08-14 incident\n\n'
        'git reset --hard, git stash and git clean are all off the table now.\n'
        'MSG'
    )
    result = run_hook('guard_bash.py', bash(command))
    assert result.returncode == ALLOW, result.stderr


def test_a_heredoc_with_a_chained_command_on_the_marker_line():
    """The second false positive: `<<'MSG' && git log` is how these get written.

    The first fix required a newline straight after the heredoc marker, so a
    marker line with anything chained onto it -- which is the common shape --
    left the whole body in the scan and the commit was refused again.
    """
    command = (
        "git commit -q -F - <<'MSG' && git log --oneline -1\n"
        'Three hooks\n\n'
        'It refuses killall node and pkill node, and the destructive git family.\n'
        'MSG'
    )
    result = run_hook('guard_bash.py', bash(command))
    assert result.returncode == ALLOW, result.stderr


def test_a_real_command_after_a_heredoc_is_still_refused():
    """Stripping the message body must not strip what follows it."""
    command = (
        "git commit -F - <<'MSG'\n"
        'A perfectly ordinary message\n'
        'MSG\n'
        'git clean -fd'
    )
    result = run_hook('guard_bash.py', bash(command))
    assert result.returncode == BLOCK


def test_push_to_main_stops_for_confirmation():
    result = run_hook('guard_bash.py', bash('git push origin main'))
    assert result.returncode == BLOCK
    assert 'production release' in result.stderr


def test_push_to_main_proceeds_once_confirmed():
    result = run_hook('guard_bash.py', bash('OPTIO_HOOK_OVERRIDE=1 git push origin main'))
    assert result.returncode == ALLOW, result.stderr


def test_force_push_stops_for_confirmation():
    result = run_hook('guard_bash.py', bash('git push --force origin develop'))
    assert result.returncode == BLOCK
    assert 'Force-pushing' in result.stderr


def test_malformed_event_fails_open():
    """A hook that cannot parse its input must not stop the session."""
    result = subprocess.run(
        [sys.executable, str(HOOKS / 'guard_bash.py')],
        input='not json at all',
        capture_output=True,
        text=True,
        timeout=60,
        cwd=str(REPO_ROOT),
        env={'CLAUDE_PROJECT_DIR': str(REPO_ROOT), 'PATH': _path()},
    )
    assert result.returncode == ALLOW


def test_other_tools_are_ignored():
    result = run_hook('guard_bash.py', {'tool_name': 'Read', 'tool_input': {'file_path': 'x'}})
    assert result.returncode == ALLOW


# --------------------------------------------------------------------------
# fast_gate.py
# --------------------------------------------------------------------------


def _edit_event(path: Path) -> dict:
    return {
        'tool_name': 'Edit',
        'session_id': 'pytest-fast-gate',
        'tool_input': {'file_path': str(path)},
    }


@pytest.fixture(autouse=True)
def _clean_hook_state():
    """Every fast_gate run records a touched file. Do not leave ours behind.

    The state directory is gitignored, so a leftover is invisible in `git
    status` and accumulates quietly -- and a stale file named after a test run
    is exactly the sort of thing that costs somebody twenty minutes later.
    """
    yield
    for name in ('pytest-fast-gate', 'pytest-state-probe', 'pytest', 'pytest-empty', 'pytest-loop'):
        (REPO_ROOT / '.claude' / 'state' / f'{name}.touched').unlink(missing_ok=True)


def test_fast_gate_catches_an_undefined_name(tmp_path_factory):
    """The bug class this exists for: Python finds it only when a request lands.

    Four of these were live in production on 2026-09-02, each reading as some
    other sort of 500.
    """
    target = REPO_ROOT / 'backend' / 'scripts' / '_fast_gate_probe.py'
    target.write_text('def handler():\n    return jsonify({})\n', encoding='utf-8')
    try:
        result = run_hook('fast_gate.py', _edit_event(target))
        assert result.returncode == BLOCK, result.stdout + result.stderr
        assert 'undefined name' in result.stderr
    finally:
        target.unlink(missing_ok=True)


def test_fast_gate_passes_clean_python(tmp_path_factory):
    target = REPO_ROOT / 'backend' / 'scripts' / '_fast_gate_probe_ok.py'
    target.write_text('import json\n\n\ndef handler():\n    return json.dumps({})\n', encoding='utf-8')
    try:
        result = run_hook('fast_gate.py', _edit_event(target))
        assert result.returncode == ALLOW, result.stderr
    finally:
        target.unlink(missing_ok=True)


def test_fast_gate_ignores_files_outside_the_repo(tmp_path):
    stray = tmp_path / 'whatever.py'
    stray.write_text('return nonsense\n', encoding='utf-8')
    result = run_hook('fast_gate.py', _edit_event(stray))
    assert result.returncode == ALLOW


def test_fast_gate_records_what_it_saw():
    """The Stop hook depends on this list; if it is not written, nothing runs."""
    sys.path.insert(0, str(HOOKS))
    try:
        import _common  # noqa: PLC0415
    finally:
        sys.path.pop(0)
    target = REPO_ROOT / 'backend' / 'scripts' / '_fast_gate_probe_state.py'
    target.write_text('x = 1\n', encoding='utf-8')
    event = _edit_event(target)
    event['session_id'] = 'pytest-state-probe'
    state = _common.STATE_DIR / 'pytest-state-probe.touched'
    try:
        run_hook('fast_gate.py', event)
        assert state.exists(), 'fast_gate did not record the touched file'
        assert 'backend/scripts/_fast_gate_probe_state.py' in state.read_text(encoding='utf-8')
    finally:
        target.unlink(missing_ok=True)
        state.unlink(missing_ok=True)


# --------------------------------------------------------------------------
# related_tests.py
# --------------------------------------------------------------------------


def test_stop_hook_maps_a_module_to_its_tests():
    sys.path.insert(0, str(HOOKS))
    try:
        import related_tests  # noqa: PLC0415
    finally:
        sys.path.pop(0)

    mapped = related_tests.backend_tests_for(Path('backend/utils/sis_roles.py'))
    assert any('sis_role' in str(p) or 'sis' in str(p) for p in mapped), mapped

    itself = related_tests.backend_tests_for(Path('backend/tests/unit/test_claude_hooks.py'))
    assert itself == {Path('backend/tests/unit/test_claude_hooks.py')}


def test_stop_hook_does_nothing_without_a_touched_list():
    result = run_hook('related_tests.py', {'session_id': 'pytest-empty', 'hook_event_name': 'Stop'})
    assert result.returncode == ALLOW


def test_stop_hook_does_not_loop():
    """stop_hook_active means we are already the reason Claude is still going."""
    result = run_hook(
        'related_tests.py',
        {'session_id': 'pytest-loop', 'hook_event_name': 'Stop', 'stop_hook_active': True},
    )
    assert result.returncode == ALLOW
