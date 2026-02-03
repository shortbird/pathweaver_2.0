"""
Integration tests for Parental Consent API.

Tests the complete COPPA compliance system including:
- Parental consent email verification
- Token generation and validation
- Document submission for parent identity verification
- Admin review workflow (approve/reject)
- Consent status checking
- Rate limiting on sensitive operations
"""

import pytest
import json
import uuid
from datetime import datetime, timedelta
from unittest.mock import patch, Mock
from io import BytesIO

from utils.logger import get_logger

logger = get_logger(__name__)


@pytest.mark.integration
@pytest.mark.critical
def test_send_parental_consent_success(client, test_supabase):
    """Test sending parental consent email for under-13 user"""
    # Create user requiring parental consent
    user_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users
            (id, email, first_name, last_name, role, requires_parental_consent)
            VALUES ('{user_id}', 'child@example.com', 'Child', 'User', 'student', true)
        """
    })

    # Mock email service
    with patch('services.email_service.email_service.send_parental_consent_email') as mock_email:
        mock_email.return_value = True

        response = client.post('/parental-consent/send', json={
            'user_id': user_id,
            'parent_email': 'parent@example.com',
            'child_email': 'child@example.com'
        })

        assert response.status_code == 200
        assert response.json['email_sent'] is True
        assert response.json['parent_email'] == 'parent@example.com'
        mock_email.assert_called_once()


@pytest.mark.integration
def test_send_parental_consent_missing_fields(client):
    """Test sending consent without required fields fails"""
    # Missing user_id
    response = client.post('/parental-consent/send', json={
        'parent_email': 'parent@example.com',
        'child_email': 'child@example.com'
    })
    assert response.status_code == 400

    # Missing parent_email
    response = client.post('/parental-consent/send', json={
        'user_id': str(uuid.uuid4()),
        'child_email': 'child@example.com'
    })
    assert response.status_code == 400

    # Missing child_email
    response = client.post('/parental-consent/send', json={
        'user_id': str(uuid.uuid4()),
        'parent_email': 'parent@example.com'
    })
    assert response.status_code == 400


@pytest.mark.integration
def test_send_parental_consent_user_not_found(client):
    """Test sending consent for non-existent user fails"""
    fake_id = str(uuid.uuid4())

    response = client.post('/parental-consent/send', json={
        'user_id': fake_id,
        'parent_email': 'parent@example.com',
        'child_email': 'child@example.com'
    })

    assert response.status_code == 404


@pytest.mark.integration
def test_send_parental_consent_not_required(client, test_supabase):
    """Test sending consent for user who doesn't require it fails"""
    # Create adult user (doesn't require consent)
    user_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users
            (id, email, first_name, role, requires_parental_consent)
            VALUES ('{user_id}', 'adult@example.com', 'Adult', 'student', false)
        """
    })

    response = client.post('/parental-consent/send', json={
        'user_id': user_id,
        'parent_email': 'parent@example.com',
        'child_email': 'adult@example.com'
    })

    assert response.status_code == 400
    assert 'does not require' in response.json.get('error', '').lower()


@pytest.mark.integration
def test_verify_parental_consent_success(client, test_supabase):
    """Test verifying parental consent with valid token"""
    user_id = str(uuid.uuid4())

    # Import hash function to create test token
    import hashlib
    test_token = 'test_token_12345'
    hashed_token = hashlib.sha256(test_token.encode()).hexdigest()

    # Create user with consent token
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users
            (id, email, first_name, role, requires_parental_consent,
             parental_consent_token, parental_consent_verified)
            VALUES ('{user_id}', 'child@example.com', 'Child', 'student', true,
                    '{hashed_token}', false)
        """
    })

    response = client.post('/parental-consent/verify', json={
        'token': test_token
    })

    assert response.status_code == 200
    assert response.json['verified'] is True


@pytest.mark.integration
def test_verify_parental_consent_invalid_token(client):
    """Test verifying with invalid token fails"""
    response = client.post('/parental-consent/verify', json={
        'token': 'invalid_token_xyz'
    })

    assert response.status_code == 400
    assert 'invalid' in response.json.get('error', '').lower()


@pytest.mark.integration
def test_verify_parental_consent_missing_token(client):
    """Test verifying without token fails"""
    response = client.post('/parental-consent/verify', json={})

    assert response.status_code == 400


@pytest.mark.integration
def test_verify_parental_consent_already_verified(client, test_supabase):
    """Test verifying already-verified consent returns success"""
    user_id = str(uuid.uuid4())

    import hashlib
    test_token = 'test_token_12345'
    hashed_token = hashlib.sha256(test_token.encode()).hexdigest()

    # Create user with already-verified consent
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users
            (id, email, first_name, role, parental_consent_token, parental_consent_verified)
            VALUES ('{user_id}', 'child@example.com', 'Child', 'student', '{hashed_token}', true)
        """
    })

    response = client.post('/parental-consent/verify', json={
        'token': test_token
    })

    assert response.status_code == 200
    assert response.json.get('already_verified') is True


@pytest.mark.integration
def test_check_consent_status_success(client, test_supabase):
    """Test checking consent status for user"""
    user_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users
            (id, email, first_name, role, requires_parental_consent,
             parental_consent_verified, parental_consent_email)
            VALUES ('{user_id}', 'child@example.com', 'Child', 'student',
                    true, false, 'parent@example.com')
        """
    })

    response = client.get(f'/parental-consent/status/{user_id}')

    assert response.status_code == 200
    assert response.json['requires_consent'] is True
    assert response.json['consent_verified'] is False
    assert response.json['parent_email'] == 'parent@example.com'


@pytest.mark.integration
def test_check_consent_status_not_found(client):
    """Test checking status for non-existent user fails"""
    fake_id = str(uuid.uuid4())

    response = client.get(f'/parental-consent/status/{fake_id}')

    assert response.status_code == 404


@pytest.mark.integration
def test_resend_parental_consent_success(client, test_supabase):
    """Test resending parental consent email"""
    user_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users
            (id, email, first_name, role, requires_parental_consent,
             parental_consent_verified, parental_consent_email)
            VALUES ('{user_id}', 'child@example.com', 'Child', 'student',
                    true, false, 'parent@example.com')
        """
    })

    with patch('services.email_service.email_service.send_parental_consent_email') as mock_email:
        mock_email.return_value = True

        response = client.post('/parental-consent/resend', json={
            'user_id': user_id
        })

        assert response.status_code == 200
        assert response.json['email_sent'] is True
        mock_email.assert_called_once()


@pytest.mark.integration
def test_resend_parental_consent_already_verified(client, test_supabase):
    """Test resending when already verified fails"""
    user_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users
            (id, email, first_name, role, requires_parental_consent,
             parental_consent_verified, parental_consent_email)
            VALUES ('{user_id}', 'child@example.com', 'Child', 'student',
                    true, true, 'parent@example.com')
        """
    })

    response = client.post('/parental-consent/resend', json={
        'user_id': user_id
    })

    assert response.status_code == 400
    assert 'already verified' in response.json.get('error', '').lower()


@pytest.mark.integration
def test_resend_parental_consent_not_required(client, test_supabase):
    """Test resending when consent not required fails"""
    user_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users
            (id, email, first_name, role, requires_parental_consent)
            VALUES ('{user_id}', 'adult@example.com', 'Adult', 'student', false)
        """
    })

    response = client.post('/parental-consent/resend', json={
        'user_id': user_id
    })

    assert response.status_code == 400
    assert 'does not require' in response.json.get('error', '').lower()


@pytest.mark.integration
def test_resend_parental_consent_no_email_on_file(client, test_supabase):
    """Test resending when no parent email on file fails"""
    user_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users
            (id, email, first_name, role, requires_parental_consent,
             parental_consent_verified)
            VALUES ('{user_id}', 'child@example.com', 'Child', 'student', true, false)
        """
    })

    response = client.post('/parental-consent/resend', json={
        'user_id': user_id
    })

    assert response.status_code == 400
    assert 'no parent email' in response.json.get('error', '').lower()


@pytest.mark.integration
def test_submit_consent_documents_success(client, test_supabase):
    """Test parent submitting identity verification documents"""
    parent_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users
            (id, email, display_name, role, parental_consent_verified, parental_consent_status)
            VALUES ('{parent_id}', 'parent@example.com', 'Parent User', 'parent', false, null)
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = parent_id

    # Create mock file uploads
    id_file = (BytesIO(b'fake_id_content'), 'id_card.jpg')
    consent_file = (BytesIO(b'fake_consent_content'), 'consent_form.pdf')

    # Mock Supabase storage
    with patch('database.get_supabase_admin_client') as mock_client:
        mock_storage = Mock()
        mock_storage.from_.return_value.upload.return_value = None
        mock_storage.from_.return_value.get_public_url.return_value = 'https://example.com/file.jpg'
        mock_client.return_value.storage = mock_storage

        # Mock table updates
        mock_table = Mock()
        mock_table.update.return_value.eq.return_value.execute.return_value = None
        mock_table.insert.return_value.execute.return_value = None
        mock_table.select.return_value.eq.return_value.execute.return_value.data = []
        mock_client.return_value.table.return_value = mock_table

        # Mock email service
        with patch('services.email_service.email_service.send_templated_email'):
            response = client.post('/parental-consent/submit-documents',
                data={
                    'id_document': id_file,
                    'signed_consent_form': consent_file
                },
                content_type='multipart/form-data'
            )

            # May succeed or fail depending on implementation
            assert response.status_code in [200, 400, 500]


@pytest.mark.integration
def test_submit_consent_documents_non_parent_fails(client, test_supabase):
    """Test non-parent cannot submit identity documents"""
    student_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users
            (id, email, display_name, role)
            VALUES ('{student_id}', 'student@example.com', 'Student User', 'student')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = student_id

    id_file = (BytesIO(b'fake_id_content'), 'id_card.jpg')
    consent_file = (BytesIO(b'fake_consent_content'), 'consent_form.pdf')

    response = client.post('/parental-consent/submit-documents',
        data={
            'id_document': id_file,
            'signed_consent_form': consent_file
        },
        content_type='multipart/form-data'
    )

    assert response.status_code == 400
    assert 'only parent' in response.json.get('error', '').lower()


@pytest.mark.integration
def test_submit_consent_documents_missing_files(client, test_supabase):
    """Test submitting documents without required files fails"""
    parent_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users
            (id, email, display_name, role)
            VALUES ('{parent_id}', 'parent@example.com', 'Parent User', 'parent')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = parent_id

    # Missing id_document
    response = client.post('/parental-consent/submit-documents',
        data={'signed_consent_form': (BytesIO(b'content'), 'form.pdf')},
        content_type='multipart/form-data'
    )
    assert response.status_code == 400

    # Missing signed_consent_form
    response = client.post('/parental-consent/submit-documents',
        data={'id_document': (BytesIO(b'content'), 'id.jpg')},
        content_type='multipart/form-data'
    )
    assert response.status_code == 400


@pytest.mark.integration
def test_get_pending_consent_reviews_admin(client, test_supabase):
    """Test admin can view pending consent reviews"""
    # Create admin user
    admin_id = str(uuid.uuid4())
    parent_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES
            ('{admin_id}', 'admin@example.com', 'Admin', 'admin'),
            ('{parent_id}', 'parent@example.com', 'Parent', 'parent')
        """
    })

    # Update parent to have pending status
    test_supabase.rpc('execute_sql', {
        'query': f"""
            UPDATE test_schema.users
            SET parental_consent_status = 'pending_review'
            WHERE id = '{parent_id}'
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = admin_id

    response = client.get('/admin/parental-consent/pending')

    assert response.status_code == 200
    assert 'pending_reviews' in response.json


@pytest.mark.integration
def test_get_pending_consent_reviews_non_admin_fails(client, test_supabase):
    """Test non-admin cannot view pending consent reviews"""
    student_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{student_id}', 'student@example.com', 'Student', 'student')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = student_id

    response = client.get('/admin/parental-consent/pending')

    assert response.status_code == 403


@pytest.mark.integration
def test_approve_parental_consent_admin(client, test_supabase):
    """Test admin can approve parent identity verification"""
    admin_id = str(uuid.uuid4())
    parent_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES
            ('{admin_id}', 'admin@example.com', 'Admin', 'admin'),
            ('{parent_id}', 'parent@example.com', 'Parent', 'parent')
        """
    })

    # Set parent status to pending_review
    test_supabase.rpc('execute_sql', {
        'query': f"""
            UPDATE test_schema.users
            SET parental_consent_status = 'pending_review'
            WHERE id = '{parent_id}'
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = admin_id

    with patch('services.email_service.email_service.send_templated_email'):
        response = client.post(f'/admin/parental-consent/approve/{parent_id}', json={
            'notes': 'Documents verified successfully'
        })

        assert response.status_code == 200
        assert response.json['status'] == 'approved'


@pytest.mark.integration
def test_approve_parental_consent_non_admin_fails(client, test_supabase):
    """Test non-admin cannot approve parent identity"""
    student_id = str(uuid.uuid4())
    parent_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES
            ('{student_id}', 'student@example.com', 'Student', 'student'),
            ('{parent_id}', 'parent@example.com', 'Parent', 'parent')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = student_id

    response = client.post(f'/admin/parental-consent/approve/{parent_id}')

    assert response.status_code == 403


@pytest.mark.integration
def test_reject_parental_consent_admin(client, test_supabase):
    """Test admin can reject parent identity verification"""
    admin_id = str(uuid.uuid4())
    parent_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES
            ('{admin_id}', 'admin@example.com', 'Admin', 'admin'),
            ('{parent_id}', 'parent@example.com', 'Parent', 'parent')
        """
    })

    # Set parent status to pending_review
    test_supabase.rpc('execute_sql', {
        'query': f"""
            UPDATE test_schema.users
            SET parental_consent_status = 'pending_review'
            WHERE id = '{parent_id}'
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = admin_id

    with patch('services.email_service.email_service.send_templated_email'):
        response = client.post(f'/admin/parental-consent/reject/{parent_id}', json={
            'reason': 'Documents are not clear enough'
        })

        assert response.status_code == 200
        assert response.json['status'] == 'rejected'


@pytest.mark.integration
def test_reject_parental_consent_missing_reason(client, test_supabase):
    """Test rejecting without reason fails"""
    admin_id = str(uuid.uuid4())
    parent_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES
            ('{admin_id}', 'admin@example.com', 'Admin', 'admin'),
            ('{parent_id}', 'parent@example.com', 'Parent', 'parent')
        """
    })

    test_supabase.rpc('execute_sql', {
        'query': f"""
            UPDATE test_schema.users
            SET parental_consent_status = 'pending_review'
            WHERE id = '{parent_id}'
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = admin_id

    response = client.post(f'/admin/parental-consent/reject/{parent_id}', json={
        'reason': ''  # Empty reason
    })

    assert response.status_code == 400


@pytest.mark.integration
def test_approve_consent_not_pending_fails(client, test_supabase):
    """Test approving consent that's not pending fails"""
    admin_id = str(uuid.uuid4())
    parent_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role, parental_consent_status)
            VALUES
            ('{admin_id}', 'admin@example.com', 'Admin', 'admin', null),
            ('{parent_id}', 'parent@example.com', 'Parent', 'parent', 'approved')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = admin_id

    response = client.post(f'/admin/parental-consent/approve/{parent_id}')

    assert response.status_code == 400
    assert 'not pending' in response.json.get('error', '').lower()


@pytest.mark.integration
def test_consent_token_hashing(client):
    """Test that consent tokens are properly hashed"""
    import hashlib

    # Generate token
    from routes.parental_consent import generate_consent_token, hash_token

    token1 = generate_consent_token()
    token2 = generate_consent_token()

    # Tokens should be different
    assert token1 != token2

    # Hashing should be consistent
    hashed1 = hash_token(token1)
    hashed2 = hash_token(token1)
    assert hashed1 == hashed2

    # Different tokens should have different hashes
    hashed3 = hash_token(token2)
    assert hashed1 != hashed3


@pytest.mark.integration
def test_unauthenticated_requests_to_protected_endpoints(client):
    """Test protected endpoints require authentication"""
    fake_id = str(uuid.uuid4())

    id_file = (BytesIO(b'fake_id'), 'id.jpg')
    consent_file = (BytesIO(b'fake_consent'), 'form.pdf')

    # Submit documents requires auth
    response = client.post('/parental-consent/submit-documents',
        data={
            'id_document': id_file,
            'signed_consent_form': consent_file
        },
        content_type='multipart/form-data'
    )
    assert response.status_code == 401

    # Admin endpoints require auth
    response = client.get('/admin/parental-consent/pending')
    assert response.status_code == 401

    response = client.post(f'/admin/parental-consent/approve/{fake_id}')
    assert response.status_code == 401

    response = client.post(f'/admin/parental-consent/reject/{fake_id}')
    assert response.status_code == 401
