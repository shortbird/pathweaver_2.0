"""Guard: teacher-reachable SIS routes that read class data apply class_scope.

`sis_service.class_scope(user_id, org_id)` is a MANUAL call (None = admin-wide,
else the advisor's class ids), and forgetting it in a STAFF_ROLES route reads
org-wide — the exact bug class ARCHITECTURE_BLOCKS §4.6 exists to end. Until
scoping moves into the repository layer, this test is the tripwire: any
routes/sis module that both admits teachers (STAFF_ROLES) and touches
class-scoped data sources must call class_scope, or sit on the allowlist
below WITH a reason.

The inventory also pins today's per-file call counts so a refactor that
silently drops a site fails here instead of shipping an org-wide read.

STAFF_PATTERN below only works because `STAFF_ROLES` in a routes/sis module
means the staff tier. Until 2026-09-10 seven modules imported a DIFFERENT tier
under that name (`from utils.sis_roles import ADMIN_ROLES as STAFF_ROLES` and
the FINANCE / HR equivalents), so this guard read billing.py, tuition.py,
secure_documents.py, registration.py, waitlist.py, clp.py and reports.py as
teacher-reachable when no teacher can open any of them -- and any human
grepping for who may reach a route got the same wrong answer. The aliases are
gone and test_no_tier_aliases below keeps them gone.
"""

import re
from pathlib import Path

SIS_ROUTES = Path(__file__).resolve().parents[2] / 'routes' / 'sis'

# Signals that a module reads class-scoped data. Quoted-name / call forms so a
# comment that merely mentions class_quests.py doesn't trip the guard.
CLASS_DATA_PATTERN = re.compile(
    r"'class_enrollments'|advisor_class_ids\(|sis_gradebook|'class_quests'|"
    r"sis_engagement|sis_submissions"
)
STAFF_PATTERN = re.compile(r"require_role\(\*STAFF_ROLES\)")
SCOPE_PATTERN = re.compile(r"class_scope\(")

# Modules that admit teachers and touch class data but scope another way.
# An admin-only module needs no entry: with the tier aliases gone it simply does
# not match STAFF_PATTERN. Entries naming schedule_ai.py, schedule_sync.py and
# waitlist.py were removed with the aliases on 2026-09-10 for that reason, along
# with class_discussions.py and kiosk.py, whose files no longer exist at all.
ALLOWLIST = {
    'class_materials.py': 'per-class moderator gate on every route (org admin, '
                          'primary instructor, or class_advisors row)',
    'class_quests.py': 'per-class moderator gate, same as class_materials',
    'community.py': 'community feed is school-wide by design, not class-scoped',
    'curriculum.py': "the STAFF_ROLES routes read the curriculum library "
                     "(org-scoped by _owned); the only class_quests touch is a "
                     "delete cascade on an ADMIN_ROLES route",
}

# Today's manual call sites, per file. A count DROPPING here means a scoped
# read lost its scope — investigate before editing this table. New sites just
# add to it.
EXPECTED_MIN_CALLS = {
    'attendance.py': 2,
    'catalog.py': 2,
    'submissions.py': 1,
    # 2, not 3, since 2026-09-03: main consolidated two call sites into the
    # _alert_scope() helper, which calls class_scope itself. No read lost scope.
    'engagement.py': 2,
    'staff_portal.py': 2,
    'gradebook.py': 6,
    'student_records.py': 1,
}


def test_every_teacher_reachable_class_reader_scopes_or_is_allowlisted():
    missing = []
    for path in sorted(SIS_ROUTES.glob('*.py')):
        if path.name in ('__init__.py',) or path.name in ALLOWLIST:
            continue
        src = path.read_text()
        if STAFF_PATTERN.search(src) and CLASS_DATA_PATTERN.search(src) \
                and not SCOPE_PATTERN.search(src):
            missing.append(path.name)
    assert not missing, (
        'STAFF_ROLES routes reading class data with no class_scope call -- '
        'scope the read or allowlist the file here WITH a reason: '
        + ', '.join(missing)
    )


def test_known_scoped_files_keep_their_call_sites():
    problems = []
    for name, expected in EXPECTED_MIN_CALLS.items():
        src = (SIS_ROUTES / name).read_text()
        actual = len(SCOPE_PATTERN.findall(src))
        if actual < expected:
            problems.append(f'{name}: {actual} class_scope calls, expected >= {expected}')
    assert not problems, (
        'A class_scope call disappeared -- an org-wide read may have shipped:\n  '
        + '\n  '.join(problems)
    )


def test_allowlist_entries_name_files_that_exist():
    """A stale entry silently exempts nothing and misleads the next reader.
    class_discussions.py and kiosk.py sat here after their files were deleted."""
    gone = [name for name in ALLOWLIST if not (SIS_ROUTES / name).exists()]
    assert not gone, (
        'These allowlist entries name files that no longer exist -- delete '
        'them: ' + ', '.join(gone)
    )


ALIAS_PATTERN = re.compile(
    r'from\s+utils\.sis_roles\s+import\s+(\w+)\s+as\s+(\w+)')


def test_no_tier_aliases():
    """A role tuple must be imported under its own name.

    Seven modules used to do `from utils.sis_roles import ADMIN_ROLES as
    STAFF_ROLES` (and the FINANCE / HR equivalents). The behaviour was correct
    -- the decorator got the right tuple -- but every reader was told a lie:
    `@require_role(*STAFF_ROLES)` in billing.py appeared to admit teachers to
    the money. It fooled a human reviewing the file, a grep for who can reach a
    route, and the guard at the top of this module, which counted seven
    admin-and-finance-only files as teacher-reachable.
    """
    offenders = []
    for path in sorted(SIS_ROUTES.glob('*.py')):
        for real, alias in ALIAS_PATTERN.findall(path.read_text()):
            if real != alias:
                offenders.append(f'{path.name}: {real} as {alias}')
    assert not offenders, (
        'Role tuples imported under another tier\'s name -- import them under '
        'their own:\n  ' + '\n  '.join(offenders)
    )
