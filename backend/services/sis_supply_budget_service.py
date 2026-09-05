"""
Per-class supply budget — what a teacher may spend on materials for a class.

The number iCreate described:

    budget = (supply fee x enrolled students)              # what families paid
           + (materials allowance x enrolled students)     # funded from tuition

Both parts are per student per YEAR. The allowance defaults to the org-wide
`feature_flags.sis_settings.supply_budget_per_student` and can be overridden per
class (`org_classes.supply_budget_per_student`), because some classes need more
than others.

Two deliberate choices:

* The figure is a CEILING, never a target. Every caller labels it "up to" —
  a teacher must not read it as money they are expected to spend.
* Enrollment is FROZEN once the school year has started. A budget that drifted
  every time a student enrolled or dropped would be useless for planning, and a
  teacher who already bought supplies against a number should not watch it fall.
  Before the first day it tracks enrollment live, because that is exactly the
  window when the roster is still filling up. `frozen` in the response says
  which mode produced the number, so the UI can be honest about it.
"""

from datetime import date
from typing import Any, Dict, List, Optional

from database import get_supabase_admin_client
from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger

logger = get_logger(__name__)


def _admin():
    # admin client justified: the SIS console acts for the whole school — this
    #   reads/writes rows belonging to every family in the org, which no single
    #   caller can see under RLS; the route's role+org gate is the authorization
    return get_supabase_admin_client()


def _org_settings(org_id: str) -> Dict[str, Any]:
    rows = (_admin().table('organizations').select('feature_flags')
            .eq('id', org_id).limit(1).execute()).data or []
    flags = (rows[0].get('feature_flags') or {}) if rows else {}
    return (flags.get('sis_settings') or {}) if isinstance(flags, dict) else {}


def _as_money(value) -> float:
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return 0.0


def _first_day(settings: Dict[str, Any]) -> Optional[date]:
    # Same setting the schedule builder locks on
    # (sis_parent_service._first_day_of_school).
    raw = settings.get('first_day_of_school')
    if not raw:
        return None
    try:
        return date.fromisoformat(str(raw)[:10])
    except (ValueError, TypeError):
        return None


def _enrolled_counts(class_ids: List[str]) -> Dict[str, int]:
    if not class_ids:
        return {}
    # Paged: tallying a silently-truncated org-wide read under-counts the roster,
    # which would hand teachers a budget ceiling lower than what families paid.
    rows = fetch_all_rows(lambda: (
        _admin().table('class_enrollments').select('id, class_id, status')
        .in_('class_id', class_ids)
    ))
    counts: Dict[str, int] = {}
    for r in rows:
        # Waitlisted and withdrawn students never paid a supply fee, so they
        # must not inflate the budget.
        if (r.get('status') or 'active') != 'active':
            continue
        counts[r['class_id']] = counts.get(r['class_id'], 0) + 1
    return counts


def _spend_by_class(org_id: str, class_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    """{class_id: {spent, committed, items}} from the requests filed against it.

    iCreate, 2026-09-01 (805cb3a3): "with the supply & reimbursement requests,
    it'd be super awesome if we could connect those to the classes. Then show
    the teacher how much they have left in the supply budget (and a transaction
    history would be good too.)"

    Two numbers, because they answer different questions:

      committed  everything asked for and not refused — what the teacher should
                 plan against, since a pending request is money they intend to
                 spend
      spent      only what the office has actually resolved

    A request with no amount on it counts as neither: guessing a figure for it
    would make both numbers wrong in a way nobody could see.
    """
    if not class_ids:
        return {}
    from services.sis_forms_service import SPEND_TYPES
    try:
        rows = fetch_all_rows(lambda: (
            _admin().table('sis_form_submissions')
            .select('id, class_id, form_type, form_type_label, title, status, '
                    'payload, created_at, submitted_by')
            .eq('organization_id', org_id)
            .in_('class_id', class_ids)
            .in_('form_type', sorted(SPEND_TYPES))
        ))
    except Exception as e:  # noqa: BLE001 — the ceiling must survive a failed
        # spend read; a budget with no history is still a budget.
        logger.warning(f'Supply spend unavailable for {org_id}: {e}')
        return {}

    out: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        amount = (r.get('payload') or {}).get('amount')
        try:
            amount = round(float(amount), 2) if amount is not None else None
        except (TypeError, ValueError):
            amount = None
        slot = out.setdefault(r['class_id'],
                              {'spent': 0.0, 'committed': 0.0, 'items': []})
        status = r.get('status') or 'submitted'
        # 'rejected' is not a status this queue has; a refused request is
        # resolved with a note. So "not refused" is every row there is, and the
        # distinction that matters is resolved vs still open.
        if amount:
            slot['committed'] = round(slot['committed'] + amount, 2)
            if status == 'resolved':
                slot['spent'] = round(slot['spent'] + amount, 2)
        slot['items'].append({
            'id': r['id'],
            'title': r.get('title') or r.get('form_type_label'),
            'kind': r.get('form_type'),
            'amount': amount,
            'status': status,
            'created_at': r.get('created_at'),
        })
    for slot in out.values():
        # Newest first: the history is read to answer "what have I just put in".
        slot['items'].sort(key=lambda i: i.get('created_at') or '', reverse=True)
    return out


def budget_for_classes(org_id: str, classes: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """{class_id: budget breakdown} for the given org_classes rows."""
    settings = _org_settings(org_id)
    org_allowance = _as_money(settings.get('supply_budget_per_student') or 0)
    first_day = _first_day(settings)
    frozen = bool(first_day and date.today() >= first_day)

    counts = _enrolled_counts([c['id'] for c in classes])
    spend = _spend_by_class(org_id, [c['id'] for c in classes])
    out = {}
    for c in classes:
        students = counts.get(c['id'], 0)
        fee = _as_money(c.get('supply_fee') or 0)
        override = c.get('supply_budget_per_student')
        allowance = _as_money(override) if override is not None else org_allowance
        out[c['id']] = {
            'students': students,
            'supply_fee_per_student': fee,
            'allowance_per_student': allowance,
            'from_fees': round(fee * students, 2),
            'from_allowance': round(allowance * students, 2),
            'total': round((fee + allowance) * students, 2),
            'frozen': frozen,
            'as_of': first_day.isoformat() if frozen and first_day else date.today().isoformat(),
        }
        # What is left, and what it went on.
        s = spend.get(c['id']) or {'spent': 0.0, 'committed': 0.0, 'items': []}
        out[c['id']].update({
            'spent': s['spent'],
            'committed': s['committed'],
            # Against COMMITTED, not spent: a teacher planning the next purchase
            # needs the request they filed on Tuesday to already be gone from
            # what they have left. Can go negative, and says so rather than
            # clamping — an over-committed class is a thing the office wants to
            # see, not a zero.
            'remaining': round(out[c['id']]['total'] - s['committed'], 2),
            'transactions': s['items'],
        })
    return out


def budget_for_class(org_id: str, class_row: Dict[str, Any]) -> Dict[str, Any]:
    return budget_for_classes(org_id, [class_row]).get(class_row['id'], {})
