"""
One inbox: everything the SIS is currently asking one person to do.

Four features each grew their own idea of an outstanding obligation — a request
assigned to you (sis_form_submissions), a checklist item (onboarding), a document
sent for your signature (a signature_request assignment), a policy you have to
acknowledge (org_resources.requires_ack). Each was correct on its own page, and
collectively they meant a teacher had four places to check and no way to know
whether they were done.

This service reads all four and returns one list. It is deliberately READ-ONLY
and owns no table: each source stays the authority on its own records, and every
task carries a `link` back to the page that completes it. Nothing here writes,
so nothing here can disagree with the source it summarises.

Statuses are normalised to four the inbox can sort by, with the source's own
value carried alongside as `native_status` so a page that knows better can still
show "under review" rather than "in progress".
"""

from datetime import datetime, timezone
from typing import Any, Dict, List

from database import get_supabase_admin_client
from services import sis_forms_service as forms
from services import sis_onboarding_service as onboarding
from services import sis_service
from utils.logger import get_logger

logger = get_logger(__name__)

# What the inbox sorts and counts by.
#   todo             nobody is waiting on anyone but you
#   in_progress      you have picked it up
#   waiting_on_admin you did your part; the office has to review or reply
#   done             finished (hidden unless asked for)
STATUSES = ('todo', 'in_progress', 'waiting_on_admin', 'done')

_FORM_STATUS_MAP = {
    'submitted': 'todo',
    'under_review': 'in_progress',
    'in_progress': 'in_progress',
    'waiting': 'waiting_on_admin',
    'resolved': 'done',
}

_ORDER = {'todo': 0, 'in_progress': 1, 'waiting_on_admin': 2, 'done': 3}


def _admin():
    return get_supabase_admin_client()


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _is_overdue(task: Dict[str, Any]) -> bool:
    due = task.get('due_date')
    return bool(due) and task.get('status') != 'done' and str(due) < _today()


# ── Sources ──────────────────────────────────────────────────────────────────

def _request_tasks(org_id: str, user_id: str) -> List[Dict[str, Any]]:
    """Requests and tickets assigned to this person.

    Only what is assigned to them — a request they FILED is something they are
    waiting on, not something they owe, and putting it in the same list would
    make the count meaningless.
    """
    out = []
    for r in forms.list_assigned(org_id, user_id):
        native = r.get('status') or 'submitted'
        out.append({
            'id': f"form:{r['id']}",
            'type': 'request',
            'title': r.get('title') or r.get('form_type_label') or 'Request',
            'context': r.get('form_type_label'),
            'status': _FORM_STATUS_MAP.get(native, 'todo'),
            'native_status': native,
            'due_date': r.get('due_date'),
            'priority': r.get('priority'),
            'assigned_by_name': r.get('submitted_by_name'),
            'created_at': r.get('created_at'),
            'link': f"/forms?submission={r['id']}",
        })
    return out


def _checklist_tasks(org_id: str, user_id: str, audience: str) -> List[Dict[str, Any]]:
    """Checklist items and documents sent for signature.

    Both are onboarding assignments; `kind` is what separates a checklist from a
    one-off signature request, and only the labelling differs from here on.

    `audience` is not optional: one person can be staff in the console and a
    guardian in the family portal, and a teacher's onboarding checklist showing
    up in the family portal is a bug this codebase has already shipped once
    (2026-08-05).
    """
    out = []
    for a in onboarding.list_assignments(org_id, user_id=user_id, audience=audience):
        is_send = a.get('kind') == 'signature_request'
        for item in (a.get('items') or []):
            native = item.get('status') or 'pending'
            if native == 'complete':
                status = 'waiting_on_admin' if item.get('needs_approval') else 'done'
            elif native in ('approved',):
                status = 'done'
            else:
                # A rejected item is back in the person's court, which is what
                # 'todo' means here — with the admin's note attached.
                status = 'todo'
            if item.get('needs_signature'):
                task_type = 'signature'
            elif item.get('needs_document'):
                task_type = 'document_upload'
            else:
                task_type = 'checklist_item'
            out.append({
                'id': f"onb:{a['id']}:{item.get('key')}",
                'type': task_type,
                'title': item.get('title') or 'Checklist item',
                # A one-off task's assignment is named after its single item —
                # repeating the title as context just says everything twice.
                'context': (None if a.get('template_name') == item.get('title')
                            else a.get('template_name')),
                'status': status,
                'native_status': native,
                'due_date': item.get('due_date'),
                'priority': None,
                'assigned_by_name': None,
                'created_at': a.get('created_at'),
                'admin_notes': item.get('admin_notes'),
                # Documents to read before signing, already resolved by the
                # onboarding service (and withheld until the office uploads one).
                'sign_docs': item.get('sign_docs'),
                'required': bool(item.get('required', True)),
                'link': ('/family/portal' if audience == 'family'
                         else f"/onboarding?assignment={a['id']}&item={item.get('key')}"),
                'is_signature_request': is_send,
            })
    return out


def _ack_tasks(org_id: str, user_id: str, audience: str) -> List[Dict[str, Any]]:
    """Policies and handbooks this person still has to acknowledge.

    Staff only: org_resources acknowledgment is a staff-facing library, and the
    family portal has no ack surface to send them to.
    """
    if audience != 'staff':
        return []
    rows = (_admin().table('org_resources')
            .select('id, title, audience, visible_to_roles, requires_ack, version_date, updated_at')
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
        out.append({
            'id': f"ack:{r['id']}",
            'type': 'ack',
            'title': f"Acknowledge: {r.get('title') or 'Document'}",
            'context': 'Staff resources',
            'status': 'done' if current else 'todo',
            'native_status': 'acknowledged' if current else 'pending',
            'due_date': None,
            'priority': None,
            'assigned_by_name': None,
            'created_at': r.get('updated_at'),
            'resource_id': r['id'],
            'link': f"/resources?highlight={r['id']}",
        })
    return out


# ── The inbox ────────────────────────────────────────────────────────────────

def list_my_tasks(org_id: str, user_id: str, audience: str = 'staff',
                  include_done: bool = False) -> Dict[str, Any]:
    """Everything this person owes, newest work first.

    Per-person result sets are small by construction (one person's assigned
    requests, their own checklists, their org's ack-required resources), so this
    fans out over the sources rather than maintaining an index that could fall
    out of step with them.
    """
    audience = 'family' if str(audience or '').lower() == 'family' else 'staff'
    tasks: List[Dict[str, Any]] = []
    for source in (
        # A guardian files requests but is never assigned one, so the request
        # source is staff-only.
        (lambda: _request_tasks(org_id, user_id)) if audience == 'staff' else None,
        lambda: _checklist_tasks(org_id, user_id, audience),
        lambda: _ack_tasks(org_id, user_id, audience),
    ):
        if source is None:
            continue
        try:
            tasks.extend(source())
        except Exception as e:
            # One broken source must not empty the whole inbox — a person who
            # can't see their requests should still see what they have to sign.
            logger.error(f'my-tasks source failed for {user_id}: {e}', exc_info=True)

    for t in tasks:
        t['overdue'] = _is_overdue(t)

    counts = {
        'todo': len([t for t in tasks if t['status'] == 'todo']),
        'in_progress': len([t for t in tasks if t['status'] == 'in_progress']),
        'waiting_on_admin': len([t for t in tasks if t['status'] == 'waiting_on_admin']),
        'done': len([t for t in tasks if t['status'] == 'done']),
        'overdue': len([t for t in tasks if t['overdue']]),
    }
    # Everything outstanding counts as open, including work the office is
    # reviewing — the badge answers "is anything in flight", not "what must I
    # personally touch right now".
    counts['open'] = counts['todo'] + counts['in_progress'] + counts['waiting_on_admin']

    if not include_done:
        tasks = [t for t in tasks if t['status'] != 'done']

    # Overdue first, then by how much is owed, then oldest first — a task that
    # has been sitting for a week outranks one sent this morning.
    tasks.sort(key=lambda t: (not t['overdue'], _ORDER.get(t['status'], 9),
                              t.get('due_date') or '9999-12-31',
                              t.get('created_at') or ''))

    return {'tasks': tasks, 'counts': counts,
            'signature_statement': onboarding.SIGNATURE_STATEMENT}


def open_task_count(org_id: str, user_id: str, audience: str = 'staff') -> int:
    """Badge fuel: how many things are outstanding for this person."""
    return list_my_tasks(org_id, user_id, audience=audience)['counts']['open']
