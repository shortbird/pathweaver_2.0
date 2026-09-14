"""
Monthly program pricing for the parent registration funnel.

The funnel's original money was a one-time registration fee (fee_mode /
registration_fee_cents / per_student_fee_cents, resolved by
routes.registration_funnel._compute_fee_cents). Optio Academy charges nothing
up front and instead bills every month, so the funnel's last step became
"set up your monthly payment" for orgs that carry a `monthly` block in their
registration config:

    registration.monthly = {
        'per_student_cents':  5000,     # each registered student, every month
        'family_cap_cents':   15000,    # 0 = no cap
        'add_ons': [{
            'key': 'teacher_support',
            'label': 'Optio teacher support',
            'description': 'A weekly meeting with an Optio teacher ...',
            'amount_cents': 50000,
            'includes_program_fee': True,   # this student's program fee is
                                            # inside the add-on price, not on
                                            # top of it: $500, never $550
        }],
    }

Add-ons are chosen per student on the payment step and stored on the
registration's kids entries (`kids[i]['add_ons'] = ['teacher_support']`), so
the selection lives with the student it was made for and the SIS family view
can say who has a teacher without a join.

The one-time fee and the monthly plan are independent: an org can carry both
(a registration fee plus tuition), either, or neither. The monthly block is a
separate key rather than an interval flag on the old fee fields so that a
deploy carrying it does not change what an older build charges -- the old
funnel reads the old keys, sees $0, and behaves as it always did.

Pure functions, no I/O: the funnel routes, the Stripe line items and the SIS
family view all price from here, and web mirrors the same arithmetic in
components/registration/monthlyPlan.js for the live total on the page.
"""

from typing import Any, Dict, List, Optional

MONTHLY_INTERVAL = 'month'
PROGRAM_FEE_KEY = 'program_fee'


def _cents(v) -> int:
    try:
        return max(0, int(v or 0))
    except (TypeError, ValueError):
        return 0


def monthly_plan(cfg: Any) -> Optional[Dict[str, Any]]:
    """The org's monthly plan, normalized, or None when nothing bills monthly.

    Malformed add-ons (no key, no label, no positive amount) are dropped rather
    than rejected: the settings editor writes whole rows, and an admin's
    half-typed add-on must not take the whole plan down with it."""
    raw = cfg.get('monthly') if isinstance(cfg, dict) else None
    if not isinstance(raw, dict):
        return None
    per_student = _cents(raw.get('per_student_cents'))
    family_cap = _cents(raw.get('family_cap_cents'))
    add_ons: List[Dict[str, Any]] = []
    seen = set()
    for a in raw.get('add_ons') or []:
        if not isinstance(a, dict):
            continue
        key = str(a.get('key') or '').strip()
        label = str(a.get('label') or '').strip()
        amount = _cents(a.get('amount_cents'))
        if not key or not label or amount <= 0 or key in seen or key == PROGRAM_FEE_KEY:
            continue
        seen.add(key)
        add_ons.append({
            'key': key, 'label': label,
            'description': str(a.get('description') or '').strip(),
            'amount_cents': amount,
            'includes_program_fee': bool(a.get('includes_program_fee')),
        })
    if per_student <= 0 and not add_ons:
        return None
    return {'per_student_cents': per_student, 'family_cap_cents': family_cap, 'add_ons': add_ons}


def apply_add_on_selection(plan: Optional[Dict[str, Any]], kids: List[Dict[str, Any]],
                           selection: Any) -> List[Dict[str, Any]]:
    """The kids list with `add_ons` set from a {kid_user_id: [keys]} selection.

    Validated against the plan: a key the org does not offer, or a kid who is
    not on this registration, is dropped silently -- the browser is not trusted
    to price anything, only to say what was ticked. A selection of None leaves
    the stored choices alone (a resume, or a stale tab that never saw the
    add-ons) so a re-click of Pay cannot quietly un-choose a teacher."""
    if selection is None or not isinstance(selection, dict):
        return list(kids or [])
    offered = {a['key'] for a in (plan or {}).get('add_ons', [])}
    out = []
    for kid in kids or []:
        chosen = selection.get(kid.get('user_id')) or []
        keys = [k for k in chosen if isinstance(k, str) and k in offered] if isinstance(chosen, list) else []
        out.append({**kid, 'add_ons': sorted(set(keys))})
    return out


def _kid_name(kid: Dict[str, Any]) -> str:
    return (kid.get('preferred_name') or kid.get('first_name')
            or (kid.get('name') or '').split(' ')[0] or 'Student')


def monthly_line_items(plan: Optional[Dict[str, Any]], kids: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """What the family pays each month, itemized.

    [{'key', 'label', 'amount_cents', 'students': [names], 'capped': bool}]

    The program fee counts only students without an includes-the-fee add-on,
    then applies the family cap; every chosen add-on is its own line, one per
    student, so the Stripe receipt names who the teacher is for."""
    if not plan:
        return []
    kids = kids or []
    add_ons_by_key = {a['key']: a for a in plan.get('add_ons', [])}
    covered = set()
    for kid in kids:
        for key in kid.get('add_ons') or []:
            if add_ons_by_key.get(key, {}).get('includes_program_fee'):
                covered.add(kid.get('user_id'))
    uncovered = [k for k in kids if k.get('user_id') not in covered]

    items: List[Dict[str, Any]] = []
    per_student = plan.get('per_student_cents') or 0
    cap = plan.get('family_cap_cents') or 0
    program = per_student * len(uncovered)
    capped = bool(cap) and program > cap
    if capped:
        program = cap
    if program > 0:
        items.append({'key': PROGRAM_FEE_KEY, 'label': 'Program fee', 'amount_cents': program,
                      'students': [_kid_name(k) for k in uncovered], 'capped': capped})
    for add_on in plan.get('add_ons', []):
        for kid in kids:
            if add_on['key'] in (kid.get('add_ons') or []):
                items.append({'key': add_on['key'], 'label': add_on['label'],
                              'amount_cents': add_on['amount_cents'],
                              'students': [_kid_name(kid)], 'capped': False})
    return items


def monthly_total_cents(plan: Optional[Dict[str, Any]], kids: List[Dict[str, Any]]) -> int:
    return sum(i['amount_cents'] for i in monthly_line_items(plan, kids))


def stripe_line_items(plan: Optional[Dict[str, Any]], kids: List[Dict[str, Any]],
                      org_name: str) -> List[Dict[str, Any]]:
    """The monthly plan as Stripe Checkout line items (recurring, monthly)."""
    lines = []
    for item in monthly_line_items(plan, kids):
        if item['key'] == PROGRAM_FEE_KEY:
            n = len(item['students'])
            name = f"{org_name} monthly program fee ({n} student{'' if n == 1 else 's'})"
        else:
            name = f"{item['label']} ({', '.join(item['students'])})"
        lines.append({
            'price_data': {
                'currency': 'usd',
                'product_data': {'name': name},
                'unit_amount': item['amount_cents'],
                'recurring': {'interval': MONTHLY_INTERVAL},
            },
            'quantity': 1,
        })
    return lines
