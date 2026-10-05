"""School setup links: one link, one school, and the submitter runs it.

Tanner sends a school operator a link (2026-10-05). They sign up, fill the
setup form, and the submit creates their organization. What these pin:

  - the submit creates the org from the answers (name, a free slug, time zone,
    logo, library choice, AI off) and makes the submitter its org_admin.
  - a link works once. A second submit, a revoked link and an expired one are
    refused, and an org that fails to insert gives the link back.
  - the superadmin and an account already in a school cannot submit.
  - the form never grants what Optio sells or certifies: no SIS module and no
    accreditation_source, whatever the answers say.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from services import school_onboarding_service as svc

USER = '11111111-1111-4111-8111-111111111111'
LINK = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'


class FakeRepo:
    def __init__(self, link=None, user=None, taken=()):
        future = (datetime.now(timezone.utc) + timedelta(days=5)).isoformat()
        self.link = link if link is not None else {
            'id': LINK, 'token': 'tok', 'expires_at': future,
            'used_at': None, 'revoked_at': None, 'answers': {}}
        self.user_row = user if user is not None else {
            'id': USER, 'email': 'pat@school.org', 'first_name': 'Pat', 'last_name': 'Lee',
            'role': 'student', 'organization_id': None,
            'phone_number': '+18015550123', 'phone_verified_at': '2026-10-05T12:00:00+00:00'}
        self.taken = set(taken)
        self.admin_calls = []

    def by_token(self, token):
        return self.link if self.link and token == self.link['token'] else None

    def user(self, user_id):
        return self.user_row

    def claim(self, link_id, user_id):
        if self.link['used_at']:
            return False
        self.link.update(used_at='now', used_by=user_id)
        return True

    def release(self, link_id):
        self.link.update(used_at=None, used_by=None)

    def finish(self, link_id, org_id, answers):
        self.link.update(organization_id=org_id, answers=answers)

    def make_org_admin(self, user_id, org_id, roles):
        self.admin_calls.append((user_id, org_id, roles))

    def slug_taken(self, slug):
        return slug in self.taken


class FakeOrgRepo:
    def __init__(self, fail=False):
        self.rows, self.fail = [], fail

    def create_organization(self, row):
        if self.fail:
            raise RuntimeError('insert failed')
        org = {**row, 'id': 'org-1'}
        self.rows.append(org)
        return org


def answers(**over):
    base = {
        'school_name': 'Juniper Ridge Microschool',
        'contact_title': 'Founder',
        'city': 'Provo', 'region': 'UT',
        'timezone': 'America/Denver',
        'grade_counts': {'3': 6, 'K': 4, '4': 5},
    }
    base.update(over)
    return base


@pytest.fixture(autouse=True)
def no_email():
    with patch.object(svc, '_notify_staff'):
        yield


def run(repo, org_repo=None, data=None):
    return svc.submit(repo, org_repo or FakeOrgRepo(), 'tok', USER, data or answers())


def test_the_submit_creates_the_org_and_makes_the_submitter_its_admin():
    repo, orgs = FakeRepo(), FakeOrgRepo()
    result = run(repo, orgs, answers(logo='data:image/png;base64,AAAA', mission='Kids build things'))

    org = orgs.rows[0]
    assert org['name'] == 'Juniper Ridge Microschool'
    assert org['slug'] == 'juniper-ridge-microschool'
    assert org['timezone'] == 'America/Denver'
    assert org['branding_config'] == {'logo_url': 'data:image/png;base64,AAAA'}
    assert org['feature_flags']['due_dates'] is True   # the shared new-org defaults
    assert repo.admin_calls == [(USER, 'org-1', ['org_admin'])]
    assert result == {'organization_id': 'org-1', 'slug': 'juniper-ridge-microschool',
                      'name': 'Juniper Ridge Microschool'}
    # The answers are kept for staff; the logo is not stored twice.
    assert repo.link['organization_id'] == 'org-1'
    assert repo.link['answers']['mission'] == 'Kids build things'
    assert repo.link['answers']['grade_counts'] == {'K': 4, '3': 6, '4': 5}
    assert repo.link['answers']['grades'] == ['K', '3', '4']
    assert repo.link['answers']['student_count'] == 15
    assert repo.link['answers']['has_logo'] is True
    assert 'logo' not in repo.link['answers']
    assert repo.link['answers']['contact_phone'] == '+18015550123'


def test_an_unverified_phone_is_refused_and_the_form_cannot_supply_one():
    repo = FakeRepo()
    repo.user_row = {**repo.user_row, 'phone_verified_at': None}
    with pytest.raises(svc.SchoolSetupError) as err:
        run(repo, data=answers(contact_phone='+18015550199'))
    assert err.value.field == 'contact_phone'
    assert repo.link['used_at'] is None
    assert repo.admin_calls == []


def test_a_link_works_once():
    repo = FakeRepo()
    run(repo)
    repo.user_row = {**repo.user_row, 'organization_id': None}
    with pytest.raises(svc.SchoolSetupError) as err:
        run(repo)
    assert err.value.code == 'used'


@pytest.mark.parametrize('field,value,code', [
    ('revoked_at', '2026-10-01T00:00:00+00:00', 'revoked'),
    ('expires_at', '2020-01-01T00:00:00+00:00', 'expired'),
])
def test_a_closed_link_is_refused(field, value, code):
    repo = FakeRepo()
    repo.link[field] = value
    with pytest.raises(svc.SchoolSetupError) as err:
        run(repo)
    assert err.value.code == code
    assert repo.admin_calls == []


def test_a_failed_insert_gives_the_link_back():
    repo = FakeRepo()
    with pytest.raises(RuntimeError):
        run(repo, FakeOrgRepo(fail=True))
    assert repo.link['used_at'] is None
    assert repo.admin_calls == []


@pytest.mark.parametrize('user,code', [
    ({'id': USER, 'role': 'superadmin', 'organization_id': None}, 'superadmin'),
    ({'id': USER, 'role': 'org_managed', 'organization_id': 'other-org'}, 'already_in_school'),
])
def test_who_may_not_submit(user, code):
    repo = FakeRepo(user=user)
    with pytest.raises(svc.SchoolSetupError) as err:
        run(repo)
    assert err.value.code == code
    assert repo.link['used_at'] is None


def test_a_platform_parent_keeps_the_parent_role():
    repo = FakeRepo(user={'id': USER, 'role': 'parent', 'organization_id': None,
                          'phone_number': '+18015550123', 'phone_verified_at': 'x'})
    run(repo)
    assert repo.admin_calls[0][2] == ['org_admin', 'parent']


def test_a_taken_slug_gets_a_number():
    repo, orgs = FakeRepo(taken={'juniper-ridge-microschool'}), FakeOrgRepo()
    run(repo, orgs)
    assert orgs.rows[0]['slug'] == 'juniper-ridge-microschool-2'


def test_ai_off_and_own_library_only():
    orgs = FakeOrgRepo()
    run(FakeRepo(), orgs, answers(ai_choice='off', library_choice='private_only'))
    org = orgs.rows[0]
    assert org['quest_visibility_policy'] == 'private_only'
    assert org['course_visibility_policy'] == 'private_only'
    assert not any(org[c] for c in ('ai_features_enabled', 'ai_chatbot_enabled',
                                    'ai_lesson_helper_enabled', 'ai_task_generation_enabled'))


def test_the_form_never_sets_accreditation_or_raw_flags():
    orgs, repo = FakeOrgRepo(), FakeRepo()
    run(repo, orgs, answers(accreditation='Cognia', accreditation_source='optio',
                            feature_flags={'sis_enabled': True}))
    org = orgs.rows[0]
    assert 'accreditation_source' not in org
    assert org['feature_flags'] == {'due_dates': True, 'scheduled_publish': True}
    assert repo.link['answers']['accreditation'] == 'Cognia'
    assert 'accreditation_source' not in repo.link['answers']
    assert 'feature_flags' not in repo.link['answers']


def test_a_console_pick_turns_the_console_on_with_only_the_picks():
    from modules import module_enabled_for_row
    orgs, repo = FakeOrgRepo(), FakeRepo()
    run(repo, orgs, answers(features=['billing', 'kiosk', 'mobile_app']))
    org = orgs.rows[0]
    flags = org['feature_flags']
    assert flags['sis_enabled'] is True and flags['kiosk'] is True
    on = {k for k in ('sis', 'billing', 'registration', 'kiosk', 'attendance', 'classes',
                      'calendar', 'reports', 'credits', 'community')
          if module_enabled_for_row(org, k)}
    # billing needs registration, so both; console modules not picked are off
    assert on == {'sis', 'billing', 'registration', 'kiosk'}
    # hidden_modules (what the console's settings edit) agrees with the map
    hidden = flags['sis_settings']['hidden_modules']
    assert {'attendance', 'classes', 'calendar', 'reports', 'secure_documents'} <= set(hidden)
    assert 'billing' not in hidden
    assert flags['due_dates'] is True   # the new-org defaults survive
    assert repo.link['answers']['features'] == ['billing', 'kiosk', 'mobile_app']


def test_no_console_pick_keeps_the_school_on_the_learning_platform():
    from modules import module_enabled_for_row
    orgs = FakeOrgRepo()
    run(FakeRepo(), orgs, answers(features=['kiosk', 'credits']))
    org = orgs.rows[0]
    assert 'sis_enabled' not in org['feature_flags']
    assert 'sis' not in org['feature_flags']['modules']
    assert not module_enabled_for_row(org, 'sis')
    assert module_enabled_for_row(org, 'kiosk') and module_enabled_for_row(org, 'credits')


def test_no_picks_change_nothing():
    orgs = FakeOrgRepo()
    run(FakeRepo(), orgs, answers(features=['mobile_app']))
    assert orgs.rows[0]['feature_flags'] == {'due_dates': True, 'scheduled_publish': True}


@pytest.mark.parametrize('over,field', [
    ({'school_name': '  '}, 'school_name'),
    ({'city': ''}, 'city'),
    ({'timezone': 'Mars/Olympus'}, 'timezone'),
    ({'grade_counts': {}}, 'grade_counts'),
    ({'grade_counts': {'5': 0}}, 'grade_counts'),
    ({'grade_counts': {'13': 4}}, 'grade_counts'),
    ({'grade_counts': {'5': -1}}, 'grade_counts'),
    ({'grade_counts': {'5': '4'}}, 'grade_counts'),
    ({'logo': 'https://example.com/logo.png'}, 'logo'),
])
def test_a_bad_answer_names_its_field_and_keeps_the_link_open(over, field):
    repo = FakeRepo()
    with pytest.raises(svc.SchoolSetupError) as err:
        run(repo, data=answers(**over))
    assert err.value.field == field
    assert repo.link['used_at'] is None


def test_an_online_school_needs_no_city():
    cleaned = svc.clean_answers(answers(online_only=True, city='', region=''))
    assert cleaned['online_only'] is True


def test_slugify():
    assert svc.slugify("St. Mary's  Co-op!") == 'st-mary-s-co-op'
    assert svc.slugify('???') == 'school'
