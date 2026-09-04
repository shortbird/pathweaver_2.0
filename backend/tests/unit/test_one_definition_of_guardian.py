"""Guard: the guardian-relationship tuple has one definition (QB-04 follow-up).

`('guardian', 'other')` decides who counts as a guardian of the students in a
household. It gates parent context, Schedule Builder, the attendance sweep's
notification list, and who a bill is addressed to. It had SEVEN copies.

Two of them were already named constants that this plan merged into
`config.constants.GUARDIAN_RELATIONSHIPS`; the other five were the bare tuple
written inline, and they are the reason this test exists. A copy is not a style
problem here. The 'other' member is the one that drifts: the registration funnel
writes it for a guardian who is not the parent -- a grandparent, an aunt -- and
any copy that forgets it silently locks those families out of their own
children's schedules, on some screens but not others. That is a support ticket
nobody can reproduce, not a crash.

So: import the constant. Do not retype the tuple.
"""

from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
SCAN_DIRS = ('routes', 'services', 'repositories', 'utils', 'jobs', 'middleware')

#: The one file allowed to spell it out.
CANONICAL = Path('config') / 'constants.py'

#: Every way the tuple has actually been written in this repo. Checked against
#: normalised source so quoting and inner spacing cannot smuggle a copy past.
LITERALS = ("('guardian','other')", '("guardian","other")')


def _normalise(line: str) -> str:
    return line.replace(' ', '').replace('\t', '')


def _offenders():
    for directory in SCAN_DIRS:
        for path in sorted((BACKEND / directory).glob('**/*.py')):
            if '__pycache__' in path.parts:
                continue
            if path.relative_to(BACKEND) == CANONICAL:
                continue
            for i, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
                if line.strip().startswith('#'):
                    continue
                flat = _normalise(line)
                if any(lit in flat for lit in LITERALS):
                    yield f'{path.relative_to(BACKEND)}:{i}'


def test_nobody_retypes_the_guardian_tuple():
    offenders = sorted(_offenders())
    assert not offenders, (
        f'{len(offenders)} inline copies of the guardian tuple:\n  '
        + '\n  '.join(offenders)
        + "\n\nImport the shared one instead:\n"
          "    from config.constants import GUARDIAN_RELATIONSHIPS\n"
          "A copy that drops 'other' locks grandparents and other non-parent "
          "guardians out of their own children's records, on that screen only.")


def test_the_detector_catches_a_planted_copy():
    """A guard that cannot fail is decoration. Prove it sees each spelling."""
    for lit in LITERALS:
        assert any(lit in _normalise(sample) for sample in (
            "    ids = [m for m in members if m['rel'] in ('guardian', 'other')]",
            '    ids = [m for m in members if m["rel"] in ("guardian", "other")]',
        )), f'{lit} matches nothing a developer would actually type'


def test_the_constant_still_says_what_the_guard_assumes():
    from config.constants import GUARDIAN_RELATIONSHIPS
    assert 'other' in GUARDIAN_RELATIONSHIPS, (
        "GUARDIAN_RELATIONSHIPS dropped 'other'. If that is deliberate, the "
        'registration funnel stops writing it first -- otherwise every '
        'non-parent guardian loses access at once, everywhere, which is worse '
        'than the drift this test was written to stop.')


def test_the_scan_is_looking_at_real_files():
    scanned = [p for d in SCAN_DIRS for p in (BACKEND / d).glob('**/*.py')
               if '__pycache__' not in p.parts]
    assert len(scanned) > 300, (
        f'Only {len(scanned)} files scanned -- the glob is wrong.')
