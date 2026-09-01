"""
Giving a dependent their own login must not mint a second auth account.

Sentry OPTIO-BACKEND-7M/7N, 2026-09-01: a parent tried three times to add a
login for their child and failed three times, leaking an orphaned auth account
on each attempt.

The endpoint created a NEW auth user and then tried to repoint users.id at it:

  * `check_dependent_no_email` is CHECK (NOT is_dependent OR email IS NULL).
    create_dependent writes exactly that COPPA shape -- id from a stub auth
    account, email NULL -- so the UPDATE ... SET email raised 23514 every time.
    The endpoint could never have succeeded for any dependent, ever.
  * The exception escaped before the rollback (which only ran when the update
    returned no rows, not when it threw), so the just-created auth user
    survived holding the address. The next attempt then died on "A user with
    this email address has already been registered" -- a second, different
    error for the same root cause, which is why one parent produced two issues.

The dependent already HAS an auth account whose id is the profile's id, so the
credentials go there and public.users is not touched at all.
"""

from unittest.mock import Mock, patch

import pytest

import app  # noqa: F401 — import graph ordering
import routes.dependents as dependents


DEPENDENT_ID = 'dep-1'
PARENT_ID = 'parent-1'
PLACEHOLDER = 'dependent_abc123@optio-internal-placeholder.local'


@pytest.fixture
def admin():
    """Admin client whose users table reports no email collision."""
    client = Mock()
    query = Mock()
    query.select.return_value = query
    query.eq.return_value = query
    query.update.return_value = query
    query.execute.return_value = Mock(data=[])
    client.table.return_value = query
    return client


@pytest.fixture
def call(admin):
    """Invoke add_dependent_login with everything around it stubbed out."""

    def _call(payload=None, dependent=None, update_side_effect=None):
        dependent = dependent or {
            'id': DEPENDENT_ID,
            'display_name': 'Rocky',
            'email': PLACEHOLDER,
        }
        payload = payload or {
            'email': 'therealrocky@example.com',
            'password': 'Str0ng!Passw0rd',
        }
        repo = Mock()
        repo.get_dependent.return_value = dependent
        if update_side_effect is not None:
            admin.auth.admin.update_user_by_id.side_effect = update_side_effect

        from flask import Flask
        flask_app = Flask(__name__)
        with flask_app.test_request_context('/add-login', method='POST', json=payload), \
             patch.object(dependents, 'get_supabase_admin_client', return_value=admin), \
             patch.object(dependents, 'DependentRepository', return_value=repo), \
             patch.object(dependents, 'verify_parent_role', return_value=True), \
             patch.object(dependents, 'validate_password_strength', return_value=(True, [])):
            # The route is wrapped by @require_auth/@validate_uuid_param; call
            # the underlying view so the test exercises the logic, not the
            # decorators.
            view = dependents.add_dependent_login.__wrapped__.__wrapped__
            return view(PARENT_ID, DEPENDENT_ID)

    return _call


class TestTheExistingAuthAccountIsUpdated:
    def test_credentials_land_on_the_dependents_own_auth_id(self, call, admin):
        body, status = call()
        assert status == 200
        admin.auth.admin.update_user_by_id.assert_called_once()
        target_id, attrs = admin.auth.admin.update_user_by_id.call_args[0]
        assert target_id == DEPENDENT_ID
        assert attrs['email'] == 'therealrocky@example.com'
        assert attrs['password'] == 'Str0ng!Passw0rd'

    def test_no_second_auth_account_is_created(self, call, admin):
        """The leak: every failed attempt used to strand a new auth user."""
        call()
        admin.auth.admin.create_user.assert_not_called()

    def test_the_profile_row_is_not_written(self, call, admin):
        """public.users.email must stay NULL — check_dependent_no_email — and
        users.id must not be repointed at a different auth account."""
        call()
        assert not any(
            c for c in admin.table.return_value.update.call_args_list
        ), 'add_dependent_login must not update the users row'

    def test_the_response_reports_the_unchanged_id(self, call):
        body, _ = call()
        assert body.json['dependent']['id'] == DEPENDENT_ID
        assert body.json['success'] is True


class TestEmailCollisions:
    def test_a_duplicate_in_auth_is_reported_as_a_clear_message(self, call):
        """GoTrue's wording became an opaque 500 before; it is a 400 now."""
        error = Exception('A user with this email address has already been registered')
        body, status = call(update_side_effect=error)
        assert status == 400
        assert 'already in use' in body.json['error'].lower()

    def test_an_unrelated_auth_failure_is_not_called_a_duplicate(self, call):
        body, status = call(update_side_effect=Exception('network unreachable'))
        assert status == 400
        assert 'already in use' not in body.json['error'].lower()


class TestGuards:
    def test_a_dependent_who_already_has_a_real_email_is_rejected(self, call):
        body, status = call(dependent={
            'id': DEPENDENT_ID,
            'display_name': 'Rocky',
            'email': 'already@example.com',
        })
        assert status == 400
        assert 'already has login credentials' in body.json['error']

    def test_a_placeholder_email_does_not_count_as_having_credentials(self, call, admin):
        """The stub address create_dependent writes is not a real login."""
        _, status = call()
        assert status == 200
        admin.auth.admin.update_user_by_id.assert_called_once()

    @pytest.mark.parametrize('payload', [
        {'password': 'Str0ng!Passw0rd'},
        {'email': 'x@example.com'},
        {'email': 'not-an-email', 'password': 'Str0ng!Passw0rd'},
    ])
    def test_bad_input_is_rejected_before_auth_is_touched(self, call, admin, payload):
        _, status = call(payload=payload)
        assert status == 400
        admin.auth.admin.update_user_by_id.assert_not_called()
