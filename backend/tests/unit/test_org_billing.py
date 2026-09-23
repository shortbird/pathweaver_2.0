"""Optio's own invoices from /admin/billing (services/org_billing_service.py).

The rules that cost money when they break: the invoice takes bank transfer
only (free to the payer, and no card by decision), it goes to any recipient
with an org link only when one is asked for, reminders keep their schedule, and
only a superadmin reaches any of it.

Stripe is a fake at the module's one seam (`_stripe`).
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest
from flask import Flask

from services import org_billing_service as ob

pytestmark = pytest.mark.unit

ORG = '11111111-1111-4111-8111-111111111111'
OTHER_ORG = '22222222-2222-4222-8222-222222222222'
ADMIN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'


class Obj(dict):
    """A Stripe object: a dict with attribute access."""
    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError:
            raise AttributeError(name) from None


def _ts(d: date) -> int:
    return int(datetime(d.year, d.month, d.day, 12, tzinfo=timezone.utc).timestamp())


class FakeStripe:
    def __init__(self):
        self.customers = {}
        self.invoices = {}
        self.items = []
        self.calls = []
        fake = self

        class InvalidRequestError(Exception):
            pass
        self.error = SimpleNamespace(InvalidRequestError=InvalidRequestError)

        class Customer:
            @staticmethod
            def search(query, **kw):
                email = query.split("'")[1]
                found = [c for c in fake.customers.values() if c['email'] == email]
                return SimpleNamespace(data=found[:1])

            @staticmethod
            def create(**kw):
                c = Obj(id=f'cus_{len(fake.customers) + 1}', email=kw['email'], name=kw.get('name'),
                        metadata=kw['metadata'])
                fake.customers[c.id] = c
                return c

            @staticmethod
            def modify(cid, **kw):
                fake.customers[cid].update({k: v for k, v in kw.items() if k != 'api_key'})
                return fake.customers[cid]

        class Invoice:
            @staticmethod
            def create(**kw):
                cust = fake.customers[kw['customer']]
                inv = Obj(id=f'in_{len(fake.invoices) + 1}', status='draft', customer=kw['customer'],
                          customer_email=cust['email'], customer_name=cust.get('name'),
                          metadata=dict(kw['metadata']), payment_settings=kw['payment_settings'],
                          collection_method=kw['collection_method'], total=0, amount_remaining=0,
                          due_date=None, number=None, hosted_invoice_url=None, payment_intent=None,
                          lines={'data': []})
                fake.invoices[inv.id] = inv
                return inv

            @staticmethod
            def modify(iid, **kw):
                inv = fake.invoices[iid]
                for k, v in kw.items():
                    if k == 'metadata':
                        inv['metadata'].update(v)
                    elif k not in ('api_key', 'expand'):
                        inv[k] = v
                return inv

            @staticmethod
            def finalize_invoice(iid, **kw):
                inv = fake.invoices[iid]
                inv.update(status='open', number=f'OPT-{iid}', hosted_invoice_url=f'https://pay.test/{iid}')
                return inv

            @staticmethod
            def send_invoice(iid, **kw):
                fake.calls.append(('send', iid))
                return fake.invoices[iid]

            @staticmethod
            def retrieve(iid, **kw):
                if iid not in fake.invoices:
                    raise InvalidRequestError(iid)
                return fake.invoices[iid]

            @staticmethod
            def pay(iid, **kw):
                fake.calls.append(('pay', iid, kw.get('paid_out_of_band')))
                fake.invoices[iid]['status'] = 'paid'
                return fake.invoices[iid]

            @staticmethod
            def void_invoice(iid, **kw):
                fake.invoices[iid]['status'] = 'void'
                return fake.invoices[iid]

            @staticmethod
            def delete(iid, **kw):
                fake.invoices.pop(iid, None)

            @staticmethod
            def list(status=None, **kw):
                rows = [i for i in fake.invoices.values() if status is None or i['status'] == status]
                return SimpleNamespace(auto_paging_iter=lambda: iter(rows))

        class InvoiceItem:
            @staticmethod
            def create(**kw):
                inv = fake.invoices[kw['invoice']]
                amount = kw['unit_amount'] * kw['quantity']
                inv['total'] += amount
                inv['amount_remaining'] += amount
                inv['lines']['data'].append({'description': kw['description'], 'amount': amount})
                fake.items.append(kw)

        self.Customer, self.Invoice, self.InvoiceItem = Customer, Invoice, InvoiceItem


@pytest.fixture
def fake(monkeypatch):
    f = FakeStripe()
    f.emails = []
    monkeypatch.setattr(ob, '_stripe', lambda: f)
    monkeypatch.setattr('app_config.Config.OPTIO_BILLING_COPY_EMAIL', 'accounting@optio.test')
    monkeypatch.setattr('services.email_service.EmailService.__init__', lambda self: None)
    monkeypatch.setattr('services.email_service.EmailService.send_email',
                        lambda self, to, subject, html, **kw: f.emails.append((to, subject, kw)) or True)
    monkeypatch.setattr(ob, '_key', lambda: 'rk_test_x')
    return f


def _invoice(fake, amount=100_000, org=ORG, email='books@school.test'):
    return ob.create_invoice(recipient_email=email, recipient_name='Hearthwood',
                             lines=[{'description': 'Licenses', 'amount_cents': amount}],
                             organization_id=org)


class TestCreate:
    def test_invoice_takes_bank_transfer_only(self, fake):
        out = _invoice(fake)
        inv = fake.invoices[out['id']]
        assert inv['payment_settings'] == {'payment_method_types': ['us_bank_account']}
        assert inv['collection_method'] == 'send_invoice'
        assert inv['status'] == 'open'
        assert ('send', out['id']) in fake.calls
        assert 'footer' not in inv  # no card link, no payer note
        assert inv['metadata']['organization_id'] == ORG
        assert out['total_cents'] == 100_000

    @pytest.mark.parametrize('email', ['', 'nobody', "a'b@x.test", 'a b@x.test'])
    def test_refused_without_a_valid_recipient(self, fake, email):
        with pytest.raises(ob.OrgBillingError):
            ob.create_invoice(recipient_email=email, lines=[{'description': 'x', 'amount_cents': 100}])
        assert fake.invoices == {}

    def test_an_invoice_need_not_name_an_org(self, fake):
        out = _invoice(fake, org=None, email='Someone@Example.test')
        assert 'organization_id' not in fake.invoices[out['id']]['metadata']
        assert out['organization_id'] is None
        assert out['recipient_email'] == 'someone@example.test'

    def test_one_customer_per_recipient_email(self, fake):
        _invoice(fake)
        _invoice(fake, org=None)
        _invoice(fake, email='other@x.test')
        assert sorted(c['email'] for c in fake.customers.values()) == ['books@school.test', 'other@x.test']

    @pytest.mark.parametrize('lines', [[], [{'description': '', 'amount_cents': 100}],
                                       [{'description': 'x', 'amount_cents': 0}],
                                       [{'description': 'x', 'amount_cents': 'ten'}]])
    def test_bad_lines_are_refused(self, fake, lines):
        with pytest.raises(ob.OrgBillingError):
            ob.create_invoice(recipient_email='a@b.test', lines=lines)

    def test_a_failure_mid_build_deletes_the_draft(self, fake, monkeypatch):
        monkeypatch.setattr(fake.InvoiceItem, 'create', staticmethod(lambda **kw: 1 / 0))
        with pytest.raises(ZeroDivisionError):
            ob.create_invoice(recipient_email='a@b.test', lines=[{'description': 'x', 'amount_cents': 100}])
        assert fake.invoices == {}


class TestReminders:
    TODAY = date(2026, 10, 10)

    def _inv(self, due, **extra):
        return Obj(status='open', due_date=_ts(due), metadata=extra.pop('metadata', {}),
                   payment_intent=extra.pop('payment_intent', None))

    @pytest.mark.parametrize('offset,expected', [(3, True), (2, False), (0, True), (-1, False),
                                                 (-7, True), (-14, True), (-8, False), (10, False)])
    def test_schedule(self, offset, expected):
        from datetime import timedelta
        inv = self._inv(self.TODAY + timedelta(days=offset))
        assert ob.reminder_due(inv, self.TODAY) is expected

    def test_never_twice_in_a_day(self):
        inv = self._inv(self.TODAY, metadata={'last_reminder_on': self.TODAY.isoformat()})
        assert ob.reminder_due(inv, self.TODAY) is False

    def test_not_while_a_bank_transfer_is_processing(self):
        inv = self._inv(self.TODAY, payment_intent={'status': 'processing'})
        assert ob.reminder_due(inv, self.TODAY) is False

    def test_sweep_reminds_only_its_own_invoices(self, fake, monkeypatch):
        out = _invoice(fake)
        fake.invoices[out['id']]['due_date'] = _ts(self.TODAY)
        fake.invoices['in_foreign'] = Obj(id='in_foreign', status='open', due_date=_ts(self.TODAY),
                                          metadata={}, payment_intent=None)
        fake.calls.clear()
        result = ob.sweep(today=self.TODAY)
        assert result['reminders_sent'] == 1
        assert fake.calls == [('send', out['id'])]


class TestListAndActions:
    def test_list_narrows_to_an_org_and_skips_other_invoices(self, fake):
        a = _invoice(fake)
        b = _invoice(fake, org=OTHER_ORG)
        c = _invoice(fake, org=None)
        fake.invoices['in_foreign'] = Obj(id='in_foreign', status='open', metadata={})
        assert {i['id'] for i in ob.list_invoices()} == {a['id'], b['id'], c['id']}
        assert [i['id'] for i in ob.list_invoices(ORG)] == [a['id']]

    def test_mark_paid_then_nothing_else(self, fake):
        out = _invoice(fake)
        assert ob.mark_paid_outside(out['id'], 'check 1042')['paid_via'] == 'outside'
        with pytest.raises(ob.OrgBillingError):
            ob.void_invoice(out['id'])

    def test_actions_refuse_an_invoice_this_module_did_not_send(self, fake):
        fake.invoices['in_foreign'] = Obj(id='in_foreign', status='open', metadata={})
        for act in (ob.void_invoice, ob.resend_invoice, ob.mark_paid_outside):
            with pytest.raises(ob.OrgBillingError):
                act('in_foreign')
        assert fake.invoices['in_foreign']['status'] == 'open'


class TestWatch:
    """Optio hears once at each step of a bank payment, and never about a
    payment it recorded itself."""
    NOW = datetime(2026, 10, 1, 15, tzinfo=timezone.utc)

    @pytest.fixture(autouse=True)
    def _to(self, monkeypatch):
        monkeypatch.setattr('app_config.Config.OPTIO_BILLING_NOTIFY_EMAILS', 'a@optio.test, b@optio.test')

    def _sent(self, fake):
        out = _invoice(fake)
        fake.emails.clear()
        return fake.invoices[out['id']]

    def _subjects(self, fake):
        return [(to, subject.split(':')[0]) for to, subject, _ in fake.emails]

    def test_started_then_cleared_each_email_once(self, fake):
        inv = self._sent(fake)
        inv['payment_intent'] = {'status': 'processing', 'amount': 100_000}
        assert ob.watch(self.NOW)['started'] == 1
        assert ob.watch(self.NOW)['started'] == 0
        assert self._subjects(fake) == [('a@optio.test', 'Payment started'),
                                        ('b@optio.test', 'Payment started')]
        fake.emails.clear()
        inv.update(status='paid', amount_paid=100_000, payment_intent='pi_1')
        assert ob.watch(self.NOW)['cleared'] == 1
        assert ob.watch(self.NOW)['cleared'] == 0
        assert self._subjects(fake) == [('a@optio.test', 'Payment received'),
                                        ('b@optio.test', 'Payment received')]

    def test_a_failure_emails_and_a_retry_is_a_new_start(self, fake):
        inv = self._sent(fake)
        inv['payment_intent'] = {'status': 'processing'}
        ob.watch(self.NOW)
        inv['payment_intent'] = {'status': 'requires_payment_method', 'latest_charge': 'py_1',
                                 'last_payment_error': {'message': 'Account closed'}}
        assert ob.watch(self.NOW)['failed'] == 1
        assert ob.watch(self.NOW)['failed'] == 0
        assert fake.emails[-1][1].startswith('Payment failed')
        inv['payment_intent'] = {'status': 'processing'}
        assert ob.watch(self.NOW)['started'] == 1

    def test_silent_on_an_unpaid_invoice_or_one_marked_paid_by_hand(self, fake):
        inv = self._sent(fake)
        assert ob.watch(self.NOW) == {'started': 0, 'cleared': 0, 'failed': 0, 'errors': 0}
        ob.mark_paid_outside(inv['id'], 'check 1042')
        fake.invoices['in_foreign'] = Obj(id='in_foreign', status='paid', metadata={})
        ob.watch(self.NOW)
        assert fake.emails == []


@pytest.fixture
def client(fake, monkeypatch):
    state = {'role': 'superadmin'}
    monkeypatch.setattr('utils.auth.decorators.authorizing_user_id', lambda: ADMIN)

    class _Users:
        def __getattr__(self, name):
            if name == 'execute':
                return lambda: SimpleNamespace(data={'role': state['role']})
            return lambda *a, **k: self
    monkeypatch.setattr('database.get_supabase_admin_client', lambda: SimpleNamespace(table=lambda n: _Users()))
    monkeypatch.setattr('repositories.organization_repository.OrganizationRepository.find_by_id',
                        lambda self, oid: {'id': oid, 'name': 'Hearthwood'} if oid == ORG else None)

    from routes.admin import optio_billing
    from middleware.error_handler import ErrorHandler
    app = Flask(__name__)
    ErrorHandler().init_app(app)
    app.register_blueprint(optio_billing.bp)
    c = app.test_client()
    c.state = state
    return c


class TestRoutes:
    def test_superadmin_sends_an_invoice_to_anyone(self, client, fake):
        r = client.post('/api/admin/billing/invoices', json={
            'recipient_email': 'pat@consult.test', 'recipient_name': 'Pat',
            'lines': [{'description': 'Workshop', 'amount_cents': 5000}], 'memo': 'Fall'})
        assert r.status_code == 201
        r = client.post('/api/admin/billing/invoices', json={
            'recipient_email': 'books@school.test', 'organization_id': ORG,
            'lines': [{'description': 'Licenses', 'amount_cents': 7000}]})
        assert r.status_code == 201
        listed = client.get('/api/admin/billing/invoices').get_json()
        assert sorted(i['total_cents'] for i in listed['invoices']) == [5000, 7000]
        narrowed = client.get(f'/api/admin/billing/invoices?organization_id={ORG}').get_json()
        assert [i['recipient_email'] for i in narrowed['invoices']] == ['books@school.test']

    def test_a_link_to_an_org_that_does_not_exist_is_refused(self, client, fake):
        r = client.post('/api/admin/billing/invoices', json={
            'recipient_email': 'a@b.test', 'organization_id': OTHER_ORG,
            'lines': [{'description': 'x', 'amount_cents': 100}]})
        assert r.status_code == 400
        assert fake.invoices == {}

    @pytest.mark.parametrize('role', ['org_admin', 'org_managed', 'advisor'])
    def test_nobody_else_can(self, client, fake, role):
        client.state['role'] = role
        assert client.get('/api/admin/billing/invoices').status_code in (401, 403)
        r = client.post('/api/admin/billing/invoices', json={
            'recipient_email': 'a@b.test', 'lines': [{'description': 'x', 'amount_cents': 100}]})
        assert r.status_code in (401, 403)
        assert fake.invoices == {}


class TestKey:
    def test_uses_the_billing_orgs_stored_key_not_the_platform_env_key(self, monkeypatch):
        from app_config import Config
        seen = {}
        monkeypatch.setattr(Config, 'OPTIO_BILLING_STRIPE_ORG_ID', ORG)
        monkeypatch.setattr(Config, 'STRIPE_SECRET_KEY', 'sk_live_wrong_account')
        monkeypatch.setattr('utils.org_secrets.get_org_secret',
                            lambda org_id, name: seen.update(org=org_id, name=name) or 'rk_live_academy')
        assert ob._key() == 'rk_live_academy'
        assert seen == {'org': ORG, 'name': 'stripe_secret_key'}

    def test_no_stored_key_means_unavailable(self, monkeypatch):
        monkeypatch.setattr('utils.org_secrets.get_org_secret', lambda org_id, name: None)
        assert ob.is_available() is False
        with pytest.raises(ob.OrgBillingUnavailable):
            ob._key()
        assert ob.sweep()['skipped']


class TestAccountingCopy:
    def test_every_sent_invoice_is_copied_to_accounting(self, fake):
        out = _invoice(fake, amount=12_345)
        assert len(fake.emails) == 1
        to, subject, kw = fake.emails[0]
        assert to == 'accounting@optio.test'
        assert 'Invoice sent' in subject and out['number'] in subject and '$123.45' in subject
        assert kw['support_copy'] is False

    def test_every_reminder_is_copied_too(self, fake):
        out = _invoice(fake)
        fake.emails.clear()
        ob.resend_invoice(out['id'])
        assert [e[0] for e in fake.emails] == ['accounting@optio.test']
        assert 'Reminder sent' in fake.emails[0][1]

    def test_a_failed_copy_does_not_fail_the_send(self, fake, monkeypatch):
        def boom(self, *a, **k):
            raise RuntimeError('sendgrid down')
        monkeypatch.setattr('services.email_service.EmailService.send_email', boom)
        out = _invoice(fake)
        assert fake.invoices[out['id']]['status'] == 'open'

    def test_no_copy_address_means_no_copy(self, fake, monkeypatch):
        monkeypatch.setattr('app_config.Config.OPTIO_BILLING_COPY_EMAIL', '')
        _invoice(fake)
        assert fake.emails == []
