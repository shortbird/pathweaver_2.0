"""Queries for the prior-learning review queue (services/sis_prior_learning_queue.py).

The service decides; this module only reads and writes. Built with the admin
client the service passes in: prior_learning_* have RLS on with no policies
(service-role only, the SIS convention), and every caller is role-gated before
it gets here.
"""

from typing import Any, Dict, Iterable, List, Optional

from repositories.base_repository import BaseRepository
from utils.db_fetch import fetch_all_rows

# Statuses the queue lists. Drafts are a family still assembling a record.
QUEUE_STATUSES = ('submitted', 'under_review', 'needs_info', 'accepted', 'rejected')

QUEUE_COLUMNS = ('id, organization_id, student_user_id, status, source, title, '
                 'awarded_credits, ai_status, created_at, updated_at, reviewed_at')


class PriorLearningRepository(BaseRepository):
    table_name = 'prior_learning_records'

    # -- records -----------------------------------------------------------

    def queue_rows(self, org_ids: List[str]) -> List[Dict[str, Any]]:
        """Every listed record in these schools, light columns only. Paged:
        the queue groups by student, so a truncated read would drop students
        from the list without a word."""
        if not org_ids:
            return []
        return fetch_all_rows(
            lambda: self.client.table(self.table_name).select(QUEUE_COLUMNS)
            .in_('organization_id', org_ids).in_('status', list(QUEUE_STATUSES)))

    def records_for_student(self, student_id: str, org_ids: List[str]) -> List[Dict[str, Any]]:
        """One student's listed records in these schools, newest first.
        Bounded by one student, so one read is enough."""
        if not org_ids:
            return []
        return (self.client.table(self.table_name).select('*')
                .eq('student_user_id', student_id).in_('organization_id', org_ids)
                .in_('status', list(QUEUE_STATUSES))
                .order('created_at', desc=True).limit(200).execute().data or [])

    def update_record(self, record_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        rows = (self.client.table(self.table_name).update(fields)
                .eq('id', record_id).execute().data or [])
        return rows[0] if rows else None

    def org_of(self, record_id: str) -> Optional[str]:
        rows = (self.client.table(self.table_name).select('organization_id')
                .eq('id', record_id).limit(1).execute().data or [])
        return rows[0]['organization_id'] if rows else None

    def set_ai_status(self, record_id: str, status: str, only_from: Iterable[str] = ()) -> bool:
        """Move ai_status, optionally only from the given states. Returns True
        when a row changed -- the claim the analyze sweep relies on so a thread
        and a cron tick never read the same record twice."""
        query = self.client.table(self.table_name).update({'ai_status': status}).eq('id', record_id)
        if only_from:
            query = query.in_('ai_status', list(only_from))
        return bool(query.execute().data)

    def queued_for_analysis(self, limit: int) -> List[Dict[str, Any]]:
        return (self.client.table(self.table_name).select('id')
                .eq('ai_status', 'queued').neq('status', 'draft')
                .order('updated_at').limit(limit).execute().data or [])

    def stuck_running(self, before_iso: str, limit: int) -> List[Dict[str, Any]]:
        """Records a dead worker left at 'running'."""
        return (self.client.table(self.table_name).select('id')
                .eq('ai_status', 'running').lt('updated_at', before_iso)
                .limit(limit).execute().data or [])

    def count_by_status(self, statuses: Iterable[str]) -> int:
        return (self.client.table(self.table_name).select('id', count='exact')
                .in_('status', list(statuses)).limit(1).execute().count or 0)

    def count_created_since(self, since_iso: str) -> int:
        return (self.client.table(self.table_name).select('id', count='exact')
                .neq('status', 'draft').gte('created_at', since_iso)
                .limit(1).execute().count or 0)

    def oldest_waiting(self, statuses: Iterable[str]) -> Optional[Dict[str, Any]]:
        rows = (self.client.table(self.table_name).select('id, created_at')
                .in_('status', list(statuses)).order('created_at').limit(1).execute().data or [])
        return rows[0] if rows else None

    def accepted_with_credit(self) -> List[Dict[str, Any]]:
        """Accepted records that carry an award, for the digest's "accepted but
        not on the transcript" line. Bounded in practice by how many records
        exist; paged so it stays right if that changes."""
        return fetch_all_rows(
            lambda: self.client.table(self.table_name).select('id, awarded_credits')
            .eq('status', 'accepted'))

    # -- portfolio ---------------------------------------------------------

    def accepted_for_portfolio(self, student_id: str) -> List[Dict[str, Any]]:
        """Accepted records for one student, any school. Bounded by one student."""
        return (self.client.table(self.table_name)
                .select('id, title, description, provider, started_on, ended_on, '
                        'awarded_credits, credited_at')
                .eq('student_user_id', student_id).eq('status', 'accepted')
                .order('ended_on', desc=True).limit(200).execute().data or [])

    def public_evidence(self, record_ids: List[str]) -> List[Dict[str, Any]]:
        """The documents a family has not marked private."""
        if not record_ids:
            return []
        return (self.client.table('prior_learning_evidence')
                .select('id, record_id, evidence_type, url, title, file_name, content_type, content')
                .in_('record_id', record_ids).eq('is_private', False)
                .order('sequence_order').limit(1000).execute().data or [])

    def set_evidence_private(self, record_id: str, evidence_id: str, is_private: bool) -> bool:
        rows = (self.client.table('prior_learning_evidence').update({'is_private': is_private})
                .eq('id', evidence_id).eq('record_id', record_id).execute().data or [])
        return bool(rows)

    # -- events ------------------------------------------------------------

    def insert_event(self, row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        rows = self.client.table('prior_learning_events').insert(row).execute().data or []
        return rows[0] if rows else None

    def events_for(self, record_ids: List[str]) -> List[Dict[str, Any]]:
        """Bounded by one student's records."""
        if not record_ids:
            return []
        return (self.client.table('prior_learning_events').select('*')
                .in_('record_id', record_ids).order('created_at').limit(1000)
                .execute().data or [])

    # -- people and credit -------------------------------------------------

    def users(self, user_ids: Iterable[str], columns: str) -> List[Dict[str, Any]]:
        ids = [u for u in set(user_ids) if u]
        if not ids:
            return []
        return self.client.table('users').select(columns).in_('id', ids).execute().data or []

    def funding_sources(self, student_id: str, org_id: str) -> List[str]:
        """The funding_source of the student's household(s) in this school."""
        hh = [m['household_id'] for m in (self.client.table('household_members').select('household_id')
                                          .eq('user_id', student_id).execute().data or [])
              if m.get('household_id')]
        if not hh:
            return []
        rows = (self.client.table('households').select('funding_source')
                .in_('id', hh).eq('organization_id', org_id).execute().data or [])
        return [r['funding_source'] for r in rows if r.get('funding_source')]

    def superadmins(self) -> List[Dict[str, Any]]:
        return (self.client.table('users').select('id, email, first_name, display_name')
                .eq('role', 'superadmin').execute().data or [])

    def subject_xp(self, student_id: str) -> List[Dict[str, Any]]:
        return (self.client.table('user_subject_xp').select('school_subject, xp_amount')
                .eq('user_id', student_id).execute().data or [])

    def transfer_credits(self, student_id: str) -> List[Dict[str, Any]]:
        return (self.client.table('transfer_credits')
                .select('id, school_name, subject_xp, course_names, prior_learning_record_ids, '
                        'accredited, created_at')
                .eq('user_id', student_id).order('created_at').execute().data or [])

    def transfer_credit(self, transfer_credit_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('transfer_credits').select('id, user_id, school_name, accredited, prior_learning_record_ids')
                .eq('id', transfer_credit_id).execute().data)
        return rows[0] if rows else None

    def set_transfer_accredited(self, transfer_credit_id: str, accredited: bool) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('transfer_credits').update({'accredited': accredited})
                .eq('id', transfer_credit_id).execute().data)
        return rows[0] if rows else None
