"""
SIS staff onboarding — role-specific checklists (iCreate request #12).

Admins define templates (name + item list); assigning one snapshots the items
onto the assignment so later template edits don't rewrite in-flight checklists.
Teachers mark items complete and can attach a document; items flagged
needs_approval wait for an admin. Sensitive documents (tax forms, background
checks, direct deposit) are deliberately NOT collected here — items can link
out to the appropriate external system instead.

Items flagged `needs_signature` are signed in place: the person types their name
and ticks that it counts as their signature, instead of downloading a document,
printing it, signing it, scanning it and uploading the scan (iCreate,
2026-08-06). Four of those five steps needed a printer, and the one artifact it
produced — a photo of a signature — is no better evidence than a typed name with
a timestamp behind a login.

What we record for a signature is what makes it hold up: who was signed in, the
name they typed, that they affirmed it, when, and from which address. See
`_apply_signature`.
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
            # Signed in place by typing a name — see _apply_signature.
            'needs_signature': bool(item.get('needs_signature', False)),
            'needs_approval': bool(item.get('needs_approval', False)),
            'due_date': item.get('due_date') or None,
            # Optional external link surfaced next to the item (e.g. a form to
            # fill on another site). Families/staff open it to complete the step.
            'link': (item.get('link') or '').strip() or None,
        })
    return cleaned


# A template targets either staff (the SIS console "My checklists") or families
# (their portal in the web platform). Defaults to staff to preserve existing rows.
AUDIENCES = ('staff', 'family')


def _clean_audience(value: Any) -> str:
    v = (str(value or '').strip().lower())
    return v if v in AUDIENCES else 'staff'


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
               'audience': _clean_audience(data.get('audience')),
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


def count_template_assignments(org_id: str, template_id: str) -> int:
    """How many people currently hold a checklist from this template."""
    rows = (_admin().table('sis_onboarding_assignments').select('id')
            .eq('organization_id', org_id).eq('template_id', template_id).execute()).data
    return len(rows or [])


def delete_template(org_id: str, template_id: str,
                    force: bool = False) -> Dict[str, Any]:
    """Delete a template.

    Refuses while people still hold a checklist from it — deleting would leave
    those assignments pointing at nothing, and the usual intent is to edit the
    template rather than strand four half-finished checklists. `force=True` is
    the caller's explicit override (the UI asks first); assignments survive it,
    because `template_id` is ON DELETE SET NULL and each assignment carries its
    own `template_name` and item copy.
    """
    rows = (_admin().table('sis_onboarding_templates').select('id, organization_id')
            .eq('id', template_id).limit(1).execute()).data
    if not rows or rows[0].get('organization_id') != org_id:
        return {'error': 'Template not found', 'status': 404}
    assigned = count_template_assignments(org_id, template_id)
    if assigned and not force:
        return {'error': (f'This template is assigned to {assigned} '
                          f'{"person" if assigned == 1 else "people"}. '
                          'Delete it anyway? Their checklists will be kept.'),
                'assigned_count': assigned, 'status': 409}
    _admin().table('sis_onboarding_templates').delete().eq('id', template_id).execute()
    return {'deleted': True, 'assigned_count': assigned}


# ── Assignments ──────────────────────────────────────────────────────────────

def assign(org_id: str, template_id: str, user_id: str, assigned_by: str) -> Dict[str, Any]:
    rows = (_admin().table('sis_onboarding_templates').select('*')
            .eq('id', template_id).limit(1).execute()).data
    if not rows or rows[0].get('organization_id') != org_id:
        return {'error': 'Template not found'}
    template = rows[0]
    # Family checklists live in the learning-app family portal; staff ones in the
    # SIS console — point the notification at the right place.
    is_family = _clean_audience(template.get('audience')) == 'family'
    link = '/family/portal' if is_family else '/onboarding'
    items = [{**i, 'status': 'pending', 'document_url': None,
              'submitted_at': None, 'approved_by': None, 'approved_at': None,
              'admin_notes': None, 'signature': None}
             for i in (template.get('items') or [])]
    row = (_admin().table('sis_onboarding_assignments').insert({
        'organization_id': org_id, 'user_id': user_id,
        'template_id': template_id, 'template_name': template['name'],
        # Snapshotted alongside the items: the portal a checklist belongs to must
        # not change when someone edits or deletes the template it came from.
        'audience': 'family' if is_family else 'staff',
        'items': items, 'assigned_by': assigned_by,
    }).execute()).data
    label = 'Checklist assigned' if is_family else 'Onboarding checklist assigned'
    sis_notifications.notify(
        user_id, label,
        f'"{template["name"]}" has {len(items)} item{"s" if len(items) != 1 else ""} to complete.',
        link=link, organization_id=org_id)
    return {'assignment': row[0] if row else None}


def assign_many(org_id: str, template_id: str, user_ids: List[str],
                assigned_by: str) -> Dict[str, Any]:
    """Assign a template to several people at once (bulk). Returns how many were
    assigned; skips ids that error so one bad id doesn't sink the batch."""
    assigned, errors = 0, []
    for uid in dict.fromkeys(uid for uid in user_ids if uid):  # de-dupe, keep order
        result = assign(org_id, template_id, uid, assigned_by)
        if result.get('error'):
            errors.append(result['error'])
        else:
            assigned += 1
    return {'assigned': assigned, 'errors': errors}


def list_recipients(org_id: str, audience: str = 'staff') -> List[Dict[str, Any]]:
    """People an admin can assign a template to, by audience. 'family' returns the
    org's guardians (parents); 'staff' returns teachers/admins."""
    audience = _clean_audience(audience)
    rows = (_admin().table('users')
            .select('id, first_name, last_name, display_name, email, org_role, org_roles, role')
            .eq('organization_id', org_id).execute()).data or []
    if audience == 'family':
        wanted = {'parent'}
    else:
        wanted = {'advisor', 'org_admin', 'campus_coordinator'}

    def _holds_wanted(u):
        held = set(u.get('org_roles') or [])
        held.update(r for r in (u.get('org_role'), u.get('role')) if r)
        return bool(held & wanted)

    people = [u for u in rows
              if _holds_wanted(u)
              # Placeholder staff (schedule-import rows with no real login) can
              # never open the portal to complete a checklist — don't offer them.
              and not sis_service.is_placeholder_staff_email(u.get('email'))]
    out = [{
        'id': u['id'],
        'name': (u.get('display_name')
                 or f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip()
                 or u.get('email') or 'Unnamed'),
    } for u in people]
    out.sort(key=lambda p: (p['name'] or '').lower())
    return out


def list_assignments(org_id: str, user_id: Optional[str] = None,
                     audience: Optional[str] = None) -> List[Dict[str, Any]]:
    """Checklists in this org, optionally for one person and one portal.

    `audience` matters because one person can hold both kinds: an org admin who
    also has a child is staff in the SIS console and a guardian in the family
    portal. Without the filter their teacher checklist showed up in the family
    portal (reported 2026-08-05). The admin roll-up passes None on purpose — it
    is the one view that should see everything it assigned.
    """
    q = (_admin().table('sis_onboarding_assignments').select('*')
         .eq('organization_id', org_id).order('created_at', desc=True))
    if user_id:
        q = q.eq('user_id', user_id)
    if audience:
        q = q.eq('audience', _clean_audience(audience))
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
        # Sent so the checkbox shows the exact sentence that gets recorded,
        # rather than the client and the server each keeping their own wording.
        r['signature_statement'] = SIGNATURE_STATEMENT
    if user_id:
        _attach_sign_docs(org_id, user_id, rows)
    return rows


def office_documents(org_id: str, user_id: str) -> List[Dict[str, Any]]:
    """Documents the office has put in this person's portal — shared with them,
    not uploaded by them. This is the pool a document-signature item signs
    against (see _attach_sign_docs)."""
    rows = (_admin().table('sis_secure_documents')
            .select('id, title, filename')
            .eq('organization_id', org_id).eq('owner_user_id', user_id)
            .eq('shared_with_owner', True).eq('uploaded_by_owner', False)
            .order('created_at', desc=True).execute()).data or []
    return [{'id': r['id'], 'title': r.get('title') or r.get('filename') or 'Document'}
            for r in rows]


def _attach_sign_docs(org_id: str, user_id: str, rows: List[Dict[str, Any]]) -> None:
    """On a person's own checklist (staff or family), a signature item with no
    template link signs a document the office uploads to their portal ("Your
    contract will be uploaded to your portal"). Those items carry `sign_docs` —
    the office-shared documents — so the UI can offer them to read and withhold
    the sign box while the list is empty. Without this, teachers and parents
    signed "Review & Sign Your Contract" before any contract existed (iCreate, 2026-08-12)."""
    wants = [i for r in rows if _clean_audience(r.get('audience')) in AUDIENCES
             for i in (r.get('items') or [])
             if i.get('needs_signature') and not i.get('link') and not i.get('signature')]
    if not wants:
        return
    docs = office_documents(org_id, user_id)
    for i in wants:
        i['sign_docs'] = docs


def unassign(org_id: str, assignment_id: str) -> Dict[str, Any]:
    """Remove a checklist from someone (the "oops, wrong template" undo).

    Uploaded documents are deliberately LEFT IN STORAGE. An accidental unassign
    must not destroy a background check or a signed contract someone already
    sent in; the files stay in the private staff-documents bucket and any
    re-assignment starts a fresh checklist. Returns how many documents were
    detached so the UI can warn before removing a checklist with real work in it.
    """
    rows = (_admin().table('sis_onboarding_assignments')
            .select('id, organization_id, items, template_name')
            .eq('id', assignment_id).limit(1).execute()).data
    if not rows or rows[0].get('organization_id') != org_id:
        return {'error': 'Checklist not found'}
    items = rows[0].get('items') or []
    docs = len([i for i in items if i.get('document_url')])
    done = len([i for i in items if i.get('status') in ('complete', 'approved')])
    _admin().table('sis_onboarding_assignments').delete().eq('id', assignment_id).execute()
    return {'unassigned': True, 'documents_kept': docs, 'items_completed': done,
            'template_name': rows[0].get('template_name')}


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


# ── Typed signatures ─────────────────────────────────────────────────────────

# The affirmation the signer ticks. Kept here rather than in the client so the
# exact wording somebody agreed to is recorded server-side alongside the
# signature, not reconstructed from whatever the UI happened to say that day.
SIGNATURE_STATEMENT = ('I am typing my own name below, and I intend it to count '
                       'as my official signature.')

_MAX_SIGNATURE_NAME = 120


def _apply_signature(target: Dict[str, Any], fields: Dict[str, Any],
                     actor_id: str,
                     documents: Optional[List[Dict[str, Any]]] = None) -> Optional[str]:
    """Record a typed signature on an item, or return why it can't be.

    A typed name is a valid electronic signature when you can show who typed it,
    that they meant it to be a signature, and when. So all three are required and
    all three are stored: the signed-in account, the affirmation they ticked (by
    its full text, not a bare `true`), and the timestamp. The request address
    rides along as corroboration.

    Refusing an un-agreed signature matters more than it looks: a checklist that
    accepts a name without the affirmation records something that is not a
    signature while looking exactly like one that is.

    `documents` is the same rule one level up: an item that signs a document from
    the office (a contract in their portal — see _attach_sign_docs) must not be
    signable while the office hasn't provided one. Pass the person's office
    documents to enforce that; an empty list refuses the signature, a non-empty
    one is recorded on it as what the signer had in front of them. None means
    the item doesn't sign a portal document (it has a link).
    """
    if not target.get('needs_signature'):
        return 'This item is not signed here'
    if documents is not None and not documents:
        return ("The office hasn't uploaded the document to sign yet — "
                'it will appear on this item once it does')
    name = (fields.get('signature_name') or '').strip()
    if not name:
        return 'Type your full name to sign'
    if len(name) > _MAX_SIGNATURE_NAME:
        return 'That name is too long'
    if not fields.get('signature_agreed'):
        return 'Tick the box to confirm this counts as your signature'
    target['signature'] = {
        'name': name,
        'agreed_to': SIGNATURE_STATEMENT,
        'signed_by': actor_id,
        'signed_at': _now(),
        'ip': (fields.get('signature_ip') or None),
    }
    if documents:
        # What the signer had in front of them when they signed.
        target['signature']['documents'] = documents
    return None


def update_item(org_id: str, assignment_id: str, item_key: str,
                fields: Dict[str, Any], actor_id: str, is_admin: bool) -> Dict[str, Any]:
    """Teacher: mark complete / attach document / sign. Admin: approve/reject/notes."""
    assignment = _load_assignment(org_id, assignment_id)
    if not assignment:
        return {'error': 'Checklist not found'}
    if not is_admin and assignment.get('user_id') != actor_id:
        return {'error': 'Checklist not found'}
    items = assignment.get('items') or []
    target = next((i for i in items if i.get('key') == item_key), None)
    if not target:
        return {'error': 'Item not found'}

    if fields.get('clear_signature'):
        if not is_admin:
            return {'error': 'Only an administrator can clear a signature'}
        target['signature'] = None
        target['status'] = 'pending'
        target['submitted_at'] = None
        target['approved_by'] = None
        target['approved_at'] = None
        if is_admin and 'admin_notes' in fields:
            target['admin_notes'] = (fields.get('admin_notes') or '').strip() or None
        return {'assignment': _save_items(assignment, items)}

    status = fields.get('status')
    if status and status not in ITEM_STATUSES:
        return {'error': 'Invalid status'}
    if not is_admin and status in ('approved', 'rejected'):
        return {'error': 'Only an administrator can approve this item'}

    if 'document_url' in fields:
        target['document_url'] = fields.get('document_url') or None

    # Signing is what completes a signature item, so it implies status=complete
    # rather than needing the client to send both.
    signing = 'signature_name' in fields or 'signature_agreed' in fields
    if signing:
        if is_admin and assignment.get('user_id') != actor_id:
            return {'error': 'Only the person themselves can sign this'}
        # A signature item with no link signs a document from the office's
        # portal uploads; look those up so a signature can't outrun the document
        # (and so the signature records which documents were there).
        documents = None
        if (target.get('needs_signature') and not target.get('link')
                and _clean_audience(assignment.get('audience')) in AUDIENCES):
            documents = office_documents(org_id, assignment['user_id'])
        problem = _apply_signature(target, fields, actor_id, documents=documents)
        if problem:
            return {'error': problem}
        status = 'complete'

    # A signature item can't be ticked off like an ordinary one — the checkbox
    # would produce a "complete" item with nothing signed on it.
    if status == 'complete' and target.get('needs_signature') and not target.get('signature'):
        return {'error': 'Sign this item to complete it'}

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
