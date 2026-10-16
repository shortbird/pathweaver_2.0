"""
"Included with" another class, so a bundled program does not double-bill.

Apogee NoCo, 2026-10-16: the Hybrid Program ($4,950, $500 supplies) includes
SPARK Friday Excursions ($1,450, $150) and Life Skills ($2,950, $500). Hybrid
students are enrolled in all three for rosters, the roll and the class chats,
and To invoice billed all three. Families who take SPARK or Life Skills alone
must still pay those prices.

The rule is sis_tuition_service.included_with, and every place a student's
tuition is worked out asks it: the quote (the parent builder, the invoice seed,
the To invoice queue), the class-change reprice, the registration cart and the
supply budget.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_tuition_service as tuition
from services import sis_billing_service as billing
from services import sis_supply_budget_service as budget


HYBRID = {'class_id': 'c-hybrid', 'name': 'Hybrid Program', 'price_cents': 495000,
          'supply_fee_cents': 50000, 'meetings': [], 'included_with_class_ids': []}
SPARK = {'class_id': 'c-spark', 'name': 'SPARK Friday Excursions', 'price_cents': 145000,
         'supply_fee_cents': 15000, 'meetings': [], 'included_with_class_ids': ['c-hybrid']}
LIFE = {'class_id': 'c-life', 'name': 'Apogee Enrichments - Life Skills', 'price_cents': 295000,
        'supply_fee_cents': 50000, 'meetings': [], 'included_with_class_ids': ['c-hybrid']}


def _quote(classes, **kw):
    return tuition.schedule_quote(classes, time_blocks=kw.get('time_blocks'),
                                  block_pricing=kw.get('block_pricing'), tuition_plan=None)


@pytest.mark.unit
class TestTheRule:
    def test_a_class_is_included_when_the_student_is_in_what_pays_for_it(self):
        covered = tuition.included_with([HYBRID, SPARK, LIFE])
        assert set(covered) == {'c-spark', 'c-life'}
        assert covered['c-spark']['name'] == 'Hybrid Program'

    def test_a_student_who_takes_it_alone_pays_for_it(self):
        assert tuition.included_with([SPARK]) == {}
        assert tuition.included_with([SPARK, LIFE]) == {}

    def test_the_paying_class_is_never_itself_free(self):
        assert 'c-hybrid' not in tuition.included_with([HYBRID, SPARK])

    def test_a_loop_already_stored_bills_in_full_rather_than_nothing(self):
        a = {'class_id': 'a', 'name': 'A', 'included_with_class_ids': ['b']}
        b = {'class_id': 'b', 'name': 'B', 'included_with_class_ids': ['a']}
        assert tuition.included_with([a, b]) == {}

    def test_a_chain_of_programs_is_followed(self):
        mini = {'class_id': 'c-mini', 'name': 'Mini', 'included_with_class_ids': ['c-spark']}
        assert set(tuition.included_with([HYBRID, SPARK, mini])) == {'c-spark', 'c-mini'}

    def test_a_row_without_the_column_is_included_with_nothing(self):
        """A database the migration has not reached yet."""
        bare = {k: v for k, v in SPARK.items() if k != 'included_with_class_ids'}
        assert tuition.included_with([HYBRID, bare]) == {}


@pytest.mark.unit
class TestTheQuote:
    def test_a_hybrid_student_pays_for_hybrid_only(self):
        q = _quote([HYBRID, SPARK, LIFE])
        assert q['total_cents'] == 495000 + 50000
        assert q['tuition_cents'] == 495000
        assert q['supply_cents'] == 50000

    def test_the_included_classes_are_zero_lines_that_say_why(self):
        q = _quote([HYBRID, SPARK, LIFE])
        zero = [li for li in q['lines'] if li['amount_cents'] == 0]
        assert {li['class_id'] for li in zero} == {'c-spark', 'c-life'}
        spark = next(li for li in zero if li['class_id'] == 'c-spark')
        assert spark['description'] == 'SPARK Friday Excursions (included with Hybrid Program)'
        assert spark['kind'] == 'tuition'
        assert all(tuition.is_included_line(li) for li in zero)

    def test_no_supply_line_for_an_included_class(self):
        q = _quote([HYBRID, SPARK, LIFE])
        supply = [li for li in q['lines'] if li['kind'] == 'supply']
        assert [li['class_id'] for li in supply] == ['c-hybrid']

    def test_spark_alone_is_full_price_with_its_supplies(self):
        q = _quote([SPARK])
        assert q['total_cents'] == 145000 + 15000
        assert {(li['kind'], li['amount_cents']) for li in q['lines']} == {('tuition', 145000), ('supply', 15000)}
        assert q['included'] == []

    def test_the_quote_names_the_included_classes(self):
        q = _quote([HYBRID, SPARK])
        assert q['included'] == [{'class_id': 'c-spark', 'included_with_class_id': 'c-hybrid',
                                  'included_with_name': 'Hybrid Program'}]
        assert q['class_count'] == 2

    def test_an_included_class_does_not_push_a_block_tier(self):
        blocks = [{'start': '09:00', 'end': '10:00'}]
        hyb = {**HYBRID, 'billing_blocks': 1}
        spk = {**SPARK, 'billing_blocks': 3}
        pricing = {'tiers': [{'blocks': 1, 'year_cents': 400000}, {'blocks': 4, 'year_cents': 500000}]}
        q = _quote([hyb, spk], time_blocks=blocks, block_pricing=pricing)
        assert q['blocks'] == 1
        assert q['tuition_cents'] == 400000

    def test_the_invoice_seed_is_the_quote(self):
        lines = tuition.seed_line_items([HYBRID, SPARK, LIFE], None, None, None)
        assert sum(li['amount_cents'] for li in lines) == 495000 + 50000

    def test_catalog_payloads_carry_the_list_to_the_quote(self):
        rows = tuition.quote_classes([{'id': 'c-spark', 'name': 'SPARK', 'price_cents': 1,
                                       'supply_fee': '1.50', 'included_with_class_ids': ['c-hybrid']}])
        assert rows[0]['included_with_class_ids'] == ['c-hybrid']


ORG_CLASSES = [{'id': 'c-hybrid', 'included_with_class_ids': []},
               {'id': 'c-spark', 'included_with_class_ids': ['c-hybrid']},
               {'id': 'c-life', 'included_with_class_ids': []}]


@pytest.mark.unit
class TestValidation:
    def test_a_class_of_the_same_school_is_accepted(self):
        assert tuition.validate_included_with('c-life', ['c-hybrid'], ORG_CLASSES) is None

    def test_not_itself(self):
        assert 'itself' in tuition.validate_included_with('c-life', ['c-life'], ORG_CLASSES)

    def test_not_another_schools_class(self):
        assert 'not in this school' in tuition.validate_included_with('c-life', ['c-elsewhere'], ORG_CLASSES)

    def test_not_a_loop(self):
        err = tuition.validate_included_with('c-hybrid', ['c-spark'], ORG_CLASSES)
        assert err and 'already included with this one' in err

    def test_not_a_longer_loop(self):
        classes = ORG_CLASSES + [{'id': 'c-mini', 'included_with_class_ids': ['c-spark']}]
        assert tuition.validate_included_with('c-hybrid', ['c-mini'], classes)

    def test_a_list_of_ids_only(self):
        assert tuition.validate_included_with('c-life', 'c-hybrid', ORG_CLASSES)
        assert tuition.validate_included_with('c-life', [7], ORG_CLASSES)

    def test_a_new_class_is_checked_for_school_but_cannot_loop(self):
        assert tuition.validate_included_with(None, ['c-hybrid'], ORG_CLASSES) is None
        assert tuition.validate_included_with(None, ['c-x'], ORG_CLASSES)


# ── The class-change reprice ─────────────────────────────────────────────────

ROW_HYBRID = {'id': 'c-hybrid', 'name': 'Hybrid Program', 'price_cents': 495000,
              'supply_fee': 500, 'included_with_class_ids': []}
ROW_SPARK = {'id': 'c-spark', 'name': 'SPARK Friday Excursions', 'price_cents': 145000,
             'supply_fee': 150, 'included_with_class_ids': ['c-hybrid']}


def _reprice(enrolled, invoice, lines, classes=(ROW_HYBRID, ROW_SPARK)):
    tables = {
        'class_enrollments': [{'class_id': c} for c in enrolled],
        'sis_invoices': [invoice],
        'sis_invoice_line_items': lines,
        'org_classes': list(classes),
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
         patch.object(billing, 'email_invoice_to_family'), \
         patch.object(billing, 'update_invoice',
                      return_value={'invoice': {'id': 'inv-1'}}) as upd:
        out = billing.reprice_for_class_change('org-1', 'kid', 'staff')
    return out, upd


UNPAID = {'id': 'inv-1', 'status': 'sent', 'amount_paid_cents': 0}
PAID = {'id': 'inv-1', 'status': 'partial', 'amount_paid_cents': 100000, 'total_cents': 545000}


def _li(cid, amount, desc, kind='tuition'):
    return {'id': f'li-{cid}-{kind}', 'class_id': cid, 'description': desc,
            'amount_cents': amount, 'quantity': 1, 'kind': kind}


HYBRID_LINES = [_li('c-hybrid', 495000, 'Hybrid Program'),
                _li('c-hybrid', 50000, 'Hybrid Program — supplies', 'supply')]
SPARK_INCLUDED = _li('c-spark', 0, 'SPARK Friday Excursions (included with Hybrid Program)')


@pytest.mark.unit
class TestReprice:
    def test_joining_an_included_class_adds_a_zero_line(self):
        _out, upd = _reprice(['c-hybrid', 'c-spark'], UNPAID, HYBRID_LINES)
        lines = upd.call_args.kwargs['line_items']
        spark = [li for li in lines if li['class_id'] == 'c-spark']
        assert [li['amount_cents'] for li in spark] == [0]
        assert 'included with Hybrid Program' in spark[0]['description']

    def test_an_included_class_already_on_the_bill_matches(self):
        out, upd = _reprice(['c-hybrid', 'c-spark'], UNPAID, HYBRID_LINES + [SPARK_INCLUDED])
        assert out['changed'] is False
        assert not upd.called

    def test_leaving_the_program_bills_the_class_in_full(self):
        _out, upd = _reprice(['c-spark'], UNPAID, HYBRID_LINES + [SPARK_INCLUDED])
        lines = upd.call_args.kwargs['line_items']
        assert [li['class_id'] for li in lines] == ['c-spark']
        assert lines[0]['amount_cents'] == 145000 + 15000

    def test_joining_the_program_takes_the_class_price_off(self):
        spark_full = [_li('c-spark', 160000, 'SPARK Friday Excursions')]
        _out, upd = _reprice(['c-hybrid', 'c-spark'], UNPAID, spark_full)
        lines = upd.call_args.kwargs['line_items']
        spark = [li for li in lines if li['class_id'] == 'c-spark']
        assert [li['amount_cents'] for li in spark] == [0]

    def test_paid_joining_an_included_class_adds_a_zero_line(self):
        _out, upd = _reprice(['c-hybrid', 'c-spark'], PAID, HYBRID_LINES)
        lines = upd.call_args.kwargs['line_items']
        spark = [li for li in lines if li['class_id'] == 'c-spark']
        assert [(li['amount_cents'], li['kind']) for li in spark] == [(0, 'tuition')]

    def test_paid_leaving_the_program_bills_the_class(self):
        _out, upd = _reprice(['c-spark'], PAID, HYBRID_LINES + [SPARK_INCLUDED])
        lines = upd.call_args.kwargs['line_items']
        spark = sorted((li['kind'], li['amount_cents']) for li in lines if li['class_id'] == 'c-spark')
        assert spark == [('supply', 15000), ('tuition', 145000)]
        assert not any(tuition.is_included_line(li) for li in lines)


# ── The registration cart ────────────────────────────────────────────────────

@pytest.mark.unit
class TestRegistrationCart:
    def _items(self):
        return [{'class_id': 'c-hybrid', 'price_snapshot_cents': 495000},
                {'class_id': 'c-spark', 'price_snapshot_cents': 145000}]

    def test_an_included_class_in_the_cart_is_priced_at_zero(self):
        reg = {'id': 'r1', 'student_user_id': 'kid', 'household_id': None}
        with patch.object(billing, '_registration', return_value=reg), \
             patch.object(billing, '_registration_items', return_value=self._items()), \
             patch.object(billing, '_included_for',
                          return_value={'c-spark': ROW_HYBRID}), \
             patch.object(billing, '_admin') as admin, \
             patch.object(billing, 'list_discount_rules', return_value=[]), \
             patch.object(billing.pricing, 'build_quote', side_effect=lambda p, r, c: {'prices': p}):
            admin.return_value.table.return_value.select.return_value.eq.return_value \
                .eq.return_value.execute.return_value = Mock(data=[])
            q = billing.quote_for_registration('org-1', 'r1')
        assert q['prices'] == [495000, 0]


# ── The supply budget ────────────────────────────────────────────────────────

@pytest.mark.unit
class TestSupplyBudget:
    def test_included_students_are_counted_from_enrollments(self):
        spark = {'id': 'c-spark', 'name': 'SPARK', 'supply_fee': 150,
                 'included_with_class_ids': ['c-hybrid']}
        students = {'c-spark': {'a', 'b'}, 'c-hybrid': {'a'}}
        repo = 'repositories.sis_class_repository.SisClassRepository'
        with patch.object(budget, '_admin', return_value=Mock()), \
             patch(f'{repo}.active_students_by_class', return_value=students), \
             patch(f'{repo}.pricing_rows', return_value={'c-hybrid': ROW_HYBRID}):
            assert budget._included_counts([spark]) == {'c-spark': 1}

    def test_a_school_without_the_setting_reads_nothing_more(self):
        with patch.object(budget, '_admin') as admin:
            assert budget._included_counts([{'id': 'c1', 'supply_fee': 10}]) == {}
        assert not admin.called

    def test_the_fee_part_counts_only_students_who_paid_it(self):
        """The allowance still counts them: it is funded from tuition, and
        their program's tuition paid for their seat."""
        row = {'id': 'c-spark', 'supply_fee': 150, 'supply_budget_per_student': 20,
               'included_with_class_ids': ['c-hybrid']}
        with patch.object(budget, '_org_settings', return_value={}), \
             patch.object(budget, '_enrolled_counts', return_value={'c-spark': 3}), \
             patch.object(budget, '_included_counts', return_value={'c-spark': 2}), \
             patch.object(budget, '_spend_by_class', return_value={}), \
             patch.object(budget, '_logged_by_class', return_value={}):
            b = budget.budget_for_class('org-1', row)
        assert b['students'] == 3
        assert b['fee_students'] == 1 and b['included_students'] == 2
        assert b['from_fees'] == 150
        assert b['from_allowance'] == 60
        assert b['total'] == 210


# ── Saving the list (PATCH/POST /api/sis/classes) ────────────────────────────

def _route_repo(existing=None, catalog_rows=None):
    repo = Mock()
    repo.find_by_id.return_value = existing or {
        'id': 'c-spark', 'organization_id': 'org-1', 'included_with_class_ids': []}
    repo.list_for_org.return_value = catalog_rows if catalog_rows is not None else [
        {'id': 'c-hybrid', 'included_with_class_ids': []},
        {'id': 'c-spark', 'included_with_class_ids': []}]
    repo.update_sis_fields.return_value = {'id': 'c-spark'}
    repo.create_for_org.return_value = {'id': 'c-new'}
    return repo


def _patch(client, auth_headers, body, repo):
    from tests.test_sis_catalog_routes import staff
    with staff(), patch('routes.sis.catalog.SisClassRepository', return_value=repo), \
         patch('routes.sis.catalog.get_supabase_admin_client', return_value=Mock()):
        return client.patch('/api/sis/classes/c-spark', headers=auth_headers, json=body)


@pytest.mark.unit
class TestSaving:
    def test_a_class_of_the_same_school_is_saved(self, client, auth_headers, mock_verify_token):
        repo = _route_repo()
        resp = _patch(client, auth_headers, {'included_with_class_ids': ['c-hybrid', 'c-hybrid']}, repo)
        assert resp.status_code == 200
        assert repo.update_sis_fields.call_args.args[1]['included_with_class_ids'] == ['c-hybrid']

    def test_another_schools_class_is_refused(self, client, auth_headers, mock_verify_token):
        repo = _route_repo()
        resp = _patch(client, auth_headers, {'included_with_class_ids': ['c-elsewhere']}, repo)
        assert resp.status_code == 400
        assert not repo.update_sis_fields.called

    def test_a_loop_is_refused(self, client, auth_headers, mock_verify_token):
        repo = _route_repo(catalog_rows=[
            {'id': 'c-hybrid', 'included_with_class_ids': ['c-spark']},
            {'id': 'c-spark', 'included_with_class_ids': []}])
        resp = _patch(client, auth_headers, {'included_with_class_ids': ['c-hybrid']}, repo)
        assert resp.status_code == 400

    def test_an_empty_list_is_no_write_before_the_column_exists(
            self, client, auth_headers, mock_verify_token):
        """The editor sends every field; a database without the column must
        still save the rest of the class."""
        repo = _route_repo(existing={'id': 'c-spark', 'organization_id': 'org-1'})
        resp = _patch(client, auth_headers, {'included_with_class_ids': [], 'capacity': 5}, repo)
        assert resp.status_code == 200
        assert 'included_with_class_ids' not in repo.update_sis_fields.call_args.args[1]

    def test_create_leaves_an_empty_list_to_the_column_default(
            self, client, auth_headers, mock_verify_token):
        from tests.test_sis_catalog_routes import staff
        repo = _route_repo()
        with staff(), patch('routes.sis.catalog.SisClassRepository', return_value=repo), \
             patch('routes.sis.catalog.get_supabase_admin_client', return_value=Mock()):
            resp = client.post('/api/sis/classes', headers=auth_headers,
                               json={'name': 'Art', 'included_with_class_ids': []})
        assert resp.status_code == 201
        assert 'included_with_class_ids' not in repo.create_for_org.call_args.kwargs['fields']
