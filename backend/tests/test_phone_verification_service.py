"""
Phone verification: who is held, and the code loop that lifts the hold.

The two halves under test:
  utils/phone_verification_hold  -- WHO must verify (role x org-flag x verified)
  services/phone_verification_service -- the OTP mechanics (send limits,
      attempt cap, expiry, and the one write that lifts the hold)

The OTP rules mirror the registration funnel's, so the tests assert the same
properties test_login_lockout asserts about passwords: a wrong guess costs an
attempt, attempts run out, expiry is real, and success consumes the code.
"""

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from services import phone_verification_service as svc
from utils import phone_verification_hold as hold


# ── A minimal chainable Supabase stub ────────────────────────────────────────

class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, table):
        self._t = table
        self._op = 'select'
        self._payload = None

    def select(self, *a, **k):
        self._op = 'select'
        return self

    def insert(self, payload):
        self._op = 'insert'
        self._payload = payload
        return self

    def update(self, payload):
        self._op = 'update'
        self._payload = payload
        return self

    def delete(self):
        self._op = 'delete'
        return self

    @property
    def not_(self):
        return self

    def eq(self, *a):
        return self

    def gte(self, *a):
        return self

    def is_(self, *a):
        return self

    def order(self, *a, **k):
        return self

    def limit(self, *a):
        return self

    def execute(self):
        t = self._t
        if self._op == 'select':
            t.selects += 1
            return _Result(t.select_results.pop(0) if t.select_results else [])
        if self._op == 'insert':
            t.inserted.append(self._payload)
            return _Result([{'id': f'row-{len(t.inserted)}', **self._payload}])
        if self._op == 'update':
            t.updated.append(self._payload)
            return _Result([])
        t.deleted += 1
        return _Result([])


class _Table:
    def __init__(self):
        self.select_results = []   # queued, popped per select().execute()
        self.selects = 0
        self.inserted = []
        self.updated = []
        self.deleted = 0


class _FakeClient:
    def __init__(self):
        self.tables = defaultdict(_Table)

    def table(self, name):
        return _Query(self.tables[name])


@pytest.fixture
def fake_db():
    client = _FakeClient()
    hold.clear_cache()
    with patch.object(svc, '_admin', return_value=client), \
         patch.object(hold, '_admin', return_value=client):
        yield client
    hold.clear_cache()


def _now():
    return datetime.now(timezone.utc)


# ── Who is held ──────────────────────────────────────────────────────────────

@pytest.mark.unit
class TestRequiresVerification:

    def _user(self, **over):
        base = {'organization_id': 'org-1', 'role': 'org_managed',
                'org_role': 'parent', 'org_roles': ['parent'],
                'phone_verified_at': None}
        base.update(over)
        return base

    def _required(self, user, org_flag=True):
        with patch.object(hold, 'org_requires_verification',
                          return_value=org_flag):
            return hold.requires_verification(user)

    def test_an_unverified_adult_in_a_requiring_org_is_held(self):
        assert self._required(self._user()) is True

    @pytest.mark.parametrize('role', ['org_admin', 'campus_coordinator',
                                      'advisor', 'parent'])
    def test_every_adult_role_is_in_scope(self, role):
        u = self._user(org_role=role, org_roles=[role])
        assert self._required(u) is True

    def test_a_parent_who_also_teaches_is_held_once_not_twice(self):
        u = self._user(org_roles=['parent', 'advisor'])
        assert self._required(u) is True

    def test_students_are_never_held(self):
        u = self._user(org_role='student', org_roles=['student'])
        assert self._required(u) is False

    def test_observers_are_never_held(self):
        u = self._user(org_role='observer', org_roles=['observer'])
        assert self._required(u) is False

    def test_verifying_lifts_the_hold(self):
        u = self._user(phone_verified_at=_now().isoformat())
        assert self._required(u) is False

    def test_platform_users_are_out_of_scope(self):
        u = self._user(organization_id=None, role='parent',
                       org_role=None, org_roles=None)
        assert self._required(u) is False

    def test_an_org_without_the_flag_holds_nobody(self):
        assert self._required(self._user(), org_flag=False) is False


@pytest.mark.unit
class TestIsBlockedCaching:

    def test_a_clear_answer_is_cached(self, fake_db):
        fake_db.tables['users'].select_results = [[{
            'organization_id': None, 'role': 'student', 'org_role': None,
            'org_roles': None, 'phone_verified_at': None}]]
        assert hold.is_blocked('u-1') is False
        assert hold.is_blocked('u-1') is False
        # Second call answered from cache: one users read, not two.
        assert fake_db.tables['users'].selects == 1

    def test_a_held_answer_is_never_cached(self, fake_db):
        row = {'organization_id': 'org-1', 'role': 'org_managed',
               'org_role': 'parent', 'org_roles': ['parent'],
               'phone_verified_at': None}
        fake_db.tables['users'].select_results = [[dict(row)], [dict(row)]]
        with patch.object(hold, 'org_requires_verification', return_value=True):
            assert hold.is_blocked('u-1') is True
            assert hold.is_blocked('u-1') is True
        # Verifying must free them on the very next request, in every worker:
        # both calls hit the database.
        assert fake_db.tables['users'].selects == 2

    def test_a_lookup_error_fails_open(self, fake_db):
        with patch.object(hold, '_admin', side_effect=RuntimeError('db down')):
            assert hold.is_blocked('u-1') is False


# ── The number itself ────────────────────────────────────────────────────────

@pytest.mark.unit
class TestNormalizePhone:

    @pytest.mark.parametrize('raw,expected', [
        ('8015550123', '+18015550123'),
        ('801-555-0123', '+18015550123'),
        ('(801) 555-0123', '+18015550123'),
        ('1 801 555 0123', '+18015550123'),
        ('+18015550123', '+18015550123'),
        ('+447911123456', '+447911123456'),
    ])
    def test_accepted(self, raw, expected):
        assert svc.normalize_phone(raw) == expected

    @pytest.mark.parametrize('raw', ['', None, '555-0123', '80155501234567',
                                     'not a number', '+12'])
    def test_rejected(self, raw):
        assert svc.normalize_phone(raw) is None


# ── Sending ──────────────────────────────────────────────────────────────────

@pytest.mark.unit
class TestSendCode:

    def test_a_garbled_number_is_refused_before_any_sms(self, fake_db):
        with patch.object(svc.sms_service, 'send_sms') as send:
            payload, code = svc.send_code('u-1', '555-0123')
        assert code == 400
        send.assert_not_called()

    def test_happy_path_texts_the_code_and_stores_only_its_hash(self, fake_db):
        fake_db.tables['phone_verification_codes'].select_results = [[]]
        # Pin the provider: SMS_PROVIDER comes from the environment, so on a
        # machine whose .env names twilio_verify this test took the Twilio
        # branch and posted to the live Verify API instead of the patched send.
        with patch.object(svc.Config, 'SMS_PROVIDER', 'console'), \
             patch.object(svc.sms_service, 'send_sms', return_value=True) as send:
            payload, code = svc.send_code('u-1', '801-555-0123')
        assert code == 200 and payload['sent'] is True
        assert payload['phone'] == '••• ••• 0123'
        row = fake_db.tables['phone_verification_codes'].inserted[0]
        assert row['phone'] == '+18015550123'
        sms_text = send.call_args[0][1]
        # The code goes to the phone; the row holds a salted hash of it.
        sent_code = [w for w in sms_text.split() if w.strip('.').isdigit()][0].strip('.')
        assert sent_code not in row['code_hash']
        assert svc._hash_code(row['salt'], sent_code) == row['code_hash']

    def test_resend_inside_the_cooldown_is_refused(self, fake_db):
        fake_db.tables['phone_verification_codes'].select_results = [[
            {'id': 'c-1', 'created_at': _now().isoformat()}]]
        payload, code = svc.send_code('u-1', '801-555-0123')
        assert code == 429 and payload['retry_after'] >= 1

    def test_the_hourly_cap_holds(self, fake_db):
        stale = (_now() - timedelta(minutes=10)).isoformat()
        fake_db.tables['phone_verification_codes'].select_results = [[
            {'id': f'c-{i}', 'created_at': stale} for i in range(5)]]
        payload, code = svc.send_code('u-1', '801-555-0123')
        assert code == 429

    def test_a_failed_send_removes_the_code_it_could_not_deliver(self, fake_db):
        fake_db.tables['phone_verification_codes'].select_results = [[]]
        with patch.object(svc.Config, 'SMS_PROVIDER', 'console'), \
             patch.object(svc.sms_service, 'send_sms', return_value=False):
            payload, code = svc.send_code('u-1', '801-555-0123')
        assert code == 502
        # The undeliverable code must not survive to eat the rate limit.
        assert fake_db.tables['phone_verification_codes'].deleted == 1


# ── Verifying ────────────────────────────────────────────────────────────────

def _code_row(code='123456', **over):
    salt = 'a' * 32
    row = {'id': 'c-1', 'phone': '+18015550123', 'salt': salt,
           'code_hash': svc._hash_code(salt, code), 'attempts': 0,
           'expires_at': (_now() + timedelta(minutes=5)).isoformat(),
           'consumed_at': None}
    row.update(over)
    return row


@pytest.mark.unit
class TestVerifyCode:

    def test_the_right_code_verifies_and_stamps_the_user(self, fake_db):
        fake_db.tables['phone_verification_codes'].select_results = [[_code_row()]]
        payload, code = svc.verify_code('u-1', '123456')
        assert code == 200 and payload['verified'] is True
        assert fake_db.tables['phone_verification_codes'].updated[0]['consumed_at']
        stamped = fake_db.tables['users'].updated[0]
        assert stamped['phone_number'] == '+18015550123'
        assert stamped['phone_verified_at']

    def test_a_wrong_guess_costs_an_attempt(self, fake_db):
        fake_db.tables['phone_verification_codes'].select_results = [[_code_row()]]
        payload, code = svc.verify_code('u-1', '000000')
        assert code == 400
        assert fake_db.tables['phone_verification_codes'].updated[0]['attempts'] == 1
        # And the user was NOT stamped verified.
        assert fake_db.tables['users'].updated == []

    def test_attempts_run_out(self, fake_db):
        fake_db.tables['phone_verification_codes'].select_results = [[
            _code_row(attempts=svc.MAX_ATTEMPTS)]]
        payload, code = svc.verify_code('u-1', '123456')
        assert code == 400 and 'new code' in payload['error'].lower()

    def test_an_expired_code_is_dead_even_if_correct(self, fake_db):
        fake_db.tables['phone_verification_codes'].select_results = [[
            _code_row(expires_at=(_now() - timedelta(minutes=1)).isoformat())]]
        payload, code = svc.verify_code('u-1', '123456')
        assert code == 400 and 'expired' in payload['error'].lower()

    def test_no_code_in_flight_means_request_one(self, fake_db):
        fake_db.tables['phone_verification_codes'].select_results = [[]]
        payload, code = svc.verify_code('u-1', '123456')
        assert code == 400

    @pytest.mark.parametrize('garbage', ['', '12345', '1234567', 'abcdef',
                                         '12 456'])
    def test_non_codes_are_refused_without_a_lookup(self, fake_db, garbage):
        payload, code = svc.verify_code('u-1', garbage)
        assert code == 400
        assert fake_db.tables['phone_verification_codes'].selects == 0


# ── The Twilio Verify path (Twilio holds the code, we hold the hold) ─────────

def _twilio_row(**over):
    return _code_row(code_hash=svc.TWILIO_MARKER, salt='', **over)


@pytest.mark.unit
class TestTwilioVerifyPath:

    def test_sending_asks_twilio_and_stores_a_marker_row(self, fake_db):
        fake_db.tables['phone_verification_codes'].select_results = [[]]
        with patch.object(svc.Config, 'SMS_PROVIDER', 'twilio_verify'), \
             patch.object(svc.sms_service, 'start_twilio_verification',
                          return_value=True) as start:
            payload, code = svc.send_code('u-1', '801-555-0123')
        assert code == 200
        start.assert_called_once_with('+18015550123')
        row = fake_db.tables['phone_verification_codes'].inserted[0]
        # No code of ours exists, and no dev_code can leak one.
        assert row['code_hash'] == svc.TWILIO_MARKER
        assert 'dev_code' not in payload

    def test_a_refused_start_removes_the_row(self, fake_db):
        fake_db.tables['phone_verification_codes'].select_results = [[]]
        with patch.object(svc.Config, 'SMS_PROVIDER', 'twilio_verify'), \
             patch.object(svc.sms_service, 'start_twilio_verification',
                          return_value=False):
            payload, code = svc.send_code('u-1', '801-555-0123')
        assert code == 502
        assert fake_db.tables['phone_verification_codes'].deleted == 1

    def test_an_approved_check_verifies_and_stamps_the_user(self, fake_db):
        fake_db.tables['phone_verification_codes'].select_results = [[_twilio_row()]]
        with patch.object(svc.sms_service, 'check_twilio_verification',
                          return_value='approved') as check:
            payload, code = svc.verify_code('u-1', '123456')
        assert code == 200 and payload['verified'] is True
        check.assert_called_once_with('+18015550123', '123456')
        assert fake_db.tables['users'].updated[0]['phone_verified_at']

    def test_a_wrong_guess_costs_an_attempt_here_too(self, fake_db):
        fake_db.tables['phone_verification_codes'].select_results = [[_twilio_row()]]
        with patch.object(svc.sms_service, 'check_twilio_verification',
                          return_value='incorrect'):
            payload, code = svc.verify_code('u-1', '000000')
        assert code == 400
        assert fake_db.tables['phone_verification_codes'].updated[0]['attempts'] == 1
        assert fake_db.tables['users'].updated == []

    def test_twilio_expiry_reads_as_request_a_new_code(self, fake_db):
        fake_db.tables['phone_verification_codes'].select_results = [[_twilio_row()]]
        with patch.object(svc.sms_service, 'check_twilio_verification',
                          return_value='expired'):
            payload, code = svc.verify_code('u-1', '123456')
        assert code == 400 and 'expired' in payload['error'].lower()

    def test_a_twilio_outage_is_not_reported_as_a_wrong_code(self, fake_db):
        fake_db.tables['phone_verification_codes'].select_results = [[_twilio_row()]]
        with patch.object(svc.sms_service, 'check_twilio_verification',
                          return_value='error'):
            payload, code = svc.verify_code('u-1', '123456')
        assert code == 502
        # No attempt burned, no user stamped: the person did nothing wrong.
        assert fake_db.tables['phone_verification_codes'].updated == []
        assert fake_db.tables['users'].updated == []

    def test_a_row_sent_via_twilio_verifies_via_twilio_even_after_a_provider_flip(self, fake_db):
        # verify routes on the ROW's marker, not the current Config: a code
        # texted a minute before SMS_PROVIDER changed must still check out.
        fake_db.tables['phone_verification_codes'].select_results = [[_twilio_row()]]
        with patch.object(svc.Config, 'SMS_PROVIDER', 'brevo'), \
             patch.object(svc.sms_service, 'check_twilio_verification',
                          return_value='approved'):
            payload, code = svc.verify_code('u-1', '123456')
        assert code == 200
