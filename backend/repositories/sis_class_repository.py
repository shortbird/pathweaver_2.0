"""
SIS Class Repository - data access for the unified "Class" (org_classes) SIS fields,
plus its schedule (class_meetings) and eligibility (class_prerequisites).

The unified Class lives in org_classes (it already carries roster via
class_enrollments, instructors via class_advisors, content via class_quests). This
repository manages the SIS *operational* columns added in
20260626_sis_programs_and_class_extensions.sql (program_id, capacity, price, schedule,
eligibility) WITHOUT touching the existing LMS class CRUD (routes/classes/*). Reads
that compose enrollment counts + schedule live in services/sis_catalog_service.py.
"""

from typing import Optional, Dict, List, Any

from repositories.base_repository import BaseRepository
from utils.logger import get_logger

logger = get_logger(__name__)

# org_classes columns a SIS staff user may set (the LMS-owned name/description/
# xp_threshold/status are still editable through the existing class CRUD).
SIS_CLASS_FIELDS = (
    'capacity', 'primary_instructor_id', 'price_cents',
    'billing_type', 'billing_cadence', 'min_age', 'max_age', 'location',
    'waitlist_enabled', 'registration_status',
    # iCreate catalog extras (display-only): a class image + an optional supply fee.
    'image_url', 'supply_fee',
)


class SisClassRepository(BaseRepository):
    table_name = 'org_classes'

    # ── Classes (org_classes) ────────────────────────────────────────────────
    def list_for_org(self, organization_id: str,
                     include_archived: bool = False) -> List[Dict[str, Any]]:
        query = (
            self.client.table(self.table_name)
            .select('*')
            .eq('organization_id', organization_id)
        )
        if not include_archived:
            query = query.neq('status', 'archived')
        resp = query.order('name').execute()
        return resp.data or []

    def create_for_org(self, organization_id: str, created_by: str,
                       fields: Dict[str, Any]) -> Dict[str, Any]:
        payload = {
            'organization_id': organization_id,
            'created_by': created_by,
            'name': fields.get('name'),
            'description': fields.get('description'),
        }
        for k in SIS_CLASS_FIELDS:
            if fields.get(k) is not None:
                payload[k] = fields[k]
        resp = self.client.table(self.table_name).insert(payload).execute()
        return resp.data[0] if resp.data else None

    def update_sis_fields(self, class_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        from datetime import datetime, timezone
        payload = {k: fields[k] for k in SIS_CLASS_FIELDS if k in fields}
        # name/description are LMS-owned but convenient to edit here too
        for k in ('name', 'description'):
            if k in fields:
                payload[k] = fields[k]
        if not payload:
            return self.find_by_id(class_id)
        payload['updated_at'] = datetime.now(timezone.utc).isoformat()
        resp = (
            self.client.table(self.table_name)
            .update(payload)
            .eq('id', class_id)
            .execute()
        )
        return resp.data[0] if resp.data else None

    def archive(self, class_id: str) -> Optional[Dict[str, Any]]:
        resp = (
            self.client.table(self.table_name)
            .update({'status': 'archived'})
            .eq('id', class_id)
            .execute()
        )
        return resp.data[0] if resp.data else None

    def active_enrollment_count(self, class_id: str) -> int:
        resp = (
            self.client.table('class_enrollments')
            .select('id', count='exact')
            .eq('class_id', class_id)
            .eq('status', 'active')
            .execute()
        )
        return resp.count or 0

    def enrollment_counts_for_classes(self, class_ids: List[str]) -> Dict[str, int]:
        """active enrollment count per class_id in one query."""
        if not class_ids:
            return {}
        resp = (
            self.client.table('class_enrollments')
            .select('class_id')
            .in_('class_id', class_ids)
            .eq('status', 'active')
            .execute()
        )
        counts: Dict[str, int] = {}
        for row in (resp.data or []):
            counts[row['class_id']] = counts.get(row['class_id'], 0) + 1
        return counts

    # ── Meetings (class_meetings) ────────────────────────────────────────────
    def list_meetings(self, class_id: str) -> List[Dict[str, Any]]:
        resp = (
            self.client.table('class_meetings')
            .select('*')
            .eq('class_id', class_id)
            .order('day_of_week')
            .execute()
        )
        return resp.data or []

    def meetings_for_classes(self, class_ids: List[str]) -> List[Dict[str, Any]]:
        if not class_ids:
            return []
        resp = (
            self.client.table('class_meetings')
            .select('*')
            .in_('class_id', class_ids)
            .execute()
        )
        return resp.data or []

    def add_meeting(self, class_id: str, organization_id: str,
                    fields: Dict[str, Any]) -> Dict[str, Any]:
        payload = {
            'class_id': class_id,
            'organization_id': organization_id,
            'day_of_week': fields.get('day_of_week'),
            'specific_date': fields.get('specific_date'),
            'start_time': fields.get('start_time'),
            'end_time': fields.get('end_time'),
            'location': fields.get('location'),
        }
        resp = self.client.table('class_meetings').insert(payload).execute()
        return resp.data[0] if resp.data else None

    def delete_meeting(self, meeting_id: str) -> None:
        self.client.table('class_meetings').delete().eq('id', meeting_id).execute()

    # ── Prerequisites (class_prerequisites) ──────────────────────────────────
    def list_prerequisites(self, class_id: str) -> List[Dict[str, Any]]:
        resp = (
            self.client.table('class_prerequisites')
            .select('*')
            .eq('class_id', class_id)
            .execute()
        )
        return resp.data or []

    def add_prerequisite(self, class_id: str, fields: Dict[str, Any]) -> Dict[str, Any]:
        payload = {
            'class_id': class_id,
            'prerequisite_class_id': fields.get('prerequisite_class_id'),
            'note': fields.get('note'),
        }
        resp = self.client.table('class_prerequisites').insert(payload).execute()
        return resp.data[0] if resp.data else None

    def delete_prerequisite(self, prerequisite_id: str) -> None:
        self.client.table('class_prerequisites').delete().eq('id', prerequisite_id).execute()
