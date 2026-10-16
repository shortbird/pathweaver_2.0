"""
The interest list: a waitlist a family joins BEFORE registering or paying.

Apogee NoCo (Summer Hurd, 2026-10-16): "I want to create a waitlist for
2027-28. I have a lot of pre-K families asking about kinder for next year. I
need a place to put them before they pay a registration fee."

Public side: POST /api/registration/interest-list from the school's
registration link (routes/registration_interest.py). Staff side: GET
/api/sis/interest-list, invite and status (routes/sis/registration.py). The
rules live in services/sis_interest_list_service.py.
"""

from contextlib import contextmanager
from unittest.mock import MagicMock, Mock, patch

import pytest
from flask import Flask

from services import sis_interest_list_service as il

ORG_ON = {'id': 'org1', 'name': 'Apogee NoCo', 'feature_flags': {
    'registration': {'enabled': True,
                     'interest_list': {'enabled': True, 'label': '2027-28 school year'}}}}
ORG_OFF = {'id': 'org1', 'name': 'Apogee NoCo', 'feature_flags': {'registration': {'enabled': True}}}

GOOD = {
    'parent_first_name': 'Pat', 'parent_last_name': 'Parent',
    'email': '  Pat.Parent@Example.com ', 'phone': '555-0100',
    'children': [{'first_name': 'Ava', 'dob': '2022-03-14'}, {'first_name': '', 'dob': ''}],
    'interest': 'Kindergarten', 'notes': 'Her brother may come too.',
}


def _chain(*datasets):
    """Query-builder stand-in: every chained call returns the same mock and
    successive .execute() calls pop the given datasets."""
    m = MagicMock()
    for meth in ('select', 'insert', 'update', 'eq', 'in_', 'like', 'limit', 'order'):
        getattr(m, meth).return_value = m
    m.execute.side_effect = [MagicMock(data=d) for d in datasets]
    return m


def _client(tables):
    c = MagicMock()
    c.table.side_effect = lambda name: tables[name]
    return c


# ── Setting ──────────────────────────────────────────────────────────────────

@pytest.mark.unit
class TestSetting:
    def test_on_with_label(self):
        assert il.settings_from_flags(ORG_ON['feature_flags']) == {
            'enabled': True, 'label': '2027-28 school year'}

    def test_absent_is_off(self):
        assert il.settings_from_flags(ORG_OFF['feature_flags']) == {'enabled': False, 'label': ''}
        assert il.settings_from_flags(None) == {'enabled': False, 'label': ''}

    def test_only_a_real_true_turns_it_on(self):
        flags = {'registration': {'interest_list': {'enabled': 'yes'}}}
        assert il.settings_from_flags(flags)['enabled'] is False

    def test_legacy_registration_key_is_read(self):
        flags = {'icreate_registration': {'interest_list': {'enabled': True}}}
        assert il.settings_from_flags(flags)['enabled'] is True


# ── Validation ───────────────────────────────────────────────────────────────

@pytest.mark.unit
class TestCleanJoin:
    def test_good_form_is_cleaned(self):
        out = il.clean_join(GOOD)
        assert out['email'] == 'pat.parent@example.com'
        # The empty card the parent added and never filled in is dropped.
        assert out['children'] == [{'first_name': 'Ava', 'dob': '2022-03-14'}]
        assert out['interest'] == 'Kindergarten'

    @pytest.mark.parametrize('patch_, message', [
        ({'parent_first_name': ''}, 'first and last name'),
        ({'email': 'not-an-email'}, 'valid email'),
        ({'children': []}, 'at least one child'),
        ({'children': 'Ava'}, 'at least one child'),
        ({'children': [{'first_name': 'Ava'}]}, "Ava's date of birth"),
        ({'children': [{'first_name': '', 'dob': '2022-01-01'}]}, "first name"),
        ({'children': [{'first_name': 'Ava', 'dob': '2999-01-01'}]}, "Check Ava's"),
        ({'children': [{'first_name': 'Ava', 'dob': '1950-01-01'}]}, "Check Ava's"),
    ])
    def test_bad_form_is_refused(self, patch_, message):
        with pytest.raises(il.InterestListError) as e:
            il.clean_join({**GOOD, **patch_})
        assert message in e.value.message

    def test_markup_is_stripped(self):
        out = il.clean_join({**GOOD, 'notes': '<script>alert(1)</script>Hi'})
        assert '<script>' not in (out['notes'] or '')


# ── Join ─────────────────────────────────────────────────────────────────────

@pytest.mark.unit
class TestJoin:
    def test_list_off_is_refused_and_nothing_written(self):
        admin = MagicMock()
        with patch.object(il, '_admin', return_value=admin):
            with pytest.raises(il.InterestListError) as e:
                il.join(ORG_OFF, GOOD)
        assert 'not taking waitlist sign-ups' in e.value.message
        admin.table.assert_not_called()

    def test_new_family_is_inserted_confirmed_and_announced(self):
        table = _chain([], [{'id': 'e1'}])
        with patch.object(il, '_admin', return_value=_client({il.TABLE: table})), \
             patch.object(il, '_send_confirmation', return_value=True) as confirm, \
             patch('services.registration_alerts.notify_interest_list_joined') as alert:
            out = il.join(ORG_ON, GOOD)
        assert out == {'id': 'e1'}
        row = table.insert.call_args.args[0]
        assert row['organization_id'] == 'org1'
        assert row['status'] == 'waiting'
        assert row['list_label'] == '2027-28 school year'
        assert row['email'] == 'pat.parent@example.com'
        confirm.assert_called_once()
        alert.assert_called_once()

    def test_rejoin_refreshes_the_live_row_and_does_not_alert_again(self):
        table = _chain([{'id': 'e1'}], [])
        with patch.object(il, '_admin', return_value=_client({il.TABLE: table})), \
             patch.object(il, '_send_confirmation', return_value=True), \
             patch('services.registration_alerts.notify_interest_list_joined') as alert:
            out = il.join(ORG_ON, GOOD)
        assert out == {'id': 'e1'}
        table.insert.assert_not_called()
        assert table.update.call_args.args[0]['children'] == [{'first_name': 'Ava', 'dob': '2022-03-14'}]
        alert.assert_not_called()

    def test_confirmation_email_names_the_list_and_children(self):
        sent = {}
        with patch('services.email_service.email_service.send_email',
                   side_effect=lambda to, subject, html: sent.update(to=to, subject=subject, html=html) or True):
            assert il._send_confirmation(ORG_ON, {'email': 'p@example.com', 'parent_first_name': 'Pat',
                                                  'children': [{'first_name': 'Ava'}, {'first_name': 'Leo'}]},
                                         '2027-28 school year')
        assert sent['to'] == 'p@example.com'
        assert 'waitlist' in sent['subject']
        assert 'Ava and Leo' in sent['html'] and '2027-28 school year' in sent['html']


# ── Staff actions ────────────────────────────────────────────────────────────

ENTRY = {'id': '00000000-0000-4000-8000-0000000000e1', 'organization_id': 'org1',
         'email': 'pat@example.com', 'parent_first_name': 'Pat', 'status': 'waiting',
         'children': [{'first_name': 'Ava', 'dob': '2022-03-14'}]}


@pytest.mark.unit
class TestStaffActions:
    def test_list_adds_age_today_and_keeps_join_order(self):
        rows = [{**ENTRY, 'id': 'b', 'created_at': '2026-10-02'},
                {**ENTRY, 'id': 'a', 'created_at': '2026-10-01'}]
        with patch('repositories.sis_interest_list_repository.fetch_all_rows', return_value=rows):
            out = il.list_entries('org1')
        assert [r['id'] for r in out] == ['a', 'b']
        assert isinstance(out[0]['children'][0]['age'], int)

    def test_unknown_entry_is_404(self):
        with patch.object(il, '_admin', return_value=_client({il.TABLE: _chain([])})):
            with pytest.raises(il.InterestListError) as e:
                il.set_status('org1', ENTRY['id'], 'removed', by='staff1')
        assert e.value.status == 404

    def test_malformed_entry_id_is_404_without_a_query(self):
        admin = MagicMock()
        with patch.object(il, '_admin', return_value=admin):
            with pytest.raises(il.InterestListError) as e:
                il.set_status('org1', 'junk', 'removed', by='staff1')
        assert e.value.status == 404

    def test_remove_records_who(self):
        table = _chain([ENTRY], [])
        with patch.object(il, '_admin', return_value=_client({il.TABLE: table})):
            out = il.set_status('org1', ENTRY['id'], 'removed', by='staff1')
        patch_ = table.update.call_args.args[0]
        assert patch_['status'] == 'removed' and patch_['removed_by'] == 'staff1'
        assert out['status'] == 'removed'

    def test_only_remove_and_restore_are_settable(self):
        with pytest.raises(il.InterestListError):
            il.set_status('org1', ENTRY['id'], 'registered', by='staff1')

    def test_invite_emails_the_link_and_marks_invited(self):
        table = _chain([ENTRY], [])
        with patch.object(il, '_admin', return_value=_client({il.TABLE: table})), \
             patch.object(il, 'registration_link', return_value='https://app.optioeducation.com/enroll/CODE'), \
             patch.object(il, '_org', return_value=ORG_ON), \
             patch.object(il, '_send_invite', return_value=True) as send:
            out = il.invite('org1', ENTRY['id'], by='staff1')
        assert out['emailed'] is True
        assert send.call_args.args[2] == 'https://app.optioeducation.com/enroll/CODE'
        assert table.update.call_args.args[0]['status'] == 'invited'

    def test_invite_refuses_a_registered_family(self):
        table = _chain([{**ENTRY, 'status': 'registered'}])
        with patch.object(il, '_admin', return_value=_client({il.TABLE: table})):
            with pytest.raises(il.InterestListError) as e:
                il.invite('org1', ENTRY['id'], by='staff1')
        assert 'already registered' in e.value.message

    def test_invite_without_a_registration_link_says_how_to_make_one(self):
        table = _chain([ENTRY])
        with patch.object(il, '_admin', return_value=_client({il.TABLE: table})), \
             patch.object(il, 'registration_link', return_value=None):
            with pytest.raises(il.InterestListError) as e:
                il.invite('org1', ENTRY['id'], by='staff1')
        assert 'Registration form' in e.value.message
        table.update.assert_not_called()

    def test_registration_link_uses_the_app_host(self):
        inv = _chain([{'invitation_code': 'CODE', 'email': 'link-invite-abc@pending.optio.local'}])
        with patch.object(il, '_admin', return_value=_client({'org_invitations': inv})), \
             patch('app_config.Config.FRONTEND_URL', 'https://www.optioeducation.com'):
            assert il.registration_link('org1') == 'https://app.optioeducation.com/enroll/CODE'

    def test_mark_registered_closes_live_rows_by_email(self):
        table = _chain([{'id': 'e1'}])
        with patch.object(il, '_admin', return_value=_client({il.TABLE: table})):
            assert il.mark_registered('org1', ' Pat@Example.com ') == 1
        assert table.update.call_args.args[0]['status'] == 'registered'
        table.eq.assert_any_call('email', 'pat@example.com')
        table.in_.assert_called_with('status', ['waiting', 'invited'])

    def test_mark_registered_never_raises(self):
        with patch.object(il, '_admin', side_effect=RuntimeError('db down')):
            assert il.mark_registered('org1', 'pat@example.com') == 0

    def test_mark_registered_without_email_does_nothing(self):
        with patch.object(il, '_admin') as admin:
            assert il.mark_registered('org1', '') == 0
        admin.assert_not_called()


# ── Public route ─────────────────────────────────────────────────────────────

@pytest.fixture
def public_client():
    from routes import registration_funnel
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.register_blueprint(registration_funnel.bp)
    return app.test_client()


_INVITE = ({'organization': ORG_ON, 'config': {}}, None)


@pytest.mark.unit
class TestPublicRoute:
    def test_join(self, public_client):
        with patch('routes.registration_interest._load_registration_invite', return_value=_INVITE), \
             patch('routes.registration_interest.interest_list.join', return_value={'id': 'e1'}) as join:
            resp = public_client.post('/api/registration/interest-list', json={'code': 'C', **GOOD})
        assert resp.status_code == 201
        assert resp.get_json() == {'success': True}  # no id: nothing to probe with
        assert join.call_args.args[0] is ORG_ON

    def test_honeypot_answers_success_and_writes_nothing(self, public_client):
        with patch('routes.registration_interest._load_registration_invite', return_value=_INVITE), \
             patch('routes.registration_interest.interest_list.join') as join:
            resp = public_client.post('/api/registration/interest-list',
                                      json={'code': 'C', **GOOD, 'website': 'http://spam.example'})
        assert resp.status_code == 201
        join.assert_not_called()

    def test_bad_link_is_refused(self, public_client):
        from flask import jsonify
        with public_client.application.app_context():
            err = (None, (jsonify({'error': 'Invalid registration link'}), 404))
        with patch('routes.registration_interest._load_registration_invite', return_value=err), \
             patch('routes.registration_interest.interest_list.join') as join:
            resp = public_client.post('/api/registration/interest-list', json={'code': 'nope', **GOOD})
        assert resp.status_code == 404
        join.assert_not_called()

    def test_list_off_is_a_400_with_the_reason(self, public_client):
        off = ({'organization': ORG_OFF, 'config': {}}, None)
        with patch('routes.registration_interest._load_registration_invite', return_value=off), \
             patch.object(il, '_admin') as admin:
            resp = public_client.post('/api/registration/interest-list', json={'code': 'C', **GOOD})
        assert resp.status_code == 400
        assert 'not taking waitlist sign-ups' in resp.get_json()['error']
        admin.assert_not_called()

    def test_rate_limited_after_five_an_hour(self, public_client):
        with patch('routes.registration_interest._load_registration_invite', return_value=_INVITE), \
             patch('routes.registration_interest.interest_list.join', return_value={'id': 'e1'}), \
             patch('middleware.rate_limiter.Config.RATE_LIMIT_ENABLED', True), \
             patch('middleware.rate_limiter.get_redis_client', return_value=None):
            codes = [public_client.post('/api/registration/interest-list',
                                        json={'code': 'C', **GOOD}).status_code for _ in range(6)]
        assert codes[:5] == [201] * 5
        assert codes[5] == 429

    def test_csrf_exempt_like_the_rest_of_the_funnel(self):
        from middleware.csrf_protection import CSRF_EXEMPT_ENDPOINTS
        assert 'registration.join_interest_list' in CSRF_EXEMPT_ENDPOINTS

    def test_public_config_carries_the_setting(self):
        from routes.registration_funnel import _public_config
        with patch('routes.registration_funnel._org_stripe_enabled', return_value=False):
            cfg = _public_config(ORG_ON, ORG_ON['feature_flags']['registration'])
        assert cfg['interest_list'] == {'enabled': True, 'label': '2027-28 school year'}


# ── Staff routes ─────────────────────────────────────────────────────────────

def _admin_client_for_role(role):
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{'role': role, 'org_role': None, 'org_roles': None}])
    return client


@contextmanager
def staff(role='org_admin', org='org1'):
    with patch('database.get_supabase_admin_client', return_value=_admin_client_for_role(role)), \
         patch('services.sis_service.resolve_org_id', return_value=org):
        yield


@pytest.mark.unit
class TestStaffRoutes:
    def test_student_is_forbidden(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client', return_value=_admin_client_for_role('student')):
            resp = client.get('/api/sis/interest-list', headers=auth_headers)
        assert resp.status_code == 403

    def test_list(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.registration.interest_list.list_entries',
                            return_value=[ENTRY]) as list_entries:
            resp = client.get('/api/sis/interest-list?organization_id=org1', headers=auth_headers)
        assert resp.status_code == 200
        assert resp.get_json()['entries'][0]['email'] == 'pat@example.com'
        list_entries.assert_called_once_with('org1')

    def test_invite(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.registration.interest_list.invite',
                            return_value={'entry': ENTRY, 'emailed': True}) as invite:
            resp = client.post(f"/api/sis/interest-list/{ENTRY['id']}/invite",
                               headers=auth_headers, json={'organization_id': 'org1'})
        assert resp.status_code == 200
        assert resp.get_json()['emailed'] is True
        assert invite.call_args.args[:2] == ('org1', ENTRY['id'])

    def test_invite_refusal_keeps_its_status(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.registration.interest_list.invite',
                            side_effect=il.InterestListError('nope', 404)):
            resp = client.post(f"/api/sis/interest-list/{ENTRY['id']}/invite",
                               headers=auth_headers, json={'organization_id': 'org1'})
        assert resp.status_code == 404
        assert resp.get_json()['error'] == 'nope'

    def test_remove(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.registration.interest_list.set_status',
                            return_value={**ENTRY, 'status': 'removed'}) as set_status:
            resp = client.post(f"/api/sis/interest-list/{ENTRY['id']}/status",
                               headers=auth_headers, json={'organization_id': 'org1', 'status': 'removed'})
        assert resp.status_code == 200
        assert set_status.call_args.args == ('org1', ENTRY['id'], 'removed')


@pytest.mark.unit
class TestOfficeAlert:
    def test_alert_lists_children_and_points_at_the_queue(self):
        from services.registration_alerts import notify_interest_list_joined
        sent = {}
        entry = {**ENTRY, 'parent_last_name': 'Parent', 'phone': '555-0100',
                 'interest': 'Kindergarten', 'list_label': '2027-28 school year'}
        with patch('services.sis_billing_alerts.recipients', return_value=['office@example.com']), \
             patch('services.email_service.email_service.send_email',
                   side_effect=lambda **k: sent.update(k) or True):
            assert notify_interest_list_joined(ORG_ON, entry) is True
        assert sent['to_email'] == 'office@example.com'
        assert 'joined the waitlist with 1 child' in sent['subject']
        assert 'Ava (born 2022-03-14' in sent['text_body']
        assert 'Kindergarten' in sent['text_body']
        assert '/registration?tab=queues' in sent['html_body']

    def test_alert_never_raises(self):
        from services.registration_alerts import notify_interest_list_joined
        with patch('services.sis_billing_alerts.recipients', side_effect=RuntimeError('db down')):
            assert notify_interest_list_joined(ORG_ON, ENTRY) is False


@pytest.mark.unit
class TestPlainText:
    def test_apostrophes_and_ampersands_are_stored_as_typed(self):
        """Escaping is the renderer's job; a stored entity would show on the card."""
        out = il.clean_join({**GOOD, 'parent_last_name': "O'Brien", 'notes': 'Twins & cousins'})
        assert out['parent_last_name'] == "O'Brien"
        assert out['notes'] == 'Twins & cousins'

    def test_the_email_escapes_what_the_family_typed(self):
        sent = {}
        with patch('services.email_service.email_service.send_email',
                   side_effect=lambda to, subject, html: sent.update(html=html) or True):
            il._send_confirmation(ORG_ON, {'email': 'p@example.com', 'parent_first_name': '<b>Pat</b>',
                                           'children': [{'first_name': 'A&B'}]}, '')
        assert '<b>' not in sent['html'] and 'A&amp;B' in sent['html']
