"""Pytest configuration and fixtures"""

import pytest
import os
import sys
import uuid
from unittest.mock import Mock, patch
from datetime import datetime

from utils.logger import get_logger

logger = get_logger(__name__)

# Add backend directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Set testing environment
os.environ['FLASK_ENV'] = 'testing'
os.environ['TEST_SCHEMA'] = 'test_schema'

def pytest_collection_modifyitems(config, items):
    """Skip `requires_db` tests unless a real database is available.

    These drive the real Flask app end-to-end -- /api/health pings Supabase,
    login and profile reads hit PostgREST -- so they cannot pass against mocks
    or an unreachable URL. Rather than leaving them permanently red (which is
    what made the whole suite unreadable and kept `|| true` in release.yml),
    they skip by default and run wherever RUN_DB_INTEGRATION_TESTS=1 is set
    with a live stack behind it.
    """
    if os.getenv('RUN_DB_INTEGRATION_TESTS', '').lower() in ('1', 'true', 'yes'):
        return

    skip_db = pytest.mark.skip(
        reason='Needs a live database. Set RUN_DB_INTEGRATION_TESTS=1 with '
               'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY pointing at a real stack '
               '(see .github/workflows/integration-tests.yml).'
    )
    for item in items:
        if 'requires_db' in item.keywords:
            item.add_marker(skip_db)


@pytest.fixture(autouse=True)
def _no_outbound_email():
    """The test suite may not send mail or touch the live Brevo account.

    On 2026-08-06 a run of the full backend suite delivered real
    "Your Optio account now has teacher access" emails to `real@example.com`,
    the fixture address in test_sis_staff_link. The merge path of
    link_staff_account calls send_staff_access_added_email, that test never
    patched it, and a local .env carrying the production BREVO_API_KEY did the
    rest. Every full-suite run sent another batch.

    Patching the individual call in that one test would fix that one test. This
    blocks the door instead: `_send_via_brevo` is the single choke point for all
    transactional mail, and brevo_service is the only other thing that writes to
    the Brevo account (contact/list sync). A test that reaches either one now
    FAILS AT TEARDOWN naming the recipient.

    Teardown, not on the spot: send_email wraps everything in `except Exception:
    return False`, so raising here would be swallowed and the guard would go
    quiet exactly when it mattered. Recording the attempt and failing afterwards
    can't be caught by the code under test.

    A test that genuinely means to exercise the wire can mark itself
    `@pytest.mark.sends_real_email`, but prefer patching the send.
    """
    attempted = []

    def _refuse_email(_self, payload):
        recipients = payload.get('to') or []
        addresses = [r.get('email') for r in recipients if isinstance(r, dict)]
        attempted.append(f"{payload.get('subject') or '(no subject)'} -> "
                         f"{', '.join(a for a in addresses if a) or '(unknown)'}")
        return False  # the caller's "email failed" path, which is always handled

    try:
        from services.email_service import EmailService
    except Exception:  # email service unavailable in a stripped test env
        yield
        return

    brevo_stub = Mock()
    brevo_stub.post.side_effect = lambda *a, **k: attempted.append(f'brevo POST {a[0] if a else ""}')
    brevo_stub.put.side_effect = lambda *a, **k: attempted.append(f'brevo PUT {a[0] if a else ""}')

    with patch.object(EmailService, '_send_via_brevo', _refuse_email), \
         patch('services.brevo_service.requests', brevo_stub):
        yield

    if attempted:
        pytest.fail(
            'This test tried to send real email / write to the live Brevo account:\n  '
            + '\n  '.join(attempted)
            + '\n\nPatch the send in the test (e.g. patch '
              '"services.email_service.email_service.send_staff_access_added_email"). '
              'See the _no_outbound_email fixture.'
        )


@pytest.fixture(autouse=True)
def _reset_rate_limiter_state():
    """Stop rate-limit counters leaking between tests.

    middleware.rate_limiter keeps an in-memory defaultdict keyed by
    "<ip-or-user>:<endpoint>". It is module-level, so without clearing it a
    test that exercises an endpoint N times leaves those counts in place and
    the NEXT test touching the same endpoint starts partway to its limit --
    which shows up as an unrelated test asserting 404 and getting 429. Order
    dependent, and only visible once the suite actually runs.
    """
    try:
        from middleware.rate_limiter import rate_limiter
    except Exception:  # middleware unavailable in a stripped test env
        yield
        return

    rate_limiter.requests.clear()
    if hasattr(rate_limiter, 'blocked_ips'):
        rate_limiter.blocked_ips.clear()
    yield
    rate_limiter.requests.clear()
    if hasattr(rate_limiter, 'blocked_ips'):
        rate_limiter.blocked_ips.clear()


@pytest.fixture
def app():
    """Create and configure a test app instance"""
    # Import app only when fixture is used (lazy import to avoid hanging on conftest load)
    from app import app as flask_app
    from app_config import TestingConfig

    flask_app.config.from_object(TestingConfig)
    flask_app.config['TESTING'] = True

    # Create application context
    with flask_app.app_context():
        yield flask_app

@pytest.fixture
def client(app):
    """Create a test client"""
    return app.test_client()

@pytest.fixture
def auth_headers():
    """Create mock authentication headers"""
    return {
        'Authorization': 'Bearer test-token-123',
        'Content-Type': 'application/json'
    }

@pytest.fixture
def mock_supabase():
    """Mock Supabase client"""
    with patch('database.get_supabase_client') as mock:
        supabase_mock = Mock()
        mock.return_value = supabase_mock
        yield supabase_mock

@pytest.fixture
def mock_auth_supabase():
    """Mock authenticated Supabase client"""
    with patch('database.get_authenticated_supabase_client') as mock:
        supabase_mock = Mock()
        mock.return_value = supabase_mock
        yield supabase_mock

@pytest.fixture
def sample_user():
    """Sample user data"""
    return {
        'id': 'test-user-123',
        'email': 'test@example.com',
        'display_name': 'Test User',
        'role': 'student',
        'created_at': '2024-01-01T00:00:00Z'
    }

@pytest.fixture
def sample_quest():
    """Sample quest data"""
    return {
        'id': 'quest-123',
        'title': 'Sample Quest',
        'description': 'This is a sample quest for testing',
        'primary_skill': 'creativity',
        'difficulty_level': 'beginner',
        'estimated_time_minutes': 30,
        'xp_reward': 100,
        'is_published': True,
        'created_at': '2024-01-01T00:00:00Z'
    }

@pytest.fixture
def sample_quest_submission():
    """Sample quest submission data"""
    return {
        'quest_id': 'quest-123',
        'evidence': 'Here is my completed work',
        'reflection': 'I learned a lot from this quest',
        'time_spent_minutes': 45
    }

@pytest.fixture
def mock_verify_token():
    """Mock token verification (both legacy and session_manager paths)"""
    with patch('utils.auth.token_utils.verify_token') as legacy_mock, \
         patch('utils.session_manager.session_manager.verify_access_token') as sm_mock, \
         patch('utils.session_manager.session_manager.verify_acting_as_token') as acting_mock, \
         patch('utils.session_manager.session_manager.verify_masquerade_token') as mq_mock:
        legacy_mock.return_value = 'test-user-123'
        sm_mock.return_value = {'user_id': 'test-user-123'}
        acting_mock.return_value = None
        mq_mock.return_value = None
        yield legacy_mock

@pytest.fixture
def admin_user():
    """Sample admin user data"""
    return {
        'id': 'admin-user-123',
        'email': 'admin@example.com',
        'display_name': 'Admin User',
        'role': 'admin',
        'created_at': '2024-01-01T00:00:00Z'
    }

# Real Database Fixtures for Integration Tests

@pytest.fixture(scope='session')
def test_supabase():
    """Get Supabase client configured for test schema.

    These are true integration tests: they need a live Supabase project holding
    a `test_schema`. Two things were wrong here.

    First, get_supabase_admin_client() caches on Flask's `g`, so it needs an
    application context -- which this session-scoped fixture never created, and
    cannot get from the function-scoped `app` fixture. It now pushes its own.

    Second, with no database configured the fixture raised, which pytest reports
    as an ERROR. CI has no Supabase credentials, so that was 158 permanent
    errors -- exactly the noise that let real breakage hide (and that the
    `|| true` in release.yml was papering over). It now SKIPs, which is the
    truthful result: not run, as opposed to broken.

    The gate is an explicit opt-in rather than "are credentials set", because
    unit tests need placeholder credentials just to construct a client against
    mocks. Only RUN_DB_INTEGRATION_TESTS=1 means "there is a real database here
    and I mean to write to it".
    """
    from database import get_supabase_admin_client
    from app_config import Config

    if os.getenv('RUN_DB_INTEGRATION_TESTS', '').lower() not in ('1', 'true', 'yes'):
        pytest.skip(
            'Set RUN_DB_INTEGRATION_TESTS=1 (with SUPABASE_URL, '
            'SUPABASE_SERVICE_ROLE_KEY and a test_schema) to run tests that '
            'read and write a real database.'
        )

    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_ROLE_KEY:
        pytest.skip(
            'RUN_DB_INTEGRATION_TESTS is set but SUPABASE_URL / '
            'SUPABASE_SERVICE_ROLE_KEY are missing.'
        )

    from app import app as flask_app

    with flask_app.app_context():
        client = get_supabase_admin_client()

        # Set search path to test schema for this session
        test_schema = os.getenv('TEST_SCHEMA', 'test_schema')
        client.postgrest.session.headers['X-Supabase-Schema'] = test_schema

        yield client

        # Cleanup: Clear all test data after session
        try:
            # Delete test data from all tables (in reverse dependency order)
            tables = [
                'quest_task_completions', 'user_quest_tasks', 'user_quests',
                'user_skill_xp',
                'parent_student_links', 'parent_invitations', 'login_attempts',
                'tutor_messages', 'tutor_conversations', 'badges', 'quests', 'users'
            ]
            for table in tables:
                client.rpc('execute_sql', {
                    'query': f'DELETE FROM test_schema.{table}'
                })
        except Exception as e:
            logger.warning(f"Cleanup warning: {e}")

@pytest.fixture
def test_user(test_supabase):
    """Create real test user in test schema"""
    user_id = str(uuid.uuid4())
    user_data = {
        'id': user_id,
        'email': f'test_{uuid.uuid4().hex[:8]}@example.com',
        'display_name': 'Test User',
        'first_name': 'Test',
        'last_name': 'User',
        'role': 'student',
    }

    # Insert into test schema
    result = test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.users (id, email, display_name, first_name, last_name, role)
            VALUES ('{user_data['id']}', '{user_data['email']}', '{user_data['display_name']}',
                    '{user_data['first_name']}', '{user_data['last_name']}', '{user_data['role']}')
            RETURNING *;
        """
    })

    yield user_data

    # Cleanup handled by session fixture

@pytest.fixture
def test_quest(test_supabase):
    """Create real test quest with tasks in test schema"""
    quest_id = str(uuid.uuid4())
    quest_data = {
        'id': quest_id,
        'title': 'Test Quest',
        'description': 'A test quest for integration testing',
        'source': 'optio',
        'is_active': True,
    }

    # Insert quest
    test_supabase.rpc('execute_sql', {
        'query': f"""
            INSERT INTO test_schema.quests (id, title, description, source, is_active)
            VALUES ('{quest_data['id']}', '{quest_data['title']}', '{quest_data['description']}',
                    '{quest_data['source']}', {quest_data['is_active']})
            RETURNING *;
        """
    })

    # Create sample task data (will be inserted per-user in tests)
    task_template = {
        'id': str(uuid.uuid4()),
        'quest_id': quest_id,
        'title': 'Test Task',
        'description': 'A test task',
        'pillar': 'stem',
        'xp_value': 100,
        'order_index': 1,
        'is_required': False,
    }

    yield quest_data, task_template

    # Cleanup handled by session fixture

@pytest.fixture
def authenticated_client(client, test_user):
    """Flask test client with authentication cookies set"""
    # Simulate login to set session
    with client.session_transaction() as session:
        session['user_id'] = test_user['id']

    return client

# Additional Fixtures for Optio Platform

@pytest.fixture
def sample_organization():
    """Sample organization data"""
    return {
        'id': str(uuid.uuid4()),
        'name': 'Test High School',
        'slug': 'test-high-school',
        'quest_visibility_policy': 'all',
        'is_active': True,
        'branding_config': {
            'primary_color': '#8B5CF6',
            'logo_url': None
        }
    }

@pytest.fixture
def sample_badge():
    """Sample badge data"""
    return {
        'id': str(uuid.uuid4()),
        'name': 'STEM Explorer',
        'description': 'Complete STEM quests to earn this badge',
        'pillar_primary': 'stem',
        'min_quests': 3,
        'min_xp': 300,
        'image_url': 'https://example.com/badge.png'
    }

@pytest.fixture
def sample_task():
    """Sample task data"""
    return {
        'id': str(uuid.uuid4()),
        'quest_id': 'quest-123',
        'user_id': 'test-user-123',
        'title': 'Complete the assignment',
        'description': 'Submit your work',
        'pillar': 'stem',
        'xp_value': 100,
        'approval_status': 'pending',
        'is_required': False
    }

@pytest.fixture
def sample_task_completion():
    """Sample task completion data"""
    return {
        'id': str(uuid.uuid4()),
        'user_id': 'test-user-123',
        'quest_id': 'quest-123',
        'task_id': 'task-123',
        'xp_awarded': 100,
        'completed_at': datetime.utcnow().isoformat(),
        'evidence_text': 'Here is my completed work',
        'evidence_url': 'https://example.com/evidence.pdf'
    }

@pytest.fixture
def parent_user():
    """Sample parent user data"""
    return {
        'id': 'parent-user-123',
        'email': 'parent@example.com',
        'display_name': 'Parent User',
        'role': 'parent',
        'created_at': '2024-01-01T00:00:00Z'
    }

@pytest.fixture
def observer_user():
    """Sample observer user data (NEW Jan 2025)"""
    return {
        'id': 'observer-user-123',
        'email': 'observer@example.com',
        'display_name': 'Observer User',
        'role': 'observer',
        'created_at': '2025-01-01T00:00:00Z'
    }

@pytest.fixture
def sample_dependent():
    """Sample dependent profile data (NEW Jan 2025)"""
    return {
        'id': 'dependent-user-123',
        'display_name': 'Child User',
        'role': 'student',
        'is_dependent': True,
        'managed_by_parent_id': 'parent-user-123',
        'date_of_birth': '2015-06-15',
        'promotion_eligible_at': '2028-06-15',  # Age 13
        'created_at': '2024-01-01T00:00:00Z'
    }

@pytest.fixture
def sample_parent_student_link():
    """Sample parent-student relationship"""
    return {
        'id': str(uuid.uuid4()),
        'parent_id': 'parent-user-123',
        'student_id': 'test-user-123',
        'relationship_type': 'parent',
        'created_at': '2024-01-01T00:00:00Z'
    }

@pytest.fixture
def sample_friendship():
    """Sample friendship/connection data"""
    return {
        'id': str(uuid.uuid4()),
        'requester_id': 'test-user-123',
        'addressee_id': 'test-user-456',
        'status': 'pending',
        'created_at': '2024-01-01T00:00:00Z'
    }

@pytest.fixture
def mock_gemini_response():
    """Mock Gemini AI response"""
    return {
        'success': True,
        'message': 'This is a helpful response from the AI tutor.',
        'safety_flag': False,
        'tokens_used': 150
    }

@pytest.fixture
def mock_email_service():
    """Mock email service"""
    with patch('services.email_service.EmailService.send_templated_email') as mock:
        mock.return_value = {'success': True, 'message_id': 'test-message-123'}
        yield mock