"""One child list for a guardian, from the one definition of parent.

Before 2026-09-15 a guardian's children were listed five ways by five
endpoints, each with its own query: /api/parents/my-children read approved
parent_student_links, /api/dependents/my-dependents called the SQL function
get_parent_dependents (managed profiles plus approved links, no households),
and three more each read a different pair. The mobile Family tab was fed by
the SQL function alone, so a family that registered through the SIS funnel --
a household row and nothing else -- had a child who opened on the web and was
missing from the app.

This service composes utils.class_membership.links_of_parent (all three links,
per child) with repositories.family_repository (the user rows, one quest tally,
avatar signing) into the shape /api/family/children returns. The two older
endpoints are adapters over it, so installed mobile builds that still call
my-dependents get the household fix without a release.
"""

from datetime import date, datetime
from typing import Any, Dict, List, Optional

from repositories.family_repository import FamilyRepository
from utils.class_membership import links_of_parent
from utils.logger import get_logger
from utils.storage_urls import sign_in_place

logger = get_logger(__name__)

# admin client justified: the family is derived server-side from links_of_parent,
#   so only rows the guardian is linked to are ever read; the child rows are
#   the guardian's own children, whom RLS does not let a parent select directly
from utils.admin_client import admin_client as _admin


def _parse_date(value: Any) -> Optional[date]:
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return datetime.strptime(str(value)[:10], '%Y-%m-%d').date()
    except ValueError:
        return None


def _age(date_of_birth: Any, today: Optional[date] = None) -> Optional[int]:
    born = _parse_date(date_of_birth)
    if not born:
        return None
    today = today or date.today()
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


def display_name_of(row: Dict[str, Any]) -> str:
    """The same fallback chain the retired SQL function used: display name,
    then first + last, then email, then 'Student'."""
    for candidate in (
        (row.get('display_name') or '').strip(),
        f"{row.get('first_name') or ''} {row.get('last_name') or ''}".strip(),
        (row.get('email') or '').strip(),
    ):
        if candidate:
            return candidate
    return 'Student'


def _child(row: Dict[str, Any], parent_id: str, links: Dict[str, bool],
           active_quests: int, today: date) -> Dict[str, Any]:
    eligible_at = _parse_date(row.get('promotion_eligible_at'))
    return {
        'id': row['id'],
        'first_name': row.get('first_name') or '',
        'last_name': row.get('last_name') or '',
        'display_name': display_name_of(row),
        'name': display_name_of(row),
        'preferred_name': row.get('preferred_name'),
        'username': row.get('username'),
        'email': row.get('email'),
        'avatar_url': row.get('avatar_url'),
        'date_of_birth': row.get('date_of_birth'),
        'age': _age(row.get('date_of_birth'), today),
        'is_dependent': bool(row.get('is_dependent')),
        'managed_by_me': row.get('managed_by_parent_id') == parent_id,
        'promotion_eligible': bool(row.get('is_dependent')) and eligible_at is not None and eligible_at <= today,
        'organization_id': row.get('organization_id'),
        'total_xp': row.get('total_xp') or 0,
        'level': row.get('level') or 1,
        'active_quest_count': active_quests,
        'links': dict(links),
        'ai_features_enabled': bool(row.get('ai_features_enabled')),
        'ai_chatbot_enabled': row.get('ai_chatbot_enabled') is not False,
        'ai_lesson_helper_enabled': row.get('ai_lesson_helper_enabled') is not False,
        'ai_task_generation_enabled': row.get('ai_task_generation_enabled') is not False,
        # Every parent surface renders a child as a student; the observer list
        # carries other roles, and mobile's Child type has the field.
        'role': 'student',
    }


def children_of(parent_id: str, today: Optional[date] = None) -> List[Dict[str, Any]]:
    """Every child of this guardian, hydrated, avatars signed, sorted by name.
    Empty for anyone who is nobody's guardian -- that is an answer, not an
    error, so a student or a staff member without a family gets []."""
    if not parent_id:
        return []
    links = links_of_parent(parent_id)
    if not links:
        return []
    today = today or date.today()
    repo = FamilyRepository(client=_admin())
    rows = repo.children_rows(links)
    counts = repo.active_quest_counts(rows)
    children = [
        _child(rows[cid], parent_id, links[cid], counts.get(cid, 0), today)
        for cid in links if cid in rows
    ]
    children.sort(key=lambda c: (c['first_name'].lower(), c['last_name'].lower(), c['id']))
    # Child photos live in a private bucket; one batch for the family.
    sign_in_place(children, ['avatar_url'])
    return children


def as_dependent_rows(children: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """The shape /api/dependents/my-dependents always returned (a superset of
    it: the new fields ride along). Installed mobile builds read this."""
    return children


def as_linked_rows(children: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """The shape /api/parents/my-children always returned, for the children
    who hold an approved parent_student_links row."""
    out = []
    for c in children:
        if not c['links'].get('linked'):
            continue
        out.append({
            'student_id': c['id'],
            'student_first_name': c['first_name'],
            'student_last_name': c['last_name'],
            'student_avatar_url': c['avatar_url'],
            'avatar_url': c['avatar_url'],
            'date_of_birth': c['date_of_birth'],
            'student_level': c['level'],
            'student_total_xp': c['total_xp'],
            'ai_features_enabled': c['ai_features_enabled'],
            'ai_chatbot_enabled': c['ai_chatbot_enabled'],
            'ai_lesson_helper_enabled': c['ai_lesson_helper_enabled'],
            'ai_task_generation_enabled': c['ai_task_generation_enabled'],
        })
    return out
