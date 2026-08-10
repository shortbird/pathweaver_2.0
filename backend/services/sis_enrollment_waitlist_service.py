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
from services.sis_eligibility import _coerce_date, age_on
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


# ── Queue ordering (staff order → frozen prefix → sibling priority) ───────────
# A staff-set order always wins: rows with a manual_rank come first, by rank
# (see reorder()). Everything else falls back to the computed queue.
#
# Sibling priority: a waiting student whose household has an ACCEPTED sibling
# (an older kid in a non-waitlisted band, or a sibling already released off the
# waitlist) moves ahead of waiting students with no accepted sibling. To honour
# "freeze the live waitlist", this only reorders FUTURE registrations: every row
# queued before the org's cutoff (sis_settings.enrollment_waitlist_priority_since)
# is a frozen prefix that keeps its exact place; priority sorts only the rows
# after it. So the queue is three lanes, in order:
#   0  everything queued before the cutoff   (frozen, by queued_at)
#   1  post-cutoff with an accepted sibling  (by OLDEST sibling's age, desc)
#   2  post-cutoff without                    (by queued_at)
# No cutoff set → lane 0 for everyone → the original pure-FIFO behaviour.
#
# Within the priority lane the OLDER the accepted sibling, the higher the spot:
# a family already committed through high school is a deeper commitment to the
# school than one whose oldest is 10, and the younger family has more years of
# chances to get in. Ties (same oldest-sibling age, or siblings whose DOB we
# don't know) fall back to queued_at, so date order is still the tiebreaker.
#
# Ordering is by queued_at — when the family actually got in line — not
# created_at. They differ only for students staff hand-added (a Google-form
# family carries their real sign-up date), which is what lets those rows land in
# the right place instead of at the back.

def _parse_ts(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except ValueError:
        return None


_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


def _priority_since(org_id: str) -> Optional[datetime]:
    """The freeze point for sibling priority, or None when the feature is off.

    An explicit sis_settings.enrollment_waitlist_priority_since FREEZES the queue
    at that instant: rows before it keep their spot, priority sorts only rows
    after it (set by the migration for orgs that already had a queue when this
    shipped). When no explicit stamp exists but the org gates an age band, there
    is no legacy queue to protect, so priority is simply on for the whole queue
    (cutoff = epoch). No gates → no waitlist → None (plain FIFO)."""
    settings = _sis_settings(org_id)
    explicit = _parse_ts(settings.get('enrollment_waitlist_priority_since'))
    if explicit:
        return explicit
    has_gate = any(isinstance(g, dict) and g.get('mode') == 'waitlist'
                   for g in (settings.get('enrollment_age_gates') or []))
    return _EPOCH if has_gate else None


def _priority_siblings(org_id: str, household_ids: set) -> Dict[str, Dict[str, Any]]:
    """Of the given households, those with at least one ACCEPTED sibling, with
    who that sibling is and how old they are.

    An accepted sibling is a student member who is NOT currently blocked
    (blocked = has a waitlist row in 'waiting' or 'rejected'). A member with no
    row is a non-waitlisted (older) kid; a 'released' member was accepted off
    the waitlist. Either grants the household's remaining waiting kids priority.

    Returns {household_id: {'siblings': [{'user_id', 'name', 'age'}, ...],
                            'top_age': int | None}} — siblings oldest first,
    top_age being the oldest KNOWN age (None when no sibling has a usable DOB).
    Households with no accepted sibling are absent, so `hh in result` is still
    the yes/no priority test. Ages use the same yardstick as the gates: age on
    the first day of school.
    """
    household_ids = {h for h in household_ids if h}
    if not household_ids:
        return {}
    admin = _admin()
    members = (admin.table('household_members').select('household_id, user_id')
               .in_('household_id', list(household_ids))
               .eq('relationship', 'student').execute().data) or []
    if not members:
        return {}
    student_ids = list({m['user_id'] for m in members})
    blocked_rows = (admin.table(TABLE).select('student_user_id')
                    .eq('organization_id', org_id)
                    .in_('status', ['waiting', 'rejected'])
                    .in_('student_user_id', student_ids).execute().data) or []
    blocked = {r['student_user_id'] for r in blocked_rows}
    accepted = [m for m in members if m['user_id'] not in blocked]
    if not accepted:
        return {}

    users_map = {
        u['id']: u for u in (
            admin.table('users')
            .select('id, display_name, first_name, last_name, username, email, date_of_birth')
            .in_('id', list({m['user_id'] for m in accepted})).execute().data) or []
    }
    first_day = _coerce_date(_sis_settings(org_id).get('first_day_of_school'))

    out: Dict[str, Dict[str, Any]] = {}
    for m in accepted:
        user = users_map.get(m['user_id'], {})
        out.setdefault(m['household_id'], {'siblings': [], 'top_age': None})['siblings'].append({
            'user_id': m['user_id'],
            'name': _display_name(user) if user else 'Sibling',
            'age': age_on(user.get('date_of_birth'), first_day),
        })
    for info in out.values():
        # Oldest first; unknown ages last so the badge leads with a real number.
        info['siblings'].sort(key=lambda s: (0, -s['age']) if s['age'] is not None else (1, 0))
        ages = [s['age'] for s in info['siblings'] if s['age'] is not None]
        info['top_age'] = max(ages) if ages else None
    return out


def _queued_at(entry: Dict[str, Any]) -> str:
    """When this family got in line. Falls back to created_at for rows written
    before queued_at existed."""
    return entry.get('queued_at') or entry.get('created_at') or ''


def _sibling_rank(entry: Dict[str, Any], sibling_map: Dict[str, Dict[str, Any]]) -> int:
    """Sort weight for the priority lane: older accepted sibling sorts first.
    Negated age, so 17 → -17 beats 10 → -10. A priority household whose siblings
    all have unknown DOBs gets 1 — still in the lane, but behind every family we
    can actually put a number on."""
    info = sibling_map.get(entry.get('household_id') or '')
    top = info.get('top_age') if info else None
    return -top if top is not None else 1


def _queue_sort_key(entry: Dict[str, Any], cutoff: Optional[datetime],
                    sibling_map: Dict[str, Dict[str, Any]]):
    # Group 0 = staff-ordered (by rank), group 1 = computed (by lane, then
    # oldest-sibling age, then date). Both tuples are (int, int, int, str) so
    # they stay comparable.
    rank = entry.get('manual_rank')
    if rank is not None:
        return (0, rank, 0, '')
    queued = _queued_at(entry)
    queued_dt = _parse_ts(queued)
    if cutoff and queued_dt and queued_dt >= cutoff:
        if entry.get('household_id') in sibling_map:
            return (1, 1, _sibling_rank(entry, sibling_map), queued)
        return (1, 2, 0, queued)
    return (1, 0, 0, queued)


def _is_priority(entry: Dict[str, Any], cutoff: Optional[datetime],
                 sibling_map: Dict[str, Dict[str, Any]]) -> bool:
    """Whether sibling priority actually moves this row. A pre-cutoff row can
    have an accepted sibling and still be frozen in place — the sibling detail
    is shown either way, but only this counts as priority."""
    queued_dt = _parse_ts(_queued_at(entry))
    return bool(cutoff and queued_dt and queued_dt >= cutoff
                and entry.get('household_id') in sibling_map)


def _order_waiting(org_id: str, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Sort waiting rows into queue order (staff order, frozen prefix, then
    sibling priority by oldest sibling)."""
    cutoff = _priority_since(org_id)
    siblings = _priority_siblings(
        org_id, {r.get('household_id') for r in rows}) if cutoff else {}
    return sorted(rows, key=lambda r: _queue_sort_key(r, cutoff, siblings))


def _position(entry: Dict[str, Any]) -> int:
    """1-based place in line among waiting students of the same band, in queue
    order (frozen prefix + sibling priority)."""
    q = (_admin().table(TABLE)
         .select('id, created_at, queued_at, manual_rank, household_id')
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
    # Sibling detail is resolved for every waiting row, cutoff or not: staff
    # deciding who to release want to see a frozen-prefix child's 16-year-old
    # sibling even though priority isn't reordering that row.
    waiting_rows = [r for r in rows if r['status'] == 'waiting']
    cutoff = _priority_since(org_id)
    sibling_map: Dict[str, Dict[str, Any]] = {}
    if waiting_rows:
        sibling_map = _priority_siblings(
            org_id, {r.get('household_id') for r in waiting_rows})
    bands: Dict[Any, List[Dict[str, Any]]] = {}
    for r in waiting_rows:
        bands.setdefault((r.get('band_min_age'), r.get('band_max_age')), []).append(r)
    pos_map: Dict[Any, int] = {}
    prio_map: Dict[Any, bool] = {}
    for group in bands.values():
        group.sort(key=lambda r: _queue_sort_key(r, cutoff, sibling_map))
        for i, r in enumerate(group):
            pos_map[r['id']] = i + 1
            prio_map[r['id']] = _is_priority(r, cutoff, sibling_map)

    for r in rows:
        r['student_name'] = _display_name(users_map.get(r['student_user_id'], {}))
        r['guardian_name'] = _display_name(users_map.get(r.get('guardian_user_id') or '', {})) \
            if r.get('guardian_user_id') else None
        r['guardian_email'] = (users_map.get(r.get('guardian_user_id') or '') or {}).get('email')
        r['band_label'] = band_label(r)
        if r['status'] == 'waiting':
            r['position'] = pos_map.get(r['id'])
            r['priority'] = prio_map.get(r['id'], False)
            info = sibling_map.get(r.get('household_id') or '') or {}
            r['siblings'] = info.get('siblings') or []
            r['sibling_top_age'] = info.get('top_age')
    return rows


# ── Staff-managed queue (SIS admin only; authorization is in the routes) ──────
def _band_query(q, band_min_age: Optional[int], band_max_age: Optional[int]):
    """Constrain a query to one age band, matching NULL bands correctly."""
    q = q.eq('band_min_age', band_min_age) if band_min_age is not None \
        else q.is_('band_min_age', 'null')
    q = q.eq('band_max_age', band_max_age) if band_max_age is not None \
        else q.is_('band_max_age', 'null')
    return q


def add_manual(org_id: str, student_user_id: str, *, added_by: str,
               queued_at: Optional[str] = None,
               band_min_age: Optional[int] = None,
               band_max_age: Optional[int] = None) -> Dict[str, Any]:
    """Hand-add a student to the waitlist.

    For families who queued somewhere other than the registration funnel — the
    old Google form, a phone call. `queued_at` is when they actually got in
    line, so they sort into their real place rather than the back of the queue;
    it defaults to now.

    The band comes from the student's age gate when one matches, so a hand-added
    student lands in the same queue they'd have landed in by registering. An
    explicit band overrides that (a student whose DOB is missing or who the
    school is placing in a specific group).
    """
    admin = _admin()
    users = (admin.table('users')
             .select('id, organization_id, date_of_birth, display_name, first_name, last_name')
             .eq('id', student_user_id).limit(1).execute()).data or []
    if not users:
        return {'error': 'Student not found'}
    student = users[0]
    if student.get('organization_id') != org_id:
        return {'error': 'That student is not in this organization'}

    live = (admin.table(TABLE).select('id, status')
            .eq('organization_id', org_id).eq('student_user_id', student_user_id)
            .eq('status', 'waiting').limit(1).execute()).data or []
    if live:
        return {'error': f'{_display_name(student)} is already on the waitlist'}

    gate = matching_gate(org_id, student.get('date_of_birth'))
    if band_min_age is None and band_max_age is None:
        if gate:
            band_min_age, band_max_age = gate.get('min_age'), gate.get('max_age')
        else:
            gates = gates_for_org(org_id)
            if len(gates) == 1:
                band_min_age = gates[0].get('min_age')
                band_max_age = gates[0].get('max_age')
            elif gates:
                return {'error': "Pick an age group — this student's age doesn't "
                                 'match one of the waitlisted groups'}

    household = (admin.table('household_members').select('household_id')
                 .eq('user_id', student_user_id).eq('relationship', 'student')
                 .limit(1).execute()).data or []

    payload = {
        'organization_id': org_id,
        'student_user_id': student_user_id,
        'household_id': household[0]['household_id'] if household else None,
        # Same yardstick the funnel uses: age as of the first day of school.
        'age_snapshot': gate.get('age') if gate else age_on(
            student.get('date_of_birth'),
            _coerce_date(_sis_settings(org_id).get('first_day_of_school'))),
        'band_min_age': band_min_age,
        'band_max_age': band_max_age,
        'added_by': added_by,
        'source': 'manual',
    }
    if queued_at:
        payload['queued_at'] = queued_at

    try:
        created = admin.table(TABLE).insert(payload).execute().data or []
    except Exception as e:  # noqa: BLE001
        if 'sis_enrollment_waitlist_waiting_uniq' in str(e):
            return {'error': f'{_display_name(student)} is already on the waitlist'}
        logger.error(f'enrollment waitlist: manual add failed for {student_user_id[:8]}: {e}')
        return {'error': 'Could not add that student to the waitlist'}

    entry = created[0] if created else None
    return {
        'entry': entry,
        'student_name': _display_name(student),
        'position': _position(entry) if entry else None,
    }


def reorder(org_id: str, band_min_age: Optional[int], band_max_age: Optional[int],
            ordered_ids: List[str], *, ordered_by: str) -> Dict[str, Any]:
    """Persist an explicit staff order for one age band.

    `ordered_ids` must be exactly the band's waiting entries — the UI sends the
    whole list back, so a stale client (someone released a student in another
    tab) is rejected rather than silently writing a half-order. Ranks are
    rewritten 1..N, and a rank always outranks the computed order, so the queue
    then reads exactly as staff arranged it.
    """
    admin = _admin()
    q = admin.table(TABLE).select('id').eq('organization_id', org_id).eq('status', 'waiting')
    rows = _band_query(q, band_min_age, band_max_age).execute().data or []
    current = {r['id'] for r in rows}
    submitted = list(ordered_ids or [])

    if len(set(submitted)) != len(submitted):
        return {'error': 'The same student appears twice in that order'}
    if set(submitted) != current:
        return {'error': 'The waitlist changed while you were reordering — reload and try again'}

    for i, entry_id in enumerate(submitted):
        admin.table(TABLE).update({'manual_rank': i + 1}).eq('id', entry_id).execute()

    logger.info(f'enrollment waitlist: {ordered_by[:8]} reordered '
                f'{len(submitted)} entries in {org_id[:8]} band {band_min_age}-{band_max_age}')
    return {'reordered': len(submitted)}


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
    # Lives in organization_secrets, not feature_flags -- see AUDIT.md C1.
    from utils.org_secrets import get_org_secret, STRIPE_SECRET_KEY
    return get_org_secret(org_id, STRIPE_SECRET_KEY)


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
    # Full name in the subject line, first name only in the email body.
    student_name = _display_name(student[0]) if student else 'Your student'
    student_first = ((student[0].get('first_name') if student else None)
                     or student_name.split(' ')[0])

    try:
        from app_config import Config
        from services.email_service import email_service
        base = Config.FRONTEND_URL.rstrip('/')
        if fee_due_cents > 0:
            action = (
                f"<p>One step first: your registration fee of "
                f"<strong>${fee_due_cents / 100:.2f}</strong> is now due. "
                f"<a href=\"{base}/enroll/resume\">Finish it here</a>, "
                f"then build {student_first}'s schedule.</p>"
            )
        else:
            action = (
                f"<p><a href=\"{base}/schedule-builder\">Open the Schedule Builder</a> "
                f"to choose {student_first}'s classes.</p>"
            )
        html = (
            f"<p>Hi {(guardian[0].get('first_name') if guardian else None) or 'there'},</p>"
            f"<p>Good news — a spot opened at {org_name}! {student_first} can now "
            f"choose classes.</p>"
            f"{action}"
            f"<p>Classes fill in the order families pick them, so it's worth doing soon.</p>"
        )
        return bool(email_service.send_email(
            email, f'{org_name}: {student_name} can now choose classes', html))
    except Exception as e:  # noqa: BLE001
        logger.warning(f'enrollment waitlist: release email failed for {entry["id"]}: {e}')
        return False
