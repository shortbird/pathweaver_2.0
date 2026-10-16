"""/api/observers/my-observers says whether the student may invite.

Ticket ecc20c83 (Sentry): an Apogee Cache Valley student clicked "Create an
invite link" on /feedback and got a 403 from /api/observers/generate-link with
a bare "parent_required" toast. The 403 is right -- observers are added by
parents, and is_minor_by_id fails closed on a missing date of birth -- so the
page must know before the click. my-observers now carries `can_invite` and,
when it is False, `approver_name`, computed by the same invite_gate helper
that generate-link refuses with.
"""

from unittest.mock import MagicMock, patch

import pytest


STUDENT_ID = 'ecc20c83-1111-4111-8111-111111111111'


def _empty_admin():
    """Every table answers "no rows"; the users row for the student has no
    parent and no organization, so the viewers list is just Optio."""
    admin = MagicMock()

    def _table(name):
        t = MagicMock()
        for m in ('select', 'eq', 'in_', 'order', 'limit'):
            getattr(t, m).return_value = t
        t.execute.return_value = MagicMock(data=[])
        t.single.return_value.execute.return_value = MagicMock(
            data={'managed_by_parent_id': None, 'organization_id': None})
        return t

    admin.table.side_effect = _table
    return admin


def _get_my_observers(client, *, user_row, approver):
    """GET my-observers with the age read answering `user_row` (the real
    is_minor runs on it) and find_approver answering `approver`."""
    with patch('routes.observer.student_invitations.get_supabase_admin_client',
               return_value=_empty_admin()), \
         patch('database.get_supabase_admin_client', return_value=_empty_admin()), \
         patch('utils.portfolio_access._fetch_user', return_value=user_row), \
         patch('utils.portfolio_access.find_approver', return_value=approver), \
         patch('utils.session_manager.session_manager.get_effective_user_id',
               return_value=STUDENT_ID):
        return client.get('/api/observers/my-observers')


@pytest.mark.unit
class TestMyObserversCanInvite:
    def test_an_adult_can_invite(self, client):
        """Ticket ecc20c83: an adult keeps the button."""
        resp = _get_my_observers(
            client,
            user_row={'id': STUDENT_ID, 'is_dependent': False, 'date_of_birth': '1990-01-01'},
            approver=None,
        )
        assert resp.status_code == 200, resp.get_data(as_text=True)
        body = resp.get_json()
        assert body['can_invite'] is True
        assert 'approver_name' not in body

    def test_a_minor_cannot_and_is_told_whom_to_ask(self, client):
        """Ticket ecc20c83: a minor gets can_invite False and their parent's
        first name, the same name generate-link's 403 message would use."""
        resp = _get_my_observers(
            client,
            user_row={'id': STUDENT_ID, 'is_dependent': False, 'date_of_birth': '2012-05-01'},
            approver={'user_id': 'p1', 'kind': 'parent', 'first_name': 'Summer'},
        )
        assert resp.status_code == 200, resp.get_data(as_text=True)
        body = resp.get_json()
        assert body['can_invite'] is False
        assert body['approver_name'] == 'Summer'

    def test_no_date_of_birth_fails_closed(self, client):
        """Ticket ecc20c83: unknown age is a minor (is_minor fails closed), and
        with nobody accountable the name falls back exactly as the server's
        generate-link message does."""
        resp = _get_my_observers(
            client,
            user_row={'id': STUDENT_ID, 'is_dependent': False, 'date_of_birth': None},
            approver=None,
        )
        assert resp.status_code == 200, resp.get_data(as_text=True)
        body = resp.get_json()
        assert body['can_invite'] is False
        assert body['approver_name'] == 'a parent or guardian'


@pytest.mark.unit
class TestGenerateLinkStillRefusesMinors:
    def test_the_403_uses_the_same_gate(self, client):
        """Ticket ecc20c83: the backend gate stays. generate-link refuses a
        minor with parent_required and a sentence naming the approver."""
        with patch('utils.portfolio_access._fetch_user',
                   return_value={'id': STUDENT_ID, 'date_of_birth': None}), \
             patch('utils.portfolio_access.find_approver',
                   return_value={'user_id': 'p1', 'kind': 'parent', 'first_name': 'Summer'}), \
             patch('utils.session_manager.session_manager.get_effective_user_id',
                   return_value=STUDENT_ID):
            resp = client.post('/api/observers/generate-link', json={})
        assert resp.status_code == 403
        body = resp.get_json()
        assert body['error'] == 'parent_required'
        assert body['message'].startswith('Ask Summer to send this invitation.')
        assert body['approver_kind'] == 'parent'
