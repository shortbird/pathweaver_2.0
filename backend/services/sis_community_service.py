"""
SIS Community Hub — business logic for the org's community section.

Three staff-managed modules live here (Announcements, Lost & Found, Recognition),
plus a read-only Highlights aggregation that stitches those modules together with
the existing sis_events calendar and upcoming birthdays from users.date_of_birth.

All three tables (sis_announcements, sis_lost_found, sis_recognition) are deny-all
RLS — reached only through the service-role admin client here; the route layer
(routes/sis/community.py) enforces role + org scoping. No user client is ever used.

Staff-managed, but not staff-only to read: `family_feed()` is the same board seen
from the family side, projected onto a narrower set of columns (see the comment
above it).
"""

from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from database import get_supabase_admin_client
from utils import rich_text
from utils.logger import get_logger
from utils import person_name
from utils.storage_urls import (
    parse_object_ref,
    public_object_url,
    sign_in_place,
    sign_stored_url,
)
from utils.validation import sanitize_text

logger = get_logger(__name__)

# Lost & Found items are held this long before they're eligible to be donated.
DONATION_WINDOW_DAYS = 14

ANNOUNCEMENT_PRIORITIES = ('normal', 'urgent')
# Mirrors sis_events.audience, including the default. Board posts had no
# audience at all, so a note written for teachers reached every family
# (iCreate, 2026-08-26: "things Sent to teachers should not be showing up for
# Families").
ANNOUNCEMENT_AUDIENCES = ('school', 'teachers', 'admins')
LOST_FOUND_STATUSES = ('unclaimed', 'claimed', 'donated')

# Lost & Found photos are taken inside the school and routinely have children in
# them, so `community-images` is private. The column holds the canonical pointer;
# every read signs it for the length of one render.
LOST_FOUND_BUCKET = 'community-images'
RECOGNITION_TYPES = ('shout_out', 'student_spotlight', 'volunteer', 'weekly_win', 'thank_you')


def _admin():
    # admin client justified: the SIS console acts for the whole school — this
    #   reads/writes rows belonging to every family in the org, which no single
    #   caller can see under RLS; the route's role+org gate is the authorization
    return get_supabase_admin_client()


from utils.timestamps import now_iso as _now_iso  # noqa: E402


def _text(v: Optional[str]) -> Optional[str]:
    """Sanitize a free-text field to a trimmed string or None (rendered as text)."""
    if v is None:
        return None
    cleaned = sanitize_text(str(v)).strip()
    return cleaned or None


def _body(v: Optional[str]) -> Optional[str]:
    """A post body, which may have been written with the editor.

    Formatted bodies are kept as sanitized HTML (see utils/rich_text); anything
    typed plain still goes through the plain-text path, where tags are stripped.
    """
    if v is None:
        return None
    if rich_text.is_html(str(v)):
        cleaned = rich_text.sanitize(str(v)).strip()
        return cleaned or None
    return _text(v)


# ── Announcements ─────────────────────────────────────────────────────────────

def _is_visible_announcement(row: Dict[str, Any], now: datetime) -> bool:
    """A published, non-expired announcement (staff always pass an unfiltered list;
    Highlights uses this to hide scheduled/expired ones)."""
    publish_at = row.get('publish_at')
    expires_at = row.get('expires_at')
    if publish_at and str(publish_at) > now.isoformat():
        return False
    if expires_at and str(expires_at) < now.isoformat():
        return False
    return True


def list_announcements(org_id: str, include_hidden: bool = True) -> List[Dict[str, Any]]:
    """Announcements newest-first with pinned on top. Staff get everything
    (include_hidden); Highlights passes include_hidden=False to drop scheduled/
    expired ones."""
    rows = (
        _admin().table('sis_announcements').select('*')
        .eq('organization_id', org_id)
        .order('created_at', desc=True)
        .execute()
    ).data or []
    if not include_hidden:
        now = datetime.utcnow()
        rows = [r for r in rows if _is_visible_announcement(r, now)]
    # Pinned float to the top; created_at desc preserved within each group.
    rows.sort(key=lambda r: (not r.get('pinned'),))
    return rows


def create_announcement(org_id: str, user_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    title = _text(data.get('title'))
    if not title:
        return {'error': 'A title is required'}
    priority = data.get('priority') or 'normal'
    if priority not in ANNOUNCEMENT_PRIORITIES:
        priority = 'normal'
    audience = data.get('audience') or 'school'
    if audience not in ANNOUNCEMENT_AUDIENCES:
        audience = 'school'
    fields = {
        'organization_id': org_id,
        'title': title,
        'body': _body(data.get('body')),
        'pinned': bool(data.get('pinned')),
        'priority': priority,
        'audience': audience,
        'publish_at': (str(data['publish_at']).strip() or None) if data.get('publish_at') else None,
        'expires_at': (str(data['expires_at']).strip() or None) if data.get('expires_at') else None,
        'created_by': user_id,
    }
    row = (_admin().table('sis_announcements').insert(fields).execute()).data
    created = row[0] if row else None

    # Posting puts it on the board, which families can now read (see
    # family_feed). Sending is the louder, separate act iCreate expected the
    # first time ("I just posted an announcement from the admin side and it
    # doesn't show up ... on the non-admin side"): the family-facing
    # announcement path — durable row, in-app notification, email. Best-effort —
    # a delivery problem must not lose the post that already succeeded.
    result = {'announcement': created}
    audiences = data.get('notify_audiences')
    if audiences:
        try:
            from services import announcement_service
            audiences = announcement_service.normalize_audiences(audiences)
            if audiences:
                sent = announcement_service.publish(
                    org_id, user_id, title, _body(data.get('body')) or title, audiences,
                    # Tie the send to the post, so an edit or a delete on the
                    # board reaches both halves of what a family sees as one
                    # notice (see announcement_service.revise_for_source).
                    source_announcement_id=(created or {}).get('id'))
                result['notified'] = {**sent, 'audiences': audiences}
        except Exception as e:  # noqa: BLE001
            logger.error(f'Community announcement fan-out failed: {e}', exc_info=True)
            result['notify_error'] = 'The post was saved, but sending it to families failed.'
    return result


def update_announcement(org_id: str, announcement_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not _owned(org_id, 'sis_announcements', announcement_id):
        return None
    fields: Dict[str, Any] = {}
    if 'title' in data:
        title = _text(data.get('title'))
        if not title:
            return {'error': 'A title is required'}
        fields['title'] = title
    if 'body' in data:
        fields['body'] = _body(data.get('body'))
    if 'pinned' in data:
        fields['pinned'] = bool(data.get('pinned'))
    if 'priority' in data:
        fields['priority'] = data['priority'] if data['priority'] in ANNOUNCEMENT_PRIORITIES else 'normal'
    if 'audience' in data:
        fields['audience'] = data['audience'] if data['audience'] in ANNOUNCEMENT_AUDIENCES else 'school'
    for k in ('publish_at', 'expires_at'):
        if k in data:
            fields[k] = (str(data[k]).strip() or None) if data.get(k) else None
    fields['updated_at'] = _now_iso()
    row = (_admin().table('sis_announcements').update(fields).eq('id', announcement_id).execute()).data
    # The same edit has to reach the send this post spawned, or the family feed
    # sees two notices where the admin edited one.
    if 'title' in fields or 'body' in fields:
        try:
            from services import announcement_service
            announcement_service.revise_for_source(
                announcement_id, title=fields.get('title'), content=fields.get('body'))
        except Exception as e:  # noqa: BLE001
            logger.error(f'Announcement revision fan-out failed: {e}', exc_info=True)
    return {'announcement': row[0] if row else None}


def delete_announcement(org_id: str, announcement_id: str) -> bool:
    """Take a board post down, and with it the send it spawned.

    delete_row alone removed the board copy only, which is how a notice the
    admin had deleted stayed on the parent dashboard (iCreate, 2026-08-28).
    """
    if not _owned(org_id, 'sis_announcements', announcement_id):
        return False
    try:
        from services import announcement_service
        announcement_service.retract_for_source(announcement_id)
    except Exception as e:  # noqa: BLE001
        logger.error(f'Announcement retraction fan-out failed: {e}', exc_info=True)
    _admin().table('sis_announcements').delete().eq('id', announcement_id).execute()
    return True


# ── Lost & Found ──────────────────────────────────────────────────────────────

def _decorate_lost_found(row: Dict[str, Any]) -> Dict[str, Any]:
    """Add the computed donation deadline + days-remaining to a lost&found row."""
    df = row.get('date_found')
    deadline = None
    days_left = None
    past_deadline = False
    if df:
        try:
            found = date.fromisoformat(str(df)[:10])
            deadline_d = found + timedelta(days=DONATION_WINDOW_DAYS)
            deadline = deadline_d.isoformat()
            days_left = (deadline_d - date.today()).days
            past_deadline = days_left < 0
        except (ValueError, TypeError):
            # unparseable date: skip it
            ...
    row['donation_deadline'] = deadline
    row['days_until_donation'] = days_left
    # Only unclaimed items that have blown their deadline are donation candidates.
    row['past_donation_deadline'] = bool(past_deadline and row.get('status') == 'unclaimed')
    return row


def _signed_item(row: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Decorate one row and swap its stored image pointer for a signed URL."""
    if not row:
        return None
    item = _decorate_lost_found(row)
    if item.get('image_url'):
        item['image_url'] = sign_stored_url(item['image_url'], LOST_FOUND_BUCKET)
    return item


def _stored_image_url(value: Any) -> Optional[str]:
    """Reduce whatever the client sent to the canonical pointer we persist.

    The client only ever receives a SIGNED image URL, so an edit that resubmits
    the row would otherwise write an expiring capability into the column.
    """
    text = (str(value).strip() or None) if value else None
    if not text:
        return None
    ref = parse_object_ref(text)
    return public_object_url(*ref) if ref else text


def list_lost_found(org_id: str, status: Optional[str] = None) -> List[Dict[str, Any]]:
    q = (_admin().table('sis_lost_found').select('*').eq('organization_id', org_id))
    if status and status in LOST_FOUND_STATUSES:
        q = q.eq('status', status)
    rows = (q.order('created_at', desc=True).execute()).data or []
    items = [_decorate_lost_found(r) for r in rows]
    # One batched signing call for the whole board, not one per item.
    sign_in_place(items, ['image_url'], LOST_FOUND_BUCKET)
    return items


def create_lost_found(org_id: str, user_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    description = _text(data.get('description'))
    if not description:
        return {'error': 'A description is required'}
    status = data.get('status') or 'unclaimed'
    if status not in LOST_FOUND_STATUSES:
        status = 'unclaimed'
    fields = {
        'organization_id': org_id,
        'description': description,
        'image_url': _stored_image_url(data.get('image_url')),
        'category': _text(data.get('category')),
        'date_found': (str(data['date_found']).strip() or None) if data.get('date_found') else date.today().isoformat(),
        'location_found': _text(data.get('location_found')),
        'status': status,
        'claimed_by': _text(data.get('claimed_by')),
        'created_by': user_id,
    }
    row = (_admin().table('sis_lost_found').insert(fields).execute()).data
    return {'item': _signed_item(row[0]) if row else None}


def update_lost_found(org_id: str, item_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not _owned(org_id, 'sis_lost_found', item_id):
        return None
    fields: Dict[str, Any] = {}
    if 'description' in data:
        description = _text(data.get('description'))
        if not description:
            return {'error': 'A description is required'}
        fields['description'] = description
    for k in ('category', 'location_found', 'claimed_by'):
        if k in data:
            fields[k] = _text(data.get(k))
    if 'image_url' in data:
        fields['image_url'] = _stored_image_url(data.get('image_url'))
    if 'date_found' in data:
        fields['date_found'] = (str(data['date_found']).strip() or None) if data.get('date_found') else None
    if 'status' in data:
        fields['status'] = data['status'] if data['status'] in LOST_FOUND_STATUSES else 'unclaimed'
    fields['updated_at'] = _now_iso()
    row = (_admin().table('sis_lost_found').update(fields).eq('id', item_id).execute()).data
    return {'item': _signed_item(row[0]) if row else None}


def mark_expired_for_donation(org_id: str) -> Dict[str, Any]:
    """Bulk helper: flag every unclaimed item past its donation deadline as
    'donated'. Returns how many were moved (the deadline = date_found + 14 days)."""
    cutoff = (date.today() - timedelta(days=DONATION_WINDOW_DAYS)).isoformat()
    admin = _admin()
    stale = (
        admin.table('sis_lost_found').select('id')
        .eq('organization_id', org_id).eq('status', 'unclaimed')
        .lte('date_found', cutoff).execute()
    ).data or []
    ids = [r['id'] for r in stale]
    if ids:
        admin.table('sis_lost_found').update(
            {'status': 'donated', 'updated_at': _now_iso()}
        ).in_('id', ids).execute()
    return {'donated': len(ids)}


# ── Recognition ───────────────────────────────────────────────────────────────

def list_recognition(org_id: str, rec_type: Optional[str] = None) -> List[Dict[str, Any]]:
    q = (_admin().table('sis_recognition').select('*').eq('organization_id', org_id))
    if rec_type and rec_type in RECOGNITION_TYPES:
        q = q.eq('type', rec_type)
    return (q.order('created_at', desc=True).execute()).data or []


def create_recognition(org_id: str, user_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    message = _text(data.get('message'))
    if not message:
        return {'error': 'A message is required'}
    rec_type = data.get('type') or 'shout_out'
    if rec_type not in RECOGNITION_TYPES:
        rec_type = 'shout_out'
    recipient_user_id = data.get('recipient_user_id') or None
    fields = {
        'organization_id': org_id,
        'type': rec_type,
        'recipient_name': _text(data.get('recipient_name')),
        'recipient_user_id': recipient_user_id,
        'message': message,
        'created_by': user_id,
    }
    row = (_admin().table('sis_recognition').insert(fields).execute()).data
    return {'recognition': row[0] if row else None}


def _names_for(user_ids: List[Optional[str]]) -> Dict[str, str]:
    """Display names for a page of comment authors. One query for the page."""
    ids = [u for u in set(user_ids) if u]
    if not ids:
        return {}
    try:
        rows = (_admin().table('users')
                .select('id, display_name, first_name, last_name, preferred_name')
                .in_('id', ids).execute()).data or []
    except Exception as e:  # noqa: BLE001 — a name is a nicety, a comment is not
        logger.warning(f'Recognition comment author names unavailable: {e}')
        return {}
    # One rule for a person's name across the whole SIS — see utils.person_name.
    return {r['id']: person_name.full_name(r, 'Someone') for r in rows}


def _owned_recognition(org_id: str, recognition_id: str) -> bool:
    rows = (_admin().table('sis_recognition').select('id')
            .eq('id', recognition_id).eq('organization_id', org_id)
            .limit(1).execute()).data
    return bool(rows)


def list_recognition_comments(org_id: str, recognition_id: str) -> List[Dict[str, Any]]:
    """One shout-out's replies, oldest first — a thread is read in the order it
    was written, unlike the board above it.

    iCreate, 2026-08-31 (d0c7ac4e): "it would be nice to be able to add comments
    to the shout-outs on Community page for the post recognition." Until now the
    only way to agree with a shout-out was to write a second one, which buries
    the first.
    """
    if not _owned_recognition(org_id, recognition_id):
        return []
    rows = (_admin().table('sis_recognition_comments').select('*')
            .eq('recognition_id', recognition_id)
            .eq('organization_id', org_id)
            .order('created_at').execute()).data or []
    names = _names_for([r.get('author_id') for r in rows])
    for r in rows:
        r['author_name'] = names.get(r.get('author_id'))
    return rows


def comment_counts(org_id: str, recognition_ids: List[str]) -> Dict[str, int]:
    """{recognition_id: how many replies} for a page of the board. One query —
    never one per card."""
    if not recognition_ids:
        return {}
    try:
        rows = (_admin().table('sis_recognition_comments').select('recognition_id')
                .eq('organization_id', org_id)
                .in_('recognition_id', recognition_ids).execute()).data or []
    except Exception as e:  # noqa: BLE001 — a count is decoration; the board is not
        logger.warning(f'Recognition comment counts unavailable: {e}')
        return {}
    out: Dict[str, int] = {}
    for r in rows:
        rid = r.get('recognition_id')
        if rid:
            out[rid] = out.get(rid, 0) + 1
    return out


def add_recognition_comment(org_id: str, user_id: str, recognition_id: str,
                            body: Any) -> Dict[str, Any]:
    text = _text(body)
    if not text:
        return {'error': 'Write something first'}
    if not _owned_recognition(org_id, recognition_id):
        return {'error': 'Shout-out not found'}
    row = (_admin().table('sis_recognition_comments').insert({
        'recognition_id': recognition_id,
        'organization_id': org_id,
        'author_id': user_id,
        'body': text,
    }).execute()).data
    comment = row[0] if row else None
    if comment:
        comment['author_name'] = _names_for([user_id]).get(user_id)
    return {'comment': comment}


def delete_recognition_comment(org_id: str, user_id: str, comment_id: str,
                               is_admin: bool) -> Dict[str, Any]:
    """Take back a comment. Its author always may; an admin may remove anyone's,
    because the board is the school's noticeboard and somebody has to be able to
    take a remark down."""
    rows = (_admin().table('sis_recognition_comments').select('id, author_id')
            .eq('id', comment_id).eq('organization_id', org_id)
            .limit(1).execute()).data
    row = rows[0] if rows else None
    if not row:
        return {'error': 'Comment not found'}
    if not is_admin and row.get('author_id') != user_id:
        return {'error': 'That is not your comment'}
    _admin().table('sis_recognition_comments').delete() \
        .eq('id', comment_id).eq('organization_id', org_id).execute()
    return {'deleted': True}


# ── Shared helpers ────────────────────────────────────────────────────────────

def _owned(org_id: str, table: str, row_id: str) -> bool:
    rows = (
        _admin().table(table).select('id, organization_id')
        .eq('id', row_id).limit(1).execute()
    ).data or []
    return bool(rows) and rows[0].get('organization_id') == org_id


def delete_row(org_id: str, table: str, row_id: str) -> bool:
    if not _owned(org_id, table, row_id):
        return False
    _admin().table(table).delete().eq('id', row_id).execute()
    return True


# ── Birthdays ─────────────────────────────────────────────────────────────────

def upcoming_birthdays(org_id: str, days: int = 7) -> List[Dict[str, Any]]:
    """Org members (students + staff + guardians) whose birthday falls within the
    next `days` days, using users.date_of_birth (a DATE — year is ignored). Sorted
    by how soon the birthday is."""
    rows = (
        _admin().table('users')
        .select('id, first_name, last_name, display_name, role, org_role, date_of_birth, preferred_name')
        .eq('organization_id', org_id)
        .not_.is_('date_of_birth', 'null')
        .execute()
    ).data or []
    today = date.today()
    out = []
    for u in rows:
        dob = u.get('date_of_birth')
        if not dob:
            continue
        try:
            born = date.fromisoformat(str(dob)[:10])
        except (ValueError, TypeError):
            # unparseable date of birth: skip it
            continue
        # Next occurrence of month/day, this year or next.
        try:
            this_year = born.replace(year=today.year)
        except ValueError:  # Feb 29 in a non-leap year → treat as Mar 1
            this_year = date(today.year, 3, 1)
        next_bday = this_year if this_year >= today else _add_year(this_year)
        delta = (next_bday - today).days
        if 0 <= delta <= days:
            name = (u.get('display_name')
                    or ' '.join(filter(None, [u.get('first_name'), u.get('last_name')])).strip()
                    or 'Someone')
            out.append({
                'user_id': u['id'],
                'name': name,
                'role': u.get('org_role') or u.get('role'),
                'date': next_bday.isoformat(),
                'month_day': next_bday.strftime('%b %-d') if hasattr(next_bday, 'strftime') else next_bday.isoformat()[5:],
                'days_away': delta,
            })
    out.sort(key=lambda r: r['days_away'])
    return out


def _add_year(d: date) -> date:
    try:
        return d.replace(year=d.year + 1)
    except ValueError:
        return date(d.year + 1, 3, 1)


# ── Carpool board (family-authored — iCreate, 2026-08-06) ─────────────────────
# The first module families WRITE to, not just read. Guardrails: org members
# only, no students (drivers and ride-seekers are adults), a hard length cap,
# and delete by the author or an org admin — moderation is deletion.

CARPOOL_TYPES = ('offer', 'need')
_CARPOOL_MAX_LEN = 500


def list_carpool(org_id: str) -> List[Dict[str, Any]]:
    """Active carpool posts, newest first."""
    return (
        _admin().table('sis_carpool_posts').select('*')
        .eq('organization_id', org_id).eq('status', 'active')
        .order('created_at', desc=True).limit(50).execute()
    ).data or []


def create_carpool_post(org_id: str, user_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    message = _text(data.get('message'))
    if not message:
        return {'error': 'Say what you are offering or looking for'}
    if len(message) > _CARPOOL_MAX_LEN:
        return {'error': f'Keep it under {_CARPOOL_MAX_LEN} characters'}
    post_type = data.get('type') if data.get('type') in CARPOOL_TYPES else 'offer'
    author = (
        _admin().table('users').select('display_name, first_name, last_name, preferred_name')
        .eq('id', user_id).limit(1).execute()
    ).data
    a = (author or [{}])[0]
    author_name = a.get('display_name') \
        or ' '.join(filter(None, [a.get('first_name'), a.get('last_name')])) or 'A family'
    row = (_admin().table('sis_carpool_posts').insert({
        'organization_id': org_id,
        'created_by': user_id,
        'author_name': author_name,
        'type': post_type,
        'message': message,
        'area': _text(data.get('area')),
        'days': _text(data.get('days')),
        # No contact column on purpose: arranging happens over in-app messaging
        # ("Message this person"), never phone numbers on a board.
    }).execute()).data
    return {'post': row[0] if row else None}


def delete_carpool_post(org_id: str, user_id: str, post_id: str,
                        is_moderator: bool) -> bool:
    """Remove a post — its author taking it down, or an admin moderating."""
    row = (_admin().table('sis_carpool_posts').select('id, created_by')
           .eq('id', post_id).eq('organization_id', org_id).limit(1).execute()).data
    if not row:
        return False
    if not is_moderator and row[0].get('created_by') != user_id:
        return False
    _admin().table('sis_carpool_posts').delete().eq('id', post_id).execute()
    return True


# ── Events (read-only surface of the existing sis_events) ─────────────────────

def upcoming_events(org_id: str, limit: int = 10) -> List[Dict[str, Any]]:
    """Upcoming org events from the existing sis_events table (school + teacher
    audience only — never admin-only), soonest first. Read-only for Highlights."""
    now_iso = datetime.utcnow().isoformat()
    rows = (
        _admin().table('sis_events').select('*')
        .eq('organization_id', org_id)
        .neq('audience', 'admins')
        .gte('start_at', now_iso)
        .order('start_at')
        .limit(limit)
        .execute()
    ).data or []
    return rows


# ── Highlights (read-only aggregation) ────────────────────────────────────────

def highlights(org_id: str) -> Dict[str, Any]:
    """The Community landing feed: published announcements (pinned first), upcoming
    events, newest unclaimed lost&found, latest recognition, upcoming birthdays.
    Pure read-only aggregation of the hub's own modules — nothing private here."""
    announcements = list_announcements(org_id, include_hidden=False)[:5]
    lost_found = [i for i in list_lost_found(org_id, status='unclaimed')][:5]
    recognition = list_recognition(org_id)[:5]
    return {
        'announcements': announcements,
        'events': upcoming_events(org_id, limit=6),
        'lost_found': lost_found,
        'recognition': recognition,
        'birthdays': upcoming_birthdays(org_id, days=7),
    }


# ── The family-facing view of the same hub ────────────────────────────────────
#
# iCreate, 2026-08-01: "I can't see the shoutouts or lost and found or other
# things from the non-admin side of things." Answered by Molly the same day —
# the Community Hub is meant for families too, and lost & found carries the item
# rather than the child ("just the item that was lost so parents can see it and
# know to come pick it up").
#
# The board is family-readable; the office's working notes on it are not. Each
# module is therefore projected onto an explicit field list rather than passed
# through, so a column added to a table later cannot quietly become public.

# claimed_by names the family who collected an item, and created_by is the staff
# member who logged it. Neither is a parent's business.
_FAMILY_LOST_FOUND = ('id', 'description', 'image_url', 'category', 'date_found',
                      'location_found', 'created_at', 'donation_deadline',
                      'days_until_donation')
# The name written on a shout-out is the point of it; the account ids are not.
_FAMILY_RECOGNITION = ('id', 'type', 'recipient_name', 'message', 'created_at')
_FAMILY_ANNOUNCEMENT = ('id', 'title', 'body', 'pinned', 'priority', 'created_at')
_FAMILY_EVENT = ('id', 'title', 'description', 'location', 'start_at', 'end_at',
                 'all_day', 'category', 'categories')
# author_name is the snapshot column, never a users join. created_by is served
# as `author_id` alongside a computed `mine`: the author gets their own delete
# button, and "Message this person" is a link into Messages addressed to that
# account. Withholding the id bought nothing once every adult in the school is
# a contact of every other (2026-08-27) — it only meant the board had to carry
# its own one-shot composer, which the mobile app never managed to send from.
_FAMILY_CARPOOL = ('id', 'type', 'message', 'area', 'days',
                   'author_name', 'created_at')


def _project(rows: List[Dict[str, Any]], fields) -> List[Dict[str, Any]]:
    return [{k: r.get(k) for k in fields} for r in rows]


def family_feed(org_id: str, viewer_id: Optional[str] = None) -> Dict[str, Any]:
    """The Community Hub as a family sees it.

    Same posts, fewer columns, and three things left out entirely: scheduled or
    expired announcements (not published yet, or over), claimed lost & found (not
    yours to collect, and the claim names a family), and admin/teacher-only
    events. Birthdays stay in the office — a staff convenience, not a broadcast.

    `viewer_id` marks the viewer's own carpool posts (`mine`) so the frontend
    can offer "remove" on exactly those.
    """
    carpool_rows = list_carpool(org_id)
    carpool = _project(carpool_rows, _FAMILY_CARPOOL)
    for projected, raw in zip(carpool, carpool_rows, strict=False):
        projected['author_id'] = raw.get('created_by')
        projected['mine'] = bool(viewer_id) and raw.get('created_by') == viewer_id
    return {
        'announcements': _project(
            [a for a in list_announcements(org_id, include_hidden=False)
             if (a.get('audience') or 'school') == 'school'][:20],
            _FAMILY_ANNOUNCEMENT),
        'lost_found': _project(
            list_lost_found(org_id, status='unclaimed')[:50], _FAMILY_LOST_FOUND),
        'recognition': _project(list_recognition(org_id)[:20], _FAMILY_RECOGNITION),
        'events': _project(
            [e for e in upcoming_events(org_id, limit=20) if e.get('audience') == 'school'],
            _FAMILY_EVENT),
        'carpool': carpool,
    }
