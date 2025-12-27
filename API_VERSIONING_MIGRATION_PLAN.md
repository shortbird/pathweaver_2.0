# API Versioning Migration Plan - Optio Platform

**Created:** December 26, 2025
**Status:** Ready for Implementation
**Target Completion:** Week 9 (January 10, 2026)
**Priority:** CRITICAL (Required for LMS Integrations)

---

## Executive Summary

This document outlines the complete strategy for implementing API versioning in the Optio Educational Platform. The migration will introduce a versioned API structure while maintaining backward compatibility for 6 months.

**Key Decision:** URL Path Versioning (e.g., `/api/v1/quests`)
**Migration Strategy:** Dual-support (both `/api/*` and `/api/v1/*` active)
**Deprecation Timeline:** 6 months from implementation

---

## Table of Contents

1. [Versioning Strategy](#versioning-strategy)
2. [Current API Inventory](#current-api-inventory)
3. [Migration Architecture](#migration-architecture)
4. [Implementation Plan](#implementation-plan)
5. [Deprecation Policy](#deprecation-policy)
6. [Testing Strategy](#testing-strategy)
7. [Documentation Requirements](#documentation-requirements)

---

## Versioning Strategy

### Why URL Path Versioning?

**Selected Strategy:** URL Path Versioning

```
Old: /api/quests
New: /api/v1/quests
Future: /api/v2/quests
```

**Rationale:**
- Clear and explicit version in URL
- Easy to test in browser/Postman
- Standard practice (Stripe, GitHub, Twitter, Canvas LMS)
- Simple routing logic
- Better developer experience

**Rejected Alternative: Header Versioning**
```
GET /api/quests
Accept: application/vnd.optio.v1+json
```
- Reason: Less visible, harder to test, more complex routing
- Use case: Could be added later for advanced clients

### Version Lifecycle

```
v1: December 2025 - Stable (current API contract)
    Support: Minimum 6 months after v2 release
    Sunset: June 2026 (if v2 released in January)

v2: Future (when breaking changes needed)
    Support: Until v3 released + 6 months

Legacy (/api/*): December 2025 - Deprecated
    Support: 6 months (until June 2026)
    Behavior: Identical to v1, with deprecation warnings
```

---

## Current API Inventory

### Total Endpoints: 288 across 86 route files

**By Domain:**
- Authentication: 12 endpoints
- Quests: 45 endpoints
- Tasks: 28 endpoints
- Badges: 18 endpoints
- Users: 32 endpoints
- Admin: 67 endpoints
- Social/Connections: 22 endpoints
- Portfolio: 15 endpoints
- Organizations: 14 endpoints
- Observers: 12 endpoints
- Dependents: 9 endpoints
- LMS Integration: 14 endpoints

**By HTTP Method:**
- GET: 156 endpoints (54%)
- POST: 89 endpoints (31%)
- PUT/PATCH: 28 endpoints (10%)
- DELETE: 15 endpoints (5%)

### Blueprint Mapping

**Current Blueprint Structure:**
```python
# Authentication
/api/auth/login              → auth/login.py
/api/auth/register           → auth/registration.py
/api/auth/refresh            → auth/session.py
/api/auth/password/*         → auth/password.py

# Quests
/api/quests                  → quest/listing.py
/api/quests/:id              → quest/detail.py
/api/quests/:id/enroll       → quest/enrollment.py
/api/quests/:id/complete     → quest/completion.py
/api/quests/:id/start-personalization → quest_personalization.py

# Tasks
/api/tasks/:id               → tasks.py
/api/tasks/:id/complete      → tasks.py
/api/tasks/:id/drop          → tasks.py

# Badges
/api/badges                  → badges.py
/api/badges/:id/claim        → badge_claiming.py

# Users
/api/users/me                → users/profile.py
/api/users/:id/dashboard     → users/dashboard.py
/api/users/:id/transcript    → users/transcript.py
/api/users/:id/completed-quests → users/completed_quests.py

# Admin
/api/admin/users             → admin/user_management.py
/api/admin/quests            → admin/quest_management.py
/api/admin/analytics         → admin/analytics.py
/api/admin/organizations     → admin/organization_management.py
/api/admin/ferpa             → admin/ferpa_compliance.py

# Portfolio
/api/portfolio/:slug         → portfolio.py

# Parent
/api/parent/dashboard        → parent/dashboard.py
/api/parent/analytics        → parent/analytics.py

# Dependent Profiles
/api/dependents              → dependents.py

# Observer
/api/observers               → observer.py

# Community
/api/community/friendships   → community.py

# LMS Integration
/lti/*                       → lms_integration.py
/api/lms/*                   → lms_integration.py
```

---

## Migration Architecture

### Directory Structure

**New Structure:**
```
backend/
├── routes/
│   ├── __init__.py          (registers both legacy and v1)
│   ├── v1/                  (NEW - versioned routes)
│   │   ├── __init__.py
│   │   ├── auth/
│   │   │   ├── __init__.py
│   │   │   ├── login.py
│   │   │   ├── registration.py
│   │   │   ├── session.py
│   │   │   └── password.py
│   │   ├── quest/
│   │   │   ├── __init__.py
│   │   │   ├── listing.py
│   │   │   ├── detail.py
│   │   │   ├── enrollment.py
│   │   │   └── completion.py
│   │   ├── tasks.py
│   │   ├── badges.py
│   │   ├── users/
│   │   ├── admin/
│   │   ├── portfolio.py
│   │   └── ... (all other routes)
│   ├── auth/               (LEGACY - deprecated)
│   ├── quest/              (LEGACY - deprecated)
│   └── ... (existing routes remain)
└── utils/
    ├── api_response.py     (NEW - standardized responses)
    ├── deprecation.py      (NEW - deprecation warnings)
    └── versioning.py       (NEW - version detection)
```

### Blueprint Registration Strategy

**Option 1: Copy Routes (Recommended for Week 8-9)**
- Copy existing route files to `/routes/v1/`
- Register both legacy and v1 blueprints
- Add deprecation warnings to legacy routes
- Allows gradual migration

**Option 2: Shared Code (Future Optimization)**
- Create base route logic
- Both legacy and v1 import from base
- Reduces code duplication
- More complex, deferred to v2

**Selected Approach:** Option 1 (Copy Routes)

```python
# backend/routes/v1/__init__.py
from flask import Blueprint

def register_v1_routes(app):
    """Register all v1 API routes."""
    # Auth routes
    from routes.v1.auth import register_auth_routes
    register_auth_routes(app, version='v1')

    # Quest routes
    from routes.v1.quest import register_quest_blueprints
    register_quest_blueprints(app, version='v1')

    # Tasks
    from routes.v1 import tasks
    app.register_blueprint(tasks.bp, url_prefix='/api/v1/tasks')

    # ... all other routes
```

---

## Implementation Plan

### Phase 1: Infrastructure Setup (Week 8, Days 1-2)

**Day 1: Create Core Utilities**

1. **Create standardized response utilities**
   - File: `backend/utils/api_response.py`
   - Functions: `success_response()`, `error_response()`, `paginated_response()`

2. **Create deprecation warning system**
   - File: `backend/utils/deprecation.py`
   - Functions: `add_deprecation_headers()`, `log_deprecated_access()`

3. **Create version detection middleware**
   - File: `backend/utils/versioning.py`
   - Functions: `detect_api_version()`, `require_version()`

**Implementation:**

```python
# backend/utils/api_response.py
from flask import jsonify
from datetime import datetime

def success_response(data, meta=None, links=None, status=200):
    """
    Standardized success response for API v1.

    Args:
        data: Response data (dict, list, or primitive)
        meta: Optional metadata (pagination, counts, etc.)
        links: Optional HATEOAS links
        status: HTTP status code (default: 200)

    Returns:
        Flask JSON response with standardized format
    """
    response = {"data": data}

    if meta:
        response["meta"] = meta

    if links:
        response["links"] = links

    return jsonify(response), status


def error_response(code, message, details=None, status=400):
    """
    Standardized error response for API v1.

    Args:
        code: Error code (e.g., 'QUEST_NOT_FOUND', 'VALIDATION_ERROR')
        message: Human-readable error message
        details: Optional error details (dict)
        status: HTTP status code (default: 400)

    Returns:
        Flask JSON response with standardized error format
    """
    from flask import g, request

    error = {
        "code": code,
        "message": message,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "request_id": getattr(g, 'correlation_id', None) or request.headers.get('X-Correlation-ID')
    }

    if details:
        error["details"] = details

    return jsonify({"error": error}), status


def paginated_response(data, page, per_page, total, base_url, status=200):
    """
    Standardized paginated response for API v1.

    Args:
        data: List of items for current page
        page: Current page number (1-indexed)
        per_page: Items per page
        total: Total number of items
        base_url: Base URL for pagination links
        status: HTTP status code (default: 200)

    Returns:
        Flask JSON response with pagination metadata
    """
    import math

    total_pages = math.ceil(total / per_page) if per_page > 0 else 0

    meta = {
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": total_pages
    }

    links = {
        "self": f"{base_url}?page={page}&per_page={per_page}",
        "first": f"{base_url}?page=1&per_page={per_page}",
        "last": f"{base_url}?page={total_pages}&per_page={per_page}" if total_pages > 0 else None,
        "next": f"{base_url}?page={page + 1}&per_page={per_page}" if page < total_pages else None,
        "prev": f"{base_url}?page={page - 1}&per_page={per_page}" if page > 1 else None
    }

    return success_response(data, meta=meta, links=links, status=status)
```

```python
# backend/utils/deprecation.py
from flask import g
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

DEPRECATION_SUNSET_DATE = "2026-06-30"  # 6 months from December 2025


def add_deprecation_headers(response, sunset_date=None):
    """
    Add deprecation headers to legacy API responses.

    Args:
        response: Flask response object
        sunset_date: Optional custom sunset date (ISO 8601 format)

    Returns:
        Modified response with deprecation headers
    """
    sunset = sunset_date or DEPRECATION_SUNSET_DATE

    response.headers['Deprecation'] = 'true'
    response.headers['Sunset'] = sunset
    response.headers['Link'] = '</api/v1>; rel="successor-version"'
    response.headers['X-API-Warning'] = (
        f'This API endpoint is deprecated and will be removed on {sunset}. '
        'Please migrate to /api/v1/* endpoints.'
    )

    return response


def log_deprecated_access(endpoint, user_id=None):
    """
    Log access to deprecated endpoints for analytics.

    Args:
        endpoint: The deprecated endpoint being accessed
        user_id: Optional user ID for tracking
    """
    logger.warning(
        f"Deprecated API access: {endpoint}",
        extra={
            "endpoint": endpoint,
            "user_id": user_id,
            "correlation_id": getattr(g, 'correlation_id', None),
            "timestamp": datetime.utcnow().isoformat()
        }
    )
```

```python
# backend/utils/versioning.py
from flask import request
import re


def detect_api_version():
    """
    Detect API version from request path.

    Returns:
        str: API version ('v1', 'v2', 'legacy')
    """
    path = request.path

    # Check for versioned path
    version_match = re.search(r'/api/(v\d+)/', path)
    if version_match:
        return version_match.group(1)

    # Check for legacy /api/* path
    if path.startswith('/api/'):
        return 'legacy'

    return None


def require_version(min_version='v1'):
    """
    Decorator to require minimum API version.

    Args:
        min_version: Minimum required version (e.g., 'v1', 'v2')

    Returns:
        Decorator function
    """
    def decorator(f):
        from functools import wraps
        from flask import jsonify

        @wraps(f)
        def decorated_function(*args, **kwargs):
            current_version = detect_api_version()

            if current_version == 'legacy':
                return jsonify({
                    "error": {
                        "code": "VERSION_REQUIRED",
                        "message": f"This endpoint requires API version {min_version} or higher. Please use /api/{min_version}/* endpoints."
                    }
                }), 400

            return f(*args, **kwargs)

        return decorated_function
    return decorator
```

**Day 2: Create v1 Directory Structure**

```bash
# Create v1 directory structure
mkdir -p backend/routes/v1/auth
mkdir -p backend/routes/v1/quest
mkdir -p backend/routes/v1/admin
mkdir -p backend/routes/v1/parent
mkdir -p backend/routes/v1/users
mkdir -p backend/routes/v1/tutor
```

### Phase 2: High-Priority Routes Migration (Week 8, Days 3-5)

**Priority 1: Authentication Routes**
- Copy `routes/auth/*.py` to `routes/v1/auth/`
- Update blueprint url_prefix: `/api/v1/auth`
- Add standardized responses
- Test login/register/refresh flows

**Priority 2: Quest Routes**
- Copy `routes/quest/*.py` to `routes/v1/quest/`
- Update blueprint url_prefix: `/api/v1/quests`
- Add standardized responses
- Test quest listing, detail, enrollment

**Priority 3: Task Routes**
- Copy `routes/tasks.py` to `routes/v1/tasks.py`
- Update blueprint url_prefix: `/api/v1/tasks`
- Add standardized responses
- Test task completion flow

**Priority 4: Badge Routes**
- Copy `routes/badges.py`, `routes/badge_claiming.py` to `routes/v1/`
- Update blueprint url_prefix: `/api/v1/badges`
- Add standardized responses

**Priority 5: User Profile Routes**
- Copy `routes/users/*.py` to `routes/v1/users/`
- Update blueprint url_prefix: `/api/v1/users`
- Add standardized responses

### Phase 3: Medium-Priority Routes Migration (Week 9, Days 1-3)

**Admin Routes:**
- Copy all `routes/admin/*.py` to `routes/v1/admin/`
- Update blueprint url_prefix: `/api/v1/admin`
- Add standardized responses

**Portfolio Routes:**
- Copy `routes/portfolio.py` to `routes/v1/portfolio.py`
- Update blueprint url_prefix: `/api/v1/portfolio`
- Add standardized responses

**Parent/Dependent Routes:**
- Copy `routes/parent/*.py` to `routes/v1/parent/`
- Copy `routes/dependents.py` to `routes/v1/dependents.py`
- Update blueprint url_prefix: `/api/v1/parent`, `/api/v1/dependents`

**Observer Routes:**
- Copy `routes/observer.py` to `routes/v1/observer.py`
- Update blueprint url_prefix: `/api/v1/observers`

### Phase 4: Low-Priority Routes Migration (Week 9, Days 4-5)

**Community/Social:**
- Copy `routes/community.py` to `routes/v1/community.py`
- Copy `routes/direct_messages.py` to `routes/v1/direct_messages.py`

**AI Features:**
- Copy `routes/tutor/*.py` to `routes/v1/tutor/`
- Copy `routes/student_ai_assistance.py` to `routes/v1/`
- Copy `routes/quest_ai.py` to `routes/v1/`

**LMS Integration:**
- Copy `routes/lms_integration.py` to `routes/v1/lms_integration.py`
- Copy `routes/spark_integration.py` to `routes/v1/spark_integration.py`

**Misc Routes:**
- Copy all remaining routes to `routes/v1/`

### Phase 5: Legacy Route Deprecation (Week 9, Day 5)

**Add Deprecation Decorator:**

```python
# backend/routes/decorators.py
from functools import wraps
from flask import g
from utils.deprecation import add_deprecation_headers, log_deprecated_access


def deprecated_route(f):
    """
    Decorator to mark legacy routes as deprecated.
    Adds deprecation headers and logs access.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Log deprecated access
        user_id = getattr(g, 'user_id', None)
        log_deprecated_access(request.path, user_id)

        # Execute original function
        result = f(*args, **kwargs)

        # Add deprecation headers to response
        from flask import make_response
        response = make_response(result)
        return add_deprecation_headers(response)

    return decorated_function
```

**Apply to Legacy Routes:**

```python
# Example: routes/quest/listing.py (legacy)
from routes.decorators import deprecated_route

@quests_bp.route('/', methods=['GET'])
@deprecated_route  # ADD THIS
def get_quests():
    # Existing logic...
    pass
```

---

## Deprecation Policy

### Timeline

```
December 26, 2025: v1 API launched
                   Legacy /api/* marked as deprecated
                   Both versions fully supported

June 30, 2026:     Legacy /api/* endpoints removed
                   Only /api/v1/* (and future v2) supported
```

### Deprecation Headers

All legacy `/api/*` endpoints will include:

```http
HTTP/1.1 200 OK
Deprecation: true
Sunset: 2026-06-30
Link: </api/v1>; rel="successor-version"
X-API-Warning: This API endpoint is deprecated and will be removed on 2026-06-30. Please migrate to /api/v1/* endpoints.
```

### Migration Communication Plan

1. **Developer Documentation:**
   - Update API docs with migration guide
   - Add migration checklist
   - Provide code examples for common migrations

2. **In-App Notices:**
   - Admin dashboard banner: "API v1 available - migrate by June 2026"
   - Developer settings page with migration status

3. **Email Notifications:**
   - Month 0 (Dec 2025): v1 launch announcement
   - Month 3 (Mar 2026): Migration reminder
   - Month 5 (May 2026): Final warning (1 month until sunset)

4. **Analytics Tracking:**
   - Track legacy endpoint usage
   - Identify clients still using legacy API
   - Send targeted migration assistance

---

## Testing Strategy

### Unit Tests

```python
# tests/test_api_versioning.py
import pytest
from backend.app import app

def test_v1_endpoint_returns_standardized_response():
    """Test that v1 endpoints use standardized response format."""
    client = app.test_client()

    response = client.get('/api/v1/quests')
    data = response.get_json()

    # Check standardized format
    assert 'data' in data
    assert 'meta' in data
    assert 'links' in data

    # Check pagination metadata
    assert 'total' in data['meta']
    assert 'page' in data['meta']
    assert 'per_page' in data['meta']


def test_legacy_endpoint_includes_deprecation_headers():
    """Test that legacy endpoints include deprecation warnings."""
    client = app.test_client()

    response = client.get('/api/quests')

    # Check deprecation headers
    assert response.headers.get('Deprecation') == 'true'
    assert response.headers.get('Sunset') == '2026-06-30'
    assert '</api/v1>' in response.headers.get('Link', '')


def test_v1_and_legacy_return_same_data():
    """Test that v1 and legacy endpoints return equivalent data."""
    client = app.test_client()

    legacy_response = client.get('/api/quests')
    v1_response = client.get('/api/v1/quests')

    legacy_data = legacy_response.get_json()
    v1_data = v1_response.get_json()['data']

    # Compare actual data (ignoring wrapper format)
    assert legacy_data == v1_data
```

### Integration Tests

- Test all critical user flows with v1 endpoints
- Verify auth flows work with v1
- Test quest enrollment → task completion → badge claiming
- Verify admin operations

### E2E Tests

- Update Playwright tests to use `/api/v1/*` endpoints
- Keep separate test suite for legacy endpoints until sunset
- Monitor for any behavioral differences

---

## Documentation Requirements

### API Documentation Updates

1. **OpenAPI/Swagger Spec:**
   - Document all v1 endpoints
   - Include request/response examples
   - Add deprecation notices to legacy endpoints

2. **Migration Guide:**
   - File: `API_MIGRATION_GUIDE.md`
   - Mapping of legacy → v1 endpoints
   - Response format changes
   - Code examples for common operations

3. **Changelog:**
   - File: `API_CHANGELOG.md`
   - Document all breaking changes
   - Version-by-version changes
   - Migration tips

### Developer Portal

- Create `/api/docs` documentation page
- Interactive API explorer (Swagger UI)
- Migration checklist tool
- Version comparison tool

---

## Success Criteria

### Week 8 Completion (Planning + High-Priority Routes)

- [ ] API response utilities created
- [ ] Deprecation system implemented
- [ ] v1 directory structure created
- [ ] Auth routes migrated to v1
- [ ] Quest routes migrated to v1
- [ ] Task routes migrated to v1
- [ ] Badge routes migrated to v1
- [ ] User profile routes migrated to v1
- [ ] All high-priority routes tested
- [ ] Legacy routes have deprecation warnings

### Week 9 Completion (All Routes Migrated)

- [ ] All admin routes migrated to v1
- [ ] All parent/dependent routes migrated to v1
- [ ] All observer routes migrated to v1
- [ ] All community routes migrated to v1
- [ ] All AI routes migrated to v1
- [ ] All LMS integration routes migrated to v1
- [ ] All remaining routes migrated to v1
- [ ] 100% endpoint coverage in v1
- [ ] OpenAPI documentation updated
- [ ] Migration guide published
- [ ] E2E tests passing with v1 endpoints

---

## Risk Mitigation

### Potential Risks

1. **Frontend Breaking:**
   - Risk: Frontend still using legacy endpoints
   - Mitigation: Update frontend to use v1 in same PR
   - Fallback: Both endpoints work identically during transition

2. **External Integrations:**
   - Risk: LMS integrations using legacy endpoints
   - Mitigation: 6-month deprecation period
   - Fallback: Can extend sunset date if needed

3. **Response Format Changes:**
   - Risk: Clients expect old response format
   - Mitigation: Legacy endpoints keep old format during deprecation
   - Fallback: Provide adapter layer if needed

4. **Performance Impact:**
   - Risk: Duplicate route registration increases memory
   - Mitigation: Monitor memory usage, optimize if needed
   - Fallback: Remove least-used legacy endpoints early

---

## Post-Migration Tasks

1. **Monitor Legacy Usage:**
   - Track which endpoints still receiving legacy traffic
   - Identify clients needing migration assistance

2. **Performance Optimization:**
   - Remove duplicate code after migration complete
   - Optimize v1 route registration

3. **Version 2 Planning:**
   - Document breaking changes needed for v2
   - Plan v2 API improvements based on v1 feedback

---

## Appendix A: Blueprint Registration Example

**Before (Legacy):**
```python
# backend/routes/quest/listing.py
from flask import Blueprint

quests_bp = Blueprint('quests', __name__, url_prefix='/api/quests')

@quests_bp.route('/', methods=['GET'])
def get_quests():
    # Logic...
    return jsonify(quests)
```

**After (v1):**
```python
# backend/routes/v1/quest/listing.py
from flask import Blueprint, request
from utils.api_response import success_response, paginated_response

quests_bp = Blueprint('quests_v1', __name__, url_prefix='/api/v1/quests')

@quests_bp.route('/', methods=['GET'])
def get_quests():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    # Logic to get quests...
    quests, total = fetch_quests(page, per_page)

    # Use standardized pagination response
    return paginated_response(
        data=quests,
        page=page,
        per_page=per_page,
        total=total,
        base_url='/api/v1/quests'
    )
```

**Legacy (with deprecation):**
```python
# backend/routes/quest/listing.py (updated)
from flask import Blueprint
from routes.decorators import deprecated_route

quests_bp = Blueprint('quests_legacy', __name__, url_prefix='/api/quests')

@quests_bp.route('/', methods=['GET'])
@deprecated_route  # ADD THIS
def get_quests():
    # Keep existing logic unchanged
    return jsonify(quests)
```

---

## Appendix B: File Checklist

### Files to Create

- [ ] `backend/utils/api_response.py`
- [ ] `backend/utils/deprecation.py`
- [ ] `backend/utils/versioning.py`
- [ ] `backend/routes/decorators.py`
- [ ] `backend/routes/v1/__init__.py`
- [ ] `backend/routes/v1/auth/__init__.py`
- [ ] `backend/routes/v1/quest/__init__.py`
- [ ] `backend/routes/v1/admin/__init__.py`
- [ ] `backend/routes/v1/parent/__init__.py`
- [ ] `backend/routes/v1/users/__init__.py`
- [ ] `backend/routes/v1/tutor/__init__.py`
- [ ] `API_MIGRATION_GUIDE.md`
- [ ] `API_CHANGELOG.md`
- [ ] `tests/test_api_versioning.py`

### Files to Modify

- [ ] `backend/app.py` (register v1 routes)
- [ ] `backend/swagger_config.py` (document both versions)
- [ ] All existing route files (add `@deprecated_route` decorator)
- [ ] Frontend API client (`frontend/src/services/api.js`)
- [ ] E2E tests (update to use v1 endpoints)

---

**Document Version:** 1.0
**Last Updated:** December 26, 2025
**Next Review:** January 10, 2026 (post-implementation)
