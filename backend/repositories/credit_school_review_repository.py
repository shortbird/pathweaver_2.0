"""Reads behind the school stage of credit review.

Two questions, both asked by routes/credit_dashboard/school_review.py:

- Whose accreditation a student's transcript is issued under, for a page of
  students at once (the queue tags every row with who makes the final call).
  The single-student form goes through services.academy_enrollment_service,
  like every transcript renderer does; this is the batch form of the same two
  reads, so a 50-row page costs two queries instead of a hundred.
- Which of a teacher's students are in the teacher's own school, and which
  students an advisor is formally assigned.

Client-injected: the caller hands in the service-role client its own role and
org gate justified.
"""

from typing import Any, Dict, Iterable, List, Set

# Ids ride in the URL of an `in.()` filter; keep each request well under the
# gateway's limit.
ID_CHUNK = 150


def _chunks(ids: List[str]) -> Iterable[List[str]]:
    for i in range(0, len(ids), ID_CHUNK):
        yield ids[i:i + ID_CHUNK]


class CreditSchoolReviewRepository:

    def __init__(self, client: Any = None):
        if client is None:
            from database import get_supabase_admin_client
            # admin client justified: reads other users' enrollment and
            # assignment rows to answer an authorization question the caller's
            # role and org gate already admitted.
            client = get_supabase_admin_client()
        self.client = client

    def org_accreditation_rows(self, org_ids: Iterable[str]) -> Dict[str, Dict[str, Any]]:
        """{org_id: {'accreditation_source': ...}} for the orgs given."""
        ids = [o for o in dict.fromkeys(org_ids) if o]
        out: Dict[str, Dict[str, Any]] = {}
        for chunk in _chunks(ids):
            rows = (self.client.table('organizations')
                    .select('id, accreditation_source')
                    .in_('id', chunk).execute()).data or []
            out.update({r['id']: r for r in rows if r.get('id')})
        return out

    def academy_enrolled_ids(self, user_ids: Iterable[str]) -> Set[str]:
        """The users among these holding an active Optio Academy enrollment."""
        ids = [u for u in dict.fromkeys(user_ids) if u]
        out: Set[str] = set()
        for chunk in _chunks(ids):
            rows = (self.client.table('academy_enrollments')
                    .select('user_id')
                    .in_('user_id', chunk).eq('status', 'active').execute()).data or []
            out.update(r['user_id'] for r in rows if r.get('user_id'))
        return out

    def advisor_assigned_student_ids(self, advisor_id: str) -> List[str]:
        """Students formally assigned to this advisor (active rows)."""
        rows = (self.client.table('advisor_student_assignments')
                .select('student_id').eq('advisor_id', advisor_id)
                .eq('is_active', True).execute()).data or []
        return [r['student_id'] for r in rows if r.get('student_id')]

    def org_member_ids_among(self, org_id: str, user_ids: Iterable[str]) -> List[str]:
        """The given users who belong to this org, in the order given."""
        ids = [u for u in dict.fromkeys(user_ids) if u]
        if not org_id or not ids:
            return []
        found: Set[str] = set()
        for chunk in _chunks(ids):
            rows = (self.client.table('users').select('id')
                    .eq('organization_id', org_id)
                    .in_('id', chunk).execute()).data or []
            found.update(r['id'] for r in rows if r.get('id'))
        return [u for u in ids if u in found]
