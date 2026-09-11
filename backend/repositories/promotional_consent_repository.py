"""Data access for `promotional_consents` -- who said a student's work may be shown.

One active row per student (partial unique index). Revocation keeps the row and
stamps `revoked_at`, so the history of who consented and when survives the
withdrawal, which is what Terms Section 9 promised.

The rules about WHO may grant (an adult for themselves, a parent, an org admin
where there is no parent, a superadmin recording a signed form) live in
services/stories/consent_service.py and in the database trigger. This module
only reads and writes rows.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from repositories.base_repository import BaseRepository

COLUMNS = (
    'id, student_user_id, granted_by_user_id, recorded_by_user_id, approver_kind, '
    'scope_work, scope_first_name, scope_image_voice, scope_age, source, source_ref, '
    'notes, granted_at, revoked_at, revoked_by_user_id, created_at, updated_at'
)


class PromotionalConsentRepository(BaseRepository):
    table_name = 'promotional_consents'

    def __init__(self, client: Any = None):
        # admin client justified: service-role-only table; every caller is a
        # superadmin route or a background job acting on a consent a parent or
        # adult already gave, and the row names a student the caller cannot
        # otherwise read under RLS.
        super().__init__(user_id=None, client=client)

    def get(self, consent_id: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table(self.table_name).select(COLUMNS).eq(
            'id', consent_id).limit(1).execute().data
        return rows[0] if rows else None

    def active_for_student(self, student_id: str) -> Optional[Dict[str, Any]]:
        """The one live consent, or None. Revoked rows are history, not consent."""
        rows = self.client.table(self.table_name).select(COLUMNS).eq(
            'student_user_id', student_id).is_('revoked_at', 'null').limit(1).execute().data
        return rows[0] if rows else None

    def list_for_student(self, student_id: str) -> List[Dict[str, Any]]:
        return self.client.table(self.table_name).select(COLUMNS).eq(
            'student_user_id', student_id).order('granted_at', desc=True).execute().data or []

    def create(self, row: Dict[str, Any]) -> Dict[str, Any]:
        inserted = self.client.table(self.table_name).insert(row).execute().data
        return inserted[0] if inserted else dict(row)

    def revoke(self, consent_id: str, *, revoked_by: Optional[str],
               revoked_at: str) -> Optional[Dict[str, Any]]:
        """Stamp the revocation. Filtered on revoked_at IS NULL so a second
        revoke is a no-op rather than a rewrite of who withdrew it."""
        rows = self.client.table(self.table_name).update({
            'revoked_at': revoked_at,
            'revoked_by_user_id': revoked_by,
        }).eq('id', consent_id).is_('revoked_at', 'null').execute().data
        return rows[0] if rows else None
