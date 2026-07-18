"""
Enrollment-level age-group waitlist (sis_enrollment_waitlist).

Distinct from the per-class waitlist: here the STUDENT is waitlisted at
registration time because their age falls in a band the org gated
(feature_flags.sis_settings.enrollment_age_gates, e.g. [{"min_age": 5,
"max_age": 9, "mode": "waitlist"}]). A waiting student completes registration
normally but cannot select classes; staff release students individually from
the SIS Registration page, which unlocks class selection and emails the
guardian. Turning a band back to open only affects future registrants —
existing rows stay waiting until released (Marika's "only allow the 9").

Fee deferral: when every kid in a funnel registration was gated, the funnel
completed without payment (icreate_registrations.fee_deferred). The FIRST
release for that family reopens the registration at the fee step and puts the
household on a registration hold until the fee is settled, so the released
student picks classes only after paying.

Admin (service_role) client throughout — the table is RLS-locked to
backend-only; authorization happens in the callers.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from database import get_supabase_admin_client
from services.sis_eligibility import age_on
from utils.logger import get_logger

logger = get_logger(__name__)

TABLE = 'sis_enrollment_waitlist'
FEE_HOLD_REASON = 'Registration fee due — finish it from your registration page.'


def _admin():
    return get_supabase_admin_client()


def _sis_settings(org_id: str) -> Dict[str, Any]:
    row = (
        _admin().table('organizations').select('feature_flags')
        .eq('id', org_id).limit(1).execute()
    ).data or []
    flags = (row[0].get('feature_flags') or {}) if row else {}
    return flags.get('sis_settings') or {}


def gates_for_org(org_id: str) -> List[Dict[str, Any]]:
    """The org's waitlist-mode age gates (only 'waitlist' mode gates gate)."""
    settings = _sis_settings(org_id)
    return [g for g in (settings.get('enrollment_age_gates') or [])
            if isinstance(g, dict) and g.get('mode') == 'waitlist']


def matching_gate(org_id: str, dob: Any,
                  gates: Optional[List[Dict[str, Any]]] = None) -> Optional[Dict[str, Any]]:
    """The gate band a student's age falls in, or None. Age is judged as of the
    first day of school when set (same as the Schedule Builder); unknown age
    never gates."""
    if gates is None:
        gates = gates_for_org(org_id)
    if not gates:
        return None
    first_day = _sis_settings(org_id).get('first_day_of_school')
    from services.sis_eligibility import _coerce_date
    age = age_on(dob, _coerce_date(first_day))
    if age is None:
        return None
    for g in gates:
        lo, hi = g.get('min_age'), g.get('max_age')
        if (lo is None or age >= lo) and (hi is None or age <= hi):
            return {**g, 'age': age}
    return None


def add_waiting(org_id: str, student_user_id: str, *, guardian_user_id: Optional[str],
                household_id: Optional[str], gate: Dict[str, Any]) -> None:
    """Insert a waiting row (idempotent: the partial-unique index rejects a
    second live row per student — treated as already waiting)."""
    try:
        _admin().table(TABLE).insert({
            'organization_id': org_id,
            'student_user_id': student_user_id,
            'guardian_user_id': guardian_user_id,
            'household_id': household_id,
            'age_snapshot': gate.get('age'),
            'band_min_age': gate.get('min_age'),
            'band_max_age': gate.get('max_age'),
        }).execute()
    except Exception as e:  # noqa: BLE001
        if 'sis_enrollment_waitlist_waiting_uniq' not in str(e):
            raise
        logger.info(f'enrollment waitlist: {student_user_id[:8]} already waiting in {org_id[:8]}')


def remove_for_students(org_id: str, student_user_ids: List[str]) -> None:
    """Drop rows for students being torn down (funnel family-step back-edit)."""
    if not student_user_ids:
        return
    _admin().table(TABLE).delete() \
        .eq('organization_id', org_id).in_('student_user_id', student_user_ids).execute()


def waiting_entry(org_id: str, student_user_id: str) -> Optional[Dict[str, Any]]:
    """The student's live waiting row, with their position in the band queue."""
    rows = (
        _admin().table(TABLE).select('*')
        .eq('organization_id', org_id).eq('student_user_id', student_user_id)
        .eq('status', 'waiting').limit(1).execute()
    ).data or []
    if not rows:
        return None
    entry = rows[0]
    entry['position'] = _position(entry)
    return entry


# ── Queue ordering (frozen prefix + sibling priority) ──────────────────────────
# Sibling priority: a waiting student whose household has an ACCEPTED sibling
# (an older kid in a non-waitlisted band, or a sibling already released off the
# waitlist) moves ahead of waiting students with no accepted sibling. To honour
# "freeze the live waitlist", this only reorders FUTURE registrations: every row
# created before the org's cutoff (sis_settings.enrollment_waitlist_priority_since)
# is a frozen prefix that keeps its exact place; priority sorts only the rows
# after it. So the queue is three lanes, in order:
#   0  everything created before the cutoff  (frozen, by created_at)
#   1  post-cutoff with an accepted sibling  (by created_at)
#   2  post-cutoff without                    (by created_at)
# No cutoff set → lane 0 for everyone → the original pure-FIFO behaviour.

def _parse_ts(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except ValueError:
        return None


def _priority_since(org_id: str) -> Optional[datetime]:
    """The instant sibling priority turned on for this org, or None (feature
    off → plain FIFO)."""
    return _parse_ts(_sis_settings(org_id).get('enrollment_waitlist_priority_since'))


def _priority_households(org_id: str, household_ids: set) -> set:
    """Of the given households, those with at least one ACCEPTED sibling — a
    student member who is NOT currently blocked (blocked = has a waitlist row in
    'waiting' or 'rejected'). A member with no row is a non-waitlisted (older)
    kid; a 'released' member was accepted off the waitlist. Either grants the
    household's remaining waiting kids priority."""
    household_ids = {h for h in household_ids if h}
    if not household_ids:
        return set()
    admin = _admin()
    members = (admin.table('household_members').select('household_id, user_id')
               .in_('household_id', list(household_ids))
               .eq('relationship', 'student').execute().data) or []
    if not members:
        return set()
    student_ids = list({m['user_id'] for m in members})
    blocked_rows = (admin.table(TABLE).select('student_user_id')
                    .eq('organization_id', org_id)
                    .in_('status', ['waiting', 'rejected'])
                    .in_('student_user_id', student_ids).execute().data) or []
    blocked = {r['student_user_id'] for r in blocked_rows}
    return {m['household_id'] for m in members if m['user_id'] not in blocked}


def _queue_sort_key(entry: Dict[str, Any], cutoff: Optional[datetime],
                    priority_households: set):
    created = entry.get('created_at') or ''
    created_dt = _parse_ts(created)
    if cutoff and created_dt and created_dt >= cutoff:
        lane = 1 if entry.get('household_id') in priority_households else 2
    else:
        lane = 0
    return (lane, created)


def _is_priority(entry: Dict[str, Any], cutoff: Optional[datetime],
                 priority_households: set) -> bool:
    created_dt = _parse_ts(entry.get('created_at'))
    return bool(cutoff and created_dt and created_dt >= cutoff
                and entry.get('household_id') in priority_households)


def _order_waiting(org_id: str, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Sort waiting rows into queue order (frozen prefix, then sibling priority)."""
    cutoff = _priority_since(org_id)
    if not cutoff:
        return sorted(rows, key=lambda r: r.get('created_at') or '')
    priority = _priority_households(org_id, {r.get('household_id') for r in rows})
    return sorted(rows, key=lambda r: _queue_sort_key(r, cutoff, priority))


def _position(entry: Dict[str, Any]) -> int:
    """1-based place in line among waiting students of the same band, in queue
    order (frozen prefix + sibling priority)."""
    q = (_admin().table(TABLE).select('id, created_at, household_id')
         .eq('organization_id', entry['organization_id']).eq('status', 'waiting'))
    for col in ('band_min_age', 'band_max_age'):
        if entry.get(col) is None:
            q = q.is_(col, 'null')
        else:
            q = q.eq(col, entry[col])
    rows = q.execute().data or []
    ordered = _order_waiting(entry['organization_id'], rows)
    for i, r in enumerate(ordered):
        if r['id'] == entry['id']:
            return i + 1
    return len(ordered)


def band_label(entry: Dict[str, Any]) -> str:
    lo, hi = entry.get('band_min_age'), entry.get('band_max_age')
    if lo is not None and hi is not None:
        return f'ages {lo}–{hi}'
    if lo is not None:
        return f'ages {lo}+'
    if hi is not None:
        return f'up to age {hi}'
    return 'all ages'


def _display_name(u: Dict[str, Any]) -> str:
    name = (u.get('display_name') or
            f"{u.get('first_name') or ''} {u.get('last_name') or ''}").strip()
    return name or (u.get('username') or u.get('email') or 'Unnamed')


def list_entries(org_id: str) -> List[Dict[str, Any]]:
    """All rows for the org (waiting first, in queue order), hydrated with
    student/guardian names and per-band position for the staff card."""
    rows = (
        _admin().table(TABLE).select('*')
        .eq('organization_id', org_id).order('created_at').execute()
    ).data or []
    if not rows:
        return []
    user_ids = list({r['student_user_id'] for r in rows}
                    | {r['guardian_user_id'] for r in rows if r.get('guardian_user_id')})
    users_map = {
        u['id']: u for u in (
            _admin().table('users')
            .select('id, display_name, first_name, last_name, username, email, date_of_birth')
            .in_('id', user_ids).execute()
        ).data or []
    }
    # Queue order + positions (frozen prefix + sibling priority), per band.
    waiting_rows = [r for r in rows if r['status'] == 'waiting']
    cutoff = _priority_since(org_id)
    priority_hh: set = set()
    if cutoff and waiting_rows:
        priority_hh = _priority_households(
            org_id, {r.get('household_id') for r in waiting_rows})
    bands: Dict[Any, List[Dict[str, Any]]] = {}
    for r in waiting_rows:
        bands.setdefault((r.get('band_min_age'), r.get('band_max_age')), []).append(r)
    pos_map: Dict[Any, int] = {}
    prio_map: Dict[Any, bool] = {}
    for group in bands.values():
        group.sort(key=lambda r: _queue_sort_key(r, cutoff, priority_hh))
        for i, r in enumerate(group):
            pos_map[r['id']] = i + 1
            prio_map[r['id']] = _is_priority(r, cutoff, priority_hh)

    for r in rows:
        r['student_name'] = _display_name(users_map.get(r['student_user_id'], {}))
        r['guardian_name'] = _display_name(users_map.get(r.get('guardian_user_id') or '', {})) \
            if r.get('guardian_user_id') else None
        r['guardian_email'] = (users_map.get(r.get('guardian_user_id') or '') or {}).get('email')
        r['band_label'] = band_label(r)
        if r['status'] == 'waiting':
            r['position'] = pos_map.get(r['id'])
            r['priority'] = prio_map.get(r['id'], False)
    return rows


# ── Release ───────────────────────────────────────────────────────────────────
def release(org_id: str, entry_id: str, *, released_by: str) -> Dict[str, Any]:
    rows = (
        _admin().table(TABLE).select('*')
        .eq('id', entry_id).eq('organization_id', org_id).limit(1).execute()
    ).data or []
    if not rows:
        return {'error': 'Waitlist entry not found'}
    entry = rows[0]
    if entry.get('status') != 'waiting':
        return {'error': 'This student was already released'}
    return _release_entry(entry, released_by=released_by)


def release_band(org_id: str, band_min_age: Optional[int], band_max_age: Optional[int],
                 *, released_by: str) -> Dict[str, Any]:
    """Release every waiting student in a band (count-confirmed in the UI)."""
    q = (_admin().table(TABLE).select('*')
         .eq('organization_id', org_id).eq('status', 'waiting'))
    q = q.eq('band_min_age', band_min_age) if band_min_age is not None else q.is_('band_min_age', 'null')
    q = q.eq('band_max_age', band_max_age) if band_max_age is not None else q.is_('band_max_age', 'null')
    entries = q.order('created_at').execute().data or []
    released = 0
    for entry in entries:
        result = _release_entry(entry, released_by=released_by)
        if not result.get('error'):
            released += 1
    return {'released': released}


def _release_entry(entry: Dict[str, Any], *, released_by: str) -> Dict[str, Any]:
    admin = _admin()
    now = datetime.now(timezone.utc).isoformat()
    admin.table(TABLE).update({
        'status': 'released', 'released_by': released_by, 'released_at': now,
    }).eq('id', entry['id']).execute()

    fee_due_cents = _reopen_deferred_fee(entry)
    emailed = _send_release_email(entry, fee_due_cents)
    return {'released': True, 'fee_due_cents': fee_due_cents, 'emailed': emailed}


# ── Reject (not accepted) + refund ──────────────────────────────────────────────
def reject(org_id: str, entry_id: str, *, rejected_by: str) -> Dict[str, Any]:
    """The school decides this waitlisted child won't be offered a spot: mark
    them rejected and refund their proportional share of the family's paid
    registration fee. Idempotent-safe — a non-waiting row is refused."""
    rows = (
        _admin().table(TABLE).select('*')
        .eq('id', entry_id).eq('organization_id', org_id).limit(1).execute()
    ).data or []
    if not rows:
        return {'error': 'Waitlist entry not found'}
    entry = rows[0]
    if entry.get('status') != 'waiting':
        return {'error': 'This student is no longer waiting'}

    refund = _process_refund(entry)
    now = datetime.now(timezone.utc).isoformat()
    _admin().table(TABLE).update({
        'status': 'rejected', 'rejected_by': rejected_by, 'rejected_at': now,
        'refund_cents': refund.get('refund_cents', 0),
        'stripe_refund_id': refund.get('stripe_refund_id'),
    }).eq('id', entry_id).execute()

    emailed = _send_reject_email(entry, refund.get('refund_cents', 0))
    return {'rejected': True, 'refund_cents': refund.get('refund_cents', 0),
            'refund_error': refund.get('error'), 'emailed': emailed}


def _process_refund(entry: Dict[str, Any]) -> Dict[str, Any]:
    """Refund the rejected child's share of the family fee. The fee is per-family
    (one Stripe charge) but refunds are per-child, so the share is a proportional
    split of what was charged (fee_cents / number of kids), capped by what's left
    to refund. Returns {refund_cents, stripe_refund_id?, error?}. A record-only
    org (no Stripe key / no captured payment) records the intended refund without
    moving money."""
    admin = _admin()
    guardian_id = entry.get('guardian_user_id')
    if not guardian_id:
        return {'refund_cents': 0}
    regs = (
        admin.table('icreate_registrations')
        .select('id, fee_cents, refunded_cents, kids, stripe_payment_ref')
        .eq('parent_user_id', guardian_id)
        .eq('organization_id', entry['organization_id'])
        .order('created_at', desc=True).limit(1).execute()
    ).data or []
    if not regs:
        return {'refund_cents': 0}
    reg = regs[0]
    fee_cents = int(reg.get('fee_cents') or 0)
    num_kids = len(reg.get('kids') or []) or 1
    already = int(reg.get('refunded_cents') or 0)
    share = round(fee_cents / num_kids)
    refund_cents = max(0, min(share, fee_cents - already))
    if refund_cents <= 0:
        return {'refund_cents': 0}

    secret = _icreate_stripe_secret(entry['organization_id'])
    payment_ref = reg.get('stripe_payment_ref')
    stripe_refund_id = None
    if secret and payment_ref:
        try:
            import stripe
            rf = stripe.Refund.create(
                payment_intent=payment_ref, amount=refund_cents, api_key=secret)
            stripe_refund_id = getattr(rf, 'id', None)
        except Exception as e:  # noqa: BLE001
            logger.error(f'enrollment waitlist: refund failed for entry {entry["id"]}: {e}')
            return {'refund_cents': 0, 'error': 'Refund could not be processed — refund this family manually.'}

    admin.table('icreate_registrations').update({
        'refunded_cents': already + refund_cents,
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }).eq('id', reg['id']).execute()
    return {'refund_cents': refund_cents, 'stripe_refund_id': stripe_refund_id}


def _icreate_stripe_secret(org_id: str) -> Optional[str]:
    row = (
        _admin().table('organizations').select('feature_flags')
        .eq('id', org_id).limit(1).execute()
    ).data or []
    flags = (row[0].get('feature_flags') or {}) if row else {}
    return (flags.get('icreate_registration') or {}).get('stripe_secret_key')


def _send_reject_email(entry: Dict[str, Any], refund_cents: int) -> bool:
    admin = _admin()
    guardian_id = entry.get('guardian_user_id')
    if not guardian_id:
        return False
    guardian = (
        admin.table('users').select('email, first_name')
        .eq('id', guardian_id).limit(1).execute()
    ).data or []
    student = (
        admin.table('users').select('first_name, last_name, display_name, username, email')
        .eq('id', entry['student_user_id']).limit(1).execute()
    ).data or []
    org = (
        admin.table('organizations').select('name')
        .eq('id', entry['organization_id']).limit(1).execute()
    ).data or []
    email = (guardian[0].get('email') if guardian else None) or ''
    if not email:
        return False
    org_name = (org[0].get('name') if org else None) or 'your school'
    student_name = _display_name(student[0]) if student else 'Your student'
    try:
        from services.email_service import email_service
        refund_line = (
            f"<p>The registration fee you paid to hold {student_name}'s place — "
            f"<strong>${refund_cents / 100:.2f}</strong> — has been fully refunded to "
            f"your card. Refunds usually appear within 5–10 business days.</p>"
            if refund_cents > 0 else
            f"<p>Any registration fee paid to hold {student_name}'s place will be "
            f"fully refunded.</p>"
        )
        html = (
            f"<p>Hi {(guardian[0].get('first_name') if guardian else None) or 'there'},</p>"
            f"<p>Thank you for your interest in {org_name}. Unfortunately we aren't able "
            f"to offer {student_name} a spot for the coming school year.</p>"
            f"{refund_line}"
            f"<p>We're sorry we couldn't make it work this time, and we'd welcome a "
            f"future registration.</p>"
        )
        return bool(email_service.send_email(
            email, f'{org_name}: an update on {student_name}’s registration', html))
    except Exception as e:  # noqa: BLE001
        logger.warning(f'enrollment waitlist: reject email failed for {entry["id"]}: {e}')
        return False


def _reopen_deferred_fee(entry: Dict[str, Any]) -> int:
    """First release for a fee-deferred family: reopen the funnel at the fee
    step (my-registration makes it resumable with the normal Stripe flow) and
    hold the household until it's settled. Returns the cents now due (0 when
    nothing was deferred or it's already been handled)."""
    admin = _admin()
    guardian_id = entry.get('guardian_user_id')
    if not guardian_id:
        return 0
    regs = (
        admin.table('icreate_registrations').select('id, status, fee_cents, fee_deferred')
        .eq('parent_user_id', guardian_id)
        .eq('organization_id', entry['organization_id'])
        .eq('fee_deferred', True)
        .order('created_at', desc=True).limit(1).execute()
    ).data or []
    if not regs:
        return 0
    reg = regs[0]
    fee_cents = int(reg.get('fee_cents') or 0)
    now = datetime.now(timezone.utc).isoformat()
    admin.table('icreate_registrations').update({
        'status': 'fee', 'fee_deferred': False, 'completed_at': None,
        'fee_recorded_at': None, 'updated_at': now,
    }).eq('id', reg['id']).execute()
    if entry.get('household_id') and fee_cents > 0:
        admin.table('households').update({
            'registration_hold': True,
            'registration_hold_reason': FEE_HOLD_REASON,
        }).eq('id', entry['household_id']).execute()
    return fee_cents


def _send_release_email(entry: Dict[str, Any], fee_due_cents: int) -> bool:
    admin = _admin()
    guardian_id = entry.get('guardian_user_id')
    if not guardian_id:
        return False
    guardian = (
        admin.table('users').select('email, first_name')
        .eq('id', guardian_id).limit(1).execute()
    ).data or []
    student = (
        admin.table('users').select('first_name, last_name, display_name, username, email')
        .eq('id', entry['student_user_id']).limit(1).execute()
    ).data or []
    org = (
        admin.table('organizations').select('name')
        .eq('id', entry['organization_id']).limit(1).execute()
    ).data or []
    email = (guardian[0].get('email') if guardian else None) or ''
    if not email:
        return False
    org_name = (org[0].get('name') if org else None) or 'your school'
    student_name = _display_name(student[0]) if student else 'Your student'

    try:
        from app_config import Config
        from services.email_service import email_service
        base = Config.FRONTEND_URL.rstrip('/')
        if fee_due_cents > 0:
            action = (
                f"<p>One step first: your registration fee of "
                f"<strong>${fee_due_cents / 100:.2f}</strong> is now due. "
                f"<a href=\"{base}/register/icreate/resume\">Finish it here</a>, "
                f"then build {student_name}'s schedule.</p>"
            )
        else:
            action = (
                f"<p><a href=\"{base}/schedule-builder\">Open the Schedule Builder</a> "
                f"to choose {student_name}'s classes.</p>"
            )
        html = (
            f"<p>Hi {(guardian[0].get('first_name') if guardian else None) or 'there'},</p>"
            f"<p>Good news — a spot opened at {org_name}! {student_name} can now "
            f"choose classes.</p>"
            f"{action}"
            f"<p>Classes fill in the order families pick them, so it's worth doing soon.</p>"
        )
        return bool(email_service.send_email(
            email, f'{org_name}: {student_name} can now choose classes', html))
    except Exception as e:  # noqa: BLE001
        logger.warning(f'enrollment waitlist: release email failed for {entry["id"]}: {e}')
        return False
