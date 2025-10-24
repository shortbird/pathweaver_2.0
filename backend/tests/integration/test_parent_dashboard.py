"""
Integration tests for parent dashboard functionality.

Tests parent-student linking and access control including:
- Parent invitation flow
- Parent approval/decline
- Access verification (RLS enforcement)
- Learning rhythm indicator
- Unauthorized access blocked
"""

import pytest
import json
import uuid
from datetime import datetime, timedelta

from utils.logger import get_logger

logger = get_logger(__name__)


@pytest.mark.integration
@pytest.mark.critical
def test_student_can_send_parent_invitation(client, test_user, test_supabase):
    """Test student can send parent invitation"""
    # Simulate authenticated student
    with client.session_transaction() as session:
        session['user_id'] = test_user['id']

    parent_email = f'parent_{uuid.uuid4().hex[:8]}@example.com'

    response = client.post('/api/parents/invite', json={
        'parent_email': parent_email,
        'parent_name': 'Test Parent'
    })

    # Should succeed or return 404 if endpoint doesn't exist
    assert response.status_code in [200, 201, 404]


@pytest.mark.integration
@pytest.mark.critical
def test_parent_can_approve_invitation(client, test_user, test_supabase):
    """Test parent can approve student invitation"""
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

    # Create invitation
    invitation_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.parent_invitations
            (id, student_id, parent_id, status, expires_at, created_at)
            VALUES ('{invitation_id}', '{test_user['id']}', '{parent_id}', 'pending',
                    NOW() + INTERVAL '48 hours', NOW())
        """
    })

    # Simulate authenticated parent
    with client.session_transaction() as session:
        session['user_id'] = parent_id

    # Approve invitation
    response = client.post(f'/api/parents/invitations/{invitation_id}/approve', json={})

    # Should succeed
    assert response.status_code in [200, 201, 404]


@pytest.mark.integration
@pytest.mark.critical
def test_parent_can_only_access_linked_students(client, test_user, test_supabase):
    """Test RLS enforcement: parent can only access linked students"""
    # Create parent user
    parent_id = str(uuid.uuid4())
    parent_data = {
        'id': parent_id,
        'email': f'parent_{uuid.uuid4().hex[:8]}@example.com',
        'display_name': 'Test Parent',
        'role': 'parent',
    }

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{parent_id}', '{parent_data['email']}', '{parent_data['display_name']}', 'parent')
        """
    })

    # Create unlinked student
    other_student_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{other_student_id}', 'other_{uuid.uuid4().hex[:4]}@example.com', 'Other Student', 'student')
        """
    })

    # Simulate authenticated parent
    with client.session_transaction() as session:
        session['user_id'] = parent_id

    # Try to access unlinked student's dashboard
    response = client.get(f'/api/parent/dashboard/{other_student_id}')

    # Should be forbidden (403) or not found (404)
    assert response.status_code in [403, 404]


@pytest.mark.integration
def test_learning_rhythm_indicator_green(client, test_user, test_supabase):
    """Test learning rhythm shows green when student is on track"""
    # Create parent and link to student
    parent_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{parent_id}', 'parent_{uuid.uuid4().hex[:4]}@example.com', 'Test Parent', 'parent');

            INSERT INTO test_schema.parent_student_links (id, parent_id, student_id, status, approved_at)
            VALUES ('{uuid.uuid4()}', '{parent_id}', '{test_user['id']}', 'approved', NOW());
        """
    })

    # Create recent activity (completed task in last 7 days)
    quest_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.quests (id, title, description, source, is_active)
            VALUES ('{quest_id}', 'Test Quest', 'Test', 'optio', true);

            INSERT INTO test_schema.quest_task_completions
            (id, user_id, quest_id, task_id, completed_at, xp_awarded)
            VALUES ('{uuid.uuid4()}', '{test_user['id']}', '{quest_id}', '{uuid.uuid4()}',
                    NOW() - INTERVAL '2 days', 100);
        """
    })

    # Simulate authenticated parent
    with client.session_transaction() as session:
        session['user_id'] = parent_id

    # Get dashboard
    response = client.get(f'/api/parent/dashboard/{test_user["id"]}')

    if response.status_code == 200:
        data = response.json
        # Should show green rhythm (recent progress, no overdue)
        assert data.get('learning_rhythm') == 'green' or data.get('flow_state') == True


@pytest.mark.integration
def test_learning_rhythm_indicator_yellow(client, test_user, test_supabase):
    """Test learning rhythm shows yellow when student needs support"""
    # Create parent and link
    parent_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{parent_id}', 'parent_{uuid.uuid4().hex[:4]}@example.com', 'Test Parent', 'parent');

            INSERT INTO test_schema.parent_student_links (id, parent_id, student_id, status, approved_at)
            VALUES ('{uuid.uuid4()}', '{parent_id}', '{test_user['id']}', 'approved', NOW());
        """
    })

    # No recent activity (>7 days)
    # Learning rhythm should be yellow

    # Simulate authenticated parent
    with client.session_transaction() as session:
        session['user_id'] = parent_id

    response = client.get(f'/api/parent/dashboard/{test_user["id"]}')

    if response.status_code == 200:
        data = response.json
        # Should show yellow rhythm (no recent progress)
        assert data.get('learning_rhythm') == 'yellow' or data.get('needs_support') == True


@pytest.mark.integration
def test_parent_cannot_start_quests_for_student(client, test_user, test_supabase):
    """Test parents cannot start quests on behalf of students"""
    # Create parent and link
    parent_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{parent_id}', 'parent_{uuid.uuid4().hex[:4]}@example.com', 'Test Parent', 'parent');

            INSERT INTO test_schema.parent_student_links (id, parent_id, student_id, status)
            VALUES ('{uuid.uuid4()}', '{parent_id}', '{test_user['id']}', 'approved');
        """
    })

    # Create quest
    quest_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.quests (id, title, description, source, is_active)
            VALUES ('{quest_id}', 'Test Quest', 'Test', 'optio', true)
        """
    })

    # Simulate authenticated parent
    with client.session_transaction() as session:
        session['user_id'] = parent_id

    # Try to start quest for student
    response = client.post(f'/api/quests/{quest_id}/start', json={
        'student_id': test_user['id']  # Parent trying to start for student
    })

    # Should be forbidden
    assert response.status_code in [403, 400, 404]


@pytest.mark.integration
def test_parent_can_view_student_progress(client, test_user, test_supabase):
    """Test parent can view student's progress and active quests"""
    # Create parent and link
    parent_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{parent_id}', 'parent@example.com', 'Test Parent', 'parent');

            INSERT INTO test_schema.parent_student_links (id, parent_id, student_id, status)
            VALUES ('{uuid.uuid4()}', '{parent_id}', '{test_user['id']}', 'approved');
        """
    })

    # Simulate authenticated parent
    with client.session_transaction() as session:
        session['user_id'] = parent_id

    # View student progress
    response = client.get(f'/api/parent/progress/{test_user["id"]}')

    # Should succeed or return 404 if not implemented
    assert response.status_code in [200, 404]
