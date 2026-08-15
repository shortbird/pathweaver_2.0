"""Integration tests for the authentication flow.

Drives the real app against a real database: login goes through GoTrue, tokens
are minted and verified by session_manager, and profile reads go through
PostgREST. Nothing here is mocked.

Ported 2026-08-13. The previous version of this file could not run -- it seeded
through an `execute_sql` RPC that has never existed, wrote to a `test_schema`
the app never reads, and authenticated by setting `session['user_id']`, which
require_auth does not look at. It also asserted almost nothing:
`assert response.status_code in [200, 401]` passes whichever happens, and eight
of the thirteen tests were that shape. Assertions here are single-valued.
See backend/tests/integration/README.md.
"""

import uuid
from unittest.mock import patch

import pytest

# Every test drives the app end to end and needs a live stack.
pytestmark = pytest.mark.requires_db


@pytest.fixture
def no_brevo_sync():
    """Stop registration reaching the live Brevo account.

    Registering a user calls brevo_service.sync_new_account, which POSTs to
    api.brevo.com. The suite's _no_outbound_email guard catches that and fails
    the test -- correctly: a test run must not write contacts into the real
    marketing account. Registration swallows Brevo errors, so patching it out
    changes nothing else about the flow under test.
    """
    with patch('services.brevo_service.sync_new_account') as sync, \
         patch('services.brevo_service.mark_converted') as converted:
        yield sync, converted


def _set_cookie_headers(response):
    """All Set-Cookie headers on a response, lowercased."""
    return [h.lower() for h in response.headers.getlist('Set-Cookie')]


def _cookie_named(response, name):
    """The Set-Cookie header for `name`, or None."""
    for header in _set_cookie_headers(response):
        if header.startswith(f'{name.lower()}='):
            return header
    return None


def _valid_registration(**overrides):
    payload = {
        'email': f'reg_{uuid.uuid4().hex[:10]}@example.com',
        'password': 'StrongP@ssw0rd123!',
        'first_name': 'Test',
        'last_name': 'User',
        # The route accepts either acceptedLegalTerms, or acceptedTerms AND
        # acceptedPrivacy together (routes/auth/registration.py:125).
        'acceptedLegalTerms': True,
        # Required as of 2026-08-15. It used to be optional, which meant the
        # under-13 COPPA block could be skipped by simply omitting the field
        # rather than by lying about it. An adult date, so these tests exercise
        # ordinary signup; the age gate has its own tests below.
        'date_of_birth': '1990-01-01',
    }
    payload.update(overrides)
    return payload


# Login


@pytest.mark.integration
@pytest.mark.critical
def test_login_succeeds_and_sets_httponly_cookies(client, student):
    response = client.post('/api/auth/login', json={
        'email': student['email'],
        'password': student['password'],
    })

    assert response.status_code == 200

    access = _cookie_named(response, 'access_token')
    refresh = _cookie_named(response, 'refresh_token')
    assert access is not None, 'login did not set an access_token cookie'
    assert refresh is not None, 'login did not set a refresh_token cookie'

    # ADR-001: tokens live in httpOnly cookies precisely so document.cookie
    # cannot read them. If this attribute ever goes missing, XSS gets the
    # session.
    assert 'httponly' in access
    assert 'httponly' in refresh


@pytest.mark.integration
@pytest.mark.critical
def test_login_rejects_wrong_password(client, student):
    response = client.post('/api/auth/login', json={
        'email': student['email'],
        'password': 'DefinitelyNotTheP@ssw0rd!',
    })

    assert response.status_code == 401
    assert _cookie_named(response, 'access_token') is None


@pytest.mark.integration
@pytest.mark.security
def test_login_does_not_reveal_whether_an_email_exists(client, student):
    """A wrong password and an unknown address must be indistinguishable.

    Anything that separates them turns the login form into an account
    enumeration oracle.
    """
    known = client.post('/api/auth/login', json={
        'email': student['email'],
        'password': 'DefinitelyNotTheP@ssw0rd!',
    })
    unknown = client.post('/api/auth/login', json={
        'email': f'nobody_{uuid.uuid4().hex[:10]}@example.com',
        'password': 'DefinitelyNotTheP@ssw0rd!',
    })

    assert known.status_code == unknown.status_code == 401

    def message(resp):
        body = resp.get_json() or {}
        error = body.get('error')
        if isinstance(error, dict):
            return error.get('message')
        return error or body.get('message')

    assert message(known) == message(unknown)


# Registration


@pytest.mark.integration
@pytest.mark.critical
def test_registration_creates_the_user(client, db, no_brevo_sync):
    payload = _valid_registration()

    response = client.post('/api/auth/register', json=payload)

    assert response.status_code in (200, 201), response.get_data(as_text=True)

    rows = db.table('users').select('id, email, role').eq(
        'email', payload['email']
    ).execute().data
    assert len(rows) == 1
    # Self-registration must never mint a privileged account.
    assert rows[0]['role'] == 'student'


@pytest.mark.integration
@pytest.mark.security
def test_registration_requires_accepting_the_legal_terms(client, db):
    payload = _valid_registration()
    del payload['acceptedLegalTerms']

    response = client.post('/api/auth/register', json=payload)

    assert response.status_code == 400
    assert 'terms of service' in response.get_data(as_text=True).lower()
    # And crucially, no account was created.
    assert db.table('users').select('id').eq('email', payload['email']).execute().data == []


@pytest.mark.integration
@pytest.mark.security
@pytest.mark.parametrize('weak_password, why', [
    ('Sh0rt!', 'too short'),
    ('alllowercase123!', 'no uppercase'),
    ('ALLUPPERCASE123!', 'no lowercase'),
    ('NoNumbersHere!!!', 'no digits'),
    ('NoSpecialChars123', 'no special characters'),
])
def test_registration_rejects_weak_passwords(client, db, weak_password, why):
    payload = _valid_registration(password=weak_password)

    response = client.post('/api/auth/register', json=payload)

    assert response.status_code == 400, f'accepted a password with {why}'
    assert db.table('users').select('id').eq('email', payload['email']).execute().data == []


@pytest.mark.integration
@pytest.mark.security
def test_registration_requires_a_date_of_birth(client, db):
    """The age gate must not be skippable by omission.

    date_of_birth was optional until 2026-08-15, so a child could register as an
    adult simply by leaving the field out -- no lying required. Missing is now a
    400, which is what makes the under-13 check below meaningful.
    """
    payload = _valid_registration()
    del payload['date_of_birth']

    response = client.post('/api/auth/register', json=payload)

    assert response.status_code == 400, response.get_data(as_text=True)
    assert 'date of birth' in response.get_data(as_text=True).lower()
    assert db.table('users').select('id').eq('email', payload['email']).execute().data == []


@pytest.mark.integration
@pytest.mark.security
def test_registration_blocks_children_under_thirteen(client, db):
    """COPPA: an under-13 cannot open an account for themselves.

    They go through the parent-created dependent flow instead, which collects no
    email address and no password from the child.
    """
    payload = _valid_registration(date_of_birth='2020-01-01')

    response = client.post('/api/auth/register', json=payload)

    # 403, not 400: the request is well-formed, we are refusing to serve it.
    assert response.status_code == 403, response.get_data(as_text=True)
    assert response.get_json()['error'] == 'under_13_registration_blocked'
    # And no auth user was minted before the age check ran.
    assert db.table('users').select('id').eq('email', payload['email']).execute().data == []


@pytest.mark.integration
def test_registration_rejects_a_duplicate_email(client, student, no_brevo_sync):
    payload = _valid_registration(email=student['email'])

    response = client.post('/api/auth/register', json=payload)

    assert response.status_code in (400, 409), response.get_data(as_text=True)


# CSRF


@pytest.mark.integration
def test_csrf_token_endpoint_serves_a_token(client):
    response = client.get('/api/auth/csrf-token')

    assert response.status_code == 200
    assert (response.get_json() or {}).get('csrf_token')


@pytest.mark.integration
@pytest.mark.security
def test_bearer_authenticated_requests_do_not_need_a_csrf_token(client, student, auth_headers_for):
    """Bearer auth is exempt from CSRF by design.

    An attacker cannot set an Authorization header cross-site, so the token adds
    nothing there -- and requiring it would break the mobile app, which has no
    cookie to pair it with (middleware/csrf_protection.py).
    """
    response = client.get('/api/auth/me', headers=auth_headers_for(student['id']))

    assert response.status_code == 200
    assert 'csrf' not in response.get_data(as_text=True).lower()


# Authorization boundaries


@pytest.mark.integration
@pytest.mark.critical
def test_protected_route_requires_authentication(client):
    response = client.get('/api/auth/me')

    assert response.status_code == 401


@pytest.mark.integration
@pytest.mark.critical
def test_protected_route_accepts_a_valid_bearer_token(client, student, auth_headers_for):
    response = client.get('/api/auth/me', headers=auth_headers_for(student['id']))

    assert response.status_code == 200
    body = response.get_json() or {}
    # The response must describe the caller, not somebody else.
    assert student['id'] in response.get_data(as_text=True), body


@pytest.mark.integration
@pytest.mark.security
def test_protected_route_rejects_a_forged_bearer_token(client, student):
    """A token this app did not sign must not authenticate anyone."""
    forged = (
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'
        'eyJ1c2VyX2lkIjoiZm9yZ2VkIiwidHlwZSI6ImFjY2VzcyJ9.'
        'not-a-real-signature'
    )
    response = client.get('/api/auth/me', headers={'Authorization': f'Bearer {forged}'})

    assert response.status_code == 401


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_admin_route_is_forbidden_for_a_student(client, student, auth_headers_for):
    response = client.get('/api/admin/users', headers=auth_headers_for(student['id']))

    assert response.status_code == 403


@pytest.mark.integration
@pytest.mark.authorization
def test_admin_route_allows_a_superadmin(client, make_user, auth_headers_for):
    superadmin = make_user(role='superadmin')

    response = client.get('/api/admin/users', headers=auth_headers_for(superadmin['id']))

    assert response.status_code == 200


# Session lifecycle


@pytest.mark.integration
def test_logout_clears_the_auth_cookies(client, student, auth_headers_for):
    response = client.post(
        '/api/auth/logout',
        headers=auth_headers_for(student['id']),
        json={},
    )

    assert response.status_code == 200

    # Clearing a cookie means re-sending it empty and/or already expired.
    access = _cookie_named(response, 'access_token')
    assert access is not None, 'logout did not send a clearing access_token cookie'
    assert 'access_token=;' in access or 'expires=thu, 01 jan 1970' in access


@pytest.mark.integration
@pytest.mark.critical
def test_refresh_issues_a_new_access_token(client, student):
    login = client.post('/api/auth/login', json={
        'email': student['email'],
        'password': student['password'],
    })
    assert login.status_code == 200

    # The test client keeps the login cookies, so this is the same thing a
    # browser does when its access token expires.
    response = client.post('/api/auth/refresh', json={})

    assert response.status_code == 200
    assert _cookie_named(response, 'access_token') is not None


@pytest.mark.integration
@pytest.mark.security
def test_refresh_rejects_a_garbage_refresh_cookie(client):
    client.set_cookie('refresh_token', 'not-a-real-token', domain='localhost')

    response = client.post('/api/auth/refresh', json={})

    assert response.status_code == 401
