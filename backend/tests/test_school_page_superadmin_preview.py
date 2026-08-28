"""
The superadmin school-page preview.

/school is rendered from three reads that all resolve their org through the
caller's MEMBERSHIP (announcements archive, community feed, school context). A
superadmin belongs to no school, so the page had nothing to show them — yet
they are exactly the person who needs to see what each school's page looks
like. The archive already accepts ?organization_id from a superadmin (and 403s
anyone else naming an org that is not theirs); these tests hold the same
contract for the other two reads.

The preview also carries ?view_as (parent | student) so the superadmin sees
the page as that role would: guardianship drives the family-only cards,
audience filtering decides which sent messages a role sees, and students
read the carpool board without posting to it. view_as is honored only on the
superadmin preview path — a real member's view is derived from who they are.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_parent_service as parent
from routes import announcements as announcements_routes
from routes.sis import community as community_routes
from routes.sis import school as school_routes


def _table_returning(rows):
    table = Mock()
    for chained in ('select', 'eq', 'in_', 'limit', 'order', 'lt', 'or_', 'range'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=rows)
    return table


def _admin_returning(rows):
    client = Mock()
    client.table.return_value = _table_returning(rows)
    return client


ICREATE_ROW = {'id': 'org-1', 'name': 'iCreate',
               'feature_flags': {'sis_settings': {'post_registration_flow': 'goals'}},
               'branding_config': {'logo_url': 'data:image/png;base64,x'}}


@pytest.mark.unit
class TestSchoolContextForOrg:
    def _ctx(self, org_rows, as_guardian=False):
        with patch.object(parent, 'get_supabase_admin_client',
                          return_value=_admin_returning(list(org_rows))):
            return parent.school_context_for_org('org-1', as_guardian=as_guardian)

    def test_returns_the_same_shape_the_hub_renders_from(self):
        assert self._ctx([ICREATE_ROW]) == {
            'orgs': [{'organization_id': 'org-1',
                      'organization_name': 'iCreate',
                      'is_guardian': False,
                      'post_registration_flow': 'goals',
                      'prior_learning_enabled': False,
                      'logo_url': 'data:image/png;base64,x',
                      'logo_subtitle': None}],
            'is_guardian': False,
        }

    def test_the_parent_view_claims_guardianship_so_the_family_cards_show(self):
        """Cards are links, not data: the guardian endpoints behind them still
        authorize by real family relationship."""
        ctx = self._ctx([ICREATE_ROW], as_guardian=True)
        assert ctx['is_guardian'] is True
        assert ctx['orgs'][0]['is_guardian'] is True

    def test_the_student_view_does_not(self):
        assert self._ctx([ICREATE_ROW], as_guardian=False)['is_guardian'] is False

    def test_an_unknown_org_is_an_empty_context_not_an_error(self):
        assert self._ctx([]) == {'orgs': [], 'is_guardian': False}


@pytest.mark.unit
class TestFeedOrgResolution:
    """Which org's community board /api/sis/community/feed serves, and whether
    the request is a superadmin preview."""

    def _resolve(self, requested, member_org=None, role='parent'):
        with patch('services.sis_service.member_org_id', return_value=member_org), \
             patch.object(community_routes, '_caller_effective_role',
                          return_value=role):
            return community_routes._feed_org_for('u1', requested)

    def test_a_member_gets_their_own_school(self):
        assert self._resolve(None, member_org='org-1') == ('org-1', None, False)

    def test_naming_your_own_org_explicitly_is_fine_and_not_a_preview(self):
        assert self._resolve('org-1', member_org='org-1') == ('org-1', None, False)

    def test_a_superadmin_may_preview_any_org(self):
        assert self._resolve('org-2', member_org=None,
                             role='superadmin') == ('org-2', None, True)

    def test_anyone_else_naming_another_org_is_refused(self):
        org, err, _ = self._resolve('org-2', member_org='org-1', role='org_admin')
        assert org is None and err == 'forbidden'

    def test_a_caller_with_no_school_cannot_name_one_either(self):
        org, err, _ = self._resolve('org-2', member_org=None, role='parent')
        assert org is None and err == 'forbidden'


@pytest.mark.unit
class TestFeedAffordances:
    """Who may post to / moderate the carpool board on the feed response."""

    def test_the_preview_models_a_member_of_the_chosen_role(self):
        assert community_routes._feed_affordances('sa-1', True, 'parent') \
            == {'can_post_carpool': True, 'can_moderate': False}
        assert community_routes._feed_affordances('sa-1', True, 'student') \
            == {'can_post_carpool': False, 'can_moderate': False}
        # Admins are adults who also moderate the board.
        assert community_routes._feed_affordances('sa-1', True, 'admin') \
            == {'can_post_carpool': True, 'can_moderate': True}

    def test_a_real_member_keeps_their_own_affordances(self):
        with patch.object(community_routes, '_is_student', return_value=False), \
             patch('services.sis_service.caller_is_admin', return_value=True):
            out = community_routes._feed_affordances('admin-1', False, None)
        assert out == {'can_post_carpool': True, 'can_moderate': True}

    def test_a_real_student_still_reads_without_posting(self):
        with patch.object(community_routes, '_is_student', return_value=True), \
             patch('services.sis_service.caller_is_admin', return_value=False):
            out = community_routes._feed_affordances('stu-1', False, None)
        assert out == {'can_post_carpool': False, 'can_moderate': False}


@pytest.mark.unit
class TestSchoolContextGate:
    """Who /api/sis/school/context answers for."""

    def test_a_superadmin_naming_an_org_gets_that_orgs_context_as_a_parent(self):
        with patch.object(school_routes, '_caller_is_superadmin', return_value=True), \
             patch.object(school_routes.parent, 'school_context_for_org',
                          return_value={'orgs': ['preview'], 'is_guardian': True}) as for_org:
            out = school_routes._context_payload('sa-1', 'org-2', 'parent')
        for_org.assert_called_once_with('org-2', as_guardian=True)
        assert out['orgs'] == ['preview']

    def test_only_the_parent_view_claims_guardianship(self):
        """Guardian cards act on a FAMILY; the student and admin views are
        members of the school without being guardians in it."""
        for view in ('student', 'admin'):
            with patch.object(school_routes, '_caller_is_superadmin', return_value=True), \
                 patch.object(school_routes.parent, 'school_context_for_org',
                              return_value={'orgs': [], 'is_guardian': False}) as for_org:
                school_routes._context_payload('sa-1', 'org-2', view)
            for_org.assert_called_once_with('org-2', as_guardian=False)

    def test_anyone_else_gets_the_membership_answer_param_ignored(self):
        with patch.object(school_routes, '_caller_is_superadmin', return_value=False), \
             patch.object(school_routes.parent, 'school_context',
                          return_value={'orgs': [], 'is_guardian': False}) as membership:
            out = school_routes._context_payload('u1', 'org-2', 'parent')
        membership.assert_called_once_with('u1')
        assert out == {'orgs': [], 'is_guardian': False}

    def test_no_param_starts_from_the_membership_answer_even_for_a_superadmin(self):
        """With empty membership a superadmin falls through to the preview org
        listing (the mobile app's bootstrap, added alongside this work) — but
        membership is always consulted first."""
        with patch.object(school_routes, '_caller_is_superadmin', return_value=True), \
             patch.object(school_routes.parent, 'school_context',
                          return_value={'orgs': [], 'is_guardian': False}) as membership, \
             patch.object(school_routes.parent, 'school_preview_orgs',
                          return_value={'orgs': ['listing'], 'is_guardian': False}) as listing:
            out = school_routes._context_payload('sa-1', None, None)
        membership.assert_called_once_with('sa-1')
        listing.assert_called_once()
        assert out['orgs'] == ['listing']


@pytest.mark.unit
class TestArchiveAudience:
    """Which sent messages each viewer sees. Members are filtered by their own
    role; a superadmin previewing carries the previewed role's filter, and with
    no view_as sees everything, as before."""

    def test_members_filter_by_their_own_role(self):
        assert announcements_routes._archive_audience_token('student', None) == 'students'
        assert announcements_routes._archive_audience_token('parent', 'student') == 'parents'
        assert announcements_routes._archive_audience_token('org_admin', 'student') is None

    def test_a_previewing_superadmin_filters_by_the_previewed_role(self):
        assert announcements_routes._archive_audience_token('superadmin', 'student') == 'students'
        assert announcements_routes._archive_audience_token('superadmin', 'parent') == 'parents'

    def test_the_admin_view_sees_everything_like_staff_do(self):
        assert announcements_routes._archive_audience_token('superadmin', 'admin') is None

    def test_a_superadmin_with_no_view_still_sees_everything(self):
        assert announcements_routes._archive_audience_token('superadmin', None) is None
        assert announcements_routes._archive_audience_token('superadmin', 'bogus') is None


class TestFamilyViewToken:
    """The family home is a parent's own view of the archive, even when that
    parent is also front office.

    iCreate, 2026-08-28: a campus coordinator posted a teachers-only
    announcement and found it on her parent dashboard — "I created an
    announcement and said to mark it visible to only teachers. It still sent to
    me as a parent". She had not been sent it; _ARCHIVE_SEES_ALL simply showed
    her everything, on every surface. ?family_view=1 narrows the surfaces that
    ARE the family view.
    """

    def test_a_coordinator_who_is_also_a_parent_gets_the_parent_filter(self):
        row = {'role': 'org_managed', 'org_role': 'campus_coordinator',
               'org_roles': ['campus_coordinator', 'parent']}
        assert announcements_routes._family_audience_token(row) == 'parents'

    def test_a_platform_parent_gets_the_parent_filter(self):
        assert announcements_routes._family_audience_token(
            {'role': 'parent', 'org_role': None, 'org_roles': None}) == 'parents'

    def test_a_student_gets_the_student_filter(self):
        assert announcements_routes._family_audience_token(
            {'role': 'org_managed', 'org_role': 'student', 'org_roles': None}) == 'students'

    def test_staff_with_no_family_role_are_left_alone(self):
        """None means "no narrowing" — the caller keeps whatever their staff role
        already gave them, so asking for the family view can never widen it."""
        assert announcements_routes._family_audience_token(
            {'role': 'org_managed', 'org_role': 'org_admin', 'org_roles': ['org_admin']}) is None
        assert announcements_routes._family_audience_token(None) is None

    def test_parent_wins_over_student_when_someone_holds_both(self):
        row = {'role': 'org_managed', 'org_role': 'parent',
               'org_roles': ['student', 'parent']}
        assert announcements_routes._family_audience_token(row) == 'parents'
