"""
SIS staff onboarding — role-specific checklists (iCreate request #12).

Admins define templates (name + item list); assigning one snapshots the items
onto the assignment so later template edits don't rewrite in-flight checklists.
Teachers mark items complete and can attach a document; items flagged
needs_approval wait for an admin. Sensitive documents (tax forms, background
checks, direct deposit) are deliberately NOT collected here — items can link
out to the appropriate external system instead.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from database import get_supabase_admin_client
from services import sis_notifications
from services import sis_service
from utils.logger import get_logger

logger = get_logger(__name__)

ITEM_STATUSES = ('pending', 'complete', 'approved', 'rejected')


def _admin():
    return get_supabase_admin_client()


def _now():
    return datetime.now(timezone.utc).isoformat()


def _clean_items(items: Any) -> Optional[List[Dict[str, Any]]]:
    if not isinstance(items, list):
        return None
    cleaned = []
    for i, item in enumerate(items):
        if not isinstance(item, dict):
            return None
        title = (item.get('title') or '').strip()
        if not title:
            return None
        cleaned.append({
            'key': item.get('key') or f'item_{i + 1}',
            'title': title,
            'description': (item.get('description') or '').strip() or None,
            'required': bool(item.get('required', True)),
            'needs_document': bool(item.get('needs_document', False)),
            'needs_approval': bool(item.get('needs_approval', False)),
            'due_date': item.get('due_date') or None,
        })
    return cleaned


# ── Templates (admin) ────────────────────────────────────────────────────────

def list_templates(org_id: str) -> List[Dict[str, Any]]:
    return (
        _admin().table('sis_onboarding_templates').select('*')
        .eq('organization_id', org_id).order('name').execute()
    ).data or []


def save_template(org_id: str, data: Dict[str, Any], actor_id: str,
                  template_id: Optional[str] = None) -> Dict[str, Any]:
    name = (data.get('name') or '').strip()
    if not name:
        return {'error': 'Template name is required'}
    items = _clean_items(data.get('items') or [])
    if items is None:
        return {'error': 'Each item needs at least a title'}
    payload = {'name': name, 'role_type': (data.get('role_type') or '').strip() or None,
               'items': items, 'updated_at': _now()}
    admin = _admin()
    if template_id:
        rows = (admin.table('sis_onboarding_templates').select('id, organization_id')
                .eq('id', template_id).limit(1).execute()).data
        if not rows or rows[0].get('organization_id') != org_id:
            return {'error': 'Template not found'}
        row = (admin.table('sis_onboarding_templates').update(payload)
               .eq('id', template_id).execute()).data
    else:
        payload.update({'organization_id': org_id, 'created_by': actor_id})
        row = admin.table('sis_onboarding_templates').insert(payload).execute().data
    return {'template': row[0] if row else None}


def delete_template(org_id: str, template_id: str) -> bool:
    rows = (_admin().table('sis_onboarding_templates').select('id, organization_id')
            .eq('id', template_id).limit(1).execute()).data
    if not rows or rows[0].get('organization_id') != org_id:
        return False
    _admin().table('sis_onboarding_templates').delete().eq('id', template_id).execute()
    return True


# ── Assignments ──────────────────────────────────────────────────────────────

def assign(org_id: str, template_id: str, user_id: str, assigned_by: str) -> Dict[str, Any]:
    rows = (_admin().table('sis_onboarding_templates').select('*')
            .eq('id', template_id).limit(1).execute()).data
    if not rows or rows[0].get('organization_id') != org_id:
        return {'error': 'Template not found'}
    template = rows[0]
    items = [{**i, 'status': 'pending', 'document_url': None,
              'submitted_at': None, 'approved_by': None, 'approved_at': None,
              'admin_notes': None}
             for i in (template.get('items') or [])]
    row = (_admin().table('sis_onboarding_assignments').insert({
        'organization_id': org_id, 'user_id': user_id,
        'template_id': template_id, 'template_name': template['name'],
        'items': items, 'assigned_by': assigned_by,
    }).execute()).data
    sis_notifications.notify(
        user_id, 'Onboarding checklist assigned',
        f'"{template["name"]}" has {len(items)} item{"s" if len(items) != 1 else ""} to complete.',
        link='/onboarding', organization_id=org_id)
    return {'assignment': row[0] if row else None}


def list_assignments(org_id: str, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
    q = (_admin().table('sis_onboarding_assignments').select('*')
         .eq('organization_id', org_id).order('created_at', desc=True))
    if user_id:
        q = q.eq('user_id', user_id)
    rows = q.execute().data or []
    ids = list({r['user_id'] for r in rows})
    names = {}
    if ids:
        urows = (_admin().table('users')
                 .select('id, first_name, last_name, display_name, email')
                 .in_('id', ids).execute()).data or []
        names = {u['id']: (u.get('display_name')
                           or f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip()
                           or u.get('email')) for u in urows}
    for r in rows:
        r['user_name'] = names.get(r['user_id'])
        items = r.get('items') or []
        r['done_count'] = len([i for i in items if i.get('status') in ('complete', 'approved')])
        r['total_count'] = len(items)
    return rows


def _load_assignment(org_id: str, assignment_id: str) -> Optional[Dict[str, Any]]:
    rows = (_admin().table('sis_onboarding_assignments').select('*')
            .eq('id', assignment_id).limit(1).execute()).data
    if not rows or rows[0].get('organization_id') != org_id:
        return None
    return rows[0]


def _save_items(assignment: Dict[str, Any], items: List[Dict[str, Any]]) -> Dict[str, Any]:
    required = [i for i in items if i.get('required')]
    all_done = all(i.get('status') in ('complete', 'approved') for i in required) if required else True
    status = 'complete' if all_done else 'in_progress'
    row = (_admin().table('sis_onboarding_assignments')
           .update({'items': items, 'status': status, 'updated_at': _now()})
           .eq('id', assignment['id']).execute()).data
    return row[0] if row else {**assignment, 'items': items, 'status': status}


def update_item(org_id: str, assignment_id: str, item_key: str,
                fields: Dict[str, Any], actor_id: str, is_admin: bool) -> Dict[str, Any]:
    """Teacher: mark complete / attach document. Admin: approve/reject/notes."""
    assignment = _load_assignment(org_id, assignment_id)
    if not assignment:
        return {'error': 'Checklist not found'}
    if not is_admin and assignment.get('user_id') != actor_id:
        return {'error': 'Checklist not found'}
    items = assignment.get('items') or []
    target = next((i for i in items if i.get('key') == item_key), None)
    if not target:
        return {'error': 'Item not found'}

    status = fields.get('status')
    if status and status not in ITEM_STATUSES:
        return {'error': 'Invalid status'}
    if not is_admin and status in ('approved', 'rejected'):
        return {'error': 'Only an administrator can approve this item'}

    if 'document_url' in fields:
        target['document_url'] = fields.get('document_url') or None
    if status:
        target['status'] = status
        if status == 'complete':
            target['submitted_at'] = _now()
            if target.get('needs_approval'):
                for admin_id in sis_service.org_admin_ids(org_id):
                    sis_notifications.notify(
                        admin_id, 'Onboarding item ready for review',
                        f'{target["title"]} — {assignment.get("template_name") or "onboarding"}',
                        link='/onboarding', organization_id=org_id)
        if status in ('approved', 'rejected'):
            target['approved_by'] = actor_id
            target['approved_at'] = _now()
            sis_notifications.notify(
                assignment['user_id'],
                f'Onboarding item {status}', target['title'],
                link='/onboarding', organization_id=org_id)
    if is_admin and 'admin_notes' in fields:
        target['admin_notes'] = (fields.get('admin_notes') or '').strip() or None

    return {'assignment': _save_items(assignment, items)}
