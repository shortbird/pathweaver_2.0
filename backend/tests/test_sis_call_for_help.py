"""
A teacher raising a hand from the room.

iCreate, 2026-08-25 (9d0618f8): "it would be super helpful to have a Campus
Coordinator 'call button'? ... this button would send a notification to any
campus coordinator role when a teacher needed help in the class. Just not sure
how this could show up for the campus coordinator that they would notice it?"

It shows up as a notification — the surface that already rings their bell and
pushes to their phone. What is worth pinning down is WHO gets called: every
coordinator, every admin (a school may have no coordinator on shift, and a call
that reaches nobody is worse than no button), and never the caller themselves.
"""

from unittest.mock import patch

import pytest

from services import sis_service


ORG = 'org-1'

STAFF = [
    {'id': 'molly', 'roles': ['org_admin']},
    {'id': 'katrine', 'roles': ['campus_coordinator']},
    {'id': 'both', 'roles': ['campus_coordinator', 'advisor']},
    {'id': 'ana', 'roles': ['advisor']},
    {'id': 'nobody', 'roles': []},
]


def _front_office(staff=STAFF):
    with patch.object(sis_service, 'list_org_staff', return_value=staff):
        return sis_service.front_office_ids(ORG)


@pytest.mark.unit
class TestWhoGetsCalled:
    def test_coordinators_are_called(self):
        assert 'katrine' in _front_office()

    def test_admins_are_called_too(self):
        """A school may have no coordinator on shift."""
        assert 'molly' in _front_office()

    def test_a_plain_teacher_is_not(self):
        """The point is to reach the office, not the staffroom."""
        assert 'ana' not in _front_office()
        assert 'nobody' not in _front_office()

    def test_somebody_holding_both_roles_is_called_once(self):
        assert _front_office().count('both') == 1

    def test_a_school_with_no_office_returns_nobody_rather_than_everybody(self):
        """The caller reads an empty list as "tell the office directly" — it must
        never fall back to notifying the whole staff."""
        assert _front_office([{'id': 'ana', 'roles': ['advisor']}]) == []


# ── The route: who is named, the hand going back down, and view-as ──

from unittest.mock import MagicMock  # noqa: E402

CLASS = {'id': 'c1', 'name': 'Lego Robotics', 'organization_id': 'org-1'}
OFFICE = [
    {'id': 'molly', 'first_name': 'Molly', 'name': 'Molly Christensen', 'roles': ['org_admin']},
    {'id': 'katrine', 'first_name': 'Katrine', 'name': 'Katrine Myers', 'roles': ['campus_coordinator']},
    {'id': 'test-user-123', 'first_name': 'Me', 'name': 'Me', 'roles': ['org_admin']},
]


def _admin():
    client = MagicMock()
    table = MagicMock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit', 'delete', 'contains'):
        getattr(table, chained).return_value = table
    table.execute.return_value = MagicMock(data=[{'display_name': 'Nicole Connole'}])
    return client, table


@pytest.mark.unit
class TestTheRoute:
    def test_names_who_was_called_and_hands_back_a_call_id(self, client, auth_headers, mock_verify_token):
        admin, table = _admin()
        with patch('routes.sis.class_quests._authorize', return_value=(CLASS, admin, None)), \
             patch('routes.sis.class_quests.get_supabase_admin_client', return_value=admin), \
             patch('routes.sis.class_quests.sis_service.front_office_staff', return_value=OFFICE), \
             patch('routes.sis.class_quests.sis_notifications.notify') as notify:
            resp = client.post('/api/sis/classes/c1/call-for-help', headers=auth_headers, json={})
        assert resp.status_code == 200
        body = resp.get_json()
        # The caller is never called, and the answer says who was.
        assert body['notified'] == 2
        assert body['names'] == ['Molly', 'Katrine']
        assert body['call_id']
        # Each bell entry carries the call id (so it can be taken back) and a
        # link the classes page actually opens (?class=, not ?class_id=).
        kwargs = [c.kwargs for c in notify.call_args_list]
        assert {k['metadata']['help_call_id'] for k in kwargs} == {body['call_id']}
        assert {k['link'] for k in kwargs} == {'/classes?class=c1'}
        assert [c.args[0] for c in notify.call_args_list] == ['molly', 'katrine']

    def test_cancel_deletes_the_bell_entries_and_tells_the_same_people(self, client, auth_headers, mock_verify_token):
        admin, table = _admin()
        call_id = '11111111-1111-4111-8111-111111111111'
        with patch('routes.sis.class_quests._authorize', return_value=(CLASS, admin, None)), \
             patch('routes.sis.class_quests.get_supabase_admin_client', return_value=admin), \
             patch('routes.sis.class_quests.sis_service.front_office_staff', return_value=OFFICE), \
             patch('routes.sis.class_quests.NotificationRepository') as repo, \
             patch('routes.sis.class_quests.sis_notifications.notify') as notify:
            resp = client.post(f'/api/sis/classes/c1/call-for-help/{call_id}/cancel',
                               headers=auth_headers, json={})
        assert resp.status_code == 200
        repo.return_value.delete_help_call.assert_called_once_with('org-1', call_id)
        assert [c.args[0] for c in notify.call_args_list] == ['molly', 'katrine']
        assert all('cancelled' in c.args[2] for c in notify.call_args_list)

    def test_cancel_wants_a_real_call_id(self, client, auth_headers, mock_verify_token):
        admin, _ = _admin()
        with patch('routes.sis.class_quests._authorize', return_value=(CLASS, admin, None)):
            resp = client.post('/api/sis/classes/c1/call-for-help/not-a-uuid/cancel',
                               headers=auth_headers, json={})
        assert resp.status_code == 400

    def test_refused_while_viewing_as_someone_else(self, client, auth_headers, mock_verify_token):
        """An admin previewing a teacher pressed it and ten phones buzzed under
        the teacher's name (iCreate, 2026-09-15, 851764d3)."""
        admin, _ = _admin()
        masq = {'is_masquerading': True, 'target_user_id': 'test-user-123', 'admin_id': 'molly'}
        with patch('utils.auth.decorators.session_manager.get_masquerade_info', return_value=masq), \
             patch('routes.sis.class_quests._authorize', return_value=(CLASS, admin, None)), \
             patch('routes.sis.class_quests.sis_notifications.notify') as notify:
            resp = client.post('/api/sis/classes/c1/call-for-help', headers=auth_headers, json={})
        assert resp.status_code == 409
        notify.assert_not_called()
