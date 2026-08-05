"""
Google/Apple signups must reach Brevo the same way email/password signups do.

Before this existed, OAuth accounts never touched Brevo: they missed the New
Account Welcome automation entirely, and a marketing lead who converted by
signing in with Google kept getting nurture emails because nothing ever marked
them converted. Both providers finish through the same accept_tos endpoint, so
this hook covers Apple too.
"""

from unittest.mock import patch

import pytest

from routes.auth.google_oauth import _sync_oauth_signup_to_brevo


def _run(user_data, promo_role=None, funnel='New Account Welcome'):
    """Call the sync with brevo_service stubbed; returns (result, sync, marked)."""
    with patch('services.brevo_service.sync_new_account', return_value=funnel) as sync, \
         patch('services.brevo_service.mark_converted') as marked:
        result = _sync_oauth_signup_to_brevo(user_data, promo_role)
    return result, sync, marked


@pytest.mark.unit
class TestOAuthBrevoSync:
    def test_platform_student_enters_the_welcome_automation(self):
        result, sync, marked = _run({
            'email': 'new@example.com',
            'first_name': 'Ada',
            'last_name': 'Lovelace',
            'role': 'student',
        })
        assert result == 'New Account Welcome'
        sync.assert_called_once_with('new@example.com', 'Ada', 'Lovelace', role='student')
        marked.assert_not_called()

    def test_org_user_uses_its_org_role(self):
        result, sync, _ = _run({
            'email': 'kid@school.org',
            'first_name': 'Sam',
            'last_name': 'Reyes',
            'role': 'org_managed',
            'org_role': 'student',
        })
        assert result == 'New Account Welcome'
        assert sync.call_args.kwargs['role'] == 'student'

    def test_under_13_is_only_conversion_marked(self):
        """No marketing to under-13s — but any nurture they were in must exit."""
        result, sync, marked = _run({
            'email': 'kid@example.com',
            'role': 'student',
            'requires_parental_consent': True,
        })
        assert result is None
        sync.assert_not_called()
        marked.assert_called_once_with('kid@example.com')

    def test_non_student_parent_roles_are_only_conversion_marked(self):
        for role in ('observer', 'advisor', 'org_admin'):
            result, sync, marked = _run({'email': 'x@example.com', 'role': role})
            assert result is None, role
            sync.assert_not_called()
            marked.assert_called_once_with('x@example.com')

    def test_promo_role_wins_over_the_stale_row(self):
        """user_data is read before the promo role update lands, so the promo
        role decides eligibility."""
        _, sync, marked = _run({'email': 'p@example.com', 'role': 'student'},
                               promo_role='observer')
        sync.assert_not_called()
        marked.assert_called_once()

        _, sync, marked = _run({'email': 'p@example.com', 'role': 'student'},
                               promo_role='parent')
        assert sync.call_args.kwargs['role'] == 'parent'
        marked.assert_not_called()

    def test_placeholder_names_are_not_written_to_brevo(self):
        """OAuth stores 'User' when the provider withholds a name (Apple's
        hide-my-name), which would render as "Hi User" in a nurture email."""
        _, sync, _ = _run({'email': 'anon@example.com', 'first_name': 'User',
                           'last_name': '', 'role': 'student'})
        assert sync.call_args.args[1] is None
        assert sync.call_args.args[2] is None

    def test_brevo_failure_never_breaks_sign_in(self):
        with patch('services.brevo_service.sync_new_account',
                   side_effect=RuntimeError('brevo down')):
            assert _sync_oauth_signup_to_brevo(
                {'email': 'new@example.com', 'role': 'student'}) is None

    def test_missing_email_is_a_no_op(self):
        result, sync, marked = _run({'role': 'student'})
        assert result is None
        sync.assert_not_called()
        marked.assert_not_called()

    def test_no_funnel_when_sync_reports_none(self):
        """A failed list add must not make the welcome copy claim follow-up."""
        result, _, _ = _run({'email': 'new@example.com', 'role': 'student'}, funnel=None)
        assert result is None
