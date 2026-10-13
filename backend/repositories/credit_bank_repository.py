"""
Reads and writes for the credit bank (services/credit_bank_service.py).

credit_bank_entries is service-role only (RLS on, no policies). The approval
reads follow courses_and_credits_repository: a credit is used when its
completion is 'finalized', and the amount is the latest approved round's
approved_subjects. Every read here is bounded by a list of students, and pages
past PostgREST's 1,000-row cap anyway, since a student's approvals grow for
years.
"""
from typing import Any, Dict, List

from repositories.base_repository import BaseRepository
from utils.db_fetch import fetch_all_rows

_CHUNK = 200


def _chunks(ids: List[str]):
    for i in range(0, len(ids), _CHUNK):
        yield ids[i:i + _CHUNK]


class CreditBankRepository(BaseRepository):
    table_name = 'credit_bank_entries'
    id_column = 'id'

    # ── the ledger ──────────────────────────────────────────────────────────

    def entries(self, student_ids: List[str]) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for ids in _chunks(student_ids):
            def build(chunk: List[str] = ids) -> Any:
                return (self.client.table(self.table_name)
                        .select('id, student_user_id, credits, kind, source, reference, '
                                'note, entered_by, created_at')
                        .in_('student_user_id', chunk))
            out += fetch_all_rows(build)
        return out

    def has_reference(self, student_id: str, reference: str) -> bool:
        return bool((self.client.table(self.table_name).select('id')
                     .eq('student_user_id', student_id).eq('reference', reference)
                     .limit(1).execute()).data)

    def insert(self, row: Dict[str, Any]) -> Dict[str, Any]:
        return (self.client.table(self.table_name).insert(row).execute()).data[0]

    # ── what has been used ──────────────────────────────────────────────────

    def academy_enrollments(self, student_ids: List[str]) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for ids in _chunks(student_ids):
            def build(chunk: List[str] = ids) -> Any:
                return (self.client.table('academy_enrollments')
                        .select('id, user_id, status, enrolled_at').in_('user_id', chunk))
            out += fetch_all_rows(build)
        return out

    def finalized_completions(self, student_ids: List[str]) -> List[Dict[str, Any]]:
        """Approved completions that carry an approval date. Legacy rows with
        no finalized_at cannot be placed after an enrollment, so they never
        draw on a bank."""
        out: List[Dict[str, Any]] = []
        for ids in _chunks(student_ids):
            def build(chunk: List[str] = ids) -> Any:
                return (self.client.table('quest_task_completions')
                        .select('id, user_id, finalized_at, user_quest_task_id')
                        .in_('user_id', chunk).eq('diploma_status', 'finalized')
                        .not_.is_('finalized_at', 'null'))
            out += fetch_all_rows(build)
        return out

    def approved_subjects(self, completion_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        found: Dict[str, Dict[str, Any]] = {}
        for ids in _chunks(completion_ids):
            rows = (self.client.table('diploma_review_rounds')
                    .select('completion_id, approved_subjects, round_number')
                    .in_('completion_id', ids).eq('reviewer_action', 'approved')
                    .order('round_number', desc=True).execute()).data or []
            for r in rows:
                if isinstance(r.get('approved_subjects'), dict):
                    found.setdefault(r['completion_id'], r['approved_subjects'])
        return found

    def prior_learning_transfers(self, student_ids: List[str]) -> List[Dict[str, Any]]:
        """Transfer credit rows; the service keeps the prior learning ones."""
        out: List[Dict[str, Any]] = []
        for ids in _chunks(student_ids):
            out += (self.client.table('transfer_credits')
                    .select('id, user_id, total_xp, accredited, prior_learning_record_ids, created_at')
                    .in_('user_id', ids).execute()).data or []
        return out

    def task_xp(self, user_quest_task_ids: List[str]) -> Dict[str, int]:
        found: Dict[str, int] = {}
        for ids in _chunks(user_quest_task_ids):
            rows = (self.client.table('user_quest_tasks').select('id, xp_value')
                    .in_('id', ids).execute()).data or []
            for r in rows:
                found[r['id']] = int(r.get('xp_value') or 0)
        return found

    # ── where monthly payments are seen ─────────────────────────────────────

    def subscribed_registrations(self, org_id: str) -> List[Dict[str, Any]]:
        return fetch_all_rows(lambda: self.client.table('registrations')
                              .select('id, kids, stripe_customer_id, stripe_subscription_id')
                              .eq('organization_id', org_id)
                              .not_.is_('stripe_subscription_id', 'null'))

    def autopay_payments(self, org_id: str, note: str) -> List[Dict[str, Any]]:
        return fetch_all_rows(lambda: self.client.table('sis_payment_records')
                              .select('id, invoice_id, recorded_at')
                              .eq('organization_id', org_id).eq('note', note))

    def invoice_households(self, invoice_ids: List[str]) -> Dict[str, str]:
        found: Dict[str, str] = {}
        for ids in _chunks(invoice_ids):
            rows = (self.client.table('sis_invoices').select('id, household_id')
                    .in_('id', ids).execute()).data or []
            for r in rows:
                if r.get('household_id'):
                    found[r['id']] = r['household_id']
        return found

    def tuition_schedules(self, household_ids: List[str]) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for ids in _chunks(household_ids):
            out += (self.client.table('sis_recurring_tuition')
                    .select('id, household_id, student_user_id, monthly_cents, status')
                    .in_('household_id', ids).execute()).data or []
        return out
