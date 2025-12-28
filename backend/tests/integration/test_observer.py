"""
Integration tests for Observer API.

Tests the complete observer system including:
- Observer invitations (student sends, observer accepts)
- Observer-student linking
- Portfolio viewing (read-only access)
- Observer comments on student work
- Access control and permissions
- COPPA/FERPA compliance auditing
"""

import pytest
import json
import uuid
from datetime import datetime, timedelta
from unittest.mock import patch, Mock

from utils.logger import get_logger

logger = get_logger(__name__)


@pytest.mark.integration
@pytest.mark.critical
def test_send_observer_invitation_success(client, test_supabase):
    """Test student can send observer invitation"""
    # Create student user
    student_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, first_name, last_name, role)
            VALUES ('{student_id}', 'student@example.com', 'Test Student', 'Test', 'Student', 'student')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = student_id

    # Mock email service to avoid actual email sending
    with patch('services.email_service.EmailService.send_templated_email') as mock_email:
        mock_email.return_value = True

        response = client.post('/api/observers/invite', json={
            'observer_email': 'grandparent@example.com',
            'observer_name': 'Grandma Smith'
        })

        assert response.status_code == 200
        assert response.json['status'] == 'success'
        assert 'invitation_link' in response.json
        assert 'invitation_id' in response.json
        mock_email.assert_called_once()


@pytest.mark.integration
def test_send_observer_invitation_missing_fields(client, test_supabase):
    """Test sending invitation without required fields fails"""
    student_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{student_id}', 'student@example.com', 'Test Student', 'student')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = student_id

    # Missing observer_email
    response = client.post('/api/observers/invite', json={
        'observer_name': 'Grandma Smith'
    })
    assert response.status_code == 400
    assert 'observer_email' in response.json.get('error', '').lower()

    # Missing observer_name
    response = client.post('/api/observers/invite', json={
        'observer_email': 'grandparent@example.com'
    })
    assert response.status_code == 400
    assert 'observer_name' in response.json.get('error', '').lower()


@pytest.mark.integration
def test_get_my_invitations_success(client, test_supabase):
    """Test student can retrieve sent invitations"""
    student_id = str(uuid.uuid4())
    invitation_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{student_id}', 'student@example.com', 'Test Student', 'student')
        """
    })

    # Create invitation
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.observer_invitations
            (id, student_id, observer_email, observer_name, invitation_code, status)
            VALUES ('{invitation_id}', '{student_id}', 'grandparent@example.com', 'Grandma Smith', 'abc123', 'pending')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = student_id

    response = client.get('/api/observers/my-invitations')

    assert response.status_code == 200
    assert len(response.json['invitations']) >= 1


@pytest.mark.integration
def test_cancel_invitation_success(client, test_supabase):
    """Test student can cancel pending invitation"""
    student_id = str(uuid.uuid4())
    invitation_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{student_id}', 'student@example.com', 'Test Student', 'student')
        """
    })

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.observer_invitations
            (id, student_id, observer_email, observer_name, invitation_code, status)
            VALUES ('{invitation_id}', '{student_id}', 'grandparent@example.com', 'Grandma Smith', 'abc123', 'pending')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = student_id

    response = client.delete(f'/api/observers/invitations/{invitation_id}/cancel')

    assert response.status_code == 200
    assert response.json['status'] == 'success'


@pytest.mark.integration
def test_cancel_invitation_wrong_student_fails(client, test_supabase):
    """Test student cannot cancel another student's invitation"""
    student1_id = str(uuid.uuid4())
    student2_id = str(uuid.uuid4())
    invitation_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES
            ('{student1_id}', 'student1@example.com', 'Student 1', 'student'),
            ('{student2_id}', 'student2@example.com', 'Student 2', 'student')
        """
    })

    # Create invitation for student1
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.observer_invitations
            (id, student_id, observer_email, observer_name, invitation_code, status)
            VALUES ('{invitation_id}', '{student1_id}', 'grandparent@example.com', 'Grandma Smith', 'abc123', 'pending')
        """
    })

    # Try to cancel as student2
    with client.session_transaction() as session:
        session['user_id'] = student2_id

    response = client.delete(f'/api/observers/invitations/{invitation_id}/cancel')

    assert response.status_code == 404


@pytest.mark.integration
def test_get_my_observers_success(client, test_supabase):
    """Test student can view linked observers"""
    student_id = str(uuid.uuid4())
    observer_id = str(uuid.uuid4())
    link_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES
            ('{student_id}', 'student@example.com', 'Test Student', 'student'),
            ('{observer_id}', 'observer@example.com', 'Grandma Smith', 'observer')
        """
    })

    # Create observer-student link
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.observer_student_links
            (id, observer_id, student_id, relationship, can_comment, can_view_evidence)
            VALUES ('{link_id}', '{observer_id}', '{student_id}', 'grandparent', true, true)
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = student_id

    response = client.get('/api/observers/my-observers')

    assert response.status_code == 200
    assert len(response.json['observers']) >= 1


@pytest.mark.integration
def test_remove_observer_success(client, test_supabase):
    """Test student can remove observer access"""
    student_id = str(uuid.uuid4())
    observer_id = str(uuid.uuid4())
    link_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES
            ('{student_id}', 'student@example.com', 'Test Student', 'student'),
            ('{observer_id}', 'observer@example.com', 'Grandma Smith', 'observer')
        """
    })

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.observer_student_links
            (id, observer_id, student_id, relationship, can_comment, can_view_evidence)
            VALUES ('{link_id}', '{observer_id}', '{student_id}', 'grandparent', true, true)
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = student_id

    response = client.delete(f'/api/observers/{link_id}/remove')

    assert response.status_code == 200
    assert response.json['status'] == 'success'


@pytest.mark.integration
def test_remove_observer_wrong_student_fails(client, test_supabase):
    """Test student cannot remove another student's observer link"""
    student1_id = str(uuid.uuid4())
    student2_id = str(uuid.uuid4())
    observer_id = str(uuid.uuid4())
    link_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES
            ('{student1_id}', 'student1@example.com', 'Student 1', 'student'),
            ('{student2_id}', 'student2@example.com', 'Student 2', 'student'),
            ('{observer_id}', 'observer@example.com', 'Grandma Smith', 'observer')
        """
    })

    # Create link for student1
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.observer_student_links
            (id, observer_id, student_id, relationship, can_comment, can_view_evidence)
            VALUES ('{link_id}', '{observer_id}', '{student1_id}', 'grandparent', true, true)
        """
    })

    # Try to remove as student2
    with client.session_transaction() as session:
        session['user_id'] = student2_id

    response = client.delete(f'/api/observers/{link_id}/remove')

    assert response.status_code == 404


@pytest.mark.integration
def test_accept_invitation_creates_account(client, test_supabase):
    """Test accepting invitation creates new observer account"""
    student_id = str(uuid.uuid4())
    invitation_id = str(uuid.uuid4())
    invitation_code = 'test_code_' + str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{student_id}', 'student@example.com', 'Test Student', 'student')
        """
    })

    # Create invitation with future expiry
    expires_at = (datetime.utcnow() + timedelta(days=7)).isoformat()
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.observer_invitations
            (id, student_id, observer_email, observer_name, invitation_code, status, expires_at)
            VALUES ('{invitation_id}', '{student_id}', 'newobserver@example.com', 'New Observer', '{invitation_code}', 'pending', '{expires_at}')
        """
    })

    response = client.post(f'/api/observers/accept/{invitation_code}', json={
        'first_name': 'New',
        'last_name': 'Observer',
        'relationship': 'grandparent'
    })

    assert response.status_code == 200
    assert response.json['status'] == 'success'
    assert 'observer_id' in response.json
    assert response.json['student_id'] == student_id


@pytest.mark.integration
def test_accept_invitation_expired_fails(client, test_supabase):
    """Test accepting expired invitation fails"""
    student_id = str(uuid.uuid4())
    invitation_id = str(uuid.uuid4())
    invitation_code = 'expired_code_' + str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{student_id}', 'student@example.com', 'Test Student', 'student')
        """
    })

    # Create invitation with past expiry
    expires_at = (datetime.utcnow() - timedelta(days=1)).isoformat()
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.observer_invitations
            (id, student_id, observer_email, observer_name, invitation_code, status, expires_at)
            VALUES ('{invitation_id}', '{student_id}', 'observer@example.com', 'Observer', '{invitation_code}', 'pending', '{expires_at}')
        """
    })

    response = client.post(f'/api/observers/accept/{invitation_code}', json={
        'relationship': 'grandparent'
    })

    assert response.status_code == 400
    assert 'expired' in response.json.get('error', '').lower()


@pytest.mark.integration
def test_accept_invitation_not_found(client):
    """Test accepting non-existent invitation fails"""
    response = client.post('/api/observers/accept/invalid_code_12345', json={
        'relationship': 'grandparent'
    })

    assert response.status_code == 404


@pytest.mark.integration
def test_get_my_students_success(client, test_supabase):
    """Test observer can view linked students"""
    observer_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    link_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES
            ('{observer_id}', 'observer@example.com', 'Grandma Smith', 'observer'),
            ('{student_id}', 'student@example.com', 'Test Student', 'student')
        """
    })

    # Create observer-student link
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.observer_student_links
            (id, observer_id, student_id, relationship, can_comment, can_view_evidence)
            VALUES ('{link_id}', '{observer_id}', '{student_id}', 'grandparent', true, true)
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = observer_id

    response = client.get('/api/observers/my-students')

    assert response.status_code == 200
    assert len(response.json['students']) >= 1


@pytest.mark.integration
def test_get_student_portfolio_success(client, test_supabase):
    """Test observer can view student portfolio"""
    observer_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    link_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES
            ('{observer_id}', 'observer@example.com', 'Grandma Smith', 'observer'),
            ('{student_id}', 'student@example.com', 'Test Student', 'student')
        """
    })

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.observer_student_links
            (id, observer_id, student_id, relationship, can_comment, can_view_evidence)
            VALUES ('{link_id}', '{observer_id}', '{student_id}', 'grandparent', true, true)
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = observer_id

    # Mock get_diploma_data to avoid complex portfolio logic
    with patch('routes.portfolio.get_diploma_data') as mock_portfolio:
        mock_portfolio.return_value = {
            'student': {'display_name': 'Test Student', 'portfolio_slug': 'test-student'},
            'badges': [],
            'quests': []
        }

        response = client.get(f'/api/observers/student/{student_id}/portfolio')

        assert response.status_code == 200
        assert 'student' in response.json


@pytest.mark.integration
def test_get_student_portfolio_no_access_fails(client, test_supabase):
    """Test observer cannot view portfolio without link"""
    observer_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES
            ('{observer_id}', 'observer@example.com', 'Grandma Smith', 'observer'),
            ('{student_id}', 'student@example.com', 'Test Student', 'student')
        """
    })

    # No link created

    with client.session_transaction() as session:
        session['user_id'] = observer_id

    response = client.get(f'/api/observers/student/{student_id}/portfolio')

    assert response.status_code == 403


@pytest.mark.integration
def test_post_comment_success(client, test_supabase):
    """Test observer can post comment on student work"""
    observer_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    link_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES
            ('{observer_id}', 'observer@example.com', 'Grandma Smith', 'observer'),
            ('{student_id}', 'student@example.com', 'Test Student', 'student')
        """
    })

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.observer_student_links
            (id, observer_id, student_id, relationship, can_comment, can_view_evidence)
            VALUES ('{link_id}', '{observer_id}', '{student_id}', 'grandparent', true, true)
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = observer_id

    response = client.post('/api/observers/comments', json={
        'student_id': student_id,
        'comment_text': 'Great work! So proud of you!'
    })

    assert response.status_code == 200
    assert response.json['status'] == 'success'
    assert 'comment' in response.json


@pytest.mark.integration
def test_post_comment_no_permission_fails(client, test_supabase):
    """Test observer cannot comment without permission"""
    observer_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    link_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES
            ('{observer_id}', 'observer@example.com', 'Grandma Smith', 'observer'),
            ('{student_id}', 'student@example.com', 'Test Student', 'student')
        """
    })

    # Create link with can_comment = false
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.observer_student_links
            (id, observer_id, student_id, relationship, can_comment, can_view_evidence)
            VALUES ('{link_id}', '{observer_id}', '{student_id}', 'grandparent', false, true)
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = observer_id

    response = client.post('/api/observers/comments', json={
        'student_id': student_id,
        'comment_text': 'Great work!'
    })

    assert response.status_code == 403


@pytest.mark.integration
def test_post_comment_too_long_fails(client, test_supabase):
    """Test posting comment over character limit fails"""
    observer_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    link_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES
            ('{observer_id}', 'observer@example.com', 'Grandma Smith', 'observer'),
            ('{student_id}', 'student@example.com', 'Test Student', 'student')
        """
    })

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.observer_student_links
            (id, observer_id, student_id, relationship, can_comment, can_view_evidence)
            VALUES ('{link_id}', '{observer_id}', '{student_id}', 'grandparent', true, true)
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = observer_id

    # Create comment over 2000 characters
    long_comment = 'A' * 2001

    response = client.post('/api/observers/comments', json={
        'student_id': student_id,
        'comment_text': long_comment
    })

    assert response.status_code == 400
    assert '2000' in response.json.get('error', '')


@pytest.mark.integration
def test_get_student_comments_as_student(client, test_supabase):
    """Test student can view their own observer comments"""
    student_id = str(uuid.uuid4())
    observer_id = str(uuid.uuid4())
    comment_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES
            ('{student_id}', 'student@example.com', 'Test Student', 'student'),
            ('{observer_id}', 'observer@example.com', 'Grandma Smith', 'observer')
        """
    })

    # Create comment
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.observer_comments
            (id, observer_id, student_id, comment_text)
            VALUES ('{comment_id}', '{observer_id}', '{student_id}', 'Great work!')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = student_id

    response = client.get(f'/api/observers/student/{student_id}/comments')

    assert response.status_code == 200
    assert len(response.json['comments']) >= 1


@pytest.mark.integration
def test_get_student_comments_as_observer(client, test_supabase):
    """Test observer can view student comments"""
    student_id = str(uuid.uuid4())
    observer_id = str(uuid.uuid4())
    link_id = str(uuid.uuid4())
    comment_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES
            ('{student_id}', 'student@example.com', 'Test Student', 'student'),
            ('{observer_id}', 'observer@example.com', 'Grandma Smith', 'observer')
        """
    })

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.observer_student_links
            (id, observer_id, student_id, relationship, can_comment, can_view_evidence)
            VALUES ('{link_id}', '{observer_id}', '{student_id}', 'grandparent', true, true)
        """
    })

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.observer_comments
            (id, observer_id, student_id, comment_text)
            VALUES ('{comment_id}', '{observer_id}', '{student_id}', 'Great work!')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = observer_id

    response = client.get(f'/api/observers/student/{student_id}/comments')

    assert response.status_code == 200
    assert len(response.json['comments']) >= 1


@pytest.mark.integration
def test_get_student_comments_no_access_fails(client, test_supabase):
    """Test unauthorized user cannot view student comments"""
    student_id = str(uuid.uuid4())
    unauthorized_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES
            ('{student_id}', 'student@example.com', 'Test Student', 'student'),
            ('{unauthorized_id}', 'unauthorized@example.com', 'Unauthorized', 'observer')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = unauthorized_id

    response = client.get(f'/api/observers/student/{student_id}/comments')

    assert response.status_code == 403


@pytest.mark.integration
def test_get_pending_invitations_for_observer(client, test_supabase):
    """Test observer can see pending invitations for their email"""
    observer_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    invitation_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES
            ('{observer_id}', 'observer@example.com', 'Observer', 'observer'),
            ('{student_id}', 'student@example.com', 'Test Student', 'student')
        """
    })

    # Create pending invitation for observer's email
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.observer_invitations
            (id, student_id, observer_email, observer_name, invitation_code, status)
            VALUES ('{invitation_id}', '{student_id}', 'observer@example.com', 'Observer', 'abc123', 'pending')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = observer_id

    response = client.get('/api/observers/pending-invitations')

    assert response.status_code == 200
    assert len(response.json['invitations']) >= 1


@pytest.mark.integration
def test_unauthenticated_requests_fail(client):
    """Test all observer endpoints require authentication"""
    fake_id = str(uuid.uuid4())

    endpoints = [
        ('POST', '/api/observers/invite', {'observer_email': 'test@example.com', 'observer_name': 'Test'}),
        ('GET', '/api/observers/my-invitations', None),
        ('DELETE', f'/api/observers/invitations/{fake_id}/cancel', None),
        ('GET', '/api/observers/my-observers', None),
        ('DELETE', f'/api/observers/{fake_id}/remove', None),
        ('GET', '/api/observers/my-students', None),
        ('GET', f'/api/observers/student/{fake_id}/portfolio', None),
        ('POST', '/api/observers/comments', {'student_id': fake_id, 'comment_text': 'Test'}),
        ('GET', f'/api/observers/student/{fake_id}/comments', None),
        ('GET', '/api/observers/pending-invitations', None),
    ]

    for method, endpoint, data in endpoints:
        if method == 'GET':
            response = client.get(endpoint)
        elif method == 'POST':
            response = client.post(endpoint, json=data)
        elif method == 'DELETE':
            response = client.delete(endpoint)

        assert response.status_code == 401, f"Endpoint {method} {endpoint} should require authentication"


@pytest.mark.integration
def test_observer_invitation_includes_link(client, test_supabase):
    """Test observer invitation email includes proper invitation link"""
    student_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, first_name, last_name, role)
            VALUES ('{student_id}', 'student@example.com', 'Test Student', 'Test', 'Student', 'student')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = student_id

    with patch('services.email_service.EmailService.send_templated_email') as mock_email:
        mock_email.return_value = True

        response = client.post('/api/observers/invite', json={
            'observer_email': 'grandparent@example.com',
            'observer_name': 'Grandma Smith'
        })

        assert response.status_code == 200

        # Verify email was called with correct template and context
        call_args = mock_email.call_args
        assert call_args[1]['template_name'] == 'observer_invitation'
        assert 'invitation_link' in call_args[1]['context']
        assert 'student_name' in call_args[1]['context']
        assert 'observer_name' in call_args[1]['context']
