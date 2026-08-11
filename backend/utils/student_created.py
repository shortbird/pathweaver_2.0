"""
"Student-created" quest annotation.

A quest counts as student-created when its creator is a student (platform
`role='student'`, or org-managed with `org_role='student'`), or when it is
manually flagged via `quests.metadata.student_created = true` — the manual
flag covers quests entered by staff on a student's behalf (e.g. "Build a
Hobbit Hole", which the superadmin created for a student's project).

The frontend renders the badge from the `student_created` boolean this adds.
"""

from typing import Any, Dict, List

from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)


def _is_student(user_row: Dict[str, Any]) -> bool:
    role = user_row.get('role')
    return role == 'student' or (
        role == 'org_managed' and user_row.get('org_role') == 'student'
    )


def annotate_student_created(quests: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Set `student_created: bool` on each quest dict (in place; also returned).

    One batch users read for the whole page — never per-quest queries.
    On any lookup failure the flag defaults to the metadata-only signal so a
    users-table hiccup can't 500 the quest list.
    """
    metadata_flagged = set()
    creator_ids = set()
    for q in quests:
        meta = q.get('metadata') or {}
        if isinstance(meta, dict) and meta.get('student_created') is True:
            metadata_flagged.add(q.get('id'))
        elif q.get('created_by'):
            creator_ids.add(q['created_by'])

    student_creators = set()
    if creator_ids:
        try:
            # admin client justified: reads other users' role columns to badge
            # student-created quests; RLS hides those rows from the viewer.
            admin = get_supabase_admin_client()
            resp = admin.table('users') \
                .select('id, role, org_role') \
                .in_('id', list(creator_ids)) \
                .execute()
            student_creators = {u['id'] for u in (resp.data or []) if _is_student(u)}
        except Exception as e:
            logger.error(f"student_created annotation lookup failed: {e}")

    for q in quests:
        q['student_created'] = (
            q.get('id') in metadata_flagged
            or (q.get('created_by') in student_creators)
        )
    return quests
