"""
The school hub's context, and who the school-wide reads are open to.

/school stopped being a two-tab announcements page and became the school's whole
surface: calendar, resources, directory and the guardian-only family cards. That
broke an assumption the family pages were all built on — they bootstrap from
sis_parent_service.context(), which answers "where am I a GUARDIAN" and is empty
for a student or a teacher who guards nobody. Those people are plainly in the
school, and were being told "your account isn't linked to a school yet".

So there are two questions now, and they have different answers:
  - which school am I in?          -> membership (school_context)
  - may I do guardian things here? -> guardianship (context, unchanged)

These tests hold that split. The guardian-only surfaces (billing, absences,
portal, requests, schedule) keep authorizing on guardianship elsewhere; what
widens here is only the three reads every member of a school should get.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_parent_service as parent


def _table_returning(rows):
    table = Mock()
    # `range` is here because the directory read pages through fetch_all_rows();
    # without it the paged call resolves to a bare Mock instead of these rows.
    for chained in ('select', 'eq', 'in_', 'limit', 'order', 'lt', 'or_', 'range'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=rows)
    return table


def _admin_returning(rows):
    """An admin client whose every query resolves to `rows`."""
    client = Mock()
    client.table.return_value = _table_returning(rows)
    return client


def _school_context(user_id, guardian_orgs=(), member_org=None, sis_enabled=True,
                    org_rows=()):
    with patch.object(parent, 'context',
                      return_value={'orgs': list(guardian_orgs)}), \
         patch('services.sis_service.member_org_id', return_value=member_org), \
         patch.object(parent, 'org_has_feature', return_value=sis_enabled), \
         patch.object(parent, 'get_supabase_admin_client',
                      return_value=_admin_returning(list(org_rows))):
        return parent.school_context(user_id)


ICREATE = {'organization_id': 'org-1', 'organization_name': 'iCreate', 'students': []}
ICREATE_ROW = {'id': 'org-1', 'name': 'iCreate',
               'branding_config': {'logo_url': 'data:image/png;base64,x'}}


@pytest.mark.unit
class TestWhichSchoolAmIIn:
    def test_a_guardian_gets_the_school_they_guard_into(self):
        ctx = _school_context('parent-1', guardian_orgs=[ICREATE],
                              org_rows=[ICREATE_ROW])
        assert ctx['orgs'] == [{'organization_id': 'org-1',
                                'organization_name': 'iCreate',
                                'is_guardian': True,
                                # empty, not absent: this fixture row has no
                                # feature_flags, so every family module is off
                                'modules': [],
                                'post_registration_flow': 'schedule',
                                'prior_learning_enabled': False,
                                'logo_url': 'data:image/png;base64,x',
                                'logo_subtitle': None}]

    def test_a_student_gets_their_own_school(self):
        """The regression this whole change exists for: a student guards nobody,
        so context() is empty for them, and every school page said they had no
        school."""
        ctx = _school_context('student-1', member_org='org-1', org_rows=[ICREATE_ROW])
        assert ctx['orgs'] == [{'organization_id': 'org-1',
                                'organization_name': 'iCreate',
                                'is_guardian': False,
                                # empty, not absent: this fixture row has no
                                # feature_flags, so every family module is off
                                'modules': [],
                                'post_registration_flow': 'schedule',
                                'prior_learning_enabled': False,
                                'logo_url': 'data:image/png;base64,x',
                                'logo_subtitle': None}]

    def test_a_school_without_a_logo_sends_none_not_a_broken_image(self):
        ctx = _school_context('student-1', member_org='org-1',
                              org_rows=[{'id': 'org-1', 'name': 'Hearthwood'}])
        assert ctx['orgs'][0]['logo_url'] is None

    def test_a_teacher_who_guards_nobody_still_gets_their_school(self):
        ctx = _school_context('teacher-1', member_org='org-1', org_rows=[ICREATE_ROW])
        assert [o['organization_id'] for o in ctx['orgs']] == ['org-1']
        assert ctx['orgs'][0]['is_guardian'] is False

    def test_a_parent_who_also_works_at_the_school_is_listed_once_as_guardian(self):
        """Staff-who-are-also-parents resolve down both paths. The guardian
        answer wins, or they would lose the family cards on their own school."""
        ctx = _school_context('parent-teacher-1', guardian_orgs=[ICREATE],
                              member_org='org-1', org_rows=[ICREATE_ROW])
        assert len(ctx['orgs']) == 1
        assert ctx['orgs'][0]['is_guardian'] is True


@pytest.mark.unit
class TestWhichPostRegistrationFlow:
    """The hub offers one of two cards here — Schedule Builder or Goal Setting —
    and cannot read feature_flags itself: a platform parent has no
    organization_id, so the frontend's `organization` is null for precisely the
    people who need the card."""

    def test_goals_mode_is_carried_through(self):
        ctx = _school_context('parent-1', guardian_orgs=[ICREATE], org_rows=[
            {**ICREATE_ROW, 'feature_flags': {'sis_settings': {
                'post_registration_flow': 'goals'}}}])
        assert ctx['orgs'][0]['post_registration_flow'] == 'goals'

    def test_a_school_with_no_setting_gets_the_schedule_builder(self):
        ctx = _school_context('parent-1', guardian_orgs=[ICREATE], org_rows=[ICREATE_ROW])
        assert ctx['orgs'][0]['post_registration_flow'] == 'schedule'

    def test_prior_learning_is_carried_through_when_a_school_opts_in(self):
        """Same reason as the flow above: the hub can't read feature_flags for a
        platform parent, so the Prior Learning card has to arrive with the org."""
        ctx = _school_context('parent-1', guardian_orgs=[ICREATE], org_rows=[
            {**ICREATE_ROW, 'feature_flags': {'sis_settings': {
                'prior_learning_enabled': True}}}])
        assert ctx['orgs'][0]['prior_learning_enabled'] is True

    def test_prior_learning_is_off_for_a_school_that_never_set_it(self):
        """Fails closed — a truthy-ish value is not an opt-in either."""
        ctx = _school_context('parent-1', guardian_orgs=[ICREATE], org_rows=[ICREATE_ROW])
        assert ctx['orgs'][0]['prior_learning_enabled'] is False
        ctx = _school_context('parent-1', guardian_orgs=[ICREATE], org_rows=[
            {**ICREATE_ROW, 'feature_flags': {'sis_settings': {
                'prior_learning_enabled': 'yes'}}}])
        assert ctx['orgs'][0]['prior_learning_enabled'] is False

    def test_a_school_that_is_not_on_the_sis_gets_no_hub(self):
        ctx = _school_context('student-2', member_org='org-9', sis_enabled=False)
        assert ctx['orgs'] == []

    def test_someone_with_no_school_gets_nothing(self):
        assert _school_context('platform-user')['orgs'] == []


@pytest.mark.unit
class TestIsGuardianFlag:
    """The hub renders the guardian-only cards off this. Getting it wrong the
    permissive way puts a Billing tile in front of a fourteen-year-old."""

    def test_true_for_a_guardian(self):
        assert _school_context('parent-1', guardian_orgs=[ICREATE])['is_guardian'] is True

    def test_false_for_a_student(self):
        ctx = _school_context('student-1', member_org='org-1',
                              org_rows=[{'id': 'org-1', 'name': 'iCreate'}])
        assert ctx['is_guardian'] is False

    def test_false_when_there_is_no_school_at_all(self):
        assert _school_context('nobody')['is_guardian'] is False


@pytest.mark.unit
class TestMembershipCheck:
    def _member(self, guardian=False, member_org=None, sis_enabled=True, role='parent'):
        with patch.object(parent, '_has_org_access', return_value=guardian), \
             patch('services.sis_service.member_org_id', return_value=member_org), \
             patch('services.sis_service.get_user_org_context',
                   return_value={'role': role, 'organization_id': member_org}), \
             patch.object(parent, 'org_has_feature', return_value=sis_enabled):
            return parent._is_org_member('user-1', 'org-1')

    def test_a_guardian_is_a_member(self):
        assert self._member(guardian=True) is True

    def test_a_student_of_the_org_is_a_member(self):
        assert self._member(member_org='org-1') is True

    def test_a_member_of_a_different_school_is_not(self):
        assert self._member(member_org='org-2') is False

    def test_a_member_of_a_non_sis_school_is_not(self):
        assert self._member(member_org='org-1', sis_enabled=False) is False

    def test_a_stranger_is_not(self):
        assert self._member() is False

    def test_a_superadmin_is_a_member_of_every_school(self):
        # They belong to no school, so membership answers nothing for them —
        # without this the school-page preview links all 403 (the calendar did).
        assert self._member(role='superadmin') is True


@pytest.mark.unit
class TestSchoolWideReadsOpenToEveryMember:
    """Calendar, resources and directory are the school's own content. Everyone
    in the school sees them; the guardian-only surfaces are unaffected."""

    def _read(self, fn, is_member):
        rows = {
            'org_resources': [{'id': 'r1', 'title': 'Family Guidebook',
                               'url': 'https://x/guide.pdf', 'category': 'Policies',
                               'description': None, 'sort_order': 0}],
            'sis_events': [{'id': 'e1', 'title': 'Open house', 'audience': 'school',
                            'start_at': '2026-09-01T09:00:00'}],
            'households': [{'id': 'h1', 'name': 'One Family', 'phone': '555-1111'}],
            'household_members': [{'household_id': 'h1', 'user_id': 'g1',
                                   'relationship': 'guardian'}],
            'users': [{'id': 'g1', 'display_name': 'Gina One', 'first_name': 'Gina',
                       'email': 'g1@x.com'}],
        }
        client = Mock()
        client.table.side_effect = lambda name: _table_returning(rows.get(name, []))
        with patch.object(parent, '_is_org_member', return_value=is_member), \
             patch.object(parent, 'get_supabase_admin_client', return_value=client):
            return fn('viewer-1', 'org-1')

    def test_resources_open_to_a_non_guardian_member(self):
        assert self._read(parent.org_resources, True) is not None

    def test_events_open_to_a_non_guardian_member(self):
        assert self._read(parent.org_events, True) is not None

    def test_directory_open_to_a_non_guardian_member(self):
        assert self._read(parent.family_directory, True) is not None

    def test_resources_still_refuse_a_stranger(self):
        assert self._read(parent.org_resources, False) is None

    def test_events_still_refuse_a_stranger(self):
        assert self._read(parent.org_events, False) is None

    def test_directory_still_refuses_a_stranger(self):
        assert self._read(parent.family_directory, False) is None


@pytest.mark.unit
class TestSuperadminPreviewListing:
    """A superadmin belongs to no school, so membership answers nothing for
    them. The mobile app bootstraps its school-page preview from the same
    context call members use: with no org named, a superadmin gets every org
    that has turned the page on (sis_settings.school_homepage)."""

    ENABLED = {'id': 'org-1', 'name': 'iCreate',
               'feature_flags': {'sis_settings': {'school_homepage': True}},
               'branding_config': {'logo_url': 'data:image/png;base64,x'}}
    SIS_ONLY = {'id': 'org-2', 'name': 'Gryffin',
                'feature_flags': {'sis_enabled': True}}

    def _preview(self, org_rows):
        with patch.object(parent, 'get_supabase_admin_client',
                          return_value=_admin_returning(list(org_rows))):
            return parent.school_preview_orgs()

    def test_lists_only_orgs_that_turned_the_page_on(self):
        out = self._preview([self.ENABLED, self.SIS_ONLY])
        assert [o['organization_id'] for o in out['orgs']] == ['org-1']

    def test_entries_carry_the_hub_shape_and_are_never_guardian(self):
        out = self._preview([self.ENABLED])
        assert out['orgs'][0] == {'organization_id': 'org-1',
                                  'organization_name': 'iCreate',
                                  'is_guardian': False,
                                  'modules': [],
                                  'post_registration_flow': 'schedule',
                                  'prior_learning_enabled': False,
                                  'logo_url': 'data:image/png;base64,x',
                                  'logo_subtitle': None}
        assert out['is_guardian'] is False

    def test_empty_when_nobody_opted_in(self):
        assert self._preview([self.SIS_ONLY])['orgs'] == []


@pytest.mark.unit
class TestContextRouteSuperadminFallback:
    """routes/sis/school._context_payload: membership answers first; only a
    superadmin whose membership came back empty falls through to the preview
    listing, so the common member path never pays the role lookup."""

    def test_a_superadmin_with_no_school_gets_the_preview_listing(self):
        from routes.sis import school as school_routes
        listing = {'orgs': [{'organization_id': 'org-1'}], 'is_guardian': False}
        with patch.object(school_routes, '_caller_is_superadmin', return_value=True), \
             patch.object(school_routes.parent, 'school_context',
                          return_value={'orgs': [], 'is_guardian': False}), \
             patch.object(school_routes.parent, 'school_preview_orgs',
                          return_value=listing):
            assert school_routes._context_payload('sa-1', None, None) == listing

    def test_a_member_never_pays_the_role_lookup(self):
        from routes.sis import school as school_routes
        ctx = {'orgs': [{'organization_id': 'org-1'}], 'is_guardian': True}
        with patch.object(school_routes, '_caller_is_superadmin') as role_check, \
             patch.object(school_routes.parent, 'school_context', return_value=ctx):
            assert school_routes._context_payload('parent-1', None, None) == ctx
        role_check.assert_not_called()

    def test_an_ordinary_user_with_no_school_still_gets_nothing(self):
        from routes.sis import school as school_routes
        with patch.object(school_routes, '_caller_is_superadmin', return_value=False), \
             patch.object(school_routes.parent, 'school_context',
                          return_value={'orgs': [], 'is_guardian': False}):
            assert school_routes._context_payload('u-1', None, None)['orgs'] == []

    def test_naming_an_org_still_uses_the_single_org_preview(self):
        from routes.sis import school as school_routes
        with patch.object(school_routes, '_caller_is_superadmin', return_value=True), \
             patch.object(school_routes.parent, 'school_context_for_org',
                          return_value={'orgs': [{'organization_id': 'org-9'}],
                                        'is_guardian': True}) as single:
            out = school_routes._context_payload('sa-1', 'org-9', 'parent')
        single.assert_called_once_with('org-9', as_guardian=True)
        assert out['orgs'][0]['organization_id'] == 'org-9'


@pytest.mark.unit
class TestGuardianOnlySurfacesDidNotWiden:
    """The point of a separate membership check is that it did NOT leak into the
    surfaces that act on a family. A student is a member of the school; that must
    not let them set their household's directory listing or open its billing."""

    def test_directory_opt_in_is_still_household_scoped(self):
        client = _admin_returning([])
        with patch.object(parent, 'get_supabase_admin_client', return_value=client):
            assert parent.set_directory_opt_in('student-1', 'org-1', True).get('error')

    def test_open_classes_still_authorizes_on_guardianship(self):
        with patch.object(parent, '_has_org_access', return_value=False):
            assert parent.open_classes('student-1', 'org-1') is None
