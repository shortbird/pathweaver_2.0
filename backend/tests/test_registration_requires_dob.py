"""COPPA guard: self-registration must not proceed without a date of birth.

`/api/auth/register` used to read the field as
`data.get('date_of_birth')  # Optional`. The under-13 block that follows it was
wrapped in `if date_of_birth:`, so the check was not merely gameable by lying
about your age -- it was *skippable*. Omitting the key entirely walked straight
past it and created an adult account with no age on file, which then flows into
every downstream age decision (portfolio publication consent, parental consent
email, minor redaction).

These tests hit the route with the Flask test client and stop before any
database work: the rejection happens ahead of `get_supabase_admin_client()`, and
we assert that by making that symbol explode if it is ever reached. No DB, no
network -- so this runs in the ordinary backend job rather than the advisory
integration one.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest


def _payload(**overrides):
    """A registration body that is valid in every respect except what a test changes."""
    body = {
        'email': 'dob.guard@example.com',
        'password': 'Str0ng!PassPhrase42',
        'first_name': 'Dob',
        'last_name': 'Guard',
        'date_of_birth': '2000-01-01',
        'acceptedLegalTerms': True,
    }
    body.update(overrides)
    return body


def _boom(*_args, **_kwargs):
    raise AssertionError(
        'registration reached the database despite a missing date of birth'
    )


def _post(client, payload):
    """POST the payload with the password-breach lookup and DB stubbed out."""
    with patch(
        'routes.auth.registration.validate_password_not_breached',
        return_value=(True, None),
    ), patch(
        'routes.auth.registration.get_supabase_admin_client',
        side_effect=_boom,
    ):
        return client.post('/api/auth/register', json=payload)


def _message(response) -> str:
    return (response.get_data(as_text=True) or '').lower()


@pytest.mark.security
@pytest.mark.parametrize(
    'missing, why',
    [
        ({}, 'key absent entirely -- the original bypass'),
        ({'date_of_birth': None}, 'explicit null'),
        ({'date_of_birth': ''}, 'empty string'),
        ({'date_of_birth': '   '}, 'whitespace only'),
    ],
)
def test_registration_is_rejected_without_a_date_of_birth(client, missing, why):
    payload = _payload()
    if 'date_of_birth' in missing:
        payload['date_of_birth'] = missing['date_of_birth']
    else:
        payload.pop('date_of_birth')

    response = _post(client, payload)

    assert response.status_code == 400, f'accepted a registration with {why}'
    assert 'date of birth' in _message(response), (
        'the error must name the field so the signup form can point at it'
    )


@pytest.mark.security
def test_a_malformed_date_of_birth_is_still_rejected(client):
    """The required-check must not accidentally swallow the format check."""
    response = _post(client, _payload(date_of_birth='01/02/2000'))

    assert response.status_code == 400
    assert 'date of birth' in _message(response)


@pytest.mark.security
def test_an_under_13_registration_is_still_blocked(client):
    """The block the required-field fix exists to protect."""
    from datetime import date, timedelta

    recent = (date.today() - timedelta(days=8 * 365)).isoformat()

    response = _post(client, _payload(date_of_birth=recent))

    assert response.status_code == 403
    body = response.get_json() or {}
    assert body.get('error') == 'under_13_registration_blocked'


@pytest.mark.security
def test_the_route_source_does_not_treat_the_field_as_optional():
    """Cheap ratchet against the exact line that shipped the hole.

    A future edit could reintroduce `data.get('date_of_birth')` with no guard and
    the behavioural tests above would still pass if the guard moved somewhere
    unreachable. Pin the shape of the read instead.
    """
    from pathlib import Path

    source = (
        Path(__file__).resolve().parents[1] / 'routes' / 'auth' / 'registration.py'
    ).read_text(encoding='utf-8')

    assert "data.get('date_of_birth')  # Optional" not in source
    assert 'Date of birth is required' in source
