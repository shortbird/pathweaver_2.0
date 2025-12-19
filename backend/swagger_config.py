"""
Swagger/OpenAPI Configuration for Optio Platform API
Provides interactive API documentation at /api/docs
"""

from flasgger import Swagger

# Swagger UI configuration
SWAGGER_CONFIG = {
    "headers": [],
    "specs": [
        {
            "endpoint": 'apispec',
            "route": '/api/docs/apispec.json',
            "rule_filter": lambda rule: True,  # Include all routes
            "model_filter": lambda tag: True,  # Include all models
        }
    ],
    "static_url_path": "/api/docs/flasgger_static",
    "swagger_ui": True,
    "specs_route": "/api/docs"
}

# OpenAPI 3.0 template
SWAGGER_TEMPLATE = {
    "swagger": "2.0",
    "info": {
        "title": "Optio Platform API",
        "description": """
# Optio Platform API Documentation

The Optio Platform API provides comprehensive access to all platform features including:
- Authentication and user management
- Quest and task management
- Badge system and achievements
- Parent/Observer dashboards
- AI-powered tutoring
- Administrative tools
- LMS integrations

## Authentication

All endpoints (except public routes) require authentication via httpOnly cookies:

1. **Login**: POST `/api/auth/login` with email/password
2. **Cookies**: Server sets httpOnly cookies automatically
3. **CSRF**: Include CSRF token in X-CSRF-Token header for POST/PUT/DELETE requests
4. **Refresh**: Token refresh handled automatically via cookies

### Safari/iOS Compatibility
Safari users automatically fall back to Authorization headers due to ITP (Intelligent Tracking Prevention).

## Core Concepts

### Quests
Self-paced learning projects that students can enroll in and complete. Two types:
- **Optio Quests**: Platform-created, open-enrollment quests
- **Course Quests**: Organization-specific courses from LMS imports

### Tasks
Individual assignments within quests. Students submit evidence, which advisors review and approve.

### XP System
Experience points awarded across 5 pillars:
- STEM (Science, Technology, Engineering, Math)
- Wellness (Health, Fitness, Mindfulness)
- Communication (Writing, Speaking, Presentation)
- Civics (History, Government, Community Service)
- Art (Visual Arts, Music, Performance)

### Badges
Achievements earned by completing quests and accumulating XP in specific pillars.

### Roles
- **Student**: Core user role (level 1)
- **Parent**: Manages dependent student profiles (level 2)
- **Observer**: View-only access to linked students (level -1, relationship-based)
- **Advisor**: Mentors and approves student work (level 3)
- **Admin**: Platform administrator (level 4)
- **Superadmin**: Full system access (level 5)

### Organizations
Enterprise/school groupings for account management. NOT used for multi-tenancy.

## Rate Limiting

Critical endpoints have rate limiting:
- Login: 5 attempts per 15 minutes
- Registration: 3 attempts per hour
- Password reset: 3 attempts per hour
- File uploads: 10 per minute

## Response Codes

- `200` - Success
- `201` - Created
- `400` - Bad request (validation error)
- `401` - Unauthorized (not authenticated)
- `403` - Forbidden (insufficient permissions)
- `404` - Not found
- `409` - Conflict (duplicate resource)
- `422` - Unprocessable entity (validation failed)
- `429` - Too many requests (rate limited)
- `500` - Internal server error

## Need Help?

- GitHub: https://github.com/anthropics/claude-code/issues
- Email: support@optioeducation.com
        """,
        "version": "3.0.0",
        "termsOfService": "https://www.optioeducation.com/terms",
        "contact": {
            "email": "tannerbowman@gmail.com",
            "name": "Optio Education Support",
            "url": "https://www.optioeducation.com"
        },
        "license": {
            "name": "Proprietary",
            "url": "https://www.optioeducation.com/license"
        }
    },
    "host": None,  # Will be set dynamically based on environment
    "basePath": "/",
    "schemes": ["https", "http"],
    "securityDefinitions": {
        "cookieAuth": {
            "type": "apiKey",
            "in": "header",
            "name": "Cookie",
            "description": "httpOnly cookies (access_token, refresh_token) set automatically after login"
        },
        "csrfToken": {
            "type": "apiKey",
            "in": "header",
            "name": "X-CSRF-Token",
            "description": "CSRF token required for POST/PUT/DELETE requests. Get from /csrf-token endpoint."
        },
        "bearerAuth": {
            "type": "apiKey",
            "in": "header",
            "name": "Authorization",
            "description": "Authorization header (Safari/iOS fallback): Bearer <token>"
        }
    },
    "security": [
        {"cookieAuth": []},
        {"csrfToken": []}
    ],
    "tags": [
        {"name": "Authentication", "description": "Login, registration, password management, session handling"},
        {"name": "Users", "description": "User profiles, settings, account management"},
        {"name": "Quests", "description": "Quest discovery, enrollment, completion, personalization"},
        {"name": "Tasks", "description": "Task management, evidence submission, approval workflow"},
        {"name": "Badges", "description": "Badge system, claiming, achievements"},
        {"name": "Evidence", "description": "Evidence document uploads, management, storage"},
        {"name": "Portfolio", "description": "Public diplomas, portfolio pages, achievements showcase"},
        {"name": "Connections", "description": "Student connections, friendships, social features"},
        {"name": "Parent Dashboard", "description": "Parent accounts, dependent management, evidence uploads"},
        {"name": "Observer", "description": "Observer role, invitations, student monitoring"},
        {"name": "Advisor", "description": "Advisor tools, check-ins, notes, student management"},
        {"name": "Admin - Users", "description": "User management, role changes, account operations"},
        {"name": "Admin - Quests", "description": "Quest creation, editing, management, AI generation"},
        {"name": "Admin - Badges", "description": "Badge creation, seeding, management"},
        {"name": "Admin - Analytics", "description": "Platform analytics, usage stats, reporting"},
        {"name": "Admin - Organizations", "description": "Organization management, quest access control"},
        {"name": "Admin - CRM", "description": "Email campaigns, templates, automation"},
        {"name": "AI Tutor", "description": "AI-powered tutoring, chat, learning assistance"},
        {"name": "LMS Integration", "description": "LTI integration, course imports, Spark SSO"},
        {"name": "Calendar", "description": "Learning events, calendar management"},
        {"name": "Settings", "description": "Platform settings, site configuration, public data"},
        {"name": "Services", "description": "Consultation booking, services catalog"},
        {"name": "Promo", "description": "Promotional campaigns, welcome flows"}
    ]
}

def init_swagger(app):
    """Initialize Swagger documentation for the Flask app"""

    # Set host dynamically based on environment
    import os
    env = os.getenv('FLASK_ENV', 'development')
    if env == 'production':
        SWAGGER_TEMPLATE['host'] = 'optio-prod-backend.onrender.com'
        SWAGGER_TEMPLATE['schemes'] = ['https']
    else:
        SWAGGER_TEMPLATE['host'] = 'optio-dev-backend.onrender.com'
        SWAGGER_TEMPLATE['schemes'] = ['https', 'http']

    swagger = Swagger(app, config=SWAGGER_CONFIG, template=SWAGGER_TEMPLATE)

    return swagger
