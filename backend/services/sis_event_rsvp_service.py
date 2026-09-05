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
"""

from typing import Any, Dict, List, Optional

from database import get_supabase_admin_client
from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger
from utils.timestamps import now_iso as _now

logger = get_logger(__name__)

MAX_PARTY_SIZE = 50


def _admin():
    # admin client justified: the SIS console acts for the whole school — this
    #   reads/writes rows belonging to every family in the org, which no single
    #   caller can see under RLS; the route's role+org gate is the authorization
    return get_supabase_admin_client()


def get_event(org_id: str, event_id: str) -> Optional[Dict[str, Any]]:
    rows = (_admin().table('sis_events').select('*')
            .eq('id', event_id).eq('organization_id', org_id)
            .limit(1).execute()).data
    return rows[0] if rows else None


def _clean_party_size(value: Any) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return 1
    return max(1, min(n, MAX_PARTY_SIZE))


def rsvps_for(org_id: str, event_id: str) -> List[Dict[str, Any]]:
    """Every reply to one event, with the family named. The office's headcount."""
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
    for r in rows:
        r['household_name'] = names.get(r.get('household_id'))
    rows.sort(key=lambda r: ((r.get('household_name') or '~').lower(), r.get('created_at') or ''))
    return rows


def summary_for(org_id: str, event_ids: List[str]) -> Dict[str, Dict[str, int]]:
    """{event_id: {families, people}} for a page of the calendar — how many are
    coming, in one query rather than one per event."""
    if not event_ids:
        return {}
    try:
        rows = fetch_all_rows(lambda: (
            _admin().table('sis_event_rsvps')
            .select('event_id, attending, party_size')
            .eq('organization_id', org_id).in_('event_id', event_ids)
        ))
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
            note: Optional[str] = None) -> Dict[str, Any]:
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

    fields = {
        'event_id': event_id,
        'organization_id': org_id,
        'household_id': household_id,
        'responded_by': user_id,
        'attending': bool(attending),
        'party_size': _clean_party_size(party_size),
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

    if row:
        saved = (_admin().table('sis_event_rsvps').update(fields)
                 .eq('id', row['id']).execute()).data
    else:
        saved = (_admin().table('sis_event_rsvps').insert(fields).execute()).data
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
