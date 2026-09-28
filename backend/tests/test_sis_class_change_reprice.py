"""
A student switches classes; the bill follows.

iCreate, 2026-09-04 (98445c62): "If a student switches classes, if their current
invoice has not been paid, could that auto update the invoice with whatever new
fees apply? If the invoice has been paid and they switch classes, can we have it
auto send them a new payment for extra fees incurred or a message that they now
have a credit?"

...then, the same day (ad37b8c2): "nix the part about issuing credits. We have a
no refund no credit policy on class supply fees due to the fact that we likely
have already purchased supplies for any given class. But an auto payment if more
is due would still be good."

Until 2026-09-28 these tests held "money moves toward the school, never away
from it, once any of it has been paid": an added class became a SEPARATE charge
invoice and a dropped class changed nothing. Then iCreate (Marika), 2026-09-26:

    "Jenner Roberts dropped M/W classes... His invoice is not reflecting this
    and there appears to be two different invoices for him... They are on
    autopay and were incorrectly charged $290 this month again, even after
    dropping... They should be charged for the time he was in those classes,
    but not moving forward."

The no-refund policy was about supply fees. The rule these tests now hold, for
a part or fully paid invoice: ONE invoice; a dropped class's tuition comes off
what is still owed, its supply fee stays, nothing already paid is refunded; an
added class goes on the same invoice; and an active autopay plan's unpaid
installments are re-spread so they add up to exactly the new balance. The
nothing-paid rewrite is unchanged.
"""

from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest

from services import sis_billing_service as billing
from services import sis_pricing as pricing


ORG = 'org-1'
STUDENT = 'ada'

POTTERY = {'id': 'c-pottery', 'name': 'Pottery', 'price_cents': 20000, 'supply_fee': 15}
CHOIR = {'id': 'c-choir', 'name': 'Choir', 'price_cents': 10000, 'supply_fee': 0}


def _run(enrolled, invoice, lines, classes=(POTTERY, CHOIR)):
    """reprice_for_class_change with its four reads stubbed. Returns
    (result, update_invoice mock, create_charge mock)."""
    tables = {
        'class_enrollments': [{'class_id': c} for c in enrolled],
        'sis_invoices': [invoice] if invoice else [],
        'sis_invoice_line_items': lines,
        'org_classes': [c for c in classes],
    }

    def _table(name):
        chain = Mock()
        for m in ('select', 'eq', 'in_', 'order', 'limit'):
            getattr(chain, m).return_value = chain
        chain.execute.return_value = Mock(data=tables.get(name, []))
        return chain

    admin = Mock()
    admin.table.side_effect = _table
    with patch.object(billing, '_admin', return_value=admin), \
         patch.object(billing, '_audit'), \
         patch.object(billing, 'update_invoice',
                      return_value={'invoice': {'id': 'inv-1'}}) as upd, \
         patch.object(billing, 'create_charge',
                      return_value={'invoice': {'id': 'inv-new'}}) as charge:
        out = billing.reprice_for_class_change(ORG, STUDENT, 'molly')
    return out, upd, charge


UNPAID = {'id': 'inv-1', 'household_id': 'h1', 'status': 'sent', 'amount_paid_cents': 0}


def _line(class_id, amount, description='Pottery'):
    return {'id': f'li-{class_id}', 'class_id': class_id, 'description': description,
            'amount_cents': amount, 'quantity': 1, 'kind': 'tuition'}


@pytest.mark.unit
class TestNothingPaidYet:
    def test_a_class_they_joined_is_added_to_the_bill(self):
        _out, upd, _c = _run(['c-pottery', 'c-choir'], UNPAID, [_line('c-pottery', 21500)])
        lines = upd.call_args.kwargs['line_items']
        assert {li['class_id'] for li in lines} == {'c-pottery', 'c-choir'}

    def test_the_new_line_carries_tuition_plus_the_supply_fee(self):
        """The supply fee is the part the no-refund policy is about, so it has
        to be on the bill in the first place."""
        _out, upd, _c = _run(['c-pottery'], UNPAID, [])
        line = upd.call_args.kwargs['line_items'][0]
        assert line['amount_cents'] == 20000 + 1500

    def test_a_class_they_left_comes_off(self):
        """Nobody has parted with anything, so there is no refund to argue about."""
        _out, upd, _c = _run(['c-choir'], UNPAID,
                             [_line('c-pottery', 21500), _line('c-choir', 10000, 'Choir')])
        assert {li['class_id'] for li in upd.call_args.kwargs['line_items']} == {'c-choir'}

    def test_lines_that_are_not_a_class_survive_a_reprice(self):
        """A registration fee or a card fee is not part of a class change, and
        must not be swept off the invoice by one."""
        fee = {'id': 'li-fee', 'class_id': None, 'description': 'Registration',
               'amount_cents': 5000, 'quantity': 1, 'kind': 'registration'}
        _out, upd, _c = _run(['c-pottery', 'c-choir'], UNPAID,
                             [fee, _line('c-pottery', 21500)])
        descriptions = [li['description'] for li in upd.call_args.kwargs['line_items']]
        assert 'Registration' in descriptions
        assert 'Choir' in descriptions

    def test_nothing_happens_when_the_bill_already_matches(self):
        out, upd, charge = _run(['c-pottery'], UNPAID, [_line('c-pottery', 21500)])
        assert out['changed'] is False
        assert not upd.called and not charge.called

    def test_no_separate_charge_is_ever_created(self):
        _out, _upd, charge = _run(['c-pottery', 'c-choir'], UNPAID, [_line('c-pottery', 21500)])
        assert not charge.called


@pytest.mark.unit
class TestWhenItDoesNothing:
    def test_a_student_with_no_open_invoice_is_left_alone(self):
        out, upd, charge = _run(['c-pottery'], None, [])
        assert out == {'changed': False, 'reason': 'no open invoice'}
        assert not upd.called and not charge.called


# ── Money has landed: the whole path, against an in-memory database ──────────
#
# These run reprice_for_class_change -> update_invoice -> _recompute_invoice_status
# -> _respread_installments for real, so what they check is the rows a family's
# bill and autopay are read from, not which helper was called.

class _Query:
    def __init__(self, db, name):
        self.db, self.name = db, name
        self.filters, self.op, self.payload = [], 'select', None
        self._order, self._limit = None, None

    def select(self, *_a, **_kw):
        self.op = 'select'
        return self

    def insert(self, payload):
        self.op, self.payload = 'insert', payload
        return self

    def update(self, payload):
        self.op, self.payload = 'update', payload
        return self

    def delete(self):
        self.op = 'delete'
        return self

    def eq(self, col, val):
        self.filters.append(lambda r: r.get(col) == val)
        return self

    def neq(self, col, val):
        self.filters.append(lambda r: r.get(col) != val)
        return self

    def in_(self, col, vals):
        vals = list(vals)
        self.filters.append(lambda r: r.get(col) in vals)
        return self

    def lte(self, col, val):
        self.filters.append(lambda r: r.get(col) is not None and r.get(col) <= val)
        return self

    def order(self, col, desc=False):
        self._order = (col, desc)
        return self

    def limit(self, n):
        self._limit = n
        return self

    def execute(self):
        rows = self.db.tables.setdefault(self.name, [])
        hit = [r for r in rows if all(f(r) for f in self.filters)]
        if self.op == 'insert':
            new = self.payload if isinstance(self.payload, list) else [self.payload]
            out = []
            for row in new:
                row = dict(row)
                self.db.seq += 1
                row.setdefault('id', f'{self.name}-{self.db.seq}')
                row.setdefault('created_at', f'2026-09-28T00:00:{self.db.seq:02d}')
                if self.name == 'sis_payment_plans':
                    row.setdefault('status', 'active')
                rows.append(row)
                out.append(dict(row))
            return SimpleNamespace(data=out)
        if self.op == 'update':
            for r in hit:
                r.update(self.payload)
            return SimpleNamespace(data=[dict(r) for r in hit])
        if self.op == 'delete':
            self.db.tables[self.name] = [r for r in rows if r not in hit]
            return SimpleNamespace(data=[dict(r) for r in hit])
        if self._order:
            col, desc = self._order
            hit = sorted(hit, key=lambda r: str(r.get(col) or ''), reverse=desc)
        if self._limit is not None:
            hit = hit[:self._limit]
        return SimpleNamespace(data=[dict(r) for r in hit])


class _Db:
    def __init__(self, **tables):
        self.tables = {k: [dict(r) for r in v] for k, v in tables.items()}
        self.seq = 0

    def table(self, name):
        return _Query(self, name)

    def rows(self, name, **where):
        return [r for r in self.tables.get(name, [])
                if all(r.get(k) == v for k, v in where.items())]


# The Roberts invoice, shaped like Marika's: $3,425 of classes less a $525
# discount is $2,900, on ten monthly autopay installments of $290, two paid.
# Two of the classes are the M/W ones he dropped.
MW_ART = {'id': 'c-mw-art', 'name': 'M/W Art', 'price_cents': 150000, 'supply_fee': 75}
MW_LAB = {'id': 'c-mw-lab', 'name': 'M/W Lab', 'price_cents': 36500, 'supply_fee': 25}
TTH = {'id': 'c-tth', 'name': 'T/Th Studio', 'price_cents': 140000, 'supply_fee': 60}
DRAMA = {'id': 'c-drama', 'name': 'Drama', 'price_cents': 30000, 'supply_fee': 20}
CLASSES = [MW_ART, MW_LAB, TTH, DRAMA]


def _tuition(c, inv='inv-r'):
    return {'id': f"li-{c['id']}", 'invoice_id': inv, 'class_id': c['id'],
            'description': c['name'], 'amount_cents': c['price_cents'],
            'quantity': 1, 'kind': 'tuition'}


def _supply(c, inv='inv-r'):
    return {'id': f"li-{c['id']}-s", 'invoice_id': inv, 'class_id': c['id'],
            'description': f"{c['name']} — supplies",
            'amount_cents': int(round(c['supply_fee'] * 100)), 'quantity': 1, 'kind': 'supply'}


def _roberts(enrolled, *, paid_installments=2, plan=True, paid_cents=None,
             lines=None, extra_invoices=()):
    lines = lines if lines is not None else [
        _tuition(MW_ART), _supply(MW_ART), _tuition(MW_LAB), _supply(MW_LAB),
        _tuition(TTH), _supply(TTH)]
    subtotal = sum(li['amount_cents'] for li in lines)
    total = subtotal - 52500
    paid = paid_cents if paid_cents is not None else 29000 * paid_installments
    invoice = {'id': 'inv-r', 'organization_id': ORG, 'student_user_id': STUDENT,
               'household_id': 'h-roberts', 'invoice_number': 'INV-2026-R0B3R7',
               'status': 'paid' if paid >= total else ('partial' if paid else 'sent'),
               'subtotal_cents': subtotal, 'discount_cents': 52500, 'total_cents': total,
               'amount_paid_cents': paid, 'processing_fee_cents': 0,
               'created_at': '2026-08-01T00:00:00'}
    installments, payments = [], []
    plans = []
    if plan:
        plans = [{'id': 'plan-r', 'invoice_id': 'inv-r', 'cadence': 'monthly',
                  'installment_count': 10, 'status': 'active', 'auto_charge': True}]
        for n in range(10):
            installments.append({
                'id': f'inst-{n}', 'payment_plan_id': 'plan-r',
                'due_date': f'2026-{8 + n:02d}-15' if n < 5 else f'2027-{n - 4:02d}-15',
                'amount_cents': 29000,
                'status': 'paid' if n < paid_installments else 'scheduled'})
        payments = [{'id': f'pay-{n}', 'invoice_id': 'inv-r', 'amount_cents': 29000}
                    for n in range(paid_installments)]
    elif paid:
        payments = [{'id': 'pay-full', 'invoice_id': 'inv-r', 'amount_cents': paid}]
    return _Db(
        class_enrollments=[{'student_id': STUDENT, 'class_id': c, 'status': 'active'}
                           for c in enrolled],
        sis_invoices=[invoice, *extra_invoices],
        sis_invoice_line_items=lines,
        org_classes=CLASSES,
        sis_payment_plans=plans,
        sis_installments=installments,
        sis_payment_records=payments,
        sis_billing_audit=[],
    )


def _reprice(db):
    with patch.object(billing, '_admin', return_value=db), \
         patch.object(billing, 'notify_family_of_invoice_change') as notify, \
         patch.object(billing, 'email_invoice_to_family') as email, \
         patch.object(billing, 'create_charge') as charge:
        out = billing.reprice_for_class_change(ORG, STUDENT, 'marika')
    return out, SimpleNamespace(notify=notify, email=email, charge=charge)


def _unpaid(db):
    return sorted((i for i in db.rows('sis_installments')
                   if i['status'] in ('scheduled', 'due', 'late')),
                  key=lambda i: i['due_date'])


def _invoice(db):
    return db.rows('sis_invoices', id='inv-r')[0]


def _audit(db, action):
    return [a for a in db.rows('sis_billing_audit') if a['action'] == action]


@pytest.mark.unit
class TestADroppedClassOnAPaidInvoice:
    """Marika, 2026-09-26: "They should be charged for the time he was in those
    classes, but not moving forward." """

    def test_the_roberts_bill_drops_to_what_is_still_owed_for_the_classes_he_kept(self):
        db = _roberts(['c-tth'])
        out, _ = _reprice(db)
        assert out['changed'] is True
        inv = _invoice(db)
        # $3,425 - $1,500 - $365 tuition = $1,560, less the $525 discount.
        assert inv['subtotal_cents'] == 156000
        assert inv['total_cents'] == 103500
        assert inv['amount_paid_cents'] == 58000
        assert inv['status'] == 'partial'

    def test_the_eight_remaining_autopay_charges_add_up_to_the_new_balance(self):
        """Not $290 again: $455 left, over the eight months still scheduled."""
        db = _roberts(['c-tth'])
        _reprice(db)
        amounts = [i['amount_cents'] for i in _unpaid(db)]
        assert len(amounts) == 8
        assert sum(amounts) == 103500 - 58000
        assert amounts == [5688] * 4 + [5687] * 4

    def test_the_two_installments_already_paid_are_not_touched(self):
        db = _roberts(['c-tth'])
        _reprice(db)
        paid = [i for i in db.rows('sis_installments') if i['status'] == 'paid']
        assert [i['amount_cents'] for i in paid] == [29000, 29000]
        assert len(db.rows('sis_payment_records')) == 2

    def test_the_supply_fees_stay_on_the_bill(self):
        """"no refund no credit policy on class supply fees" (ad37b8c2)."""
        db = _roberts(['c-tth'])
        _reprice(db)
        lines = db.rows('sis_invoice_line_items', invoice_id='inv-r')
        supply = {li['class_id']: li['amount_cents'] for li in lines if li['kind'] == 'supply'}
        assert supply['c-mw-art'] == 7500
        assert supply['c-mw-lab'] == 2500
        tuition = {li['class_id'] for li in lines if li['kind'] == 'tuition'}
        assert tuition == {'c-tth'}

    def test_one_invoice_no_second_bill(self):
        """"there appears to be two different invoices for him" """
        db = _roberts(['c-tth'])
        _out, calls = _reprice(db)
        assert len(db.rows('sis_invoices')) == 1
        assert not calls.charge.called

    def test_the_change_is_audited_with_before_and_after(self):
        db = _roberts(['c-tth'])
        _reprice(db)
        (entry,) = _audit(db, 'class_change_repriced')
        d = entry['detail']
        assert d['removed'] == ['c-mw-art', 'c-mw-lab'] and d['added'] == []
        assert d['from_total_cents'] == 290000 and d['to_total_cents'] == 103500
        assert d['installments_before'] == [29000] * 8
        assert sum(d['installments_after']) == 45500
        assert d['floored_at_paid_cents'] == 0
        assert _audit(db, 'invoice_edited')
        assert db.rows('sis_quickbooks_sync_log', entity_id='inv-r')

    def test_the_family_is_told_their_bill_went_down(self):
        db = _roberts(['c-tth'])
        _out, calls = _reprice(db)
        assert calls.notify.called

    def test_running_it_again_changes_nothing(self):
        """The kept supply lines still name the dropped classes; they must not
        read as classes to drop a second time."""
        db = _roberts(['c-tth'])
        _reprice(db)
        out, _ = _reprice(db)
        assert out == {'changed': False, 'reason': 'already matches'}


@pytest.mark.unit
class TestNeverBelowWhatWasPaid:
    def test_the_total_stops_at_what_was_paid_and_nothing_is_refunded(self):
        """$2,500 paid, and the kept classes come to $1,035: the bill settles at
        $2,500 and the $1,465 is recorded for the office, not refunded."""
        db = _roberts(['c-tth'], plan=False, paid_cents=250000)
        out, _ = _reprice(db)
        inv = _invoice(db)
        assert inv['total_cents'] == 250000
        assert inv['status'] == 'paid'
        assert out['floored_at_paid_cents'] == 146500
        lines = db.rows('sis_invoice_line_items', invoice_id='inv-r')
        assert sum(li['amount_cents'] for li in lines) - inv['discount_cents'] == 250000
        (floor_line,) = [li for li in lines if li['kind'] == 'other']
        assert 'withdrawing' in floor_line['description']
        assert _audit(db, 'class_change_repriced')[0]['detail']['floored_at_paid_cents'] == 146500

    def test_a_plan_with_nothing_left_to_collect_is_completed(self):
        db = _roberts(['c-tth'], paid_installments=4)  # $1,160 paid > $1,035
        _reprice(db)
        assert _invoice(db)['total_cents'] == 116000
        assert _unpaid(db) == []
        assert db.rows('sis_payment_plans')[0]['status'] == 'completed'


@pytest.mark.unit
class TestAnAddedClassOnAPaidInvoice:
    """Until 2026-09-28 this was billed as a separate charge invoice. That is
    the second invoice a family could not make sense of; the class now goes on
    the bill they already have."""

    def test_it_goes_on_the_same_invoice_as_tuition_and_supply_lines(self):
        db = _roberts(['c-mw-art', 'c-mw-lab', 'c-tth', 'c-drama'])
        out, calls = _reprice(db)
        assert out['changed'] is True
        assert len(db.rows('sis_invoices')) == 1
        assert not calls.charge.called
        drama = [li for li in db.rows('sis_invoice_line_items', invoice_id='inv-r')
                 if li['class_id'] == 'c-drama']
        assert sorted((li['kind'], li['amount_cents']) for li in drama) == [
            ('supply', 2000), ('tuition', 30000)]
        assert _invoice(db)['total_cents'] == 290000 + 32000

    def test_the_remaining_installments_rise_to_cover_it(self):
        db = _roberts(['c-mw-art', 'c-mw-lab', 'c-tth', 'c-drama'])
        _reprice(db)
        amounts = [i['amount_cents'] for i in _unpaid(db)]
        assert len(amounts) == 8
        assert sum(amounts) == 290000 + 32000 - 58000
        assert amounts[0] == 33000

    def test_with_autopay_running_no_extra_email_is_sent(self):
        """Autopay collects it; the in-app notice says the bill went up."""
        db = _roberts(['c-mw-art', 'c-mw-lab', 'c-tth', 'c-drama'])
        _out, calls = _reprice(db)
        assert calls.notify.called
        assert not calls.email.called

    def test_paid_in_full_with_no_plan_reopens_and_emails_the_family(self):
        db = _roberts(['c-mw-art', 'c-mw-lab', 'c-tth', 'c-drama'],
                      plan=False, paid_cents=290000)
        out, calls = _reprice(db)
        inv = _invoice(db)
        assert inv['status'] == 'partial'
        assert billing.amount_due_cents(inv) == 32000
        assert out['installments'] is None
        calls.email.assert_called_once_with(ORG, 'inv-r')

    def test_a_plan_with_no_installments_left_gets_no_new_charge_invented(self):
        """The difference stays on the invoice for the family to pay, and the
        audit tells the office, rather than a card charge nobody scheduled."""
        db = _roberts(['c-mw-art', 'c-mw-lab', 'c-tth', 'c-drama'], paid_installments=10,
                      paid_cents=290000)
        out, calls = _reprice(db)
        assert out['installments']['no_installments_left'] is True
        assert len(db.rows('sis_installments')) == 10
        assert billing.amount_due_cents(_invoice(db)) == 32000
        calls.email.assert_called_once()
        assert _audit(db, 'class_change_repriced')[0]['detail']['no_installments_left'] is True

    def test_a_class_dropped_and_taken_again_does_not_buy_supplies_twice(self):
        db = _roberts(['c-tth'])
        _reprice(db)
        db.tables['class_enrollments'].append(
            {'student_id': STUDENT, 'class_id': 'c-mw-lab', 'status': 'active'})
        _reprice(db)
        lab = [li for li in db.rows('sis_invoice_line_items', invoice_id='inv-r')
               if li['class_id'] == 'c-mw-lab']
        assert sorted(li['kind'] for li in lab) == ['supply', 'tuition']

    def test_an_old_separate_charge_invoice_is_not_mistaken_for_the_tuition_bill(self):
        """Pre-2026-09-28 class-change charges are newer than the tuition
        invoice and name no class. Reading one as "the" invoice would bill
        every class again."""
        legacy = {'id': 'inv-charge', 'organization_id': ORG, 'student_user_id': STUDENT,
                  'household_id': 'h-roberts', 'status': 'paid', 'subtotal_cents': 32000,
                  'discount_cents': 0, 'total_cents': 32000, 'amount_paid_cents': 32000,
                  'created_at': '2026-09-10T00:00:00'}
        db = _roberts(['c-tth'], extra_invoices=[legacy])
        db.tables['sis_invoice_line_items'].append(
            {'id': 'li-legacy', 'invoice_id': 'inv-charge', 'class_id': None,
             'description': 'Class change: Drama', 'amount_cents': 32000,
             'quantity': 1, 'kind': 'tuition'})
        _reprice(db)
        assert _invoice(db)['total_cents'] == 103500
        assert db.rows('sis_invoices', id='inv-charge')[0]['total_cents'] == 32000


@pytest.mark.unit
class TestWhatThePaidPathLeavesAlone:
    def test_a_flat_plan_invoice_is_left_for_the_office(self):
        """A flat annual tuition line does not move with one class; taking a
        share off or adding a class at full price would both be wrong."""
        lines = [{'id': 'li-flat', 'invoice_id': 'inv-r', 'class_id': None,
                  'description': 'Annual tuition', 'amount_cents': 475000,
                  'quantity': 1, 'kind': 'tuition'}, _supply(TTH)]
        db = _roberts(['c-tth', 'c-drama'], lines=lines)
        out, _ = _reprice(db)
        assert out['changed'] is False
        assert 'by hand' in out['reason']
        assert _invoice(db)['subtotal_cents'] == 475000 + 6000

    def test_a_legacy_combined_line_keeps_its_supply_part_when_dropped(self):
        """The pre-2026-09-28 reprice wrote tuition + supply as one amount."""
        combined = dict(_tuition(DRAMA), amount_cents=32000)
        db = _roberts(['c-mw-art', 'c-mw-lab', 'c-tth'],
                      lines=[_tuition(MW_ART), _supply(MW_ART), _tuition(MW_LAB),
                             _supply(MW_LAB), _tuition(TTH), _supply(TTH), combined])
        _reprice(db)
        drama = [li for li in db.rows('sis_invoice_line_items', invoice_id='inv-r')
                 if li['class_id'] == 'c-drama']
        assert [(li['kind'], li['amount_cents']) for li in drama] == [('supply', 2000)]

    def test_the_discount_is_kept_and_clamped_to_the_new_subtotal(self):
        db = _roberts(['c-tth'])
        _reprice(db)
        assert _invoice(db)['discount_cents'] == 52500


@pytest.mark.unit
class TestTheOfficeEditingByHand:
    """Marika will fix the Roberts bill in the console. An edit of a partly
    paid invoice on autopay has to leave the remaining charges right, or the
    card goes on being charged the old amount."""

    def _edit(self, db, lines, discount=None):
        with patch.object(billing, '_admin', return_value=db), \
             patch.object(billing, 'notify_family_of_invoice_change'):
            return billing.update_invoice(ORG, 'inv-r', 'marika', line_items=lines,
                                          discount_cents=discount)

    def test_removing_the_dropped_tuition_re_spreads_the_remaining_installments(self):
        db = _roberts(['c-tth'])
        kept = [li for li in db.rows('sis_invoice_line_items', invoice_id='inv-r')
                if not (li['kind'] == 'tuition' and li['class_id'] in ('c-mw-art', 'c-mw-lab'))]
        out = self._edit(db, kept)
        assert _invoice(db)['total_cents'] == 103500
        assert sum(i['amount_cents'] for i in _unpaid(db)) == 45500
        assert out['installments']['after'] == [5688] * 4 + [5687] * 4
        (entry,) = _audit(db, 'invoice_edited')
        assert entry['detail']['installments']['before'] == [29000] * 8

    def test_an_edit_that_does_not_move_the_balance_leaves_the_cents_alone(self):
        """A description fix is not a reason to reshuffle anybody's schedule."""
        db = _roberts(['c-mw-art', 'c-mw-lab', 'c-tth'])
        db.tables['sis_installments'][5]['amount_cents'] = 29001
        db.tables['sis_installments'][6]['amount_cents'] = 28999
        lines = db.rows('sis_invoice_line_items', invoice_id='inv-r')
        lines[0] = dict(lines[0], description='M/W Art (renamed)')
        self._edit(db, lines)
        assert db.rows('sis_installments', id='inst-5')[0]['amount_cents'] == 29001

    def test_a_late_installment_is_part_of_the_re_spread(self):
        db = _roberts(['c-tth'])
        db.tables['sis_installments'][2]['status'] = 'late'
        kept = [li for li in db.rows('sis_invoice_line_items', invoice_id='inv-r')
                if not (li['kind'] == 'tuition' and li['class_id'] in ('c-mw-art', 'c-mw-lab'))]
        self._edit(db, kept)
        assert sum(i['amount_cents'] for i in _unpaid(db)) == 45500

    def test_an_invoice_without_a_plan_reports_no_installments(self):
        db = _roberts(['c-tth'], plan=False, paid_cents=58000)
        out = self._edit(db, db.rows('sis_invoice_line_items', invoice_id='inv-r')[:2])
        assert out['installments'] is None


@pytest.mark.unit
class TestRounding:
    @pytest.mark.parametrize('balance,count', [(45500, 8), (100001, 3), (1, 7), (32000, 8)])
    def test_the_re_spread_sums_exactly_to_the_balance(self, balance, count):
        amounts = pricing.split_amount(balance, count)
        assert sum(amounts) == balance
        assert max(amounts) - min(amounts) <= 1
        # Same convention the plan was built with: remainder cents come first.
        assert amounts == sorted(amounts, reverse=True)
