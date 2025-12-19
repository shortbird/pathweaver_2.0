"""
API Specification Generator for Optio Platform
Auto-generates OpenAPI specs for all registered Flask routes
"""

def generate_endpoint_specs(app):
    """
    Auto-generate OpenAPI specs for all Flask routes
    Returns a dictionary of endpoint specifications
    """

    endpoint_specs = {}

    # Map of tags based on blueprint names
    tag_mapping = {
        'auth': 'Authentication',
        'users': 'Users',
        'quests': 'Quests',
        'tasks': 'Tasks',
        'badges': 'Badges',
        'evidence': 'Evidence',
        'evidence_documents': 'Evidence',
        'helper_evidence': 'Evidence',
        'portfolio': 'Portfolio',
        'community': 'Connections',
        'parent': 'Parent Dashboard',
        'parent_linking': 'Parent Dashboard',
        'parent_dashboard': 'Parent Dashboard',
        'parent_evidence': 'Parent Dashboard',
        'dependents': 'Parent Dashboard',
        'observer': 'Observer',
        'observer_requests': 'Observer',
        'advisor': 'Advisor',
        'checkins': 'Advisor',
        'notes': 'Advisor',
        'admin': 'Admin - Users',
        'user_management': 'Admin - Users',
        'quest_management': 'Admin - Quests',
        'badge_management': 'Admin - Badges',
        'analytics': 'Admin - Analytics',
        'organization_management': 'Admin - Organizations',
        'crm': 'Admin - CRM',
        'tutor': 'AI Tutor',
        'student_ai': 'AI Tutor',
        'lms_integration': 'LMS Integration',
        'spark_integration': 'LMS Integration',
        'calendar': 'Calendar',
        'learning_events': 'Calendar',
        'settings': 'Settings',
        'services': 'Services',
        'promo': 'Promo',
        'uploads': 'Evidence',
        'images': 'Evidence'
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
