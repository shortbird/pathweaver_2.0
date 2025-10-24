# Testing Guide

## Overview

Backend tests run in **GitHub Actions** with **manual trigger** using a dedicated **test_schema** in the existing Supabase database. Tests are **completely independent** of the deployment pipeline - the develop branch auto-deploys to Render regardless of test status.

## Quick Start

### Running Tests Manually

1. Go to **[GitHub Actions](https://github.com/{your-org}/{your-repo}/actions)** (replace with actual repo URL)
2. Select **"Run Backend Tests (Manual)"** workflow
3. Click **"Run workflow"** button
4. Configure options:
   - **Coverage threshold**: Minimum percentage required (default: 40%)
5. Click green **"Run workflow"** button
6. Wait ~2-3 minutes for results
7. **Download coverage report** from artifacts at the bottom of the workflow run

**Important:** Tests are optional quality checks. The develop branch deploys to Render automatically, regardless of whether you run tests.

---

## Test Infrastructure

### Test Database

**Separate schema** in existing Supabase database:
- **Schema name**: `test_schema`
- **Location**: Same Supabase project as production
- **Isolation**: Complete table separation from `public` schema
- **Cost**: **$0** (no separate database needed)
- **Tables**: Mirror of all production tables

**Benefits:**
- Zero additional cost
- Same connection, different schema
- Proper isolation from dev/prod data
- Easy cleanup between test runs

### Environment Variables

Tests use existing database credentials with schema override:
```bash
FLASK_ENV=testing
TEST_SCHEMA=test_schema
SUPABASE_URL={same as production}
SUPABASE_ANON_KEY={same as production}
SUPABASE_SERVICE_KEY={same as production}
FLASK_SECRET_KEY={same as production}
```

### GitHub Actions Workflow

**File**: `.github/workflows/run-tests.yml`

**Trigger**: Manual only (`workflow_dispatch`)

**Runtime**: ~2-3 minutes

**Artifacts**: Coverage reports (HTML) retained for 30 days

---

## Test Structure

```
backend/tests/
├── conftest.py              # Shared fixtures for all tests
├── unit/                    # Fast, mocked tests
│   ├── test_auth.py         # Authentication unit tests
│   └── test_xp_calculation.py  # XP calculation unit tests
├── integration/             # Real database tests
│   ├── test_auth_flow.py          # Auth flow integration (~150 lines)
│   ├── test_quest_completion.py   # Quest completion (~200 lines)
│   └── test_parent_dashboard.py   # Parent dashboard (~150 lines)
├── services/                # Service layer tests
│   ├── test_atomic_quest_service.py  # Atomic operations (~180 lines)
│   └── test_xp_service.py            # XP service (~120 lines)
└── repositories/            # Repository pattern tests
    └── test_user_repository.py       # User repository (~100 lines)
```

**Total test code**: ~900 lines covering critical paths

---

## Test Markers

Use pytest markers to categorize tests:

```python
@pytest.mark.unit         # Fast, mocked dependencies
@pytest.mark.integration  # Real database access
@pytest.mark.critical     # Must pass for production
@pytest.mark.slow         # Takes >1 second
```

**Run specific markers:**
```bash
pytest -m unit           # Only unit tests
pytest -m critical       # Only critical tests
pytest -m "not slow"     # Skip slow tests
```

---

## Writing Tests

### Example: Integration Test

```python
import pytest
import uuid

@pytest.mark.integration
@pytest.mark.critical
def test_task_completion_awards_xp(client, test_user, test_quest, test_supabase):
    """Test completing a task awards XP correctly"""
    quest_data, task_template = test_quest

    # Create user quest in test_schema
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

    # Complete task
    response = client.post(f'/api/tasks/{task_id}/complete', json={
        'evidence_text': 'I completed this task successfully!'
    })

    assert response.status_code == 200
    assert response.json['xp_awarded'] == 100
```

### Example: Unit Test

```python
import pytest
from unittest.mock import Mock, patch

@pytest.mark.unit
@pytest.mark.critical
def test_xp_award_by_pillar():
    """Test XP is correctly awarded to specific pillar"""
    from services.xp_service import XPService

    service = XPService(user_id='test-user-123')

    with patch.object(service, 'supabase') as mock_supabase:
        # Mock database response
        mock_result = Mock()
        mock_result.data = [{'pillar': 'stem', 'xp_amount': 200}]
        mock_supabase.table.return_value.update.return_value.execute.return_value = mock_result

        result = service.award_xp(user_id='test-user-123', pillar='stem', xp_amount=100)

        assert result['xp_amount'] == 200
```

---

## Available Fixtures

### Flask & Client

- `app` - Flask application instance
- `client` - Flask test client
- `authenticated_client` - Client with auth cookies set

### Database

- `test_supabase` - Supabase client configured for test_schema
- `mock_supabase` - Mocked Supabase client (for unit tests)

### Test Data

- `test_user` - Real user in test_schema (auto-cleanup)
- `test_quest` - Real quest with task template (auto-cleanup)
- `sample_user` - Mock user data (no database)
- `sample_quest` - Mock quest data (no database)

### Auth

- `mock_verify_token` - Mocked token verification
- `admin_user` - Mock admin user data

---

## Coverage Goals

**Current Minimum**: 40%

**Target (Q2 2025)**: 60%

**Critical Paths**: 80%+

### Viewing Coverage

1. **GitHub Actions**: Download `coverage-report-{run_number}` artifact
2. **Extract ZIP**: Contains HTML report
3. **Open**: `index.html` in browser
4. **Navigate**: Click files to see uncovered lines

### Coverage by Module

**Priority 1 (Must have 80%+)**:
- `routes/auth.py` - Authentication
- `services/atomic_quest_service.py` - Quest completion
- `services/xp_service.py` - XP calculation
- `utils/auth/decorators.py` - Auth decorators

**Priority 2 (Target 60%+)**:
- `routes/quests.py` - Quest system
- `routes/tasks.py` - Task system
- `repositories/*.py` - Data access layer

**Priority 3 (Nice to have 40%+)**:
- Admin routes
- AI services
- LMS integration

---

## Workflow

### Option A: Deploy First, Test Later (Recommended)

```
1. Make changes on develop branch
2. Commit and push to GitHub
3. Auto-deploy to https://optio-dev-backend.onrender.com
4. Test manually on live dev site
5. When ready, trigger GitHub Actions tests
6. Review coverage report
7. Merge to main when stable
```

### Option B: Test Before Deploy

```
1. Make changes on develop branch
2. Commit to GitHub (don't push yet)
3. Trigger GitHub Actions tests
4. If tests pass, push to trigger deploy
5. Test on live dev site
6. Merge to main when stable
```

### Option C: Skip Tests Entirely

```
1. Make changes on develop branch
2. Commit and push to GitHub
3. Auto-deploy to dev site
4. Test manually
5. Merge to main when ready
```

**You decide** which workflow fits your needs.

---

## Best Practices

### 1. Use Fixtures for Setup/Teardown

```python
@pytest.fixture
def test_user(test_supabase):
    user_data = {...}
    # Create user
    test_supabase.rpc('execute_sql', {...})

    yield user_data

    # Cleanup happens automatically via session fixture
```

### 2. Test One Thing Per Test

```python
# Good
def test_login_success():
    # Test login succeeds with valid credentials

def test_login_fails_invalid_password():
    # Test login fails with wrong password

# Bad
def test_login():
    # Test success, failure, lockout, all in one
```

### 3. Use Descriptive Names

```python
# Good
def test_account_lockout_after_5_failed_attempts():
    pass

# Bad
def test_lockout():
    pass
```

### 4. Mark Slow Tests

```python
@pytest.mark.slow
def test_batch_user_import():
    # Long-running test
    pass
```

### 5. Clean Up After Yourself

The session-level `test_supabase` fixture handles cleanup, but if you create temporary resources, clean them in your fixture:

```python
@pytest.fixture
def temporary_file():
    file_path = '/tmp/test.txt'
    # Create file

    yield file_path

    # Cleanup
    os.remove(file_path)
```

---

## Troubleshooting

### Tests Fail Locally But Pass in CI

**Possible causes:**
- Environment variable mismatch
- Test schema has stale data
- Timezone differences

**Solution:**
- Check `pytest.ini` configuration
- Verify `TEST_SCHEMA=test_schema` is set
- Clear test schema manually if needed

### Flaky Tests

**Symptoms**: Tests pass sometimes, fail other times

**Causes**:
- Race conditions
- Time-dependent assertions
- External API calls

**Solutions**:
- Use `pytest-mock` for external dependencies
- Use `freezegun` for time-based tests
- Add retry logic for network calls
- Ensure proper transaction isolation

### Coverage Too Low

**Quick wins:**
- Add integration tests (higher coverage per test)
- Focus on critical paths first
- Run `pytest --cov-report=html` to see gaps
- Look for untested error paths

### Database Connection Errors

**Error**: `Could not connect to Supabase`

**Solutions:**
- Verify `SUPABASE_URL` is correct
- Check `SUPABASE_SERVICE_KEY` has permissions
- Ensure `test_schema` exists in database
- Check network connectivity

---

## Adding New Tests

### 1. Identify Test Type

**Unit test**: No database, mocked dependencies → `tests/unit/`
**Integration test**: Real database, full flow → `tests/integration/`
**Service test**: Service layer logic → `tests/services/`
**Repository test**: Data access patterns → `tests/repositories/`

### 2. Create Test File

```bash
# Unit test
touch backend/tests/unit/test_my_feature.py

# Integration test
touch backend/tests/integration/test_my_feature.py
```

### 3. Write Tests

Follow patterns in existing test files.

### 4. Run Tests Locally (Optional)

```bash
cd backend
export FLASK_ENV=testing
export TEST_SCHEMA=test_schema
pytest tests/unit/test_my_feature.py -v
```

### 5. Push and Trigger Workflow

1. Commit changes
2. Push to GitHub
3. Trigger manual test workflow
4. Review results

---

## Future Enhancements

**Phase 5 (Planned)**:
- Increase coverage to 60%
- Add frontend Jest tests
- Add Playwright E2E tests
- Performance/load testing
- Security scanning (OWASP ZAP)

**Phase 6 (Long-term)**:
- Continuous integration (auto-run on PR)
- Test result notifications (Slack/email)
- Test performance tracking
- Mutation testing

---

## Summary

**What we have:**
- ✅ 900+ lines of critical path tests
- ✅ Separate test schema (zero additional cost)
- ✅ Manual GitHub Actions workflow
- ✅ 40% minimum coverage enforcement
- ✅ Complete independence from deployment

**What tests cover:**
- ✅ Authentication flow (login, register, lockout, CSRF)
- ✅ Quest completion (tasks, XP, race conditions)
- ✅ Parent dashboard (linking, access control, rhythm indicator)
- ✅ Service layer (atomic operations, XP calculation)
- ✅ Repository pattern (CRUD, RLS, query optimization)

**Key principle:**
> Tests are **optional quality checks**, not deployment blockers. You control when they run and whether to act on results.
