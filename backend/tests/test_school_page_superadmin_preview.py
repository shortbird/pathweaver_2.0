"""
The superadmin school-page preview.

/school is rendered from three reads that all resolve their org through the
caller's MEMBERSHIP (announcements archive, community feed, school context). A
superadmin belongs to no school, so the page had nothing to show them — yet
they are exactly the person who needs to see what each school's page looks
like. The archive already accepts ?organization_id from a superadmin (and 403s
anyone else naming an org that is not theirs); these tests hold the same
contract for the other two reads.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_parent_service as parent
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
    def _ctx(self, org_rows):
        with patch.object(parent, 'get_supabase_admin_client',
                          return_value=_admin_returning(list(org_rows))):
            return parent.school_context_for_org('org-1')

    def test_returns_the_same_shape_the_hub_renders_from(self):
        assert self._ctx([ICREATE_ROW]) == {
            'orgs': [{'organization_id': 'org-1',
                      'organization_name': 'iCreate',
                      'is_guardian': False,
                      'post_registration_flow': 'goals',
                      'logo_url': 'data:image/png;base64,x'}],
            'is_guardian': False,
        }

    def test_never_claims_guardianship(self):
        """The preview is the member view. is_guardian drives the family-only
        cards (billing, absences, portal), and a superadmin guards nobody in
        the school being previewed."""
        assert self._ctx([ICREATE_ROW])['is_guardian'] is False

    def test_an_unknown_org_is_an_empty_context_not_an_error(self):
        assert self._ctx([]) == {'orgs': [], 'is_guardian': False}


@pytest.mark.unit
class TestFeedOrgResolution:
    """Which org's community board /api/sis/community/feed serves."""

    def _resolve(self, requested, member_org=None, role='parent'):
        with patch('services.sis_service.member_org_id', return_value=member_org), \
             patch.object(community_routes, '_caller_effective_role',
                          return_value=role):
            return community_routes._feed_org_for('u1', requested)

    def test_a_member_gets_their_own_school(self):
        assert self._resolve(None, member_org='org-1') == ('org-1', None)

    def test_naming_your_own_org_explicitly_is_fine(self):
        assert self._resolve('org-1', member_org='org-1') == ('org-1', None)

    def test_a_superadmin_may_preview_any_org(self):
        assert self._resolve('org-2', member_org=None,
                             role='superadmin') == ('org-2', None)

    def test_anyone_else_naming_another_org_is_refused(self):
        org, err = self._resolve('org-2', member_org='org-1', role='org_admin')
        assert org is None and err == 'forbidden'

    def test_a_caller_with_no_school_cannot_name_one_either(self):
        org, err = self._resolve('org-2', member_org=None, role='parent')
        assert org is None and err == 'forbidden'


@pytest.mark.unit
class TestSchoolContextGate:
    """Who /api/sis/school/context answers for."""

    def test_a_superadmin_naming_an_org_gets_that_orgs_context(self):
        with patch.object(school_routes, '_caller_is_superadmin', return_value=True), \
             patch.object(school_routes.parent, 'school_context_for_org',
                          return_value={'orgs': ['preview'], 'is_guardian': False}) as for_org:
            out = school_routes._context_payload('sa-1', 'org-2')
        for_org.assert_called_once_with('org-2')
        assert out['orgs'] == ['preview']

    def test_anyone_else_gets_the_membership_answer_param_ignored(self):
        with patch.object(school_routes, '_caller_is_superadmin', return_value=False), \
             patch.object(school_routes.parent, 'school_context',
                          return_value={'orgs': [], 'is_guardian': False}) as membership:
            out = school_routes._context_payload('u1', 'org-2')
        membership.assert_called_once_with('u1')
        assert out == {'orgs': [], 'is_guardian': False}

    def test_no_param_means_the_membership_answer_even_for_a_superadmin(self):
        with patch.object(school_routes, '_caller_is_superadmin', return_value=True), \
             patch.object(school_routes.parent, 'school_context',
                          return_value={'orgs': [], 'is_guardian': False}) as membership:
            school_routes._context_payload('sa-1', None)
        membership.assert_called_once_with('sa-1')
