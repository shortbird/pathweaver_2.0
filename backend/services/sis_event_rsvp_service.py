"""
RSVPs on a calendar event, and the money that sometimes comes with one.

iCreate, 2026-08-28 (9cf78e9a): "The ability to add a form for collecting RSVPs
and payments to the calendar events would be good."

Deliberately not a form template. An RSVP is always the same three questions —
are you coming, how many of you, anything we should know — and routing it
through the general form builder would file the replies in the staff request
queue rather than on the event they answer, which is the one place the office
looks when it is counting chairs.

The fee is charged the way every other family charge is: a `sent` invoice via
sis_billing_service.create_charge. It then lands in the billing portal the
family already pays through, and the office reconciles it in one place instead
of a second ledger nobody balances.

One reply per HOUSEHOLD, not per guardian: two parents answering the same
invitation is one family coming, and counting it twice is how a school orders
double the pizza.

Two ways to reply (Apogee NoCo, SPARK Friday Excursions, 2026-10-16):
  'count'     "how many of you" -- the reply above, unchanged.
  'children'  "which of your children are coming" -- an excursion needs names,
              not a number. The household's row carries student_ids, and
              party_size is kept equal to how many were picked, so every count
              (the grid's "11 going", the Replies total, the capacity) reads the
              one column in both modes.

Spots (rsvp_capacity) cap the sum of party_size over the "yes" replies. The
check here exists to say something kind; the trigger in
20261016171314_sis_event_rsvp_children_capacity_series.sql is what actually
holds the line when two families take the last seat at once. A reply that does
not grow always passes, so a family already in can always change down.
"""

from typing import Any, Dict, List, Optional

from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger
from utils.timestamps import now_iso as _now

logger = get_logger(__name__)

MAX_PARTY_SIZE = 50

RSVP_MODES = ('count', 'children')

FULL_MESSAGE = 'Sorry, this event is full. There are no spots left.'


# admin client justified: the SIS console acts for the whole school — this
#   reads/writes rows belonging to every family in the org, which no single
#   caller can see under RLS; the route's role+org gate is the authorization
from utils.admin_client import admin_client as _admin


def get_event(org_id: str, event_id: str) -> Optional[Dict[str, Any]]:
    from services import sis_events_service as events
    return events.get_event(org_id, event_id)


def _clean_party_size(value: Any) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return 1
    return max(1, min(n, MAX_PARTY_SIZE))


def rsvps_for(org_id: str, event_id: str) -> List[Dict[str, Any]]:
    """Every reply to one event, with the family named and the fee's state. The
    office's headcount."""
    rows = fetch_all_rows(lambda: (
        _admin().table('sis_event_rsvps').select('*')
        .eq('organization_id', org_id).eq('event_id', event_id)
    ))
    household_ids = [r['household_id'] for r in rows if r.get('household_id')]
    names = {}
    if household_ids:
        try:
            hh = (_admin().table('households').select('id, name')
                  .in_('id', household_ids).execute()).data or []
            names = {h['id']: h.get('name') for h in hh}
        except Exception as e:  # noqa: BLE001 — a name is a nicety; a count is not
            logger.warning(f'Could not resolve RSVP household names: {e}')
    # Whether the fee actually came in. Somebody reading a paid event's headcount
    # is also asking who still owes, and answering that from the billing page
    # means cross-referencing two lists by hand for one evening.
    invoice_ids = [r['invoice_id'] for r in rows if r.get('invoice_id')]
    paid_state = {}
    if invoice_ids:
        try:
            from services import sis_billing_service
            paid_state = sis_billing_service.invoice_statuses(org_id, invoice_ids)
        except Exception as e:  # noqa: BLE001 — same rule: a count survives this
            logger.warning(f'Could not resolve RSVP invoice status: {e}')
    # The children each family signed up, by name: the office reads this list
    # to know who is on the bus, and a list of ids is not that.
    child_names = _names_of([sid for r in rows for sid in (r.get('student_ids') or [])])
    for r in rows:
        r['household_name'] = names.get(r.get('household_id'))
        r['children'] = [{'id': sid, 'name': child_names.get(sid) or 'Unnamed'}
                         for sid in (r.get('student_ids') or [])]
        invoice_id = r.get('invoice_id')
        r['invoice_status'] = paid_state.get(invoice_id) if invoice_id else None
    rows.sort(key=lambda r: ((r.get('household_name') or '~').lower(), r.get('created_at') or ''))
    return rows


def _names_of(user_ids: List[str]) -> Dict[str, str]:
    ids = sorted({u for u in user_ids if u})
    if not ids:
        return {}
    try:
        from repositories.user_repository import UserRepository
        from utils import person_name
        users = UserRepository(client=_admin()).find_by_ids(
            ids, 'id, display_name, first_name, last_name, preferred_name, username, email')
        return {uid: person_name.full_name(u, 'Unnamed') for uid, u in users.items()}
    except Exception as e:  # noqa: BLE001 — a name is a nicety; a count is not
        logger.warning(f'Could not resolve RSVP child names: {e}')
        return {}


def _replies(org_id: str, event_ids: List[str], columns: str) -> List[Dict[str, Any]]:
    """Every reply to these events. The one read of other families' replies
    for counting: the grid's summary, the capacity check and the family
    calendar's spots-left all come through here."""
    return fetch_all_rows(lambda: (
        _admin().table('sis_event_rsvps').select(columns)
        .eq('organization_id', org_id).in_('event_id', event_ids)
    ))


def taken_for(org_id: str, event_id: str, exclude_household: Optional[str] = None) -> int:
    """Spots already taken on one event: the sum of party_size over the "yes"
    replies, leaving out one household (the one now replying) when asked."""
    rows = _replies(org_id, [event_id], 'household_id, attending, party_size')
    return sum((r.get('party_size') or 1) for r in rows
               if r.get('attending')
               and not (exclude_household and r.get('household_id') == exclude_household))


def spots_left(event: Dict[str, Any], taken: int) -> Optional[int]:
    """None when the event has no limit."""
    cap = event.get('rsvp_capacity')
    if not cap:
        return None
    return max(0, int(cap) - int(taken or 0))


def children_for(user_id: str, org_id: str) -> List[Dict[str, Any]]:
    """The children this guardian may sign up at this school, as [{id, name}].

    The same family resolution class registration uses (household, managed
    account, approved parent link) -- one answer to "whose parent is this"."""
    from services import sis_parent_service
    seen, out = set(), []
    for s in sis_parent_service.registerable_students(user_id):
        if s.get('org_id') != org_id or s['student_id'] in seen:
            continue
        seen.add(s['student_id'])
        out.append({'id': s['student_id'], 'name': s.get('name') or 'Unnamed'})
    out.sort(key=lambda c: c['name'].lower())
    return out


def _is_full_error(exc: Exception) -> bool:
    return 'event_full' in str(exc)


def summary_for(org_id: str, event_ids: List[str]) -> Dict[str, Dict[str, int]]:
    """{event_id: {families, people}} for a page of the calendar — how many are
    coming, in one query rather than one per event."""
    if not event_ids:
        return {}
    try:
        rows = _replies(org_id, event_ids, 'event_id, attending, party_size')
    except Exception as e:  # noqa: BLE001 — the calendar must render regardless
        logger.warning(f'RSVP summary unavailable: {e}')
        return {}
    out: Dict[str, Dict[str, int]] = {}
    for r in rows:
        if not r.get('attending'):
            continue
        slot = out.setdefault(r['event_id'], {'families': 0, 'people': 0})
        slot['families'] += 1
        slot['people'] += r.get('party_size') or 1
    return out


def respond(org_id: str, event_id: str, user_id: str, household_id: Optional[str],
            attending: bool, party_size: Any = 1,
            note: Optional[str] = None,
            student_ids: Optional[List[str]] = None) -> Dict[str, Any]:
    """A family answers an invitation. Changing your mind updates the same row.

    A fee is charged the FIRST time a family says yes, and not again if they
    edit their headcount — re-billing somebody for correcting "3" to "4" is how
    a family ends up with two invoices for one evening. Saying no after paying
    does not refund: the office cancels the charge if it decides to, the same as
    everywhere else money is involved here.
    """
    event = get_event(org_id, event_id)
    if not event:
        return {'error': 'Event not found'}
    if not event.get('rsvp_enabled'):
        return {'error': 'This event is not taking replies'}
    closes = event.get('rsvp_closes_at')
    if closes and str(closes) < _now():
        return {'error': 'Replies to this event have closed'}
    if not household_id:
        return {'error': 'Only a family can reply to an event'}

    existing = (_admin().table('sis_event_rsvps').select('*')
                .eq('event_id', event_id).eq('household_id', household_id)
                .limit(1).execute()).data
    row = existing[0] if existing else None

    attending = bool(attending)
    size = _clean_party_size(party_size)
    picked: List[str] = []
    if (event.get('rsvp_mode') or 'count') == 'children':
        # Only this guardian's own children at this school can be signed up.
        # A child already on the reply that this guardian cannot see (a second
        # parent's linked account) is kept, not silently dropped by an edit.
        mine = {c['id'] for c in children_for(user_id, org_id)}
        kept = [sid for sid in ((row or {}).get('student_ids') or []) if sid not in mine]
        asked = [str(sid) for sid in (student_ids or []) if str(sid) in mine]
        if attending:
            picked = list(dict.fromkeys(kept + asked))
            if not picked:
                return {'error': 'Pick at least one child who is coming'}
        size = max(1, len(picked))

    # Spots. Growing past the cap is refused; staying the same or shrinking is
    # always allowed, so a family already in can still change its sign-up.
    cap = event.get('rsvp_capacity')
    if cap and attending:
        old = ((row or {}).get('party_size') or 1) if (row or {}).get('attending') else 0
        if size > old:
            left = spots_left(event, taken_for(org_id, event_id, exclude_household=household_id))
            if left is not None and size > left:
                if left <= 0:
                    return {'error': FULL_MESSAGE, 'full': True}
                unit = 'child' if (event.get('rsvp_mode') == 'children') else 'person'
                units = 'children' if unit == 'child' else 'people'
                return {'error': f'Sorry, there is only room for {left} more '
                                 f'{unit if left == 1 else units}.',
                        'full': True}

    fields = {
        'event_id': event_id,
        'organization_id': org_id,
        'household_id': household_id,
        'responded_by': user_id,
        'attending': attending,
        'party_size': size,
        'student_ids': picked,
        'note': (str(note).strip()[:500] or None) if note else None,
        'updated_at': _now(),
    }

    fee = event.get('rsvp_fee_cents')
    invoice = None
    # Billed once, on the first yes. `invoice_id` on the row is what remembers
    # that, so an edit never bills again.
    if attending and fee and not (row or {}).get('invoice_id'):
        try:
            from services import sis_billing_service
            charged = sis_billing_service.create_charge(org_id, {
                'household_id': household_id,
                'description': f"{event.get('title') or 'Event'} — RSVP",
                'amount_cents': int(fee),
                'kind': 'fee',
            })
            invoice = charged.get('invoice')
            if invoice:
                fields['invoice_id'] = invoice['id']
        except Exception as e:  # noqa: BLE001 — the reply is the point; a
            # failed charge must not lose the headcount the office is counting.
            logger.error(f'Could not charge RSVP fee for event {event_id}: {e}',
                         exc_info=True)

    try:
        if row:
            saved = (_admin().table('sis_event_rsvps').update(fields)
                     .eq('id', row['id']).execute()).data
        else:
            saved = (_admin().table('sis_event_rsvps').insert(fields).execute()).data
    except Exception as e:  # noqa: BLE001 — only the capacity trigger is ours to explain
        if _is_full_error(e):
            # Somebody took the last spot between the check above and this
            # write. A fee raised a moment ago is for a seat the family did not
            # get, so it is voided again (nothing can have been paid on it yet).
            if invoice:
                try:
                    from services import sis_billing_service
                    sis_billing_service.void_invoice(
                        org_id, invoice['id'], user_id,
                        reason='Event was full; the sign-up did not go through')
                except Exception as ve:  # noqa: BLE001 — log it for the office
                    logger.error(f'RSVP for event {event_id} refused as full but '
                                 f'invoice {invoice.get("id")} could not be voided: {ve}')
            return {'error': FULL_MESSAGE, 'full': True}
        raise
    return {'rsvp': (saved or [None])[0], 'invoice': invoice}


def household_of(user_id: str, org_id: str) -> Optional[str]:
    """The household this guardian answers for, in this school.

    An RSVP is a FAMILY saying they are coming, so the reply is keyed on the
    household rather than the person — two parents answering the same invitation
    is one family, and counting it twice is how a school orders double the pizza.
    """
    from config.constants import GUARDIAN_RELATIONSHIPS
    memberships = (_admin().table('household_members')
                   .select('household_id, relationship')
                   .eq('user_id', user_id).execute()).data or []
    ids = [m['household_id'] for m in memberships
           if m.get('relationship') in GUARDIAN_RELATIONSHIPS and m.get('household_id')]
    if not ids:
        return None
    rows = (_admin().table('households').select('id')
            .in_('id', ids).eq('organization_id', org_id)
            .limit(1).execute()).data
    return rows[0]['id'] if rows else None


def my_rsvp(org_id: str, event_id: str, household_id: Optional[str]) -> Optional[Dict[str, Any]]:
    if not household_id:
        return None
    rows = (_admin().table('sis_event_rsvps').select('*')
            .eq('event_id', event_id).eq('household_id', household_id)
            .limit(1).execute()).data
    return rows[0] if rows else None


def annotate_for_family(org_id: str, user_id: str,
                        events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Add, to each event taking replies, what a family's calendar shows
    without opening it: spots left, whether it is full, and this family's own
    reply. Two queries for the whole page rather than one per event -- the list
    view shows a semester of excursions at once.

    The other families' replies are never sent, only the count left.
    """
    asked = [ev for ev in events if ev.get('rsvp_enabled')]
    if not asked:
        return events
    ids = [ev['id'] for ev in asked]
    household_id = None
    try:
        household_id = household_of(user_id, org_id)
        rows = _replies(org_id, ids, 'event_id, household_id, attending, party_size, student_ids')
    except Exception as e:  # noqa: BLE001 — the calendar must render regardless
        logger.warning(f'RSVP state for the family calendar unavailable: {e}')
        return events
    taken: Dict[str, int] = {}
    mine: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        if r.get('attending'):
            taken[r['event_id']] = taken.get(r['event_id'], 0) + (r.get('party_size') or 1)
        if household_id and r.get('household_id') == household_id:
            mine[r['event_id']] = {
                'attending': bool(r.get('attending')),
                'party_size': r.get('party_size') or 1,
                'student_ids': r.get('student_ids') or [],
            }
    for ev in asked:
        left = spots_left(ev, taken.get(ev['id'], 0))
        ev['rsvp_spots_left'] = left
        ev['rsvp_full'] = left == 0
        ev['my_rsvp'] = mine.get(ev['id'])
    return events
