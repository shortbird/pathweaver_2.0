"""Admin management of a user's observer links.

Split out of user_management.py on 2026-08-13: that file had grown to 1480
lines against the 1400-line cap in tests/unit/test_route_file_sizes.py, which
gates the backend job and therefore the production deploy.

These three routes were the natural seam -- they are the only ones in the file
concerned with observer_student_links rather than the user record itself.

The blueprint keeps the same /api/admin url_prefix, so every URL is unchanged;
this is a file move, not an API change. tests/unit/test_no_duplicate_routes.py
guards against the rule being registered twice.
"""

from flask import Blueprint, request

from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from utils.api_response import success_response, error_response
from utils.logger import get_logger

logger = get_logger(__name__)

observer_links_bp = Blueprint(
    'admin_user_observer_links', __name__, url_prefix='/api/admin'
)


@observer_links_bp.route('/users/<user_id>/observer-links', methods=['GET'])
@require_admin
def get_user_observer_links(admin_user_id: str, user_id: str):
    """Get observer-student links for a user (as observer or as student)."""
    try:
        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        supabase = get_supabase_admin_client()
        links = []

        # Links where user is an observer
        as_observer = supabase.table('observer_student_links') \
            .select('id, student_id, created_at') \
            .eq('observer_id', user_id) \
            .execute()

        if as_observer.data:
            student_ids = list(set(l['student_id'] for l in as_observer.data))
            students = supabase.table('users') \
                .select('id, email, first_name, last_name, display_name') \
                .in_('id', student_ids) \
                .execute()
            student_map = {s['id']: s for s in (students.data or [])}
            for link in as_observer.data:
                s = student_map.get(link['student_id'], {})
                links.append({
                    'id': link['id'],
                    'direction': 'observing',
                    'user': s,
                    'relationship': link.get('relationship'),
                    'created_at': link.get('created_at')
                })

        # Links where user is a student being observed
        as_student = supabase.table('observer_student_links') \
            .select('id, observer_id, created_at') \
            .eq('student_id', user_id) \
            .execute()

        if as_student.data:
            observer_ids = list(set(l['observer_id'] for l in as_student.data))
            observers = supabase.table('users') \
                .select('id, email, first_name, last_name, display_name') \
                .in_('id', observer_ids) \
                .execute()
            observer_map = {o['id']: o for o in (observers.data or [])}
            for link in as_student.data:
                o = observer_map.get(link['observer_id'], {})
                links.append({
                    'id': link['id'],
                    'direction': 'observed_by',
                    'user': o,
                    'relationship': link.get('relationship'),
                    'created_at': link.get('created_at')
                })

        return success_response(data={'links': links})

    except Exception as e:
        logger.error(f"Error fetching observer links for {user_id}: {str(e)}")
        return error_response('Failed to load observer links', status_code=500, error_code='FETCH_ERROR')


@observer_links_bp.route('/users/<user_id>/observer-links', methods=['POST'])
@require_admin
def add_observer_link(admin_user_id: str, user_id: str):
    """Create an observer-student link. Body: { other_user_id, direction: 'observing'|'observed_by' }"""
    try:
        data = request.get_json()
        other_id = data.get('other_user_id')
        direction = data.get('direction')
        if not other_id or direction not in ('observing', 'observed_by'):
            return error_response('other_user_id and direction required', status_code=400, error_code='BAD_REQUEST')

        observer_id = user_id if direction == 'observing' else other_id
        student_id = other_id if direction == 'observing' else user_id

        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        supabase = get_supabase_admin_client()

        # Check for existing
        existing = supabase.table('observer_student_links') \
            .select('id') \
            .eq('observer_id', observer_id) \
            .eq('student_id', student_id) \
            .execute()
        if existing.data:
            return error_response('Observer link already exists', status_code=409, error_code='DUPLICATE')

        result = supabase.table('observer_student_links').insert({
            'observer_id': observer_id,
            'student_id': student_id,
            'can_comment': True,
            'can_view_evidence': True,
            'notifications_enabled': True
        }).execute()

        return success_response(data={'link': result.data[0] if result.data else None}, message='Observer link created')

    except Exception as e:
        logger.error(f"Error creating observer link for {user_id}: {str(e)}")
        return error_response('Failed to create observer link', status_code=500, error_code='CREATE_ERROR')


@observer_links_bp.route('/users/<user_id>/observer-links/<link_id>', methods=['DELETE'])
@require_admin
def remove_observer_link(admin_user_id: str, user_id: str, link_id: str):
    """Delete an observer-student link."""
    try:
        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        supabase = get_supabase_admin_client()
        supabase.table('observer_student_links').delete().eq('id', link_id).execute()
        return success_response(message='Observer link removed')
    except Exception as e:
        logger.error(f"Error removing observer link {link_id}: {str(e)}")
        return error_response('Failed to remove observer link', status_code=500, error_code='DELETE_ERROR')
