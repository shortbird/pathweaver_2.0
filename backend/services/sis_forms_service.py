"""
SIS staff forms and internal tasks — incident reports, supply requests, and the
rest of the "complete common forms inside the system" iCreate ask, now grown
into the internal request/task system from the coordinator requirements
(2026-08-09). One generic submission table (sis_form_submissions) with a typed
payload; a submission can be assigned to a staff member, given a priority and a
due date, and discussed in comments. Status tracking:
submitted → under_review → in_progress → waiting → resolved.
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
    'student_concern': 'Student concern',
    'supply_request': 'Supply request',
    'maintenance': 'Maintenance request',
    'technology': 'Technology problem',
    'teacher_support': 'Teacher support request',
    'substitute_request': 'Substitute request',
    'substitute_notes': 'Substitute notes',
    'end_of_day': 'End-of-day checklist',
    'parent_contact': 'Parent-contact record',
    'reimbursement': 'Reimbursement request',
    'training_idea': 'Training idea',
    # Gryffin, 2026-08-22: their insurance requires periodic employee reviews,
    # and this queue is where the completed form gets filed.
    'employee_review': 'Employee review',
    'task': 'Task',
    'other': 'Other',
}
# Maps to iCreate's task vocabulary: submitted=New, under_review(+assignee)=
# Assigned, in_progress=In Progress, waiting=Waiting, resolved=Completed.
STATUSES = ('submitted', 'under_review', 'in_progress', 'waiting', 'resolved')
# Everything that is still somebody's problem. The queue defaults to these:
# listing all statuses meant resolved history crowded out live work, and with
# list_all capped at 300 rows a busy term would eventually push the open items
# off the end of the list entirely.
OPEN_STATUSES = tuple(s for s in STATUSES if s != 'resolved')
PRIORITIES = ('low', 'normal', 'high', 'urgent')

# Form types a parent/guardian may file from the family Learning app. These land
# in the SAME staff review queue as staff-filed forms (submitter_role='parent').
PARENT_FORM_TYPES = {
    'at_home_learning_day': 'At-home learning day request',
    'general_request': 'General request',
    'records_request': 'Records request',
    'meeting_request': 'Request a meeting',
}


def _admin():
    return get_supabase_admin_client()


# Label lookup spanning staff + parent form types (a submission of either kind
# resolves its human label here).
ALL_FORM_TYPES = {**FORM_TYPES, **PARENT_FORM_TYPES}


def routing(org_id: str) -> Dict[str, str]:
    """Which form type goes to whom, by default.

    iCreate, 2026-08-21: "can we set up the forms so that they automatically go
    to the appropriate person? Substitute requests from the teachers could just
    be set up to go right to Julia. Otherwise they come to us first."

    A map of form_type -> user_id, kept in organizations.feature_flags, because
    it is org configuration and every other piece of SIS configuration lives
    there. When the form builder lands it inherits this map as the
    `default_assignee_id` on each template rather than replacing it.
    """
    rows = (_admin().table('organizations').select('feature_flags')
            .eq('id', org_id).limit(1).execute()).data or []
    settings = ((rows[0].get('feature_flags') or {}) if rows else {}).get('sis_settings') or {}
    rules = settings.get('form_routing') or {}
    # Only rules for form types that still exist: retiring a type must not leave
    # submissions routing to a rule nobody can see or delete.
    return {k: v for k, v in rules.items() if k in ALL_FORM_TYPES and v}


def set_routing(org_id: str, rules: Dict[str, Any]) -> Dict[str, Any]:
    """Replace the routing map. An empty value clears that type's rule."""
    if not isinstance(rules, dict):
        return {'error': 'Routing rules must be an object'}
    clean: Dict[str, str] = {}
    for form_type, user_id in rules.items():
        if form_type not in ALL_FORM_TYPES:
            return {'error': f'Unknown form type: {form_type}'}
        if user_id:
            clean[form_type] = str(user_id)
    rows = (_admin().table('organizations').select('feature_flags')
            .eq('id', org_id).limit(1).execute()).data or []
    if not rows:
        return {'error': 'Organization not found'}
    flags = rows[0].get('feature_flags') or {}
    settings = flags.get('sis_settings') or {}
    (_admin().table('organizations')
     .update({'feature_flags': {**flags,
                                'sis_settings': {**settings, 'form_routing': clean}}})
     .eq('id', org_id).execute())
    return {'routing': clean}


def submit(org_id: str, user_id: str, data: Dict[str, Any],
           submitter_role: str = 'staff', allow_assign: bool = False) -> Dict[str, Any]:
    """File a form/request. With allow_assign (the admin route's privilege),
    the submission can be created already assigned, prioritised and dated —
    that is what makes it a task ("Printer in Room 3 is not working → assign to
    the campus coordinator")."""
    from services import sis_form_template_service as templates

    form_type = data.get('form_type')
    # An org-defined form wins over a built-in of the same key: a school that
    # builds its own "Supply request" gets its own questions, and everything
    # already filed under that key still resolves.
    template = templates.get_template(org_id, form_type) if form_type else None
    if template and not template.get('is_active'):
        return {'error': 'That form has been retired'}
    if template:
        wanted = 'family' if submitter_role == 'parent' else 'staff'
        if template.get('audience') != wanted:
            return {'error': 'That form is not available to you'}
        label = template.get('name') or form_type
        payload, err = templates.validate_answers(template, data.get('answers'))
        if err:
            return {'error': err}
        # Column-bound answers (a student picker, a class picker) are lifted out
        # of the payload onto the row, which is what makes a behaviour report
        # findable from the student's record rather than prose in a queue.
        for f in (template.get('fields') or []):
            column = templates.COLUMN_BOUND.get(f.get('type'))
            if column and payload.get(f['key']):
                data.setdefault(column, payload[f['key']])
    else:
        # Staff callers use FORM_TYPES; parent callers use PARENT_FORM_TYPES.
        allowed = PARENT_FORM_TYPES if submitter_role == 'parent' else FORM_TYPES
        if form_type not in allowed:
            return {'error': 'Unknown form type'}
        label = allowed[form_type]
        body = (data.get('body') or '').strip()
        if not body:
            return {'error': 'Please describe the issue or request'}
        payload = {
            'body': body,
            'location': (data.get('location') or '').strip() or None,
            'occurred_at': (data.get('occurred_at') or '').strip() or None,
        }
    row_fields = {
        'organization_id': org_id,
        'submitted_by': user_id,
        'submitter_role': submitter_role,
        'form_type': form_type,
        # Recorded, not computed at read time: once a school can rename its own
        # form types, deriving the label would rewrite what old submissions say.
        'form_type_label': label,
        'title': (data.get('title') or '').strip() or label,
        'payload': payload,
        'student_user_id': data.get('student_user_id') or None,
        'class_id': data.get('class_id') or None,
    }
    assigned_to = None
    if allow_assign:
        priority = data.get('priority')
        if priority is not None:
            if priority not in PRIORITIES:
                return {'error': 'Invalid priority'}
            row_fields['priority'] = priority
        if data.get('due_date'):
            row_fields['due_date'] = data['due_date']
        assigned_to = data.get('assigned_to') or None
        if assigned_to:
            row_fields['assigned_to'] = assigned_to
    # Nobody named it, so the school's routing rule does — substitute requests
    # to whoever covers classes, maintenance to whoever holds the keys. A person
    # who DID name an assignee always wins over the rule.
    if not assigned_to:
        # The form's own default first (it is the more specific rule), then the
        # org-wide routing map. A person who named an assignee beats both.
        routed = (template or {}).get('default_assignee_id') or routing(org_id).get(form_type)
        if routed:
            assigned_to = routed
            row_fields['assigned_to'] = routed
    if template and template.get('default_priority') and not row_fields.get('priority'):
        # An injury report opens at high without anyone remembering to set it.
        row_fields['priority'] = template['default_priority']
    row = (_admin().table('sis_form_submissions').insert(row_fields).execute()).data
    submission = row[0] if row else None
    title = (submission or {}).get('title') or label
    if assigned_to and assigned_to != user_id:
        sis_notifications.notify(
            assigned_to, 'New task assigned to you', title,
            link='/forms', organization_id=org_id)
    prefix = 'family' if submitter_role == 'parent' else 'staff'
    for admin_id in sis_service.org_admin_ids(org_id):
        if admin_id == user_id or admin_id == assigned_to:
            continue
        sis_notifications.notify(
            admin_id, f'New {prefix} {label.lower()}', title,
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
                       + [r.get('student_user_id') for r in rows]
                       + [r.get('assigned_to') for r in rows])
    for r in rows:
        r['submitted_by_name'] = names.get(r.get('submitted_by'))
        r['student_name'] = names.get(r.get('student_user_id'))
        r['assigned_to_name'] = names.get(r.get('assigned_to'))
        # The stored label wins; the lookup is the fallback for rows filed
        # before it was recorded.
        r['form_type_label'] = (r.get('form_type_label')
                                or ALL_FORM_TYPES.get(r.get('form_type'), r.get('form_type')))
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
    if status == 'open':
        q = q.neq('status', 'resolved')
    elif status in STATUSES:
        q = q.eq('status', status)
    return _decorate(q.execute().data or [])


def status_counts(org_id: str) -> Dict[str, int]:
    """How many submissions sit in each status, counted by Postgres.

    The queue's filter chips show these. Counting rows fetched into Python would
    be wrong twice over: list_all caps at 300, and PostgREST would silently cap
    an uncapped read at 1000 (see CLAUDE.md, Row Limits).
    """
    counts: Dict[str, int] = {}
    for status in STATUSES:
        try:
            counts[status] = (_admin().table('sis_form_submissions')
                              .select('id', count='exact')
                              .eq('organization_id', org_id).eq('status', status)
                              .limit(1).execute()).count or 0
        except Exception:
            logger.debug('Form status count failed for %s', status, exc_info=True)
            counts[status] = 0
    counts['open'] = sum(counts.get(s, 0) for s in OPEN_STATUSES)
    return counts


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
    if 'priority' in fields:
        if fields['priority'] not in PRIORITIES:
            return {'error': 'Invalid priority'}
        payload['priority'] = fields['priority']
    if 'due_date' in fields:
        payload['due_date'] = fields.get('due_date') or None
    if 'resolution_notes' in fields:
        payload['resolution_notes'] = (fields.get('resolution_notes') or '').strip() or None
    newly_assigned = None
    if 'assigned_to' in fields:
        payload['assigned_to'] = fields.get('assigned_to') or None
        if payload['assigned_to'] and payload['assigned_to'] != rows[0].get('assigned_to'):
            newly_assigned = payload['assigned_to']
    row = (_admin().table('sis_form_submissions').update(payload)
           .eq('id', submission_id).execute()).data
    updated = row[0] if row else None
    label = ALL_FORM_TYPES.get(rows[0].get('form_type'), 'form')
    title = rows[0].get('title') or label
    if newly_assigned and newly_assigned != actor_id:
        sis_notifications.notify(
            newly_assigned, 'New task assigned to you', title,
            link='/forms', organization_id=org_id)
    if status and rows[0].get('submitted_by') != actor_id:
        sis_notifications.notify(
            rows[0]['submitted_by'], f'Your {label.lower()} is {status.replace("_", " ")}',
            title, link='/forms', organization_id=org_id)
    return {'submission': updated}


def list_assigned(org_id: str, user_id: str) -> List[Dict[str, Any]]:
    """The caller's open tasks — everything assigned to them that is not yet
    resolved. Dashboard fuel."""
    rows = (
        _admin().table('sis_form_submissions').select('*')
        .eq('organization_id', org_id).eq('assigned_to', user_id)
        .neq('status', 'resolved')
        .order('due_date', desc=False).order('created_at', desc=True)
        .limit(100).execute()
    ).data or []
    return _decorate(rows)


def add_comment(org_id: str, submission_id: str, author_id: str,
                body: str) -> Dict[str, Any]:
    """A note on a submission's thread. The other parties (submitter, assignee)
    hear about it; the author does not."""
    body = (body or '').strip()
    if not body:
        return {'error': 'Comment is empty'}
    rows = (_admin().table('sis_form_submissions').select('*')
            .eq('id', submission_id).limit(1).execute()).data
    if not rows or rows[0].get('organization_id') != org_id:
        return {'error': 'Submission not found'}
    sub = rows[0]
    inserted = (_admin().table('sis_form_comments').insert({
        'submission_id': submission_id,
        'organization_id': org_id,
        'author_id': author_id,
        'body': body,
    }).execute()).data
    title = sub.get('title') or ALL_FORM_TYPES.get(sub.get('form_type'), 'form')
    for uid in {sub.get('submitted_by'), sub.get('assigned_to')}:
        if uid and uid != author_id:
            sis_notifications.notify(
                uid, 'New comment', f'{title}: {body[:120]}',
                link='/forms', organization_id=org_id)
    return {'comment': inserted[0] if inserted else None}


def list_comments(org_id: str, submission_id: str) -> List[Dict[str, Any]]:
    rows = (_admin().table('sis_form_comments').select('*')
            .eq('organization_id', org_id).eq('submission_id', submission_id)
            .order('created_at', desc=False).limit(200).execute()).data or []
    names = _names_for([r.get('author_id') for r in rows])
    for r in rows:
        r['author_name'] = names.get(r.get('author_id'))
    return rows
