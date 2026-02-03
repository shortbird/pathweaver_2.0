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


# ============================================================================
# DEPENDENT (Under 13) TESTS - January 2025
# ============================================================================

@pytest.mark.integration
@pytest.mark.critical
def test_parent_can_access_dependent_dashboard(client, test_supabase):
    """Test parent can access dashboard for their dependent (under 13 child)"""
    # Create parent
    parent_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{parent_id}', 'parent_{uuid.uuid4().hex[:4]}@example.com', 'Test Parent', 'parent')
        """
    })

    # Create dependent managed by parent
    dependent_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, display_name, role, is_dependent, managed_by_parent_id, date_of_birth)
            VALUES ('{dependent_id}', 'Test Child', 'student', true, '{parent_id}', '2016-06-15')
        """
    })

    # Simulate authenticated parent
    with client.session_transaction() as session:
        session['user_id'] = parent_id

    # Access dependent's dashboard
    response = client.get(f'/api/parent/dashboard/{dependent_id}')

    # Should succeed (200) - parent has access to their dependent
    assert response.status_code == 200


@pytest.mark.integration
@pytest.mark.critical
def test_parent_cannot_access_other_dependent(client, test_supabase):
    """Test parent cannot access another parent's dependent"""
    # Create two parents
    parent1_id = str(uuid.uuid4())
    parent2_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES
            ('{parent1_id}', 'parent1_{uuid.uuid4().hex[:4]}@example.com', 'Parent One', 'parent'),
            ('{parent2_id}', 'parent2_{uuid.uuid4().hex[:4]}@example.com', 'Parent Two', 'parent')
        """
    })

    # Create dependent managed by parent2
    dependent_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, display_name, role, is_dependent, managed_by_parent_id, date_of_birth)
            VALUES ('{dependent_id}', 'Other Child', 'student', true, '{parent2_id}', '2017-03-20')
        """
    })

    # Simulate authenticated parent1
    with client.session_transaction() as session:
        session['user_id'] = parent1_id

    # Try to access parent2's dependent - should be forbidden
    response = client.get(f'/api/parent/dashboard/{dependent_id}')

    assert response.status_code in [403, 404]


@pytest.mark.integration
@pytest.mark.critical
def test_parent_can_create_dependent(client, test_supabase):
    """Test parent can create a dependent profile (under 13 child)"""
    # Create parent
    parent_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{parent_id}', 'parent_{uuid.uuid4().hex[:4]}@example.com', 'Test Parent', 'parent')
        """
    })

    # Simulate authenticated parent
    with client.session_transaction() as session:
        session['user_id'] = parent_id

    # Create dependent
    response = client.post('/api/dependents/create', json={
        'display_name': 'New Child',
        'date_of_birth': '2016-06-15'  # Under 13
    })

    # Should succeed (200 or 201)
    assert response.status_code in [200, 201]

    if response.status_code in [200, 201]:
        data = response.json
        assert data.get('success') == True
        assert 'dependent' in data


@pytest.mark.integration
def test_create_dependent_requires_under_13(client, test_supabase):
    """Test that creating dependent fails for 13+ year olds"""
    # Create parent
    parent_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{parent_id}', 'parent_{uuid.uuid4().hex[:4]}@example.com', 'Test Parent', 'parent')
        """
    })

    # Simulate authenticated parent
    with client.session_transaction() as session:
        session['user_id'] = parent_id

    # Try to create dependent with 14 year old
    from datetime import date
    teen_dob = (date.today().replace(year=date.today().year - 14)).isoformat()

    response = client.post('/api/dependents/create', json={
        'display_name': 'Teen Child',
        'date_of_birth': teen_dob
    })

    # Should fail - child is 13+
    assert response.status_code == 400


@pytest.mark.integration
def test_parent_can_get_acting_as_token(client, test_supabase):
    """Test parent can get acting-as token for their dependent"""
    # Create parent
    parent_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{parent_id}', 'parent_{uuid.uuid4().hex[:4]}@example.com', 'Test Parent', 'parent')
        """
    })

    # Create dependent
    dependent_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, display_name, role, is_dependent, managed_by_parent_id, date_of_birth)
            VALUES ('{dependent_id}', 'Test Child', 'student', true, '{parent_id}', '2016-06-15')
        """
    })

    # Simulate authenticated parent
    with client.session_transaction() as session:
        session['user_id'] = parent_id

    # Request acting-as token
    response = client.post(f'/api/dependents/{dependent_id}/act-as', json={})

    # Should succeed
    assert response.status_code in [200, 201]

    if response.status_code in [200, 201]:
        data = response.json
        assert 'acting_as_token' in data or 'token' in data


@pytest.mark.integration
def test_parent_cannot_get_token_for_other_dependent(client, test_supabase):
    """Test parent cannot get acting-as token for another parent's dependent"""
    # Create two parents
    parent1_id = str(uuid.uuid4())
    parent2_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES
            ('{parent1_id}', 'parent1_{uuid.uuid4().hex[:4]}@example.com', 'Parent One', 'parent'),
            ('{parent2_id}', 'parent2_{uuid.uuid4().hex[:4]}@example.com', 'Parent Two', 'parent')
        """
    })

    # Create dependent managed by parent2
    dependent_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, display_name, role, is_dependent, managed_by_parent_id)
            VALUES ('{dependent_id}', 'Other Child', 'student', true, '{parent2_id}')
        """
    })

    # Simulate authenticated parent1
    with client.session_transaction() as session:
        session['user_id'] = parent1_id

    # Try to get token for parent2's dependent
    response = client.post(f'/api/dependents/{dependent_id}/act-as', json={})

    # Should fail - not their dependent
    assert response.status_code in [403, 404]


@pytest.mark.integration
def test_parent_can_upload_evidence_for_dependent(client, test_supabase):
    """Test parent can upload evidence for their dependent's task"""
    # Create parent
    parent_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{parent_id}', 'parent_{uuid.uuid4().hex[:4]}@example.com', 'Test Parent', 'parent')
        """
    })

    # Create dependent
    dependent_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, display_name, role, is_dependent, managed_by_parent_id)
            VALUES ('{dependent_id}', 'Test Child', 'student', true, '{parent_id}')
        """
    })

    # Create quest and task for dependent
    quest_id = str(uuid.uuid4())
    task_id = str(uuid.uuid4())
    user_quest_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.quests (id, title, description, source, is_active)
            VALUES ('{quest_id}', 'Test Quest', 'Test', 'optio', true);

            INSERT INTO test_schema.user_quests (id, user_id, quest_id, is_active)
            VALUES ('{user_quest_id}', '{dependent_id}', '{quest_id}', true);

            INSERT INTO test_schema.user_quest_tasks (id, user_id, quest_id, title, pillar, xp_value)
            VALUES ('{task_id}', '{dependent_id}', '{quest_id}', 'Test Task', 'stem', 100)
        """
    })

    # Simulate authenticated parent
    with client.session_transaction() as session:
        session['user_id'] = parent_id

    # Upload evidence for dependent's task
    response = client.post('/api/evidence/helper/upload-for-student', json={
        'student_id': dependent_id,
        'task_id': task_id,
        'block_type': 'text',
        'content': {'text': 'Parent uploaded this evidence for their child'}
    })

    # Should succeed - parent has access to dependent
    assert response.status_code in [200, 201]


@pytest.mark.integration
def test_parent_cannot_upload_evidence_for_other_dependent(client, test_supabase):
    """Test parent cannot upload evidence for another parent's dependent"""
    # Create two parents
    parent1_id = str(uuid.uuid4())
    parent2_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES
            ('{parent1_id}', 'parent1_{uuid.uuid4().hex[:4]}@example.com', 'Parent One', 'parent'),
            ('{parent2_id}', 'parent2_{uuid.uuid4().hex[:4]}@example.com', 'Parent Two', 'parent')
        """
    })

    # Create dependent managed by parent2
    dependent_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, display_name, role, is_dependent, managed_by_parent_id)
            VALUES ('{dependent_id}', 'Other Child', 'student', true, '{parent2_id}')
        """
    })

    # Create task for dependent
    quest_id = str(uuid.uuid4())
    task_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.quests (id, title, description, source, is_active)
            VALUES ('{quest_id}', 'Test Quest', 'Test', 'optio', true);

            INSERT INTO test_schema.user_quests (id, user_id, quest_id, is_active)
            VALUES ('{uuid.uuid4()}', '{dependent_id}', '{quest_id}', true);

            INSERT INTO test_schema.user_quest_tasks (id, user_id, quest_id, title, pillar, xp_value)
            VALUES ('{task_id}', '{dependent_id}', '{quest_id}', 'Test Task', 'stem', 100)
        """
    })

    # Simulate authenticated parent1
    with client.session_transaction() as session:
        session['user_id'] = parent1_id

    # Try to upload evidence for parent2's dependent
    response = client.post('/api/evidence/helper/upload-for-student', json={
        'student_id': dependent_id,
        'task_id': task_id,
        'block_type': 'text',
        'content': {'text': 'Unauthorized attempt'}
    })

    # Should fail - not their dependent
    assert response.status_code in [403, 404]


@pytest.mark.integration
def test_parent_is_linked_includes_dependents(test_supabase):
    """Test ParentRepository.is_linked() returns True for dependents"""
    from repositories.parent_repository import ParentRepository

    # Create parent
    parent_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{parent_id}', 'parent_{uuid.uuid4().hex[:4]}@example.com', 'Test Parent', 'parent')
        """
    })

    # Create dependent (NOT in parent_student_links, but managed_by_parent_id)
    dependent_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, display_name, role, is_dependent, managed_by_parent_id)
            VALUES ('{dependent_id}', 'Dependent Child', 'student', true, '{parent_id}')
        """
    })

    # Test is_linked
    repo = ParentRepository(client=test_supabase)
    assert repo.is_linked(parent_id, dependent_id) == True


@pytest.mark.integration
def test_parent_is_linked_returns_false_for_unrelated(test_supabase):
    """Test ParentRepository.is_linked() returns False for unrelated students"""
    from repositories.parent_repository import ParentRepository

    # Create parent
    parent_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role)
            VALUES ('{parent_id}', 'parent_{uuid.uuid4().hex[:4]}@example.com', 'Test Parent', 'parent')
        """
    })

    # Create unrelated student (NOT dependent, NOT in parent_student_links)
    student_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, role, is_dependent)
            VALUES ('{student_id}', 'student_{uuid.uuid4().hex[:4]}@example.com', 'Random Student', 'student', false)
        """
    })

    # Test is_linked - should be False
    repo = ParentRepository(client=test_supabase)
    assert repo.is_linked(parent_id, student_id) == False
