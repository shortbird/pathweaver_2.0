"""
A class's supply expense log: what a teacher has spent against the class's
supply budget.

Ticket e7a50b4b (iCreate, advisor on /my-classes/<id>): "I would like to see
what I have spent on each class supply budget already/how much I have left."

The budget's spend used to come only from supply_request / reimbursement form
submissions. Requests were retired into tasks on 2026-09-24, so nothing has
counted against a budget since and the card could only ever say "up to $X".
This log is where spend is written down now; sis_supply_budget_service adds it
to what the retired requests still say.

Who may write:

  * the class's teachers (primary, assistant, class_advisors) for their own
    class, and only the entries they created;
  * the front office (the ADMIN_ROLES tier: org admin, campus coordinator,
    superadmin) for every class and every entry.

The office tier is ADMIN_ROLES and not FINANCE_ROLES on purpose. FINANCE_ROLES
guards tuition, invoices, Stripe and pay rates. A supply receipt is none of
those: it is class materials bookkeeping, the budget figure it counts against
is already shown to coordinators, and a coordinator runs the classes. Supply
spend is not pay, so sis_staff_service.PAY_FIELDS does not apply.
"""

from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from repositories.sis_class_supply_expense_repository import SisClassSupplyExpenseRepository
from utils.timestamps import now_iso

MAX_DESCRIPTION = 200
# A sanity ceiling, not a policy: $100,000 on one line is a typo.
MAX_AMOUNT_CENTS = 10_000_000


def _repo() -> SisClassSupplyExpenseRepository:
    return SisClassSupplyExpenseRepository()


# ── Pure rules (unit-tested) ─────────────────────────────────────────────────

def parse_fields(data: Dict[str, Any], partial: bool = False) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """(fields, error) from a request body.

    `amount` is dollars as the teacher types it ("12.50" or 12.5);
    `amount_cents` is accepted too. `description` is what was bought.
    `spent_on` is YYYY-MM-DD and defaults to today. With `partial`, only the
    keys present are checked and returned (an edit).
    """
    data = data or {}
    out: Dict[str, Any] = {}

    if 'amount_cents' in data or 'amount' in data or not partial:
        cents: Any = None
        if 'amount_cents' in data:
            cents = data.get('amount_cents')
            if isinstance(cents, bool) or not isinstance(cents, int):
                return None, 'Amount must be a whole number of cents'
        else:
            raw = data.get('amount')
            try:
                if isinstance(raw, bool) or raw is None or str(raw).strip() == '':
                    raise ValueError
                cents = int(round(float(str(raw).replace('$', '').replace(',', '').strip()) * 100))
            except (TypeError, ValueError):
                return None, 'Enter an amount, like 12.50'
        if cents <= 0:
            return None, 'Amount must be more than $0'
        if cents > MAX_AMOUNT_CENTS:
            return None, 'That amount is too large'
        out['amount_cents'] = cents

    if 'description' in data or not partial:
        desc = (data.get('description') or '')
        desc = desc.strip() if isinstance(desc, str) else ''
        if not desc:
            return None, 'Say what you bought'
        if len(desc) > MAX_DESCRIPTION:
            return None, f'Keep the description under {MAX_DESCRIPTION} characters'
        out['description'] = desc

    if 'spent_on' in data or not partial:
        raw = data.get('spent_on')
        if raw in (None, ''):
            if partial:
                return None, 'Date must be YYYY-MM-DD'
            out['spent_on'] = date.today().isoformat()
        else:
            try:
                out['spent_on'] = date.fromisoformat(str(raw)[:10]).isoformat()
            except (TypeError, ValueError):
                return None, 'Date must be YYYY-MM-DD'

    if partial and not out:
        return None, 'Nothing to change'
    return out, None


def may_change(entry: Dict[str, Any], caller_id: str, is_office: bool) -> bool:
    """The office changes any entry; a teacher only the ones they wrote."""
    return bool(is_office or (caller_id and entry.get('created_by') == caller_id))


def describe(entry: Dict[str, Any], caller_id: Optional[str] = None,
             is_office: bool = False) -> Dict[str, Any]:
    cents = int(entry.get('amount_cents') or 0)
    return {
        'id': entry.get('id'),
        'class_id': entry.get('class_id'),
        'amount_cents': cents,
        'amount': round(cents / 100, 2),
        'description': entry.get('description') or '',
        'spent_on': str(entry.get('spent_on') or '')[:10],
        'created_by': entry.get('created_by'),
        'created_at': entry.get('created_at'),
        'can_edit': may_change(entry, caller_id or '', is_office),
    }


def logged_by_class(rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """{class_id: {spent, items}} from log rows. `spent` is dollars; items are
    newest first, because the list is read to answer "what did I just add"."""
    out: Dict[str, Dict[str, Any]] = {}
    for r in rows or []:
        slot = out.setdefault(r['class_id'], {'cents': 0, 'items': []})
        slot['cents'] += int(r.get('amount_cents') or 0)
        slot['items'].append(describe(r))
    for slot in out.values():
        slot['items'].sort(key=lambda i: (i['spent_on'], i.get('created_at') or ''), reverse=True)
        slot['spent'] = round(slot.pop('cents') / 100, 2)
    return out


# ── DB-backed ────────────────────────────────────────────────────────────────

def for_classes(org_id: str, class_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    return logged_by_class(_repo().for_classes(org_id, class_ids))


def add(org_id: str, class_id: str, caller_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    fields, err = parse_fields(data)
    if err or fields is None:
        return {'error': err or 'Invalid expense', 'status': 400}
    row = _repo().insert({**fields, 'organization_id': org_id, 'class_id': class_id,
                          'created_by': caller_id})
    return {'expense': describe(row, caller_id, True)}


def _owned_entry(org_id: str, class_id: str, expense_id: str, caller_id: str,
                 is_office: bool) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """(entry, error) -- the entry when it is this class's, in this org, and
    the caller may change it."""
    entry = _repo().entry(expense_id)
    if not entry or entry.get('organization_id') != org_id or entry.get('class_id') != class_id:
        return None, {'error': 'Expense not found', 'status': 404}
    if not may_change(entry, caller_id, is_office):
        return None, {'error': 'Only the person who added this expense can change it',
                      'status': 403}
    return entry, None


def edit(org_id: str, class_id: str, expense_id: str, caller_id: str,
         is_office: bool, data: Dict[str, Any]) -> Dict[str, Any]:
    entry, err = _owned_entry(org_id, class_id, expense_id, caller_id, is_office)
    if err or entry is None:
        return err or {'error': 'Expense not found', 'status': 404}
    fields, msg = parse_fields(data, partial=True)
    if msg or fields is None:
        return {'error': msg or 'Nothing to change', 'status': 400}
    row = _repo().update_entry(expense_id, {**fields, 'updated_at': now_iso()}) \
        or {**entry, **fields}
    return {'expense': describe(row, caller_id, is_office)}


def remove(org_id: str, class_id: str, expense_id: str, caller_id: str,
           is_office: bool) -> Dict[str, Any]:
    _, err = _owned_entry(org_id, class_id, expense_id, caller_id, is_office)
    if err:
        return err
    _repo().delete_entry(expense_id)
    return {'deleted': expense_id}
