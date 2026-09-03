"""
SIS Waitlist service — ordered queue with auto-offer.

When a full Class frees a seat, the lowest-position 'waiting' entry is offered the
seat (with an expiry). Accepting creates the real class_enrollments row. The
ordering/selection rules are pure (next_position, pick_next_to_offer) so they're
unit-testable without a DB; the rest composes admin-client reads/writes.
"""

from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional

from database import get_supabase_admin_client
from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger
from services.class_quest_enrollment import enroll_in_class_quests as _enroll_in_class_quests

logger = get_logger(__name__)

# How long a family has to claim an offered seat. Was 48h, which iCreate kept
# losing to a weekend: the offer lapsed before the office could follow up, and
# an expired entry then sat there un-offerable. Seven days by default, and an
# org can set its own via feature_flags.sis_settings.waitlist_offer_ttl_hours.
DEFAULT_OFFER_TTL_HOURS = 168
OFFER_TTL_HOURS = DEFAULT_OFFER_TTL_HOURS  # back-compat for existing callers/tests
WAITLIST_STATUSES = ('waiting', 'offered', 'accepted', 'expired', 'declined', 'promoted')
# Statuses staff can re-offer or admit from: someone who is waiting, whose offer
# lapsed, or who declined and changed their mind. 'promoted' is already enrolled.
OFFERABLE_STATUSES = ('waiting', 'offered', 'expired', 'declined')


def _admin():
    # admin client justified: the SIS console acts for the whole school — this
    #   reads/writes rows belonging to every family in the org, which no single
    #   caller can see under RLS; the route's role+org gate is the authorization
    return get_supabase_admin_client()


def live_offer_count(class_id: str, exclude_student_id: Optional[str] = None) -> int:
    """Seats currently promised to families: 'offered' entries whose window has
    not lapsed. An offered seat is HELD — no other enrollment path may hand it
    out (iCreate, 2026-08-22: three families could not claim offered seats
    because other enrollments filled the class under the offer). Pass
    exclude_student_id to leave out the claimant's own hold. Best-effort: a
    lookup failure returns 0 so enrollment never breaks over the count."""
    try:
        rows = (
            _admin().table('sis_waitlist_entries')
            .select('id, student_user_id, offer_expires_at')
            .eq('class_id', class_id).eq('status', 'offered').execute()
        ).data or []
    except Exception as e:  # noqa: BLE001
        logger.warning(f'[Waitlist] live_offer_count failed for {class_id}: {e}')
        return 0
    now = _now()
    n = 0
    for r in rows:
        if exclude_student_id and r.get('student_user_id') == exclude_student_id:
            continue
        exp = r.get('offer_expires_at')
        if exp:
            try:
                exp_dt = datetime.fromisoformat(str(exp).replace('Z', '+00:00'))
                if now > exp_dt:
                    continue  # stale — the sweep cron will mark it expired
            except ValueError:
                # unparseable expiry: treat as expired
                ...
        n += 1
    return n


def offer_ttl_hours(org_id: str) -> int:
    """The org's offer window in hours (default 7 days). Best-effort: any lookup
    problem falls back to the default rather than failing the offer."""
    try:
        row = (
            _admin().table('organizations').select('feature_flags')
            .eq('id', org_id).limit(1).execute()
        ).data or []
        flags = (row[0].get('feature_flags') or {}) if row else {}
        raw = (flags.get('sis_settings') or {}).get('waitlist_offer_ttl_hours')
        hours = int(raw)
        return hours if 1 <= hours <= 24 * 90 else DEFAULT_OFFER_TTL_HOURS
    except (TypeError, ValueError, KeyError, AttributeError):
        return DEFAULT_OFFER_TTL_HOURS
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[Waitlist] TTL lookup failed for org {org_id[:8]}: {e}")
        return DEFAULT_OFFER_TTL_HOURS


from utils.timestamps import utcnow as _now  # noqa: E402


# ── Pure ordering logic (unit-tested) ────────────────────────────────────────
def next_position(entries: List[Dict[str, Any]]) -> int:
    """Next queue position = 1 + the current max position (1-based)."""
    positions = [e.get('position', 0) for e in (entries or [])]
    return (max(positions) + 1) if positions else 1


def pick_next_to_offer(entries: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """The lowest-position entry still 'waiting' (or None)."""
    waiting = [e for e in (entries or []) if e.get('status') == 'waiting']
    if not waiting:
        return None
    return min(waiting, key=lambda e: e.get('position', 0))


# ── DB-backed operations ─────────────────────────────────────────────────────
def list_for_class(org_id: str, class_id: str) -> List[Dict[str, Any]]:
    rows = (
        _admin().table('sis_waitlist_entries')
        .select('*').eq('organization_id', org_id).eq('class_id', class_id)
        .order('position').execute()
    ).data or []
    if not rows:
        return []
    student_ids = list({r['student_user_id'] for r in rows})
    users = {
        u['id']: u for u in (
            _admin().table('users')
            .select('id, display_name, first_name, last_name, preferred_name, username, email, date_of_birth')
            .in_('id', student_ids).execute()
        ).data or []
    }
    for r in rows:
        u = users.get(r['student_user_id'], {})
        # Jenner Roberts goes by Jay, and the office reads this list out loud
        # (ticket e97a43d1 did the same for rosters and CLPs). The surname is
        # kept unless the preferred name already carries it.
        pref = (u.get('preferred_name') or '').strip()
        last = (u.get('last_name') or '').strip()
        if pref:
            r['student_name'] = (f'{pref} {last}'
                                 if last and not pref.lower().endswith(last.lower())
                                 else pref)
        else:
            r['student_name'] = (u.get('display_name')
                                 or f"{u.get('first_name') or ''} {last}".strip()
                                 or u.get('username') or u.get('email') or 'Unnamed')
        r['student_age'] = _age_from_dob(u.get('date_of_birth'))
    return rows


def _age_from_dob(dob):
    """Whole years from an ISO date string, or None when unknown/unparseable."""
    from datetime import date
    if not dob:
        return None
    try:
        d = date.fromisoformat(str(dob)[:10])
    except (ValueError, TypeError):
        return None
    today = date.today()
    return today.year - d.year - ((today.month, today.day) < (d.month, d.day))


def _sibling_class_ids(org_id: str, class_id: str) -> List[str]:
    """Every section of the same course as `class_id`, including itself.

    Unlike `sibling_sections`, this keeps archived and full sections: a waitlist
    entry on a full sibling is exactly the row that needs clearing. Matching is
    `section_base_name`, the school's own `Base (Day Block)` convention.
    """
    try:
        cls_row = (
            _admin().table('org_classes').select('name')
            .eq('organization_id', org_id).eq('id', class_id).limit(1).execute()
        ).data or []
        if cls_row and cls_row[0].get('name'):
            base = section_base_name(cls_row[0]['name'])
            if base:
                all_classes = fetch_all_rows(lambda: (
                    _admin().table('org_classes').select('id, name')
                    .eq('organization_id', org_id)
                ))
                siblings = [
                    c['id'] for c in all_classes
                    if c.get('name') and section_base_name(c['name']) == base
                ]
                if siblings:
                    return siblings
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[Waitlist] error looking up sibling class IDs for {class_id}: {e}")
    return [class_id]


def add_to_waitlist(org_id: str, class_id: str, student_user_id: str) -> Dict[str, Any]:
    """Append a student to a class waitlist (idempotent on class+student).

    A student already actively enrolled in *this* class is never queued — a child
    on the roster *and* on the waitlist is the state that made iCreate's counts
    look haunted. Enrollment in a *sibling* section is deliberately not a bar:
    iCreate splits two-day classes into per-day sections ("Choir (Tuesday)" /
    "Choir (Thursday)") and a family taking one day may legitimately queue for
    the other."""
    active = (
        _admin().table('class_enrollments').select('id')
        .eq('class_id', class_id).eq('student_id', student_user_id)
        .eq('status', 'active').limit(1).execute()
    ).data or []
    if active:
        clear_entry_for_enrollment(org_id, class_id, student_user_id)
        return {'already_enrolled': True}
    existing = (
        _admin().table('sis_waitlist_entries')
        .select('*').eq('class_id', class_id).execute()
    ).data or []
    for e in existing:
        if e['student_user_id'] == student_user_id and e['status'] in ('waiting', 'offered'):
            return e  # already queued
    pos = next_position(existing)
    payload = {
        'organization_id': org_id,
        'class_id': class_id,
        'student_user_id': student_user_id,
        'position': pos,
        'status': 'waiting',
    }
    resp = (
        _admin().table('sis_waitlist_entries')
        .upsert(payload, on_conflict='class_id,student_user_id').execute()
    )
    return resp.data[0] if resp.data else None


def offer_next(org_id: str, class_id: str) -> Optional[Dict[str, Any]]:
    """Offer the open seat to the next waiting student (sets offered + expiry)."""
    entries = list_for_class(org_id, class_id)
    nxt = pick_next_to_offer(entries)
    if not nxt:
        return None
    return _mark_offered(org_id, class_id, nxt['id'])


def nobody_waiting_reason(org_id: str, class_id: str) -> str:
    """Why there was no one to offer the seat to.

    "No one waiting" on a class whose row reads *Waitlist 1* is just confusing —
    the count includes people who already have an offer out, and only a `waiting`
    entry can be offered (iCreate, 2026-07-31: "it says offer next seat ... but
    when I click on it it says no one is waiting"). Name the actual state.
    """
    try:
        entries = list_for_class(org_id, class_id)
    except Exception as e:  # noqa: BLE001 — this is only an explanation
        logger.warning(f'[Waitlist] could not explain empty offer for {class_id}: {e}')
        return 'No one is waiting for this class.'
    offered = sum(1 for e in entries if e.get('status') == 'offered')
    lapsed = sum(1 for e in entries if e.get('status') in ('expired', 'declined'))
    if offered:
        return (f'{offered} student{"" if offered == 1 else "s"} on this waitlist already '
                f'{"has" if offered == 1 else "have"} an offer out. Open the Waitlist tab to '
                'enroll them now or offer again.')
    if lapsed:
        return ('No one is waiting — every offer for this class has lapsed or been declined. '
                'Open the Waitlist tab to offer again or enroll someone.')
    return 'No one is on this waitlist.'


def offer_entry(org_id: str, entry_id: str) -> Dict[str, Any]:
    """Offer (or re-offer) the seat to ONE named entry.

    'Offer next seat' only ever reaches the front of the queue, so an entry
    whose offer lapsed was stranded: not waiting, so never picked again, and
    with no way to hand it back. Staff pick the person here — including someone
    who expired or declined."""
    entry = _entry(org_id, entry_id)
    if not entry:
        return {'error': 'Waitlist entry not found'}
    if entry['status'] not in OFFERABLE_STATUSES:
        return {'error': f"That student is already {entry['status']}"}
    offered = _mark_offered(org_id, entry['class_id'], entry_id)
    return {'entry': offered}


def enroll_entry(org_id: str, entry_id: str, enrolled_by: str,
                 class_id: Optional[str] = None, force: bool = False) -> Dict[str, Any]:
    """Staff admit a waitlisted student straight into the class.

    The school decides who gets the seat; requiring the family to click Claim
    (and only inside the offer window) meant an office that had already agreed
    to admit a child had no way to finish the job. Deliberately not blocked by
    capacity — an admin doing this by hand is the override, the same rule
    approving an age exception already follows."""
    entry = _entry(org_id, entry_id)
    if not entry:
        return {'error': 'Waitlist entry not found'}
    if entry['status'] == 'promoted':
        return {'entry': entry, 'already_enrolled': True}
    if class_id and class_id != entry['class_id']:
        return _enroll_in_other_section(org_id, entry, class_id, enrolled_by, force=force)
    return respond_to_offer(org_id, entry_id, True, enrolled_by, force=force)


def _enroll_in_other_section(org_id: str, entry: Dict[str, Any], class_id: str,
                             enrolled_by: str, force: bool = False) -> Dict[str, Any]:
    """Place a waitlisted student in a DIFFERENT section of the same class.

    The waitlist entry is closed as promoted — they got what they were queued
    for, just at another time — and any entry they hold on the target section
    is cleared too, so they never come out of this both enrolled and queued.
    """
    target = next((c for c in sibling_sections(org_id, entry['class_id'])
                   if c['class_id'] == class_id), None)
    if not target:
        return {'error': 'That class is not another section of this one, or it has no room.'}

    # Another section means another time, and the family's week isn't visible
    # from here. Refuse the first attempt when it collides with something they
    # already attend; the caller re-sends with force once a human has looked.
    conflicts = schedule_conflicts(entry['student_user_id'], class_id)
    if conflicts and not force:
        return {'conflicts': conflicts, 'section': target['name']}

    _admin().table('class_enrollments').upsert({
        'class_id': class_id,
        'student_id': entry['student_user_id'],
        'status': 'active',
        'enrolled_by': enrolled_by,
    }, on_conflict='class_id,student_id').execute()
    from services.class_group_sync_service import sync_class_group
    sync_class_group(class_id, actor_id=enrolled_by)
    _enroll_in_class_quests(_admin(), class_id, entry['student_user_id'])
    clear_entry_for_enrollment(org_id, class_id, entry['student_user_id'])

    resp = (
        _admin().table('sis_waitlist_entries')
        .update({'status': 'promoted', 'updated_at': _now().isoformat()})
        .eq('id', entry['id']).execute()
    )
    logger.info(f"[Waitlist] moved waitlisted student into sibling section {class_id}")
    return {'entry': resp.data[0] if resp.data else None, 'enrolled': True,
            'moved_to': {'class_id': class_id, 'name': target['name']}}


def _entry(org_id: str, entry_id: str) -> Optional[Dict[str, Any]]:
    rows = (
        _admin().table('sis_waitlist_entries').select('*')
        .eq('id', entry_id).eq('organization_id', org_id).limit(1).execute()
    ).data or []
    return rows[0] if rows else None


def _mark_offered(org_id: str, class_id: str, entry_id: str) -> Optional[Dict[str, Any]]:
    """Flip one entry to 'offered' with a fresh expiry and notify the family.

    The returned row carries `student_name`. It is an UPDATE, so what comes
    back is the bare table row — and every caller hands it to the office as
    "who did we just offer this to". iCreate, 2026-08-17: "Two kids were
    offered a spot in reading workshop block 2 tuesday, but I have no idea who
    it was because I can't see their names." The names were never missing from
    the queue; they were missing from the answer to the action.
    """
    now_iso = _now().isoformat()
    expires = (_now() + timedelta(hours=offer_ttl_hours(org_id))).isoformat()
    resp = (
        _admin().table('sis_waitlist_entries')
        .update({'status': 'offered', 'offered_at': now_iso,
                 'offer_expires_at': expires, 'updated_at': now_iso})
        .eq('id', entry_id).execute()
    )
    offered = resp.data[0] if resp.data else None
    if offered:
        offered['student_name'] = _student_name(offered.get('student_user_id'))
        _notify_offer(org_id, class_id, offered)
    return offered


def _student_name(student_user_id: Optional[str]) -> str:
    """One student's display name, by the same rule the queue uses (preferred
    name wins, because the office reads these out loud)."""
    if not student_user_id:
        return 'a student'
    u = (
        _admin().table('users')
        .select('display_name, first_name, last_name, preferred_name, username, email')
        .eq('id', student_user_id).limit(1).execute()
    ).data
    if not u:
        return 'a student'
    u = u[0]
    pref = (u.get('preferred_name') or '').strip()
    last = (u.get('last_name') or '').strip()
    if pref:
        return f'{pref} {last}' if last and not pref.lower().endswith(last.lower()) else pref
    return (u.get('display_name')
            or f"{u.get('first_name') or ''} {last}".strip()
            or u.get('username') or u.get('email') or 'a student')


def section_base_name(name: str) -> str:
    """The class name with its section suffix stripped: "Ukelele Jam (Tue 10:30)"
    -> "ukelele jam". iCreate names every section `Base (Day Block)`, so the
    prefix is the course and the parenthetical is the section."""
    return (str(name or '').split('(')[0]).strip().lower()


def sibling_sections(org_id: str, class_id: str) -> List[Dict[str, Any]]:
    """Other sections of the same class that still have room.

    iCreate, 2026-07-31: "Could we offer other sections of classes to people on
    a waitlist? For example, there are 8 on the waitlist on tuesday at 10:30am,
    but we have spots in the other ukelele classes." Nine students were waiting
    on one Ukelele Jam section while two others had seats; Reading Workshop had
    twenty-three waiting across five sections with room.

    Matching is on the name before the "(" — the school's own naming convention,
    so nothing new has to be maintained. Archived classes and full sections are
    left out; a section with no capacity set counts as having room.
    """
    from services import sis_catalog_service as catalog
    classes = catalog.list_classes(org_id)
    this = next((c for c in classes if c['id'] == class_id), None)
    if not this:
        return []
    base = section_base_name(this.get('name'))
    if not base:
        return []
    out = []
    for c in classes:
        if c['id'] == class_id or c.get('status') == 'archived':
            continue
        if section_base_name(c.get('name')) != base:
            continue
        # Hold-aware: a section whose last seat is promised to another family
        # (a live offer) has no room to offer here either.
        if c.get('is_full'):
            continue
        capacity = c.get('capacity')
        enrolled = c.get('enrolled_count') or 0
        held = c.get('seats_held') or 0
        if capacity is not None and (enrolled + held) >= capacity:
            continue
        out.append({
            'class_id': c['id'],
            'name': c.get('name'),
            'capacity': capacity,
            'enrolled_count': enrolled,
            'spots_left': c.get('spots_left'),
            'meetings': c.get('meetings') or [],
        })
    out.sort(key=lambda c: (c['name'] or '').lower())
    return out


def schedule_conflicts(student_user_id: str, class_id: str) -> List[Dict[str, Any]]:
    """The student's active classes that meet at the same time as `class_id`.

    Placing a waitlisted student in a different section moves them to a
    different TIME, and the office can't see the family's week (iCreate,
    2026-08-01: "If we enroll them, then they'll be enrolled in two sections at
    the same time"). Same rule the age-exception approval already uses.
    """
    from services.sis_exception_service import _same_time_conflicts
    try:
        return _same_time_conflicts(student_user_id, class_id)
    except Exception as e:  # noqa: BLE001 — a failed check must not block staff
        logger.warning(f'[Waitlist] conflict check failed for {class_id}: {e}')
        return []


def offer_other_section(org_id: str, entry_id: str, class_id: str) -> Dict[str, Any]:
    """Offer a waitlisted student a seat in a DIFFERENT section of the same class.

    The school can see the open seat; only the family can see whether that time
    works ("can we OFFER them the seat since we don't know what their
    schedule is?"). So this hands them the same claimable offer the normal
    waitlist flow produces — in-app notification, email, Claim spot in the
    Schedule Builder — for the section that has room.

    Their place on the original section's list is left alone: being offered a
    Thursday seat is not a decision to give up on Tuesday. Claiming closes the
    target entry; staff can remove the original if the family is settled.
    """
    entry = _entry(org_id, entry_id)
    if not entry:
        return {'error': 'Waitlist entry not found'}
    target = next((c for c in sibling_sections(org_id, entry['class_id'])
                   if c['class_id'] == class_id), None)
    if not target:
        return {'error': 'That class is not another section of this one, or it has no room.'}

    student_id = entry['student_user_id']
    active = (
        _admin().table('class_enrollments').select('id')
        .eq('class_id', class_id).eq('student_id', student_id)
        .eq('status', 'active').limit(1).execute()
    ).data or []
    if active:
        return {'error': f"They are already enrolled in {target['name']}."}

    existing = (
        _admin().table('sis_waitlist_entries').select('id, status')
        .eq('organization_id', org_id).eq('class_id', class_id)
        .eq('student_user_id', student_id).limit(1).execute()
    ).data or []
    if existing:
        target_entry_id = existing[0]['id']
    else:
        created = add_to_waitlist(org_id, class_id, student_id)
        target_entry_id = (created or {}).get('id')
    if not target_entry_id:
        return {'error': 'Could not create the offer'}

    offered = _mark_offered(org_id, class_id, target_entry_id)
    logger.info(f'[Waitlist] offered sibling section {class_id} to a student waiting on {entry["class_id"]}')
    return {'entry': offered, 'offered_section': {'class_id': class_id, 'name': target['name']}}


def clear_entry_for_enrollment(org_id: str, class_id: str, student_user_id: str) -> None:
    """Mark a student's live waitlist entry for this class (and all sibling sections
    of the same class) as promoted, because they were enrolled in one section of
    the class. Without this the family keeps seeing 'Waitlist #2' in the Schedule
    Builder or remaining queued on other sections of a class their child is
    already taking."""
    try:
        matching_class_ids = _sibling_class_ids(org_id, class_id)
        rows = (
            _admin().table('sis_waitlist_entries').select('id, status, class_id')
            .eq('organization_id', org_id).in_('class_id', matching_class_ids)
            .eq('student_user_id', student_user_id).execute()
        ).data or []
        live = [r for r in rows if r.get('status') in ('waiting', 'offered')]
        if not live:
            return
        live_ids = [r['id'] for r in live]
        (
            _admin().table('sis_waitlist_entries')
            .update({'status': 'promoted', 'updated_at': _now().isoformat()})
            .in_('id', live_ids).execute()
        )
        logger.info(f"[Waitlist] cleared {len(live_ids)} entry(ies) for enrolled student across sections {matching_class_ids}")

        offered_class_ids = {r['class_id'] for r in live if r.get('status') == 'offered' and r.get('class_id') != class_id}
        for cid in offered_class_ids:
            alert_admins_seat_opened(org_id, cid)
    except Exception as e:  # noqa: BLE001 — never break an enrollment over this
        logger.warning(f"[Waitlist] could not clear entries for class {class_id}: {e}")


def expire_stale_offers() -> Dict[str, Any]:
    """Cron sweep: expire per-class waitlist offers past their TTL so the held
    seat frees up for the next student, then re-alert admins that the seat is
    open again (we don't auto-offer — staff choose who gets it). Best-effort per
    entry; returns a summary."""
    admin = _admin()
    now_iso = _now().isoformat()
    stale = (
        admin.table('sis_waitlist_entries')
        .select('id, organization_id, class_id')
        .eq('status', 'offered').lt('offer_expires_at', now_iso).execute()
    ).data or []
    expired = 0
    affected = set()
    for e in stale:
        try:
            admin.table('sis_waitlist_entries').update(
                {'status': 'expired', 'updated_at': now_iso}).eq('id', e['id']).execute()
            expired += 1
            affected.add((e['organization_id'], e['class_id']))
        except Exception as ex:  # noqa: BLE001
            logger.warning(f"[Waitlist] could not expire offer {e['id']}: {ex}")
    # A freshly-expired offer means the seat is open again — nudge admins to
    # offer it to the next waiting student (self-gates on waiters + an open seat).
    for org_id, class_id in affected:
        alert_admins_seat_opened(org_id, class_id)
    logger.info(f"[Waitlist] offer sweep: expired {expired}, re-alerted {len(affected)} class(es)")
    return {'expired': expired, 'reAlerted': len(affected)}


def respond_to_offer(org_id: str, entry_id: str, accept: bool,
                     enrolled_by: str, force: bool = False) -> Dict[str, Any]:
    """Accept (→ enroll + promoted) or decline an offer.

    Admitting someone off the waitlist is an enrollment like any other, so it
    gets the same clash check the sibling-section move and the age exception
    already run (iCreate, 2026-08-14: a student was admitted from the waitlist
    into a second Elementary Microschool section meeting the very same Wednesday
    09:30-15:00 block). Parents were already blocked from doing this to
    themselves; only the staff path could still do it silently. Refuse the first
    attempt and hand back the clashing classes; the caller re-sends with force
    once a human has looked.
    """
    entry = (
        _admin().table('sis_waitlist_entries')
        .select('*').eq('id', entry_id).eq('organization_id', org_id).limit(1).execute()
    ).data
    if not entry:
        return {'error': 'Waitlist entry not found'}
    entry = entry[0]
    if not accept:
        resp = (
            _admin().table('sis_waitlist_entries')
            .update({'status': 'declined', 'updated_at': _now().isoformat()})
            .eq('id', entry_id).execute()
        )
        return {'entry': resp.data[0] if resp.data else None}
    conflicts = schedule_conflicts(entry['student_user_id'], entry['class_id'])
    if conflicts and not force:
        return {'conflicts': conflicts}
    # accept → create the LMS enrollment, mark promoted
    _admin().table('class_enrollments').upsert({
        'class_id': entry['class_id'],
        'student_id': entry['student_user_id'],
        'status': 'active',
        'enrolled_by': enrolled_by,
    }, on_conflict='class_id,student_id').execute()
    from services.class_group_sync_service import sync_class_group
    sync_class_group(entry['class_id'], actor_id=enrolled_by)
    _enroll_in_class_quests(_admin(), entry['class_id'], entry['student_user_id'])
    # Siblings first, then this entry explicitly: clear_entry_for_enrollment
    # swallows its own errors by design, so the accepted entry's own status is
    # never left to it.
    clear_entry_for_enrollment(org_id, entry['class_id'], entry['student_user_id'])
    resp = (
        _admin().table('sis_waitlist_entries')
        .update({'status': 'promoted', 'updated_at': _now().isoformat()})
        .eq('id', entry_id).execute()
    )
    return {'entry': resp.data[0] if resp.data else None, 'enrolled': True}


def alert_admins_seat_opened(org_id: str, class_id: str) -> bool:
    """Email the org admins when a waitlisted class has an open seat, so they can
    manually offer it to the next student (iCreate wants to approve each admit,
    not auto-enroll). Best-effort; safe to call whenever a seat MIGHT have freed
    (a withdrawal, a capacity increase) — it self-gates on there actually being
    both waiting students and an available seat, so it never emails needlessly.
    """
    try:
        cls = (
            _admin().table('org_classes')
            .select('id, name, capacity, organization_id')
            .eq('id', class_id).limit(1).execute()
        ).data
        if not cls or cls[0].get('organization_id') != org_id:
            return False
        cls = cls[0]

        waiting = [e for e in list_for_class(org_id, class_id) if e.get('status') == 'waiting']
        if not waiting:
            return False

        capacity = cls.get('capacity')
        active = (
            _admin().table('class_enrollments')
            .select('id', count='exact')
            .eq('class_id', class_id).eq('status', 'active').execute()
        ).count or 0
        # Seats already promised to families with a live offer are not open —
        # alerting staff to hand them out again is how a claim gets snagged.
        held = live_offer_count(class_id)
        seats_open = None if capacity is None else max(0, capacity - active - held)
        # A None capacity means unlimited — a "seat" is always available, so any
        # waiting student can be admitted.
        if seats_open == 0:
            return False

        admin_emails = _org_admin_emails(org_id)
        if not admin_emails:
            return False

        from services.email_service import email_service
        seats_txt = 'A seat' if (seats_open in (None, 1)) else f'{seats_open} seats'
        n = len(waiting)
        who = f'{n} student{"" if n == 1 else "s"}'
        subject = f'Seat open in {cls["name"]} — {n} waiting'
        html = f"""
        <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px;">Waitlist alert</p>
          <h2 style="margin:0 0 12px;font-size:18px;">{seats_txt} opened in {cls["name"]}</h2>
          <p style="font-size:15px;line-height:1.5;">{who} {"is" if n == 1 else "are"} waiting for this class.
          Open the class in your SIS and use <strong>Offer next seat</strong> on the Waitlist tab to admit the next student.</p>
          <p style="margin-top:16px;"><a href="https://sis.optioeducation.com/classes"
             style="display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;">Manage the waitlist</a></p>
        </div>
        """.strip()
        text = (f'{seats_txt} opened in {cls["name"]}. {who} waiting. '
                f'Open the class Waitlist tab in your SIS and use "Offer next seat" to admit the next student. '
                f'https://sis.optioeducation.com/classes')
        # One message to all admins (first To, rest CC), not one send per admin —
        # a per-admin loop delivered N copies (each also copying SUPPORT_COPY_EMAIL).
        ok = email_service.send_email(
            to_email=admin_emails[0], cc=admin_emails[1:],
            subject=subject, html_body=html, text_body=text,
        )
        logger.info(f"[Waitlist] seat-opened alert for class {class_id}: emailed {len(admin_emails)} admin(s) (1 message)")
        return ok
    except Exception as e:
        logger.warning(f"[Waitlist] seat-opened alert skipped for {class_id}: {e}")
        return False


# ── Family-facing offer notification (guardian, not the dependent student) ────
# A household member who isn't the student counts as a guardian. The tuple used
# to be copied here with a comment pointing at sis_parent_service's copy; both
# now read the single definition in config/constants.
from config.constants import GUARDIAN_RELATIONSHIPS as _GUARDIAN_RELATIONSHIPS  # noqa: E402


def _display_name(u: Dict[str, Any]) -> str:
    name = (u.get('display_name') or
            f"{u.get('first_name') or ''} {u.get('last_name') or ''}").strip()
    return name or (u.get('username') or u.get('email') or 'Unnamed')


def _student_guardians(student_user_id: str) -> List[Dict[str, Any]]:
    """The student's guardians as [{id, email, first_name}] — resolved via the
    dependent link (users.managed_by_parent_id) and household membership. Empty
    when the student has no guardian (e.g. a self-managed platform account)."""
    admin = _admin()
    guardian_ids = set()

    stu = (
        admin.table('users').select('id, managed_by_parent_id')
        .eq('id', student_user_id).limit(1).execute()
    ).data or []
    if stu and stu[0].get('managed_by_parent_id'):
        guardian_ids.add(stu[0]['managed_by_parent_id'])

    memberships = (
        admin.table('household_members').select('household_id')
        .eq('user_id', student_user_id).eq('relationship', 'student').execute()
    ).data or []
    hh_ids = [m['household_id'] for m in memberships if m.get('household_id')]
    if hh_ids:
        members = (
            admin.table('household_members').select('user_id, relationship')
            .in_('household_id', hh_ids).execute()
        ).data or []
        for m in members:
            if m.get('relationship') in _GUARDIAN_RELATIONSHIPS and m.get('user_id'):
                guardian_ids.add(m['user_id'])

    if not guardian_ids:
        return []
    return (
        admin.table('users').select('id, email, first_name')
        .in_('id', list(guardian_ids)).execute()
    ).data or []


DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']


def _fmt_time(t: Optional[str]) -> str:
    """'13:30:00' -> '1:30pm'. Returns '' for anything unparseable."""
    parts = str(t or '').split(':')
    try:
        h, m = int(parts[0]), int(parts[1])
    except (IndexError, ValueError):
        return ''
    ampm = 'am' if h < 12 else 'pm'
    h12 = h % 12 or 12
    return f'{h12}:{m:02d}{ampm}' if m else f'{h12}{ampm}'


def meeting_text(class_id: str) -> str:
    """'Tuesdays, 1:30pm-2:30pm' for a class, or '' when it has no meetings.

    The offer email named the class and nothing else, so a family with two
    children and a full week could not tell WHICH slot they were being offered
    (iCreate, 2026-09-02: "it doesn't tell the day or time of the class").
    """
    try:
        rows = (
            _admin().table('class_meetings')
            .select('day_of_week, specific_date, start_time, end_time')
            .eq('class_id', class_id).execute()
        ).data or []
    except Exception as e:  # noqa: BLE001 — decoration only, never break the offer
        logger.warning(f'[Waitlist] meeting lookup failed for class {class_id}: {e}')
        return ''
    if not rows:
        return ''
    days = sorted({r['day_of_week'] for r in rows if r.get('day_of_week') is not None})
    label = ' and '.join(f'{DAY_NAMES[d]}s' for d in days if 0 <= d < 7)
    if not label:
        dates = sorted({str(r['specific_date']) for r in rows if r.get('specific_date')})
        label = ', '.join(dates)
    first = next((r for r in rows if r.get('start_time')), None)
    when = ''
    if first:
        start, end = _fmt_time(first.get('start_time')), _fmt_time(first.get('end_time'))
        when = f'{start}\u2013{end}' if start and end else start or end
    return ', '.join(p for p in (label, when) if p)


def _notify_offer(org_id: str, class_id: str, offered: Dict[str, Any]) -> None:
    """Tell the family a per-class seat was offered: an in-app notification to
    each guardian (falling back to the student's own account when there is no
    guardian) plus a transactional email with a link to claim it in the Schedule
    Builder. Best-effort — a notification failure must never break the offer."""
    try:
        from services import sis_notifications
        student_id = offered['student_user_id']
        guardians = _student_guardians(student_id)
        cls = (
            _admin().table('org_classes').select('name')
            .eq('id', class_id).limit(1).execute()
        ).data or []
        class_name = (cls[0].get('name') if cls else None) or 'a class'
        from app_config import Config
        # ?student= so the builder opens on the child the seat is for. Without
        # it a family with more than one student landed on the first child's
        # week, where there is no offer and so no Claim button (iCreate,
        # 2026-09-02: "there's no button that allows her to claim the spot").
        link = f"{Config.FRONTEND_URL.rstrip('/')}/schedule-builder?student={student_id}"
        when = meeting_text(class_id)
        title = 'A seat opened up'
        body = (f'A spot has opened in {class_name}'
                + (f' ({when})' if when else '')
                + '. Open the Schedule Builder to claim it before the offer expires.')
        targets = [g['id'] for g in guardians] or [student_id]
        for uid in targets:
            sis_notifications.notify(uid, title, body, link=link, organization_id=org_id)
        _email_offer(org_id, class_name, student_id, guardians,
                     offered.get('offer_expires_at'), when=when)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[Waitlist] offer notify skipped for class {class_id}: {e}")


def _email_offer(org_id: str, class_name: str, student_id: str,
                 guardians: List[Dict[str, Any]], offer_expires_at: Optional[str],
                 when: str = '') -> None:
    """Email each guardian that a seat opened, with a Claim-spot link. No-op when
    there is no guardian email on file."""
    if not guardians:
        return
    admin = _admin()
    org = (
        admin.table('organizations').select('name').eq('id', org_id).limit(1).execute()
    ).data or []
    org_name = (org[0].get('name') if org else None) or 'your school'
    student = (
        admin.table('users')
        .select('first_name, last_name, display_name, username, email, preferred_name')
        .eq('id', student_id).limit(1).execute()
    ).data or []
    student_name = _display_name(student[0]) if student else 'your student'
    student_first = ((student[0].get('first_name') if student else None)
                     or student_name.split(' ')[0])

    from app_config import Config
    base = Config.FRONTEND_URL.rstrip('/')
    hold_line = ''
    if offer_expires_at:
        try:
            exp = datetime.fromisoformat(str(offer_expires_at).replace('Z', '+00:00'))
            when = exp.strftime('%A, %B ') + str(exp.day)
            hold_line = (f"<p>This spot is held for {student_first} until "
                         f"<strong>{when}</strong>. After that it may be offered to the "
                         f"next family.</p>")
        except ValueError:
            # unparseable expiry: treat as expired
            ...

    from services.email_service import email_service
    subject = f'{org_name}: a spot opened in {class_name} for {student_name}'
    for g in guardians:
        email = g.get('email')
        if not email:
            continue
        html = (
            f"<p>Hi {g.get('first_name') or 'there'},</p>"
            f"<p>Good news — a spot has opened in <strong>{class_name}</strong> at "
            f"{org_name}, and we're offering it to {student_first}.</p>"
            + (f"<p>The class meets <strong>{when}</strong>.</p>" if when else '')
            + f"{hold_line}"
            f"<p><a href=\"{base}/schedule-builder?student={student_id}\">Open the Schedule "
            f"Builder</a> and use <strong>Claim spot</strong> next to {class_name} to enroll "
            f"{student_first}.</p>"
        )
        try:
            email_service.send_email(email, subject, html)
        except Exception as e:  # noqa: BLE001
            logger.warning(f"[Waitlist] offer email failed for entry in {org_id[:8]}: {e}")


def _org_admin_emails(org_id: str) -> List[str]:
    """Emails of the org's admin team (org_role / org_roles contains org_admin)."""
    rows = (
        _admin().table('users').select('email, org_role, org_roles')
        .eq('organization_id', org_id).execute()
    ).data or []
    out = []
    for u in rows:
        roles = set()
        if u.get('org_role'):
            roles.add(u['org_role'])
        if isinstance(u.get('org_roles'), list):
            roles.update(u['org_roles'])
        if 'org_admin' in roles and u.get('email'):
            out.append(u['email'])
    return out


def remove(org_id: str, entry_id: str) -> None:
    (
        _admin().table('sis_waitlist_entries')
        .delete().eq('id', entry_id).eq('organization_id', org_id).execute()
    )
