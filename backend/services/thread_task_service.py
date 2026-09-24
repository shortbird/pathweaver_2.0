"""A school-inbox message, turned into a task for somebody on staff.

Tickets bf8b754d and d93b24d2 (iCreate, meeting of 2026-09-23): "Replies in
messaging can be turned into tasks and assigned to school staff. these show in
the assignee's tasks page. if the task is to reply, they click the task and are
directed to the message thread to reply. otherwise they can mark the task as
done." and "assigning a message to a teacher/staff (who doesn't have access to
the school inbox) - they get the whole thread and can reply."

This is also how a family's request reaches the right person now. Forms are
gone (the tasks stream removes them); a parent uses "Message the school", and
the office makes the message a task for whoever should handle it.

Two writes, in this order:

  1. The task, through sis_onboarding_service.assign_task -- the one task
     table (sis_onboarding_assignments), with the thread it came from
     (source_conversation_id / source_group_id / source_message_id) and what
     to do about it (action 'reply' | 'do'). The tasks page reads those to
     offer "Open the thread".
  2. The grant (school_thread_grants): the assignee may open that one thread
     in the console and answer it as the school. The grant carries the task
     id, and school_inbox_service.active_grants treats a finished or deleted
     task as the end of the access.

A task without its grant is recoverable (the office can open the thread
itself); a grant without its task would be access with no end, so the task
goes first and a failed task writes no grant.
"""

from typing import Any, Dict, List, Optional

from utils.logger import get_logger

logger = get_logger(__name__)

ACTIONS = ('reply', 'do')
PRIORITIES = ('low', 'normal', 'high', 'urgent')
MAX_TITLE = 120
MAX_NOTE = 2000
#: How much of the message a task quotes: enough to know which one it was.
QUOTE_CHARS = 280


# admin client justified: school_thread_grants is service-role only (RLS on,
#   no policies); the route gates the caller to the org's front office before
#   a grant is written.
from utils.admin_client import admin_client as _admin  # noqa: E402


def _repo():
    from repositories.school_thread_repository import SchoolThreadRepository
    return SchoolThreadRepository(client=_admin())


def _title(action: str, member_name: Optional[str], thread_name: Optional[str],
           quote: Optional[str]) -> str:
    who = member_name or thread_name or 'the school inbox'
    if action == 'reply':
        return f'Reply to {who}'[:MAX_TITLE]
    snippet = (quote or '').strip().splitlines()[0] if (quote or '').strip() else ''
    if snippet:
        text = f'Follow up with {who}: {snippet}'
    else:
        text = f'Follow up with {who}'
    return text if len(text) <= MAX_TITLE else text[:MAX_TITLE - 1].rstrip() + '…'


def _description(note: Optional[str], quote: Optional[str], sender: Optional[str]) -> Optional[str]:
    parts: List[str] = []
    note_text = (note or '').strip()
    if note_text:
        parts.append(note_text[:MAX_NOTE])
    text = (quote or '').strip()
    if text:
        if len(text) > QUOTE_CHARS:
            text = text[:QUOTE_CHARS - 1].rstrip() + '…'
        parts.append(f'{sender or "The message"} wrote: "{text}"')
    return '\n\n'.join(parts) or None


def create_task_from_thread(org_id: str, assigner_id: str, assignee_id: str, *,
                            conversation_id: Optional[str] = None,
                            group_id: Optional[str] = None,
                            message_id: Optional[str] = None,
                            action: str = 'reply',
                            due_date: Optional[str] = None,
                            priority: Optional[str] = None,
                            note: Optional[str] = None,
                            title: Optional[str] = None,
                            member_name: Optional[str] = None,
                            thread_name: Optional[str] = None,
                            quote: Optional[str] = None,
                            quote_sender: Optional[str] = None) -> Dict[str, Any]:
    """Make the task and grant the thread. Returns {task, grant}.

    Exactly one of conversation_id / group_id names the thread; message_id is
    the message the office picked, when it picked one. `member_name`,
    `thread_name`, `quote` and `quote_sender` only word the task.

    Raises ValueError on anything the office can fix (no thread, an assignee
    who is not staff here, an action or priority the task table refuses) and
    RuntimeError when the task could not be written.
    """
    if bool(conversation_id) == bool(group_id):
        raise ValueError('Pick one thread to make a task from')
    if action not in ACTIONS:
        raise ValueError('The task is either to reply or to do something')
    if priority is not None and priority not in PRIORITIES:
        raise ValueError('Priority is low, normal, high or urgent')
    if not assignee_id:
        raise ValueError('Choose who the task is for')

    from services import sis_messaging_service
    staff = {p['id'] for p in sis_messaging_service.staff_recipients(org_id)}
    if assignee_id not in staff:
        raise ValueError('The task has to go to somebody on staff at this school')

    task_title = ((title or '').strip()[:MAX_TITLE]
                  or _title(action, member_name, thread_name, quote))

    # The one door every task goes through (P1 of docs/icreate/
    # TASKS_MESSAGING_QUESTS_PLAN_2026-09-23.md). Keyword arguments only, so
    # the call does not depend on the parameter order.
    from services import sis_onboarding_service
    created = sis_onboarding_service.assign_task(
        org_id=org_id,
        assigner_id=assigner_id,
        recipients=[assignee_id],
        title=task_title,
        description=_description(note, quote, quote_sender),
        due_date=due_date or None,
        priority=priority or None,
        action=action,
        source_conversation_id=conversation_id,
        source_group_id=group_id,
        source_message_id=message_id,
    )
    rows = _created_rows(created)
    if not rows:
        error = created.get('error') if isinstance(created, dict) else None
        if error:
            raise ValueError(error)
        raise RuntimeError('The task could not be created')
    task = rows[0]

    grant = _repo().create_grant(
        organization_id=org_id, user_id=assignee_id, task_id=task.get('id'),
        granted_by=assigner_id, conversation_id=conversation_id, group_id=group_id)
    return {'task': task, 'grant': grant}


def _created_rows(created: Any) -> List[Dict[str, Any]]:
    """assign_task returns the rows it created. Tolerates a dict wrapping them
    ({'rows': [...]} / {'assignments': [...]}) so the shape of the envelope is
    not a second contract."""
    if isinstance(created, list):
        return [r for r in created if isinstance(r, dict) and r.get('id')]
    if isinstance(created, dict):
        for key in ('rows', 'assignments', 'tasks', 'created'):
            if isinstance(created.get(key), list):
                return [r for r in created[key] if isinstance(r, dict) and r.get('id')]
        if created.get('id'):
            return [created]
    return []
