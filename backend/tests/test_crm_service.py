"""
crm_service semantics — the behavioral contract ported from brevo_service:
one funnel per lead (first wins), no repeats of the same sequence, re-entry
into a different funnel allowed, converted/suppressed leads never enter,
conversion exits nurture but not onboarding, and the COPPA under-13 gate
fails closed (cases ported from test_brevo_course_student_age_gate.py).
"""
from datetime import date, timedelta
from unittest.mock import patch

import pytest

from services import crm_service
from tests.crm_fakes import make_world


@pytest.fixture
def world():
    return make_world()


@pytest.fixture(autouse=True)
def _wire_db(world):
    with patch.object(crm_service, '_db', return_value=world):
        yield


def _lead(world, email='lead@example.com'):
    rows = [r for r in world.data['crm_leads'] if r['email'] == email]
    return rows[0] if rows else None


def _memberships(world, lead_id=None):
    rows = world.data['crm_funnel_memberships']
    return [r for r in rows if lead_id is None or r['lead_id'] == lead_id]


@pytest.mark.unit
class TestSyncLead:
    def test_new_lead_enters_matching_funnel_and_returns_name(self, world):
        result = crm_service.sync_lead('Lead@Example.com', 'claim_free_class',
                                       name='Jordan Woods')
        assert result == 'Free Class Nurture'
        lead = _lead(world)
        assert lead is not None  # lowercased
        assert lead['first_name'] == 'Jordan'
        assert lead['last_name'] == 'Woods'
        assert lead['lead_source'] == 'classes_lp'
        assert len(_memberships(world, lead['id'])) == 1

    def test_paused_funnel_still_enters_but_reports_no_automation(self, world):
        world.data['crm_funnels'][0]['status'] = 'paused'
        result = crm_service.sync_lead('lead@example.com', 'claim_free_class')
        assert result is None
        assert len(_memberships(world)) == 1  # positioned for activation

    def test_placeholder_name_is_not_a_name(self, world):
        crm_service.sync_lead('lead@example.com', 'claim_free_class',
                              name='Free Class Lead')
        assert _lead(world)['first_name'] is None

    def test_unmapped_type_creates_lead_only(self, world):
        result = crm_service.sync_lead('b2b@example.com', 'sales', name='Biz Dev')
        assert result is None
        assert _lead(world, 'b2b@example.com') is not None
        assert _memberships(world) == []

    def test_first_funnel_wins(self, world):
        world.data['crm_funnels'].append({
            'id': 'funnel-2', 'key': 'families_nurture', 'name': 'Families Nurture',
            'status': 'active', 'funnel_type': 'nurture', 'entry_types': ['families'],
        })
        assert crm_service.sync_lead('lead@example.com', 'claim_free_class') \
            == 'Free Class Nurture'
        assert crm_service.sync_lead('lead@example.com', 'families') is None
        assert len(_memberships(world)) == 1

    def test_no_repeat_of_a_completed_sequence(self, world):
        crm_service.sync_lead('lead@example.com', 'claim_free_class')
        membership = _memberships(world)[0]
        membership['status'] = 'completed'
        assert crm_service.sync_lead('lead@example.com', 'claim_free_class') is None
        assert len(_memberships(world)) == 1

    def test_reentry_into_a_different_funnel_after_exit(self, world):
        world.data['crm_funnels'].append({
            'id': 'funnel-2', 'key': 'families_nurture', 'name': 'Families Nurture',
            'status': 'active', 'funnel_type': 'nurture', 'entry_types': ['families'],
        })
        crm_service.sync_lead('lead@example.com', 'claim_free_class')
        _memberships(world)[0]['status'] = 'completed'
        assert crm_service.sync_lead('lead@example.com', 'families') \
            == 'Families Nurture'
        assert len(_memberships(world)) == 2

    def test_suppressed_email_never_enters(self, world):
        world.data['crm_suppressions'].append({'id': 's1',
                                               'email': 'lead@example.com',
                                               'reason': 'unsubscribe'})
        assert crm_service.sync_lead('lead@example.com', 'claim_free_class') is None
        assert _memberships(world) == []

    def test_converted_lead_never_reenters(self, world):
        crm_service.sync_lead('lead@example.com', 'claim_free_class')
        crm_service.mark_converted('lead@example.com')
        assert crm_service.sync_lead('lead@example.com', 'claim_free_class') is None
        assert all(m['status'] != 'active' for m in _memberships(world))


@pytest.mark.unit
class TestMarkConverted:
    def test_exits_nurture_and_stamps_lead(self, world):
        crm_service.sync_lead('lead@example.com', 'claim_free_class')
        crm_service.mark_converted('LEAD@example.com', event='class_start')
        lead = _lead(world)
        assert lead['status'] == 'converted'
        assert lead['conversion_event'] == 'class_start'
        membership = _memberships(world, lead['id'])[0]
        assert membership['status'] == 'exited'
        assert membership['exit_reason'] == 'converted_class_start'

    def test_onboarding_memberships_survive_conversion(self, world):
        world.data['crm_funnels'][0]['funnel_type'] = 'onboarding'
        crm_service.sync_lead('lead@example.com', 'claim_free_class')
        crm_service.mark_converted('lead@example.com')
        assert _memberships(world)[0]['status'] == 'active'

    def test_unknown_email_is_a_noop(self, world):
        crm_service.mark_converted('nobody@example.com')  # must not raise
        assert world.data['crm_leads'] == []

    def test_unsubscribed_lead_stays_unsubscribed(self, world):
        crm_service.sync_lead('lead@example.com', 'claim_free_class')
        _lead(world)['status'] = 'unsubscribed'
        crm_service.mark_converted('lead@example.com')
        assert _lead(world)['status'] == 'unsubscribed'


@pytest.mark.unit
class TestNewAccountAndOnboarding:
    def test_new_account_converts_and_enters_welcome(self, world):
        world.data['crm_funnels'].append({
            'id': 'funnel-w', 'key': 'new_account_welcome', 'name': 'New Account Welcome',
            'status': 'active', 'funnel_type': 'onboarding', 'entry_types': [],
        })
        crm_service.sync_lead('lead@example.com', 'claim_free_class')
        result = crm_service.sync_new_account('lead@example.com', 'Jordan', 'Woods',
                                              role='parent')
        assert result == 'New Account Welcome'
        lead = _lead(world)
        assert lead['status'] == 'converted'
        statuses = {m['funnel_id']: m['status'] for m in _memberships(world, lead['id'])}
        assert statuses['funnel-1'] == 'exited'
        assert statuses['funnel-w'] == 'active'

    def test_missing_welcome_funnel_still_converts(self, world):
        crm_service.sync_lead('lead@example.com', 'claim_free_class')
        assert crm_service.sync_new_account('lead@example.com') is None
        assert _lead(world)['status'] == 'converted'


@pytest.mark.unit
class TestCourseStudentAgeGate:
    """Ported from test_brevo_course_student_age_gate.py: the gate fails
    CLOSED — only a known, verifiable 13+ account may be synced."""

    def _users_db(self, world, rows):
        world.data['users'] = rows
        return patch('database.get_supabase_admin_client', return_value=world)

    def test_no_account_skips_sync(self, world):
        world.data['crm_funnels'].append({
            'id': 'funnel-c', 'key': 'course_student_onboarding', 'name': 'Course Onboarding',
            'status': 'active', 'funnel_type': 'onboarding', 'entry_types': [],
        })
        with self._users_db(world, []):
            assert crm_service.sync_course_student('kid@example.com') is None
        assert world.data['crm_leads'] == []

    def test_under_13_dob_skips_sync(self, world):
        dob = (date.today() - timedelta(days=10 * 365)).isoformat()
        with self._users_db(world, [{'email': 'kid@example.com',
                                     'requires_parental_consent': False,
                                     'date_of_birth': dob}]):
            assert crm_service.sync_course_student('kid@example.com') is None

    def test_consent_flag_skips_sync(self, world):
        with self._users_db(world, [{'email': 'kid@example.com',
                                     'requires_parental_consent': True,
                                     'date_of_birth': None}]):
            assert crm_service.sync_course_student('kid@example.com') is None

    def test_adult_enters_onboarding(self, world):
        world.data['crm_funnels'].append({
            'id': 'funnel-c', 'key': 'course_student_onboarding', 'name': 'Course Onboarding',
            'status': 'active', 'funnel_type': 'onboarding', 'entry_types': [],
        })
        dob = (date.today() - timedelta(days=20 * 365)).isoformat()
        with self._users_db(world, [{'email': 'teen@example.com',
                                     'requires_parental_consent': False,
                                     'date_of_birth': dob}]):
            assert crm_service.sync_course_student('teen@example.com', 'Sam') \
                == 'Course Onboarding'

    def test_lookup_failure_fails_closed(self, world):
        with patch('database.get_supabase_admin_client',
                   side_effect=RuntimeError('db down')):
            assert crm_service.sync_course_student('kid@example.com') is None


@pytest.mark.unit
class TestRecordClassStart:
    def test_resolves_email_and_converts(self, world):
        crm_service.sync_lead('lead@example.com', 'claim_free_class')
        world.data['users'] = [{'id': 'user-1', 'email': 'lead@example.com'}]
        crm_service.record_class_start('user-1')
        assert _lead(world)['status'] == 'converted'
        assert _lead(world)['conversion_event'] == 'class_start'

    def test_unknown_user_is_a_noop(self, world):
        crm_service.record_class_start('missing-user')  # must not raise
