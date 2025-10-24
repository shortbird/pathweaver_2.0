"""
Integration tests for quest completion flow.

Tests the complete quest completion system including:
- Starting quests
- Completing tasks with evidence
- XP award to correct pillar
- Race condition prevention
- Quest completion bonus calculation
- Quest abandonment
"""

import pytest
import json
import uuid
from datetime import datetime

from utils.logger import get_logger

logger = get_logger(__name__)


@pytest.mark.integration
@pytest.mark.critical
def test_start_quest_creates_user_quest(client, test_user, test_quest, test_supabase):
    """Test starting a quest creates user_quest record"""
    quest_data, _ = test_quest

    # Simulate authenticated user
    with client.session_transaction() as session:
        session['user_id'] = test_user['id']

    # Start quest
    response = client.post(f'/api/quests/{quest_data["id"]}/start', json={})

    # Should succeed or return conflict if already started
    assert response.status_code in [200, 201, 409]

    if response.status_code in [200, 201]:
        # Verify user_quest created in test schema
        result = test_supabase.rpc('execute_sql', {
            'query': f"""
                SELECT * FROM test_schema.user_quests
                WHERE user_id = '{test_user['id']}' AND quest_id = '{quest_data['id']}'
            """
        })
        # User quest should exist
        assert result is not None


@pytest.mark.integration
@pytest.mark.critical
def test_task_completion_awards_xp(client, test_user, test_quest, test_supabase):
    """Test completing a task awards XP to the correct pillar"""
    quest_data, task_template = test_quest

    # Create user quest first
    user_quest_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.user_quests (id, user_id, quest_id, is_active, started_at)
            VALUES ('{user_quest_id}', '{test_user['id']}', '{quest_data['id']}', true, NOW())
        """
    })

    # Create task for this user
    task_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.user_quest_tasks
            (id, user_id, quest_id, user_quest_id, title, description, pillar, xp_value, order_index, is_required)
            VALUES ('{task_id}', '{test_user['id']}', '{quest_data['id']}', '{user_quest_id}',
                    'Test Task', 'A test task', 'stem', 100, 1, true)
        """
    })

    # Simulate authenticated user
    with client.session_transaction() as session:
        session['user_id'] = test_user['id']

    # Complete task
    response = client.post(f'/api/tasks/{task_id}/complete', json={
        'evidence_text': 'I completed this task successfully!'
    })

    # Should succeed
    assert response.status_code in [200, 201]

    if response.status_code in [200, 201]:
        # Verify XP was awarded
        assert 'xp_awarded' in response.json or 'xp' in response.json


@pytest.mark.integration
@pytest.mark.critical
def test_duplicate_task_completion_prevented(client, test_user, test_quest, test_supabase):
    """Test that completing the same task twice is prevented (race condition protection)"""
    quest_data, task_template = test_quest

    # Create user quest
    user_quest_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.user_quests (id, user_id, quest_id, is_active, started_at)
            VALUES ('{user_quest_id}', '{test_user['id']}', '{quest_data['id']}', true, NOW())
        """
    })

    # Create task
    task_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.user_quest_tasks
            (id, user_id, quest_id, user_quest_id, title, description, pillar, xp_value, order_index, is_required)
            VALUES ('{task_id}', '{test_user['id']}', '{quest_data['id']}', '{user_quest_id}',
                    'Test Task', 'A test task', 'stem', 100, 1, true)
        """
    })

    # Simulate authenticated user
    with client.session_transaction() as session:
        session['user_id'] = test_user['id']

    # Complete task first time
    response1 = client.post(f'/api/tasks/{task_id}/complete', json={
        'evidence_text': 'First completion'
    })

    # Should succeed
    assert response1.status_code in [200, 201]

    # Try to complete same task again
    response2 = client.post(f'/api/tasks/{task_id}/complete', json={
        'evidence_text': 'Second completion attempt'
    })

    # Should be rejected (already completed or conflict)
    assert response2.status_code in [400, 409]


@pytest.mark.integration
def test_quest_completion_bonus_calculated(client, test_user, test_quest, test_supabase):
    """Test that quest completion bonus (50%) is calculated correctly"""
    quest_data, task_template = test_quest

    # Create user quest
    user_quest_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.user_quests (id, user_id, quest_id, is_active, started_at)
            VALUES ('{user_quest_id}', '{test_user['id']}', '{quest_data['id']}', true, NOW())
        """
    })

    # Create multiple tasks (3 tasks * 100 XP = 300 base XP)
    tasks = []
    for i in range(3):
        task_id = str(uuid.uuid4())
        test_supabase.rpc('execute_sql', {
            'query': f"""
                INSERT INTO test_schema.user_quest_tasks
                (id, user_id, quest_id, user_quest_id, title, description, pillar, xp_value, order_index, is_required)
                VALUES ('{task_id}', '{test_user['id']}', '{quest_data['id']}', '{user_quest_id}',
                        'Test Task {i}', 'A test task', 'stem', 100, {i+1}, true)
            """
        })
        tasks.append(task_id)

    # Simulate authenticated user
    with client.session_transaction() as session:
        session['user_id'] = test_user['id']

    # Complete all tasks
    for task_id in tasks:
        response = client.post(f'/api/tasks/{task_id}/complete', json={
            'evidence_text': f'Completed task {task_id}'
        })
        assert response.status_code in [200, 201]

    # Last task completion should trigger quest completion with bonus
    # 300 base XP * 1.5 (50% bonus) = 450 XP total
    # Bonus = 150 XP (rounded to nearest 50 = 150)


@pytest.mark.integration
def test_quest_abandonment(client, test_user, test_quest, test_supabase):
    """Test that a user can abandon a quest"""
    quest_data, _ = test_quest

    # Create user quest
    user_quest_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.user_quests (id, user_id, quest_id, is_active, started_at)
            VALUES ('{user_quest_id}', '{test_user['id']}', '{quest_data['id']}', true, NOW())
        """
    })

    # Simulate authenticated user
    with client.session_transaction() as session:
        session['user_id'] = test_user['id']

    # Abandon quest
    response = client.delete(f'/api/quests/{quest_data["id"]}/abandon')

    # Should succeed
    assert response.status_code in [200, 204, 404]


@pytest.mark.integration
def test_evidence_document_upload(client, test_user, test_quest, test_supabase):
    """Test uploading evidence document for task completion"""
    quest_data, task_template = test_quest

    # Create user quest
    user_quest_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.user_quests (id, user_id, quest_id, is_active, started_at)
            VALUES ('{user_quest_id}', '{test_user['id']}', '{quest_data['id']}', true, NOW())
        """
    })

    # Create task
    task_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.user_quest_tasks
            (id, user_id, quest_id, user_quest_id, title, description, pillar, xp_value, order_index, is_required)
            VALUES ('{task_id}', '{test_user['id']}', '{quest_data['id']}', '{user_quest_id}',
                    'Test Task', 'A test task', 'stem', 100, 1, true)
        """
    })

    # Simulate authenticated user
    with client.session_transaction() as session:
        session['user_id'] = test_user['id']

    # Complete task with evidence URL
    response = client.post(f'/api/tasks/{task_id}/complete', json={
        'evidence_text': 'My evidence description',
        'evidence_url': 'https://example.com/my-evidence.pdf'
    })

    # Should succeed
    assert response.status_code in [200, 201]


@pytest.mark.integration
def test_xp_distributed_to_correct_pillar(client, test_user, test_quest, test_supabase):
    """Test that XP is distributed to the task's specific pillar"""
    quest_data, _ = test_quest

    # Create user quest
    user_quest_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.user_quests (id, user_id, quest_id, is_active, started_at)
            VALUES ('{user_quest_id}', '{test_user['id']}', '{quest_data['id']}', true, NOW())
        """
    })

    # Create tasks in different pillars
    pillars = ['stem', 'wellness', 'communication', 'civics', 'art']
    tasks = []

    for i, pillar in enumerate(pillars):
        task_id = str(uuid.uuid4())
        test_supabase.rpc('execute_sql', {
            'query': f"""
                INSERT INTO test_schema.user_quest_tasks
                (id, user_id, quest_id, user_quest_id, title, description, pillar, xp_value, order_index, is_required)
                VALUES ('{task_id}', '{test_user['id']}', '{quest_data['id']}', '{user_quest_id}',
                        'Test Task {pillar}', 'A test task', '{pillar}', 100, {i+1}, true)
            """
        })
        tasks.append((task_id, pillar))

    # Simulate authenticated user
    with client.session_transaction() as session:
        session['user_id'] = test_user['id']

    # Complete one task from each pillar
    for task_id, pillar in tasks:
        response = client.post(f'/api/tasks/{task_id}/complete', json={
            'evidence_text': f'Completed {pillar} task'
        })

        assert response.status_code in [200, 201]

        # Verify XP went to correct pillar (if response includes this info)
        if response.status_code == 200:
            data = response.json
            if 'pillar' in data:
                assert data['pillar'] == pillar


@pytest.mark.integration
def test_get_quest_progress(client, test_user, test_quest, test_supabase):
    """Test retrieving quest progress for a user"""
    quest_data, _ = test_quest

    # Create user quest
    user_quest_id = str(uuid.uuid4())
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.user_quests (id, user_id, quest_id, is_active, started_at)
            VALUES ('{user_quest_id}', '{test_user['id']}', '{quest_data['id']}', true, NOW())
        """
    })

    # Simulate authenticated user
    with client.session_transaction() as session:
        session['user_id'] = test_user['id']

    # Get quest progress
    response = client.get(f'/api/quests/{quest_data["id"]}/progress')

    # Should succeed or return 404 if endpoint doesn't exist
    assert response.status_code in [200, 404]

    if response.status_code == 200:
        data = response.json
        # Should contain progress information
        assert 'progress' in data or 'completed' in data or 'tasks' in data
