"""
Tasks: what one person owes, one task in detail, its comment thread, and the
office's view of everything it has assigned.

Until 2026-09-24 this was a read-only inbox stitched from four sources -- a
request assigned to you (sis_form_submissions), a checklist item, a document
sent for signature, a policy to acknowledge. Requests and checklists are gone
as concepts (iCreate meeting 2026-09-23): everything the school asks of a
person is a row of sis_onboarding_assignments, one or many steps, and this
service is the one facade over it, so no route has to split by kind any more.

Policies to acknowledge stay their own source: an ack is a row in
sis_resource_acks against a library document, not something anybody assigned.

Who may see a task (may_see_task) is the one access rule: its assignee, the
person who assigned it, and the school's admins. Every read and write below
goes through it, which is what lets a teacher assigned a task work it and
discuss it -- the request queue answered "not an admin" to both (known
breakage carried by the old queue, not carried here).
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from services import sis_notifications
from services import sis_onboarding_service as onboarding
from services import sis_service
from utils.logger import get_logger

logger = get_logger(__name__)

# What the inbox sorts and counts by.
#   todo             nothing done yet, or the office sent a step back
#   in_progress      some steps done
#   waiting_on_admin every step done; the office has to approve one
#   done             finished (hidden unless asked for)
#   expired          a recurring occurrence whose day ended unfinished
STATUSES = ('todo', 'in_progress', 'waiting_on_admin', 'done', 'expired')

_ORDER = {'todo': 0, 'in_progress': 1, 'waiting_on_admin': 2, 'done': 3, 'expired': 4}
_PRIORITY_ORDER = {'urgent': 0, 'high': 1, 'normal': 2, 'low': 3}


# admin client justified: the SIS console acts for the whole school — this
#   reads/writes rows belonging to every family in the org, which no single
#   caller can see under RLS; the route's role+org gate is the authorization
from utils.admin_client import admin_client as _admin


def _repo():
    from repositories.sis_task_repository import SisTaskRepository
    return SisTaskRepository(client=_admin())


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _names(user_ids) -> Dict[str, str]:
    ids = [u for u in set(user_ids) if u]
    if not ids:
        return {}
    from repositories.user_repository import UserRepository
    rows = UserRepository(client=_admin()).find_by_ids(
        ids, select_fields='id, first_name, last_name, display_name, email')
    return {uid: (u.get('display_name')
                  or f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip()
                  or u.get('email') or 'Unknown') for uid, u in rows.items()}


# ── Shaping one task ────────────────────────────────────────────────────────

def _done(item: Dict[str, Any]) -> bool:
    return item.get('status') in ('complete', 'approved')


def task_status(row: Dict[str, Any]) -> str:
    """One of STATUSES for an assignment row."""
    if row.get('status') == 'expired':
        return 'expired'
    items = row.get('items') or []
    required = [i for i in items if i.get('required', True)] or items
    if row.get('status') == 'complete' or (required and all(_done(i) for i in required)):
        # Done by the person; the office may still have an approval to give.
        if any(i.get('needs_approval') and i.get('status') == 'complete' for i in items):
            return 'waiting_on_admin'
        return 'done'
    if any(i.get('status') == 'rejected' for i in items):
        return 'todo'
    return 'in_progress' if any(_done(i) for i in items) else 'todo'


def _due(row: Dict[str, Any]) -> Optional[str]:
    """The task's due date, else the earliest due date on a step still owed."""
    if row.get('due_date'):
        return str(row['due_date'])
    owed = [str(i['due_date']) for i in (row.get('items') or [])
            if i.get('due_date') and not _done(i)]
    return min(owed) if owed else None


def thread_link(row: Dict[str, Any]) -> Optional[str]:
    """Where a task made from a message sends you to answer it. The messaging
    stream owns that page; a non-admin with a reply task gets a grant to the
    one thread (school_thread_grants)."""
    if row.get('source_conversation_id'):
        return f"/inbox?tab=school&conversation={row['source_conversation_id']}"
    if row.get('source_group_id'):
        return f"/inbox?tab=school&group={row['source_group_id']}"
    return None


def shape_task(row: Dict[str, Any], names: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    """The one shape every surface renders a task in."""
    names = names or {}
    items = row.get('items') or []
    status = task_status(row)
    due = _due(row)
    return {
        'id': row['id'],
        'type': 'signature' if row.get('kind') == 'signature_request' else 'task',
        'kind': row.get('kind'),
        'title': row.get('template_name') or (items[0].get('title') if items else None) or 'Task',
        'description': row.get('description'),
        'audience': row.get('audience'),
        'status': status,
        'native_status': row.get('status'),
        'due_date': due,
        'overdue': bool(due) and status not in ('done', 'expired') and due < _today(),
        'priority': row.get('priority'),
        'action': row.get('action') or 'do',
        'source_conversation_id': row.get('source_conversation_id'),
        'source_group_id': row.get('source_group_id'),
        'source_message_id': row.get('source_message_id'),
        'thread_link': thread_link(row),
        'schedule_id': row.get('schedule_id'),
        'occurrence_date': row.get('occurrence_date'),
        'expires_at': row.get('expires_at'),
        'blocks_access': bool(row.get('blocks_access')),
        'batch_id': row.get('batch_id'),
        'template_id': row.get('template_id'),
        'user_id': row.get('user_id'),
        'user_name': row.get('user_name') or names.get(row.get('user_id')),
        'assigned_by': row.get('assigned_by'),
        'assigned_by_name': names.get(row.get('assigned_by')),
        'created_at': row.get('created_at'),
        'updated_at': row.get('updated_at'),
        'finished_at': finished_at(row) if status in ('done', 'waiting_on_admin') else None,
        'items': items,
        'done_count': len([i for i in items if _done(i)]),
        'total_count': len(items),
        'link': onboarding.task_link(row.get('audience'), row['id']),
    }


def finished_at(row: Dict[str, Any]) -> Optional[str]:
    """When the person finished: the latest time a step was completed or
    approved. There is no completed_at column; the steps carry the times."""
    stamps = [str(t) for i in (row.get('items') or [])
              for t in (i.get('submitted_at'), i.get('approved_at')) if t]
    if stamps:
        return max(stamps)
    return row.get('updated_at') if row.get('status') == 'complete' else None


# ── Acknowledgments (their own source) ──────────────────────────────────────

def _ack_tasks(org_id: str, user_id: str) -> List[Dict[str, Any]]:
    """Policies and handbooks this staff member still has to acknowledge.

    Staff only: org_resources acknowledgment is a staff-facing library, and the
    family portal has no ack surface to send them to.
    """
    rows = (_admin().table('org_resources')
            .select('id, title, audience, visible_to_roles, visible_to_user_ids, '
                    'requires_ack, version_date, updated_at, is_training')
            .eq('organization_id', org_id).eq('requires_ack', True)
            .order('sort_order').order('title').execute()).data or []
    rows = [r for r in rows if (r.get('audience') or 'families') in ('staff', 'all')]
    rows = sis_service.filter_role_visible(user_id, rows)
    if not rows:
        return []
    ack_rows = (_admin().table('sis_resource_acks')
                .select('resource_id, version_date, acknowledged_at')
                .eq('user_id', user_id)
                .in_('resource_id', [r['id'] for r in rows]).execute()).data or []
    acks = {a['resource_id']: a for a in ack_rows}
    out = []
    for r in rows:
        mine = acks.get(r['id'])
        # An acknowledgment covers the version it was given for. Re-versioning a
        # policy is how the office asks everyone to read it again.
        current = bool(mine) and ((r.get('version_date') or '') <= (mine.get('version_date') or ''))
        # A required training link is the same obligation with a different
        # home: it is done on the Training page, not the Resources page,
        # which hides training rows (routes/sis/staff_training.py, the link kind).
        training = bool(r.get('is_training'))
        out.append({
            'id': f"ack:{r['id']}",
            'type': 'ack',
            'title': (f"Training: {r.get('title') or 'Untitled'}" if training
                      else f"Acknowledge: {r.get('title') or 'Document'}"),
            'context': 'Training' if training else 'Staff resources',
            'status': 'done' if current else 'todo',
            'native_status': 'acknowledged' if current else 'pending',
            'due_date': None,
            'overdue': False,
            'priority': None,
            'items': [],
            'created_at': r.get('updated_at'),
            'resource_id': r['id'],
            'link': '/library?tab=training' if training else f"/library?highlight={r['id']}",
        })
    return out


# ── The person's list ───────────────────────────────────────────────────────

def list_my_tasks(org_id: str, user_id: str, audience: str = 'staff',
                  include_done: bool = False) -> Dict[str, Any]:
    """Everything this person owes, one entry per task, most pressing first.

    `audience` is not optional: one person can be staff in the console and a
    guardian in the family portal, and a teacher's onboarding showing up in the
    family portal is a bug this codebase has already shipped once (2026-08-05).
    Per-person result sets are small by construction.
    """
    audience = onboarding._clean_audience(audience)
    tasks: List[Dict[str, Any]] = []
    try:
        rows = onboarding.list_assignments(org_id, user_id=user_id, audience=audience)
        names = _names([r.get('assigned_by') for r in rows])
        counts = _repo().comment_counts([r['id'] for r in rows])
        for r in rows:
            t = shape_task(r, names)
            t['comment_count'] = counts.get(r['id'], 0)
            tasks.append(t)
    except Exception as e:
        # One broken source must not empty the whole list -- a person whose
        # tasks cannot be read should still see what they have to acknowledge.
        logger.error(f'my-tasks read failed for {user_id}: {e}', exc_info=True)
    if audience == 'staff':
        try:
            tasks.extend(_ack_tasks(org_id, user_id))
        except Exception as e:
            logger.error(f'my-tasks acks failed for {user_id}: {e}', exc_info=True)

    counts = {s: len([t for t in tasks if t['status'] == s]) for s in STATUSES}
    counts['overdue'] = len([t for t in tasks if t.get('overdue')])
    # Everything outstanding counts as open, including work the office is
    # reviewing -- the badge answers "is anything in flight".
    counts['open'] = counts['todo'] + counts['in_progress'] + counts['waiting_on_admin']

    if not include_done:
        tasks = [t for t in tasks if t['status'] not in ('done', 'expired')]

    # Overdue first, then urgency, then how much is owed, then due date, then
    # oldest first -- a task that has sat for a week outranks this morning's.
    tasks.sort(key=lambda t: (not t.get('overdue'),
                              _PRIORITY_ORDER.get(t.get('priority') or 'normal', 2),
                              _ORDER.get(t['status'], 9),
                              t.get('due_date') or '9999-12-31',
                              t.get('created_at') or ''))
    return {'tasks': tasks, 'counts': counts,
            'signature_statement': onboarding.SIGNATURE_STATEMENT}


def open_tasks_for(org_id: str, user_id: str) -> List[Dict[str, Any]]:
    """A staff member's open tasks, for the dashboards' My tasks cards."""
    return list_my_tasks(org_id, user_id, audience='staff')['tasks']


# ── One task ────────────────────────────────────────────────────────────────

def may_see_task(row: Optional[Dict[str, Any]], org_id: str, user_id: str,
                 is_admin: bool) -> bool:
    """The access rule for a task and its thread: the assignee, the person
    who assigned it, or an admin of the school it belongs to."""
    if not row or row.get('organization_id') != org_id:
        return False
    return is_admin or user_id in (row.get('user_id'), row.get('assigned_by'))


def get_task(org_id: str, user_id: str, task_id: str, is_admin: bool) -> Optional[Dict[str, Any]]:
    """One task with its steps and comments, or None if the caller may not see
    it. "Not yours" and "does not exist" are the same answer, so an id cannot
    be probed."""
    row = _repo().get(task_id)
    if not may_see_task(row, org_id, user_id, is_admin):
        return None
    if row.get('user_id') == user_id:
        # The documents a signature step signs, resolved the way the person's
        # own list resolves them (withheld until the office uploads one).
        onboarding._attach_sign_docs(org_id, user_id, [row])
    names = _names([row.get('user_id'), row.get('assigned_by')])
    task = shape_task(row, names)
    task['comments'] = list_comments_for(row)
    task['signature_statement'] = onboarding.SIGNATURE_STATEMENT
    task['can_review'] = bool(is_admin)
    return task


def list_comments_for(row: Dict[str, Any]) -> List[Dict[str, Any]]:
    rows = _repo().list_comments(row['id'])
    names = _names([r.get('author_id') for r in rows])
    for r in rows:
        r['author_name'] = names.get(r.get('author_id'))
    return rows


def list_comments(org_id: str, user_id: str, task_id: str, is_admin: bool):
    row = _repo().get(task_id)
    if not may_see_task(row, org_id, user_id, is_admin):
        return None
    return list_comments_for(row)


def add_comment(org_id: str, user_id: str, task_id: str, body: str,
                is_admin: bool) -> Dict[str, Any]:
    """A note on a task's thread. The other party hears about it, pointed at a
    page they can actually open: the assignee at the page their audience works
    tasks on, the assigner at the office's Assigned view. (The request queue
    sent a parent to the staff console, which they could not open.)"""
    body = (body or '').strip()
    if not body:
        return {'error': 'Comment is empty', 'status': 400}
    if len(body) > 5000:
        return {'error': 'That comment is too long', 'status': 400}
    repo = _repo()
    row = repo.get(task_id)
    if not may_see_task(row, org_id, user_id, is_admin):
        return {'error': 'Task not found', 'status': 404}
    comment = repo.add_comment(org_id, task_id, user_id, body)
    title = row.get('template_name') or 'Task'
    for uid, link in ((row.get('user_id'), onboarding.task_link(row.get('audience'), task_id)),
                      (row.get('assigned_by'), f'/tasks?tab=assigned&task={task_id}')):
        if uid and uid != user_id:
            sis_notifications.notify(uid, 'New comment', f'{title}: {body[:120]}',
                                     link=link, organization_id=org_id)
    if comment:
        comment['author_name'] = _names([user_id]).get(user_id)
    return {'comment': comment}


# ── The office's view ───────────────────────────────────────────────────────

def batch_key(row: Dict[str, Any]) -> str:
    """Which assigned card a row belongs to. Every task assigned since
    2026-09-24 carries its send's batch_id. Older rows do not: a template's
    are grouped under the template (that is how the office thinks of them --
    "Employee onboarding, 13 of 26 done"), and a one-off stands alone."""
    if row.get('batch_id'):
        return f"batch:{row['batch_id']}"
    if row.get('template_id'):
        return f"template:{row['template_id']}"
    return f"task:{row['id']}"


def list_batches(org_id: str) -> List[Dict[str, Any]]:
    """Every task the office has assigned, one card per send, newest first.

    Each card counts people, not steps: "12 of 30 done" is how many people
    have finished. The people ride along with their per-step state, their
    status and when they finished, so the card opens without another trip.

    Recurring occurrences are not cards here -- a daily duty for 40 staff
    would add 40 cards a day. They are read per schedule as a date x person
    grid (sis_task_schedule_service.grid).
    """
    rows = [r for r in onboarding.list_assignments(org_id, kind='task')
            if not r.get('schedule_id')]
    names = _names([r.get('assigned_by') for r in rows])
    batches: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        key = batch_key(r)
        person = shape_task(r, names)
        b = batches.setdefault(key, {
            'key': key,
            'batch_id': r.get('batch_id'),
            'template_id': r.get('template_id'),
            'title': person['title'],
            'description': r.get('description'),
            'priority': r.get('priority'),
            'action': r.get('action') or 'do',
            'due_date': person['due_date'],
            'assigned_by_name': person['assigned_by_name'],
            'created_at': r.get('created_at'),
            'audiences': set(),
            'thread_link': person['thread_link'],
            'people': [],
        })
        b['audiences'].add(r.get('audience') or 'staff')
        # The card is dated by its newest row: a template's legacy group was
        # assigned over weeks, and the card belongs where its latest send is.
        if (r.get('created_at') or '') > (b['created_at'] or ''):
            b['created_at'] = r.get('created_at')
        b['people'].append(person)
    out = []
    for b in batches.values():
        b['audiences'] = sorted(b['audiences'])
        b['people'].sort(key=lambda p: (p.get('user_name') or '').lower())
        b['total'] = len(b['people'])
        b['done'] = len([p for p in b['people'] if p['status'] == 'done'])
        b['awaiting_review'] = len([p for p in b['people'] if p['status'] == 'waiting_on_admin'])
        b['overdue'] = len([p for p in b['people'] if p.get('overdue')])
        b['outstanding'] = b['done'] < b['total']
        out.append(b)
    out.sort(key=lambda b: b.get('created_at') or '', reverse=True)
    return out


_PROGRESS_FIELDS = ('status', 'document_url', 'documents', 'submitted_at',
                    'approved_by', 'approved_at', 'admin_notes', 'signature', 'sign_docs')


def save_as_template(org_id: str, actor_id: str, task_id: str,
                     name: Optional[str] = None) -> Dict[str, Any]:
    """Keep any assigned task, one step or many, as a template to reuse.

    The steps' rules and wording are kept; everything a person did on them is
    not, and neither is a step's document_id, which names one person's copy.
    """
    row = _repo().get(task_id)
    if not row or row.get('organization_id') != org_id:
        return {'error': 'Task not found', 'status': 404}
    items = []
    for i in (row.get('items') or []):
        if not isinstance(i, dict):
            continue
        items.append({k: v for k, v in i.items()
                      if k not in _PROGRESS_FIELDS and k not in ('key', 'document_id')})
    return onboarding.save_template(org_id, {
        'name': (name or '').strip() or row.get('template_name') or 'Task',
        'description': row.get('description'),
        'audience': row.get('audience'),
        'blocks_access': row.get('blocks_access'),
        'items': items,
    }, actor_id=actor_id)


# ── Dashboard numbers ───────────────────────────────────────────────────────

def dashboard_counts(org_id: str, today: str) -> Dict[str, int]:
    """Open and overdue tasks across the school, counted by Postgres."""
    repo = _repo()
    return {'tasks_open': repo.count_open(org_id),
            'tasks_overdue': repo.count_overdue(org_id, today)}
