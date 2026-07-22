"""
SIS staff forms — incident reports, supply requests, and the rest of the
"complete common forms inside the system" iCreate ask. One generic submission
table (sis_form_submissions) with a typed payload; routing is "notify the org
admins", status tracking is submitted → under_review → resolved.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from database import get_supabase_admin_client
from services import sis_notifications
from services import sis_service
from utils.logger import get_logger

logger = get_logger(__name__)

FORM_TYPES = {
    'incident': 'Incident report',
    'injury': 'Injury report',
    'behavior': 'Student behavior report',
    'supply_request': 'Supply request',
    'maintenance': 'Maintenance request',
    'technology': 'Technology problem',
    'substitute_notes': 'Substitute notes',
    'end_of_day': 'End-of-day checklist',
    'parent_contact': 'Parent-contact record',
    'reimbursement': 'Reimbursement request',
    'training_idea': 'Training idea',
    'other': 'Other',
}
STATUSES = ('submitted', 'under_review', 'resolved')


def _admin():
    return get_supabase_admin_client()


def submit(org_id: str, user_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    form_type = data.get('form_type')
    if form_type not in FORM_TYPES:
        return {'error': 'Unknown form type'}
    body = (data.get('body') or '').strip()
    if not body:
        return {'error': 'Please describe the issue or request'}
    payload = {
        'body': body,
        'location': (data.get('location') or '').strip() or None,
        'occurred_at': (data.get('occurred_at') or '').strip() or None,
    }
    row = (_admin().table('sis_form_submissions').insert({
        'organization_id': org_id,
        'submitted_by': user_id,
        'form_type': form_type,
        'title': (data.get('title') or '').strip() or FORM_TYPES[form_type],
        'payload': payload,
        'student_user_id': data.get('student_user_id') or None,
        'class_id': data.get('class_id') or None,
    }).execute()).data
    submission = row[0] if row else None
    for admin_id in sis_service.org_admin_ids(org_id):
        sis_notifications.notify(
            admin_id, f'New {FORM_TYPES[form_type].lower()}',
            (submission or {}).get('title') or FORM_TYPES[form_type],
            link='/forms', organization_id=org_id)
    return {'submission': submission}


def _names_for(user_ids: List[str]) -> Dict[str, str]:
    ids = [u for u in set(user_ids) if u]
    if not ids:
        return {}
    rows = (_admin().table('users')
            .select('id, first_name, last_name, display_name, email')
            .in_('id', ids).execute()).data or []
    return {r['id']: (r.get('display_name')
                      or f"{r.get('first_name') or ''} {r.get('last_name') or ''}".strip()
                      or r.get('email') or 'Unknown') for r in rows}


def _decorate(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    names = _names_for([r.get('submitted_by') for r in rows]
                       + [r.get('student_user_id') for r in rows])
    for r in rows:
        r['submitted_by_name'] = names.get(r.get('submitted_by'))
        r['student_name'] = names.get(r.get('student_user_id'))
        r['form_type_label'] = FORM_TYPES.get(r.get('form_type'), r.get('form_type'))
    return rows


def list_mine(org_id: str, user_id: str) -> List[Dict[str, Any]]:
    rows = (
        _admin().table('sis_form_submissions').select('*')
        .eq('organization_id', org_id).eq('submitted_by', user_id)
        .order('created_at', desc=True).limit(100).execute()
    ).data or []
    return _decorate(rows)


def list_all(org_id: str, status: Optional[str] = None) -> List[Dict[str, Any]]:
    q = (_admin().table('sis_form_submissions').select('*')
         .eq('organization_id', org_id).order('created_at', desc=True).limit(300))
    if status in STATUSES:
        q = q.eq('status', status)
    return _decorate(q.execute().data or [])


def update_status(org_id: str, submission_id: str, fields: Dict[str, Any],
                  actor_id: str) -> Dict[str, Any]:
    rows = (_admin().table('sis_form_submissions').select('*')
            .eq('id', submission_id).limit(1).execute()).data
    if not rows or rows[0].get('organization_id') != org_id:
        return {'error': 'Submission not found'}
    payload: Dict[str, Any] = {'updated_at': datetime.now(timezone.utc).isoformat()}
    status = fields.get('status')
    if status:
        if status not in STATUSES:
            return {'error': 'Invalid status'}
        payload['status'] = status
        if status == 'resolved':
            payload['resolved_by'] = actor_id
            payload['resolved_at'] = payload['updated_at']
    if 'resolution_notes' in fields:
        payload['resolution_notes'] = (fields.get('resolution_notes') or '').strip() or None
    if 'assigned_to' in fields:
        payload['assigned_to'] = fields.get('assigned_to') or None
    row = (_admin().table('sis_form_submissions').update(payload)
           .eq('id', submission_id).execute()).data
    updated = row[0] if row else None
    if status and rows[0].get('submitted_by') != actor_id:
        label = FORM_TYPES.get(rows[0].get('form_type'), 'form')
        sis_notifications.notify(
            rows[0]['submitted_by'], f'Your {label.lower()} is {status.replace("_", " ")}',
            rows[0].get('title') or label, link='/forms', organization_id=org_id)
    return {'submission': updated}
