"""
Cents as dollars, one way.

Five services each kept a `_money(cents)` for their emails and PDFs, and they
disagreed on nothing (`$0.00` from an `or 0`, a TypeError from a bare
division) and on negatives (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md,
A6; M7 in docs/sis/CONSOLIDATION_PLAN.md). The rule, the same one
web/src/utils/money.js draws:

    format_cents(12345)   -> '$123.45'
    format_cents(150000)  -> '$1,500.00'
    format_cents(-500)    -> '−$5.00'     (a refund, a credit)
    format_cents(0)       -> '$0.00'
    format_cents(None)    -> '—'          (nothing on file; `blank` overrides)
"""

from typing import Any, Optional

MINUS = '−'
BLANK = '—'


def format_cents(cents: Any, *, blank: Optional[str] = BLANK, compact: bool = False) -> Optional[str]:
    """Dollars with thousands separators and two decimals; whole dollars drop
    the cents when `compact` (a price read as a plan: "$50 per student")."""
    if cents is None or cents == '':
        return blank
    try:
        n = int(round(float(cents)))
    except (TypeError, ValueError):
        return blank
    dollars = abs(n) / 100
    body = f'{dollars:,.0f}' if compact and n % 100 == 0 else f'{dollars:,.2f}'
    return f"{MINUS if n < 0 else ''}${body}"
