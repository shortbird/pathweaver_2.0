"""
Org-defined forms — the editor checklists always had and forms never did.

iCreate (Molly), 2026-08-20: "How do we add forms? The teachers have a place to
submit forms like incident reports, supply requests, etc, but I don't know what
those look like or where to edit them or where to add new ones." (16b736f3)

They could not. The twenty form types were a hardcoded dict in
`sis_forms_service`, and every one of them rendered the same three inputs — a
title, a free-text body, a location. An injury report and a supply request were
the same form with a different word on the dropdown.

This mirrors `sis_onboarding_service` on purpose: same authoring shape, same
audience split, same delete guard, so the Task Center can present building a
checklist and building a form as one job.

Two rules worth keeping in mind when changing this file:

  - `key` is immutable once anything has been filed against the template. It is
    written into `sis_form_submissions.form_type`, and history has to keep
    resolving.
  - Validation here is the gate. The builder's `required` marks are a hint to
    the person filling the form in; this is what actually refuses a submission,
    because the client is not to be trusted with it.
"""

import re
import uuid as _uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from database import get_supabase_admin_client
from utils.logger import get_logger
from utils.sis_roles import clean_visible_roles

logger = get_logger(__name__)

TABLE = 'sis_form_templates'
AUDIENCES = ('staff', 'family')

# v1 field types. Deliberately flat — no branching, no file uploads, no
# signatures: a form that needs a document needs the signature flow, which
# already exists, and branching is where form builders go to die.
#
# `student` and `class` matter out of proportion to their cost: they bind to the
# columns already on the submission, which is what makes a behaviour report
# findable from the student's record instead of being prose in a queue.
FIELD_TYPES = ('short_text', 'long_text', 'date', 'number', 'select',
               'checkbox', 'student', 'class', 'staff')

# Field types whose answer is stored on the submission ROW rather than in its
# payload, so the rest of the SIS can find it.
COLUMN_BOUND = {'student': 'student_user_id', 'class': 'class_id'}

PRIORITIES = ('low', 'normal', 'high', 'urgent')

_KEY_RE = re.compile(r'[^a-z0-9]+')


def _admin():
    # admin client justified: the SIS console acts for the whole school — this
    #   reads/writes rows belonging to every family in the org, which no single
    #   caller can see under RLS; the route's role+org gate is the authorization
    return get_supabase_admin_client()


def _now():
    return datetime.now(timezone.utc).isoformat()


def slugify(name: str) -> str:
    """A stable key from a form's name: "Supply request" -> "supply_request"."""
    slug = _KEY_RE.sub('_', (name or '').strip().lower()).strip('_')
    return slug or f'form_{_uuid.uuid4().hex[:8]}'


def clean_fields(fields: Any) -> Tuple[Optional[List[Dict[str, Any]]], Optional[str]]:
    """Normalise a builder payload into storable fields.

    Returns (fields, error). Keys are minted per field and kept stable across
    edits for the same reason checklist item keys are: a submission's payload is
    keyed by them, and re-mapping keys re-labels answers people already gave.
    """
    if not isinstance(fields, list):
        return None, 'Fields must be a list'
    if not fields:
        return None, 'Add at least one question'

    cleaned, seen = [], set()
    for f in fields:
        if not isinstance(f, dict):
            return None, 'Each question must be an object'
        label = (f.get('label') or '').strip()
        if not label:
            return None, 'Every question needs a label'
        ftype = f.get('type') or 'short_text'
        if ftype not in FIELD_TYPES:
            return None, f'Unknown question type: {ftype}'

        key = (str(f.get('key') or '').strip() or slugify(label))
        while key in seen:
            key = f'{key}_{_uuid.uuid4().hex[:4]}'
        seen.add(key)

        options = []
        if ftype == 'select':
            raw = f.get('options')
            if isinstance(raw, str):
                raw = [o for o in raw.split('\n')]
            options = [str(o).strip() for o in (raw or []) if str(o).strip()]
            if not options:
                return None, f'"{label}" is a choice question, so it needs some choices'

        cleaned.append({
            'key': key,
            'label': label,
            'type': ftype,
            'required': bool(f.get('required', False)),
            'options': options,
            'help': (f.get('help') or '').strip() or None,
        })
    return cleaned, None


def list_templates(org_id: str, audience: Optional[str] = None,
                   include_inactive: bool = True) -> List[Dict[str, Any]]:
    q = (_admin().table(TABLE).select('*').eq('organization_id', org_id))
    if audience:
        q = q.eq('audience', audience)
    if not include_inactive:
        q = q.eq('is_active', True)
    rows = q.order('sort_order').order('name').execute().data or []
    return rows


def get_template(org_id: str, key: str) -> Optional[Dict[str, Any]]:
    """One template by its key, or None. Used by submit() to decide whether a
    form_type is org-defined or one of the built-ins."""
    rows = (_admin().table(TABLE).select('*')
            .eq('organization_id', org_id).eq('key', key)
            .limit(1).execute()).data or []
    return rows[0] if rows else None


def save_template(org_id: str, data: Dict[str, Any], actor_id: str,
                  template_id: Optional[str] = None) -> Dict[str, Any]:
    name = (data.get('name') or '').strip()
    if not name:
        return {'error': 'The form needs a name'}
    fields, err = clean_fields(data.get('fields'))
    if err:
        return {'error': err}

    audience = (data.get('audience') or 'staff')
    audience = audience if audience in AUDIENCES else 'staff'
    priority = data.get('default_priority') or None
    if priority and priority not in PRIORITIES:
        return {'error': 'Invalid priority'}
    roles, role_err = clean_visible_roles(data.get('visible_to_roles'))
    if role_err:
        return {'error': role_err}

    payload = {
        'name': name,
        'description': (data.get('description') or '').strip() or None,
        'audience': audience,
        'fields': fields,
        'default_assignee_id': data.get('default_assignee_id') or None,
        'default_priority': priority,
        'visible_to_roles': roles,
        'is_active': bool(data.get('is_active', True)),
        'sort_order': int(data.get('sort_order') or 0),
        'updated_at': _now(),
    }

    admin = _admin()
    if template_id:
        rows = (admin.table(TABLE).select('id, organization_id, key')
                .eq('id', template_id).limit(1).execute()).data
        if not rows or rows[0].get('organization_id') != org_id:
            return {'error': 'Form not found', 'status': 404}
        # The key is never rewritten on an edit: submissions carry it as
        # form_type, and changing it would orphan every one of them.
        row = admin.table(TABLE).update(payload).eq('id', template_id).execute().data
        return {'template': row[0] if row else None}

    key = slugify(data.get('key') or name)
    existing = {t['key'] for t in list_templates(org_id)}
    if key in existing:
        base, n = key, 2
        while key in existing:
            key = f'{base}_{n}'
            n += 1
    payload.update({'organization_id': org_id, 'created_by': actor_id, 'key': key})
    row = admin.table(TABLE).insert(payload).execute().data
    return {'template': row[0] if row else None}


def count_submissions(org_id: str, key: str) -> int:
    """How many submissions were filed against this form. `count='exact'` so it
    cannot be quietly wrong once a school has filed more than a page of them."""
    res = (_admin().table('sis_form_submissions').select('id', count='exact')
           .eq('organization_id', org_id).eq('form_type', key).execute())
    return res.count or 0


def delete_template(org_id: str, template_id: str, force: bool = False) -> Dict[str, Any]:
    """Delete a form.

    Refuses while submissions exist, the way deleting a checklist template does:
    the usual intent is to retire the form, and `is_active=False` does that
    without stranding history. `force=True` is the caller's explicit override.
    """
    rows = (_admin().table(TABLE).select('id, organization_id, key')
            .eq('id', template_id).limit(1).execute()).data
    if not rows or rows[0].get('organization_id') != org_id:
        return {'error': 'Form not found', 'status': 404}
    filed = count_submissions(org_id, rows[0]['key'])
    if filed and not force:
        return {'error': (f'{filed} {"submission has" if filed == 1 else "submissions have"} '
                          'been filed on this form. Retire it instead to keep them readable, '
                          'or delete it anyway.'),
                'submission_count': filed, 'status': 409}
    _admin().table(TABLE).delete().eq('id', template_id).execute()
    return {'deleted': True, 'submission_count': filed}


def duplicate_template(org_id: str, template_id: str, actor_id: str) -> Dict[str, Any]:
    rows = (_admin().table(TABLE).select('*').eq('id', template_id).limit(1).execute()).data
    if not rows or rows[0].get('organization_id') != org_id:
        return {'error': 'Form not found', 'status': 404}
    src = rows[0]
    return save_template(org_id, {
        'name': f"{src.get('name')} (Copy)",
        'description': src.get('description'),
        'audience': src.get('audience'),
        'fields': src.get('fields'),
        'default_assignee_id': src.get('default_assignee_id'),
        'default_priority': src.get('default_priority'),
        'visible_to_roles': src.get('visible_to_roles'),
        'is_active': False,  # a copy starts retired, so it is finished before it is offered
        'sort_order': src.get('sort_order'),
    }, actor_id)


def validate_answers(template: Dict[str, Any],
                     answers: Any) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """Check a submission against its template. Returns (payload, error).

    This is the gate, not the builder's UI hints: required means required here,
    a choice has to be one of the choices, and a key the form does not define is
    dropped rather than stored.
    """
    if answers is None:
        answers = {}
    if not isinstance(answers, dict):
        return None, 'Answers must be an object'

    payload: Dict[str, Any] = {}
    for f in (template.get('fields') or []):
        key, label, ftype = f.get('key'), f.get('label'), f.get('type')
        raw = answers.get(key)

        if ftype == 'checkbox':
            value = bool(raw)
            if f.get('required') and not value:
                return None, f'"{label}" has to be ticked'
            payload[key] = value
            continue

        value = raw
        if isinstance(value, str):
            value = value.strip()
        if value in (None, ''):
            if f.get('required'):
                return None, f'"{label}" is required'
            payload[key] = None
            continue

        if ftype == 'number':
            try:
                value = float(value)
            except (TypeError, ValueError):
                return None, f'"{label}" has to be a number'
            if value == int(value):
                value = int(value)
        elif ftype == 'select':
            if str(value) not in (f.get('options') or []):
                return None, f'"{value}" is not one of the choices for "{label}"'
            value = str(value)
        else:
            value = str(value)
        payload[key] = value
    return payload, None


def hidden_builtin_keys(org_id: str) -> List[str]:
    """Built-in form keys this school has switched off (sis_settings.hidden_form_types).

    The built-in list is shared by every school, so one that never reimburses
    anybody cannot have the entry deleted — it hides it for itself instead
    (iCreate, 2026-09-02: "remove the purchase requests, class prep,
    reimbursement request").
    """
    try:
        rows = (_admin().table('organizations').select('feature_flags')
                .eq('id', org_id).limit(1).execute()).data or []
    except Exception as e:  # noqa: BLE001 — a settings read must never empty the picker
        logger.warning(f'hidden form types lookup failed for {org_id[:8]}: {e}')
        return []
    settings = ((rows[0].get('feature_flags') or {}) if rows else {}).get('sis_settings') or {}
    hidden = settings.get('hidden_form_types')
    return [str(k) for k in hidden] if isinstance(hidden, list) else []


def set_builtin_hidden(org_id: str, key: str, hidden: bool) -> List[str]:
    """Hide or restore one built-in form for this school. Returns the new list."""
    rows = (_admin().table('organizations').select('feature_flags')
            .eq('id', org_id).limit(1).execute()).data or []
    flags = (rows[0].get('feature_flags') or {}) if rows else {}
    settings = dict(flags.get('sis_settings') or {})
    current = [k for k in (settings.get('hidden_form_types') or []) if isinstance(k, str)]
    if hidden and key not in current:
        current.append(key)
    elif not hidden:
        current = [k for k in current if k != key]
    settings['hidden_form_types'] = current
    flags = {**flags, 'sis_settings': settings}
    _admin().table('organizations').update({'feature_flags': flags}).eq('id', org_id).execute()
    return current


def builtin_forms(org_id: str, audience: str = 'staff') -> List[Dict[str, Any]]:
    """The built-in forms for this audience with whether the school hides each
    one — what the Forms panel lists alongside the school's own."""
    from services.sis_forms_service import FORM_TYPES, PARENT_FORM_TYPES
    hidden = set(hidden_builtin_keys(org_id))
    builtins = PARENT_FORM_TYPES if audience == 'family' else FORM_TYPES
    return [{'key': k, 'name': v, 'hidden': k in hidden} for k, v in builtins.items()]


def submittable_forms(org_id: str, audience: str = 'staff',
                      roles: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    """What this person can file, built-ins and org-defined together.

    The picker is one list: to the teacher filing an incident report there is no
    such thing as a "built-in" form. An org template whose key matches a built-in
    replaces it, so a school that builds its own Supply request gets its own
    questions rather than two entries with the same name.

    `fields` is empty for a built-in — the classic three inputs — which is what
    tells the client to render the old form. A built-in the school has switched
    off (see hidden_builtin_keys) is left out entirely.
    """
    from services.sis_forms_service import FORM_TYPES, PARENT_FORM_TYPES

    out: List[Dict[str, Any]] = []
    overridden = set()
    for t in list_templates(org_id, audience=audience, include_inactive=False):
        allowed = t.get('visible_to_roles')
        if allowed and roles is not None and not (set(allowed) & set(roles)):
            continue
        overridden.add(t['key'])
        out.append({
            'key': t['key'],
            'name': t.get('name'),
            'description': t.get('description'),
            'fields': t.get('fields') or [],
            'source': 'org',
        })

    builtins = PARENT_FORM_TYPES if audience == 'family' else FORM_TYPES
    hidden = set(hidden_builtin_keys(org_id))
    for key, label in builtins.items():
        if key in overridden or key in hidden:
            continue
        out.append({'key': key, 'name': label, 'description': None,
                    'fields': [], 'source': 'builtin'})
    out.sort(key=lambda f: (f['source'] != 'org', (f['name'] or '').lower()))
    return out
