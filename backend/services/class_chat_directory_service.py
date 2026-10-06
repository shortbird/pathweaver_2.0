"""
"All class chats": the office's one list of every class chat at the school.

Ticket bbb477db ("Did you remove the class chats? helpful for admins to see in
one place"). My messages lists the class chats the caller is a MEMBER of, and
an admin is only made a member when they open a class's Messages tab. So an
admin saw the chats of the classes they had happened to open, and nothing
else. This lists every chat with a source_class_id at the caller's school, and
opening one joins the admin the same way the class Messages tab does
(class_group_sync_service.ensure_admin_member), so the chat then opens in My
messages like any other.

Counted with count='exact' and paged with range(): never counted in Python
(CLAUDE.md, PostgREST truncates at 1,000 rows without saying so).
"""

import re
from typing import Any, Dict, List, Optional

from utils.logger import get_logger

logger = get_logger(__name__)

# admin client justified: an org admin reads the school's class chats, which
#   they are not yet a member of; the routes are ADMIN_ROLES-gated and every
#   read and write is scoped to the caller's org
from utils.admin_client import admin_client as _admin

MAX_PER_PAGE = 100
DEFAULT_PER_PAGE = 50
KIND = {'family': 'parent', 'student': 'student'}


def _search_term(q: Optional[str]) -> str:
    """A search safe inside a PostgREST or() filter: no commas, parentheses,
    wildcards or quotes, which that syntax would read as structure."""
    return re.sub(r'[,()%*"\\:]', ' ', (q or '')).strip()[:80]


def list_class_chats(org_id: str, q: Optional[str] = None, page: int = 1,
                     per_page: int = DEFAULT_PER_PAGE) -> Dict[str, Any]:
    from repositories.group_repository import GroupRepository
    from repositories.sis_class_repository import SisClassRepository

    page = max(1, int(page or 1))
    per_page = max(1, min(MAX_PER_PAGE, int(per_page or DEFAULT_PER_PAGE)))
    admin = _admin()
    classes = SisClassRepository(client=admin)

    or_filter = None
    term = _search_term(q)
    if term:
        # The chat's name, or its class's name: a renamed chat is still found
        # by the class it belongs to.
        ors = [f'name.ilike.%{term}%']
        class_ids = classes.ids_matching_name(org_id, term, limit=MAX_PER_PAGE)
        if class_ids:
            ors.append(f"source_class_id.in.({','.join(class_ids)})")
        or_filter = ','.join(ors)

    rows, total = GroupRepository(client=admin).class_chats_page(
        org_id, or_filter=or_filter, offset=(page - 1) * per_page, limit=per_page)
    names = classes.names_in_org(org_id, [r.get('source_class_id') or '' for r in rows])

    chats: List[Dict[str, Any]] = [{
        'id': r['id'],
        'name': r.get('name') or '',
        'class_id': r.get('source_class_id'),
        'class_name': names.get(r.get('source_class_id') or '', ''),
        'kind': KIND.get(r.get('audience') or '', r.get('audience')),
        'audience': r.get('audience'),
        'last_message_at': r.get('last_message_at'),
        'last_message_preview': r.get('last_message_preview'),
    } for r in rows]
    return {'chats': chats, 'total': total, 'page': page, 'per_page': per_page}


def open_class_chat(org_id: str, group_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    """Join the admin to one class chat of THIS school and return it, or None
    when it is not a class chat here (nothing is written then)."""
    from repositories.group_repository import GroupRepository
    from repositories.sis_class_repository import SisClassRepository
    from services.class_group_sync_service import ensure_admin_member

    admin = _admin()
    group = GroupRepository(client=admin).class_chat(group_id)
    if not group or not group.get('source_class_id'):
        return None
    # The class, not the group row, decides the school: the class is what the
    # admin's role covers.
    if not SisClassRepository(client=admin).names_in_org(org_id, [group['source_class_id']]):
        return None
    ensure_admin_member(group_id, user_id, admin=admin)
    return group
