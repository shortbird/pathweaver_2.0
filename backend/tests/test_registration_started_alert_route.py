"""
The start alert fires ONCE, on the first family-step submission.

/registrations/<id>/family is not only the family step: it is also the
back-edit for every step after it, so a family who reaches the payment page,
goes back and fixes a birthday re-POSTs the same endpoint. The alert has to
tell those two apart or the office gets a second "started registering" email
for a family it already knows about.

The rule is structural, not a stored flag: the row's status on entry is
`family` exactly once in its life. These tests pin that, and pin that a broken
mailer cannot 500 a request that has already created the children's accounts.
"""

from unittest.mock import patch

import pytest
from flask import Flask


@pytest.fixture
def client():
    from routes import registration_funnel
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.register_blueprint(registration_funnel.bp)
    return app.test_client()


class _Resp:
    def __init__(self, data):
        self.data = data


class _Query:
    """Minimal fluent stand-in for a supabase-py table query."""

    def __init__(self, table, admin):
        self.table = table
        self.admin = admin
        self._op = 'select'
        self._payload = None

    def select(self, *a, **k):
        self._op = 'select'; return self

    def insert(self, payload):
        self._op = 'insert'; self._payload = payload; return self

    def update(self, payload):
        self._op = 'update'; self._payload = payload; return self

    def delete(self):
        self._op = 'delete'; return self

    def eq(self, *a, **k):
        return self

    def in_(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def single(self):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        if self._op == 'insert':
            self.admin.inserts.append((self.table, self._payload))
            return _Resp([{**self._payload, 'id': 'new-id'}])
        if self._op == 'update':
            self.admin.updates.append((self.table, self._payload))
            return _Resp([])
        if self._op == 'delete':
            return _Resp([])
        return _Resp(self.admin.selects.get(self.table, []))


class _FakeAdmin:
    def __init__(self, selects=None):
        self.selects = selects or {}
        self.inserts = []
        self.updates = []

    def table(self, name):
        return _Query(name, self)


_PARENT = {'id': 'p1', 'email': 'pat@example.com', 'first_name': 'Pat', 'last_name': 'Sample'}
_CFG = {'registration_fee_cents': 2500}
_BODY = {
    'access_token': 'tok',
    'phone': '(555) 555-0100',
    'address_line1': '12 Oak St', 'city': 'Provo', 'state': 'UT', 'postal_code': '84604',
    'kids': [{'first_name': 'Casey', 'last_name': 'Sample',
              'date_of_birth': '2018-03-14', 'gender': 'female'}],
}


def _reg(status):
    return {'id': 'reg1', 'status': status, 'access_token': 'tok',
            'parent_user_id': 'p1', 'organization_id': 'org1', 'kids': []}


def _post(client, status, alert=None):
    """Run the family step against a registration at `status`, returning the
    response and the start-alert spy."""
    admin = _FakeAdmin({'organizations': {'name': 'Optio Academy'}})
    alert = alert or (lambda *a, **k: True)
    with patch('routes.registration_funnel._admin', return_value=admin), \
         patch('routes.registration_funnel._load_registration', return_value=_reg(status)), \
         patch('routes.registration_funnel._authz', return_value=True), \
         patch('routes.registration_funnel._org_config', return_value=_CFG), \
         patch('routes.registration_funnel._parent_row', return_value=_PARENT), \
         patch('routes.registration_funnel._family_directive', return_value=None), \
         patch('routes.registration_funnel._match_existing_dependent', return_value=None), \
         patch('routes.registration_funnel._create_dependent', return_value='kid-1'), \
         patch('routes.registration_funnel.sis_attach_service.attach_family',
               return_value={'household_id': 'hh1', 'refused': {}}), \
         patch('services.sis_enrollment_waitlist_service.gates_for_org', return_value=[]), \
         patch('routes.registration_funnel.notify_registration_started',
               side_effect=alert) as spy:
        resp = client.post('/api/registration/registrations/reg1/family', json=_BODY)
    return resp, spy


@pytest.mark.unit
class TestStartAlert:
    def test_first_submission_notifies_the_school(self, client):
        resp, spy = _post(client, 'family')
        assert resp.status_code == 200
        assert spy.call_count == 1
        reg, cfg, org, parent, contact = spy.call_args.args
        # No org row is passed: the alert resolves the school's name itself, so
        # this layer stays free of a query (the routes/ direct-.table() ratchet).
        assert org is None
        assert reg['organization_id'] == 'org1'
        assert parent['email'] == 'pat@example.com'
        assert contact['phone'] == '(555) 555-0100'
        assert contact['address']['city'] == 'Provo'
        # The kids must be the ones just created, not the empty list on the row.
        assert [k['name'] for k in reg['kids']] == ['Casey Sample']
        assert reg['fee_cents'] == 2500

    @pytest.mark.parametrize('status', ['details', 'paperwork', 'fee'])
    def test_back_edit_is_silent(self, client, status):
        """The family already generated an email on their way in."""
        resp, spy = _post(client, status)
        assert resp.status_code == 200
        assert spy.call_count == 0

    def test_an_unsent_alert_does_not_fail_the_registration(self, client):
        """The children's user rows exist by now. Losing the email is the
        acceptable failure; losing the family is not.

        The alert reports failure rather than raising it -- the swallow lives
        inside notify_registration_started (see its test_never_raises), so the
        call site here deliberately has no second try/except. The one thing at
        this call site that COULD raise is the org-name read evaluated as an
        argument, and _org_row guards itself for that reason."""
        resp, spy = _post(client, 'family', alert=lambda *a, **k: False)
        assert resp.status_code == 200
        assert resp.get_json()['status'] == 'details'
        assert spy.call_count == 1
