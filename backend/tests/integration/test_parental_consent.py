"""Integration tests for the COPPA parental-consent flow.

Runs against a real database. Consent state is a regulatory record, so these
assert on what actually landed in `users` and `parental_consent_log`, not just
on status codes.

Ported 2026-08-13 -- the previous version seeded through an `execute_sql` RPC
that has never existed and authenticated via `session['user_id']`, which
require_auth ignores. See backend/tests/integration/README.md.
"""

import uuid
from unittest.mock import patch

import pytest

pytestmark = pytest.mark.requires_db


@pytest.fixture(autouse=True)
def no_consent_email():
    """Never send a real consent email.

    Every send/resend path calls send_parental_consent_email. The suite-wide
    _no_outbound_email guard would fail the test on the outbound POST; this
    patches the send itself so the flow under test still runs end to end.
    Returns True so the route takes its `email_sent` branch.
    """
    with patch(
        'services.email_service.email_service.send_parental_consent_email',
        return_value=True,
    ) as send:
        yield send


@pytest.fixture
def minor(make_user):
    """A student who requires parental consent."""
    return make_user(role='student', requires_parental_consent=True)


def _consent_row(db, user_id, *columns):
    fields = ', '.join(('id',) + columns)
    rows = db.table('users').select(fields).eq('id', user_id).execute().data
    assert rows, f'user {user_id} vanished'
    return rows[0]


def _send(client, user, parent_email='parent@example.com'):
    return client.post('/api/parental-consent/send', json={
        'user_id': user['id'],
        'parent_email': parent_email,
        'child_email': user['email'],
    })


# Sending the request


@pytest.mark.integration
@pytest.mark.critical
def test_send_consent_stores_only_a_hashed_token(client, db, minor):
    """The raw token goes in the email; only its hash may touch the database.

    A readable token in `users` would let anyone with database access grant
    themselves consent on a minor's account.
    """
    response = _send(client, minor)

    assert response.status_code == 200
    body = response.get_json()
    # Masked since 2026-08-15: this endpoint is unauthenticated, and echoing
    # the address on file let a caller who guessed a child's UUID read back the
    # real guardian's email by posting any address at all.
    assert body['parent_email_masked'] == 'p****t@example.com'
    assert 'parent_email' not in body

    row = _consent_row(
        db, minor['id'],
        'parental_consent_token', 'parental_consent_email', 'parental_consent_verified',
    )
    stored = row['parental_consent_token']
    assert stored, 'no consent token was stored'
    assert row['parental_consent_email'] == 'parent@example.com'
    assert row['parental_consent_verified'] is False

    # A sha256 hex digest, not a raw token.
    assert len(stored) == 64
    assert all(c in '0123456789abcdef' for c in stored.lower())


@pytest.mark.integration
def test_send_consent_writes_an_audit_log_row(client, db, minor):
    """COPPA consent needs a record of who asked, for whom, and from where."""
    _send(client, minor)

    logs = db.table('parental_consent_log').select(
        'user_id, child_email, parent_email, consent_token'
    ).eq('user_id', minor['id']).execute().data

    assert len(logs) == 1
    assert logs[0]['child_email'] == minor['email']
    assert logs[0]['parent_email'] == 'parent@example.com'
    # The log stores the hash too, never the raw token.
    assert len(logs[0]['consent_token']) == 64


@pytest.mark.integration
@pytest.mark.parametrize('missing', ['user_id', 'parent_email', 'child_email'])
def test_send_consent_requires_every_field(client, minor, missing):
    payload = {
        'user_id': minor['id'],
        'parent_email': 'parent@example.com',
        'child_email': minor['email'],
    }
    del payload[missing]

    response = client.post('/api/parental-consent/send', json=payload)

    assert response.status_code == 400


@pytest.mark.integration
def test_send_consent_404s_for_an_unknown_user(client, minor):
    response = client.post('/api/parental-consent/send', json={
        'user_id': str(uuid.uuid4()),
        'parent_email': 'parent@example.com',
        'child_email': minor['email'],
    })

    assert response.status_code == 404


@pytest.mark.integration
def test_send_consent_refuses_a_user_who_does_not_need_it(client, db, student):
    """Only accounts flagged as requiring consent may start the flow."""
    response = _send(client, student)

    assert response.status_code == 400
    assert response.get_json()['requires_consent'] is False
    # No token was minted for a user who never needed one.
    assert _consent_row(db, student['id'], 'parental_consent_token')['parental_consent_token'] is None


# Verifying


@pytest.mark.integration
@pytest.mark.critical
def test_verify_marks_consent_and_burns_the_token(client, db, minor, no_consent_email):
    _send(client, minor)
    # The raw token only ever exists in the emailed link.
    link = no_consent_email.call_args.kwargs['verification_link']
    raw_token = link.split('token=')[1]

    response = client.post('/api/parental-consent/verify', json={'token': raw_token})

    assert response.status_code == 200
    assert response.get_json()['verified'] is True

    row = _consent_row(
        db, minor['id'],
        'parental_consent_verified', 'parental_consent_verified_at', 'parental_consent_token',
    )
    assert row['parental_consent_verified'] is True
    assert row['parental_consent_verified_at'] is not None
    # Single use: the token must not survive to be replayed.
    assert row['parental_consent_token'] is None


@pytest.mark.integration
@pytest.mark.security
def test_verify_rejects_an_invalid_token(client, db, minor):
    _send(client, minor)

    response = client.post('/api/parental-consent/verify', json={'token': 'not-the-token'})

    assert response.status_code == 400
    assert _consent_row(db, minor['id'], 'parental_consent_verified')['parental_consent_verified'] is False


@pytest.mark.integration
def test_verify_requires_a_token(client):
    response = client.post('/api/parental-consent/verify', json={})

    assert response.status_code == 400


@pytest.mark.integration
@pytest.mark.security
def test_a_verified_token_cannot_be_replayed(client, db, minor, no_consent_email):
    """Consent is granted once. A captured link must not re-grant it."""
    _send(client, minor)
    raw_token = no_consent_email.call_args.kwargs['verification_link'].split('token=')[1]

    first = client.post('/api/parental-consent/verify', json={'token': raw_token})
    assert first.status_code == 200

    replay = client.post('/api/parental-consent/verify', json={'token': raw_token})
    # The token was cleared on use, so the replay finds nothing.
    assert replay.status_code == 400


# Status


@pytest.mark.integration
def test_status_reports_an_unverified_minor_to_the_minor(client, minor, auth_headers_for):
    response = client.get(
        f'/api/parental-consent/status/{minor["id"]}',
        headers=auth_headers_for(minor['id']),
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body.get('requires_consent') is True
    assert body.get('consent_verified') is False
    # The guardian's address is never returned here (2026-08-15).
    assert 'parent_email' not in body


@pytest.mark.integration
@pytest.mark.security
def test_status_is_closed_to_anonymous_callers(client, minor):
    """This endpoint had no auth decorator at all and returned the guardian's
    email for any UUID -- a phishing seed with a child attached."""
    response = client.get(f'/api/parental-consent/status/{minor["id"]}')

    assert response.status_code == 404
    assert 'parent_email' not in (response.get_json() or {})


@pytest.mark.integration
@pytest.mark.security
def test_status_is_closed_to_an_unrelated_signed_in_user(client, minor, student, auth_headers_for):
    response = client.get(
        f'/api/parental-consent/status/{minor["id"]}',
        headers=auth_headers_for(student['id']),
    )

    # Same answer an unknown id gets, so the endpoint cannot confirm that a
    # UUID belongs to a real child.
    assert response.status_code == 404


@pytest.mark.integration
def test_status_404s_for_an_unknown_user(client, student, auth_headers_for):
    response = client.get(
        f'/api/parental-consent/status/{uuid.uuid4()}',
        headers=auth_headers_for(student['id']),
    )

    assert response.status_code == 404


# Resending


@pytest.mark.integration
def test_resend_issues_a_different_token(client, db, minor, no_consent_email, auth_headers_for):
    _send(client, minor)
    first_hash = _consent_row(db, minor['id'], 'parental_consent_token')['parental_consent_token']

    response = client.post(
        '/api/parental-consent/resend',
        json={'user_id': minor['id']},
        headers=auth_headers_for(minor['id']),
    )

    assert response.status_code == 200
    second_hash = _consent_row(db, minor['id'], 'parental_consent_token')['parental_consent_token']
    assert second_hash != first_hash, 'resend reused the previous token'
    # Masked, never the raw guardian address.
    assert 'parent_email' not in response.get_json()


@pytest.mark.integration
@pytest.mark.security
def test_resend_refuses_a_bare_user_id_from_a_stranger(client, minor):
    """A body-supplied user_id with no session and no knowledge of the child's
    own email is not authority to mail that child's guardian."""
    response = client.post('/api/parental-consent/resend', json={'user_id': minor['id']})

    assert response.status_code == 404


@pytest.mark.integration
def test_resend_refuses_once_consent_is_verified(client, db, minor, no_consent_email, auth_headers_for):
    _send(client, minor)
    raw_token = no_consent_email.call_args.kwargs['verification_link'].split('token=')[1]
    client.post('/api/parental-consent/verify', json={'token': raw_token})

    response = client.post(
        '/api/parental-consent/resend',
        json={'user_id': minor['id']},
        headers=auth_headers_for(minor['id']),
    )

    assert response.status_code == 400


@pytest.mark.integration
def test_resend_refuses_a_user_who_does_not_need_consent(client, student, auth_headers_for):
    response = client.post(
        '/api/parental-consent/resend',
        json={'user_id': student['id']},
        headers=auth_headers_for(student['id']),
    )

    assert response.status_code == 400


# Admin review


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_pending_review_queue_is_closed_to_students(client, student, auth_headers_for):
    response = client.get(
        '/api/admin/parental-consent/pending',
        headers=auth_headers_for(student['id']),
    )

    assert response.status_code == 403


@pytest.mark.integration
@pytest.mark.authorization
def test_pending_review_queue_is_open_to_a_superadmin(client, make_user, auth_headers_for):
    superadmin = make_user(role='superadmin')

    response = client.get(
        '/api/admin/parental-consent/pending',
        headers=auth_headers_for(superadmin['id']),
    )

    assert response.status_code == 200


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_a_student_cannot_approve_consent(client, student, parent, auth_headers_for):
    """Approving consent for oneself would defeat the entire control."""
    response = client.post(
        f'/api/admin/parental-consent/approve/{parent["id"]}',
        headers=auth_headers_for(student['id']),
        json={},
    )

    assert response.status_code == 403


@pytest.mark.integration
@pytest.mark.authorization
def test_a_student_cannot_reject_consent(client, student, parent, auth_headers_for):
    response = client.post(
        f'/api/admin/parental-consent/reject/{parent["id"]}',
        headers=auth_headers_for(student['id']),
        json={'reason': 'nope'},
    )

    assert response.status_code == 403


# Unauthenticated access


@pytest.mark.integration
@pytest.mark.security
@pytest.mark.parametrize('method, path', [
    ('get', '/api/admin/parental-consent/pending'),
    ('post', '/api/parental-consent/submit-documents'),
])
def test_protected_consent_endpoints_reject_anonymous_callers(client, method, path):
    response = getattr(client, method)(path, json={})

    assert response.status_code == 401
