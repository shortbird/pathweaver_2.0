"""
The parts of the training catalog that something other than its own routes needs.

routes/sis/staff_training.py owns the catalog — building the quests, the admin
screens, the progress report. Two pieces of it are needed elsewhere, so they
live here instead:

  student_in_age_window  the "12 and up" gate, which both the route module and
                         the catch-up below have to agree on exactly.
  catch_up_students      enrolling students into the auto-assign quests set for
                         them, called from the family portal.

The second is why this module exists at all. Students are the one audience with
no page of their own in the SIS: a quest set for them simply turns up on their
account in the learning app, so nothing they load can catch them up the way the
training page catches up a teacher. Their guardian's portal does it instead —
and a service reaching into routes/ to do that is a layer violation
(tests/unit/test_import_layers.py fails on a new one).
"""

import logging
from typing import Any, Dict, Iterable, List, Optional

from database import get_supabase_admin_client
from services import sis_service

logger = logging.getLogger(__name__)


def student_in_age_window(item: Dict[str, Any], person: Dict[str, Any]) -> bool:
    """Whether a student falls inside a catalog row's age window.

    A student whose date of birth the school has never recorded is left OUT of
    any row with a window on it. "12 and up" has to mean it: guessing would put
    an orientation quest written for teenagers on a six-year-old's account, and
    the admin has no way to see that it happened.
    """
    lo, hi = item.get('student_min_age'), item.get('student_max_age')
    if lo is None and hi is None:
        return True
    age = person.get('age')
    if age is None:
        return False
    return (lo is None or age >= lo) and (hi is None or age <= hi)


def student_auto_assign_rows(org_id: str) -> List[Dict[str, Any]]:
    """Live catalog rows set for students that put themselves on accounts.

    Drafts are excluded here rather than downstream: a draft is not on anybody's
    account yet, which is the whole of what makes it a draft.
    """
    if not org_id:
        return []
    # admin client justified: reads another org's catalog on behalf of a guardian
    # whose membership the caller has already checked; the row is org-scoped below.
    rows = (get_supabase_admin_client().table('sis_staff_training')
            .select('quest_id, auto_assign, student_min_age, student_max_age, '
                    'quests(is_active)')
            .eq('organization_id', org_id).eq('auto_assign', True)
            .contains('audiences', ['student']).execute()).data or []
    return [r for r in rows if (r.get('quests') or {}).get('is_active')]


def catch_up_students(org_id: str, student_ids: Optional[Iterable[str]]) -> int:
    """Enroll these students into the auto-assign quests set for students.

    Called from their guardian's family portal — bounded work, on a page a
    parent loads anyway, and the family that registered on Thursday is exactly
    the family whose children were missed.

    Ages are read here rather than passed in: a row aimed at 12-and-up has to
    pick up the student who turned 12 last week, without anybody re-assigning
    anything.
    """
    from utils.quest_assignment import assign_quest_to_users

    ids = list(student_ids or [])
    if not org_id or not ids:
        return 0
    catalog = student_auto_assign_rows(org_id)
    if not catalog:
        return 0

    # admin client justified: enrolling somebody ELSE (a guardian's child) is a
    # cross-user write, and reading their DOB to gate it is the same act.
    admin = get_supabase_admin_client()
    rows = (admin.table('users').select('id, date_of_birth')
            .in_('id', ids).execute()).data or []
    people = [{'id': r['id'], 'age': sis_service.age_years(r.get('date_of_birth'))}
              for r in rows]

    created = 0
    for row in catalog:
        wanted = [p['id'] for p in people if student_in_age_window(row, p)]
        if not wanted:
            continue
        try:
            created += assign_quest_to_users(admin, row['quest_id'], wanted)['enrolled']
        except Exception as e:  # noqa: BLE001 — reading the portal is the point
            logger.warning(f"Student catch-up failed for quest {row['quest_id']}: {e}")
    return created
