"""
Optio Academy onboarding emails (2026-10-12): copy that varies with the
registration answers, a welcome sent the moment registration completes, a
welcome of their own for teens who sign in themselves, and the generic
learner welcome kept away from Academy families.

What went wrong before: the diploma-credit email reached the parent of an
8th grader, the day-8 check-in pitched the $500 teacher to a family that had
asked about one the day before, a parent who had just started registering got
"start a class about something that interests you", and a family finishing
at 9 pm heard nothing from Dr. Bowman until the next morning.
"""
import re
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from services import crm_funnel_engine as engine
from services import crm_registration_recovery as recovery
from services.crm_registration_segments import SEGMENTS, segments_for_registration
from tests.crm_fakes import make_world

ORG_ID = 'org-academy'
WELCOME_ID = 'funnel-academy-welcome'
STUDENT_ID = 'funnel-academy-student'
BLOCKS = ('<p>Hi {{first_name}}, about {{student_names}}.</p>'
          '{{#if high_school}}<p>HS credit</p>{{/if}}'
          '{{#if k8}}<p>K8 record</p>{{/if}}'
          '{{#unless teacher_added}}<p>Teacher pitch</p>{{/unless}}')


def _now():
    return datetime.now(timezone.utc)


def _kid(kid_id, grade_email=None, **extra):
    return {'user_id': kid_id, 'first_name': kid_id.title(), 'email': grade_email or '',
            'add_ons': [], **extra}


def _answers(grades, teacher=None, schools=None):
    return {
        'grade_level': grades,
        'teacher_support': teacher or {k: [] for k in grades},
        'prior_school': schools or {k: '' for k in grades},
    }


@pytest.fixture
def world():
    db = make_world()
    for fid, key in ((WELCOME_ID, 'academy_parent_welcome'),
                     (STUDENT_ID, 'academy_student_welcome')):
        db.data['crm_funnels'].append({
            'id': fid, 'key': key, 'name': key, 'status': 'active',
            'funnel_type': 'onboarding', 'entry_types': [], 'description': None,
            'created_at': _now().isoformat(), 'updated_at': _now().isoformat()})
        db.data['crm_funnel_steps'].append({
            'id': f'{fid}-1', 'funnel_id': fid, 'step_order': 1, 'name': 'Welcome',
            'subject': 'Welcome{{#if high_school}} (HS){{/if}}', 'html_body': BLOCKS,
            'text_body': None, 'delay_hours': 0, 'is_active': True})
    db.data['organizations'] = [{'id': ORG_ID, 'slug': 'optio-academy'}]
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
         patch('services.email_service.email_service.send_crm_email', side_effect=fake_send):
        world.sent = sent
        yield


def _complete(world, kids, answers, email='parent@example.com', hours_ago=1):
    user_id = f'user-{email}'
    world.data['users'].append({'id': user_id, 'email': email, 'first_name': 'Dana',
                                'last_name': 'Reyes', 'role': 'parent'})
    at = (_now() - timedelta(hours=hours_ago)).isoformat()
    reg = {'id': f'reg-{email}', 'organization_id': ORG_ID, 'parent_user_id': user_id,
           'status': 'completed', 'kids': kids, 'answers': answers,
           'created_at': at, 'updated_at': at, 'completed_at': at}
    world.data['registrations'].append(reg)
    return reg


def _two_sweeps():
    """Entry happens inside a sweep; the first step is due from the next one."""
    engine.run_sweep()
    engine.run_sweep()


def _sent_to(world, email):
    return [s for s in world.sent if s['to_email'] == email]


@pytest.mark.unit
class TestRenderBlocks:
    def test_if_and_unless_follow_the_segments(self):
        out = engine.render_step_content(BLOCKS, {'first_name': 'Dana'}, '#',
                                         {'high_school': True, 'teacher_added': True,
                                          'student_names': 'Ava'})
        assert 'HS credit' in out and 'K8 record' not in out
        assert 'Teacher pitch' not in out
        assert 'about Ava' in out

    def test_a_funnel_without_a_registration_drops_every_if(self):
        out = engine.render_step_content(BLOCKS, {}, '#', {})
        assert 'HS credit' not in out and 'K8 record' not in out
        assert 'Teacher pitch' in out
        assert 'about your student' in out
        assert '{{' not in out

    def test_a_test_send_shows_every_variant_labelled(self):
        out = engine.render_step_content(BLOCKS, {}, '#', None)
        for text in ('HS credit', 'K8 record', 'Teacher pitch'):
            assert text in out
        assert '[Only if high_school]' in out
        assert '[Only if not teacher_added]' in out

    def test_student_names_are_escaped(self):
        out = engine.render_step_content('{{student_names}}', {}, '#',
                                         {'student_names': '<b>x</b>'})
        assert '<b>' not in out


@pytest.mark.unit
class TestSegments:
    def test_grade_bands_teacher_and_logins(self):
        reg = {'kids': [_kid('ava', 'ava@example.com'), _kid('ben')],
               'answers': _answers({'ava': '10th', 'ben': '7th'},
                                   teacher={'ava': ['Yes'], 'ben': []},
                                   schools={'ava': 'Lincoln High', 'ben': ''})}
        seg = segments_for_registration(reg)
        assert seg['high_school'] and seg['k8']
        assert seg['teacher_interest'] and not seg['teacher_added'] and not seg['teacher_none']
        assert seg['own_login'] and seg['managed_login']
        assert seg['prior_school'] and seg['several_students']
        assert seg['student_names'] == 'Ava and Ben'

    def test_a_bought_teacher_is_not_an_interest(self):
        reg = {'kids': [_kid('ava', add_ons=['teacher_support'])],
               'answers': _answers({'ava': '9th'}, teacher={'ava': ['Yes']})}
        seg = segments_for_registration(reg)
        assert seg['teacher_added'] and not seg['teacher_interest'] and not seg['teacher_none']

    def test_one_students_own_segments(self):
        reg = {'kids': [_kid('ava'), _kid('ben')],
               'answers': _answers({'ava': '10th', 'ben': '3rd'})}
        seg = segments_for_registration(reg, kid_ids=['ben'])
        assert not seg['high_school'] and seg['k8'] and seg['teacher_none']
        assert seg['student_names'] == 'Ben'


@pytest.mark.unit
class TestParentWelcome:
    def test_an_8th_graders_parent_gets_no_high_school_copy(self, world):
        _complete(world, [_kid('ava')], _answers({'ava': '8th'}))
        _two_sweeps()
        [email] = _sent_to(world, 'parent@example.com')
        assert 'K8 record' in email['html_body'] and 'HS credit' not in email['html_body']
        assert email['subject'] == 'Welcome'

    def test_a_high_schoolers_parent_gets_the_credit_copy(self, world):
        _complete(world, [_kid('ava')], _answers({'ava': '11th'}))
        _two_sweeps()
        [email] = _sent_to(world, 'parent@example.com')
        assert 'HS credit' in email['html_body']
        assert email['subject'] == 'Welcome (HS)'

    def test_a_failed_lookup_waits_instead_of_sending_generic_copy(self, world):
        _complete(world, [_kid('ava')], _answers({'ava': '11th'}))
        with patch('services.crm_registration_segments.RegistrationRepository.newest_full_for_parent',
                   side_effect=RuntimeError('db down')):
            _two_sweeps()
        assert _sent_to(world, 'parent@example.com') == []

    def test_send_welcome_now_ignores_the_send_window(self, world):
        _complete(world, [_kid('ava')], _answers({'ava': '11th'}))
        window = next(s for s in world.data['crm_settings'] if s['key'] == 'send_window')
        window['value'] = {'tz': 'America/Denver', 'start_hour': 0, 'end_hour': 0}
        assert engine.run_sweep()['skipped'] == 'outside_send_window'
        parent = {'email': 'parent@example.com', 'first_name': 'Dana'}
        assert recovery.send_welcome_now(world, 'optio-academy', parent) is True
        assert len(_sent_to(world, 'parent@example.com')) == 1
        # Once per lead: a second completion door does not send it again.
        assert recovery.send_welcome_now(world, 'optio-academy', parent) is False
        assert len(_sent_to(world, 'parent@example.com')) == 1

    def test_send_welcome_now_reports_a_paused_funnel(self, world):
        next(f for f in world.data['crm_funnels'] if f['id'] == WELCOME_ID)['status'] = 'paused'
        _complete(world, [_kid('ava')], _answers({'ava': '11th'}))
        assert recovery.send_welcome_now(
            world, 'optio-academy', {'email': 'parent@example.com'}) is False
        assert world.sent == []


@pytest.mark.unit
class TestStudentWelcome:
    def _teen(self, years, email='ava@example.com'):
        dob = (_now() - timedelta(days=365 * years + 30)).date().isoformat()
        return _kid('ava', email, dob=dob)

    def test_an_own_login_teen_gets_their_own_welcome(self, world):
        _complete(world, [self._teen(15)], _answers({'ava': '10th'}))
        world.data['users'].append({'id': 'ava', 'email': 'ava@example.com', 'role': 'student'})
        _two_sweeps()
        [email] = _sent_to(world, 'ava@example.com')
        assert 'HS credit' in email['html_body']

    def test_under_13_never_enters(self, world):
        _complete(world, [self._teen(12)], _answers({'ava': '7th'}))
        _two_sweeps()
        assert _sent_to(world, 'ava@example.com') == []

    def test_no_birthday_or_no_email_never_enters(self, world):
        _complete(world, [_kid('ava', 'ava@example.com'), self._teen(15, email='')],
                  _answers({'ava': '10th'}))
        _two_sweeps()
        assert [s['to_email'] for s in world.sent] == ['parent@example.com']


@pytest.mark.unit
class TestLearnerWelcomeStaysAway:
    def test_a_parent_who_only_started_an_academy_registration_exits(self, world):
        world.data['users'].append({'id': 'u-1', 'email': 'new@example.com', 'role': 'parent'})
        world.data['registrations'].append({
            'id': 'reg-open', 'organization_id': ORG_ID, 'parent_user_id': 'u-1',
            'status': 'family', 'kids': [], 'created_at': _now().isoformat(),
            'updated_at': _now().isoformat()})
        assert engine._not_for_learner_onboarding(world, 'new@example.com') == 'org_welcome'

    def test_a_platform_parent_with_no_registration_still_gets_it(self, world):
        world.data['users'].append({'id': 'u-2', 'email': 'other@example.com', 'role': 'parent'})
        assert engine._not_for_learner_onboarding(world, 'other@example.com') == ''


@pytest.mark.unit
class TestDraftedCopy:
    """The copy script is the record of the first draft; these keep it
    renderable."""

    def _steps(self):
        from scripts.crm_academy_onboarding_copy import PARENT_STEPS, STUDENT_STEPS
        return PARENT_STEPS + STUDENT_STEPS

    def test_every_block_names_a_known_segment_and_closes(self):
        for step in self._steps():
            for field in ('subject', 'html'):
                text = step[field]
                for _kind, name in re.findall(r'\{\{#(if|unless) ([a-z0-9_]+)\}\}', text):
                    assert name in SEGMENTS, f'{step["name"]}: unknown segment {name}'
                rendered = engine.render_step_content(text, {}, '#', {})
                assert '{{#' not in rendered and '{{/' not in rendered, step['name']

    def test_no_em_dashes(self):
        for step in self._steps():
            assert '—' not in step['html'] + step['subject'], step['name']


@pytest.mark.unit
class TestCompletionRouting:
    """finish_fee_step: Optio Academy's welcome replaces the goals email,
    which promised a staff meeting that school does not hold; when the
    welcome cannot send, the old email still goes so nobody finishes to
    silence."""

    def _finish(self, slug, welcome_sent):
        from unittest.mock import MagicMock
        from services import registration_funnel_service as svc
        admin = MagicMock()
        admin.table.return_value.select.return_value.eq.return_value.single.return_value \
            .execute.return_value.data = {'name': 'Optio Academy', 'slug': slug, 'feature_flags': {
                'sis_settings': {'post_registration_flow': 'goals'}}}
        parent = {'email': 'parent@example.com', 'first_name': 'Dana'}
        reg = {'id': 'reg-1', 'organization_id': ORG_ID, 'parent_user_id': 'u-1', 'kids': []}
        with patch.object(svc, '_parent_row', return_value=parent), \
             patch.object(svc, '_send_flow_email', return_value='now') as flow, \
             patch('services.crm_registration_recovery.send_welcome_now',
                   return_value=welcome_sent) as welcome, \
             patch.object(svc, 'notify_registration_completed'), \
             patch.object(svc.registration_teacher_interest, 'send_if_interested'), \
             patch.object(svc.academy_enrollment, 'enroll_registration_kids'), \
             patch('services.sis_person_service.enroll_students'), \
             patch('services.sis_enrollment_waitlist_service.waiting_entry', return_value=None), \
             patch('services.sis_holds.clear_hold_for_guardian'):
            svc.finish_fee_step(admin, reg, {})
        return flow, welcome

    def test_academy_sends_the_welcome_and_not_the_goals_email(self):
        flow, welcome = self._finish('optio-academy', welcome_sent=True)
        welcome.assert_called_once()
        flow.assert_not_called()

    def test_academy_falls_back_when_the_welcome_cannot_send(self):
        flow, welcome = self._finish('optio-academy', welcome_sent=False)
        welcome.assert_called_once()
        flow.assert_called_once()

    def test_other_schools_keep_their_flow_email(self):
        flow, welcome = self._finish('gryffin', welcome_sent=True)
        welcome.assert_not_called()
        flow.assert_called_once()
