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
from utils.logger import get_logger

logger = get_logger(__name__)


def _admin():
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
    rows = (_admin().table('class_enrollments').select('class_id, status')
            .in_('class_id', class_ids).execute()).data or []
    counts: Dict[str, int] = {}
    for r in rows:
        # Waitlisted and withdrawn students never paid a supply fee, so they
        # must not inflate the budget.
        if (r.get('status') or 'active') != 'active':
            continue
        counts[r['class_id']] = counts.get(r['class_id'], 0) + 1
    return counts


def budget_for_classes(org_id: str, classes: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """{class_id: budget breakdown} for the given org_classes rows."""
    settings = _org_settings(org_id)
    org_allowance = _as_money(settings.get('supply_budget_per_student') or 0)
    first_day = _first_day(settings)
    frozen = bool(first_day and date.today() >= first_day)

    counts = _enrolled_counts([c['id'] for c in classes])
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
    return out


def budget_for_class(org_id: str, class_row: Dict[str, Any]) -> Dict[str, Any]:
    return budget_for_classes(org_id, [class_row]).get(class_row['id'], {})
