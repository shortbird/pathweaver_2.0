"""
Recovery funnels: a parent who began a school's registration and stopped
enters the funnel from the sweep, gets emails while the registration stays
open, and leaves the moment it completes.

The two failure modes this guards: the sweep's "has an account, so
converted" safety net exiting every recovery member before the first email
(the registration funnel creates the parent's account on step one), and a
family who finished registering still being told to finish.
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from services import crm_funnel_engine as engine
from services.crm_service import mark_converted
from tests.crm_fakes import make_world

ORG_ID = 'org-academy'
FUNNEL_ID = 'funnel-recovery'


def _now():
    return datetime.now(timezone.utc)


@pytest.fixture
def world():
    db = make_world()
    db.data['crm_funnels'].append({
        'id': FUNNEL_ID, 'key': 'academy_registration_recovery',
        'name': 'Optio Academy Registration Recovery', 'status': 'active',
        'funnel_type': 'recovery', 'entry_types': [], 'description': None,
        'created_at': _now().isoformat(), 'updated_at': _now().isoformat(),
    })
    db.data['crm_funnel_steps'].extend([
        {'id': 'rstep-1', 'funnel_id': FUNNEL_ID, 'step_order': 1, 'name': 'Saved',
         'subject': 'Your registration is saved', 'html_body': '<p>Hi {{first_name}}</p>',
         'text_body': None, 'delay_hours': 0, 'is_active': True},
        {'id': 'rstep-2', 'funnel_id': FUNNEL_ID, 'step_order': 2, 'name': 'Questions',
         'subject': 'Questions?', 'html_body': '<p>Questions</p>',
         'text_body': None, 'delay_hours': 72, 'is_active': True},
    ])
    db.data['organizations'] = [{'id': ORG_ID, 'slug': 'optio-academy'},
                                {'id': 'org-other', 'slug': 'icreate'}]
    db.data['registrations'] = []
    return db


@pytest.fixture(autouse=True)
def _wire(world):
    sent = []

    def fake_send(**kwargs):
        sent.append(kwargs)
        return f'msg-{len(sent)}'

    with patch.object(engine, '_db', return_value=world), \
         patch('services.crm_service._db', return_value=world), \
         patch('services.email_service.email_service.send_crm_email',
               side_effect=fake_send):
        world.sent = sent
        yield


def _add_registration(world, email='parent@example.com', status='family',
                      idle_hours=5.0, org_id=ORG_ID):
    user_id = f'user-{email}'
    if not any(u['id'] == user_id for u in world.data['users']):
        world.data['users'].append({'id': user_id, 'email': email,
                                    'first_name': 'Dana', 'last_name': 'Reyes'})
    touched = (_now() - timedelta(hours=idle_hours)).isoformat()
    reg = {'id': f'reg-{email}-{org_id}', 'organization_id': org_id,
           'parent_user_id': user_id, 'status': status,
           'created_at': touched, 'updated_at': touched}
    world.data['registrations'].append(reg)
    return reg


def _recovery_memberships(world):
    return [m for m in world.data['crm_funnel_memberships']
            if m['funnel_id'] == FUNNEL_ID]


@pytest.mark.unit
class TestEnrollment:
    def test_stalled_registration_enters_and_gets_first_email(self, world):
        _add_registration(world)
        engine.run_sweep()
        [membership] = _recovery_memberships(world)
        # Entry is stamped after the sweep read its clock, so the first email
        # goes on the next run (ten minutes later in production).
        result = engine.run_sweep(now=_now() + timedelta(minutes=10))
        assert membership['last_step_sent'] == 1
        assert result['sent'] == 1
        assert world.sent[0]['to_email'] == 'parent@example.com'
        assert world.sent[0]['funnel_key'] == 'academy_registration_recovery'
        lead = world.data['crm_leads'][0]
        assert lead['first_name'] == 'Dana'
        assert lead['lead_source'] == 'registration_started'

    def test_a_registration_still_in_progress_is_left_alone(self, world):
        _add_registration(world, idle_hours=1)
        engine.run_sweep()
        assert _recovery_memberships(world) == []

    def test_completed_and_legacy_statuses_never_enter(self, world):
        _add_registration(world, email='a@example.com', status='completed')
        _add_registration(world, email='b@example.com', status='schedule')
        engine.run_sweep()
        assert _recovery_memberships(world) == []

    def test_registration_older_than_the_window_never_enters(self, world):
        _add_registration(world, idle_hours=24 * 45)
        engine.run_sweep()
        assert _recovery_memberships(world) == []

    def test_other_orgs_registrations_never_enter(self, world):
        _add_registration(world, org_id='org-other')
        engine.run_sweep()
        assert _recovery_memberships(world) == []

    def test_paused_funnel_enrolls_nobody(self, world):
        world.data['crm_funnels'][-1]['status'] = 'paused'
        _add_registration(world)
        engine.run_sweep()
        assert _recovery_memberships(world) == []

    def test_a_lead_runs_the_sequence_once(self, world):
        _add_registration(world)
        engine.run_sweep()
        _recovery_memberships(world)[0]['status'] = 'completed'
        engine.run_sweep()
        assert len(_recovery_memberships(world)) == 1

    def test_suppressed_address_never_enters(self, world):
        world.data['crm_suppressions'].append(
            {'id': 's1', 'email': 'parent@example.com', 'reason': 'bounce'})
        _add_registration(world)
        engine.run_sweep()
        assert _recovery_memberships(world) == []
        assert world.sent == []

    def test_registration_displaces_a_nurture_sequence(self, world):
        world.data['crm_leads'].append({
            'id': 'lead-1', 'email': 'parent@example.com', 'status': 'active',
            'first_name': 'Dana', 'last_name': None, 'lead_type': 'claim_free_class',
            'lead_source': 'classes_lp', 'unsubscribe_token': 'tok'})
        world.data['crm_funnel_memberships'].append({
            'id': 'm-nurture', 'lead_id': 'lead-1', 'funnel_id': 'funnel-1',
            'status': 'active', 'last_step_sent': 0,
            'entered_at': _now().isoformat(), 'last_sent_at': None})
        _add_registration(world)
        engine.run_sweep()
        nurture = next(m for m in world.data['crm_funnel_memberships']
                       if m['id'] == 'm-nurture')
        assert nurture['status'] == 'exited'
        assert nurture['exit_reason'] == 'registration_started'
        assert len(_recovery_memberships(world)) == 1


@pytest.mark.unit
class TestSendGates:
    def _enrolled(self, world, lead_status='active'):
        """One recovery member whose step 1 went out three days ago, so step
        2 is due on this sweep."""
        reg = _add_registration(world, idle_hours=24 * 4)
        world.data['crm_leads'].append({
            'id': 'lead-1', 'email': 'parent@example.com', 'status': lead_status,
            'first_name': 'Dana', 'last_name': None, 'unsubscribe_token': 'tok'})
        membership = {
            'id': 'm-1', 'lead_id': 'lead-1', 'funnel_id': FUNNEL_ID,
            'status': 'active', 'last_step_sent': 1,
            'entered_at': (_now() - timedelta(hours=80)).isoformat(),
            'last_sent_at': (_now() - timedelta(hours=79)).isoformat()}
        world.data['crm_funnel_memberships'].append(membership)
        return reg, membership

    def test_account_holder_still_receives_recovery_email(self, world):
        """Every recovery member has a users row. The nurture safety net
        converting them would end the sequence before it starts."""
        _, membership = self._enrolled(world)
        assert engine.run_sweep()['sent'] == 1
        assert membership['last_step_sent'] == 2
        assert world.data['crm_leads'][0]['status'] == 'active'

    def test_converted_lead_still_receives_recovery_email(self, world):
        _, membership = self._enrolled(world, lead_status='converted')
        assert engine.run_sweep()['sent'] == 1
        assert membership['last_step_sent'] == 2

    def test_finished_registration_exits_before_the_next_email(self, world):
        reg, membership = self._enrolled(world)
        reg['status'] = 'completed'
        engine.run_sweep()
        assert world.sent == []
        assert membership['status'] == 'exited'
        assert membership['exit_reason'] == 'registration_completed'

    def test_unsubscribed_lead_exits(self, world):
        _, membership = self._enrolled(world, lead_status='unsubscribed')
        engine.run_sweep()
        assert world.sent == []
        assert membership['exit_reason'] == 'lead_unsubscribed'

    def test_failed_registration_lookup_retries_instead_of_exiting(self, world):
        _, membership = self._enrolled(world)
        with patch('services.crm_registration_recovery._org_id',
                   side_effect=RuntimeError('db down')):
            result = engine.run_sweep()
        assert world.sent == []
        assert membership['status'] == 'active'
        assert result['skipped'] >= 1

    def test_a_class_start_does_not_end_the_recovery_sequence(self, world):
        """Conversion exits nurture sequences. Starting a class is not
        finishing the registration, so recovery keeps going."""
        _, membership = self._enrolled(world)
        mark_converted('parent@example.com', event='class_start')
        assert membership['status'] == 'active'
