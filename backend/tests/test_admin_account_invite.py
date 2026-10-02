"""
"Create account by email" from /admin/users (services/account_invite_service.py).

The account must be fully set up before the email leaves, because there is no
later step that grants access: the first sign-in, by Google, Apple or a
password, lands in whatever row this wrote. So:
- org members are role='org_managed' with the real role in org_role/org_roles,
  and platform users carry the real role directly;
- the auth email is confirmed, so an OAuth sign-in links onto this user;
- the link goes to /auth/welcome with a minted token, never a password;
- org-only roles need an org, superadmin cannot be minted, and an existing
  email is refused rather than doubled.
"""

from unittest.mock import Mock, patch

import pytest


def _admin(existing_user=None, org_row=None):
    """Admin stub. Records users inserts on client.inserted."""
    client = Mock()
    client.inserted = []

    def table(name):
        t = Mock()
        for chained in ('select', 'eq', 'limit', 'maybe_single', 'update'):
            getattr(t, chained).return_value = t
        if name == 'users':
            t.execute.return_value = Mock(data=[existing_user] if existing_user else [])

            def insert(row):
                client.inserted.append(row)
                written = Mock()
                written.execute.return_value = Mock(data=[row])
                return written
            t.insert.side_effect = insert
        elif name == 'organizations':
            # find_by_id is maybe_single(): a dict, not a list.
            t.execute.return_value = Mock(data=org_row)
        return t

    client.table.side_effect = table
    client.auth.admin.create_user.return_value = Mock(user=Mock(id='new-user-id'))
    return client


def _create(admin, **kwargs):
    from services import account_invite_service
    sender = Mock(return_value=True)
    with patch.object(account_invite_service, '_admin', return_value=admin), \
         patch('utils.invite_tokens.mint_invite_token', return_value='tok123'), \
         patch('routes.auth.google_oauth.ensure_user_diploma_and_skills') as diploma, \
         patch('services.email_service.email_service.send_account_invite_email', sender):
        result = account_invite_service.create_account_invite(**kwargs)
    return result, sender, diploma


@pytest.mark.unit
class TestAccountShape:
    def test_platform_student(self):
        admin = _admin()
        result, sender, diploma = _create(admin, email=' New@Example.com ', role='student')
        assert result == {'user_id': 'new-user-id', 'email': 'new@example.com', 'email_sent': True}
        row = admin.inserted[0]
        assert row['role'] == 'student'
        assert 'organization_id' not in row and 'org_role' not in row
        diploma.assert_called_once()

    def test_org_member_is_org_managed(self):
        admin = _admin(org_row={'id': 'org-1', 'name': 'Hearthwood'})
        _, sender, diploma = _create(admin, email='p@example.com', role='parent',
                                     organization_id='org-1')
        row = admin.inserted[0]
        assert row['role'] == 'org_managed'
        assert row['org_role'] == 'parent'
        assert row['org_roles'] == ['parent']
        assert row['organization_id'] == 'org-1'
        assert sender.call_args.kwargs['org_name'] == 'Hearthwood'
        diploma.assert_not_called()

    def test_auth_email_is_confirmed_so_oauth_links(self):
        admin = _admin()
        _create(admin, email='a@example.com', role='student')
        payload = admin.auth.admin.create_user.call_args.args[0]
        assert payload['email_confirm'] is True

    def test_link_goes_to_welcome_page_with_token(self):
        _, sender, _ = _create(_admin(), email='a@example.com', role='advisor')
        link = sender.call_args.kwargs['invite_link']
        assert '/auth/welcome?token=tok123' in link
        assert 'email=a%40example.com' in link


@pytest.mark.unit
class TestRefusals:
    def _err(self, admin=None, **kwargs):
        from services.account_invite_service import AccountInviteError
        with pytest.raises(AccountInviteError) as exc:
            _create(admin or _admin(), **kwargs)
        return exc.value

    def test_existing_email_refused(self):
        admin = _admin(existing_user={'id': 'old'})
        err = self._err(admin, email='a@example.com', role='student')
        assert err.status == 409
        admin.auth.admin.create_user.assert_not_called()

    def test_org_role_needs_org(self):
        err = self._err(email='a@example.com', role='org_admin')
        assert 'organization' in str(err)

    def test_superadmin_cannot_be_minted(self):
        self._err(email='a@example.com', role='superadmin')
        self._err(_admin(org_row={'id': 'o', 'name': 'X'}), email='a@example.com',
                  role='superadmin', organization_id='o')

    def test_bad_email(self):
        self._err(email='not-an-email', role='student')

    def test_unknown_org(self):
        err = self._err(email='a@example.com', role='student', organization_id='nope')
        assert err.status == 404

    def test_profile_failure_rolls_back_auth_user(self):
        admin = _admin()
        orig = admin.table.side_effect

        def table(name):
            t = orig(name)
            if name == 'users':
                t.insert.side_effect = Exception('boom')
            return t
        admin.table.side_effect = table
        self._err(admin, email='a@example.com', role='student')
        admin.auth.admin.delete_user.assert_called_once_with('new-user-id')
