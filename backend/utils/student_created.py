"""
"Student-created" quest annotation.

A quest counts as student-created when its creator is a student (platform
`role='student'`, or org-managed with `org_role='student'`), or when it is
manually flagged via `quests.metadata.student_created = true` — the manual
flag covers quests entered by staff on a student's behalf (e.g. "Build a
Hobbit Hole", which the superadmin created for a student's project).

A quest a guardian made on the child's account is NOT student-created, even
though `quests.created_by` is the child (ticket 41a29c4f: a parent asked why
every quest she made for her daughter said "Student-created"). Two signals:

  - `quests.metadata.created_by_user_id`: who actually pressed Create, written
    by POST /api/quests/create when the request is delegated (family scope).
    Set and different from `created_by` -> somebody else made it.
  - Legacy rows, made before that key existed: the creator's own enrollment
    carries `user_quests.enrolled_by_user_id` = one of the student's guardians
    (utils.class_membership.guardians_by_student). The create route has
    recorded the parent there since 2026-09-14.

The frontend renders the badge from the `student_created` boolean this adds.
"""

from typing import Any, Dict, List, Set

from database import get_supabase_admin_client
from utils.class_membership import guardians_by_student
from utils.logger import get_logger

logger = get_logger(__name__)

_CHUNK = 100


def _is_student(user_row: Dict[str, Any]) -> bool:
    role = user_row.get('role')
    return role == 'student' or (
        role == 'org_managed' and user_row.get('org_role') == 'student'
    )


def _made_by_someone_else(quest: Dict[str, Any]) -> bool:
    """The create route recorded a different person than `created_by`."""
    meta = quest.get('metadata') or {}
    maker = meta.get('created_by_user_id') if isinstance(meta, dict) else None
    return bool(maker) and maker != quest.get('created_by')


def _guardian_made_legacy(admin, quests: List[Dict[str, Any]]) -> Set[str]:
    """Quest ids whose student creator was enrolled in them by a guardian.

    Covers quests made in family scope before the create route wrote
    metadata.created_by_user_id. One user_quests read for the page, then one
    guardians_by_student batch only when some enrollment names another person.
    """
    creator_of = {q['id']: q['created_by'] for q in quests if q.get('id') and q.get('created_by')}
    if not creator_of:
        return set()
    quest_ids = list(creator_of)
    rows: List[Dict[str, Any]] = []
    # Chunked: a long id list overflows the request URL (PostgREST 400s).
    for i in range(0, len(quest_ids), _CHUNK):
        rows += admin.table('user_quests') \
            .select('quest_id, user_id, enrolled_by_user_id') \
            .in_('quest_id', quest_ids[i:i + _CHUNK]) \
            .not_.is_('enrolled_by_user_id', 'null') \
            .execute().data or []
    # (quest_id, student_id, enrolled_by) where the student is the quest's creator.
    pairs = [
        (r['quest_id'], r['user_id'], r['enrolled_by_user_id'])
        for r in rows
        if r.get('user_id') == creator_of.get(r.get('quest_id'))
        and r.get('enrolled_by_user_id') and r['enrolled_by_user_id'] != r['user_id']
    ]
    if not pairs:
        return set()
    guardians = guardians_by_student({sid for _, sid, _ in pairs})
    return {qid for qid, sid, by in pairs if by in guardians.get(sid, set())}


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
        elif q.get('created_by') and not _made_by_someone_else(q):
            creator_ids.add(q['created_by'])

    student_creators = set()
    guardian_made: Set[str] = set()
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

        candidates = [
            q for q in quests
            if q.get('id') not in metadata_flagged
            and q.get('created_by') in student_creators
            and not _made_by_someone_else(q)
        ]
        if candidates:
            try:
                guardian_made = _guardian_made_legacy(admin, candidates)
            except Exception as e:
                # Fails toward the old answer (badge shown), never a 500.
                logger.warning(f"student_created guardian lookup failed: {e}")

    for q in quests:
        q['student_created'] = (
            q.get('id') in metadata_flagged
            or (
                q.get('created_by') in student_creators
                and not _made_by_someone_else(q)
                and q.get('id') not in guardian_made
            )
        )
    return quests
