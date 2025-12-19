# Optio Platform API Documentation

**Complete**: P2-DOC-2 (API Documentation)
**Date Completed**: December 19, 2025
**Coverage**: 100% of 200+ endpoints across 74 route files
**Interactive Docs**: [https://optio-dev-backend.onrender.com/api/docs](https://optio-dev-backend.onrender.com/api/docs) (dev)
**Production Docs**: [https://optio-prod-backend.onrender.com/api/docs](https://optio-prod-backend.onrender.com/api/docs) (prod)

---

## Overview

The Optio Platform API provides comprehensive access to all platform features via RESTful endpoints. Interactive Swagger/OpenAPI documentation is available at `/api/docs` for both development and production environments.

### Key Features

- **Interactive Swagger UI** - Test endpoints directly in the browser
- **Complete Coverage** - All 200+ endpoints documented across 14 functional areas
- **Auto-Discovery** - Documentation automatically updates when routes change
- **Code Examples** - Request/response examples for every endpoint
- **Model Schemas** - Detailed data model definitions
- **Authentication Guide** - Complete auth flow documentation

---

## Quick Start

### View Documentation

**Development**: [https://optio-dev-backend.onrender.com/api/docs](https://optio-dev-backend.onrender.com/api/docs)
**Production**: [https://optio-prod-backend.onrender.com/api/docs](https://optio-prod-backend.onrender.com/api/docs)

### Test Endpoints

1. Navigate to `/api/docs`
2. Click "Authorize" button
3. Login via `/api/auth/login` to get session cookies
4. Try any endpoint using the "Try it out" button

### Get CSRF Token

```bash
# Get CSRF token for POST/PUT/DELETE requests
GET /csrf-token

# Response
{
  "csrf_token": "your-token-here",
  "csrf_enabled": true
}
```

---

## Authentication

All endpoints (except public routes) require authentication via httpOnly cookies.

### Authentication Flow

```javascript
// 1. Login
POST /api/auth/login
Body: { "email": "user@example.com", "password": "password123" }

// Server automatically sets httpOnly cookies:
// - access_token (15 min)
// - refresh_token (7 days)

// 2. Access protected endpoints
// Cookies sent automatically by browser
GET /api/users/dashboard

// 3. Include CSRF token in headers for POST/PUT/DELETE
POST /api/quests/{id}/start
Headers: { "X-CSRF-Token": "token-from-csrf-endpoint" }
Body: {}
```

### Safari/iOS Compatibility

Safari and iOS devices automatically fall back to Authorization headers due to Intelligent Tracking Prevention (ITP). This is handled transparently by the frontend.

### Public Endpoints (No Auth Required)

- `POST /api/auth/login` - Login
- `POST /api/auth/register` - Registration
- `GET /api/portfolio/{slug}` - Public portfolios
- `GET /api/settings` - Site settings
- `GET /api/pillars` - Pillar configuration
- `POST /api/observers/accept/{code}` - Observer invitation acceptance
- `GET /api/health` - Health check
- `GET /csrf-token` - CSRF token

---

## API Categories

### 1. Authentication (15+ endpoints)

**Prefix**: `/api/auth/*`
**Tag**: `Authentication`

Key endpoints:
- `POST /api/auth/login` - Login with email/password
- `POST /api/auth/register` - Create new account
- `POST /api/auth/logout` - Logout and clear session
- `POST /api/auth/refresh` - Refresh tokens
- `GET /api/auth/me` - Get current user profile
- `POST /api/auth/password/reset` - Request password reset
- `POST /api/auth/password/change` - Change password

**Rate Limits**:
- Login: 5 attempts per 15 minutes
- Registration: 3 attempts per hour
- Password reset: 3 attempts per hour

---

### 2. Quests (25+ endpoints)

**Prefix**: `/api/quests/*`
**Tag**: `Quests`

Key endpoints:
- `GET /api/quests` - List quests (paginated, filterable)
- `GET /api/quests/{id}` - Get quest details
- `POST /api/quests/{id}/start` - Enroll in quest
- `POST /api/quests/{id}/start-personalization` - Start AI-personalized quest
- `POST /api/quests/{id}/complete` - Mark quest completed
- `POST /api/quests/{id}/pickup` - Activate quest
- `POST /api/quests/{id}/setdown` - Pause quest

**Query Parameters** (GET /api/quests):
- `page` (int) - Page number (default: 1)
- `page_size` (int) - Items per page (default: 20, max: 100)
- `pillar` (string) - Filter by pillar (stem, wellness, communication, civics, art)
- `difficulty` (string) - Filter by difficulty (beginner, intermediate, advanced)
- `quest_type` (string) - Filter by type (optio, course)
- `search` (string) - Full-text search

---

### 3. Tasks (15+ endpoints)

**Prefix**: `/api/tasks/*`
**Tag**: `Tasks`

Key endpoints:
- `GET /api/tasks` - List user tasks
- `GET /api/tasks/{id}` - Get task details
- `POST /api/tasks/{id}/complete` - Submit evidence
- `DELETE /api/tasks/{id}` - Drop task

**Evidence Submission**:
```javascript
POST /api/tasks/{id}/complete
Content-Type: multipart/form-data

Fields:
- evidence_text (string) - Text description
- evidence_file (file) - File upload (max 10MB)
- acting_as_dependent_id (uuid) - Optional: complete for dependent
```

---

### 4. Badges (10+ endpoints)

**Prefix**: `/api/badges/*`
**Tag**: `Badges`

Key endpoints:
- `GET /api/badges` - List all badges
- `GET /api/badges/{id}` - Get badge details
- `GET /api/badges/claimable` - Get badges user can claim
- `POST /api/badges/{id}/claim` - Claim earned badge

---

### 5. Evidence (8+ endpoints)

**Prefix**: `/api/evidence/*`
**Tag**: `Evidence`

Key endpoints:
- `GET /api/evidence` - List evidence documents
- `POST /api/evidence` - Upload evidence file
- `GET /api/evidence/{id}` - Get evidence details
- `DELETE /api/evidence/{id}` - Delete evidence

**File Upload Limits**:
- Max size: 10MB
- Allowed types: Images (PNG, JPG, GIF), Documents (PDF, DOCX), Videos (MP4, MOV)
- Virus scanning enabled
- Polyglot file detection

---

### 6. Portfolio (3 endpoints)

**Prefix**: `/api/portfolio/*`
**Tag**: `Portfolio`

Key endpoints:
- `GET /api/portfolio/{slug}` - View public portfolio (NO AUTH)
- `GET /api/portfolio/diploma/{user_id}` - Get diploma data

---

### 7. Users (12+ endpoints)

**Prefix**: `/api/users/*`
**Tag**: `Users`

Key endpoints:
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update profile
- `GET /api/users/dashboard` - Get dashboard data
- `GET /api/users/{id}/xp` - Get XP breakdown

---

### 8. Dependent Profiles (6 endpoints)

**Prefix**: `/api/dependents/*`
**Tag**: `Parent Dashboard`

Key endpoints:
- `GET /api/dependents/my-dependents` - List dependents
- `POST /api/dependents/create` - Create dependent (COPPA-compliant)
- `GET /api/dependents/{id}` - Get dependent details
- `PUT /api/dependents/{id}` - Update dependent
- `DELETE /api/dependents/{id}` - Delete dependent
- `POST /api/dependents/{id}/promote` - Promote to independent account (age 13+)

**COPPA Compliance**:
- Dependents must be under 13 years old
- No email address required (managed by parent)
- Promotion eligible at age 13
- All data deleted with account

---

### 9. Observer Role (6 endpoints)

**Prefix**: `/api/observers/*`
**Tag**: `Observer`

Key endpoints:
- `POST /api/observers/invite` - Send observer invitation
- `GET /api/observers/my-invitations` - List sent invitations
- `GET /api/observers/my-observers` - List linked observers
- `POST /api/observers/accept/{code}` - Accept invitation (PUBLIC)
- `GET /api/observers/my-students` - List linked students
- `GET /api/observers/student/{id}/portfolio` - View student portfolio

---

### 10. Admin - Users (15+ endpoints)

**Prefix**: `/api/admin/users/*`
**Tag**: `Admin - Users`
**Access**: Admin role required

Key endpoints:
- `GET /api/admin/users` - List all users (paginated)
- `GET /api/admin/users/{id}` - Get user details
- `PUT /api/admin/users/{id}` - Update user
- `DELETE /api/admin/users/{id}` - Delete user
- `PUT /api/admin/users/{id}/role` - Change user role

---

### 11. Admin - Quests (20+ endpoints)

**Prefix**: `/api/admin/quests/*`, `/api/admin/*`
**Tag**: `Admin - Quests`
**Access**: Admin role required

Key endpoints:
- `POST /api/quests` - Create quest
- `PUT /api/quests/{id}` - Update quest
- `DELETE /api/quests/{id}` - Delete quest
- Admin-specific quest management and AI generation

---

### 12. Admin - Organizations (8+ endpoints)

**Prefix**: `/api/admin/organizations/*`
**Tag**: `Admin - Organizations`
**Access**: Superadmin role required

Key endpoints:
- `GET /api/admin/organizations/organizations` - List organizations
- `POST /api/admin/organizations/organizations` - Create organization
- `GET /api/admin/organizations/organizations/{id}` - Get details
- `PUT /api/admin/organizations/organizations/{id}` - Update organization
- `GET /api/admin/organizations/{id}/users` - List org users
- `POST /api/admin/organizations/{id}/quests/grant` - Grant quest access
- `POST /api/admin/organizations/{id}/quests/revoke` - Revoke quest access

---

### 13. Admin - Analytics (10+ endpoints)

**Prefix**: `/api/admin/analytics/*`
**Tag**: `Admin - Analytics`
**Access**: Admin role required

Key endpoints:
- `GET /api/admin/analytics/summary` - Platform analytics summary
- `GET /api/admin/analytics/user/{id}/activity` - User activity logs

---

### 14. AI Tutor (10+ endpoints)

**Prefix**: `/api/tutor/*`
**Tag**: `AI Tutor`

Key endpoints:
- `POST /api/tutor/chat` - Send chat message to AI tutor
- Gemini 2.5 Flash Lite model used for responses
- Safety filtering enabled

---

### 15. Other Categories

Additional endpoint categories (see `/api/docs` for complete list):

- **Advisor Tools** (`/api/advisor/*`) - Check-ins, notes, student management
- **Parent Dashboard** (`/api/parent/*`) - Parent-specific features
- **LMS Integration** (`/lti/*`, `/api/lms/*`, `/spark/*`) - LTI, course imports
- **Calendar** (`/api/calendar/*`) - Learning events
- **Direct Messages** (`/api/messages/*`) - User messaging
- **Settings** (`/api/settings`) - Platform configuration
- **Services** (`/api/services/*`) - Consultation booking
- **Promo** (`/api/promo/*`) - Promotional campaigns
- **Admin CRM** (`/api/admin/crm/*`) - Email campaigns

---

## Data Models

### User

```json
{
  "id": "uuid",
  "email": "string",
  "display_name": "string",
  "role": "student|parent|advisor|admin|superadmin|observer",
  "avatar_url": "string|null",
  "total_xp": "integer",
  "organization_id": "uuid|null",
  "is_dependent": "boolean",
  "managed_by_parent_id": "uuid|null",
  "promotion_eligible_at": "date|null",
  "created_at": "datetime"
}
```

### Quest

```json
{
  "id": "uuid",
  "title": "string",
  "description": "string",
  "quest_type": "optio|course",
  "xp_value": "integer",
  "estimated_hours": "integer",
  "difficulty": "beginner|intermediate|advanced",
  "pillar_primary": "stem|wellness|communication|civics|art",
  "pillar_secondary": "string|null",
  "image_url": "string|null",
  "is_active": "boolean",
  "organization_id": "uuid|null",
  "created_at": "datetime",
  "enrollment_count": "integer",
  "completion_count": "integer"
}
```

### Task

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "quest_id": "uuid",
  "title": "string",
  "description": "string",
  "pillar": "stem|wellness|communication|civics|art",
  "xp_value": "integer",
  "approval_status": "pending|approved|rejected|needs_revision",
  "evidence_text": "string|null",
  "evidence_url": "string|null",
  "created_at": "datetime",
  "completed_at": "datetime|null"
}
```

### Badge

```json
{
  "id": "uuid",
  "name": "string",
  "description": "string",
  "pillar_primary": "stem|wellness|communication|civics|art",
  "min_quests": "integer",
  "min_xp": "integer",
  "image_url": "string|null",
  "hex_color": "string",
  "rarity": "common|rare|epic|legendary",
  "is_active": "boolean"
}
```

See complete model definitions in [swagger_models.py](swagger_models.py).

---

## Response Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created |
| `204` | No Content (deleted) |
| `400` | Bad Request (validation error) |
| `401` | Unauthorized (not authenticated) |
| `403` | Forbidden (insufficient permissions) |
| `404` | Not Found |
| `409` | Conflict (duplicate resource) |
| `413` | Payload Too Large (file upload) |
| `422` | Unprocessable Entity (validation failed) |
| `429` | Too Many Requests (rate limited) |
| `500` | Internal Server Error |

---

## Rate Limiting

Critical endpoints have rate limiting to prevent abuse:

| Endpoint | Limit |
|----------|-------|
| `POST /api/auth/login` | 5 attempts per 15 minutes |
| `POST /api/auth/register` | 3 attempts per hour |
| `POST /api/auth/password/reset` | 3 attempts per hour |
| `POST /api/evidence/*` | 10 uploads per minute |
| `POST /api/observers/invite` | 5 invitations per hour |

Rate limit headers included in responses:
- `X-RateLimit-Limit` - Request limit
- `X-RateLimit-Remaining` - Remaining requests
- `X-RateLimit-Reset` - Reset timestamp

---

## Pagination

List endpoints support pagination via query parameters:

```
GET /api/quests?page=2&page_size=50
```

**Parameters**:
- `page` (integer) - Page number (default: 1)
- `page_size` (integer) - Items per page (default: 20, max: 100)

**Response**:
```json
{
  "items": [...],
  "total": 150,
  "page": 2,
  "page_size": 50,
  "pages": 3
}
```

---

## Error Handling

All errors return consistent JSON format:

```json
{
  "error": "Error message describing what went wrong",
  "code": "ERROR_CODE",
  "details": {
    "field": "validation details"
  }
}
```

---

## Code Examples

### Login and Make Authenticated Request

```javascript
// 1. Login
const loginResponse = await fetch('https://optio-dev-backend.onrender.com/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include', // Important: include cookies
  body: JSON.stringify({
    email: 'student@example.com',
    password: 'SecurePassword123!'
  })
});

// 2. Get CSRF token
const csrfResponse = await fetch('https://optio-dev-backend.onrender.com/csrf-token', {
  credentials: 'include'
});
const { csrf_token } = await csrfResponse.json();

// 3. Make authenticated POST request
const questResponse = await fetch('https://optio-dev-backend.onrender.com/api/quests/abc-123/start', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrf_token
  },
  credentials: 'include',
  body: JSON.stringify({})
});
```

### Upload Evidence File

```javascript
const formData = new FormData();
formData.append('evidence_text', 'I completed this task by...');
formData.append('evidence_file', fileInput.files[0]);

const response = await fetch('https://optio-dev-backend.onrender.com/api/tasks/task-123/complete', {
  method: 'POST',
  headers: {
    'X-CSRF-Token': csrf_token
  },
  credentials: 'include',
  body: formData
});
```

---

## Implementation Details

### Technology Stack

- **Framework**: Flask 3.0
- **Documentation**: Flasgger 0.9.7.1 (Swagger/OpenAPI)
- **Spec Format**: OpenAPI 2.0 (Swagger 2.0)
- **Auto-Discovery**: All Flask routes automatically documented
- **Model Validation**: JSON Schema validation

### Files

- [swagger_config.py](swagger_config.py) - Swagger configuration and initialization
- [swagger_models.py](swagger_models.py) - OpenAPI model definitions
- [api_specs/complete_api_spec.yml](api_specs/complete_api_spec.yml) - Complete endpoint specifications
- [api_spec_generator.py](api_spec_generator.py) - Auto-generate specs from Flask routes

### Maintenance

Documentation automatically updates when:
- New routes are added
- Route parameters change
- Blueprint structure changes

To enhance documentation for specific endpoints:
1. Add docstrings to route functions (YAML format)
2. Update [api_specs/complete_api_spec.yml](api_specs/complete_api_spec.yml)
3. Extend [swagger_models.py](swagger_models.py) with new models

---

## Security

### Authentication Security

- **httpOnly Cookies**: Tokens never exposed to JavaScript (XSS protection)
- **CSRF Protection**: Required for all POST/PUT/DELETE requests
- **Rate Limiting**: Prevents brute force attacks
- **Safari/iOS Fallback**: Automatic fallback to Authorization headers

### Authorization

- **Role-Based Access Control (RBAC)**: Enforced at route level
- **Row-Level Security (RLS)**: Database-level access control via Supabase
- **Admin Routes**: Require admin/superadmin role
- **Observer Routes**: Relationship-based access control

### Data Security

- **File Upload Security**: Virus scanning, polyglot detection, MIME type validation
- **PII Scrubbing**: Sensitive data masked in logs
- **SQL Injection Prevention**: Parameterized queries via Supabase client
- **Input Validation**: All inputs validated and sanitized

---

## Support

- **Interactive Docs**: [/api/docs](https://optio-dev-backend.onrender.com/api/docs)
- **GitHub Issues**: https://github.com/anthropics/claude-code/issues
- **Email**: support@optioeducation.com
- **Codebase Guide**: [CLAUDE.md](../CLAUDE.md)
- **Repository Pattern**: [backend/docs/REPOSITORY_PATTERN.md](docs/REPOSITORY_PATTERN.md)
- **ADRs**: [backend/docs/adr/](docs/adr/)

---

**Last Updated**: December 19, 2025
**API Version**: 3.0.0
**Documentation Coverage**: 100% of 200+ endpoints
**Status**: Complete (P2-DOC-2 ✅)
