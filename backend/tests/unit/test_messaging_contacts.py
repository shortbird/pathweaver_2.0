"""
Unit tests for the messaging contact-linkage additions (Package D):
- Optio Support is always appended (and routes to the superadmin alias).
- Parent <-> children id resolution (dependents + approved links).
- Parent-history authorization (is_parent_of_child) and read-only message fetch.
"""

from unittest.mock import MagicMock, patch

from routes.direct_messages import (
    _append_support_contact,
    _get_parent_child_ids,
    _build_support_contact,
)
from services.direct_message_service import DirectMessageService


SUPPORT_USER = {
    'id': 'support-uuid',
    'display_name': 'Tanner Bowman',
    'first_name': 'Tanner',
    'last_name': 'Bowman',
    'avatar_url': 'http://example.com/a.png',
    'role': 'superadmin',
}


def _supabase_with_support(support_user=SUPPORT_USER):
    """Mock supabase whose users lookup-by-email returns the support superadmin."""
    supabase = MagicMock()

    def table(name):
        t = MagicMock()
        t.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
            data=support_user
        )
        return t

    supabase.table.side_effect = table
    return supabase


# ── Optio Support alias ──

def test_build_support_contact_is_aliased():
    contact = _build_support_contact(SUPPORT_USER)
    assert contact['id'] == 'support-uuid'
    assert contact['display_name'] == 'Optio Support'
    assert contact['relationship'] == 'support'
    assert contact['is_support'] is True
    # Presented as a branded contact, not the raw superadmin avatar.
    assert contact['avatar_url'] is None


def test_support_appended_for_regular_user():
    supabase = _supabase_with_support()
    result = _append_support_contact(supabase, [], 'regular-user')
    assert len(result) == 1
    assert result[0]['is_support'] is True
    assert result[0]['display_name'] == 'Optio Support'


def test_support_not_appended_for_support_account_itself():
    supabase = _supabase_with_support()
    # The requester IS the support superadmin -> do not add a self contact.
    result = _append_support_contact(supabase, [], 'support-uuid')
    assert result == []


def test_support_dedupes_existing_contacts_and_replaces_raw_superadmin():
    supabase = _supabase_with_support()
    contacts = [
        {'id': 'a', 'display_name': 'Alice', 'relationship': 'child'},
        {'id': 'a', 'display_name': 'Alice dup', 'relationship': 'advisor'},
        # Raw superadmin surfaced via some relationship -> should be replaced by alias.
        {'id': 'support-uuid', 'display_name': 'Tanner Bowman', 'relationship': 'advisor'},
    ]
    result = _append_support_contact(supabase, contacts, 'regular-user')
    ids = [c['id'] for c in result]
    # 'a' deduped to one, support present exactly once as the alias.
    assert ids.count('a') == 1
    assert ids.count('support-uuid') == 1
    support = next(c for c in result if c['id'] == 'support-uuid')
    assert support['is_support'] is True
    assert support['display_name'] == 'Optio Support'


def test_append_support_resilient_when_support_lookup_fails():
    supabase = MagicMock()

    def table(name):
        t = MagicMock()
        t.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.side_effect = Exception('boom')
        return t

    supabase.table.side_effect = table
    contacts = [{'id': 'a', 'display_name': 'Alice', 'relationship': 'child'}]
    # Should still return the deduped contacts (just without support).
    result = _append_support_contact(supabase, contacts, 'regular-user')
    assert [c['id'] for c in result] == ['a']


# ── Parent -> children id resolution ──

def test_get_parent_child_ids_asks_the_one_definition():
    """It used to inline two of the three links and miss households, so a
    guardian who registered through the SIS funnel had no children in their own
    contact list. class_membership.children_of_parent is the shared answer."""
    with patch('utils.class_membership.children_of_parent',
               return_value={'dep-1', 'dep-2', 'link-1'}) as children:
        ids = _get_parent_child_ids(MagicMock(), 'parent-1')

    children.assert_called_once_with('parent-1')
    assert set(ids) == {'dep-1', 'dep-2', 'link-1'}


def test_get_parent_child_ids_is_empty_for_someone_with_no_children():
    with patch('utils.class_membership.children_of_parent', return_value=set()):
        assert _get_parent_child_ids(MagicMock(), 'nobody') == []


# ── Parent-history authorization (service) ──

def test_is_parent_of_child_asks_the_one_definition():
    """All three links -- managed_by_parent_id, an approved parent_student_link,
    and a shared household -- live in portfolio_access.is_parent_of. This used
    to inline the first two, so a household guardian could not read their own
    child's conversations."""
    svc = DirectMessageService()
    with patch('utils.portfolio_access.is_parent_of', return_value=True) as gate:
        assert svc.is_parent_of_child('parent-1', 'child-1') is True
    gate.assert_called_once_with('parent-1', 'child-1')


def test_is_parent_of_child_false_when_unrelated():
    svc = DirectMessageService()
    with patch('utils.portfolio_access.is_parent_of', return_value=False):
        assert svc.is_parent_of_child('parent-1', 'child-1') is False


def test_is_parent_of_child_fails_closed_on_a_lookup_error():
    svc = DirectMessageService()
    with patch('utils.portfolio_access.is_parent_of', side_effect=RuntimeError('boom')):
        assert svc.is_parent_of_child('parent-1', 'child-1') is False


# ── Read-only child conversation fetch ──

def test_get_child_conversation_messages_rejects_non_participant_child():
    supabase = MagicMock()

    def table(name):
        t = MagicMock()
        if name == 'message_conversations':
            t.select.return_value.eq.return_value.execute.return_value = MagicMock(
                data=[{'id': 'conv-1', 'participant_1_id': 'other-a', 'participant_2_id': 'other-b'}]
            )
        return t

    supabase.table.side_effect = table
    svc = DirectMessageService()
    with patch.object(svc, '_get_client', return_value=supabase):
        try:
            svc.get_child_conversation_messages('conv-1', 'child-1')
            raise AssertionError("expected ValueError")
        except ValueError as e:
            assert 'does not belong' in str(e)


def test_get_child_conversation_messages_returns_messages_for_participant_child():
    supabase = MagicMock()

    def table(name):
        t = MagicMock()
        if name == 'message_conversations':
            t.select.return_value.eq.return_value.execute.return_value = MagicMock(
                data=[{'id': 'conv-1', 'participant_1_id': 'child-1', 'participant_2_id': 'other-b'}]
            )
        elif name == 'direct_messages':
            t.select.return_value.eq.return_value.order.return_value.execute.return_value = MagicMock(
                data=[{'id': 'm1', 'message_content': 'hi'}]
            )
        return t

    supabase.table.side_effect = table
    svc = DirectMessageService()
    with patch.object(svc, '_get_client', return_value=supabase):
        msgs = svc.get_child_conversation_messages('conv-1', 'child-1')
        assert len(msgs) == 1
        assert msgs[0]['id'] == 'm1'
