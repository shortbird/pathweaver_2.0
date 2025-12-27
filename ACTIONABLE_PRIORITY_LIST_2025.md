# Optio Platform - Actionable Priority List

**Generated:** December 26, 2025
**Status:** Ready for implementation across multiple sessions

This document provides a checklist-based action plan derived from the comprehensive audit. Use this to track progress across multiple Claude Code sessions.

---

## Week 1: Critical Security & Compliance Blockers (MUST FIX)

### Day 1: Security Vulnerabilities
- [x] **Fix npm security vulnerabilities** (30 minutes)
  - Critical axios DoS vulnerability and 3 other high/moderate vulnerabilities
  - File: `frontend/package.json`
  - Change:
    ```bash
    cd frontend
    npm audit fix
    npm audit fix --force  # If needed for major version updates
    ```
  - Test: `npm audit` should show 0 vulnerabilities
  - Reference: npm audit found 4 vulnerabilities (2 high, 2 moderate)

- [x] **Remove hardcoded dev secret key fallback** (15 minutes)
  - Production-critical security issue
  - File: `backend/app_config.py:52`
  - Change:
    ```python
    # Before
    SECRET_KEY = 'dev-secret-key-change-in-production'

    # After
    raise ValueError(
        "SECRET_KEY environment variable is required in production. "
        "Generate with: python -c 'import secrets; print(secrets.token_hex(32))'"
    )
    ```
  - Test: `python backend/app.py` should fail without SECRET_KEY env var
  - Reference: Hardcoded secret key found in production config

### Day 2: COPPA/FERPA Compliance
- [x] **Add age verification to registration** (4 hours)
  - Critical legal requirement for minors
  - File: `backend/routes/auth/registration.py`
  - Change: Add age calculation and parental consent check
    ```python
    # Add after line 175
    from datetime import datetime, timedelta

    # Calculate age from date_of_birth
    dob = datetime.strptime(date_of_birth, '%Y-%m-%d')
    age = (datetime.now() - dob).days / 365.25

    if age < 13:
        return jsonify({
            'error': 'Users under 13 require parental consent',
            'require_parent_email': True
        }), 403
    ```
  - Test: Register with birth date making user under 13
  - Reference: No age verification found in registration flow
  - **COMPLETED**: Age verification now happens BEFORE auth user creation (lines 141-157)

- [x] **Add data deletion endpoint for GDPR** (2 hours)
  - Legal requirement for EU users
  - File: `backend/routes/account_deletion.py:290`
  - Change: Implement actual deletion (currently only exports)
    ```python
    @bp.route('/users/delete-account', methods=['DELETE'])
    @require_auth
    def delete_user_account(current_user):
        """Permanently delete user account and all associated data"""
        try:
            # Delete in reverse dependency order
            tables = [
                'evidence_documents', 'quest_task_completions',
                'user_quest_tasks', 'user_quests', 'friendships',
                'user_skill_xp', 'diplomas', 'users'
            ]

            for table in tables:
                supabase.table(table).delete().eq('user_id', current_user).execute()

            return jsonify({'message': 'Account deleted successfully'}), 200
        except Exception as e:
            logger.error(f"Account deletion failed: {str(e)}")
            return jsonify({'error': 'Failed to delete account'}), 500
    ```
  - Test: Call endpoint and verify user data is deleted
  - Reference: GDPR requires data deletion capability
  - **COMPLETED**: DELETE /users/delete-account-permanent endpoint added (lines 428-616)

### Day 3: Authentication & Session Security
- [x] **Add session timeout configuration** (1 hour)
  - Security best practice for session management
  - File: `backend/utils/session_manager.py` (actual location, not middleware)
  - Change: Add configurable timeout
    ```python
    # Added at line 37
    SESSION_TIMEOUT = int(os.getenv('SESSION_TIMEOUT_HOURS', '24'))

    # Added is_session_expired method at lines 80-111
    def is_session_expired(self, session_data):
        """Check if session has exceeded timeout period"""
        created_at = session_data.get('iat')  # Uses JWT's issued-at claim
        if not created_at:
            return True

        session_created_at = datetime.fromtimestamp(created_at, tz=timezone.utc)
        session_age = datetime.now(timezone.utc) - session_created_at
        return session_age.total_seconds() > (self.SESSION_TIMEOUT * 3600)
    ```
  - Test: Set SESSION_TIMEOUT_HOURS=0.01, wait 1 minute, verify session expires
  - Reference: No session timeout configuration found
  - **COMPLETED**: Session timeout added with integration into all token verification methods (lines 163-281)

### Day 4-5: Error Handling & Logging
- [ ] **Replace broad exception handlers** (4 hours)
  - 300+ instances of `except Exception` catching
  - Files: Multiple, start with `backend/app.py`
  - Change:
    ```python
    # Before (line 115)
    except Exception as e:
        logger.error(f"Error: {str(e)}")

    # After
    except ValueError as e:
        logger.error(f"Validation error in X: {str(e)}")
        return jsonify({'error': 'Invalid input'}), 400
    except KeyError as e:
        logger.error(f"Missing required field: {str(e)}")
        return jsonify({'error': 'Missing required field'}), 400
    except Exception as e:
        logger.error(f"Unexpected error in X: {str(e)}", exc_info=True)
        return jsonify({'error': 'Internal server error'}), 500
    ```
  - Test: Run test suite, verify specific errors are caught
  - Reference: 300+ broad exception handlers found

---

## Weeks 2-4: Accessibility Sprint (Legal Compliance)

### Week 2: Critical Accessibility Fixes
- [ ] **Add alt text to 100+ images** (1 day)
  - WCAG 2.1 AA requirement
  - Files: 20+ components missing alt text
  - Starting with: `frontend/src/components/admin/AdminBadges.jsx:194`
  - Change:
    ```jsx
    // Before
    <img src={badge.image_url} className="w-12 h-12" />

    // After
    <img
      src={badge.image_url}
      alt={`${badge.name} badge icon`}
      className="w-12 h-12"
    />
    ```
  - Test: Use axe DevTools extension to verify no alt text violations
  - Reference: 100+ images missing alt text

- [ ] **Add keyboard navigation to click handlers** (2 days)
  - WCAG requirement for keyboard accessibility
  - Files: 50+ non-button click handlers
  - Starting with: `frontend/src/components/admin/AdminBadges.jsx:137`
  - Change:
    ```jsx
    // Before
    <div onClick={() => setShowCreationForm(true)}>

    // After
    <div
      onClick={() => setShowCreationForm(true)}
      onKeyDown={(e) => e.key === 'Enter' && setShowCreationForm(true)}
      role="button"
      tabIndex={0}
      aria-label="Create new badge"
    >
    ```
  - Test: Tab through interface, verify all interactive elements reachable
  - Reference: 50+ click handlers without keyboard support

### Week 3: Form Accessibility
- [ ] **Add labels to all form inputs** (1 day)
  - WCAG requirement for form accessibility
  - Files: Check all form components
  - Change:
    ```jsx
    // Before
    <input type="text" placeholder="Enter name" />

    // After
    <label htmlFor="name">Name</label>
    <input id="name" type="text" placeholder="Enter name" />
    ```
  - Test: Screen reader should announce all form fields
  - Reference: Form inputs need proper labeling

### Week 4: Navigation & Focus Management
- [ ] **Add skip navigation link** (2 hours)
  - WCAG 2.1 AA requirement
  - File: `frontend/src/App.jsx`
  - Change:
    ```jsx
    // Add as first element in App component
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4"
    >
      Skip to main content
    </a>
    <main id="main-content">
      {/* existing content */}
    </main>
    ```
  - Test: Press Tab on page load, skip link should appear
  - Reference: No skip navigation found

---

## Weeks 5-7: Performance & Architecture Sprint

### Week 5: Database Performance
- [ ] **Fix N+1 queries in admin routes** (1 week)
  - Major performance issue
  - Files: `backend/routes/admin/advisor_management.py:103`
  - Change:
    ```python
    # Before (N+1 query)
    for assignment in assignments.data:
        student = supabase.table('users').select('*').eq('id', assignment['student_id']).single()

    # After (single query with join)
    assignments = supabase.table('advisor_student_assignments')\
        .select('*, student:users(*)')\
        .eq('advisor_id', advisor_id)\
        .execute()
    ```
  - Test: Check API response time, should be <500ms
  - Reference: 20+ N+1 query patterns found

### Week 6: Frontend Bundle Optimization
- [ ] **Implement code splitting** (3 days)
  - Reduce initial bundle size
  - File: `frontend/src/App.jsx`
  - Change:
    ```jsx
    // Before
    import AdminDashboard from './pages/AdminDashboard'

    // After
    const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))

    // Wrap routes with Suspense
    <Suspense fallback={<LoadingSpinner />}>
      <Route path="/admin" element={<AdminDashboard />} />
    </Suspense>
    ```
  - Test: Check network tab, admin code should load only when navigating to /admin
  - Reference: No code splitting implemented

### Week 7: File Size Reduction
- [ ] **Refactor large files (>1000 lines)** (1 week)
  - Maintainability issue
  - Files to split:
    - `backend/routes/spark_integration.py` (1354 lines)
    - `backend/routes/tutor/chat.py` (1280 lines)
    - `frontend/src/pages/DiplomaPage.jsx` (1210 lines)
  - Change: Split into smaller, focused modules
  - Test: All existing tests should still pass
  - Reference: 10+ files over 1000 lines

---

## Weeks 8-11: API & Integration Readiness

### Week 8: API Versioning Implementation
- [ ] **Add versioning to all API routes** (1 week)
  - Critical for external integrations
  - Currently only 3/200+ routes versioned
  - File: Create `backend/routes/v1/__init__.py`
  - Change:
    ```python
    # Create versioned blueprint
    from flask import Blueprint
    v1 = Blueprint('v1', __name__, url_prefix='/api/v1')

    # Move existing routes under v1
    @v1.route('/quests')
    def get_quests():
        # existing code
    ```
  - Test: Both `/api/quests` and `/api/v1/quests` should work
  - Reference: Only 3 versioned routes out of 200+

### Week 9-10: API Documentation
- [ ] **Generate OpenAPI spec** (3 days)
  - Required for external integrations
  - File: `backend/api_spec_generator.py`
  - Enhancement: Auto-generate from route decorators
  - Test: Validate spec at swagger.io
  - Reference: API spec exists but needs updating

### Week 11: Rate Limiting Enhancement
- [ ] **Add per-endpoint rate limits** (2 days)
  - Different limits for different endpoints
  - File: `backend/middleware/rate_limiter.py`
  - Change: Add decorator with configurable limits
    ```python
    @rate_limit(calls=10, period=60)  # 10 calls per minute
    def sensitive_endpoint():
        pass
    ```
  - Test: Exceed limit, verify 429 response
  - Reference: Global rate limiting only

---

## Months 3-4: Testing Coverage Sprint

### Month 3: Backend Testing
- [ ] **Add tests for untested routes** (2 weeks)
  - Critical routes without tests
  - Priority files:
    - `backend/routes/dependents.py` (no tests)
    - `backend/routes/observer.py` (no tests)
    - `backend/routes/parental_consent.py` (no tests)
  - Template test:
    ```python
    def test_create_dependent(client, parent_user):
        response = client.post('/api/dependents/create',
            json={'display_name': 'Child', 'date_of_birth': '2015-01-01'})
        assert response.status_code == 201
        assert response.json['display_name'] == 'Child'
    ```
  - Test: `pytest backend/tests/test_dependents.py`
  - Reference: 31 test files for 285 Python files

### Month 4: Frontend Testing
- [ ] **Increase test coverage to 80%** (2 weeks)
  - Currently at 60.61%
  - Priority components:
    - Admin components (0% coverage)
    - Quest components (partial coverage)
    - Evidence components (0% coverage)
  - Test: `npm run test:coverage`
  - Reference: 22 test files for 395 JS/JSX files

---

## Months 5-6: Technical Debt & Architecture

### Month 5: Code Organization
- [ ] **Complete repository pattern migration** (2 weeks)
  - 47 route files still using direct DB access
  - Follow established pattern in `backend/routes/tasks.py`
  - Test: Existing functionality should remain unchanged
  - Reference: Only 4/51 route files migrated

- [ ] **Remove TODO comments** (1 week)
  - 25+ TODO comments in codebase
  - Implement or create tickets for each
  - Test: `grep -r TODO` should return 0 results
  - Reference: 25 TODO/FIXME comments found

### Month 6: Documentation & Cleanup
- [ ] **Update all docstrings** (1 week)
  - Many functions missing documentation
  - Use Google style docstrings
  - Test: Run pydocstyle for validation
  - Reference: Inconsistent documentation

- [ ] **Remove dead code** (3 days)
  - Unused imports, commented code
  - Test: All tests should still pass
  - Reference: Multiple files with commented code

---

## Tracking Progress

Use this checklist format in your Claude Code sessions:

```
Session Date: 2025-12-26
Focus Area: Week 1 - Critical Security

Completed:
- [x] Fixed npm vulnerabilities (frontend/package.json) - npm audit clean
- [x] Removed hardcoded secret key (backend/app_config.py:52) - Now raises error

In Progress:
- [ ] COPPA age verification - Added age check, testing parental flow

Blocked:
- [ ] GDPR deletion - Need to verify cascade delete behavior

Next Session:
- Priority 1: Complete COPPA implementation
- Priority 2: Start session timeout configuration
```

---

## Quick Reference

**Critical Paths (Do First):**
1. Week 1: Security vulnerabilities, COPPA/FERPA compliance, auth security
2. Weeks 2-4: Accessibility compliance (legal requirement)
3. Weeks 5-7: Performance fixes for production readiness
4. Weeks 8-11: API versioning for external integrations

**High Impact, Lower Urgency:**
- Months 3-4: Test coverage improvement
- Months 5-6: Technical debt reduction

**Files Changed Most Often (Focus Areas):**
- `backend/routes/auth/registration.py` - User registration flow
- `backend/routes/admin/user_management.py` - Admin operations
- `frontend/src/pages/QuestDetail.jsx` - Core user journey
- `frontend/src/components/quest/TaskEvidenceModal.jsx` - Evidence submission
- `backend/app.py` - Application entry point

---

**Document Version:** 1.0
**Last Updated:** December 26, 2025
**Total Items:** 35 actionable tasks across 6 months