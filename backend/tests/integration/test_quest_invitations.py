"""
Integration tests for Quest Invitation System.

Tests the complete quest invitation system including:
- Creating invitations (advisors only)
- Accepting invitations (students only)
- Declining invitations (students only)
- Listing invitations (advisor and student views)
- RLS policy enforcement (organization isolation)
- Role-based access control
- Edge cases: expired invitations, duplicates, invalid IDs
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
def test_advisor_create_quest_invitation_success(client, test_supabase):
    """Test advisor can create quest invitation"""
    # Create advisor and student users in same organization
    org_id = str(uuid.uuid4())
    advisor_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    quest_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.organizations (id, name, slug, is_active)
            VALUES ('{org_id}', 'Test School', 'test-school', true);

            INSERT INTO test_schema.users (id, email, display_name, first_name, last_name, role, organization_id)
            VALUES
                ('{advisor_id}', 'advisor@school.com', 'Ms. Advisor', 'Ms.', 'Advisor', 'advisor', '{org_id}'),
                ('{student_id}', 'student@school.com', 'Student Test', 'Student', 'Test', 'student', '{org_id}');

            INSERT INTO test_schema.quests (id, title, quest_type, organization_id, is_active)
            VALUES ('{quest_id}', 'Test Quest', 'sample_tasks', '{org_id}', true);
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = advisor_id

    # Create invitation
    response = client.post('/api/quest-invitations', json={
        'quest_id': quest_id,
        'student_id': student_id,
        'message': 'I think you would enjoy this quest!'
    })

    assert response.status_code == 201
    assert response.json['status'] == 'success'
    assert 'invitation_id' in response.json
    assert response.json['quest_id'] == quest_id
    assert response.json['student_id'] == student_id


@pytest.mark.integration
def test_student_cannot_create_quest_invitation(client, test_supabase):
    """Test students cannot create quest invitations (advisors only)"""
    org_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    quest_id = str(uuid.uuid4())
    other_student_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.organizations (id, name, slug, is_active)
            VALUES ('{org_id}', 'Test School', 'test-school', true);

            INSERT INTO test_schema.users (id, email, display_name, role, organization_id)
            VALUES
                ('{student_id}', 'student@school.com', 'Student Test', 'student', '{org_id}'),
                ('{other_student_id}', 'other@school.com', 'Other Student', 'student', '{org_id}');

            INSERT INTO test_schema.quests (id, title, quest_type, organization_id, is_active)
            VALUES ('{quest_id}', 'Test Quest', 'sample_tasks', '{org_id}', true);
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = student_id

    # Attempt to create invitation (should fail)
    response = client.post('/api/quest-invitations', json={
        'quest_id': quest_id,
        'student_id': other_student_id,
        'message': 'Try this quest!'
    })

    assert response.status_code == 403
    assert 'permission' in response.json.get('error', '').lower() or 'advisor' in response.json.get('error', '').lower()


@pytest.mark.integration
def test_advisor_cannot_invite_student_from_different_org(client, test_supabase):
    """Test RLS: advisor cannot invite students from other organizations"""
    org1_id = str(uuid.uuid4())
    org2_id = str(uuid.uuid4())
    advisor_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    quest_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.organizations (id, name, slug, is_active)
            VALUES
                ('{org1_id}', 'School A', 'school-a', true),
                ('{org2_id}', 'School B', 'school-b', true);

            INSERT INTO test_schema.users (id, email, display_name, role, organization_id)
            VALUES
                ('{advisor_id}', 'advisor@schoola.com', 'Ms. Advisor', 'advisor', '{org1_id}'),
                ('{student_id}', 'student@schoolb.com', 'Student Test', 'student', '{org2_id}');

            INSERT INTO test_schema.quests (id, title, quest_type, organization_id, is_active)
            VALUES ('{quest_id}', 'Test Quest', 'sample_tasks', '{org1_id}', true);
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = advisor_id

    # Attempt to invite student from different org (should fail)
    response = client.post('/api/quest-invitations', json={
        'quest_id': quest_id,
        'student_id': student_id,
        'message': 'Try this quest!'
    })

    assert response.status_code in [400, 403, 404]


@pytest.mark.integration
def test_student_accept_quest_invitation(client, test_supabase):
    """Test student can accept quest invitation"""
    org_id = str(uuid.uuid4())
    advisor_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    quest_id = str(uuid.uuid4())
    invitation_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.organizations (id, name, slug, is_active)
            VALUES ('{org_id}', 'Test School', 'test-school', true);

            INSERT INTO test_schema.users (id, email, display_name, role, organization_id)
            VALUES
                ('{advisor_id}', 'advisor@school.com', 'Ms. Advisor', 'advisor', '{org_id}'),
                ('{student_id}', 'student@school.com', 'Student Test', 'student', '{org_id}');

            INSERT INTO test_schema.quests (id, title, quest_type, organization_id, is_active)
            VALUES ('{quest_id}', 'Test Quest', 'sample_tasks', '{org_id}', true);

            INSERT INTO test_schema.quest_invitations (id, quest_id, advisor_id, student_id, status, created_at)
            VALUES ('{invitation_id}', '{quest_id}', '{advisor_id}', '{student_id}', 'pending', NOW());
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = student_id

    # Accept invitation
    response = client.post(f'/api/quest-invitations/{invitation_id}/accept', json={})

    assert response.status_code == 200
    assert response.json['status'] == 'accepted'


@pytest.mark.integration
def test_student_decline_quest_invitation(client, test_supabase):
    """Test student can decline quest invitation"""
    org_id = str(uuid.uuid4())
    advisor_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    quest_id = str(uuid.uuid4())
    invitation_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.organizations (id, name, slug, is_active)
            VALUES ('{org_id}', 'Test School', 'test-school', true);

            INSERT INTO test_schema.users (id, email, display_name, role, organization_id)
            VALUES
                ('{advisor_id}', 'advisor@school.com', 'Ms. Advisor', 'advisor', '{org_id}'),
                ('{student_id}', 'student@school.com', 'Student Test', 'student', '{org_id}');

            INSERT INTO test_schema.quests (id, title, quest_type, organization_id, is_active)
            VALUES ('{quest_id}', 'Test Quest', 'sample_tasks', '{org_id}', true);

            INSERT INTO test_schema.quest_invitations (id, quest_id, advisor_id, student_id, status, created_at)
            VALUES ('{invitation_id}', '{quest_id}', '{advisor_id}', '{student_id}', 'pending', NOW());
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = student_id

    # Decline invitation
    response = client.post(f'/api/quest-invitations/{invitation_id}/decline', json={})

    assert response.status_code == 200
    assert response.json['status'] == 'declined'


@pytest.mark.integration
def test_student_cannot_accept_expired_invitation(client, test_supabase):
    """Test student cannot accept expired invitation"""
    org_id = str(uuid.uuid4())
    advisor_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    quest_id = str(uuid.uuid4())
    invitation_id = str(uuid.uuid4())

    # Create invitation that expired 1 day ago
    expired_date = (datetime.utcnow() - timedelta(days=31)).isoformat()

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.organizations (id, name, slug, is_active)
            VALUES ('{org_id}', 'Test School', 'test-school', true);

            INSERT INTO test_schema.users (id, email, display_name, role, organization_id)
            VALUES
                ('{advisor_id}', 'advisor@school.com', 'Ms. Advisor', 'advisor', '{org_id}'),
                ('{student_id}', 'student@school.com', 'Student Test', 'student', '{org_id}');

            INSERT INTO test_schema.quests (id, title, quest_type, organization_id, is_active)
            VALUES ('{quest_id}', 'Test Quest', 'sample_tasks', '{org_id}', true);

            INSERT INTO test_schema.quest_invitations (id, quest_id, advisor_id, student_id, status, created_at)
            VALUES ('{invitation_id}', '{quest_id}', '{advisor_id}', '{student_id}', 'pending', '{expired_date}');
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = student_id

    # Attempt to accept expired invitation (should fail)
    response = client.post(f'/api/quest-invitations/{invitation_id}/accept', json={})

    assert response.status_code in [400, 403]
    assert 'expired' in response.json.get('error', '').lower()


@pytest.mark.integration
def test_prevent_duplicate_quest_invitations(client, test_supabase):
    """Test advisor cannot send duplicate invitation for same quest to same student"""
    org_id = str(uuid.uuid4())
    advisor_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    quest_id = str(uuid.uuid4())
    invitation_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.organizations (id, name, slug, is_active)
            VALUES ('{org_id}', 'Test School', 'test-school', true);

            INSERT INTO test_schema.users (id, email, display_name, role, organization_id)
            VALUES
                ('{advisor_id}', 'advisor@school.com', 'Ms. Advisor', 'advisor', '{org_id}'),
                ('{student_id}', 'student@school.com', 'Student Test', 'student', '{org_id}');

            INSERT INTO test_schema.quests (id, title, quest_type, organization_id, is_active)
            VALUES ('{quest_id}', 'Test Quest', 'sample_tasks', '{org_id}', true);

            -- Existing pending invitation
            INSERT INTO test_schema.quest_invitations (id, quest_id, advisor_id, student_id, status, created_at)
            VALUES ('{invitation_id}', '{quest_id}', '{advisor_id}', '{student_id}', 'pending', NOW());
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = advisor_id

    # Attempt to create duplicate invitation (should fail)
    response = client.post('/api/quest-invitations', json={
        'quest_id': quest_id,
        'student_id': student_id,
        'message': 'Try this quest!'
    })

    assert response.status_code in [400, 409]
    assert 'duplicate' in response.json.get('error', '').lower() or 'already' in response.json.get('error', '').lower()


@pytest.mark.integration
def test_advisor_list_sent_invitations(client, test_supabase):
    """Test advisor can list invitations they sent"""
    org_id = str(uuid.uuid4())
    advisor_id = str(uuid.uuid4())
    student1_id = str(uuid.uuid4())
    student2_id = str(uuid.uuid4())
    quest_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.organizations (id, name, slug, is_active)
            VALUES ('{org_id}', 'Test School', 'test-school', true);

            INSERT INTO test_schema.users (id, email, display_name, role, organization_id)
            VALUES
                ('{advisor_id}', 'advisor@school.com', 'Ms. Advisor', 'advisor', '{org_id}'),
                ('{student1_id}', 'student1@school.com', 'Student One', 'student', '{org_id}'),
                ('{student2_id}', 'student2@school.com', 'Student Two', 'student', '{org_id}');

            INSERT INTO test_schema.quests (id, title, quest_type, organization_id, is_active)
            VALUES ('{quest_id}', 'Test Quest', 'sample_tasks', '{org_id}', true);

            INSERT INTO test_schema.quest_invitations (quest_id, advisor_id, student_id, status, created_at)
            VALUES
                ('{quest_id}', '{advisor_id}', '{student1_id}', 'pending', NOW()),
                ('{quest_id}', '{advisor_id}', '{student2_id}', 'accepted', NOW());
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = advisor_id

    # List sent invitations
    response = client.get('/api/quest-invitations/sent')

    assert response.status_code == 200
    assert len(response.json['invitations']) >= 2


@pytest.mark.integration
def test_student_list_received_invitations(client, test_supabase):
    """Test student can list invitations they received"""
    org_id = str(uuid.uuid4())
    advisor_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    quest1_id = str(uuid.uuid4())
    quest2_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.organizations (id, name, slug, is_active)
            VALUES ('{org_id}', 'Test School', 'test-school', true);

            INSERT INTO test_schema.users (id, email, display_name, role, organization_id)
            VALUES
                ('{advisor_id}', 'advisor@school.com', 'Ms. Advisor', 'advisor', '{org_id}'),
                ('{student_id}', 'student@school.com', 'Student Test', 'student', '{org_id}');

            INSERT INTO test_schema.quests (id, title, quest_type, organization_id, is_active)
            VALUES
                ('{quest1_id}', 'Quest One', 'sample_tasks', '{org_id}', true),
                ('{quest2_id}', 'Quest Two', 'sample_tasks', '{org_id}', true);

            INSERT INTO test_schema.quest_invitations (quest_id, advisor_id, student_id, status, created_at)
            VALUES
                ('{quest1_id}', '{advisor_id}', '{student_id}', 'pending', NOW()),
                ('{quest2_id}', '{advisor_id}', '{student_id}', 'pending', NOW());
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = student_id

    # List received invitations
    response = client.get('/api/quest-invitations/received')

    assert response.status_code == 200
    assert len(response.json['invitations']) >= 2


@pytest.mark.integration
def test_student_cannot_see_other_students_invitations(client, test_supabase):
    """Test RLS: students only see their own invitations"""
    org_id = str(uuid.uuid4())
    advisor_id = str(uuid.uuid4())
    student1_id = str(uuid.uuid4())
    student2_id = str(uuid.uuid4())
    quest_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.organizations (id, name, slug, is_active)
            VALUES ('{org_id}', 'Test School', 'test-school', true);

            INSERT INTO test_schema.users (id, email, display_name, role, organization_id)
            VALUES
                ('{advisor_id}', 'advisor@school.com', 'Ms. Advisor', 'advisor', '{org_id}'),
                ('{student1_id}', 'student1@school.com', 'Student One', 'student', '{org_id}'),
                ('{student2_id}', 'student2@school.com', 'Student Two', 'student', '{org_id}');

            INSERT INTO test_schema.quests (id, title, quest_type, organization_id, is_active)
            VALUES ('{quest_id}', 'Test Quest', 'sample_tasks', '{org_id}', true);

            -- Invitation for student2
            INSERT INTO test_schema.quest_invitations (quest_id, advisor_id, student_id, status, created_at)
            VALUES ('{quest_id}', '{advisor_id}', '{student2_id}', 'pending', NOW());
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = student1_id

    # Student1 lists invitations (should not see student2's invitation)
    response = client.get('/api/quest-invitations/received')

    assert response.status_code == 200
    assert len(response.json['invitations']) == 0


@pytest.mark.integration
def test_invalid_quest_id_fails(client, test_supabase):
    """Test creating invitation with invalid quest ID fails"""
    org_id = str(uuid.uuid4())
    advisor_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    invalid_quest_id = str(uuid.uuid4())

    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.organizations (id, name, slug, is_active)
            VALUES ('{org_id}', 'Test School', 'test-school', true);

            INSERT INTO test_schema.users (id, email, display_name, role, organization_id)
            VALUES
                ('{advisor_id}', 'advisor@school.com', 'Ms. Advisor', 'advisor', '{org_id}'),
                ('{student_id}', 'student@school.com', 'Student Test', 'student', '{org_id}');
        """
    })

    with client.session_transaction() as session:
        session['user_id'] = advisor_id

    # Attempt to create invitation with invalid quest ID
    response = client.post('/api/quest-invitations', json={
        'quest_id': invalid_quest_id,
        'student_id': student_id,
        'message': 'Try this quest!'
    })

    assert response.status_code in [400, 404]
    assert 'quest' in response.json.get('error', '').lower()
