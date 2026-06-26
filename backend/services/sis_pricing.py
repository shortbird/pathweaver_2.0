"""
SIS pricing engine — PURE functions, no DB.

Tuition math lives here so the bug-prone parts (discount stacking, splitting a
total into installments without losing cents, due-date stepping, late fees) are
exhaustively unit-testable. Optio CALCULATES and RECORDS money only — it never
processes payments (Simple Biz Suite collects; see SIS_ARCHITECTURE_DISCOVERY.md
§1.5). All amounts are integer cents.

Discount rules (rule_type / criteria jsonb):
  sibling     {min_students, percent|amount_cents}  -> auto when household has >= min_students enrolling
  multi_class {min_classes,  percent|amount_cents}  -> auto when this student takes >= min_classes
  promo       {code, percent|amount_cents}          -> applied when the entered code matches
  manual      {percent|amount_cents}                -> applied explicitly by an admin
"""

from datetime import date, datetime
from typing import Dict, List, Any, Optional


def _coerce_date(value: Any) -> Optional[date]:
    if value is None or value == '':
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    try:
        return datetime.fromisoformat(str(value)[:19]).date()
    except ValueError:
        try:
            return datetime.strptime(str(value)[:10], '%Y-%m-%d').date()
        except ValueError:
            return None


# ── Discounts ────────────────────────────────────────────────────────────────
def discount_amount(base_cents: int, rule: Dict[str, Any]) -> int:
    """Cents off `base_cents` for one rule (percent and/or flat amount). Never < 0
    and never more than base."""
    criteria = rule.get('criteria') or {}
    percent = criteria.get('percent')
    amount = criteria.get('amount_cents')
    off = 0
    if percent:
        off += round(base_cents * (percent / 100.0))
    if amount:
        off += int(amount)
    return max(0, min(off, base_cents))


def _rule_applies(rule: Dict[str, Any], context: Dict[str, Any]) -> bool:
    rt = rule.get('rule_type')
    crit = rule.get('criteria') or {}
    if not rule.get('active', True):
        return False
    if rt == 'sibling':
        return context.get('sibling_count', 1) >= crit.get('min_students', 2)
    if rt == 'multi_class':
        return context.get('class_count', 1) >= crit.get('min_classes', 2)
    if rt == 'promo':
        code = (context.get('promo_code') or '').strip().lower()
        return bool(code) and code == str(crit.get('code', '')).strip().lower()
    if rt == 'manual':
        # manual rules are applied only when explicitly listed in context
        return rule.get('id') in (context.get('manual_rule_ids') or [])
    return False


def applicable_discounts(base_cents: int, rules: List[Dict[str, Any]],
                         context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Sum every applicable rule's discount against base_cents (stacked), capped at
    the base. Returns {total_discount_cents, lines:[{rule_id,name,amount_cents}]}.
    """
    lines = []
    total = 0
    for rule in rules or []:
        if not _rule_applies(rule, context):
            continue
        amt = discount_amount(base_cents, rule)
        if amt <= 0:
            continue
        lines.append({'rule_id': rule.get('id'), 'name': rule.get('name'),
                      'rule_type': rule.get('rule_type'), 'amount_cents': amt})
        total += amt
    total = min(total, base_cents)
    return {'total_discount_cents': total, 'lines': lines}


def build_quote(item_prices_cents: List[int], rules: List[Dict[str, Any]],
                context: Dict[str, Any]) -> Dict[str, Any]:
    """Subtotal -> apply discounts -> total. context carries sibling/class/promo."""
    subtotal = sum(p for p in item_prices_cents if p)
    ctx = {**context, 'class_count': context.get('class_count', len(item_prices_cents))}
    disc = applicable_discounts(subtotal, rules, ctx)
    total = max(0, subtotal - disc['total_discount_cents'])
    return {
        'subtotal_cents': subtotal,
        'discount_cents': disc['total_discount_cents'],
        'discount_lines': disc['lines'],
        'total_cents': total,
    }


# ── Installments ─────────────────────────────────────────────────────────────
def split_amount(total_cents: int, count: int) -> List[int]:
    """Split into `count` integer-cent parts that sum EXACTLY to total; any
    remainder lands on the earliest installments."""
    if count <= 0:
        return []
    base = total_cents // count
    remainder = total_cents - base * count
    return [base + (1 if i < remainder else 0) for i in range(count)]


def add_months(d: date, n: int) -> date:
    """Add n months, clamping the day to the target month's length."""
    month_index = d.month - 1 + n
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    # clamp day
    if month == 2:
        last = 29 if (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)) else 28
    elif month in (4, 6, 9, 11):
        last = 30
    else:
        last = 31
    return date(year, month, min(d.day, last))


CADENCE_STEP_MONTHS = {'monthly': 1, 'semester': 5, 'full': 0}


def build_schedule(total_cents: int, cadence: str, count: int,
                   start_date: Any) -> List[Dict[str, Any]]:
    """
    A payment schedule: `count` installments summing to total_cents, due dates
    stepped by cadence from start_date. 'full' collapses to a single installment.
    """
    start = _coerce_date(start_date) or date.today()
    if cadence == 'full':
        count = 1
    count = max(1, count)
    amounts = split_amount(total_cents, count)
    step = CADENCE_STEP_MONTHS.get(cadence, 1)
    schedule = []
    for i, amt in enumerate(amounts):
        schedule.append({
            'due_date': add_months(start, step * i).isoformat(),
            'amount_cents': amt,
        })
    return schedule


# ── Late fees ────────────────────────────────────────────────────────────────
def is_overdue(due_date: Any, status: str, on_date: Optional[date] = None) -> bool:
    """An installment is overdue when unpaid and its due date has passed."""
    if status in ('paid', 'waived'):
        return False
    d = _coerce_date(due_date)
    if d is None:
        return False
    return (on_date or date.today()) > d
