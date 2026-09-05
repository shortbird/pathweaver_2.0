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
from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger

logger = get_logger(__name__)

# org_classes columns a SIS staff user may set (the LMS-owned name/description/
# xp_threshold/status are still editable through the existing class CRUD).
SIS_CLASS_FIELDS = (
    'capacity', 'primary_instructor_id', 'assistant_instructor_ids',
    # Whether families see the assistant's name. Staff views ignore it.
    'show_assistants', 'is_visible_to_parents', 'price_cents',
    'billing_type', 'billing_cadence', 'min_age', 'max_age', 'location',
    # The rest of the space a class takes up, beyond its primary room. Both are
    # booked for its hour, so the double-booking check reads all of them
    # (43625a45). `location` stays what every existing reader shows.
    'additional_locations',
    'waitlist_enabled', 'registration_status', 'requires_full_day',
    # iCreate catalog extras (display-only): a class image + an optional supply fee.
    'image_url', 'supply_fee',
    # Per-class override for the tuition-funded materials allowance, in dollars
    # per enrolled student per year. NULL falls back to the org default.
    'supply_budget_per_student',
    # Staff-only scratchpad. sis_catalog_service strips it from every
    # non-staff audience — keep it in STAFF_ONLY_FIELDS there or it leaks.
    'internal_notes',
)


class SisClassRepository(BaseRepository):
    table_name = 'org_classes'

    # ── Classes (org_classes) ────────────────────────────────────────────────
    def list_for_org(self, organization_id: str,
                     include_archived: bool = False) -> List[Dict[str, Any]]:
        def build():
            query = (
                self.client.table(self.table_name)
                .select('*')
                .eq('organization_id', organization_id)
            )
            return query if include_archived else query.neq('status', 'archived')

        # Paged by id (unique, so pages can't skip or repeat), then sorted by
        # name for display — a silently truncated read would drop classes off
        # the end of the catalog entirely.
        rows = fetch_all_rows(build)
        return sorted(rows, key=lambda c: (c.get('name') or '').lower())

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

    def restore(self, class_id: str) -> Optional[Dict[str, Any]]:
        """Bring an archived class back to active. Enrollments stay withdrawn
        (they were dropped on archive); staff re-enroll as needed."""
        resp = (
            self.client.table(self.table_name)
            .update({'status': 'active'})
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
        """active enrollment count per class_id.

        Paged: an org's enrollments run past PostgREST's per-response row cap
        once the school is big enough, and the truncation is silent. Tallying a
        truncated read made the class list under-report — counts *fell* as more
        families enrolled, and a full class read 0/12 while its roster still
        listed twelve students (iCreate, 2026-07-29).
        """
        if not class_ids:
            return {}
        rows = fetch_all_rows(lambda: (
            self.client.table('class_enrollments')
            .select('id, class_id')
            .in_('class_id', class_ids)
            .eq('status', 'active')
        ))
        counts: Dict[str, int] = {}
        for row in rows:
            counts[row['class_id']] = counts.get(row['class_id'], 0) + 1
        return counts

    def waitlist_counts_for_classes(self, class_ids: List[str]) -> Dict[str, int]:
        """waiting/offered waitlist entries per class_id. Paged for the same
        reason as enrollment_counts_for_classes."""
        return {cid: c['waiting'] + c['offered']
                for cid, c in self.waitlist_breakdown_for_classes(class_ids).items()}

    def waitlist_breakdown_for_classes(self, class_ids: List[str]) -> Dict[str, Dict[str, int]]:
        """{class_id: {waiting, offered}} — the live queue, split by state.

        The split matters because only a *waiting* entry can be offered a seat.
        A class whose whole waitlist is already offered showed "Waitlist 1" next
        to an Offer-next-seat button that answered "no one is waiting" (iCreate,
        2026-07-31). Paged, like every other org-wide read here.
        """
        if not class_ids:
            return {}
        rows = fetch_all_rows(lambda: (
            self.client.table('sis_waitlist_entries')
            .select('id, class_id, status')
            .in_('class_id', class_ids)
            .in_('status', ['waiting', 'offered'])
        ))
        counts: Dict[str, Dict[str, int]] = {}
        for row in rows:
            bucket = counts.setdefault(row['class_id'], {'waiting': 0, 'offered': 0})
            key = 'offered' if row.get('status') == 'offered' else 'waiting'
            bucket[key] += 1
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
        """Every meeting for the given classes. Paged — a truncated read would
        silently blank out the day/time on the classes past the cut."""
        if not class_ids:
            return []
        return fetch_all_rows(lambda: (
            self.client.table('class_meetings')
            .select('*')
            .in_('class_id', class_ids)
        ))

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
        # Adding the same slot twice is a double submit, not a second meeting:
        # every schedule view draws one block per meeting row, so a duplicate
        # shows the class twice on the family's timetable while the roster still
        # shows one seat (iCreate, 2026-08-26). A unique index now backs this;
        # returning the existing row keeps a repeat submit a no-op rather than a
        # 500.
        existing = (
            self.client.table('class_meetings')
            .select('*')
            .eq('class_id', class_id)
            .eq('start_time', payload['start_time'])
        )
        if payload['day_of_week'] is None:
            existing = existing.is_('day_of_week', 'null')
        else:
            existing = existing.eq('day_of_week', payload['day_of_week'])
        if payload['specific_date'] is None:
            existing = existing.is_('specific_date', 'null')
        else:
            existing = existing.eq('specific_date', payload['specific_date'])
        found = existing.limit(1).execute().data
        if found:
            return found[0]

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
