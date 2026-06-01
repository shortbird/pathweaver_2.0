"""
OEA Diploma Plan API routes.

Backs the Optio <> OpenEd Academy integration (PRD V2):
  - GET  /api/oea/pathways                 List the three fixed diploma pathways.
  - GET  /api/oea/enrollments              The acting parent's student enrollments.
  - GET  /api/oea/enrollments/<student_id> One student's enrollment (current pathway).
  - POST /api/oea/enrollments              Select / change a student's pathway.

OEA students are minors managed by a parent (dependents). Ownership is verified
via users.managed_by_parent_id; superadmin always has access (Critical Rule #7).
Admin client is used throughout for these cross-user (parent -> student)
operations, mirroring routes/dependents.py.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from repositories.oea_repository import OEARepository
from repositories.base_repository import NotFoundError, ValidationError as RepoValidationError
from utils.auth.decorators import require_auth, validate_uuid_param
from utils.oea_pathways import list_pathways, get_pathway
from utils.roles import UserRole
from middleware.error_handler import ValidationError, AuthorizationError
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('oea', __name__, url_prefix='/api/oea')


def _verify_manages_student(parent_id: str, student_id: str):
    """
    Confirm the acting user may manage this OEA student.

    Allowed when the user is superadmin, or the student is a dependent with
    managed_by_parent_id == parent_id.

    Raises:
        AuthorizationError: caller is not permitted to manage this student.
        NotFoundError: student does not exist.
    """
    # admin client justified: this lookup IS the auth check (reads users to
    # determine the manages-student relationship); mirrors routes/dependents.py.
    supabase = get_supabase_admin_client()

    actor = supabase.table('users').select('role').eq('id', parent_id).execute()
    if actor.data and actor.data[0].get('role') == UserRole.SUPERADMIN.value:
        return

    student = supabase.table('users') \
        .select('id, managed_by_parent_id').eq('id', student_id).execute()
    if not student.data:
        raise NotFoundError("Student not found")

    if student.data[0].get('managed_by_parent_id') != parent_id:
        raise AuthorizationError("You do not manage this student")


@bp.route('/pathways', methods=['GET'])
@require_auth
def get_pathways(user_id):
    """Return the three OEA diploma pathway definitions for the selection UX."""
    return jsonify({'success': True, 'pathways': list_pathways()}), 200


@bp.route('/enrollments', methods=['GET'])
@require_auth
def get_enrollments(user_id):
    """Return all OEA enrollments managed by the acting parent."""
    try:
        # admin client justified: cross-user parent -> student enrollment reads.
        supabase = get_supabase_admin_client()
        repo = OEARepository(client=supabase)
        enrollments = repo.get_enrollments_for_parent(user_id)

        # Attach the pathway definition so the client can render without a second call.
        for e in enrollments:
            e['pathway'] = get_pathway(e.get('pathway_key'))

        return jsonify({'success': True, 'enrollments': enrollments, 'count': len(enrollments)}), 200
    except Exception as e:
        logger.error(f"Error fetching OEA enrollments for {user_id}: {e}")
        return jsonify({'success': False, 'error': 'Failed to fetch enrollments'}), 500


@bp.route('/enrollments/<student_id>', methods=['GET'])
@require_auth
@validate_uuid_param('student_id')
def get_student_enrollment(user_id, student_id):
    """Return one student's OEA enrollment (current pathway), or null if none."""
    try:
        _verify_manages_student(user_id, student_id)

        # admin client justified: cross-user parent -> student enrollment read.
        supabase = get_supabase_admin_client()
        repo = OEARepository(client=supabase)
        enrollment = repo.get_enrollment(student_id)
        if enrollment:
            enrollment['pathway'] = get_pathway(enrollment.get('pathway_key'))

        return jsonify({'success': True, 'enrollment': enrollment}), 200
    except AuthorizationError as e:
        return jsonify({'success': False, 'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error fetching OEA enrollment for student {student_id}: {e}")
        return jsonify({'success': False, 'error': 'Failed to fetch enrollment'}), 500


@bp.route('/enrollments', methods=['POST'])
@require_auth
def select_pathway(user_id):
    """
    Select or change a student's diploma pathway.

    Body:
        student_id:  str (UUID) - the student to enroll
        pathway_key: str        - one of open_balanced | traditional | college_bound

    Returns 200 with the enrollment + pathway definition.
    """
    try:
        data = request.get_json() or {}
        student_id = (data.get('student_id') or '').strip()
        pathway_key = (data.get('pathway_key') or '').strip()

        if not student_id:
            raise ValidationError("student_id is required")
        if not pathway_key:
            raise ValidationError("pathway_key is required")

        _verify_manages_student(user_id, student_id)

        # admin client justified: cross-user parent -> student enrollment write.
        supabase = get_supabase_admin_client()
        repo = OEARepository(client=supabase)
        enrollment = repo.upsert_enrollment(student_id, user_id, pathway_key)
        enrollment['pathway'] = get_pathway(enrollment.get('pathway_key'))

        logger.info(f"Parent {user_id} set pathway {pathway_key} for student {student_id}")
        return jsonify({'success': True, 'enrollment': enrollment}), 200
    except AuthorizationError as e:
        return jsonify({'success': False, 'error': str(e)}), 403
    except (ValidationError, RepoValidationError) as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error selecting OEA pathway for student: {e}")
        return jsonify({'success': False, 'error': 'Failed to save pathway selection'}), 500
