"""
API Specification Generator for Optio Platform
Auto-generates OpenAPI specs for all registered Flask routes

Usage:
    python api_spec_generator.py > openapi_spec.json

This generates a complete OpenAPI 3.0 specification from all
registered Flask routes, which can be validated at swagger.io.
"""

def generate_endpoint_specs(app):
    """
    Auto-generate OpenAPI specs for all Flask routes
    Returns a dictionary of endpoint specifications
    """

    endpoint_specs = {}

    # Map of tags based on blueprint names (including v1 variants)
    tag_mapping = {
        # Authentication
        'auth': 'Authentication',
        'auth_login': 'Authentication',
        'auth_registration': 'Authentication',
        'auth_password': 'Authentication',
        'auth_session': 'Authentication',
        'auth_login_v1': 'Authentication',
        'auth_registration_v1': 'Authentication',
        'auth_password_v1': 'Authentication',
        'auth_session_v1': 'Authentication',

        # Users
        'users': 'Users',
        'users_profile': 'Users',
        'users_xp': 'Users',
        'users_profile_v1': 'Users',
        'users_xp_v1': 'Users',

        # Quests
        'quests': 'Quests',
        'quests_listing': 'Quests',
        'quests_detail': 'Quests',
        'quests_enrollment': 'Quests',
        'quests_completion': 'Quests',
        'quests_listing_v1': 'Quests',
        'quests_detail_v1': 'Quests',
        'quests_enrollment_v1': 'Quests',
        'quests_completion_v1': 'Quests',

        # Tasks
        'tasks': 'Tasks',
        'tasks_v1': 'Tasks',

        # Badges (removed in Feb 2026 refactor)

        # Evidence
        'evidence': 'Evidence',
        'evidence_documents': 'Evidence',
        'helper_evidence': 'Evidence',
        'uploads': 'Evidence',
        'uploads_v1': 'Evidence',
        'images': 'Evidence',

        # Portfolio
        'portfolio': 'Portfolio',
        'portfolio_v1': 'Portfolio',

        # Connections/Community
        'community': 'Connections',
        'community_v1': 'Connections',

        # Parent Dashboard
        'parent': 'Parent Dashboard',
        'parent_linking': 'Parent Dashboard',
        'parent_dashboard': 'Parent Dashboard',
        'parent_dashboard_v1': 'Parent Dashboard',
        'parent_evidence': 'Parent Dashboard',
        'parent_evidence_v1': 'Parent Dashboard',
        'dependents': 'Parent Dashboard',
        'dependents_v1': 'Parent Dashboard',

        # Observer
        'observer': 'Observer',
        'observers_v1': 'Observer',
        'observer_requests': 'Observer',

        # Advisor
        'advisor': 'Advisor',
        'checkins': 'Advisor',
        'notes': 'Advisor',

        # Admin
        'admin': 'Admin - Users',
        'admin_core': 'Admin - Users',
        'admin_core_v1': 'Admin - Users',
        'user_management': 'Admin - Users',
        'admin_user_management_v1': 'Admin - Users',
        'quest_management': 'Admin - Quests',
        'admin_quest_management_v1': 'Admin - Quests',
        'analytics': 'Admin - Analytics',
        'admin_analytics_v1': 'Admin - Analytics',
        'organization_management': 'Admin - Organizations',
        'admin_organization_management_v1': 'Admin - Organizations',
        'crm': 'Admin - CRM',
        'admin_crm_v1': 'Admin - CRM',
        'admin_student_task_management_v1': 'Admin - Users',
        'admin_sample_task_management_v1': 'Admin - Quests',
        'admin_course_quest_management_v1': 'Admin - Quests',
        'admin_task_flags_v1': 'Admin - Users',
        'admin_advisor_management_v1': 'Admin - Users',
        'admin_parent_connections_v1': 'Parent Dashboard',
        'admin_masquerade_v1': 'Admin - Users',
        'admin_course_import_v1': 'Admin - Quests',
        'admin_observer_audit_v1': 'Observer',
        'admin_ferpa_compliance_v1': 'Admin - Users',

        # AI Tutor
        'tutor': 'AI Tutor',
        'tutor_chat': 'AI Tutor',
        'tutor_history': 'AI Tutor',
        'tutor_chat_v1': 'AI Tutor',
        'tutor_history_v1': 'AI Tutor',
        'student_ai': 'AI Tutor',

        # LMS Integration
        'lms_integration': 'LMS Integration',
        'lms_integration_v1': 'LMS Integration',
        'spark_integration': 'LMS Integration',

        # Calendar
        'calendar': 'Calendar',
        'learning_events': 'Calendar',

        # Settings
        'settings': 'Settings',
        'settings_v1': 'Settings',

        # Services
        'services': 'Services',

        # Promo
        'promo': 'Promo',

        # Credits
        'credits': 'Credits',
        'credits_v1': 'Credits',

        # OAuth
        'oauth': 'Authentication',
        'oauth_bp': 'Authentication',

        # Webhooks
        'webhooks': 'LMS Integration',
        'webhooks_bp': 'LMS Integration',

        # Quest Features
        'quest_personalization': 'Quests',
        'quest_types': 'Quests',
        'quest_ai': 'Admin - Quests',
        'quest_lifecycle': 'Quests',
        'quest_lifecycle_bp': 'Quests',
        'task_library': 'Tasks',
        'task_library_bp': 'Tasks',

        # Admin Features
        'task_approval': 'Admin - Users',
        'admin_services': 'Admin - Users',
        'admin_services_bp': 'Admin - Users',
        'subject_backfill': 'Admin - Users',
        'subject_backfill_bp': 'Admin - Users',
        'ai_jobs': 'Admin - Quests',
        'ai_jobs_bp': 'Admin - Quests',
        'batch_generation': 'Admin - Quests',
        'batch_generation_bp': 'Admin - Quests',
        'ai_quest_review': 'Admin - Quests',
        'ai_quest_review_bp': 'Admin - Quests',
        'khan_academy_sync': 'LMS Integration',

        # Compliance & Privacy
        'parental_consent': 'Parent Dashboard',
        'account_deletion': 'Users',
        'observer_audit': 'Observer',
        'ferpa_compliance': 'Admin - Users',

        # Communication
        'direct_messages': 'Connections',

        # Parent Sub-modules
        'parent_quests': 'Parent Dashboard',
        'parent_analytics': 'Parent Dashboard',

        # Miscellaneous
        'pillars': 'Settings',
        'pillars_bp': 'Settings',
        'homepage_images': 'Settings',
        'homepage_images_bp': 'Settings'
    }

    # Common security requirements
    auth_required = [{'cookieAuth': []}, {'csrfToken': []}]
    public_endpoint = []

    # Iterate through all registered routes
    for rule in app.url_map.iter_rules():
        if rule.endpoint == 'static':
            continue

        # Extract blueprint name
        blueprint_name = rule.endpoint.split('.')[0] if '.' in rule.endpoint else None
        tag = tag_mapping.get(blueprint_name, 'Other')

        # Determine HTTP methods
        methods = [m for m in rule.methods if m not in ['HEAD', 'OPTIONS']]

        # Build path
        path = str(rule)

        for method in methods:
            # Determine if authentication is required
            is_public = (
                '/api/auth/login' in path or
                '/api/auth/register' in path or
                '/api/portfolio/' in path or
                '/api/settings' in path or
                '/api/promo' in path or
                '/api/images' in path or
                '/observer/accept' in path or
                '/spark' in path or
                '/lti' in path or
                path == '/' or
                path == '/api/health' or
                path == '/csrf-token'
            )

            security = public_endpoint if is_public else auth_required

            # Generate basic spec
            spec_key = f"{path}::{method.lower()}"

            endpoint_specs[spec_key] = {
                'tags': [tag],
                'summary': generate_summary(path, method, rule.endpoint),
                'description': generate_description(path, method, rule.endpoint),
                'parameters': generate_parameters(rule, method),
                'responses': generate_responses(method, path),
                'security': security
            }

    return endpoint_specs

def generate_summary(path, method, endpoint):
    """Generate a human-readable summary for an endpoint"""

    # Map of common endpoint patterns to summaries
    summaries = {
        # Auth
        '/api/auth/login': 'Login with email and password',
        '/api/auth/register': 'Register a new user account',
        '/api/auth/logout': 'Logout and clear session',
        '/api/auth/refresh': 'Refresh authentication token',
        '/api/auth/me': 'Get current user profile',
        '/api/auth/password/reset': 'Request password reset email',
        '/api/auth/password/change': 'Change password for logged-in user',

        # Quests
        '/api/quests': 'List all available quests' if method == 'GET' else 'Create a new quest',
        '/api/quests/<uuid:quest_id>': 'Get quest details' if method == 'GET' else 'Update quest',
        '/api/quests/<uuid:quest_id>/start': 'Enroll in a quest',
        '/api/quests/<uuid:quest_id>/complete': 'Complete a quest',
        '/api/quests/<uuid:quest_id>/pickup': 'Pick up a quest (activate)',
        '/api/quests/<uuid:quest_id>/setdown': 'Set down a quest (pause)',

        # Tasks
        '/api/tasks': 'List user tasks',
        '/api/tasks/<uuid:task_id>': 'Get task details' if method == 'GET' else 'Update or delete task',
        '/api/tasks/<uuid:task_id>/complete': 'Submit task completion evidence',

        # Badges
        '/api/badges': 'List all available badges',
        '/api/badges/<uuid:badge_id>': 'Get badge details',
        '/api/badges/<uuid:badge_id>/claim': 'Claim an earned badge',
        '/api/badges/claimable': 'Get badges user can claim',

        # Portfolio
        '/api/portfolio/<slug>': 'View public portfolio/diploma',
        '/api/portfolio/diploma/<uuid:user_id>': 'Get diploma data',

        # Parent
        '/api/dependents/my-dependents': 'List all dependents for parent',
        '/api/dependents/create': 'Create new dependent profile',
        '/api/dependents/<uuid:dependent_id>': 'Get, update, or delete dependent',
        '/api/dependents/<uuid:dependent_id>/promote': 'Promote dependent to independent account',

        # Observer
        '/api/observers/invite': 'Send observer invitation email',
        '/api/observers/my-observers': 'List all observers for student',
        '/api/observers/accept/<code>': 'Accept observer invitation',

        # Admin
        '/api/admin/users': 'List all users',
        '/api/admin/quests': 'Manage quests (admin)',
        '/api/admin/analytics/summary': 'Get platform analytics summary',
        '/api/admin/organizations/organizations': 'List or create organizations',
    }

    if path in summaries:
        return summaries[path]

    # Generic summary based on method and path
    resource = path.split('/')[-1] if '<' not in path.split('/')[-1] else path.split('/')[-2]

    if method == 'GET':
        return f"Get {resource}"
    elif method == 'POST':
        return f"Create {resource}"
    elif method == 'PUT' or method == 'PATCH':
        return f"Update {resource}"
    elif method == 'DELETE':
        return f"Delete {resource}"

    return f"{method} {path}"

def generate_description(path, method, endpoint):
    """Generate a detailed description for an endpoint"""

    descriptions = {
        '/api/auth/login': 'Authenticate user with email and password. Sets httpOnly cookies for session management. Returns user profile and session info.',
        '/api/auth/register': 'Create a new user account. Requires email, password, display name, and role. Sends verification email.',
        '/api/auth/me': 'Get the currently authenticated user\'s profile including organization membership and role.',
        '/api/quests': 'List quests with pagination and filtering. Supports filtering by pillar, difficulty, quest_type, and organization. Returns quest metadata and enrollment stats.',
        '/api/quests/<uuid:quest_id>/start': 'Enroll current user in a quest. Optionally start personalization flow for AI-customized tasks.',
        '/api/tasks/<uuid:task_id>/complete': 'Submit evidence for task completion. Accepts text evidence and/or file uploads. Sets status to pending approval.',
        '/api/badges/claimable': 'Get list of badges the user has earned but not yet claimed. Checks quest completion and XP requirements.',
        '/api/portfolio/<slug>': 'Public endpoint for viewing user portfolios/diplomas. Shows completed quests, earned badges, and XP breakdown by pillar.',
        '/api/dependents/create': 'Create a COPPA-compliant dependent profile for children under 13. Requires parental consent.',
        '/api/observers/invite': 'Send email invitation to observer (grandparent, mentor, etc.) to view student\'s learning journey.',
        '/api/admin/analytics/summary': 'Get platform-wide analytics including user counts, quest completions, XP awarded, and engagement metrics.',
    }

    if path in descriptions:
        return descriptions[path]

    return f"Endpoint: {endpoint}"

def generate_parameters(rule, method):
    """Generate parameter definitions for an endpoint"""

    parameters = []

    # Extract path parameters
    for arg in rule.arguments:
        param_type = 'string'
        if 'uuid' in str(rule):
            param_type = 'string'
        elif 'int' in str(rule):
            param_type = 'integer'

        parameters.append({
            'name': arg,
            'in': 'path',
            'required': True,
            'type': param_type,
            'description': f'{arg} parameter'
        })

    # Add common query parameters for GET requests
    if method == 'GET':
        path_str = str(rule)
        if '/api/quests' == path_str or '/api/admin/quests' in path_str:
            parameters.extend([
                {'name': 'page', 'in': 'query', 'type': 'integer', 'default': 1},
                {'name': 'page_size', 'in': 'query', 'type': 'integer', 'default': 20},
                {'name': 'pillar', 'in': 'query', 'type': 'string', 'enum': ['stem', 'wellness', 'communication', 'civics', 'art']},
                {'name': 'difficulty', 'in': 'query', 'type': 'string', 'enum': ['beginner', 'intermediate', 'advanced']},
            ])
        elif '/api/users' in path_str or '/api/admin/users' in path_str:
            parameters.extend([
                {'name': 'page', 'in': 'query', 'type': 'integer', 'default': 1},
                {'name': 'page_size', 'in': 'query', 'type': 'integer', 'default': 20},
                {'name': 'role', 'in': 'query', 'type': 'string'},
            ])

    # Add CSRF token header for POST/PUT/DELETE
    if method in ['POST', 'PUT', 'PATCH', 'DELETE']:
        parameters.append({
            'name': 'X-CSRF-Token',
            'in': 'header',
            'type': 'string',
            'required': True,
            'description': 'CSRF token from /csrf-token endpoint'
        })

    return parameters

def generate_responses(method, path):
    """Generate response definitions for an endpoint"""

    responses = {
        '200': {'description': 'Success'},
        '400': {'description': 'Bad request - validation error'},
        '401': {'description': 'Unauthorized - not authenticated'},
        '403': {'description': 'Forbidden - insufficient permissions'},
        '404': {'description': 'Not found'},
        '500': {'description': 'Internal server error'}
    }

    if method == 'POST':
        responses['201'] = {'description': 'Created successfully'}
        responses['409'] = {'description': 'Conflict - resource already exists'}

    if method == 'DELETE':
        responses['204'] = {'description': 'Deleted successfully'}

    # Rate limiting for auth endpoints
    if '/api/auth/' in path:
        responses['429'] = {'description': 'Too many requests - rate limited'}

    return responses


def generate_openapi_spec(app):
    """
    Generate a complete OpenAPI 3.0 specification from all Flask routes.

    Args:
        app: Flask application instance

    Returns:
        dict: Complete OpenAPI 3.0 specification

    Example:
        >>> from app import app
        >>> spec = generate_openapi_spec(app)
        >>> import json
        >>> print(json.dumps(spec, indent=2))
    """
    import os
    from datetime import datetime

    # Get environment
    env = os.getenv('FLASK_ENV', 'development')
    host = 'optio-prod-backend.onrender.com' if env == 'production' else 'optio-dev-backend.onrender.com'

    # Build OpenAPI 3.0 spec
    spec = {
        "openapi": "3.0.0",
        "info": {
            "title": "Optio Platform API",
            "description": "Comprehensive API for the Optio learning platform, including authentication, quests, badges, and more.",
            "version": "3.0.0",
            "contact": {
                "name": "Optio Education Support",
                "email": "tannerbowman@gmail.com",
                "url": "https://www.optioeducation.com"
            },
            "license": {
                "name": "Proprietary",
                "url": "https://www.optioeducation.com/license"
            }
        },
        "servers": [
            {
                "url": f"https://{host}",
                "description": "Production server" if env == 'production' else "Development server"
            }
        ],
        "components": {
            "securitySchemes": {
                "cookieAuth": {
                    "type": "apiKey",
                    "in": "cookie",
                    "name": "access_token",
                    "description": "httpOnly cookie set automatically after login"
                },
                "csrfToken": {
                    "type": "apiKey",
                    "in": "header",
                    "name": "X-CSRF-Token",
                    "description": "CSRF token required for POST/PUT/DELETE requests"
                },
                "bearerAuth": {
                    "type": "http",
                    "scheme": "bearer",
                    "bearerFormat": "JWT",
                    "description": "Authorization header (Safari/iOS fallback)"
                }
            }
        },
        "paths": {},
        "tags": [
            {"name": "Authentication", "description": "Login, registration, password management"},
            {"name": "Users", "description": "User profiles and settings"},
            {"name": "Quests", "description": "Quest discovery and management"},
            {"name": "Tasks", "description": "Task completion and evidence submission"},
            {"name": "Evidence", "description": "Evidence document management"},
            {"name": "Portfolio", "description": "Public portfolios and diplomas"},
            {"name": "Connections", "description": "Student connections and social features"},
            {"name": "Parent Dashboard", "description": "Parent and dependent management"},
            {"name": "Observer", "description": "Observer role and student monitoring"},
            {"name": "Advisor", "description": "Advisor tools and student management"},
            {"name": "Admin - Users", "description": "User administration"},
            {"name": "Admin - Quests", "description": "Quest administration"},
            {"name": "Admin - Analytics", "description": "Platform analytics"},
            {"name": "Admin - Organizations", "description": "Organization management"},
            {"name": "Admin - CRM", "description": "Email campaigns and automation"},
            {"name": "AI Tutor", "description": "AI-powered tutoring"},
            {"name": "LMS Integration", "description": "LTI and course imports"},
            {"name": "Calendar", "description": "Learning events and calendar"},
            {"name": "Settings", "description": "Platform settings"},
            {"name": "Services", "description": "Consultation booking"},
            {"name": "Promo", "description": "Promotional campaigns"},
            {"name": "Other", "description": "Other endpoints"}
        ]
    }

    # Generate endpoint specs
    endpoint_specs = generate_endpoint_specs(app)

    # Convert endpoint specs to OpenAPI 3.0 paths format
    for spec_key, endpoint_spec in endpoint_specs.items():
        path, method = spec_key.rsplit('::', 1)

        # Convert Flask path parameters to OpenAPI format
        # /api/quests/<uuid:quest_id> -> /api/quests/{quest_id}
        openapi_path = path
        import re
        openapi_path = re.sub(r'<(?:[\w:]+:)?(\w+)>', r'{\1}', openapi_path)

        if openapi_path not in spec['paths']:
            spec['paths'][openapi_path] = {}

        # Convert parameters format
        parameters = []
        for param in endpoint_spec.get('parameters', []):
            if param['in'] == 'path':
                parameters.append({
                    'name': param['name'],
                    'in': 'path',
                    'required': True,
                    'schema': {'type': param.get('type', 'string')},
                    'description': param.get('description', '')
                })
            elif param['in'] == 'query':
                param_schema = {'type': param.get('type', 'string')}
                if 'enum' in param:
                    param_schema['enum'] = param['enum']
                if 'default' in param:
                    param_schema['default'] = param['default']
                parameters.append({
                    'name': param['name'],
                    'in': 'query',
                    'required': param.get('required', False),
                    'schema': param_schema
                })
            elif param['in'] == 'header':
                parameters.append({
                    'name': param['name'],
                    'in': 'header',
                    'required': param.get('required', False),
                    'schema': {'type': param.get('type', 'string')},
                    'description': param.get('description', '')
                })

        # Convert responses format
        responses = {}
        for status_code, response_data in endpoint_spec.get('responses', {}).items():
            responses[status_code] = {
                'description': response_data.get('description', 'Response'),
                'content': {
                    'application/json': {
                        'schema': {'type': 'object'}
                    }
                }
            }

        spec['paths'][openapi_path][method] = {
            'tags': endpoint_spec.get('tags', ['Other']),
            'summary': endpoint_spec.get('summary', ''),
            'description': endpoint_spec.get('description', ''),
            'parameters': parameters,
            'responses': responses,
            'security': endpoint_spec.get('security', [])
        }

    # Add generation metadata
    spec['info']['x-generated-at'] = datetime.utcnow().isoformat() + 'Z'
    spec['info']['x-route-count'] = len(endpoint_specs)

    return spec


if __name__ == '__main__':
    """
    Generate and print OpenAPI spec when run as a script.

    Usage:
        python api_spec_generator.py > openapi_spec.json
    """
    import sys
    import json

    # Add parent directory to path for imports
    sys.path.insert(0, '.')

    try:
        from app import app

        spec = generate_openapi_spec(app)

        print(json.dumps(spec, indent=2))

        # Print stats to stderr so they don't get mixed with JSON output
        print(f"\nGenerated OpenAPI spec with {spec['info']['x-route-count']} endpoints", file=sys.stderr)
        print(f"Validate at: https://editor.swagger.io/", file=sys.stderr)

    except Exception as e:
        print(f"Error generating spec: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
