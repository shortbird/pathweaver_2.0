# Optio Platform - Actionable Priority List

**Generated:** December 26, 2025
**Status:** Ready for implementation across multiple sessions

This document provides a checklist-based action plan derived from the comprehensive audit. Use this to track progress across multiple Claude Code sessions.

---

## Week 1: Critical Blockers (MUST FIX)

### Day 1: Legal & Security Foundations
- [x] **Add LICENSE file to root directory** (30 minutes)
  - Choose: MIT or Apache 2.0 (recommended for educational platform)
  - Include copyright year and owner
  - File: `LICENSE`
  - Reference: [LEGAL_COMPLIANCE_AUDIT_2025.md](LEGAL_COMPLIANCE_AUDIT_2025.md#critical-no-project-license)

- [x] **Update vulnerable dependencies** (2 hours)
  - Update `urllib3` from 2.5.0 to ≥2.10.0 (CVE-2024-37891)
  - Update `cryptography` from 41.0.4 to ≥42.0.0
  - Update `requests` from 2.32.5 to 2.32.8
  - File: `backend/requirements.txt`
  - Test: `pip install -r requirements.txt && python -m pytest`
  - Reference: [SECURITY_AUDIT_2025.md](SECURITY_AUDIT_2025.md#high-outdated-dependencies)

### Day 2: Quick Wins
- [x] **Fix frontend password validation mismatch** (5 minutes)
  - File: `frontend/src/pages/LoginPage.jsx:100`
  - Change: `value: 6` → `value: 12`
  - Change: `'Password must be at least 6 characters'` → `'Password must be at least 12 characters'`
  - Test: Load login page, try 8-char password, verify error shows "12 characters"
  - Reference: [CODE_QUALITY_AUDIT_2025.md](CODE_QUALITY_AUDIT_2025.md#hp-3-password-validation)

- [x] **Fix RegisterPage test failures** (4 hours)
  - File: `frontend/src/pages/RegisterPage.test.jsx:540-590`
  - Fix AuthContext mock to properly call register function
  - Add `beforeEach` cleanup for mock state
  - Target: 100% pass rate (currently 24% failing on registration tests)
  - Test: `npm run test:run RegisterPage.test.jsx`
  - Reference: [TEST_STRATEGY_AUDIT_2025.md](TEST_STRATEGY_AUDIT_2025.md#critical-registerpage-failures)

### Day 3: Database Performance
- [x] **Create database indexes on critical foreign keys** (4 hours)
  - Create migration file: `backend/migrations/add_performance_indexes.sql`
  - Add indexes:
    ```sql
    CREATE INDEX CONCURRENTLY idx_user_quest_tasks_user_id ON user_quest_tasks(user_id);
    CREATE INDEX CONCURRENTLY idx_user_quest_tasks_quest_id ON user_quest_tasks(quest_id);
    CREATE INDEX CONCURRENTLY idx_quest_task_completions_user_task_id ON quest_task_completions(user_quest_task_id);
    CREATE INDEX CONCURRENTLY idx_user_badges_user_id ON user_badges(user_id);
    CREATE INDEX CONCURRENTLY idx_user_quests_user_completed ON user_quests(user_id, completed_at) WHERE completed_at IS NOT NULL;
    ```
  - Apply via Supabase dashboard or migration tool
  - Test: Run `EXPLAIN ANALYZE` on common queries, verify index usage
  - Expected: 80-95% query time reduction
  - Reference: [PERFORMANCE_AUDIT_2025.md](PERFORMANCE_AUDIT_2025.md#7-no-database-indexes)

### Day 4: Portfolio Performance Optimization
- [x] **Fix portfolio diploma O(n²) nested loops** (6 hours)
  - File: `backend/routes/portfolio.py:516-663`
  - Pre-compute evidence lookups ONCE (not per task)
  - Single-pass XP aggregation instead of nested loops
  - Implementation:
    ```python
    # Pre-compute all evidence lookups
    evidence_by_task = {task_id: evidence for task_id, evidence in evidence_docs_map.items()}

    # Single-pass XP aggregation
    xp_by_quest = {}
    for tc in task_completions.data:
        quest_id = tc['quest_id']
        xp_by_quest[quest_id] = xp_by_quest.get(quest_id, 0) + tc['xp_value']
    ```
  - Test: Load diploma page with 50 quests, verify <1s load time (currently 2-5s)
  - Expected: 60-80% response time reduction
  - Reference: [PERFORMANCE_AUDIT_2025.md](PERFORMANCE_AUDIT_2025.md#1-portfolio-diploma-nested-loops)

### Day 5: CI/CD Setup
- [x] **Enable frontend tests in CI** (2 hours)
  - Create `.github/workflows/frontend-tests.yml`
  - Run on every push to develop/main
  - Block merge if tests fail
  - Enforce 95% pass rate minimum
  - Configuration:
    ```yaml
    name: Frontend Tests
    on: [push, pull_request]
    jobs:
      test:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v3
          - uses: actions/setup-node@v3
          - run: cd frontend && npm ci
          - run: npm run test:run
          - name: Check pass rate
            run: |
              PASS_RATE=$(npm run test:run | grep -oP '\d+(?=% pass)')
              if [ $PASS_RATE -lt 95 ]; then exit 1; fi
    ```
  - Reference: [TEST_STRATEGY_AUDIT_2025.md](TEST_STRATEGY_AUDIT_2025.md#ci-cd-integration)

---

## Weeks 2-4: FERPA Compliance Sprint

### Week 2: Disclosure Logging Infrastructure
- [ ] **Design student access log schema** (4 hours)
  - Create migration file: `backend/migrations/create_student_access_logs.sql`
  - Schema:
    ```sql
    CREATE TABLE student_access_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      accessor_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
      accessor_role TEXT NOT NULL,
      data_accessed TEXT NOT NULL, -- JSON: {type: 'grades', 'portfolio', 'evidence', fields: [...]}
      access_timestamp TIMESTAMPTZ DEFAULT NOW(),
      purpose TEXT, -- 'legitimate_educational_interest', 'parent_request', 'directory_info', etc.
      ip_address INET,
      user_agent TEXT
    );
    CREATE INDEX idx_student_access_student ON student_access_logs(student_id, access_timestamp DESC);
    CREATE INDEX idx_student_access_accessor ON student_access_logs(accessor_id);
    ```
  - Reference: [LEGAL_COMPLIANCE_AUDIT_2025.md](LEGAL_COMPLIANCE_AUDIT_2025.md#critical-ferpa-violations)

- [ ] **Create AccessLogger utility** (6 hours)
  - File: `backend/utils/access_logger.py`
  - Functions:
    - `log_student_data_access(student_id, accessor_id, data_type, purpose)`
    - `get_student_access_history(student_id, start_date, end_date)`
  - Integrate into all endpoints that access student records
  - Files to update:
    - `backend/routes/parent/dashboard.py` (parent viewing dependent data)
    - `backend/routes/portfolio.py` (public diploma access)
    - `backend/routes/admin/user_management.py` (admin viewing student data)
    - `backend/routes/observers.py` (observer viewing student feed)

- [ ] **Add FERPA disclosure report endpoint** (4 hours)
  - File: `backend/routes/admin/ferpa_compliance.py`
  - Endpoint: `GET /api/admin/ferpa/disclosure-report`
  - Returns all access logs for a date range
  - Export formats: CSV, PDF
  - Require superadmin role

### Week 3: GDPR Data Export Completion
- [ ] **Add missing tables to user data export** (8 hours)
  - File: `backend/routes/users.py` (find `export-data` endpoint)
  - Add to export:
    - `parental_consent_log` - Consent history for COPPA
    - `observer_access_logs` - Observer viewing history
    - `advisor_notes` - Any notes from advisors
    - `direct_messages` - DM history
    - `student_access_logs` - NEW table from Week 2
  - Add file exports:
    - Evidence documents from Supabase Storage
    - Profile images
  - Test: Export for test user with all data types, verify complete
  - Reference: [LEGAL_COMPLIANCE_AUDIT_2025.md](LEGAL_COMPLIANCE_AUDIT_2025.md#high-incomplete-data-export)

- [ ] **Implement cookie consent banner** (6 hours)
  - Create component: `frontend/src/components/CookieConsent.jsx`
  - Features:
    - Show on first visit (check localStorage)
    - Explain httpOnly authentication cookies
    - Accept/Decline buttons
    - Link to cookie policy
    - Store consent in localStorage
  - Add to `App.jsx`
  - Test: Clear localStorage, reload, verify banner shows
  - Reference: [LEGAL_COMPLIANCE_AUDIT_2025.md](LEGAL_COMPLIANCE_AUDIT_2025.md#high-no-cookie-consent)

### Week 4: Privacy Policy & DPAs
- [ ] **Update privacy policy with FERPA details** (8 hours)
  - File: Create `PRIVACY_POLICY.md` or update existing
  - Add sections:
    - Directory vs Non-Directory Information definitions
    - FERPA rights (access, amendment, disclosure consent)
    - Annual notification language
    - Data retention policies
    - Third-party processors (Supabase, Render, Gemini)
  - Legal review: Recommend attorney review
  - Reference: [LEGAL_COMPLIANCE_AUDIT_2025.md](LEGAL_COMPLIANCE_AUDIT_2025.md#ferpa-compliance)

- [ ] **Obtain Data Processing Agreements** (1 week, mostly waiting)
  - Supabase: Contact for DPA (usually provided for enterprise)
  - Render: Contact for DPA
  - Google Gemini: Review terms, request DPA if needed
  - Store signed DPAs in `legal/DPAs/` directory (gitignored)
  - Document DPA status in `LEGAL_COMPLIANCE_STATUS.md`

---

## Weeks 5-7: Accessibility Compliance Sprint

### Week 5: Foundation & Navigation
- [ ] **Add skip navigation link** (2 hours)
  - File: `frontend/src/App.jsx` or main layout
  - Implementation:
    ```jsx
    <a href="#main-content" className="skip-link">
      Skip to main content
    </a>
    <style>{`
      .skip-link {
        position: absolute;
        top: -40px;
        left: 0;
        background: #000;
        color: #fff;
        padding: 8px;
        z-index: 100;
      }
      .skip-link:focus {
        top: 0;
      }
    `}</style>
    ```
  - Add `id="main-content"` to main content container
  - Test: Tab from page load, verify skip link appears
  - Reference: [ACCESSIBILITY_AUDIT_2025.md](ACCESSIBILITY_AUDIT_2025.md#critical-skip-navigation)

- [ ] **Audit and fix all image alt text** (12 hours)
  - Files: All components with `<img>` or `<Image>` tags
  - Pattern:
    ```jsx
    // BAD
    <img src="quest-image.png" alt="" />
    <img src="badge.png" alt="Badge" />

    // GOOD
    <img src="quest-image.png" alt="STEM Quest: Build a Robot - Earn 100 XP" />
    <img src="badge.png" alt="STEM Explorer Badge - Awarded for completing 5 STEM quests" />
    ```
  - Decorative images: `alt="" role="presentation"`
  - Test: Use screen reader (NVDA/JAWS), verify all images have descriptive text
  - Reference: [ACCESSIBILITY_AUDIT_2025.md](ACCESSIBILITY_AUDIT_2025.md#critical-image-alt-text)

- [ ] **Fix heading hierarchy** (4 hours)
  - Audit all pages for heading structure
  - Ensure: Single `<h1>` per page, no skipped levels (h1 → h3)
  - Files to check:
    - `DiplomaPage.jsx` - Complex layout
    - `QuestBadgeHub.jsx` - Multiple sections
    - `ParentDashboardPage.jsx` - Nested structure
  - Test: Use accessibility tree inspector, verify proper hierarchy
  - Reference: [ACCESSIBILITY_AUDIT_2025.md](ACCESSIBILITY_AUDIT_2025.md#heading-hierarchy)

### Week 6: Forms & Interactions
- [ ] **Add aria-describedby to all form errors** (8 hours)
  - Files: All components with form inputs
  - Pattern:
    ```jsx
    <label htmlFor="email">Email</label>
    <input
      id="email"
      aria-invalid={!!errors.email}
      aria-describedby={errors.email ? "email-error" : undefined}
    />
    {errors.email && (
      <span id="email-error" role="alert" className="error">
        {errors.email.message}
      </span>
    )}
    ```
  - Files to update:
    - `LoginPage.jsx`
    - `RegisterPage.jsx`
    - `QuestPersonalizationWizard.jsx`
    - `TaskEvidenceModal.jsx`
  - Test: Screen reader announces errors when validation fails
  - Reference: [ACCESSIBILITY_AUDIT_2025.md](ACCESSIBILITY_AUDIT_2025.md#critical-form-errors)

- [ ] **Implement modal focus trap** (6 hours)
  - Install: `npm install focus-trap-react`
  - File: `frontend/src/components/ui/Modal.jsx`
  - Implementation:
    ```jsx
    import FocusTrap from 'focus-trap-react';

    function Modal({ isOpen, onClose, children }) {
      return isOpen ? (
        <FocusTrap>
          <div role="dialog" aria-modal="true">
            {children}
          </div>
        </FocusTrap>
      ) : null;
    }
    ```
  - Test: Open modal, tab through elements, verify focus stays inside
  - Press Escape, verify modal closes
  - Reference: [ACCESSIBILITY_AUDIT_2025.md](ACCESSIBILITY_AUDIT_2025.md#critical-modal-focus-trap)

- [ ] **Add keyboard support to Card component** (4 hours)
  - File: `frontend/src/components/ui/Card.jsx`
  - Make clickable Cards keyboard accessible:
    ```jsx
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(e);
        }
      }}
      className={className}
    >
      {children}
    </div>
    ```
  - Test: Tab to quest cards, press Enter/Space to select
  - Reference: [ACCESSIBILITY_AUDIT_2025.md](ACCESSIBILITY_AUDIT_2025.md#critical-keyboard-support)

### Week 7: ARIA Labels & Testing
- [ ] **Add ARIA labels to all icon buttons** (6 hours)
  - Pattern:
    ```jsx
    // Password toggle
    <button aria-label="Show password" onClick={togglePassword}>
      <EyeIcon />
    </button>

    // Close button
    <button aria-label="Close dialog" onClick={onClose}>
      <XMarkIcon />
    </button>

    // Search button
    <button aria-label="Search quests" type="submit">
      <MagnifyingGlassIcon />
    </button>
    ```
  - Files: All components with icon-only buttons
  - Test: Screen reader announces button purpose
  - Reference: [ACCESSIBILITY_AUDIT_2025.md](ACCESSIBILITY_AUDIT_2025.md#critical-aria-labels)

- [ ] **Run automated accessibility tests** (4 hours)
  - Install: `npm install --save-dev @axe-core/react`
  - Add to critical pages:
    ```jsx
    import { axe, toHaveNoViolations } from 'jest-axe';
    expect.extend(toHaveNoViolations);

    it('has no accessibility violations', async () => {
      const { container } = render(<DiplomaPage />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
    ```
  - Run on: DiplomaPage, QuestBadgeHub, LoginPage, RegisterPage
  - Fix any violations found
  - Reference: [ACCESSIBILITY_AUDIT_2025.md](ACCESSIBILITY_AUDIT_2025.md#automated-testing)

- [ ] **Manual screen reader testing** (4 hours)
  - Download NVDA (free, Windows) or use VoiceOver (Mac)
  - Test critical user flows:
    - Login/Registration
    - Quest browsing and enrollment
    - Task completion with evidence
    - Parent viewing dependent progress
  - Document issues found
  - Fix blocking issues (can't complete flow with screen reader)

---

## Weeks 8-11: API Versioning & LMS Readiness

### Week 8: API Versioning Infrastructure
- [ ] **Plan API versioning migration** (4 hours)
  - Document current endpoints (already 288 endpoints mapped)
  - Decide strategy: URL versioning (recommended) vs header versioning
  - Create migration plan: Support both `/api/*` and `/api/v1/*` for 6 months
  - Reference: [API_DESIGN_AUDIT_2025.md](API_DESIGN_AUDIT_2025.md#critical-no-versioning)

- [ ] **Implement v1 routes** (2 weeks, split across Weeks 8-9)
  - For each blueprint in `backend/routes/`:
    ```python
    # OLD: bp = Blueprint('quests', __name__, url_prefix='/api/quests')
    # NEW: bp = Blueprint('quests_v1', __name__, url_prefix='/api/v1/quests')
    ```
  - Files to update: All 50+ route files
  - Keep old routes active (add deprecation warnings in responses)
  - Update Swagger config to document both versions
  - Test: Verify old routes still work, new routes work identically

### Week 9: Response Format Standardization
- [ ] **Create standardized response envelope** (8 hours)
  - File: `backend/utils/response_formatter.py`
  - Standard success format:
    ```python
    def success_response(data, meta=None):
        return {
            'data': data,
            'meta': meta or {},
            'links': {},
        }
    ```
  - Update 10 high-traffic endpoints as pilot:
    - `/api/v1/auth/login`
    - `/api/v1/quests` (listing)
    - `/api/v1/tasks/:id/complete`
    - `/api/v1/badges` (listing)
    - `/api/v1/portfolio/:slug`
  - Test: Verify frontend compatibility
  - Reference: [API_DESIGN_AUDIT_2025.md](API_DESIGN_AUDIT_2025.md#critical-response-inconsistency)

- [ ] **Standardize pagination parameters** (6 hours)
  - Choose: `page` + `per_page` (more intuitive than limit/offset)
  - Create helper: `backend/utils/pagination.py`
    ```python
    def paginate(query, page, per_page, max_per_page=100):
        per_page = min(per_page, max_per_page)
        offset = (page - 1) * per_page
        return query.range(offset, offset + per_page - 1)
    ```
  - Update all listing endpoints to use consistent params
  - Add pagination metadata to responses
  - Reference: [API_DESIGN_AUDIT_2025.md](API_DESIGN_AUDIT_2025.md#critical-pagination-inconsistency)

### Week 10: Idempotency & Rate Limiting
- [ ] **Implement idempotency key support** (12 hours)
  - File: `backend/middleware/idempotency.py`
  - Decorator:
    ```python
    def require_idempotency(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            key = request.headers.get('Idempotency-Key')
            if key:
                cached = redis.get(f'idempotency:{key}')
                if cached:
                    return jsonify(json.loads(cached)), 200

            result = f(*args, **kwargs)

            if key:
                redis.setex(f'idempotency:{key}', 86400, json.dumps(result))

            return result
        return decorated
    ```
  - Add to endpoints:
    - `POST /api/v1/tasks/:id/complete`
    - `POST /api/v1/quests/:id/start`
    - `POST /api/v1/badges/:id/claim`
  - Test: Submit same request twice with same key, verify idempotent
  - Reference: [API_DESIGN_AUDIT_2025.md](API_DESIGN_AUDIT_2025.md#critical-idempotency)

- [ ] **Add rate limit headers** (4 hours)
  - File: `backend/middleware/rate_limiter.py`
  - Add headers to all responses:
    ```python
    @app.after_request
    def add_rate_limit_headers(response):
        if hasattr(request, 'rate_limit_info'):
            response.headers['X-RateLimit-Limit'] = request.rate_limit_info['limit']
            response.headers['X-RateLimit-Remaining'] = request.rate_limit_info['remaining']
            response.headers['X-RateLimit-Reset'] = request.rate_limit_info['reset_at']
        return response
    ```
  - Test: Make requests, verify headers present
  - Reference: [API_DESIGN_AUDIT_2025.md](API_DESIGN_AUDIT_2025.md#high-rate-limit-headers)

### Week 11: Webhooks & OAuth2 Foundation
- [ ] **Design webhook infrastructure** (8 hours)
  - File: `backend/routes/webhooks.py`
  - Tables needed:
    ```sql
    CREATE TABLE webhook_subscriptions (
      id UUID PRIMARY KEY,
      organization_id UUID REFERENCES organizations(id),
      event_type TEXT NOT NULL, -- 'quest.completed', 'task.submitted', etc.
      target_url TEXT NOT NULL,
      secret TEXT NOT NULL, -- For HMAC signature
      is_active BOOLEAN DEFAULT TRUE
    );
    ```
  - Implement signature verification (HMAC-SHA256)
  - Create event publisher for quest completions
  - Reference: [API_DESIGN_AUDIT_2025.md](API_DESIGN_AUDIT_2025.md#high-webhooks)

- [ ] **OAuth2 routes foundation** (12 hours)
  - File: `backend/routes/auth/oauth.py`
  - Endpoints:
    - `GET /api/v1/oauth/authorize` - Authorization endpoint
    - `POST /api/v1/oauth/token` - Token exchange
    - `POST /api/v1/oauth/revoke` - Token revocation
  - Use existing JWT infrastructure for tokens
  - Document OAuth2 flow in Swagger
  - Test: Manual OAuth2 flow with Postman
  - Reference: [API_DESIGN_AUDIT_2025.md](API_DESIGN_AUDIT_2025.md#high-oauth2)

---

## Months 3-4: Test Coverage Sprint

### Month 3: Critical Path Tests
- [ ] **Quest enrollment flow tests** (1 week)
  - Create: `frontend/src/pages/QuestPersonalizationWizard.test.jsx`
  - Tests (40+ total):
    - Wizard steps navigation (8 tests)
    - Pillar selection (6 tests)
    - Custom task addition (8 tests)
    - Form validation (10 tests)
    - API integration (8 tests)
  - Target: 80%+ coverage on wizard
  - Reference: [TEST_STRATEGY_AUDIT_2025.md](TEST_STRATEGY_AUDIT_2025.md#critical-quest-enrollment)

- [ ] **Task completion flow tests** (1 week)
  - Create: `frontend/src/components/quest/TaskEvidenceModal.test.jsx`
  - Tests (50+ total):
    - Modal rendering (8 tests)
    - Evidence type selection (10 tests)
    - File upload validation (15 tests)
    - Text evidence submission (8 tests)
    - API error handling (9 tests)
  - Target: 80%+ coverage on modal
  - Reference: [TEST_STRATEGY_AUDIT_2025.md](TEST_STRATEGY_AUDIT_2025.md#critical-task-completion)

- [ ] **Portfolio generation tests** (1 week)
  - Create: `frontend/src/pages/DiplomaPage.test.jsx`
  - Tests (55+ total):
    - Page rendering (10 tests)
    - Badge display (12 tests)
    - Achievement sections (15 tests)
    - Evidence gallery (18 tests)
  - Target: 70%+ coverage on diploma
  - Reference: [TEST_STRATEGY_AUDIT_2025.md](TEST_STRATEGY_AUDIT_2025.md#critical-portfolio)

### Month 4: Parent/Observer Tests & CI
- [ ] **Parent dashboard tests** (1 week)
  - Create: `frontend/src/pages/ParentDashboardPage.test.jsx`
  - Tests (80+ total):
    - Dashboard overview (15 tests)
    - Dependent profile CRUD (20 tests)
    - Acting-as-dependent switching (15 tests)
    - Progress viewing (15 tests)
    - Evidence upload (15 tests)
  - Target: 70%+ coverage
  - Reference: [TEST_STRATEGY_AUDIT_2025.md](TEST_STRATEGY_AUDIT_2025.md#parent-dashboard)

- [ ] **Backend test environment setup** (3 days)
  - Install Flask-WTF dependencies
  - Configure pytest in `.github/workflows/backend-tests.yml`
  - Run existing ~80 backend tests
  - Generate coverage reports
  - Fix any failing tests
  - Target: 40% backend coverage baseline
  - Reference: [TEST_STRATEGY_AUDIT_2025.md](TEST_STRATEGY_AUDIT_2025.md#backend-tests)

- [ ] **Integration test layer** (1 week)
  - Create: `frontend/src/tests/integration/`
  - Tests (10-15 total):
    - Auth flow end-to-end (login → dashboard) (5 tests)
    - Quest enrollment → task completion (3 tests)
    - Badge eligibility → selection (3 tests)
    - Parent → dependent interaction (4 tests)
  - Target: Establish integration layer
  - Reference: [TEST_STRATEGY_AUDIT_2025.md](TEST_STRATEGY_AUDIT_2025.md#integration-layer)

---

## Months 5-6: Performance & Architecture

### Month 5: Frontend Optimization
- [ ] **Implement route-based code splitting** (1 week)
  - File: `frontend/src/App.jsx`
  - Use React.lazy for all routes:
    ```jsx
    const DiplomaPage = lazy(() => import('./pages/DiplomaPage'));
    const QuestBadgeHub = lazy(() => import('./pages/QuestBadgeHub'));
    const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
    ```
  - Add Suspense boundaries with loading states
  - Update vite.config.js for manual chunking
  - Target: Reduce initial bundle from 192KB to <100KB
  - Reference: [PERFORMANCE_AUDIT_2025.md](PERFORMANCE_AUDIT_2025.md#8-frontend-bundle)

- [ ] **React component optimization** (1 week)
  - Add React.memo to large list components (QuestCard, TaskCard, BadgeCard)
  - Add useMemo to expensive computations in DiplomaPage, QuestDetail
  - Implement virtualization for long lists (react-window)
  - Test: React DevTools Profiler, verify reduced re-renders
  - Target: 30-50% reduction in render time
  - Reference: [PERFORMANCE_AUDIT_2025.md](PERFORMANCE_AUDIT_2025.md#9-react-optimization)

### Month 6: Backend Optimization & Refactoring
- [ ] **Refactor mega-files** (2 weeks)
  - Split parent/dashboard.py (1,405 lines) into:
    - `parent/dashboard.py` (overview, summary stats) ~300 lines
    - `parent/quests.py` (student quest progress) ~300 lines
    - `parent/evidence.py` (evidence viewing/uploading) ~300 lines
    - `parent/analytics.py` (student activity, insights) ~400 lines
  - Similar splits for other 4 mega-files
  - Test: Verify all endpoints still work
  - Reference: [CODE_QUALITY_AUDIT_2025.md](CODE_QUALITY_AUDIT_2025.md#hp-2-mega-files)

- [ ] **Admin analytics optimization** (3 days)
  - Implement shared base data cache
  - Reduce 4 separate queries to 1 shared query
  - Target: 70-85% reduction in analytics queries
  - Reference: [PERFORMANCE_AUDIT_2025.md](PERFORMANCE_AUDIT_2025.md#11-admin-analytics)

- [ ] **Implement cursor pagination** (3 days)
  - Add to high-traffic endpoints: `/api/v1/quests`, `/api/v1/tasks`
  - Provides consistent results even with real-time inserts
  - Target: Better performance for large datasets
  - Reference: [PERFORMANCE_AUDIT_2025.md](PERFORMANCE_AUDIT_2025.md#10-cursor-pagination)

---

## Tracking Progress

Use this checklist format in your Claude Code sessions:

```
Session Date: YYYY-MM-DD
Focus Area: [Week/Month from plan]

Completed:
- [x] Task name (file:line) - Notes on implementation
- [x] Task name (file:line) - Notes on implementation

In Progress:
- [ ] Task name (file:line) - Current status

Blocked:
- [ ] Task name - Blocker description

Next Session:
- Priority 1: [task]
- Priority 2: [task]
```

---

## Quick Reference

**Critical Paths (Do First):**
1. Week 1: Legal blockers (LICENSE, dependencies, password validation)
2. Weeks 2-4: FERPA compliance (disclosure logging, data export)
3. Weeks 5-7: Accessibility (skip nav, alt text, keyboard support, ARIA)
4. Weeks 8-11: API versioning (LMS partnerships)

**High Impact, Lower Urgency:**
- Months 3-4: Test coverage (prevent regressions)
- Months 5-6: Performance & refactoring (scale preparation)

**Files Changed Most Often:**
- `backend/routes/portfolio.py` - Performance critical
- `frontend/src/pages/DiplomaPage.jsx` - Accessibility + performance
- `frontend/src/pages/LoginPage.jsx` - Password validation
- `backend/requirements.txt` - Dependency updates
- All route files - API versioning

---

**Document Version:** 1.0
**Last Updated:** December 26, 2025
**Total Items:** 60+ actionable tasks across 6 months
