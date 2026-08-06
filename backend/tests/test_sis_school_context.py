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
    for chained in ('select', 'eq', 'in_', 'limit', 'order', 'lt', 'or_'):
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
ICREATE_ROW = {'id': 'org-1', 'name': 'iCreate'}


@pytest.mark.unit
class TestWhichSchoolAmIIn:
    def test_a_guardian_gets_the_school_they_guard_into(self):
        ctx = _school_context('parent-1', guardian_orgs=[ICREATE],
                              org_rows=[ICREATE_ROW])
        assert ctx['orgs'] == [{'organization_id': 'org-1',
                                'organization_name': 'iCreate',
                                'is_guardian': True,
                                'post_registration_flow': 'schedule'}]

    def test_a_student_gets_their_own_school(self):
        """The regression this whole change exists for: a student guards nobody,
        so context() is empty for them, and every school page said they had no
        school."""
        ctx = _school_context('student-1', member_org='org-1', org_rows=[ICREATE_ROW])
        assert ctx['orgs'] == [{'organization_id': 'org-1',
                                'organization_name': 'iCreate',
                                'is_guardian': False,
                                'post_registration_flow': 'schedule'}]

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
    def _member(self, guardian=False, member_org=None, sis_enabled=True):
        with patch.object(parent, '_has_org_access', return_value=guardian), \
             patch('services.sis_service.member_org_id', return_value=member_org), \
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
