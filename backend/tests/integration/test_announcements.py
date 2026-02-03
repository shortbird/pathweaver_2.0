"""
Integration tests for Announcements API.

Tests the complete announcements system including:
- Creating/deleting announcements (advisor/admin only)
- Listing announcements with filtering
- RLS policies (organization isolation, student access)
- Target audience filtering (all/students/advisors)
- Markdown rendering and XSS prevention
- Expiration logic
- Pinned announcement sorting
"""

import pytest
import json
import uuid
from datetime import datetime, timedelta
from unittest.mock import patch, Mock
import bleach

from utils.logger import get_logger

logger = get_logger(__name__)


# ==================== Creation Tests ====================

@pytest.mark.integration
@pytest.mark.critical
def test_create_announcement_success(client, test_supabase):
    """Test advisor can create announcement"""
    # Create organization and advisor
    org_id = str(uuid.uuid4())
    advisor_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.organizations (id, name, slug)
            VALUES ('{org_id}', 'Test School', 'test-school');

            INSERT INTO test_schema.users (id, email, display_name, role, organization_id)
            VALUES ('{advisor_id}', 'advisor@example.com', 'Test Advisor', 'advisor', '{org_id}')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = advisor_id

    response = client.post('/api/announcements', json={
        'title': 'Important Update',
        'content': 'Finals week schedule has been updated.',
        'target_audience': 'students',
        'priority': 'high'
    })

    assert response.status_code == 201
    assert response.json['status'] == 'success'
    assert 'announcement' in response.json
    assert response.json['announcement']['title'] == 'Important Update'
    assert response.json['announcement']['organization_id'] == org_id


@pytest.mark.integration
def test_create_announcement_student_forbidden(client, test_supabase):
    """Test students cannot create announcements"""
    student_id = str(uuid.uuid4())
    org_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.organizations (id, name, slug)
            VALUES ('{org_id}', 'Test School', 'test-school');

            INSERT INTO test_schema.users (id, email, display_name, role, organization_id)
            VALUES ('{student_id}', 'student@example.com', 'Test Student', 'student', '{org_id}')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = student_id

    response = client.post('/api/announcements', json={
        'title': 'Test',
        'content': 'Test content',
        'target_audience': 'all'
    })

    assert response.status_code == 403


@pytest.mark.integration
def test_create_announcement_with_expiration(client, test_supabase):
    """Test creating announcement with expiration date"""
    org_id = str(uuid.uuid4())
    advisor_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.organizations (id, name, slug)
            VALUES ('{org_id}', 'Test School', 'test-school');

            INSERT INTO test_schema.users (id, email, display_name, role, organization_id)
            VALUES ('{advisor_id}', 'advisor@example.com', 'Test Advisor', 'advisor', '{org_id}')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = advisor_id

    future_date = (datetime.utcnow() + timedelta(days=7)).isoformat()

    response = client.post('/api/announcements', json={
        'title': 'Temporary Notice',
        'content': 'This will expire in 7 days',
        'target_audience': 'all',
        'expires_at': future_date
    })

    assert response.status_code == 201
    assert response.json['announcement']['expires_at'] is not None


@pytest.mark.integration
def test_create_announcement_missing_fields(client, test_supabase):
    """Test creating announcement without required fields fails"""
    org_id = str(uuid.uuid4())
    advisor_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.organizations (id, name, slug)
            VALUES ('{org_id}', 'Test School', 'test-school');

            INSERT INTO test_schema.users (id, email, display_name, role, organization_id)
            VALUES ('{advisor_id}', 'advisor@example.com', 'Test Advisor', 'advisor', '{org_id}')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = advisor_id

    # Missing title
    response = client.post('/api/announcements', json={
        'content': 'Content without title',
        'target_audience': 'all'
    })
    assert response.status_code == 400

    # Missing content
    response = client.post('/api/announcements', json={
        'title': 'Title without content',
        'target_audience': 'all'
    })
    assert response.status_code == 400


# ==================== Listing Tests ====================

@pytest.mark.integration
def test_list_announcements_student_view(client, test_supabase):
    """Test student sees only their org's announcements targeted to them"""
    org1_id = str(uuid.uuid4())
    org2_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    advisor1_id = str(uuid.uuid4())
    advisor2_id = str(uuid.uuid4())
    announcement1_id = str(uuid.uuid4())
    announcement2_id = str(uuid.uuid4())
    announcement3_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.organizations (id, name, slug)
            VALUES
                ('{org1_id}', 'School 1', 'school-1'),
                ('{org2_id}', 'School 2', 'school-2');

            INSERT INTO test_schema.users (id, email, display_name, role, organization_id)
            VALUES
                ('{student_id}', 'student@school1.com', 'Student', 'student', '{org1_id}'),
                ('{advisor1_id}', 'advisor1@school1.com', 'Advisor 1', 'advisor', '{org1_id}'),
                ('{advisor2_id}', 'advisor2@school2.com', 'Advisor 2', 'advisor', '{org2_id}');

            INSERT INTO test_schema.announcements (id, organization_id, author_id, title, content, target_audience, is_active)
            VALUES
                ('{announcement1_id}', '{org1_id}', '{advisor1_id}', 'Announcement for School 1', 'Content', 'students', true),
                ('{announcement2_id}', '{org1_id}', '{advisor1_id}', 'Advisor-only announcement', 'Content', 'advisors', true),
                ('{announcement3_id}', '{org2_id}', '{advisor2_id}', 'Announcement for School 2', 'Content', 'students', true)
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = student_id

    response = client.get('/api/announcements')

    assert response.status_code == 200
    announcements = response.json['announcements']

    # Should only see announcement1 (same org, targeted to students)
    assert len(announcements) == 1
    assert announcements[0]['id'] == announcement1_id
    assert announcements[0]['title'] == 'Announcement for School 1'


@pytest.mark.integration
def test_list_announcements_filters_expired(client, test_supabase):
    """Test expired announcements are not shown"""
    org_id = str(uuid.uuid4())
    advisor_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    active_id = str(uuid.uuid4())
    expired_id = str(uuid.uuid4())

    past_date = (datetime.utcnow() - timedelta(days=1)).isoformat()

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.organizations (id, name, slug)
            VALUES ('{org_id}', 'Test School', 'test-school');

            INSERT INTO test_schema.users (id, email, display_name, role, organization_id)
            VALUES
                ('{advisor_id}', 'advisor@example.com', 'Advisor', 'advisor', '{org_id}'),
                ('{student_id}', 'student@example.com', 'Student', 'student', '{org_id}');

            INSERT INTO test_schema.announcements (id, organization_id, author_id, title, content, target_audience, expires_at, is_active)
            VALUES
                ('{active_id}', '{org_id}', '{advisor_id}', 'Active Announcement', 'Content', 'all', NULL, true),
                ('{expired_id}', '{org_id}', '{advisor_id}', 'Expired Announcement', 'Content', 'all', '{past_date}', true)
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = student_id

    response = client.get('/api/announcements')

    assert response.status_code == 200
    announcements = response.json['announcements']

    # Should only see active announcement
    assert len(announcements) == 1
    assert announcements[0]['id'] == active_id


@pytest.mark.integration
def test_list_announcements_pinned_first(client, test_supabase):
    """Test pinned announcements appear first"""
    org_id = str(uuid.uuid4())
    advisor_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    pinned_id = str(uuid.uuid4())
    normal_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.organizations (id, name, slug)
            VALUES ('{org_id}', 'Test School', 'test-school');

            INSERT INTO test_schema.users (id, email, display_name, role, organization_id)
            VALUES
                ('{advisor_id}', 'advisor@example.com', 'Advisor', 'advisor', '{org_id}'),
                ('{student_id}', 'student@example.com', 'Student', 'student', '{org_id}');

            INSERT INTO test_schema.announcements (id, organization_id, author_id, title, content, target_audience, is_pinned, is_active, created_at)
            VALUES
                ('{pinned_id}', '{org_id}', '{advisor_id}', 'Pinned', 'Content', 'all', true, true, '2025-01-01 10:00:00'),
                ('{normal_id}', '{org_id}', '{advisor_id}', 'Normal', 'Content', 'all', false, true, '2025-01-10 10:00:00')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = student_id

    response = client.get('/api/announcements')

    assert response.status_code == 200
    announcements = response.json['announcements']

    # Pinned should be first even though it's older
    assert len(announcements) == 2
    assert announcements[0]['id'] == pinned_id
    assert announcements[0]['is_pinned'] is True


# ==================== Deletion Tests ====================

@pytest.mark.integration
def test_delete_announcement_success(client, test_supabase):
    """Test advisor can delete their own announcement"""
    org_id = str(uuid.uuid4())
    advisor_id = str(uuid.uuid4())
    announcement_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.organizations (id, name, slug)
            VALUES ('{org_id}', 'Test School', 'test-school');

            INSERT INTO test_schema.users (id, email, display_name, role, organization_id)
            VALUES ('{advisor_id}', 'advisor@example.com', 'Test Advisor', 'advisor', '{org_id}');

            INSERT INTO test_schema.announcements (id, organization_id, author_id, title, content, target_audience, is_active)
            VALUES ('{announcement_id}', '{org_id}', '{advisor_id}', 'Test', 'Content', 'all', true)
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = advisor_id

    response = client.delete(f'/api/announcements/{announcement_id}')

    assert response.status_code == 200
    assert response.json['status'] == 'success'


@pytest.mark.integration
def test_delete_announcement_wrong_author(client, test_supabase):
    """Test advisor cannot delete another advisor's announcement"""
    org_id = str(uuid.uuid4())
    advisor1_id = str(uuid.uuid4())
    advisor2_id = str(uuid.uuid4())
    announcement_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.organizations (id, name, slug)
            VALUES ('{org_id}', 'Test School', 'test-school');

            INSERT INTO test_schema.users (id, email, display_name, role, organization_id)
            VALUES
                ('{advisor1_id}', 'advisor1@example.com', 'Advisor 1', 'advisor', '{org_id}'),
                ('{advisor2_id}', 'advisor2@example.com', 'Advisor 2', 'advisor', '{org_id}');

            INSERT INTO test_schema.announcements (id, organization_id, author_id, title, content, target_audience, is_active)
            VALUES ('{announcement_id}', '{org_id}', '{advisor1_id}', 'Test', 'Content', 'all', true)
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = advisor2_id

    response = client.delete(f'/api/announcements/{announcement_id}')

    assert response.status_code == 403


# ==================== Security Tests ====================

@pytest.mark.integration
@pytest.mark.security
def test_markdown_xss_prevention(client, test_supabase):
    """Test XSS attack via markdown is prevented"""
    org_id = str(uuid.uuid4())
    advisor_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.organizations (id, name, slug)
            VALUES ('{org_id}', 'Test School', 'test-school');

            INSERT INTO test_schema.users (id, email, display_name, role, organization_id)
            VALUES ('{advisor_id}', 'advisor@example.com', 'Test Advisor', 'advisor', '{org_id}')
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = advisor_id

    malicious_content = '<script>alert("XSS")</script>Safe content'

    response = client.post('/api/announcements', json={
        'title': 'Test',
        'content': malicious_content,
        'target_audience': 'all'
    })

    assert response.status_code == 201

    # Content should be sanitized (script tag removed)
    saved_content = response.json['announcement']['content']
    assert '<script>' not in saved_content
    assert 'Safe content' in saved_content


@pytest.mark.integration
@pytest.mark.security
def test_organization_isolation_rls(client, test_supabase):
    """Test RLS prevents cross-org announcement access"""
    org1_id = str(uuid.uuid4())
    org2_id = str(uuid.uuid4())
    student1_id = str(uuid.uuid4())
    student2_id = str(uuid.uuid4())
    advisor1_id = str(uuid.uuid4())
    announcement_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.organizations (id, name, slug)
            VALUES
                ('{org1_id}', 'School 1', 'school-1'),
                ('{org2_id}', 'School 2', 'school-2');

            INSERT INTO test_schema.users (id, email, display_name, role, organization_id)
            VALUES
                ('{student1_id}', 'student1@school1.com', 'Student 1', 'student', '{org1_id}'),
                ('{student2_id}', 'student2@school2.com', 'Student 2', 'student', '{org2_id}'),
                ('{advisor1_id}', 'advisor@school1.com', 'Advisor', 'advisor', '{org1_id}');

            INSERT INTO test_schema.announcements (id, organization_id, author_id, title, content, target_audience, is_active)
            VALUES ('{announcement_id}', '{org1_id}', '{advisor1_id}', 'School 1 Only', 'Content', 'all', true)
        """
    })

    # Student from org1 should see the announcement
    with client.session_transaction() as session:
        session['user_id'] = student1_id

    response = client.get('/api/announcements')
    assert response.status_code == 200
    assert len(response.json['announcements']) == 1

    # Student from org2 should NOT see the announcement
    with client.session_transaction() as session:
        session['user_id'] = student2_id

    response = client.get('/api/announcements')
    assert response.status_code == 200
    assert len(response.json['announcements']) == 0


# ==================== Target Audience Tests ====================

@pytest.mark.integration
def test_target_audience_filtering(client, test_supabase):
    """Test target_audience correctly filters who sees announcements"""
    org_id = str(uuid.uuid4())
    advisor_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    all_id = str(uuid.uuid4())
    students_id = str(uuid.uuid4())
    advisors_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.organizations (id, name, slug)
            VALUES ('{org_id}', 'Test School', 'test-school');

            INSERT INTO test_schema.users (id, email, display_name, role, organization_id)
            VALUES
                ('{advisor_id}', 'advisor@example.com', 'Advisor', 'advisor', '{org_id}'),
                ('{student_id}', 'student@example.com', 'Student', 'student', '{org_id}');

            INSERT INTO test_schema.announcements (id, organization_id, author_id, title, content, target_audience, is_active)
            VALUES
                ('{all_id}', '{org_id}', '{advisor_id}', 'For All', 'Content', 'all', true),
                ('{students_id}', '{org_id}', '{advisor_id}', 'For Students', 'Content', 'students', true),
                ('{advisors_id}', '{org_id}', '{advisor_id}', 'For Advisors', 'Content', 'advisors', true)
        """
    })

    # Student should see 'all' and 'students' announcements
    with client.session_transaction() as session:
        session['user_id'] = student_id

    response = client.get('/api/announcements')
    assert response.status_code == 200
    student_announcements = response.json['announcements']
    assert len(student_announcements) == 2
    titles = [a['title'] for a in student_announcements]
    assert 'For All' in titles
    assert 'For Students' in titles
    assert 'For Advisors' not in titles

    # Advisor should see 'all' and 'advisors' announcements
    with client.session_transaction() as session:
        session['user_id'] = advisor_id

    response = client.get('/api/announcements')
    assert response.status_code == 200
    advisor_announcements = response.json['announcements']
    assert len(advisor_announcements) == 2
    titles = [a['title'] for a in advisor_announcements]
    assert 'For All' in titles
    assert 'For Advisors' in titles
    assert 'For Students' not in titles
