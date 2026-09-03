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
               '(see .github/workflows/tests-integration.yml, where these run '
               'green and enforcing on every PR).'
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
    blocks the door instead: `_send_via_sendgrid` is the single choke point for
    all outbound mail (SendGrid since 2026-08, same seam the Brevo sender was),
    and brevo_service is the only other thing that writes to the live Brevo
    account (contact/list sync, until the in-house CRM replaces it). A test
    that reaches either one now FAILS AT TEARDOWN naming the recipient.

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
        return None  # the caller's "email failed" path (is None), always handled

    try:
        from services.email_service import EmailService
    except Exception:  # email service unavailable in a stripped test env
        yield
        return

    brevo_stub = Mock()
    brevo_stub.post.side_effect = lambda *a, **k: attempted.append(f'brevo POST {a[0] if a else ""}')
    brevo_stub.put.side_effect = lambda *a, **k: attempted.append(f'brevo PUT {a[0] if a else ""}')

    with patch.object(EmailService, '_send_via_sendgrid', _refuse_email), \
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
#
# These target a THROWAWAY LOCAL SUPABASE STACK (`supabase start`), never a
# hosted project. See backend/tests/integration/README.md for the full story;
# the short version is that the previous fixtures could not work anywhere:
#
#   1. they seeded through `client.rpc('execute_sql', ...)`, and no such
#      function exists in any Optio database;
#   2. they wrote to `test_schema` and tried to redirect reads with an
#      `X-Supabase-Schema` header, which PostgREST ignores (it reads
#      Accept-Profile / Content-Profile), so the app kept reading `public`;
#   3. they authenticated with `session['user_id'] = ...`, but require_auth
#      resolves callers through session_manager, which reads Bearer tokens and
#      httpOnly cookies and never looks at Flask's session.
#
# All three are fixed here by doing the real thing instead of simulating it:
# seed through the ordinary PostgREST client, write to `public`, and mint a
# genuine access token so requests go through the actual verification path.
#
# Isolation comes from the stack being disposable, not from a schema trick. The
# `_reset_db` fixture truncates between tests so ordering never matters.

LOCAL_DB_HOSTS = ('127.0.0.1', 'localhost', 'host.docker.internal', 'kong')


def _assert_local(url: str) -> None:
    """Refuse to run destructive fixtures against anything but a local stack.

    The old integration workflow guarded production with a string check that the
    URL did not contain the prod project ref -- one typo away from a suite that
    inserts users and truncates tables running against real data. This inverts
    it: only an explicitly local host is allowed, so a wrong value fails closed.
    """
    from urllib.parse import urlparse
    host = (urlparse(url).hostname or '').lower()
    if host not in LOCAL_DB_HOSTS:
        pytest.exit(
            f"REFUSING TO RUN: integration fixtures truncate tables, and "
            f"SUPABASE_URL points at '{host}', which is not a local stack "
            f"({', '.join(LOCAL_DB_HOSTS)}). Start one with `supabase start`.",
            returncode=1,
        )


# Tables the integration suite writes to, in reverse dependency order. Truncated
# between tests. `users` is last because almost everything references it.
_RESET_TABLES = (
    'quest_task_completions',
    'user_quest_tasks',
    'user_quests',
    'user_skill_xp',
    'parent_student_links',
    'parent_invitations',
    'observer_comments',
    'advisor_student_assignments',
    'observer_invitation_students',
    'observer_student_links',
    'observer_invitations',
    'login_attempts',
    'parental_consent_log',
    'announcements',
    'quest_invitations',
    'curriculum_lesson_tasks',
    'curriculum_lessons',
    'quests',
    'users',
    'organizations',
)


@pytest.fixture(scope='session')
def db():
    """Service-role client against the local stack.

    Session-scoped: booting the stack is expensive, truncating is not.
    """
    if os.getenv('RUN_DB_INTEGRATION_TESTS', '').lower() not in ('1', 'true', 'yes'):
        pytest.skip(
            'Set RUN_DB_INTEGRATION_TESTS=1 with a local stack running '
            '(`supabase start`). See backend/tests/integration/README.md.'
        )

    from app_config import Config
    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_ROLE_KEY:
        pytest.skip('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.')

    _assert_local(Config.SUPABASE_URL)

    from supabase import create_client
    client = create_client(Config.SUPABASE_URL, Config.SUPABASE_SERVICE_ROLE_KEY)
    return client


@pytest.fixture(autouse=True)
def _reset_db(request):
    """Truncate integration tables before each test that uses the database.

    Autouse, but a no-op for the ~2300 unit tests: it only does work when the
    test actually asked for `db`, so mocked tests pay nothing.
    """
    if 'db' not in request.fixturenames:
        yield
        return

    client = request.getfixturevalue('db')
    _truncate(client)
    yield


def _truncate(client):
    """Empty the integration tables and the auth users they hang off.

    Calls public.test_truncate_all(), installed on the local stack by
    supabase/ci/test_helpers.sql. One round trip, no FK ordering to maintain,
    and no Postgres driver in requirements.txt just for tests.
    """
    try:
        client.rpc('test_truncate_all').execute()
    except Exception as exc:
        pytest.exit(
            "public.test_truncate_all() is missing or failed: "
            f"{exc}\n"
            "Apply supabase/ci/grants.sql and supabase/ci/test_helpers.sql to "
            "the local stack -- see backend/tests/integration/README.md.",
            returncode=1,
        )


@pytest.fixture
def make_user(db):
    """Factory creating a real, logged-in-able user.

    `public.users.id` is FK'd to `auth.users(id)`, so a bare insert into
    `public.users` violates the constraint. This creates the GoTrue user first
    (which is also what makes password login testable) and then the profile row.

    Returns a dict with at least id / email / password / role.
    """
    created = []

    def _make(role='student', email=None, password='TestPassword123!', **fields):
        email = email or f'test_{uuid.uuid4().hex[:12]}@example.com'

        auth_user = db.auth.admin.create_user({
            'email': email,
            'password': password,
            'email_confirm': True,
        })
        user_id = auth_user.user.id

        row = {
            'id': user_id,
            'email': email,
            'first_name': 'Test',
            'last_name': 'User',
            'display_name': 'Test User',
            'role': role,
        }
        row.update(fields)
        db.table('users').insert(row).execute()

        created.append(user_id)
        return {**row, 'password': password}

    yield _make


@pytest.fixture
def auth_headers_for(app):
    """Bearer headers that authenticate as `user_id`, for real.

    session_manager.get_effective_user_id() accepts an Authorization: Bearer
    token and verifies it properly, so this is the genuine auth path rather
    than a patched-out one -- a token this helper mints wrong will fail the
    test, which is the point.

    Bearer also sidesteps CSRF by design (middleware/csrf_protection.py: an
    attacker cannot set the Authorization header cross-site), so ported tests
    do not need to juggle CSRF tokens.
    """
    from utils.session_manager import session_manager

    def _headers(user_id, **extra):
        # generate_access_token reads the request context for a device
        # fingerprint; a test request context supplies one.
        with app.test_request_context():
            token = session_manager.generate_access_token(str(user_id))
        return {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
            **extra,
        }

    return _headers


@pytest.fixture
def student(make_user):
    """A plain platform student."""
    return make_user(role='student')


@pytest.fixture
def parent(make_user):
    """A plain platform parent."""
    return make_user(role='parent')


@pytest.fixture
def make_org(db):
    """An organization, for the org-scoped surfaces (announcements, SIS, quest
    invitations). Slug is unique per call so tests never collide."""
    def _make(name='Test Org', **fields):
        row = {
            'id': str(uuid.uuid4()),
            'name': name,
            'slug': f'test-org-{uuid.uuid4().hex[:10]}',
        }
        row.update(fields)
        db.table('organizations').insert(row).execute()
        return row

    return _make


@pytest.fixture
def make_quest(db):
    """Factory for an active quest.

    quest_type is set explicitly and must stay that way: the column DEFAULT is
    `'custom'::quest_source`, but `check_quest_type` only allows
    optio/course/class, so any insert that omits it dies with 23514. Every
    application call site happens to set it, which is the only reason this
    hasn't surfaced in production -- but a new insert that leans on the default
    will fail, and the error names the constraint rather than the default.
    """
    def _make(**fields):
        row = {
            'id': str(uuid.uuid4()),
            'title': 'Test Quest',
            'description': 'A quest for integration testing',
            'quest_type': 'optio',
            'is_active': True,
        }
        row.update(fields)
        db.table('quests').insert(row).execute()
        return row

    return _make


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