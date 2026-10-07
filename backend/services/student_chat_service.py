"""A school's Student Chat switch (the `student_chat` module).

Ticket 81cc92e6, from Horizon: "An option to turn off in-app chat would help,
because it can pull students away from their work and bury teacher feedback."
Owner decision: one school-level switch, on by default.

Off, for a STUDENT of that school:

  * class Student Chats (group_conversations with audience='student' and a
    source_class_id -- class_group_sync_service makes one per class) leave
    the student's Messages list and both unread counts, and reading or
    sending in one is refused;
  * friend DMs (two students, opened by the Friends rule in
    DirectMessageService.can_message_user) are refused both ways and leave
    the list.

What it does NOT touch, because the point of the request is that teacher
feedback still arrives: DMs with a teacher, an advisor, the office, a parent
or the school inbox, and teacher-made groups that are not a class Student
Chat. Staff are unaffected -- a teacher can still read a class's student chat
history. Nothing is deleted: turning the switch back on brings every group
and thread back as it was.

The switch is stored as feature_flags.modules.student_chat (no legacy source,
so sis_settings.hidden_modules never applies to it) and written by the org
admin's settings card through set_enabled, which goes through the same
modules.toggle path as the superadmin Blocks panel.
"""

from typing import Any, Dict, Iterable, Optional, Set

from modules.enabled import module_enabled
from utils.logger import get_logger

# admin client justified: reads role columns of message participants and
#   the org's gating row to make an access decision; no user context here
#   (the caller is the messaging service, which already runs as admin).
from utils.admin_client import admin_client as _admin

logger = get_logger(__name__)

MODULE_KEY = 'student_chat'

#: The refusal a student sees. Plain words: they did nothing wrong, the
#: school turned it off, and teacher messages are not affected.
CLOSED_MESSAGE = ('Student chat is turned off at your school. '
                  'Messages from your teachers and the school still reach you.')




def _user_rows(user_ids: Iterable[str]) -> Dict[str, Dict[str, Any]]:
    """{id: row} with the columns the role decision needs. Cached per request:
    one Messages load asks about the same people many times."""
    ids = [u for u in dict.fromkeys(user_ids) if u]
    if not ids:
        return {}
    cache: Optional[Dict[str, Any]] = None
    try:
        from flask import g, has_app_context
        if has_app_context():
            cache = g.setdefault('_student_chat_users', {})
    except ImportError:
        cache = None
    out: Dict[str, Dict[str, Any]] = {}
    missing = []
    for uid in ids:
        if cache is not None and uid in cache:
            if cache[uid] is not None:
                out[uid] = cache[uid]
        else:
            missing.append(uid)
    if missing:
        from repositories.user_repository import UserRepository
        rows = UserRepository(client=_admin()).find_by_ids(
            missing, 'id, role, org_role, org_roles, organization_id')
        for uid in missing:
            row = rows.get(uid)
            if cache is not None:
                cache[uid] = row
            if row:
                out[uid] = row
    return out


def _is_student(row: Optional[Dict[str, Any]]) -> bool:
    if not row:
        return False
    from utils.roles import get_effective_role
    return get_effective_role(row) == 'student'


def _closed_for_row(row: Optional[Dict[str, Any]]) -> bool:
    if not row or not _is_student(row):
        return False
    org_id = row.get('organization_id')
    # A platform student (no org) has no school switch above them.
    return bool(org_id) and not module_enabled(org_id, MODULE_KEY)


def closed_for(user_id: str) -> bool:
    """True when `user_id` is a student whose school turned Student Chat off.

    Fails OPEN (False) on a read error: this switch is a focus setting, not a
    safety control -- the child-safety screens run on every student message
    regardless -- and a flags hiccup must not take a student's Messages page
    down with it."""
    try:
        return _closed_for_row(_user_rows([user_id]).get(user_id))
    except Exception as e:  # noqa: BLE001
        logger.warning(f'student_chat check failed for {user_id}: {e}')
        return False


def student_ids(user_ids: Iterable[str]) -> Set[str]:
    """Which of these accounts are students."""
    try:
        return {uid for uid, row in _user_rows(user_ids).items() if _is_student(row)}
    except Exception as e:  # noqa: BLE001
        logger.warning(f'student_chat role lookup failed: {e}')
        return set()


def is_class_student_chat(group: Optional[Dict[str, Any]]) -> bool:
    """A class's Student Chat: the student-audience group the class sync made.
    A teacher's own group with students in it also carries audience='student'
    but no source_class_id, and stays open -- it is the teacher's channel."""
    if not group:
        return False
    return group.get('audience') == 'student' and bool(group.get('source_class_id'))


def friend_thread_closed(user_id: str, other_id: str) -> bool:
    """True when this is a student-to-student thread and either student's
    school turned Student Chat off. Both sides count: a friend at another
    school must not be able to keep writing into a closed student's inbox."""
    try:
        rows = _user_rows([user_id, other_id])
        return friend_rows_closed(rows.get(user_id), rows.get(other_id))
    except Exception as e:  # noqa: BLE001
        logger.warning(f'student_chat friend check failed ({user_id}/{other_id}): {e}')
        return False


def friend_rows_closed(a: Optional[Dict[str, Any]], b: Optional[Dict[str, Any]]) -> bool:
    """friend_thread_closed for two user rows the caller already read
    (role, org_role, organization_id). Reads only the org flags, and only
    when both are students of a school."""
    if not (_is_student(a) and _is_student(b)):
        return False
    return _closed_for_row(a) or _closed_for_row(b)


# ---------------------------------------------------------------------------
# The org admin's switch
# ---------------------------------------------------------------------------

def settings(org_id: str) -> Dict[str, Any]:
    return {'enabled': module_enabled(org_id, MODULE_KEY)}


def set_enabled(org_id: str, enabled: bool, *, actor_id: str) -> Dict[str, Any]:
    """Write feature_flags.modules.student_chat for one org. The `modules`
    map is otherwise the superadmin's (the Blocks panel); this one key is the
    school's own call, so its admin writes it here, through the same
    modules.toggle merge, and nothing else in the map can move."""
    from modules.toggle import apply_changes
    from repositories.organization_repository import OrganizationRepository
    repo = OrganizationRepository()
    org = repo.find_by_id(org_id)
    if not org:
        raise LookupError('Organization not found')
    flags = apply_changes(org, {MODULE_KEY: bool(enabled)})
    repo.update_organization(org_id, {'feature_flags': flags})
    # The per-request module cache read the old row; drop it so the answer
    # below is the stored one.
    try:
        from flask import g, has_app_context
        if has_app_context():
            g.setdefault('_module_org_rows', {}).pop(org_id, None)
    except ImportError:
        ...
    logger.info(f'[student_chat] {actor_id} set student chat '
                f'{"on" if enabled else "off"} for org {org_id}')
    return {'enabled': bool(enabled)}
