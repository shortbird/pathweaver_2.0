"""
SIS Catalog Service - composed reads for the unified Class (org_classes).

Hydrates enrollment counts / capacity / schedule so the SIS console can render the
Classes manager in a few queries. Write paths use SisClassRepository directly from
the routes. Admin (service_role) client: the SIS tables are RLS-locked to
backend-only, same justification as sis_service.py.
"""

from typing import Dict, List, Any, Optional

from database import get_supabase_admin_client
from repositories.sis_class_repository import SisClassRepository
from utils.logger import get_logger

logger = get_logger(__name__)

BILLING_TYPES = ('flat', 'per_class', 'recurring')
BILLING_CADENCES = ('monthly', 'semester', 'full')
REGISTRATION_STATUSES = ('open', 'closed')


def _admin():
    return get_supabase_admin_client()


def _classes_repo() -> SisClassRepository:
    return SisClassRepository(client=_admin())


def spots_left(capacity: Optional[int], enrolled: int) -> Optional[int]:
    """Remaining seats, or None when capacity is unlimited (null)."""
    if capacity is None:
        return None
    return max(0, capacity - enrolled)


def is_full(capacity: Optional[int], enrolled: int) -> bool:
    """A class is full only when it has a finite capacity that is met or exceeded."""
    if capacity is None:
        return False
    return enrolled >= capacity


def list_classes(org_id: str, include_archived: bool = False) -> List[Dict[str, Any]]:
    repo = _classes_repo()
    classes = repo.list_for_org(org_id, include_archived=include_archived)
    if not classes:
        return []
    class_ids = [c['id'] for c in classes]
    enrollment_counts = repo.enrollment_counts_for_classes(class_ids)
    meetings = repo.meetings_for_classes(class_ids)
    meetings_by_class: Dict[str, List[Dict[str, Any]]] = {}
    for m in meetings:
        meetings_by_class.setdefault(m['class_id'], []).append(m)

    out = []
    for c in classes:
        enrolled = enrollment_counts.get(c['id'], 0)
        cap = c.get('capacity')
        out.append({
            **c,
            'enrolled_count': enrolled,
            'spots_left': spots_left(cap, enrolled),
            'is_full': is_full(cap, enrolled),
            'meetings': meetings_by_class.get(c['id'], []),
        })
    return out


def get_class_detail(org_id: str, class_id: str) -> Optional[Dict[str, Any]]:
    repo = _classes_repo()
    cls = repo.find_by_id(class_id)
    if not cls or cls.get('organization_id') != org_id:
        return None
    enrolled = repo.active_enrollment_count(class_id)
    cap = cls.get('capacity')
    cls['enrolled_count'] = enrolled
    cls['spots_left'] = spots_left(cap, enrolled)
    cls['is_full'] = is_full(cap, enrolled)
    cls['meetings'] = repo.list_meetings(class_id)
    cls['prerequisites'] = repo.list_prerequisites(class_id)
    return cls
