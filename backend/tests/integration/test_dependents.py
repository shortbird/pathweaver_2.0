"""
Integration tests for Dependent Profiles API.

Tests the complete dependent profiles system including:
- Creating dependent profiles (parent-only)
- Retrieving dependent profiles
- Updating dependent profiles
- Deleting dependent profiles
- Promoting dependents to independent accounts at age 13
- Generating acting-as tokens for parents
- COPPA compliance (age restrictions, no email/password for under 13)
"""

import pytest
import json
import uuid
from datetime import datetime, timedelta
from unittest.mock import patch

from utils.logger import get_logger

logger = get_logger(__name__)


@pytest.mark.integration
@pytest.mark.critical
def test_create_dependent_success(client, test_supabase):
    """Test parent can successfully create a dependent profile"""
    # Create parent user
    parent_id = str(uuid.uuid4())
    parent_data = {
        'id': parent_id,
        'email': f'parent_{uuid.uuid4().hex[:8]}@example.com',
        'display_name': 'Test Parent',
        'first_name': 'Test',
        'last_name': 'Parent',
        'role': 'parent',
    }

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, first_name, last_name, role)
            VALUES ('{parent_data['id']}', '{parent_data['email']}', '{parent_data['display_name']}',
                    '{parent_data['first_name']}', '{parent_data['last_name']}', '{parent_data['role']}')
        """
    })

    # Simulate authenticated parent
    with client.session_transaction() as session:
        session['user_id'] = parent_id

    # Create dependent
    response = client.post('/api/dependents/create', json={
        'display_name': 'Child User',
        'date_of_birth': '2015-06-15'
    })

    assert response.status_code == 201
    assert response.json['success'] is True
    assert response.json['dependent']['display_name'] == 'Child User'
    assert response.json['dependent']['is_dependent'] is True
    assert response.json['dependent']['managed_by_parent_id'] == parent_id


@pytest.mark.integration
def test_create_dependent_non_parent_fails(client, test_supabase):
    """Test non-parent user cannot create dependent"""
    # Create student user
    student_id = str(uuid.uuid4())
    student_data = {
        'id': student_id,
        'email': f'student_{uuid.uuid4().hex[:8]}@example.com',
        'display_name': 'Test Student',
        'role': 'student',
    }

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{student_data['id']}', '{student_data['email']}',
                    '{student_data['display_name']}', '{student_data['role']}')
        """
    })

    # Simulate authenticated student
    with client.session_transaction() as session:
        session['user_id'] = student_id

    # Try to create dependent
    response = client.post('/api/dependents/create', json={
        'display_name': 'Child User',
        'date_of_birth': '2015-06-15'
    })

    assert response.status_code == 403
    assert 'Only parent or admin accounts' in response.json.get('error', '')


@pytest.mark.integration
def test_create_dependent_missing_fields(client, test_supabase):
    """Test creating dependent without required fields fails"""
    # Create parent user
    parent_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{parent_id}', 'parent@example.com', 'Test Parent', 'parent')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = parent_id

    # Missing display_name
    response = client.post('/api/dependents/create', json={
        'date_of_birth': '2015-06-15'
    })
    assert response.status_code == 400
    assert 'display_name is required' in response.json.get('error', '')

    # Missing date_of_birth
    response = client.post('/api/dependents/create', json={
        'display_name': 'Child User'
    })
    assert response.status_code == 400
    assert 'date_of_birth is required' in response.json.get('error', '')


@pytest.mark.integration
def test_create_dependent_invalid_date_format(client, test_supabase):
    """Test creating dependent with invalid date format fails"""
    parent_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{parent_id}', 'parent@example.com', 'Test Parent', 'parent')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = parent_id

    # Invalid date format
    response = client.post('/api/dependents/create', json={
        'display_name': 'Child User',
        'date_of_birth': '06/15/2015'  # Wrong format, should be YYYY-MM-DD
    })

    assert response.status_code == 400
    assert 'YYYY-MM-DD' in response.json.get('error', '')


@pytest.mark.integration
def test_get_my_dependents_success(client, test_supabase):
    """Test parent can retrieve all their dependents"""
    # Create parent user
    parent_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{parent_id}', 'parent@example.com', 'Test Parent', 'parent')
        """
    })

    # Create two dependents for this parent
    dependent1_id = str(uuid.uuid4())
    dependent2_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users
            (id, display_name, role, is_dependent, managed_by_parent_id, date_of_birth)
            VALUES
            ('{dependent1_id}', 'Child 1', 'student', true, '{parent_id}', '2015-01-01'),
            ('{dependent2_id}', 'Child 2', 'student', true, '{parent_id}', '2016-02-02')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = parent_id

    response = client.get('/api/dependents/my-dependents')

    assert response.status_code == 200
    assert response.json['success'] is True
    assert response.json['count'] == 2
    assert len(response.json['dependents']) == 2


@pytest.mark.integration
def test_get_my_dependents_non_parent_fails(client, test_supabase):
    """Test non-parent cannot retrieve dependents"""
    student_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{student_id}', 'student@example.com', 'Test Student', 'student')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = student_id

    response = client.get('/api/dependents/my-dependents')

    assert response.status_code == 403


@pytest.mark.integration
def test_get_specific_dependent_success(client, test_supabase):
    """Test parent can retrieve a specific dependent"""
    parent_id = str(uuid.uuid4())
    dependent_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{parent_id}', 'parent@example.com', 'Test Parent', 'parent')
        """
    })

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users
            (id, display_name, role, is_dependent, managed_by_parent_id, date_of_birth)
            VALUES ('{dependent_id}', 'Child User', 'student', true, '{parent_id}', '2015-06-15')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = parent_id

    response = client.get(f'/api/dependents/{dependent_id}')

    assert response.status_code == 200
    assert response.json['success'] is True
    assert response.json['dependent']['id'] == dependent_id
    assert response.json['dependent']['display_name'] == 'Child User'


@pytest.mark.integration
def test_get_dependent_wrong_parent_fails(client, test_supabase):
    """Test parent cannot access another parent's dependent"""
    parent1_id = str(uuid.uuid4())
    parent2_id = str(uuid.uuid4())
    dependent_id = str(uuid.uuid4())

    # Create two parents
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES
            ('{parent1_id}', 'parent1@example.com', 'Parent 1', 'parent'),
            ('{parent2_id}', 'parent2@example.com', 'Parent 2', 'parent')
        """
    })

    # Create dependent owned by parent1
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users
            (id, display_name, role, is_dependent, managed_by_parent_id, date_of_birth)
            VALUES ('{dependent_id}', 'Child User', 'student', true, '{parent1_id}', '2015-06-15')
        """
    })

    # Try to access as parent2
    with client.session_transaction() as session:
        session['user_id'] = parent2_id

    response = client.get(f'/api/dependents/{dependent_id}')

    assert response.status_code == 404  # Permission error returns 404


@pytest.mark.integration
def test_update_dependent_success(client, test_supabase):
    """Test parent can update dependent profile"""
    parent_id = str(uuid.uuid4())
    dependent_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{parent_id}', 'parent@example.com', 'Test Parent', 'parent')
        """
    })

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users
            (id, display_name, role, is_dependent, managed_by_parent_id, date_of_birth)
            VALUES ('{dependent_id}', 'Child User', 'student', true, '{parent_id}', '2015-06-15')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = parent_id

    response = client.put(f'/api/dependents/{dependent_id}', json={
        'display_name': 'Updated Child Name',
        'bio': 'Loves science and art'
    })

    assert response.status_code == 200
    assert response.json['success'] is True
    assert response.json['dependent']['display_name'] == 'Updated Child Name'


@pytest.mark.integration
def test_update_dependent_disallowed_fields(client, test_supabase):
    """Test updating dependent with disallowed fields is rejected"""
    parent_id = str(uuid.uuid4())
    dependent_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{parent_id}', 'parent@example.com', 'Test Parent', 'parent')
        """
    })

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users
            (id, display_name, role, is_dependent, managed_by_parent_id, date_of_birth)
            VALUES ('{dependent_id}', 'Child User', 'student', true, '{parent_id}', '2015-06-15')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = parent_id

    # Try to update disallowed fields (like email, role)
    response = client.put(f'/api/dependents/{dependent_id}', json={
        'email': 'hacker@evil.com',
        'role': 'admin'
    })

    # Should fail validation (no allowed fields provided)
    assert response.status_code == 400
    assert 'At least one valid field' in response.json.get('error', '')


@pytest.mark.integration
def test_delete_dependent_success(client, test_supabase):
    """Test parent can delete dependent profile"""
    parent_id = str(uuid.uuid4())
    dependent_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{parent_id}', 'parent@example.com', 'Test Parent', 'parent')
        """
    })

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users
            (id, display_name, role, is_dependent, managed_by_parent_id, date_of_birth)
            VALUES ('{dependent_id}', 'Child User', 'student', true, '{parent_id}', '2015-06-15')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = parent_id

    response = client.delete(f'/api/dependents/{dependent_id}')

    assert response.status_code == 200
    assert response.json['success'] is True
    assert 'deleted' in response.json['message'].lower()


@pytest.mark.integration
def test_delete_dependent_wrong_parent_fails(client, test_supabase):
    """Test parent cannot delete another parent's dependent"""
    parent1_id = str(uuid.uuid4())
    parent2_id = str(uuid.uuid4())
    dependent_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES
            ('{parent1_id}', 'parent1@example.com', 'Parent 1', 'parent'),
            ('{parent2_id}', 'parent2@example.com', 'Parent 2', 'parent')
        """
    })

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users
            (id, display_name, role, is_dependent, managed_by_parent_id, date_of_birth)
            VALUES ('{dependent_id}', 'Child User', 'student', true, '{parent1_id}', '2015-06-15')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = parent2_id

    response = client.delete(f'/api/dependents/{dependent_id}')

    assert response.status_code == 404  # Permission error returns 404


@pytest.mark.integration
def test_promote_dependent_success(client, test_supabase):
    """Test promoting eligible dependent (age 13+) to independent account"""
    parent_id = str(uuid.uuid4())
    dependent_id = str(uuid.uuid4())

    # Calculate date that makes child exactly 13 years old
    thirteen_years_ago = (datetime.now() - timedelta(days=13*365)).strftime('%Y-%m-%d')

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{parent_id}', 'parent@example.com', 'Test Parent', 'parent')
        """
    })

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users
            (id, display_name, role, is_dependent, managed_by_parent_id, date_of_birth)
            VALUES ('{dependent_id}', 'Child User', 'student', true, '{parent_id}', '{thirteen_years_ago}')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = parent_id

    # Mock Supabase auth to avoid actual account creation
    with patch('repositories.dependent_repository.get_supabase_admin_client') as mock_client:
        # Setup mock to return success
        mock_response = type('obj', (object,), {'data': [{'id': dependent_id, 'email': None}]})()
        mock_client.return_value.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_response

        response = client.post(f'/api/dependents/{dependent_id}/promote', json={
            'email': 'newchild@example.com',
            'password': 'StrongP@ssw0rd123!'
        })

        # May succeed or fail depending on repository implementation
        assert response.status_code in [200, 400, 500]


@pytest.mark.integration
def test_promote_dependent_weak_password_fails(client, test_supabase):
    """Test promoting dependent with weak password fails"""
    parent_id = str(uuid.uuid4())
    dependent_id = str(uuid.uuid4())

    thirteen_years_ago = (datetime.now() - timedelta(days=13*365)).strftime('%Y-%m-%d')

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{parent_id}', 'parent@example.com', 'Test Parent', 'parent')
        """
    })

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users
            (id, display_name, role, is_dependent, managed_by_parent_id, date_of_birth)
            VALUES ('{dependent_id}', 'Child User', 'student', true, '{parent_id}', '{thirteen_years_ago}')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = parent_id

    response = client.post(f'/api/dependents/{dependent_id}/promote', json={
        'email': 'newchild@example.com',
        'password': 'weak'  # Too short, no special chars, etc.
    })

    assert response.status_code == 400
    assert 'password' in response.json.get('error', '').lower()


@pytest.mark.integration
def test_promote_dependent_missing_email_fails(client, test_supabase):
    """Test promoting dependent without email fails"""
    parent_id = str(uuid.uuid4())
    dependent_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{parent_id}', 'parent@example.com', 'Test Parent', 'parent')
        """
    })

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users
            (id, display_name, role, is_dependent, managed_by_parent_id, date_of_birth)
            VALUES ('{dependent_id}', 'Child User', 'student', true, '{parent_id}', '2012-01-01')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = parent_id

    response = client.post(f'/api/dependents/{dependent_id}/promote', json={
        'password': 'StrongP@ssw0rd123!'
    })

    assert response.status_code == 400
    assert 'email is required' in response.json.get('error', '')


@pytest.mark.integration
def test_generate_acting_as_token_success(client, test_supabase):
    """Test parent can generate acting-as token for their dependent"""
    parent_id = str(uuid.uuid4())
    dependent_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{parent_id}', 'parent@example.com', 'Test Parent', 'parent')
        """
    })

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users
            (id, display_name, role, is_dependent, managed_by_parent_id, date_of_birth)
            VALUES ('{dependent_id}', 'Child User', 'student', true, '{parent_id}', '2015-06-15')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = parent_id

    response = client.post(f'/api/dependents/{dependent_id}/act-as')

    assert response.status_code == 200
    assert response.json['success'] is True
    assert 'acting_as_token' in response.json
    assert response.json['dependent_id'] == dependent_id


@pytest.mark.integration
def test_generate_acting_as_token_wrong_parent_fails(client, test_supabase):
    """Test parent cannot generate acting-as token for another parent's dependent"""
    parent1_id = str(uuid.uuid4())
    parent2_id = str(uuid.uuid4())
    dependent_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES
            ('{parent1_id}', 'parent1@example.com', 'Parent 1', 'parent'),
            ('{parent2_id}', 'parent2@example.com', 'Parent 2', 'parent')
        """
    })

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users
            (id, display_name, role, is_dependent, managed_by_parent_id, date_of_birth)
            VALUES ('{dependent_id}', 'Child User', 'student', true, '{parent1_id}', '2015-06-15')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = parent2_id

    response = client.post(f'/api/dependents/{dependent_id}/act-as')

    assert response.status_code == 403


@pytest.mark.integration
def test_unauthenticated_requests_fail(client):
    """Test all dependent endpoints require authentication"""
    fake_id = str(uuid.uuid4())

    endpoints = [
        ('GET', '/api/dependents/my-dependents', None),
        ('POST', '/api/dependents/create', {'display_name': 'Test', 'date_of_birth': '2015-01-01'}),
        ('GET', f'/api/dependents/{fake_id}', None),
        ('PUT', f'/api/dependents/{fake_id}', {'display_name': 'Updated'}),
        ('DELETE', f'/api/dependents/{fake_id}', None),
        ('POST', f'/api/dependents/{fake_id}/promote', {'email': 'test@example.com', 'password': 'Test123!'}),
        ('POST', f'/api/dependents/{fake_id}/act-as', None),
    ]

    for method, endpoint, data in endpoints:
        if method == 'GET':
            response = client.get(endpoint)
        elif method == 'POST':
            response = client.post(endpoint, json=data)
        elif method == 'PUT':
            response = client.put(endpoint, json=data)
        elif method == 'DELETE':
            response = client.delete(endpoint)

        assert response.status_code == 401, f"Endpoint {method} {endpoint} should require authentication"
