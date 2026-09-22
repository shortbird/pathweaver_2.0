"""Reads behind a partner selling a course to a family Optio already knows.

A partner org (OnFire Learning) registers students it has sold an Optio course
to. The purchase email is often already an Optio login, and not always the
student's own: it can be the student, another school's student, or a parent
whose child is the one taking the course.

This repository answers the two questions that follow from that:

  - who is the student behind this address? Both link tables have to be asked.
    A platform family is held together by parent_student_links; an org-managed
    family is assembled out of households, and has no link rows at all. Elvia
    Labrador on 2026-09-22 was the second kind, which is why the partner form
    dead-ended on a real order.
  - what has this partner sold to accounts it does not own? Those enrolments
    are stamped with the partner (course_enrollments.enrolled_by_organization_id)
    so they appear in its list, and so it can withdraw them -- and only them.
    unenroll_user() deletes user_quests and user_quest_tasks, so an enrolment
    somebody else made carries somebody else's work.

The account row itself is never written here. Adopting an outside account into
the partner's org would move a student between schools, or demote staff.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

from repositories.base_repository import BaseRepository
from utils.portfolio_access import ACTIVE_LINK_STATUSES

ACCOUNT_COLUMNS = (
    'id, email, first_name, last_name, display_name, organization_id, role, org_role'
)

ROSTER_COLUMNS = 'id, first_name, last_name, display_name, email, date_of_birth'

ENROLLMENT_COLUMNS = 'id, user_id, course_id, status, enrolled_at'


class PartnerEnrollmentRepository(BaseRepository):
    table_name = 'course_enrollments'

    # ── the account behind an address ────────────────────────────────────────

    def account_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """The Optio login for this address, wherever it lives."""
        rows = (self.client.table('users').select(ACCOUNT_COLUMNS)
                .eq('email', email).limit(1).execute()).data
        return rows[0] if rows else None

    def linked_student_ids(self, parent_user_id: str) -> List[str]:
        """Children on a parent's account, from both link tables.

        Order is preserved and duplicates dropped, so a child held both ways is
        offered once.
        """
        ids: List[str] = []

        links = (self.client.table('parent_student_links')
                 .select('student_user_id, status')
                 .eq('parent_user_id', parent_user_id).execute()).data or []
        for link in links:
            if link.get('status') in ACTIVE_LINK_STATUSES and link.get('student_user_id'):
                ids.append(link['student_user_id'])

        households = (self.client.table('household_members')
                      .select('household_id')
                      .eq('user_id', parent_user_id).execute()).data or []
        household_ids = [h['household_id'] for h in households if h.get('household_id')]
        if household_ids:
            members = (self.client.table('household_members')
                       .select('user_id, relationship')
                       .in_('household_id', household_ids).execute()).data or []
            for member in members:
                if member.get('user_id') and member['user_id'] != parent_user_id:
                    ids.append(member['user_id'])

        seen: set = set()
        unique: List[str] = []
        for student_id in ids:
            if student_id not in seen:
                seen.add(student_id)
                unique.append(student_id)
        return unique

    def accounts_by_ids(self, user_ids: Iterable[str]) -> Dict[str, Dict[str, Any]]:
        """Account rows for a set of ids, keyed by id."""
        user_ids = list(user_ids)
        if not user_ids:
            return {}
        rows = (self.client.table('users').select(ACCOUNT_COLUMNS)
                .in_('id', user_ids).execute()).data or []
        return {r['id']: r for r in rows}

    # ── what the partner sold ────────────────────────────────────────────────

    def roster_by_ids(self, user_ids: Iterable[str]) -> Dict[str, Dict[str, Any]]:
        """The columns the enrolment list shows, keyed by user id."""
        user_ids = list(user_ids)
        if not user_ids:
            return {}
        rows = (self.client.table('users').select(ROSTER_COLUMNS)
                .in_('id', user_ids).execute()).data or []
        return {r['id']: r for r in rows}

    def sold_to_outside_accounts(self, organization_id: str, status: Optional[str]) -> List[Dict[str, Any]]:
        """Enrolments this org created, newest first.

        The caller drops the ones belonging to its own members; those come from
        the roster query and would otherwise appear twice.
        """
        query = (self.client.table(self.table_name).select(ENROLLMENT_COLUMNS)
                 .eq('enrolled_by_organization_id', organization_id))
        if status:
            query = query.eq('status', status)
        return (query.order('enrolled_at', desc=True).execute()).data or []

    def was_sold_by(self, organization_id: str, user_id: str, course_id: str) -> bool:
        """Did this org create this enrolment? The boundary on withdrawal."""
        rows = (self.client.table(self.table_name).select('id')
                .eq('user_id', user_id).eq('course_id', course_id)
                .eq('enrolled_by_organization_id', organization_id)
                .limit(1).execute()).data
        return bool(rows)
