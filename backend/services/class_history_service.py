"""
One student's class history for the SIS student record.

iCreate, ticket fee0d486: "Could we get a place where we can see the history of
when classes were added and/or dropped by any particular student?"

Reads class_enrollment_events (written by triggers on class_enrollments, see
migration 20260929145429) and the student's class waitlist rows, and returns
one list, newest first.

What the dates mean, because two kinds are not what they look like:

* Events recorded before the migration were backfilled. An 'added' is the
  enrollment's first add (a re-add never reset enrolled_at). Most backfilled
  drops have date_known = false: nothing recorded when they happened, and
  occurred_at is only the earliest they could have been, kept so the row sorts
  after its add. The page must say "date not recorded" for those.
* A waitlist row is deleted when the student takes the seat, so 'waitlisted'
  shows only the waitlists that still have a row.
"""

from typing import Any, Dict, List, Optional

from utils.person_name import full_name

# Same instant (a backfilled undated drop sits on its add): the order it
# happened in.
_RANK = {'waitlisted': 0, 'added': 1, 'dropped': 2, 'readded': 3, 'completed': 4}


def get_student_class_history(org_id: str, student_id: str,
                              repo=None) -> List[Dict[str, Any]]:
    if repo is None:
        from repositories.class_enrollment_event_repository import (
            ClassEnrollmentEventRepository,
        )
        repo = ClassEnrollmentEventRepository()

    events = repo.events_for_student(org_id, student_id)
    waits = repo.waitlist_entries_for_student(org_id, student_id)

    # The event row carries the class name as it was; the live name wins when
    # the class still exists, and a waitlist row only has the id.
    names = repo.class_names(
        [e.get('class_id') for e in events] + [w.get('class_id') for w in waits])
    people = repo.users([e.get('actor_id') for e in events])

    def _class_name(class_id: Optional[str], snapshot: Optional[str] = None) -> str:
        return names.get(class_id) or snapshot or 'Deleted class'

    out: List[Dict[str, Any]] = []
    for e in events:
        actor = people.get(e.get('actor_id')) if e.get('actor_id') else None
        out.append({
            'id': e['id'],
            'class_id': e.get('class_id'),
            'class_name': _class_name(e.get('class_id'), e.get('class_name')),
            'event': e.get('event'),
            'occurred_at': e.get('occurred_at'),
            'date_known': e.get('date_known') is not False,
            'actor_name': full_name(actor) if actor else None,
        })
    for w in waits:
        out.append({
            'id': w['id'],
            'class_id': w.get('class_id'),
            'class_name': _class_name(w.get('class_id')),
            'event': 'waitlisted',
            'occurred_at': w.get('created_at'),
            'date_known': True,
            'actor_name': None,
            'waitlist_status': w.get('status'),
        })

    out.sort(key=lambda r: (r.get('occurred_at') or '', _RANK.get(r['event'], 9)),
             reverse=True)
    return out
