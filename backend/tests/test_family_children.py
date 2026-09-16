"""One child list for a guardian: GET /api/family/children and the two
adapters that keep the older routes alive.

Until 2026-09-15 a guardian's children were listed by five endpoints with
five different queries. The mobile Family tab read only the SQL function
get_parent_dependents, which knew two of the three parent links, so a family
that registered through the SIS funnel (a household row, nothing else) had a
child who opened on the web and was missing from the app. These tests pin the
list to the one definition of parent (utils.class_membership.links_of_parent)
and pin the adapters to the shapes their installed clients read.
"""

from datetime import date
from unittest.mock import patch

import pytest

from services import family_children_service as svc

TODAY = date(2026, 9, 15)

LINKS = {
    'kid-managed': {'managed': True, 'linked': False, 'household': True},
    'kid-linked': {'managed': False, 'linked': True, 'household': False},
    'kid-household': {'managed': False, 'linked': False, 'household': True},
}

ROWS = {
    'kid-managed': {
        'id': 'kid-managed', 'first_name': 'Ada', 'last_name': 'Lovelace',
        'display_name': None, 'email': None, 'avatar_url': 'avatars/ada.png',
        'date_of_birth': '2016-03-01', 'is_dependent': True,
        'managed_by_parent_id': 'mum', 'promotion_eligible_at': '2026-01-01',
        'organization_id': 'org-1', 'total_xp': 120, 'level': 2,
        'ai_features_enabled': True, 'ai_chatbot_enabled': False,
    },
    'kid-linked': {
        'id': 'kid-linked', 'first_name': 'Ben', 'last_name': 'Lovelace',
        'display_name': 'Benny', 'email': 'ben@example.com',
        'avatar_url': None, 'date_of_birth': '2011-09-20', 'is_dependent': False,
        'managed_by_parent_id': None, 'promotion_eligible_at': None,
        'organization_id': 'org-1', 'total_xp': 900, 'level': 5,
    },
    'kid-household': {
        'id': 'kid-household', 'first_name': 'Cy', 'last_name': 'Lovelace',
        'display_name': '', 'email': None, 'avatar_url': None,
        'date_of_birth': None, 'is_dependent': True,
        'managed_by_parent_id': 'dad', 'promotion_eligible_at': '2030-01-01',
        'organization_id': 'org-1', 'total_xp': None, 'level': None,
    },
}


class FakeRepo:
    def __init__(self, client=None):
        pass

    def children_rows(self, ids):
        return {i: ROWS[i] for i in ids if i in ROWS}

    def active_quest_counts(self, ids):
        return {'kid-managed': 3}


@pytest.fixture
def family():
    with patch.object(svc, 'links_of_parent', return_value=dict(LINKS)) as links, \
         patch.object(svc, 'FamilyRepository', FakeRepo), \
         patch.object(svc, '_admin', return_value=object()), \
         patch.object(svc, 'sign_in_place', side_effect=lambda rows, fields: [
             r.__setitem__('avatar_url', f"signed:{r['avatar_url']}") for r in rows if r.get('avatar_url')]):
        yield links


@pytest.mark.unit
class TestChildrenOf:
    def test_every_link_type_is_a_child(self, family):
        out = svc.children_of('mum', today=TODAY)
        assert [c['id'] for c in out] == ['kid-managed', 'kid-linked', 'kid-household']
        family.assert_called_once_with('mum')

    def test_a_child_carries_which_links_hold(self, family):
        by_id = {c['id']: c for c in svc.children_of('mum', today=TODAY)}
        assert by_id['kid-household']['links'] == {'managed': False, 'linked': False, 'household': True}
        assert by_id['kid-managed']['managed_by_me'] is True
        # Managed by the other guardian, in the same household: still my child,
        # but not my login to hand out.
        assert by_id['kid-household']['managed_by_me'] is False

    def test_the_fields_the_retired_sql_function_reported(self, family):
        ada = svc.children_of('mum', today=TODAY)[0]
        assert ada['display_name'] == 'Ada Lovelace'
        assert ada['name'] == 'Ada Lovelace'
        assert ada['age'] == 10
        assert ada['promotion_eligible'] is True
        assert ada['active_quest_count'] == 3
        assert ada['total_xp'] == 120
        assert ada['ai_features_enabled'] is True
        assert ada['ai_chatbot_enabled'] is False
        assert ada['ai_lesson_helper_enabled'] is True   # absent means on
        assert ada['avatar_url'] == 'signed:avatars/ada.png'

    def test_defaults_for_a_sparse_row(self, family):
        cy = svc.children_of('mum', today=TODAY)[2]
        assert cy['display_name'] == 'Cy Lovelace'
        assert cy['age'] is None
        assert cy['promotion_eligible'] is False   # eligible_at in the future
        assert cy['active_quest_count'] == 0
        assert (cy['total_xp'], cy['level']) == (0, 1)

    def test_a_linked_students_own_display_name_wins(self, family):
        ben = svc.children_of('mum', today=TODAY)[1]
        assert ben['display_name'] == 'Benny'
        assert ben['is_dependent'] is False
        assert ben['promotion_eligible'] is False

    def test_nobodys_guardian_gets_an_empty_list(self):
        with patch.object(svc, 'links_of_parent', return_value={}), \
             patch.object(svc, 'FamilyRepository') as repo:
            assert svc.children_of('student-1') == []
        repo.assert_not_called()

    def test_a_linked_id_without_a_user_row_is_skipped(self, family):
        family.return_value = {**LINKS, 'ghost': {'managed': False, 'linked': True, 'household': False}}
        assert 'ghost' not in {c['id'] for c in svc.children_of('mum', today=TODAY)}


@pytest.mark.unit
class TestAdapters:
    def test_my_children_shape_lists_only_linked_students(self, family):
        rows = svc.as_linked_rows(svc.children_of('mum', today=TODAY))
        assert [r['student_id'] for r in rows] == ['kid-linked']
        assert rows[0]['student_first_name'] == 'Ben'
        assert rows[0]['student_total_xp'] == 900
        assert rows[0]['student_level'] == 5
        assert rows[0]['ai_task_generation_enabled'] is True

    def test_the_family_list_carries_the_keys_the_clients_read(self, family):
        rows = svc.children_of('mum', today=TODAY)
        assert [r['id'] for r in rows] == ['kid-managed', 'kid-linked', 'kid-household']
        # types/family.ts Child on mobile, useFamilyChildren on the web.
        for key in ('id', 'display_name', 'first_name', 'last_name', 'avatar_url',
                    'total_xp', 'is_dependent', 'date_of_birth', 'role'):
            assert key in rows[0], key


@pytest.mark.unit
class TestRoute:
    def test_the_route_is_registered_once(self):
        from app import app
        rules = [r for r in app.url_map.iter_rules() if r.rule == '/api/family/children']
        assert len(rules) == 1
        assert rules[0].endpoint == 'family_children.my_children'
        assert 'GET' in rules[0].methods

    def test_the_route_returns_the_service_answer(self, client, auth_headers_for):
        from routes import family_children
        with patch.object(family_children.family_children_service, 'children_of',
                          return_value=[{'id': 'kid-1'}]) as children_of:
            resp = client.get('/api/family/children',
                              headers=auth_headers_for('3f1c2b7a-9d54-4a1e-b0c8-6e2f77a91d33'))
        assert resp.status_code == 200
        assert resp.get_json() == {'success': True, 'children': [{'id': 'kid-1'}], 'count': 1}
        children_of.assert_called_once_with('3f1c2b7a-9d54-4a1e-b0c8-6e2f77a91d33')

    def test_nobodys_guardian_is_answered_not_refused(self, client, auth_headers_for):
        """The routes this replaces 403'd a non-parent, and every client had to
        read that 403 as 'no children' -- which also swallowed the 403 a
        phone-verification hold raises. Here an empty family is a 200."""
        from routes import family_children
        with patch.object(family_children.family_children_service, 'children_of', return_value=[]):
            resp = client.get('/api/family/children',
                              headers=auth_headers_for('3f1c2b7a-9d54-4a1e-b0c8-6e2f77a91d33'))
        assert resp.status_code == 200
        assert resp.get_json()['children'] == []
