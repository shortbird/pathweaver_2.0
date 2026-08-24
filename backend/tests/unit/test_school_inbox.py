"""
Unit tests for the school inbox — the "{School Name}" messaging contact.

Locks in the rules that make the feature safe:
- The contact appears for org members (resolved via sis_service.member_org_id,
  so platform parents get it too) and never for outsiders.
- can_message_school allows member <-> inbox for the SAME org only, and denies
  when the org is inactive.
- Messages to the inbox notify the front office (org_admin + campus
  coordinator), not the account itself, and never the member who wrote in.
- sent_by attribution resolves staff names for the shared-inbox view.
"""

from unittest.mock import MagicMock, patch

from services import school_inbox_service
from routes.direct_messages import _append_school_contact


ORG = {'id': 'org-1', 'name': 'iCreate', 'slug': 'icreate',
       'is_active': True, 'inbox_user_id': 'inbox-1'}


# ── The member-facing contact ──

def test_school_contact_shape():
    contact = school_inbox_service.school_contact(ORG, 'inbox-1')
    assert contact['id'] == 'inbox-1'
    assert contact['display_name'] == 'iCreate'
    assert contact['relationship'] == 'school'
    assert contact['is_school'] is True


def test_append_school_contact_for_member():
    with patch.object(school_inbox_service, 'member_org', return_value=ORG), \
         patch.object(school_inbox_service, 'get_or_create_inbox_user', return_value='inbox-1'):
        contacts = [{'id': 'a', 'display_name': 'Alice'}]
        _append_school_contact(contacts, 'member-1')
    assert contacts[-1]['id'] == 'inbox-1'
    assert contacts[-1]['is_school'] is True
    assert contacts[-1]['display_name'] == 'iCreate'


def test_append_school_contact_skipped_for_non_member():
    with patch.object(school_inbox_service, 'member_org', return_value=None):
        contacts = []
        _append_school_contact(contacts, 'platform-user')
    assert contacts == []


def test_append_school_contact_never_raises():
    with patch.object(school_inbox_service, 'member_org', side_effect=RuntimeError('boom')):
        contacts = [{'id': 'a'}]
        _append_school_contact(contacts, 'member-1')
    assert contacts == [{'id': 'a'}]


# ── The permission rule ──

def _admin_with_org_rows(rows):
    admin = MagicMock()
    admin.table.return_value.select.return_value.in_.return_value.execute.return_value = MagicMock(data=rows)
    return admin


def test_can_message_school_member_of_same_org():
    with patch.object(school_inbox_service, '_admin', return_value=_admin_with_org_rows([ORG])), \
         patch('services.sis_service.member_org_id', return_value='org-1'):
        assert school_inbox_service.can_message_school('member-1', 'inbox-1') is True
        # Symmetric: the inbox (staff replying as the school) may DM the member.
        assert school_inbox_service.can_message_school('inbox-1', 'member-1') is True


def test_can_message_school_denies_other_org_member():
    with patch.object(school_inbox_service, '_admin', return_value=_admin_with_org_rows([ORG])), \
         patch('services.sis_service.member_org_id', return_value='org-OTHER'):
        assert school_inbox_service.can_message_school('outsider', 'inbox-1') is False


def test_can_message_school_denies_inactive_org():
    inactive = {**ORG, 'is_active': False}
    with patch.object(school_inbox_service, '_admin', return_value=_admin_with_org_rows([inactive])), \
         patch('services.sis_service.member_org_id', return_value='org-1'):
        assert school_inbox_service.can_message_school('member-1', 'inbox-1') is False


def test_can_message_school_false_for_two_normal_users():
    with patch.object(school_inbox_service, '_admin', return_value=_admin_with_org_rows([])):
        assert school_inbox_service.can_message_school('user-a', 'user-b') is False


# ── Notification fan-out to the front office ──

def test_member_message_notifies_admins_and_coordinators_not_sender():
    staff = [
        {'id': 'admin-1', 'roles': ['org_admin']},
        {'id': 'coord-1', 'roles': ['campus_coordinator', 'parent']},
        {'id': 'teacher-1', 'roles': ['advisor']},
        {'id': 'sender-admin', 'roles': ['org_admin']},
    ]
    notification_service = MagicMock()
    with patch('services.sis_service.list_org_staff', return_value=staff), \
         patch('services.notification_service.NotificationService', return_value=notification_service):
        school_inbox_service.notify_admins_of_member_message(
            ORG, 'sender-admin', 'Sam', 'hello')

    notified = [c.kwargs['user_id'] for c in notification_service.create_notification.call_args_list]
    assert set(notified) == {'admin-1', 'coord-1'}  # teacher excluded, sender excluded
    for c in notification_service.create_notification.call_args_list:
        assert c.kwargs['link'] == '/inbox'
        assert 'iCreate' in c.kwargs['title']


# ── sent_by attribution ──

def test_attach_sent_by_names():
    admin = MagicMock()
    admin.table.return_value.select.return_value.in_.return_value.execute.return_value = MagicMock(
        data=[{'id': 'staff-1', 'display_name': 'Kate', 'first_name': 'Kate', 'last_name': ''}]
    )
    messages = [
        {'id': 'm1', 'sent_by_user_id': 'staff-1'},
        {'id': 'm2', 'sent_by_user_id': None},
    ]
    with patch.object(school_inbox_service, '_admin', return_value=admin):
        school_inbox_service.attach_sent_by_names(messages)
    assert messages[0]['sent_by_name'] == 'Kate'
    assert 'sent_by_name' not in messages[1]
