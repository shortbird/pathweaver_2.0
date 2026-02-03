# Backend Test Organization

This directory contains all backend tests for the Optio platform, organized by test type and scope.

## Directory Structure

```
backend/tests/
├── conftest.py              # Pytest configuration and shared fixtures
├── fixtures/                # Test data files (JSON, YAML, etc.)
├── unit/                    # Unit tests (isolated, no external dependencies)
│   ├── test_auth.py        # Authentication utilities
│   ├── test_file_upload_validation.py  # File upload security validation
│   └── test_xp_calculation.py  # XP calculation logic
├── integration/             # Integration tests (multiple components, real DB)
│   ├── test_api_endpoints.py   # API endpoint integration
│   ├── test_auth_flow.py       # End-to-end auth flows
│   ├── test_quest_completion.py # Quest completion workflows
│   └── test_parent_dashboard.py # Parent dashboard features
├── repositories/            # Repository layer tests
│   └── test_user_repository.py
├── services/                # Service layer tests
│   ├── test_atomic_quest_service.py
│   └── test_xp_service.py
└── manual/                  # Manual test scripts (not pytest)
    ├── test_imscc_parser.py     # IMSCC file parsing (run directly)
    └── test_quest_generator.py  # Quest AI generation (run directly)

```

## Running Tests

### All Tests
```bash
cd backend
pytest
```

### Specific Test Categories
```bash
# Unit tests only (fast, isolated)
pytest tests/unit/

# Integration tests (slower, requires database)
pytest tests/integration/

# Service layer tests
pytest tests/services/

# Repository layer tests
pytest tests/repositories/

# Specific test file
pytest tests/unit/test_auth.py

# Specific test function
pytest tests/unit/test_auth.py::test_verify_token
```

### Test Options
```bash
# Verbose output
pytest -v

# Show print statements
pytest -s

# Run with coverage
pytest --cov=backend --cov-report=html

# Run tests matching a pattern
pytest -k "auth"

# Stop on first failure
pytest -x

# Run last failed tests
pytest --lf
```

### Manual Test Scripts
Manual test scripts in `tests/manual/` are NOT run by pytest. Execute them directly:

```bash
# Test IMSCC parsing (requires sample file)
python backend/tests/manual/test_imscc_parser.py

# Test quest generation (requires GEMINI_API_KEY)
python backend/tests/manual/test_quest_generator.py
```

## Shared Fixtures (conftest.py)

### Flask App Fixtures
- `app` - Configured test Flask application
- `client` - Flask test client
- `authenticated_client` - Test client with session set

### Mock Fixtures
- `mock_supabase` - Mock Supabase client
- `mock_auth_supabase` - Mock authenticated Supabase client
- `mock_verify_token` - Mock token verification
- `mock_gemini_response` - Mock AI tutor response
- `mock_email_service` - Mock email service

### Sample Data Fixtures
- `sample_user` / `admin_user` / `parent_user` / `observer_user` - User data
- `sample_dependent` - Dependent profile (COPPA-compliant child account)
- `sample_quest` - Quest data
- `sample_task` / `sample_task_completion` - Task data
- `sample_badge` - Badge data
- `sample_organization` - Organization data
- `sample_parent_student_link` - Parent-student relationship
- `sample_friendship` - Connection/friendship data

### Real Database Fixtures (Integration Tests)
- `test_supabase` - Real Supabase client using test schema
- `test_user` - Real test user in database
- `test_quest` - Real test quest with tasks

## Writing Tests

### Unit Test Example
```python
def test_calculate_xp(sample_task):
    """Test XP calculation logic"""
    result = calculate_xp(sample_task['xp_value'])
    assert result == 100
```

### Integration Test Example
```python
def test_quest_enrollment(client, authenticated_client, test_quest):
    """Test quest enrollment workflow"""
    response = authenticated_client.post(
        f'/api/quests/{test_quest["id"]}/start',
        json={}
    )
    assert response.status_code == 200
    assert response.json['success'] is True
```

### Using Mock Fixtures
```python
def test_send_email(mock_email_service):
    """Test email sending"""
    from services.email_service import EmailService
    service = EmailService()
    service.send_templated_email(
        to_email='test@example.com',
        template_name='welcome',
        context={}
    )
    mock_email_service.assert_called_once()
```

## Test Categories

### Unit Tests (`tests/unit/`)
- Test individual functions/methods in isolation
- No external dependencies (database, API calls, file I/O)
- Use mocks for all external interactions
- Fast execution (< 1 second per test)
- Examples: XP calculation, auth utilities, data validation

### Integration Tests (`tests/integration/`)
- Test multiple components working together
- May use real database (test schema)
- Test full workflows (auth flow, quest completion)
- Slower execution (1-5 seconds per test)
- Examples: API endpoint tests, multi-step user flows

### Repository Tests (`tests/repositories/`)
- Test repository layer (data access)
- Use real or mocked database
- Test CRUD operations, complex queries
- Examples: UserRepository, QuestRepository

### Service Tests (`tests/services/`)
- Test service layer (business logic)
- May use mocked repositories
- Test complex business rules
- Examples: XP service, quest optimization service

### Manual Tests (`tests/manual/`)
- Scripts for manual testing/debugging
- NOT run by pytest
- May require environment variables or sample files
- Examples: IMSCC parser, AI quest generation

## Best Practices

### DO
- Write descriptive test names explaining what is tested
- Use fixtures for common setup/teardown
- Test edge cases and error conditions
- Keep tests isolated (no shared state between tests)
- Use appropriate test category (unit vs integration)
- Mock external services (email, AI, payment processing)

### DON'T
- Don't test third-party libraries (trust they work)
- Don't write tests that depend on execution order
- Don't use real production credentials/data
- Don't skip cleanup (use fixtures with yield)
- Don't write overly complex tests (split into multiple tests)

## Coverage Goals

**Current Status** (Dec 2025):
- Integration tests: ~1,800 lines of test code
- Coverage: ~15-20% of backend codebase

**Targets**:
- Month 3: 30% coverage
- Month 6: 50% coverage
- Focus areas: auth flows, quest system, XP calculation, RLS policies

## Continuous Integration

Tests run automatically on:
- Pull requests to `develop` branch
- Pushes to `develop` branch
- Merges to `main` branch

GitHub Actions workflow: `.github/workflows/backend-tests.yml`

## Troubleshooting

### Import Errors
If you get import errors, ensure you're running pytest from the `backend/` directory:
```bash
cd backend
pytest tests/
```

### Database Connection Issues
Integration tests use test schema. Ensure `TEST_SCHEMA` environment variable is set:
```bash
export TEST_SCHEMA=test_schema
pytest tests/integration/
```

### Fixture Not Found
Check that fixtures are defined in `conftest.py` or imported properly.

### Slow Tests
Integration tests can be slow. Run unit tests during development:
```bash
pytest tests/unit/ -v
```

## Related Documentation

- [Frontend Testing Guide](../../frontend/TESTING.md) - Frontend test organization
- [E2E Testing Plan](../../tests/e2e/TEST_PLAN.md) - Playwright E2E tests
- [Repository Pattern Guide](../docs/REPOSITORY_PATTERN.md) - Repository architecture
- [Exception Handling Guide](../docs/EXCEPTION_HANDLING_GUIDE.md) - Custom exceptions

## Contributing

When adding new tests:
1. Determine appropriate test category (unit/integration/service/repository)
2. Use existing fixtures from `conftest.py` when possible
3. Add new fixtures to `conftest.py` if reusable across tests
4. Follow naming convention: `test_<what_is_tested>.py`
5. Add docstrings to test functions explaining purpose
6. Run tests locally before committing: `pytest tests/`
7. Ensure tests pass in CI before merging

## Questions?

See [COMPREHENSIVE_CODEBASE_REVIEW.md](../../COMPREHENSIVE_CODEBASE_REVIEW.md) for testing roadmap and priorities.