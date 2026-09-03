"""
Funnel-engine sweep semantics: delay-from-entry due math, the send window,
the postal-address compliance gate, claim-based at-most-once sends, the 20h
backlog throttle, completion on the last step, the users-row safety net, and
the unsubscribe flow.
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from services import crm_funnel_engine as engine
from tests.crm_fakes import make_world


def _iso(dt):
    return dt.isoformat()


def _now():
    return datetime.now(timezone.utc)


@pytest.fixture
def world():
    return make_world()


@pytest.fixture(autouse=True)
def _wire(world):
    sent = []

    def fake_send(**kwargs):
        sent.append(kwargs)
        return f"msg-{len(sent)}"

    with patch.object(engine, '_db', return_value=world), \
         patch('services.crm_service._db', return_value=world), \
         patch('services.email_service.email_service.send_crm_email',
               side_effect=fake_send):
        world.sent = sent
        yield


def _add_lead(world, email='lead@example.com', entered_hours_ago=2.0,
              last_step_sent=0, last_sent_at=None, lead_status='active'):
    lead = {'id': f'lead-{email}', 'email': email, 'status': lead_status,
            'first_name': 'Jordan', 'last_name': None,
            'unsubscribe_token': f'token-{email}'}
    world.data['crm_leads'].append(lead)
    membership = {
        'id': f'm-{email}', 'lead_id': lead['id'], 'funnel_id': 'funnel-1',
        'status': 'active', 'last_step_sent': last_step_sent,
        'entered_at': _iso(_now() - timedelta(hours=entered_hours_ago)),
        'last_sent_at': last_sent_at, 'created_at': _iso(_now()),
    }
    world.data['crm_funnel_memberships'].append(membership)
    return lead, membership


@pytest.mark.unit
class TestSweepDueMath:
    def test_due_step_sends_and_advances(self, world):
        lead, membership = _add_lead(world, entered_hours_ago=2)
        result = engine.run_sweep()
        assert result['sent'] == 1
        send = world.sent[0]
        assert send['to_email'] == 'lead@example.com'
        assert 'Hello Jordan' in send['html_body']
        assert send['subject'] == 'Hi Jordan'
        assert send['funnel_key'] == 'free_class_nurture'
        assert membership['last_step_sent'] == 1
        assert membership['status'] == 'active'  # step 2 remains
        rows = world.data['crm_sends']
        assert rows[0]['status'] == 'sent'
        assert rows[0]['provider_message_id'] == 'msg-1'

    def test_not_due_yet_waits(self, world):
        _add_lead(world, entered_hours_ago=0.5)  # step 1 needs 1h from entry
        assert engine.run_sweep()['sent'] == 0

    def test_throttle_blocks_second_email_same_day(self, world):
        _add_lead(world, entered_hours_ago=100, last_step_sent=1,
                  last_sent_at=_iso(_now() - timedelta(hours=5)))
        assert engine.run_sweep()['sent'] == 0

    def test_backlog_drains_after_throttle_window(self, world):
        lead, membership = _add_lead(world, entered_hours_ago=100, last_step_sent=1,
                                     last_sent_at=_iso(_now() - timedelta(hours=21)))
        result = engine.run_sweep()
        assert result['sent'] == 1
        assert membership['last_step_sent'] == 2
        assert membership['status'] == 'completed'  # step 2 was the last

    def test_claim_uniqueness_prevents_double_send(self, world):
        lead, membership = _add_lead(world, entered_hours_ago=2)
        world.data['crm_sends'].append({
            'id': 'prior', 'membership_id': membership['id'], 'lead_id': lead['id'],
            'funnel_id': 'funnel-1', 'step_id': 'step-1', 'email': lead['email'],
            'status': 'sent', 'created_at': _iso(_now()),
        })
        result = engine.run_sweep()
        assert result['sent'] == 0
        assert world.sent == []

    def test_deactivated_step_is_skipped_over(self, world):
        world.data['crm_funnel_steps'][0]['is_active'] = False
        lead, membership = _add_lead(world, entered_hours_ago=49)
        result = engine.run_sweep()
        assert result['sent'] == 1
        assert membership['last_step_sent'] == 2  # went straight to step 2

    def test_provider_failure_marks_send_failed(self, world):
        _add_lead(world, entered_hours_ago=2)
        with patch('services.email_service.email_service.send_crm_email',
                   return_value=None):
            result = engine.run_sweep()
        assert result['failed'] == 1
        assert world.data['crm_sends'][0]['status'] == 'failed'


@pytest.mark.unit
class TestSweepGates:
    def test_outside_send_window_noops(self, world):
        world.data['crm_settings'][0]['value'] = {
            'tz': 'America/Denver', 'start_hour': 9, 'end_hour': 19}
        _add_lead(world, entered_hours_ago=2)
        three_am_denver = datetime(2026, 8, 22, 9, 0, tzinfo=timezone.utc)  # 03:00 MDT
        result = engine.run_sweep(now=three_am_denver)
        assert result == {'skipped': 'outside_send_window', 'sent': 0}

    def test_missing_postal_address_refuses_to_send(self, world):
        world.data['crm_settings'] = [s for s in world.data['crm_settings']
                                      if s['key'] != 'postal_address']
        _add_lead(world, entered_hours_ago=2)
        assert engine.run_sweep()['skipped'] == 'postal_address_missing'
        assert world.sent == []

    def test_suppressed_lead_exits_without_sending(self, world):
        lead, membership = _add_lead(world, entered_hours_ago=2)
        world.data['crm_suppressions'].append({'id': 's1', 'email': lead['email'],
                                               'reason': 'hard_bounce'})
        engine.run_sweep()
        assert world.sent == []
        assert membership['status'] == 'exited'
        assert membership['exit_reason'] == 'suppressed'

    def test_users_row_safety_net_converts_instead_of_sending(self, world):
        lead, membership = _add_lead(world, entered_hours_ago=2)
        world.data['users'] = [{'id': 'u1', 'email': lead['email']}]
        engine.run_sweep()
        assert world.sent == []
        assert membership['status'] == 'exited'
        assert membership['exit_reason'] == 'converted_signup'
        assert [l for l in world.data['crm_leads']
                if l['id'] == lead['id']][0]['status'] == 'converted'

    def test_transient_suppression_lookup_failure_skips_without_exiting(self, world):
        """A suppression read that errors must not read as "suppressed" —
        that is a permanent exit, and a DB hiccup would empty the funnels."""
        lead, membership = _add_lead(world, entered_hours_ago=2)
        with patch('services.crm_service.suppression_state', return_value=None):
            result = engine.run_sweep()
        assert world.sent == []
        assert result['sent'] == 0
        assert membership['status'] == 'active'
        assert membership.get('exit_reason') is None


@pytest.mark.unit
class TestOnboardingFunnels:
    """An onboarding sequence exists BECAUSE its member converted, so a
    'converted' lead is the normal case there — not a reason to stop.

    Regression: until 2026-09-03 the sweep exited every membership whose lead
    was not 'active', which killed all 64 welcome/course-onboarding
    memberships on their first due step without sending one email.
    """

    def _make_onboarding(self, world, lead_status='converted'):
        world.data['crm_funnels'][0].update(
            {'key': 'new_account_welcome', 'name': 'New Account Welcome',
             'funnel_type': 'onboarding', 'entry_types': []})
        return _add_lead(world, entered_hours_ago=2, lead_status=lead_status)

    def test_converted_lead_still_receives_onboarding(self, world):
        lead, membership = self._make_onboarding(world)
        result = engine.run_sweep()
        assert result['sent'] == 1
        assert world.sent[0]['funnel_key'] == 'new_account_welcome'
        assert membership['status'] == 'active'
        assert membership['last_step_sent'] == 1

    def test_account_holder_does_not_short_circuit_onboarding(self, world):
        """The users-row safety net converts nurture leads. Onboarding
        members all have a users row by definition."""
        lead, membership = self._make_onboarding(world)
        world.data['users'] = [{'id': 'u1', 'email': lead['email']}]
        assert engine.run_sweep()['sent'] == 1
        assert membership['status'] == 'active'

    def test_unsubscribed_lead_exits_onboarding(self, world):
        lead, membership = self._make_onboarding(world, lead_status='unsubscribed')
        engine.run_sweep()
        assert world.sent == []
        assert membership['status'] == 'exited'
        assert membership['exit_reason'] == 'lead_unsubscribed'

    def test_converted_lead_still_exits_a_nurture_funnel(self, world):
        lead, membership = _add_lead(world, entered_hours_ago=2,
                                     lead_status='converted')
        engine.run_sweep()
        assert world.sent == []
        assert membership['status'] == 'exited'
        assert membership['exit_reason'] == 'lead_converted'


@pytest.mark.unit
class TestSweepClaims:
    def test_stale_sending_claim_fails_and_never_retries(self, world):
        lead, membership = _add_lead(world, entered_hours_ago=2)
        world.data['crm_sends'].append({
            'id': 'stale', 'membership_id': membership['id'], 'lead_id': lead['id'],
            'funnel_id': 'funnel-1', 'step_id': 'step-1', 'email': lead['email'],
            'status': 'sending',
            'created_at': _iso(_now() - timedelta(hours=2)),
        })
        result = engine.run_sweep()
        stale = [s for s in world.data['crm_sends'] if s['id'] == 'stale'][0]
        assert stale['status'] == 'failed'
        assert result['sent'] == 0  # the claim row still blocks a resend

    def test_batch_cap_limits_sends_per_run(self, world):
        world.data['crm_settings'] = [s for s in world.data['crm_settings']
                                      if s['key'] != 'sweep_batch_cap']
        world.data['crm_settings'].append({'key': 'sweep_batch_cap', 'value': 2})
        for i in range(4):
            _add_lead(world, email=f'lead{i}@example.com', entered_hours_ago=2)
        assert engine.run_sweep()['sent'] == 2


@pytest.mark.unit
class TestRendering:
    def test_footer_and_unsubscribe_injected(self, world):
        _add_lead(world, entered_hours_ago=2)
        engine.run_sweep()
        html = world.sent[0]['html_body']
        assert '123 Test St' in html
        assert '/api/crm/unsubscribe?token=token-lead@example.com' in html
        assert world.sent[0]['unsubscribe_url'].endswith('token-lead@example.com')

    def test_render_variants_and_escaping(self):
        lead = {'first_name': '<b>Jo</b>', 'last_name': None, 'email': 'a@b.c'}
        out = engine.render_step_content(
            'Hi {{ first_name }} / {{first_name}} / {{unknown_token}} / {{unsubscribe_url}}',
            lead, 'https://u.example')
        assert '&lt;b&gt;Jo&lt;/b&gt;' in out
        assert '{{unknown_token}}' in out
        assert 'https://u.example' in out

    def test_missing_first_name_falls_back_to_there(self):
        out = engine.render_step_content('Hi {{first_name}}', {}, '#')
        assert out == 'Hi there'

    def test_footer_lands_inside_body_when_present(self):
        html = engine._with_footer('<html><body><p>x</p></body></html>', '<F>')
        assert html.index('<F>') < html.index('</body>')


@pytest.mark.unit
class TestUnsubscribe:
    def test_valid_token_suppresses_exits_and_marks(self, world):
        lead, membership = _add_lead(world, entered_hours_ago=2)
        assert engine.unsubscribe_by_token(lead['unsubscribe_token']) is True
        assert any(s['email'] == lead['email']
                   for s in world.data['crm_suppressions'])
        assert membership['status'] == 'exited'
        assert membership['exit_reason'] == 'unsubscribed'
        assert [l for l in world.data['crm_leads']
                if l['id'] == lead['id']][0]['status'] == 'unsubscribed'

    def test_converted_lead_keeps_converted_status(self, world):
        lead, _ = _add_lead(world, entered_hours_ago=2, lead_status='converted')
        engine.unsubscribe_by_token(lead['unsubscribe_token'])
        assert [l for l in world.data['crm_leads']
                if l['id'] == lead['id']][0]['status'] == 'converted'
        assert any(s['email'] == lead['email']
                   for s in world.data['crm_suppressions'])

    def test_unknown_token_returns_false(self, world):
        assert engine.unsubscribe_by_token('nope') is False

    def test_double_unsubscribe_is_idempotent(self, world):
        lead, _ = _add_lead(world, entered_hours_ago=2)
        assert engine.unsubscribe_by_token(lead['unsubscribe_token']) is True
        assert engine.unsubscribe_by_token(lead['unsubscribe_token']) is True
        assert len([s for s in world.data['crm_suppressions']
                    if s['email'] == lead['email']]) == 1
