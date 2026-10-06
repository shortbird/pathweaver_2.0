"""
Household Repository - SIS family/household unit data access.

Households group existing users (students + guardians) into a family unit within
a school. Writes go through this repository (new SIS code uses the repository
pattern per CLAUDE.md); cross-table roster aggregation lives in SisService.
"""

from typing import Optional, Dict, List, Any

from repositories.base_repository import BaseRepository
from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger

logger = get_logger(__name__)


class HouseholdRepository(BaseRepository):
    table_name = 'households'

    def list_for_org(self, organization_id: str) -> List[Dict[str, Any]]:
        # Paged by id (unique, so pages cannot skip or repeat), then sorted by
        # name for display, as SisClassRepository.list_for_org does. One
        # unpaged read stopped at PostgREST's 1,000-row cap without a word,
        # and every family past it fell off the Families page and the reports
        # built on this list.
        rows = fetch_all_rows(lambda: (
            self.client.table(self.table_name)
            .select('*')
            .eq('organization_id', organization_id)
        ))
        return sorted(rows, key=lambda h: (h.get('name') or '').lower())

    def names_by_id(self, household_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        """{id: {id, name}} for the given households, paged."""
        if not household_ids:
            return {}
        rows = fetch_all_rows(lambda: (
            self.client.table(self.table_name).select('id, name').in_('id', household_ids)))
        return {h['id']: h for h in rows}

    def create(self, organization_id: str, fields: Dict[str, Any]) -> Dict[str, Any]:
        payload = {'organization_id': organization_id, **fields}
        resp = self.client.table(self.table_name).insert(payload).execute()
        return resp.data[0] if resp.data else None

    def update(self, household_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        resp = (
            self.client.table(self.table_name)
            .update(fields)
            .eq('id', household_id)
            .execute()
        )
        return resp.data[0] if resp.data else None

    def add_member(self, household_id: str, user_id: str,
                   relationship: str = 'student',
                   is_primary_guardian: bool = False) -> Dict[str, Any]:
        rows = self.add_members([{
            'household_id': household_id,
            'user_id': user_id,
            'relationship': relationship,
            'is_primary_guardian': is_primary_guardian,
        }])
        return rows[0] if rows else None

    def add_members(self, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Put people in a family: the one household_members write (M16).
        Upsert on (household_id, user_id), so re-adding somebody just updates
        their relationship and a family reused by a re-registration never
        collides on an existing membership."""
        if not rows:
            return []
        resp = (
            self.client.table('household_members')
            .upsert(rows, on_conflict='household_id,user_id')
            .execute()
        )
        return resp.data or []

    def remove_member(self, household_id: str, user_id: str) -> None:
        (
            self.client.table('household_members')
            .delete()
            .eq('household_id', household_id)
            .eq('user_id', user_id)
            .execute()
        )

    def members_for_households(self, household_ids: List[str]) -> List[Dict[str, Any]]:
        if not household_ids:
            return []
        # Paged: a school's memberships pass 1,000 long before its families do.
        return fetch_all_rows(lambda: (
            self.client.table('household_members')
            .select('*')
            .in_('household_id', household_ids)
        ))

    def student_household_ids(self, student_ids: List[str]) -> Dict[str, str]:
        """{student_id: household_id} for these students' student memberships
        (the first one found when a child is listed in two). Paged, and asked
        in chunks so the id list stays a sane URL length."""
        ids = sorted({s for s in (student_ids or []) if s})
        out: Dict[str, str] = {}
        for i in range(0, len(ids), 100):
            chunk = ids[i:i + 100]

            def build(chunk: List[str] = chunk) -> Any:
                return (self.client.table('household_members')
                        .select('id, household_id, user_id')
                        .in_('user_id', chunk).eq('relationship', 'student'))
            for r in fetch_all_rows(build):
                if r.get('household_id') and r.get('user_id'):
                    out.setdefault(r['user_id'], r['household_id'])
        return out

    def for_guardian(self, user_id: str, organization_id: str) -> Optional[str]:
        """The household this adult guards at one school, if any.

        Asked by every path that creates a child outside the registration
        funnel: the family already exists, and the new child belongs in it
        rather than on the People page as a student without a family. A
        guardian membership answers it; the primary-contact pointer is the
        fallback for a household staff created and never added themselves to.

        The funnel used to ask the same question inline
        (registration_funnel._existing_household_for_parent) so a returning
        parent never spawns a second '<Last> Family'; since M16's second half
        (2026-09-18) it asks through sis_attach_service.household_for_guardian,
        which is this, so every door gets the one answer.
        """
        rows = (
            self.client.table('household_members')
            .select('household_id, households!inner(id, organization_id)')
            .eq('user_id', user_id)
            .neq('relationship', 'student')
            .execute()
        ).data or []
        for row in rows:
            if (row.get('households') or {}).get('organization_id') == organization_id:
                return row['household_id']
        owned = (
            self.client.table(self.table_name)
            .select('id')
            .eq('organization_id', organization_id)
            .eq('primary_contact_user_id', user_id)
            .limit(1)
            .execute()
        ).data or []
        return owned[0]['id'] if owned else None

    # ── volunteer hours ─────────────────────────────────────────────────────
    # iCreate 01082b30: "Could we make a way for parents to be able to see how
    # many volunteer hours they have completed? ... keep it private so not
    # everyone sees everyone elses." One number per family, kept by staff.
    # These reads name their columns so the number can only leave through the
    # guardian-only read below; the family directory never selects it.

    def guardian_household_ids(self, user_id: str, organization_id: str) -> List[str]:
        """The households at one school where this user is a guardian."""
        from config.constants import GUARDIAN_RELATIONSHIPS
        rows = (
            self.client.table('household_members')
            .select('household_id, relationship, households!inner(organization_id)')
            .eq('user_id', user_id)
            .execute()
        ).data or []
        return [r['household_id'] for r in rows
                if r.get('relationship') in GUARDIAN_RELATIONSHIPS
                and (r.get('households') or {}).get('organization_id') == organization_id]

    def volunteer_hours_for(self, household_ids: List[str],
                            organization_id: str) -> List[Dict[str, Any]]:
        if not household_ids:
            return []
        return (
            self.client.table(self.table_name)
            .select('id, name, volunteer_hours, volunteer_hours_updated_at')
            .in_('id', household_ids)
            .eq('organization_id', organization_id)
            .execute()
        ).data or []

    def org_records_volunteer_hours(self, organization_id: str) -> bool:
        """Has staff entered hours for ANY family at this school? Answers yes
        or no only -- never whose, never how many."""
        rows = (
            self.client.table(self.table_name)
            .select('id')
            .eq('organization_id', organization_id)
            .gt('volunteer_hours', 0)
            .limit(1)
            .execute()
        ).data or []
        return bool(rows)
