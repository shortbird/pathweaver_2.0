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
ALLOWLIST = {
    'class_discussions.py': 'per-class moderator gate on every route (org admin, '
                            'primary instructor, or class_advisors row)',
    'class_materials.py': 'per-class moderator gate, same as discussions',
    'class_quests.py': 'per-class moderator gate, same as discussions',
    'schedule_ai.py': 'ADMIN_ROLES only — no teacher ever reaches it',
    'schedule_sync.py': 'ADMIN_ROLES only — no teacher ever reaches it',
    'waitlist.py': 'ADMIN_ROLES only — no teacher ever reaches it',
    'community.py': 'community feed is school-wide by design, not class-scoped',
    'kiosk.py': 'device-token auth; the kiosk is pinned to one class at pairing',
}

# Today's manual call sites, per file. A count DROPPING here means a scoped
# read lost its scope — investigate before editing this table. New sites just
# add to it.
EXPECTED_MIN_CALLS = {
    'attendance.py': 2,
    'catalog.py': 2,
    'submissions.py': 1,
    'engagement.py': 3,
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
