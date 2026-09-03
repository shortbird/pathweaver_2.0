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

import uuid as _uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from database import get_supabase_admin_client
from services import sis_notifications
from services import sis_access_gate
from services import sis_secure_docs_service
from services import sis_service
from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger

logger = get_logger(__name__)

ITEM_STATUSES = ('pending', 'complete', 'approved', 'rejected')


def _admin():
    # admin client justified: the SIS console acts for the whole school — this
    #   reads/writes rows belonging to every family in the org, which no single
    #   caller can see under RLS; the route's role+org gate is the authorization
    return get_supabase_admin_client()


def _now():
    return datetime.now(timezone.utc).isoformat()


# The two checklist upload routes each write to their own private bucket
# (staff_portal.py and parent.py). Removing an attachment has to reach the same
# one the audience uploaded to.
CHECKLIST_BUCKETS = {'staff': 'staff-documents', 'family': 'family-documents'}


def _remove_document_blob(assignment: Dict[str, Any], path: str) -> None:
    """Delete the stored file behind a removed attachment. Best-effort: a blob we
    could not delete must not fail the checklist edit that removed it."""
    bucket = CHECKLIST_BUCKETS.get(_clean_audience(assignment.get('audience')))
    if not bucket or not path:
        return
    try:
        _admin().storage.from_(bucket).remove([path])
    except Exception as e:  # noqa: BLE001
        logger.warning(f'[Onboarding] could not delete {bucket}/{path}: {e}')


def item_documents(item: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Every document attached to a checklist item, in either shape.

    An item used to hold exactly one file in `document_url`, so uploading a
    second offered to REPLACE the first — which is what iCreate hit when they
    asked for an ID and a birth certificate on one I-9 item and the teacher had
    nowhere to put the second file (b9583855). Items carry a `documents` list
    now; `document_url` is still written with the first of them so anything
    reading the old field keeps working.
    """
    docs = item.get('documents')
    if isinstance(docs, list):
        out = [d for d in docs if isinstance(d, dict) and d.get('path')]
        if out:
            return out
    path = item.get('document_url')
    if path:
        return [{'path': path, 'filename': None, 'uploaded_at': item.get('submitted_at')}]
    return []


def _set_item_documents(item: Dict[str, Any], docs: List[Dict[str, Any]]) -> None:
    """Write both shapes: the list, and the legacy single-path field."""
    item['documents'] = docs
    item['document_url'] = docs[0]['path'] if docs else None


def _clean_items(items: Any) -> Optional[List[Dict[str, Any]]]:
    """Normalise a template's items, minting a stable key for anything new.

    The key is the item's identity for the life of the template: an assignment
    records progress, uploads and signatures against it, and `update_item` finds
    the row by it. It used to fall back to the item's POSITION (`item_3`), which
    two edits turn into a lie — add an item at the top and the new item is handed
    the key an existing item already holds. `update_item` takes the first match,
    so one of the two becomes permanently un-completable. Positional keys already
    in the data keep working; only new items get a UUID.
    """
    if not isinstance(items, list):
        return None
    cleaned = []
    seen_keys = set()
    for item in items:
        if not isinstance(item, dict):
            return None
        title = (item.get('title') or '').strip()
        if not title:
            return None
        key = str(item.get('key') or '').strip()
        if not key or key in seen_keys:
            key = f'item_{_uuid.uuid4().hex[:12]}'
        seen_keys.add(key)
        cleaned.append({
            'key': key,
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
            # A signature item can name the ONE document it signs (see
            # office_documents). Without it the item signs against whatever the
            # office has shared with that person — the original behaviour, kept
            # for templates that say "your contract will be uploaded".
            'document_id': (item.get('document_id') or None),
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
    audience = _clean_audience(data.get('audience'))
    payload = {'name': name, 'role_type': (data.get('role_type') or '').strip() or None,
               'audience': audience,
               # Directions shown above the items when somebody opens the list.
               'description': (data.get('description') or '').strip() or None,
               # Family checklists only — see send_for_signature on why a staff
               # audience never carries the hold.
               'blocks_access': bool(data.get('blocks_access')) and audience == 'family',
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


def duplicate_template(org_id: str, template_id: str, actor_id: str) -> Dict[str, Any]:
    """Copy a template, items and all, under a free "(Copy)" name.

    Server-side rather than a client re-POST for two reasons. `document_id` on a
    signature item names ONE secure document belonging to ONE person — copied
    verbatim, the duplicate silently signs against the original recipient's file,
    so it is dropped here. And `blocks_access` never reaches the editor, so a
    client-side copy quietly downgrades a family checklist that holds access.
    Item keys are re-minted: the copy is a separate template whose assignments
    must not share identity with the original's.
    """
    admin = _admin()
    rows = (admin.table('sis_onboarding_templates').select('*')
            .eq('id', template_id).limit(1).execute()).data
    if not rows or rows[0].get('organization_id') != org_id:
        return {'error': 'Template not found', 'status': 404}
    src = rows[0]

    taken = {(t.get('name') or '').strip().lower() for t in list_templates(org_id)}
    base = f"{(src.get('name') or 'Checklist').strip()} (Copy)"
    name = base
    n = 2
    while name.strip().lower() in taken:
        name = f'{base} {n}'
        n += 1

    items = []
    for item in (src.get('items') or []):
        if not isinstance(item, dict):
            continue
        copied = {k: v for k, v in item.items() if k not in ('key', 'document_id')}
        items.append(copied)
    cleaned = _clean_items(items)
    if cleaned is None:
        return {'error': 'This template has an item without a title'}

    payload = {
        'organization_id': org_id,
        'created_by': actor_id,
        'name': name,
        'role_type': src.get('role_type'),
        'description': src.get('description'),
        'audience': _clean_audience(src.get('audience')),
        'blocks_access': bool(src.get('blocks_access')),
        'items': cleaned,
        'updated_at': _now(),
    }
    row = admin.table('sis_onboarding_templates').insert(payload).execute().data
    return {'template': row[0] if row else None}


# The fields a template owns. Progress fields (status, document_url, documents,
# signature, submitted_at, approved_*, admin_notes) belong to the assignment and
# are never written by a sync.
_TEMPLATE_ITEM_WORDING = ('title', 'description', 'link', 'due_date')
_TEMPLATE_ITEM_RULES = ('required', 'needs_document', 'needs_signature',
                        'needs_approval', 'document_id')


def sync_assignments(org_id: str, template_id: str) -> Dict[str, Any]:
    """Push a template's current items onto the checklists already assigned.

    Assigning snapshots the items, so editing a template only ever changed what
    FUTURE people received — iCreate corrected the orientation quest mid-run and
    all 152 families kept the old copy (f4e1589d). This is the catch-up, and it
    is a button rather than automatic-on-save so a half-finished edit never goes
    out to everybody.

    The rules, in the order they matter:
      - Finished checklists are left alone and counted, not rewritten.
      - Anything already done — status, uploads, signatures, approvals — is
        never touched. Wording on a done item is corrected; the RULES on it
        (does it need a signature, a document, approval) are not, because
        flipping those under a completed item makes it complete and impossible
        to complete at the same time.
      - An item the template no longer has disappears only where it is still
        pending. Somebody's uploaded ID does not vanish because the office
        tidied the template.
      - New items arrive pending, in the template's order.
    """
    admin = _admin()
    rows = (admin.table('sis_onboarding_templates').select('*')
            .eq('id', template_id).limit(1).execute()).data
    if not rows or rows[0].get('organization_id') != org_id:
        return {'error': 'Template not found', 'status': 404}
    template = rows[0]
    tmpl_items = template.get('items') or []
    tmpl_keys = {i.get('key') for i in tmpl_items}

    assignments = (admin.table('sis_onboarding_assignments').select('*')
                   .eq('organization_id', org_id).eq('template_id', template_id)
                   .eq('kind', 'checklist').execute()).data or []

    added = updated = removed = synced = skipped = 0

    for a in assignments:
        if a.get('status') == 'complete':
            skipped += 1
            continue
        existing = {i.get('key'): i for i in (a.get('items') or []) if isinstance(i, dict)}
        merged: List[Dict[str, Any]] = []
        a_added = a_updated = a_removed = 0

        for t in tmpl_items:
            cur = existing.get(t.get('key'))
            if cur is None:
                merged.append({**t, 'status': 'pending', 'document_url': None,
                               'documents': [], 'submitted_at': None,
                               'approved_by': None, 'approved_at': None,
                               'admin_notes': None, 'signature': None})
                a_added += 1
                continue
            item = dict(cur)
            done = item.get('status') in ('complete', 'approved')
            fields = _TEMPLATE_ITEM_WORDING if done else (
                _TEMPLATE_ITEM_WORDING + _TEMPLATE_ITEM_RULES)
            if any(item.get(f) != t.get(f) for f in fields):
                a_updated += 1
                for f in fields:
                    item[f] = t.get(f)
            merged.append(item)

        # Items the template dropped: kept when they carry work, gone when they
        # do not.
        for key, item in existing.items():
            if key in tmpl_keys:
                continue
            if item.get('status') == 'pending' and not item_documents(item) \
                    and not item.get('signature'):
                a_removed += 1
            else:
                merged.append(item)

        if not (a_added or a_updated or a_removed):
            continue
        _save_items(a, merged)
        synced += 1
        added += a_added
        updated += a_updated
        removed += a_removed

    return {'synced': synced, 'skipped_complete': skipped, 'assignments': len(assignments),
            'added': added, 'updated': updated, 'removed': removed}


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

class RecipientNotInOrg(Exception):
    """A recipient does not belong to the assigning organization."""


def assert_recipients_in_org(org_id: str, user_ids: List[str]) -> None:
    """Refuse to assign or send to anyone outside this org.

    An assignment row carries the CALLER's organization_id but a user_id taken
    from the request. Without this check, an org admin could file a checklist —
    or a document to sign — into any account on the platform, in any other
    tenant, and have the product notify them about it.

    Checks membership, not existence: a real user id from another school is
    exactly the input this exists to reject. All-or-nothing, because a partial
    send is harder to reason about than a refused one.
    """
    ids = [u for u in dict.fromkeys(user_ids) if u]
    if not ids:
        return
    if not org_id:
        raise RecipientNotInOrg('No organization in context')
    try:
        rows = (_admin().table('users').select('id, organization_id')
                .in_('id', ids).execute()).data or []
    except Exception as e:  # noqa: BLE001
        # Fail CLOSED. This is an authorization check, and a lookup we could not
        # complete is not permission to skip it.
        logger.error(f'[Onboarding] Recipient org check failed for org {org_id}: {e}')
        raise RecipientNotInOrg('Could not verify recipients') from e

    in_org = {r['id'] for r in rows if r.get('organization_id') == org_id}
    rejected = [u for u in ids if u not in in_org]
    if rejected:
        logger.warning(
            f'[Onboarding] Refused {len(rejected)} recipient(s) outside org {org_id}: '
            f'{", ".join(str(r)[:8] + "..." for r in rejected[:5])}')
        raise RecipientNotInOrg(
            'Some recipients are not part of this organization' if len(rejected) > 1
            else 'That person is not part of this organization')


def assign(org_id: str, template_id: str, user_id: str, assigned_by: str) -> Dict[str, Any]:
    rows = (_admin().table('sis_onboarding_templates').select('*')
            .eq('id', template_id).limit(1).execute()).data
    if not rows or rows[0].get('organization_id') != org_id:
        return {'error': 'Template not found'}
    # The template is confirmed to be this org's; the recipient is not, until
    # here. Both halves have to be checked, or the row lands in another tenant.
    try:
        assert_recipients_in_org(org_id, [user_id])
    except RecipientNotInOrg as e:
        return {'error': str(e)}
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
        # Snapshotted like the items: a later template edit must not rewrite the
        # directions under somebody already working through the checklist.
        'description': template.get('description'),
        # Snapshotted alongside the items: the portal a checklist belongs to must
        # not change when someone edits or deletes the template it came from.
        'audience': 'family' if is_family else 'staff',
        # Copied, not referenced — same reason the items are (see the 20260818
        # migration): editing a template later must not retroactively lock out
        # families who were assigned the version that didn't.
        'blocks_access': bool(template.get('blocks_access')) and is_family,
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


def assign_task(org_id: str, title: str, user_ids: List[str], assigned_by: str,
                description: Optional[str] = None, due_date: Optional[str] = None,
                audience: str = 'staff', items: Optional[List[Dict[str, Any]]] = None,
                needs_document: bool = False) -> Dict[str, Any]:
    """An ad-hoc task: "do this thing (or these few things), tick when done."

    Stored as an assignment with no template — the same record a checklist
    uses, so it shows up in My Tasks, the admin roll-up and the completion flow
    without any of them learning a new shape. The template_name carries the
    task's title, which is what the roll-up displays.

    With no `items`, the title IS the single item (plus `needs_document` when
    the task is "send me a file"). With `items`, each becomes a step — the
    composer's "add steps", which is all a checklist ever was.
    """
    title = (title or '').strip()
    if not title:
        return {'error': 'The task needs a title'}
    ids = [u for u in dict.fromkeys(user_ids or []) if u]
    if not ids:
        return {'error': 'Pick at least one person'}
    try:
        assert_recipients_in_org(org_id, ids)
    except RecipientNotInOrg as e:
        return {'error': str(e)}
    audience = _clean_audience(audience)
    is_family = audience == 'family'
    link = '/family/portal' if is_family else '/my-tasks'

    if items:
        cleaned = _clean_items(items)
        if cleaned is None:
            return {'error': 'Every step needs a title'}
        # A step never signs (that is the signature-send flow, which brings the
        # document) and never demands office approval — the whole point of an
        # ad-hoc task is that ticking it is the end of it.
        for it in cleaned:
            it['needs_signature'] = False
            it['needs_approval'] = False
            it['document_id'] = None
            it['due_date'] = it['due_date'] or due_date or None
    else:
        cleaned = [{
            'key': f'item_{_uuid.uuid4().hex[:12]}',
            'title': title,
            'description': (description or '').strip() or None,
            'required': True,
            'needs_document': bool(needs_document),
            'needs_signature': False, 'needs_approval': False,
            'due_date': due_date or None, 'link': None, 'document_id': None,
        }]
    fresh = [{**it, 'status': 'pending', 'document_url': None, 'documents': [],
              'submitted_at': None, 'approved_by': None, 'approved_at': None,
              'admin_notes': None, 'signature': None}
             for it in cleaned]

    assigned, errors = 0, []
    for uid in ids:
        try:
            (_admin().table('sis_onboarding_assignments').insert({
                'organization_id': org_id, 'user_id': uid,
                'template_id': None, 'template_name': title,
                'description': (description or '').strip() or None if items else None,
                'audience': audience,
                # An ad-hoc task never gates the portal.
                'blocks_access': False,
                'items': [dict(it) for it in fresh], 'assigned_by': assigned_by,
            }).execute())
        except Exception as e:  # noqa: BLE001
            logger.error(f'[Onboarding] Ad-hoc task insert failed for org {org_id}: {e}')
            errors.append('Could not assign to one recipient')
            continue
        assigned += 1
        n = len(fresh)
        sis_notifications.notify(
            uid, 'New task',
            f'"{title}"' + (f' — {n} steps' if n > 1 else '')
            + (f' — due {due_date}' if due_date else ''),
            link=link, organization_id=org_id)
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
                     audience: Optional[str] = None,
                     kind: Optional[str] = None) -> List[Dict[str, Any]]:
    """Checklists in this org, optionally for one person and one portal.

    `audience` matters because one person can hold both kinds: an org admin who
    also has a child is staff in the SIS console and a guardian in the family
    portal. Without the filter their teacher checklist showed up in the family
    portal (reported 2026-08-05). The admin roll-up passes None on purpose — it
    is the one view that should see everything it assigned.

    `kind` separates assigned templates from one-off documents sent for
    signature. The checklist admin view passes 'checklist' so a handbook sent to
    40 people doesn't bury the onboarding roll-up in 40 rows; a person's own
    inbox passes None, because from where they stand both are just things to do.
    """
    q = (_admin().table('sis_onboarding_assignments').select('*')
         .eq('organization_id', org_id).order('created_at', desc=True))
    if user_id:
        q = q.eq('user_id', user_id)
    if audience:
        q = q.eq('audience', _clean_audience(audience))
    if kind:
        q = q.eq('kind', kind)
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


def signatures_by_document(org_id: str) -> Dict[str, Dict[str, Any]]:
    """doc_id -> the checklist signature that signed it.

    A signature item records the documents the signer had in front of them
    (`signature.documents`, see _apply_signature) — this reads that evidence
    back per stored document, so the documents list can say "Signed <date>"
    instead of showing the requires_signature ask-flag as if nobody had signed
    (iCreate, 2026-08-31: a signed contract still read "Needs signature")."""
    rows = fetch_all_rows(lambda: (
        _admin().table('sis_onboarding_assignments').select('id, items')
        .eq('organization_id', org_id)))
    out: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        for item in (r.get('items') or []):
            sig = item.get('signature') or {}
            for doc in (sig.get('documents') or []):
                if isinstance(doc, dict) and doc.get('id'):
                    out[doc['id']] = {'signed_at': sig.get('signed_at'),
                                      'signed_by': sig.get('signed_by'),
                                      'signed_by_name': sig.get('name')}
    return out


def checklist_documents(org_id: str) -> List[Dict[str, Any]]:
    """Every checklist attachment in the org, shaped like a secure-document row.

    The admin's filing cabinet is /secure-documents, but a checklist upload
    lives on the assignment item and its blob in a checklist bucket — so the
    office searched the cabinet for a background check that was filed one tab
    over (iCreate, 2026-08-31). Merged at read time rather than mirrored into
    sis_secure_documents on upload: removing an attachment deletes its blob
    (_remove_document_blob), and a mirror row would outlive the file.

    These rows are read-only in the store — no sis_secure_documents id to
    rename, delete or share — which is what `source: 'checklist'` tells the
    frontend. `audience` picks the bucket when the file is opened."""
    rows = fetch_all_rows(lambda: (
        _admin().table('sis_onboarding_assignments')
        .select('id, user_id, audience, items')
        .eq('organization_id', org_id)))
    out: List[Dict[str, Any]] = []
    for r in rows:
        audience = _clean_audience(r.get('audience'))
        for item in (r.get('items') or []):
            for i, doc in enumerate(item_documents(item)):
                out.append({
                    'id': f"checklist:{r['id']}:{item.get('key')}:{i}",
                    'source': 'checklist',
                    'audience': audience,
                    'organization_id': org_id,
                    'owner_user_id': r.get('user_id'),
                    'student_user_id': None,
                    'uploaded_by': r.get('user_id'),
                    'uploaded_by_owner': True,
                    'storage_path': doc.get('path'),
                    'filename': doc.get('filename'),
                    'title': doc.get('filename') or item.get('title'),
                    'category': item.get('title'),
                    'note': None,
                    'created_at': doc.get('uploaded_at'),
                    'shared_with_owner': True,
                    'requires_signature': False,
                })
    return out


def office_documents(org_id: str, user_id: str,
                     document_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Documents the office has put in this person's portal — shared with them,
    not uploaded by them. This is the pool a document-signature item signs
    against (see _attach_sign_docs).

    `document_id` narrows the pool to one document: a send-for-signature item
    names the exact document it was sent for, so signing it doesn't record every
    other paper in their portal as "what they had in front of them" — and so a
    second send can't be satisfied by a document from the first.

    Otherwise the pool is narrowed by `requires_signature`: the documents the
    office actually ticked as needing a signature. iCreate, 2026-08-19 — a
    template item reading "Review & Sign Your Contract" signed against
    everything shared, so once background checks were shared too, the item
    offered a background check as the contract.

    Flagged documents win. What happens when somebody has NONE flagged depends
    on whether their school uses the tick at all:

      * a school that has never ticked anything keeps its whole shared pool,
        exactly as before. Nobody is to fall into an empty pool by upgrading —
        an empty pool reads "your document is not here yet" against an item the
        office believes it has already satisfied, which is the failure this
        codebase shipped on 2026-08-18.
      * once a school HAS ticked something, silence means what it says: this
        person has nothing to sign. Without that, the person the office never
        had a contract for keeps being offered whatever else is in their portal
        — which for iCreate's own admin was her background check, the report
        that started this.

    A document that already has its own signature task is never in the general
    pool. iCreate, 2026-08-20: the office sent the Family Service Program form
    and the Student Behavior Agreement out for signature at 18:27, and three
    hours later the admin's "Review & Sign Your Contract" item was telling her
    to read both of them first. Both are flagged for signature — they were sent
    for signature — so the flag alone cannot separate them from her contract.
    What separates them is that each already IS a task, named on its own
    assignment (see _claimed_document_ids).
    """
    q = (_admin().table('sis_secure_documents')
         .select('id, title, filename, requires_signature')
         .eq('organization_id', org_id).eq('owner_user_id', user_id)
         .eq('shared_with_owner', True).eq('uploaded_by_owner', False))
    if document_id:
        q = q.eq('id', document_id)
    rows = (q.order('created_at', desc=True).execute()).data or []
    if not document_id:
        claimed = _claimed_document_ids(org_id, user_id)
        if claimed:
            rows = [r for r in rows if r['id'] not in claimed]
        flagged = [r for r in rows if r.get('requires_signature')]
        rows = flagged if (flagged or _org_asks_for_signatures(org_id)) else rows
    return [{'id': r['id'], 'title': r.get('title') or r.get('filename') or 'Document'}
            for r in rows]


def _claimed_document_ids(org_id: str, user_id: str) -> set:
    """Documents this person already has a signature task for, by name.

    A send-for-signature assignment names the exact document its single item
    signs (`items[].document_id`). Such a document is somebody's task in its own
    right and appears in My Tasks as one — so offering it AGAIN as reading
    material under an unrelated checklist item is a second, wrong copy of the
    same obligation.

    Scoped to this person: the same document sent to somebody else is nothing to
    do with what is in their portal.
    """
    rows = (_admin().table('sis_onboarding_assignments').select('items')
            .eq('organization_id', org_id).eq('user_id', user_id)
            .eq('kind', 'signature_request').execute()).data or []
    return {i['document_id'] for r in rows for i in (r.get('items') or [])
            if i.get('document_id')}


def _org_asks_for_signatures(org_id: str) -> bool:
    """Has this school ever ticked "they must sign this" on a document?

    The one question that separates "nothing to sign" from "this school predates
    the tick" — see office_documents. One row is enough of an answer, so it asks
    for one.
    """
    rows = (_admin().table('sis_secure_documents').select('id')
            .eq('organization_id', org_id).eq('requires_signature', True)
            .limit(1).execute()).data
    return bool(rows)


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
    # An item naming its own document gets just that one; the shared pool is
    # fetched once, and only when some item still needs it.
    pool = None
    for i in wants:
        if i.get('document_id'):
            i['sign_docs'] = office_documents(org_id, user_id, i['document_id'])
            continue
        if pool is None:
            pool = office_documents(org_id, user_id)
        i['sign_docs'] = pool


# ── Send a document out for signature ────────────────────────────────────────
#
# The office uploads one document, picks the people who must sign it, and gets
# back one trackable send. Mechanically this is a one-item checklist per person
# whose single item signs that person's copy of the document — which is why it
# lives here and not in a new service: the signing, the evidence recorded, the
# "you can't sign what the office hasn't uploaded" guard and the admin's ability
# to clear a signature all already exist below, and a second implementation of
# any of them would be a second thing to get wrong.

def send_for_signature(org_id: str, sent_by: str, blob: bytes, filename: str,
                       ext: str, content_type: Optional[str], size_bytes: int,
                       recipients: List[Dict[str, Any]], *,
                       title: Optional[str] = None, message: Optional[str] = None,
                       due_date: Optional[str] = None,
                       sensitivity: str = 'general',
                       blocks_access: bool = False) -> Dict[str, Any]:
    """Upload a document, file a copy to each recipient, and assign each of them
    a task to sign it.

    `recipients` is [{'id': user_id, 'audience': 'staff'|'family'}] — audience
    decides which portal the notification points at, exactly as a template's
    audience does.

    `blocks_access` makes signing a condition rather than a request: until the
    recipient signs, the platform gives them the signing screen and nothing
    else (services/sis_access_gate.py). It applies to FAMILY recipients only.
    The same send can carry both audiences — a policy that goes to every
    teacher and every parent — and holding a teacher out of their classroom
    over paperwork is a different decision from holding a family out, one the
    school has not made by ticking this box.
    """
    recipients = [r for r in recipients if r.get('id')]
    # De-dupe by user, keeping order: sending the same document to one person
    # twice in one action would give them two identical things to sign.
    seen, unique = set(), []
    for r in recipients:
        if r['id'] in seen:
            continue
        seen.add(r['id'])
        unique.append(r)
    if not unique:
        return {'error': 'Select at least one person to send this to'}

    # Before anything is uploaded: everyone on the list is in this school.
    try:
        assert_recipients_in_org(org_id, [r['id'] for r in unique])
    except RecipientNotInOrg as e:
        return {'error': str(e), 'status': 403}

    doc_title = sis_secure_docs_service.clean_title(title, filename)
    stored = sis_secure_docs_service.store_document(
        org_id, sent_by, blob, filename, ext, content_type, size_bytes,
        targets=[{'owner_user_id': r['id'], 'student_user_id': None} for r in unique],
        title=doc_title, category='Sent for signature',
        # Shared on purpose: the whole point is that they open and sign it.
        # Flagged for the same reason — the send's own item names this document
        # by id, but the office's list should show what it is, and a person's
        # OTHER checklist items must not treat a contract sent this way as one
        # more paper in the pool.
        shared_with_owner=True, requires_signature=True, sensitivity=sensitivity,
    )
    if stored.get('error'):
        return stored

    documents = stored['documents']
    batch_id = str(_uuid.uuid4())
    rows = []
    for recipient, doc in zip(unique, documents):
        is_family = _clean_audience(recipient.get('audience')) == 'family'
        rows.append({
            'organization_id': org_id,
            'user_id': recipient['id'],
            'template_id': None,
            'template_name': doc_title,
            'audience': 'family' if is_family else 'staff',
            'kind': 'signature_request',
            'batch_id': batch_id,
            'assigned_by': sent_by,
            'blocks_access': bool(blocks_access) and is_family,
            'items': [{
                'key': 'sign',
                'title': f'Sign: {doc_title}',
                'description': (message or '').strip() or None,
                'required': True,
                'needs_document': False,
                'needs_signature': True,
                'needs_approval': False,
                'due_date': due_date or None,
                'link': None,
                # Their own copy — not the pool. See office_documents.
                'document_id': doc.get('id'),
                'status': 'pending',
                'document_url': None,
                'submitted_at': None,
                'approved_by': None,
                'approved_at': None,
                'admin_notes': None,
                'signature': None,
            }],
        })

    try:
        inserted = (_admin().table('sis_onboarding_assignments')
                    .insert(rows).execute()).data or []
    except Exception as e:
        logger.error(f'Send for signature failed to create assignments: {e}')
        # The documents landed but nobody was asked to sign them; take the
        # copies back out rather than leaving files in portals with no task.
        sis_secure_docs_service.remove_blobs(
            [d['storage_path'] for d in documents if d.get('storage_path')])
        ids = [d['id'] for d in documents if d.get('id')]
        if ids:
            try:
                _admin().table('sis_secure_documents').delete().in_('id', ids).execute()
            except Exception:
                logger.debug('Secure document row cleanup failed (non-fatal)', exc_info=True)
        return {'error': 'Could not send the document for signature', 'status': 500}

    for row in rows:
        link = '/family/portal' if row['audience'] == 'family' else '/my-tasks'
        required = row.get('blocks_access')
        sis_notifications.notify(
            row['user_id'],
            'Signature required' if required else 'Document to sign',
            (f'"{doc_title}" must be signed before you can continue using Optio.'
             if required else f'"{doc_title}" is waiting for your signature.'),
            link='/family/required-documents' if required else link,
            organization_id=org_id)
        if required:
            # The gate caches "this person is clear" for a minute; a new hold
            # has to bite now, not a minute from now.
            sis_access_gate.clear_cache(row['user_id'])

    return {'batch_id': batch_id, 'sent': len(inserted or rows),
            'document_title': doc_title, 'blocks_access': bool(blocks_access)}


def list_signature_batches(org_id: str, include_hr: bool = False) -> List[Dict[str, Any]]:
    """Documents sent for signature, one entry per send, newest first.

    A campus coordinator sees campus paperwork and not employment paperwork, so
    the HR filter is applied to the DOCUMENTS the batch was built from rather
    than to the assignments — the assignment rows themselves carry no
    sensitivity, and inferring it from the title is exactly the kind of guess
    that leaks a contract.
    """
    rows = (_admin().table('sis_onboarding_assignments').select('*')
            .eq('organization_id', org_id).eq('kind', 'signature_request')
            .not_.is_('batch_id', 'null')
            .order('created_at', desc=True).execute()).data or []
    if not rows:
        return []

    doc_ids = [i.get('document_id') for r in rows for i in (r.get('items') or [])
               if i.get('document_id')]
    allowed_docs: Dict[str, Dict[str, Any]] = {}
    if doc_ids:
        q = (_admin().table('sis_secure_documents')
             .select('id, sensitivity, title, storage_path')
             .in_('id', list(set(doc_ids))))
        if not include_hr:
            q = q.eq('sensitivity', 'general')
        allowed_docs = {d['id']: d for d in (q.execute().data or [])}

    user_ids = list({r['user_id'] for r in rows})
    names = {}
    if user_ids:
        urows = (_admin().table('users')
                 .select('id, first_name, last_name, display_name, email')
                 .in_('id', user_ids).execute()).data or []
        names = {u['id']: (u.get('display_name')
                           or f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip()
                           or u.get('email')) for u in urows}

    batches: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        item = (r.get('items') or [{}])[0]
        doc_id = item.get('document_id')
        # A row whose document the caller may not see doesn't just get its
        # document hidden — the whole send stays invisible to them.
        if doc_id and doc_id not in allowed_docs:
            continue
        if not doc_id and not include_hr:
            continue
        batch = batches.setdefault(r['batch_id'], {
            'batch_id': r['batch_id'],
            'title': r.get('template_name') or 'Document',
            'sent_at': r.get('created_at'),
            'sent_by': r.get('assigned_by'),
            'sensitivity': (allowed_docs.get(doc_id) or {}).get('sensitivity', 'hr'),
            'due_date': item.get('due_date'),
            'recipients': [],
        })
        signature = item.get('signature') or None
        batch['recipients'].append({
            'assignment_id': r['id'],
            'user_id': r['user_id'],
            'name': names.get(r['user_id']),
            'audience': r.get('audience'),
            'document_id': doc_id,
            'signed': bool(signature),
            'signed_at': (signature or {}).get('signed_at'),
            'signed_name': (signature or {}).get('name'),
            # Still holding this person out of the platform? Drops to false the
            # moment the office releases the hold, so the tracking page shows
            # the release rather than only the signature.
            'blocks_access': bool(r.get('blocks_access')),
        })

    out = list(batches.values())
    for b in out:
        b['recipients'].sort(key=lambda p: (p.get('name') or '').lower())
        b['signed_count'] = len([p for p in b['recipients'] if p['signed']])
        b['total_count'] = len(b['recipients'])
        # A send is "required" if anyone on it is still held by it.
        b['blocks_access'] = any(p['blocks_access'] for p in b['recipients'])
    out.sort(key=lambda b: b.get('sent_at') or '', reverse=True)
    return out


def _load_signature_assignment(org_id: str, assignment_id: str, *,
                               include_hr: bool) -> Optional[Dict[str, Any]]:
    """One send's assignment row, or None if this caller may not see it.

    Whether the caller may see a send at all is decided by the DOCUMENT's
    sensitivity, exactly as in list_signature_batches — a coordinator must not
    be able to reach an employment contract by guessing an assignment id, and
    any split between "not allowed" and "no such row" would confirm the row
    exists. Everything that acts on a single send resolves it through here, so
    that rule has one implementation rather than one per action.
    """
    rows = (_admin().table('sis_onboarding_assignments')
            .select('id, organization_id, user_id, audience, template_name, items')
            .eq('id', assignment_id).eq('kind', 'signature_request')
            .limit(1).execute()).data or []
    if not rows or rows[0].get('organization_id') != org_id:
        return None
    row = rows[0]
    doc_id = ((row.get('items') or [{}])[0]).get('document_id')
    sensitivity = 'hr'
    if doc_id:
        docs = (_admin().table('sis_secure_documents').select('id, sensitivity')
                .eq('id', doc_id).limit(1).execute()).data or []
        sensitivity = (docs[0].get('sensitivity') if docs else 'hr') or 'hr'
    if sensitivity == 'hr' and not include_hr:
        return None
    return row


def may_see_signature_assignment(org_id: str, assignment_id: str, *,
                                 include_hr: bool = False) -> bool:
    """Is this send visible to a caller with these privileges?"""
    return _load_signature_assignment(
        org_id, assignment_id, include_hr=include_hr) is not None


def remind_signature_recipient(org_id: str, assignment_id: str, *,
                               include_hr: bool = False) -> Dict[str, Any]:
    """Nudge one person who still has not signed something sent to them.

    The natural next click after reading "3 of 12 signed" is to chase the other
    nine, and before this the only way to do it was outside the product.
    """
    row = _load_signature_assignment(org_id, assignment_id, include_hr=include_hr)
    if not row:
        return {'error': 'Not found', 'status': 404}

    item = (row.get('items') or [{}])[0]
    if item.get('signature'):
        return {'error': 'They have already signed this', 'status': 400}

    title = row.get('template_name') or 'Document'
    is_family = _clean_audience(row.get('audience')) == 'family'
    sis_notifications.notify(
        row['user_id'], 'Reminder: document to sign',
        f'"{title}" is still waiting for your signature.',
        link='/family/portal' if is_family else '/my-tasks',
        organization_id=org_id)
    return {'reminded': row['user_id']}


def unassign(org_id: str, assignment_id: str) -> Dict[str, Any]:
    """Remove a checklist from someone (the "oops, wrong template" undo).

    Uploaded documents are deliberately LEFT IN STORAGE. An accidental unassign
    must not destroy a background check or a signed contract someone already
    sent in; the files stay in the private staff-documents bucket and any
    re-assignment starts a fresh checklist. Returns how many documents were
    detached so the UI can warn before removing a checklist with real work in it.
    """
    rows = (_admin().table('sis_onboarding_assignments')
            .select('id, organization_id, user_id, items, template_name, blocks_access')
            .eq('id', assignment_id).limit(1).execute()).data
    if not rows or rows[0].get('organization_id') != org_id:
        return {'error': 'Checklist not found'}
    items = rows[0].get('items') or []
    docs = len([i for i in items if i.get('document_url')])
    done = len([i for i in items if i.get('status') in ('complete', 'approved')])
    _admin().table('sis_onboarding_assignments').delete().eq('id', assignment_id).execute()
    if rows[0].get('blocks_access'):
        # Taking the paperwork back takes the hold with it.
        sis_access_gate.clear_cache(rows[0].get('user_id'))
    return {'unassigned': True, 'documents_kept': docs, 'items_completed': done,
            'template_name': rows[0].get('template_name')}


def _load_assignment(org_id: str, assignment_id: str) -> Optional[Dict[str, Any]]:
    rows = (_admin().table('sis_onboarding_assignments').select('*')
            .eq('id', assignment_id).limit(1).execute()).data
    if not rows or rows[0].get('organization_id') != org_id:
        return None
    return rows[0]


def _save_items(assignment: Dict[str, Any], items: List[Dict[str, Any]]) -> Dict[str, Any]:
    if assignment.get('blocks_access'):
        # Signing needs no invalidation (a held user is never cached), but an
        # admin clearing a signature re-imposes a hold on someone the cache may
        # currently believe is clear.
        sis_access_gate.clear_cache(assignment.get('user_id'))
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

    if 'add_document' in fields:
        doc = fields.get('add_document') or {}
        path = (str(doc.get('path') or '')).strip()
        if not path:
            return {'error': 'That upload did not produce a file'}
        docs = item_documents(target)
        if not any(d.get('path') == path for d in docs):
            docs.append({'path': path,
                         'filename': (str(doc.get('filename') or '')).strip() or None,
                         'uploaded_at': _now()})
        _set_item_documents(target, docs)

    if 'remove_document' in fields:
        path = (str(fields.get('remove_document') or '')).strip()
        remaining = [d for d in item_documents(target) if d.get('path') != path]
        _set_item_documents(target, remaining)
        # The blob goes with it: a file nobody can reach from the checklist is a
        # copy of somebody's ID sitting in a bucket with no owner.
        if path:
            _remove_document_blob(assignment, path)

    if 'document_url' in fields:
        # Legacy single-document write, still used by the family portal upload.
        url = fields.get('document_url') or None
        _set_item_documents(target, [{'path': url, 'filename': None,
                                      'uploaded_at': _now()}] if url else [])

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
            documents = office_documents(org_id, assignment['user_id'],
                                         target.get('document_id'))
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
