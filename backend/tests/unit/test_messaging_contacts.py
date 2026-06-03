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

def test_get_parent_child_ids_combines_dependents_and_links():
    supabase = MagicMock()

    def table(name):
        t = MagicMock()
        if name == 'users':
            t.select.return_value.eq.return_value.execute.return_value = MagicMock(
                data=[{'id': 'dep-1'}, {'id': 'dep-2'}]
            )
        elif name == 'parent_student_links':
            t.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
                data=[{'student_user_id': 'link-1'}, {'student_user_id': 'dep-1'}]
            )
        return t

    supabase.table.side_effect = table
    ids = _get_parent_child_ids(supabase, 'parent-1')
    # Union, de-duplicated.
    assert set(ids) == {'dep-1', 'dep-2', 'link-1'}


# ── Parent-history authorization (service) ──

def _service_with_parent_link(managed_by=None, link_rows=None):
    supabase = MagicMock()

    def table(name):
        t = MagicMock()
        if name == 'users':
            t.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
                data={'managed_by_parent_id': managed_by}
            )
        elif name == 'parent_student_links':
            t.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
                data=link_rows or []
            )
        return t

    supabase.table.side_effect = table
    return supabase


def test_is_parent_of_child_true_via_managed_by():
    supabase = _service_with_parent_link(managed_by='parent-1')
    svc = DirectMessageService()
    with patch.object(svc, '_get_client', return_value=supabase):
        assert svc.is_parent_of_child('parent-1', 'child-1') is True


def test_is_parent_of_child_true_via_approved_link():
    supabase = _service_with_parent_link(managed_by=None, link_rows=[{'id': 'l1'}])
    svc = DirectMessageService()
    with patch.object(svc, '_get_client', return_value=supabase):
        assert svc.is_parent_of_child('parent-1', 'child-1') is True


def test_is_parent_of_child_false_when_unrelated():
    supabase = _service_with_parent_link(managed_by='someone-else', link_rows=[])
    svc = DirectMessageService()
    with patch.object(svc, '_get_client', return_value=supabase):
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
            assert False, "expected ValueError"
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
