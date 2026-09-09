"""Guard: every dependency in the DEPLOYED manifest has an upper bound (SEC-17).

`requirements.txt` at the repo root is the file Render installs, CI installs,
and pip-audit audits. Render resolves it at BUILD time, and there is no
lockfile, so a bare `>=` floor means the next deploy can pull a major version
nobody has ever run -- and the first place that shows up is production.

That is not hypothetical here. `backend/requirements.txt` still carries those
floors, and on the machine this was written on they resolved to openai 2.36,
stripe 15.1 and supabase 2.30 against production's pinned 1.101, 9.12 and 2.18.
Three majors of drift, in a file a developer is told to install.

An upper bound is not a lockfile and this test does not pretend otherwise. What
it buys is that the blast radius of an unattended resolve is a patch or a minor
rather than a major, which is the difference between a dependency bump and an
outage. A real lock (pip-compile against Python 3.11) is the better answer and
is still open.

Bounded means the spec carries `==`, `<`, `<=` or `~=`. A `>=` floor alone does
not count, and neither does a bare package name.
"""

import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
DEPLOYED = REPO_ROOT / 'requirements.txt'

#: Anything here needs a reason. There is nothing here, and that is the point:
#: the file was fully bounded on 2026-09-03, so the first entry has to be
#: argued for rather than inherited.
UNBOUNDED_ALLOWED: dict = {}

_SPEC = re.compile(r'^\s*([A-Za-z0-9._-]+(?:\[[^\]]+\])?)\s*(.*?)\s*(?:#.*)?$')


def _requirements(path: Path):
    """(name, specifier) for each real requirement line."""
    for raw in path.read_text(encoding='utf-8').splitlines():
        line = raw.strip()
        if not line or line.startswith(('#', '-r', '--')):
            continue
        m = _SPEC.match(line)
        if m:
            yield m.group(1), m.group(2)


def _is_bounded(spec: str) -> bool:
    return any(op in spec for op in ('==', '<', '~='))


def test_every_deployed_requirement_is_bounded_above():
    unbounded = sorted(
        f'{name}{spec}' for name, spec in _requirements(DEPLOYED)
        if not _is_bounded(spec) and name not in UNBOUNDED_ALLOWED
    )
    assert not unbounded, (
        f'{len(unbounded)} unbounded requirement(s) in the deployed manifest:\n  '
        + '\n  '.join(unbounded)
        + '\n\nAdd an upper bound at the next major (e.g. `>=3.5.0,<4`). Render '
          'resolves this file at build time with no lockfile, so an unbounded '
          'spec is a major-version upgrade that happens on a deploy nobody '
          'connected to it.')


def test_the_file_is_actually_being_read():
    """A guard on the guard: a parser that matches nothing passes forever."""
    found = list(_requirements(DEPLOYED))
    assert len(found) > 50, (
        f'Only {len(found)} requirements parsed from {DEPLOYED} -- the parser '
        'or the path is wrong, not the file suddenly empty.')


@pytest.mark.parametrize('spec,bounded', [
    ('==1.2.3', True),
    ('>=1.0,<2', True),
    ('~=1.4', True),
    ('<=2.0', True),
    ('>=1.0', False),
    ('', False),
])
def test_the_detector_agrees_with_the_rule(spec, bounded):
    """Every version of this that regressed did so by matching nothing."""
    assert _is_bounded(spec) is bounded


def _contradictions(deployed: dict, other) -> list:
    """Packages `other` pins at a version the deployed manifest pins differently."""
    out = []
    for name, spec in other:
        pinned = deployed.get(name.lower())
        if pinned and '==' in spec and '==' in pinned and spec != pinned:
            out.append(f'{name}{spec} vs requirements.txt {name}{pinned}')
    return out


def test_the_contradiction_detector_fires_on_the_shape_it_bans():
    """Proven against the real file this rule was written for.

    backend/requirements-test.txt, as it stood before deletion.
    """
    deployed = {'pytest': '==9.0.3', 'pytest-cov': '==7.1.0'}
    was = [('pytest', '==7.4.3'), ('pytest-cov', '==4.1.0'), ('faker', '==20.1.0')]
    assert _contradictions(deployed, was) == [
        'pytest==7.4.3 vs requirements.txt pytest==9.0.3',
        'pytest-cov==4.1.0 vs requirements.txt pytest-cov==7.1.0',
    ]
    # Agreeing, and not-mentioned, are both fine.
    assert _contradictions(deployed, [('pytest', '==9.0.3'), ('faker', '==20.1.0')]) == []
    # A range is not a contradiction: pip can still resolve it.
    assert _contradictions(deployed, [('pytest', '>=7,<10')]) == []


def test_no_second_manifest_contradicts_the_deployed_one():
    """No other requirements file may pin a package at a different version.

    `backend/requirements-test.txt` pinned pytest 7.4.3, pytest-cov 4.1.0 and
    pytest-mock 3.12.0 against the root file's pytest 9.0.3 and pytest-cov
    7.1.0, so `pip install -r requirements.txt -r backend/requirements-test.txt`
    -- the obvious thing to type -- failed to resolve. It was deleted on
    2026-09-09: nothing installed it (no workflow, no script, no doc referenced
    it), and three of its five test plugins were used by no test in the suite.

    This is the same failure as AUDIT.md L1, one directory down: a manifest that
    is documented, divergent and installed by nobody. The rule is not "one
    file"; it is that any additional file must AGREE with the deployed one
    wherever they overlap.
    """
    deployed = {name.lower(): spec for name, spec in _requirements(DEPLOYED)}
    contradictions = []
    skip = {'node_modules', 'venv', '.venv', 'dist', 'build'}
    for other in sorted(REPO_ROOT.glob('**/requirements*.txt')):
        # Dot-directories are other checkouts, not this one: .claude/worktrees/
        # holds sibling worktrees with their own (older) manifests, and a guard
        # that fails on somebody else's branch is a guard people learn to skip.
        if other == DEPLOYED or skip & set(other.parts):
            continue
        if any(part.startswith('.') for part in other.relative_to(REPO_ROOT).parts):
            continue
        if other.parts[-2:] == ('backend', 'requirements.txt'):
            # Deliberately divergent and labelled as such -- see the test below.
            continue
        rel = other.relative_to(REPO_ROOT)
        contradictions += [
            f'{rel}: {c}' for c in _contradictions(deployed, _requirements(other))
        ]

    assert not contradictions, (
        'A second requirements file pins a package the deployed file already '
        'pins, at a different version. Installing both fails pip resolution:\n  '
        + '\n  '.join(contradictions))


def test_the_undeployed_manifest_says_it_is_undeployed():
    """backend/requirements.txt is installed by nobody and must say so.

    It is kept because two years of docs point at it, which makes the header
    the only thing standing between a new developer and a dependency set CI
    never audits and prod never runs (AUDIT.md L1).
    """
    header = (REPO_ROOT / 'backend' / 'requirements.txt').read_text(
        encoding='utf-8')[:1200]
    assert 'NOT INSTALLED BY ANYTHING' in header, (
        'backend/requirements.txt lost the header explaining that nothing '
        'installs it. Either restore it or delete the file.')
