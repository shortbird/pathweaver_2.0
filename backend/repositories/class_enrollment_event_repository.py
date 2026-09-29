"""
A student's class history: every add, drop, re-add and completion
(class_enrollment_events), plus the waitlists they joined.

iCreate, ticket fee0d486: "Could we get a place where we can see the history of
when classes were added and/or dropped by any particular student?"

class_enrollment_events is written by triggers on class_enrollments
(migration 20260929145429), never by the app, so every writer is covered. The
app's only part is writing class_enrollments.status_changed_by in the same
UPDATE that changes the status, which the trigger reads as "who did it".

Client-injected; with no client it takes the admin client itself. The table is
RLS-on with no policies, so the service role is the only way to it, and the one
caller (GET /api/sis/students/<id>/class-history) authorizes first: ADMIN_ROLES,
org_staff on the student, and the student in the caller's school.

Every read is scoped to one student in one school. That is bounded, but a
student with a long history across years could still pass PostgREST's 1000-row
cap, so the event read pages through fetch_all_rows rather than trusting one
response to be complete.
"""

from typing import Any, Dict, Iterable, List

from utils.db_fetch import fetch_all_rows
from utils.person_name import USER_NAME_FIELDS

TABLE = 'class_enrollment_events'
EVENT_FIELDS = ('id, class_id, class_name, event, actor_id, occurred_at, '
                'date_known, backfilled')
_CHUNK = 200


def _chunks(seq: Iterable, size: int = _CHUNK):
    seq = list(seq)
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


class ClassEnrollmentEventRepository:

    def __init__(self, client=None):
        if client is None:
            from database import get_supabase_admin_client
            # admin client justified: class_enrollment_events is RLS-on with no
            # policies (service role only); the only caller is an SIS route
            # gated by ADMIN_ROLES + org_staff on the student + an org check.
            client = get_supabase_admin_client()
        self.client = client

    def events_for_student(self, org_id: str, student_id: str) -> List[Dict[str, Any]]:
        """Every enrollment event for this student in this school, oldest first
        by id (the caller sorts by time)."""
        return fetch_all_rows(lambda: (
            self.client.table(TABLE).select(EVENT_FIELDS)
            .eq('organization_id', org_id).eq('student_id', student_id)
        ))

    def waitlist_entries_for_student(self, org_id: str, student_id: str) -> List[Dict[str, Any]]:
        """The class waitlists this student is on, or was on and still has a row
        for. An entry is deleted when the student takes the seat, so this is
        what is left, not a full record."""
        return fetch_all_rows(lambda: (
            self.client.table('sis_waitlist_entries')
            .select('id, class_id, status, created_at')
            .eq('organization_id', org_id).eq('student_user_id', student_id)
        ))

    def class_names(self, class_ids: Iterable[str]) -> Dict[str, str]:
        """{class_id: name} for the given classes."""
        out: Dict[str, str] = {}
        for chunk in _chunks({c for c in class_ids if c}):
            rows = (self.client.table('org_classes').select('id, name')
                    .in_('id', chunk).execute()).data or []
            out.update({r['id']: r.get('name') for r in rows})
        return out

    def users(self, user_ids: Iterable[str]) -> Dict[str, Dict[str, Any]]:
        """{user_id: row with the name fields} for the given people."""
        out: Dict[str, Dict[str, Any]] = {}
        for chunk in _chunks({u for u in user_ids if u}):
            rows = (self.client.table('users').select(f'id, {USER_NAME_FIELDS}')
                    .in_('id', chunk).execute()).data or []
            out.update({r['id']: r for r in rows})
        return out
