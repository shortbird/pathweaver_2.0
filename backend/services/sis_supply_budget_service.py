"""
Per-class supply budget — what a teacher may spend on materials for a class.

The number iCreate described:

    budget = (supply fee x enrolled students)              # what families paid
           + (materials allowance x enrolled students)     # funded from tuition

A student whose class is included with another of their classes (a bundled
program, org_classes.included_with_class_ids) paid no supply fee for it, so
they count toward the allowance but not the fee part.

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

from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger

logger = get_logger(__name__)


# admin client justified: the SIS console acts for the whole school — this
#   reads/writes rows belonging to every family in the org, which no single
#   caller can see under RLS; the route's role+org gate is the authorization
from utils.admin_client import admin_client as _admin


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


def _included_counts(classes: List[Dict[str, Any]]) -> Dict[str, int]:
    """{class_id: active students who pay no supply fee for it} because a
    class it is included with (a bundled program) pays for them, by the one
    rule (sis_tuition_service.included_with). Reads nothing for a school
    with no "Included with" set, which is most of them."""
    from services.sis_tuition_service import included_with
    from repositories.sis_class_repository import SisClassRepository
    # The caller hands whole org_classes rows; a row without the column (a
    # database it has not reached yet) is included with nothing.
    targets = {c['id']: c for c in classes if c.get('included_with_class_ids')}
    if not targets:
        return {}
    repo = SisClassRepository(client=_admin())
    payer_ids = {str(k) for c in targets.values() for k in c['included_with_class_ids'] if k}
    rows = repo.pricing_rows(payer_ids - set(targets))
    rows.update(targets)
    by_student: Dict[str, List[Dict[str, Any]]] = {}
    for cid, students in repo.active_students_by_class(sorted(rows)).items():
        for sid in students:
            if cid in rows:
                by_student.setdefault(sid, []).append(rows[cid])
    counts: Dict[str, int] = {}
    for student_classes in by_student.values():
        for cid in included_with(student_classes):
            if cid in targets:
                counts[cid] = counts.get(cid, 0) + 1
    return counts


# The two request types that spent a class's supply budget. Requests were
# retired into tasks on 2026-09-24 and nothing new is logged against a budget
# (owner decision, 2026-09-23); what was filed before stays readable here, from
# the old table, which the release left in place.
PAST_SPEND_TYPES = frozenset({'supply_request', 'reimbursement'})


def _spend_by_class(org_id: str, class_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    """{class_id: {spent, committed, items}} from the requests filed against it
    before requests were retired. Read-only history: nothing writes these any
    more.

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
    try:
        rows = fetch_all_rows(lambda: (
            _admin().table('sis_form_submissions')
            .select('id, class_id, form_type, form_type_label, title, status, '
                    'payload, created_at, submitted_by')
            .eq('organization_id', org_id)
            .in_('class_id', class_ids)
            .in_('form_type', sorted(PAST_SPEND_TYPES))
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


def _logged_by_class(org_id: str, class_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    """{class_id: {spent, items}} from the class's own expense log (ticket
    e7a50b4b). Best-effort like the request history: a failed read leaves the
    ceiling standing."""
    from services import sis_supply_expense_service as expenses
    try:
        return expenses.for_classes(org_id, class_ids)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Supply expense log unavailable for {org_id}: {e}')
        return {}


def budget_for_classes(org_id: str, classes: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """{class_id: budget breakdown} for the given org_classes rows."""
    settings = _org_settings(org_id)
    org_allowance = _as_money(settings.get('supply_budget_per_student') or 0)
    first_day = _first_day(settings)
    frozen = bool(first_day and date.today() >= first_day)

    counts = _enrolled_counts([c['id'] for c in classes])
    included = _included_counts(classes)
    spend = _spend_by_class(org_id, [c['id'] for c in classes])
    logged = _logged_by_class(org_id, [c['id'] for c in classes])
    out = {}
    for c in classes:
        students = counts.get(c['id'], 0)
        fee = _as_money(c.get('supply_fee') or 0)
        override = c.get('supply_budget_per_student')
        allowance = _as_money(override) if override is not None else org_allowance
        # A student whose bundled program pays for this class paid no supply
        # fee for it, so the fee part counts only the students who did. The
        # allowance still counts them: it is funded from tuition, and their
        # program's tuition paid for their seat here.
        fee_students = max(0, students - included.get(c['id'], 0))
        out[c['id']] = {
            'students': students,
            'fee_students': fee_students,
            'included_students': students - fee_students,
            'supply_fee_per_student': fee,
            'allowance_per_student': allowance,
            'from_fees': round(fee * fee_students, 2),
            'from_allowance': round(allowance * students, 2),
            'total': round(fee * fee_students + allowance * students, 2),
            'frozen': frozen,
            'as_of': first_day.isoformat() if frozen and first_day else date.today().isoformat(),
        }
        # What is left, and what it went on.
        s = spend.get(c['id']) or {'spent': 0.0, 'committed': 0.0, 'items': []}
        # The expense log (e7a50b4b) is money already gone, so it is both
        # spent and committed. The retired requests keep their own split.
        log = logged.get(c['id']) or {'spent': 0.0, 'items': []}
        out[c['id']].update({
            'spent': round(s['spent'] + log['spent'], 2),
            'committed': round(s['committed'] + log['spent'], 2),
            'logged': log['spent'],
            'expenses': log['items'],
            # Against COMMITTED, not spent: a teacher planning the next purchase
            # needs the request they filed on Tuesday to already be gone from
            # what they have left. Can go negative, and says so rather than
            # clamping — an over-committed class is a thing the office wants to
            # see, not a zero.
            'remaining': round(out[c['id']]['total'] - s['committed'] - log['spent'], 2),
            'transactions': s['items'],
        })
    return out


def budget_for_class(org_id: str, class_row: Dict[str, Any]) -> Dict[str, Any]:
    return budget_for_classes(org_id, [class_row]).get(class_row['id'], {})
