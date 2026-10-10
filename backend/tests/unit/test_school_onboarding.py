"""School setup links: one link, one school, and the submitter runs it.

Tanner sends a school operator a link (2026-10-05). They sign up, fill the
setup form, and the submit creates their organization. What these pin:

  - the submit creates the org from the answers (name, a free slug, time zone,
    logo, library choice, AI off) and makes the submitter its org_admin.
  - a link works once. A second submit, a revoked link and an expired one are
    refused, and an org that fails to insert gives the link back.
  - the superadmin and an account already in a school cannot submit.
  - the form never grants what Optio sells or certifies: no accreditation_source,
    and no module beyond the console and what the two yes/no questions need,
    whatever the answers say. The feature checkboxes record interest only.
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
                            feature_flags={'kiosk': True, 'modules': {'billing': True}}))
    org = orgs.rows[0]
    assert 'accreditation_source' not in org
    flags = org['feature_flags']
    assert 'kiosk' not in flags and flags['modules'] == {'sis': True}
    assert repo.link['answers']['accreditation'] == 'Cognia'
    assert 'accreditation_source' not in repo.link['answers']
    assert 'feature_flags' not in repo.link['answers']


def test_every_school_gets_the_console_on_the_microschool_baseline():
    """Tanner, 2026-10-09: a new admin lands on the short console sidebar,
    which ends in "Add features", whatever they answered."""
    from modules import module_enabled_for_row
    orgs = FakeOrgRepo()
    run(FakeRepo(), orgs, answers())
    org = orgs.rows[0]
    flags = org['feature_flags']
    assert flags['module_baseline'] == 'microschool'
    assert flags['due_dates'] is True   # the shared new-org defaults survive
    assert flags['modules'] == {'sis': True}
    assert module_enabled_for_row(org, 'sis')
    for key in ('registration', 'catalog', 'billing', 'tasks', 'onboarding', 'clp',
                'resources', 'training', 'classes', 'attendance', 'calendar',
                'curriculum', 'reports', 'weekly_goals'):
        assert not module_enabled_for_row(org, key), key


def test_the_unlisted_start_features_stay_on():
    from modules import module_enabled_for_row
    orgs = FakeOrgRepo()
    run(FakeRepo(), orgs, answers())
    for key in svc.NOT_SHOWN_AT_START:
        assert module_enabled_for_row(orgs.rows[0], key), key


def test_interest_picks_are_recorded_and_turn_nothing_on():
    from modules import module_enabled_for_row
    orgs, repo = FakeOrgRepo(), FakeRepo()
    run(repo, orgs, answers(features=['attendance', 'weekly_goals', 'credits', 'kiosk']))
    org = orgs.rows[0]
    assert org['feature_flags']['modules'] == {'sis': True}
    assert 'kiosk' not in org['feature_flags']
    for key in ('attendance', 'weekly_goals', 'credits', 'kiosk'):
        assert not module_enabled_for_row(org, key), key
    assert repo.link['answers']['features'] == ['attendance', 'weekly_goals', 'credits', 'kiosk']


def test_collecting_tuition_turns_on_billing_and_the_registration_it_needs():
    from modules import module_enabled_for_row
    orgs, repo = FakeOrgRepo(), FakeRepo()
    run(repo, orgs, answers(collects_tuition='yes', families_register='no'))
    org = orgs.rows[0]
    modules = org['feature_flags']['modules']
    assert modules['billing'] is True and modules['registration'] is True
    assert modules['sis'] is True
    assert module_enabled_for_row(org, 'billing')
    assert module_enabled_for_row(org, 'registration')
    assert not module_enabled_for_row(org, 'catalog')
    assert repo.link['answers']['collects_tuition'] == 'yes'


def test_families_registering_turns_on_registration_and_the_catalog():
    from modules import module_enabled_for_row
    orgs = FakeOrgRepo()
    run(FakeRepo(), orgs, answers(families_register='yes'))
    org = orgs.rows[0]
    # catalog requires classes, so a yes brings classes along
    assert {k for k in ('registration', 'catalog', 'classes', 'billing')
            if module_enabled_for_row(org, k)} == {'registration', 'catalog', 'classes'}
    # hidden_modules (what the console's settings edit) agrees with the map
    assert 'classes' not in (org['feature_flags'].get('sis_settings') or {}).get('hidden_modules', [])


def test_an_old_form_with_the_billing_checkbox_still_counts():
    orgs = FakeOrgRepo()
    run(FakeRepo(), orgs, answers(features=['billing']))
    assert orgs.rows[0]['feature_flags']['modules']['billing'] is True


def test_the_link_shows_what_a_school_starts_with_and_can_add():
    """The list comes from the Settings Features card, so the form and the
    card cannot disagree. What the form asks about in its own words is left
    out, and weekly goals is something to add, not a start."""
    view = svc.public_view(FakeRepo(), 'tok')
    tour = view['features']
    starts = {f['key'] for f in tour['starts_with']}
    adds = {f['key']: f for f in tour['can_add']}
    assert 'submissions' in starts
    # on from the start, but the form does not list them (Tanner, 2026-10-09)
    assert not starts & svc.NOT_SHOWN_AT_START
    assert not set(adds) & svc.NOT_SHOWN_AT_START
    assert not starts & set(adds)
    assert {'classes', 'attendance', 'weekly_goals', 'tasks'} <= set(adds)
    assert not (svc.ASKED_ELSEWHERE & (starts | set(adds)))
    assert adds['credits']['optio_turns_on'] is True
    assert adds['attendance']['optio_turns_on'] is False
    assert {g['key'] for g in tour['groups']} >= {f['group'] for f in tour['can_add']}


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


# ── what a link turns on ──────────────────────────────────────────────────────
# Apogee NoCo, 2026-10-09: Summer wanted to send hiring paperwork the day she
# set her school up, and a new school starts with Tasks off. The link Optio
# sends can carry the features to turn on, so nobody waits on a second step.

def _link_with(modules):
    repo = FakeRepo()
    repo.link['answers'] = {'start_modules': modules}
    return repo


def test_a_link_turns_its_features_on_at_submit():
    from modules import module_enabled_for_row
    orgs, repo = FakeOrgRepo(), _link_with(['tasks'])
    run(repo, orgs, answers())
    assert module_enabled_for_row(orgs.rows[0], 'tasks')
    assert not module_enabled_for_row(orgs.rows[0], 'onboarding')
    # The operator's answers replace the placeholder; the choice is kept.
    assert repo.link['answers']['start_modules'] == ['tasks']
    assert repo.link['answers']['school_name'] == 'Juniper Ridge Microschool'


def test_the_link_page_shows_them_as_starting_on():
    tour = svc.public_view(_link_with(['tasks']), 'tok')['features']
    assert 'tasks' in {f['key'] for f in tour['starts_with']}
    assert 'tasks' not in {f['key'] for f in tour['can_add']}


def test_making_a_link_stores_valid_features():
    made = {}

    class Repo:
        def create_link(self, row):
            made.update(row)
            return row

    svc.create_link(Repo(), USER, start_modules=['tasks', 'secure_documents', 'tasks'])
    assert made['answers'] == {'start_modules': ['secure_documents', 'tasks']}


def test_a_link_without_features_stores_no_answers():
    made = {}

    class Repo:
        def create_link(self, row):
            made.update(row)
            return row

    svc.create_link(Repo(), USER)
    assert 'answers' not in made


@pytest.mark.parametrize('bad', [['billing'], ['not_a_feature'], ['credits'], 'tasks'])
def test_a_link_cannot_turn_on_what_it_may_not(bad):
    """Billing is the form's own question; credits is Optio's to turn on."""
    with pytest.raises(svc.SchoolSetupError):
        svc.clean_start_modules(bad)
