"""Two rules about seeding `user_skill_xp`, and why the second one is the scary one.

`user_skill_xp.pillar` holds a pillar KEY -- 'art', 'stem', 'communication',
'civics', 'wellness'. Every reader looks it up that way.

Six code paths seeded a new account's five zero rows with the pre-2025 DISPLAY
names instead ('Arts & Creativity', 'STEM & Logic'): email registration, the
login path, Google OAuth, both bulk-import routes, the org-courses student
create, and the roster import. There is no CHECK constraint on that column, so
every write succeeded and returned 200. By 2026-09-09 production held 2,850 such
rows across 570 students -- more wrong-shaped rows than right-shaped ones in the
whole table. No XP was lost, because all of them are seeded at zero; the seeding
simply never did its job, and a student who earned anything quietly grew a
second, correct set of rows beside the dead ones.

THE TRAP. The obvious fix is one line per site: swap the names for the keys.
Doing only that would have been a data-loss incident. Those writes are
`upsert(..., on_conflict='user_id,pillar')` carrying `xp_amount: 0`, and a
PostgREST upsert OVERWRITES on conflict -- the comment above one of them said
"ignore conflicts (if they already exist)", which is what the author believed
and not what the call does. `ensure_user_diploma_and_skills` runs on EVERY
successful login (routes/auth/login/core.py). So the moment the pillar names
started matching the real rows, every returning student's five balances would
have been reset to zero on their next sign-in.

It was safe only by accident: the wrong names never collided, so the overwrite
never had anything to overwrite. Correcting the names is precisely what would
have armed it.

So the two tests below are a pair, and the second is the one that must never be
deleted:

  1. seeding writes keys, not display names
  2. any seeding upsert is ON CONFLICT DO NOTHING (`ignore_duplicates=True`)

Rule 2 is what makes rule 1 safe. Cleanup of the 2,850 existing rows is a
separate, data-side decision -- see docs/remediation-2026-09/PHASE_2_SHARED_HANDOFF.md.
"""

import ast
from pathlib import Path

from generated.pillars import PILLAR_KEYS, PILLAR_LEGACY_DISPLAY_NAMES

BACKEND = Path(__file__).resolve().parents[2]

LEGACY_NAMES = set(PILLAR_LEGACY_DISPLAY_NAMES.values())

SCAN_DIRS = ('routes', 'services', 'repositories', 'utils', 'jobs')

TABLE = 'user_skill_xp'


def _app_modules():
    for rel_dir in SCAN_DIRS:
        base = BACKEND / rel_dir
        if not base.is_dir():
            continue
        for py in sorted(base.rglob('*.py')):
            if '__pycache__' in py.parts:
                continue
            source = py.read_text(encoding='utf-8')
            try:
                tree = ast.parse(source)
            except SyntaxError:
                continue
            yield py.relative_to(BACKEND).as_posix(), source, tree


def test_roster_import_seeds_pillar_keys():
    from services.roster_import_service import PILLARS

    assert set(PILLARS) == set(PILLAR_KEYS), (
        f'roster_import_service.PILLARS is {PILLARS}. user_skill_xp.pillar holds '
        'pillar keys; seeding anything else writes rows no reader will ever find.')


def test_nothing_builds_the_five_legacy_pillar_names_as_a_list():
    """The exact shape that shipped six times, and only that shape.

    A list literal of all five pre-2025 display names has one use in this
    codebase -- seeding pillar rows -- and it is always wrong. Matching the
    shape rather than the individual strings is what keeps this precise:
    routes/quest/completion.py and services/portfolio_service.py both spell
    'Arts & Creativity' as a single display fallback and both mention this
    table, so any coarser rule would flag them and get itself switched off.
    """
    offenders = []
    for rel, source, tree in _app_modules():
        # Scoped to modules that touch this table. utils/quest_validation.py
        # keeps its own list of the legacy names to score a quest against, in a
        # class nothing constructs -- stale, but not a write to user_skill_xp,
        # and not this test's business.
        if TABLE not in source:
            continue
        for node in ast.walk(tree):
            if not isinstance(node, (ast.List, ast.Tuple, ast.Set)):
                continue
            values = {e.value for e in node.elts
                      if isinstance(e, ast.Constant) and isinstance(e.value, str)}
            if LEGACY_NAMES.issubset(values):
                offenders.append(f'{rel}:{node.lineno}')

    assert not offenders, (
        'These build the pre-2025 pillar display names as a list. '
        'user_skill_xp.pillar takes a key -- use generated.pillars.PILLAR_KEYS:\n  '
        + '\n  '.join(offenders))


def _seeding_upserts():
    """Every `.upsert(...)` on user_skill_xp whose payload writes xp_amount 0.

    The zero is the discriminator, and it is what makes this test precise
    enough to keep. scripts/repair_missing_xp.py upserts a CORRECTED balance
    into the same table and must keep overwriting -- that is the entire point
    of a repair script. It writes fix['expected'], not 0, so it is not a
    seeding call and never appears here.
    """
    for rel, _source, tree in _app_modules():
        # The payload is a local variable at four of the seven sites
        # (`skill_records`, `skills_to_insert`), so the zero is not inside the
        # call. Ask the enclosing function instead: a function that both builds
        # xp_amount-0 rows and upserts this table is a seeding site.
        for scope in ast.walk(tree):
            if not isinstance(scope, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Module)):
                continue
            scope_src = ast.unparse(scope)
            if "'xp_amount': 0" not in scope_src:
                continue
            for node in ast.walk(scope):
                if not isinstance(node, ast.Call) or getattr(node.func, 'attr', None) != 'upsert':
                    continue
                if f"'{TABLE}'" not in ast.unparse(node.func):
                    continue
                ignores = any(
                    kw.arg == 'ignore_duplicates'
                    and isinstance(kw.value, ast.Constant)
                    and kw.value.value is True
                    for kw in node.keywords
                )
                yield rel, node.lineno, ignores


def test_every_zero_seeding_upsert_ignores_conflicts():
    found = list(_seeding_upserts())
    destructive = [f'{rel}:{line}' for rel, line, ignores in found if not ignores]

    assert not destructive, (
        'These seed user_skill_xp with xp_amount 0 through an upsert that '
        'OVERWRITES on conflict. Seeding runs on login, so this resets a real '
        "balance to zero. Pass ignore_duplicates=True:\n  "
        + '\n  '.join(destructive))


def test_the_seeding_scan_still_finds_call_sites():
    """A guard on the guard.

    The assertion above passes trivially over an empty scan, and the scan keys
    off a table name and a literal payload -- both of which a refactor can move
    out of reach without anyone noticing the test went quiet.
    """
    assert len(list(_seeding_upserts())) >= 5, (
        'Fewer than five zero-seeding upserts found. The scan is probably broken '
        '(renamed table, payload built elsewhere) rather than the seeding paths '
        'having genuinely gone away.')
