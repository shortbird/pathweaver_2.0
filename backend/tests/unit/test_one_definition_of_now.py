"""Guard: nobody redefines "now" (QB-02).

`_now_iso()` existed in 35 modules, and the copies had diverged: 32 returned an
aware UTC timestamp and 3 returned a naive one via `datetime.utcnow()`. That is
not a style problem. `datetime.utcnow()` is deprecated from Python 3.12, and
comparing a naive timestamp with an aware one raises TypeError -- so the bug
lands as a crash in whichever code path first mixes a goal's timestamp with
anything else's, a long way from the module that made it.

`utils/timestamps.now_iso()` is the definition. Modules alias it, so call sites
did not have to change:

    from utils.timestamps import now_iso as _now_iso

WHAT THIS DOES NOT BAN: `datetime.now(timezone.utc)` inline. Plenty of code
needs a datetime rather than a string, and forcing every one of those through a
helper would be ceremony. The rule is narrower and matches the actual failure:
do not define a MODULE-LEVEL `_now`/`_now_iso` of your own.
"""

import ast
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
SCAN_DIRS = ('routes', 'services', 'repositories', 'utils', 'jobs', 'middleware', 'scripts')
BANNED_NAMES = {'_now', '_now_iso', 'now_iso', '_utcnow'}

#: The one file allowed to define them.
CANONICAL = Path('utils') / 'timestamps.py'


def _offenders():
    for directory in SCAN_DIRS:
        for path in sorted((BACKEND / directory).glob('**/*.py')):
            if '__pycache__' in path.parts:
                continue
            if path.relative_to(BACKEND) == CANONICAL:
                continue
            try:
                tree = ast.parse(path.read_text(encoding='utf-8'))
            except SyntaxError:
                continue
            for node in tree.body:  # module level only
                if (isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
                        and node.name in BANNED_NAMES):
                    yield f'{path.relative_to(BACKEND)}:{node.lineno} def {node.name}()'


def test_only_utils_timestamps_defines_now():
    offenders = sorted(_offenders())
    assert not offenders, (
        f'{len(offenders)} module(s) define their own now():\n  '
        + '\n  '.join(offenders)
        + '\n\nAlias the shared one instead:\n'
          '    from utils.timestamps import now_iso as _now_iso\n'
          'The 35 copies this replaced had already drifted -- three returned a '
          'naive datetime.utcnow(), which cannot be compared with the aware '
          'timestamps everything else writes.')


#: `datetime.utcnow()` calls in app code, measured 2026-09-03. A RATCHET, not a
#: ban: there are 449 of them and converting all of them is a separate piece of
#: work with its own risk -- a naive timestamp written into a `timestamptz`
#: column is read back correctly today, so this is latent, not broken. What must
#: not happen is the number going UP, because 3.12 deprecated the call and every
#: new one is another place that will need changing when it is removed.
UTCNOW_BASELINE = 449


def _utcnow_calls():
    for directory in SCAN_DIRS:
        for path in sorted((BACKEND / directory).glob('**/*.py')):
            if '__pycache__' in path.parts:
                continue
            for i, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
                if line.strip().startswith('#'):
                    continue
                if 'datetime.utcnow()' in line:
                    yield f'{path.relative_to(BACKEND)}:{i}'


def test_deprecated_utcnow_does_not_spread():
    """`datetime.utcnow()` returns a LYING datetime: naive, but holding UTC.
    Comparing one with an aware datetime raises TypeError rather than sorting
    wrong, which is why the three copies this item merged mattered.

    Ratchet DOWN as code is converted; never up.
    """
    found = sorted(_utcnow_calls())
    assert len(found) <= UTCNOW_BASELINE, (
        f'{len(found)} calls to datetime.utcnow(), baseline {UTCNOW_BASELINE}. '
        'Use utils.timestamps.utcnow(), which is timezone-aware. New ones at:\n  '
        + '\n  '.join(found[UTCNOW_BASELINE:]))


def test_the_utcnow_baseline_is_not_stale_by_a_mile():
    """If the count has fallen well below the baseline, lower it -- a ratchet
    that never tightens is a number, not a ratchet."""
    found = list(_utcnow_calls())
    assert len(found) > UTCNOW_BASELINE - 60, (
        f'Only {len(found)} utcnow() calls against a baseline of '
        f'{UTCNOW_BASELINE}. Lower UTCNOW_BASELINE to {len(found)}.')


def test_the_scan_is_looking_at_real_files():
    scanned = [p for d in SCAN_DIRS for p in (BACKEND / d).glob('**/*.py')
               if '__pycache__' not in p.parts]
    assert len(scanned) > 300, (
        f'Only {len(scanned)} files scanned -- the glob is wrong.')
