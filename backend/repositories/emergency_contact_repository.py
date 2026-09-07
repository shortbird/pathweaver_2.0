"""
Emergency Contact Repository - who to call for a student.

One row per (student, contact), ordered by `priority` — priority 1 is the first
person the office rings. Written by the registration funnel and by the SIS
family screens; read here in bulk for the printable emergency sheet.
"""

from typing import Any, Dict, List

from repositories.base_repository import BaseRepository
from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger

logger = get_logger(__name__)


class EmergencyContactRepository(BaseRepository):
    table_name = 'emergency_contacts'

    def for_students(self, student_ids: List[str]) -> Dict[str, List[Dict[str, Any]]]:
        """{student_user_id: [contact, ...]} in priority order.

        Paged: a school has several contacts per child, so this read grows with
        enrollment. Truncated at the cap it would drop whole families' contacts
        off the emergency sheet without saying so.
        """
        ids = sorted({s for s in (student_ids or []) if s})
        if not ids:
            return {}
        rows = fetch_all_rows(lambda: (
            self.client.table(self.table_name)
            .select('student_user_id, name, relationship, phone, email, priority, can_pickup')
            .in_('student_user_id', ids)
            .order('priority', desc=False)
        ))
        out: Dict[str, List[Dict[str, Any]]] = {}
        for c in rows:
            out.setdefault(c['student_user_id'], []).append(c)
        return out
