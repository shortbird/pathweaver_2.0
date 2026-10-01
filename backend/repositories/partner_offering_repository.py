"""Reads and writes behind a partner's credit class (partner_offerings).

An offering is a template class in the partner's org plus the slug of its
public link; an enrollment is one student who has their own copy of it. See
supabase/migrations/20260930200000_partner_offerings.sql for why each student
gets a copy, and services/partner_offering_service.py for the rules.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from repositories.base_repository import BaseRepository
from utils.db_fetch import fetch_all_rows

OFFERING_COLUMNS = 'id, organization_id, template_quest_id, slug, monthly_fee_cents, is_active, created_at'
ENROLLMENT_COLUMNS = 'id, offering_id, user_id, class_quest_id, source, enrolled_by, created_at, ended_at'
TEMPLATE_COLUMNS = ('id, title, big_idea, description, quest_type, transcript_subject, '
                    'header_image_url, image_url, metadata, organization_id, is_active')
STUDENT_COLUMNS = 'id, email, first_name, last_name, display_name, role, org_role, organization_id, date_of_birth'


class PartnerOfferingRepository(BaseRepository):
    table_name = 'partner_offerings'

    # ── offerings ────────────────────────────────────────────────────────────

    def by_slug(self, slug: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('partner_offerings').select(OFFERING_COLUMNS)
                .eq('slug', slug).limit(1).execute()).data
        return rows[0] if rows else None

    def by_id(self, offering_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('partner_offerings').select(OFFERING_COLUMNS)
                .eq('id', offering_id).limit(1).execute()).data
        return rows[0] if rows else None

    def for_org(self, organization_id: str) -> List[Dict[str, Any]]:
        return (self.client.table('partner_offerings').select(OFFERING_COLUMNS)
                .eq('organization_id', organization_id).order('created_at').execute()).data or []

    def template(self, quest_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('quests').select(TEMPLATE_COLUMNS)
                .eq('id', quest_id).limit(1).execute()).data
        return rows[0] if rows else None

    def templates(self, quest_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        if not quest_ids:
            return {}
        rows = (self.client.table('quests').select(TEMPLATE_COLUMNS)
                .in_('id', quest_ids).execute()).data or []
        return {r['id']: r for r in rows}

    def org_name(self, organization_id: str) -> str:
        rows = (self.client.table('organizations').select('name')
                .eq('id', organization_id).limit(1).execute()).data
        return (rows[0].get('name') if rows else '') or ''

    # ── enrollments ──────────────────────────────────────────────────────────

    def enrollment(self, offering_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('partner_offering_enrollments').select(ENROLLMENT_COLUMNS)
                .eq('offering_id', offering_id).eq('user_id', user_id).limit(1).execute()).data
        return rows[0] if rows else None

    def enrollment_by_id(self, enrollment_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('partner_offering_enrollments').select(ENROLLMENT_COLUMNS)
                .eq('id', enrollment_id).limit(1).execute()).data
        return rows[0] if rows else None

    def insert_enrollment(self, row: Dict[str, Any]) -> Dict[str, Any]:
        return self.client.table('partner_offering_enrollments').insert(row).execute().data[0]

    def update_enrollment(self, enrollment_id: str, fields: Dict[str, Any]) -> None:
        self.client.table('partner_offering_enrollments').update(fields).eq('id', enrollment_id).execute()

    def delete_enrollment(self, enrollment_id: str) -> None:
        self.client.table('partner_offering_enrollments').delete().eq('id', enrollment_id).execute()

    def enrollments(self, offering_ids: List[str]) -> List[Dict[str, Any]]:
        """Every enrollment on these offerings. Grows with the partner's sales,
        so read past PostgREST's 1,000-row cap."""
        if not offering_ids:
            return []
        return fetch_all_rows(lambda: (self.client.table('partner_offering_enrollments')
                                       .select(ENROLLMENT_COLUMNS).in_('offering_id', offering_ids)))

    # ── a student's own copy ─────────────────────────────────────────────────

    def insert_quest(self, row: Dict[str, Any]) -> Dict[str, Any]:
        return self.client.table('quests').insert(row).execute().data[0]

    def delete_quest(self, quest_id: str) -> None:
        """Remove a half-made copy; its user_quests and tasks cascade."""
        self.client.table('quests').delete().eq('id', quest_id).execute()

    def insert_user_quest(self, row: Dict[str, Any]) -> Dict[str, Any]:
        return self.client.table('user_quests').insert(row).execute().data[0]

    # ── the people and their classes ─────────────────────────────────────────

    def user(self, user_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('users').select(STUDENT_COLUMNS)
                .eq('id', user_id).limit(1).execute()).data
        return rows[0] if rows else None

    def users(self, user_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        if not user_ids:
            return {}
        rows = fetch_all_rows(lambda: (self.client.table('users').select(STUDENT_COLUMNS)
                                       .in_('id', user_ids)))
        return {r['id']: r for r in rows}

    def set_date_of_birth(self, user_id: str, dob_iso: str) -> None:
        self.client.table('users').update({'date_of_birth': dob_iso}).eq('id', user_id).execute()

    def class_states(self, quest_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        """Each copy's review status, for the roster and the billing count."""
        if not quest_ids:
            return {}
        rows = fetch_all_rows(lambda: (self.client.table('quests')
                                       .select('id, class_review_status').in_('id', quest_ids)))
        return {r['id']: r for r in rows}

    def completed_xp(self, quest_ids: List[str]) -> Dict[str, int]:
        """XP of the finished tasks on each copy. A copy belongs to one student,
        so the quest id alone says whose work it is."""
        if not quest_ids:
            return {}
        done = fetch_all_rows(lambda: (self.client.table('quest_task_completions')
                                       .select('quest_id, user_quest_task_id').in_('quest_id', quest_ids)))
        task_ids = list({d['user_quest_task_id'] for d in done if d.get('user_quest_task_id')})
        if not task_ids:
            return {}
        xp_by_task = {}
        for i in range(0, len(task_ids), 200):
            rows = (self.client.table('user_quest_tasks').select('id, xp_value')
                    .in_('id', task_ids[i:i + 200]).execute()).data or []
            xp_by_task.update({r['id']: r.get('xp_value') or 0 for r in rows})
        totals: Dict[str, int] = {}
        seen = set()
        for d in done:
            tid = d.get('user_quest_task_id')
            if tid in seen or tid not in xp_by_task:
                continue
            seen.add(tid)
            totals[d['quest_id']] = totals.get(d['quest_id'], 0) + xp_by_task[tid]
        return totals
