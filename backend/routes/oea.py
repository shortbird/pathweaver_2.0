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
from utils.oea_grades import compute_gpa, compute_progress, GRADE_POINTS
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


# ── Credits (parent self-attestation + grades + GPA) ─────────────────────────

@bp.route('/students/<student_id>/credits', methods=['GET'])
@require_auth
@validate_uuid_param('student_id')
def get_student_credits(user_id, student_id):
    """
    Return a student's credits plus computed pathway progress and GPA.

    Response: { enrollment, credits[], progress, gpa }. progress/gpa are null
    when the student has no pathway selected yet.
    """
    try:
        _verify_manages_student(user_id, student_id)

        # admin client justified: cross-user parent -> student credit reads.
        supabase = get_supabase_admin_client()
        repo = OEARepository(client=supabase)

        enrollment = repo.get_enrollment(student_id)
        credits = repo.get_credits(student_id)
        pathway_key = enrollment.get('pathway_key') if enrollment else None

        if enrollment:
            enrollment['pathway'] = get_pathway(pathway_key)

        progress = compute_progress(pathway_key, credits) if pathway_key else None
        gpa = compute_gpa(credits)

        return jsonify({
            'success': True,
            'enrollment': enrollment,
            'credits': credits,
            'progress': progress,
            'gpa': gpa,
        }), 200
    except AuthorizationError as e:
        return jsonify({'success': False, 'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error fetching OEA credits for student {student_id}: {e}")
        return jsonify({'success': False, 'error': 'Failed to fetch credits'}), 500


@bp.route('/students/<student_id>/credits', methods=['POST'])
@require_auth
@validate_uuid_param('student_id')
def add_student_credit(user_id, student_id):
    """
    Add a course credit to one of the student's pathway requirement slots.

    Body:
        requirement_key: str  - must be a slot in the student's chosen pathway
        course_name:     str
        credits:         number (optional, default 1)
    """
    try:
        _verify_manages_student(user_id, student_id)

        data = request.get_json() or {}
        requirement_key = (data.get('requirement_key') or '').strip()
        course_name = (data.get('course_name') or '').strip()
        credits_value = data.get('credits', 1)

        if not requirement_key:
            raise ValidationError("requirement_key is required")
        if not course_name:
            raise ValidationError("course_name is required")
        try:
            credits_value = float(credits_value)
        except (TypeError, ValueError):
            raise ValidationError("credits must be a number")
        if credits_value <= 0:
            raise ValidationError("credits must be greater than 0")

        # admin client justified: cross-user parent -> student credit write.
        supabase = get_supabase_admin_client()
        repo = OEARepository(client=supabase)

        enrollment = repo.get_enrollment(student_id)
        if not enrollment:
            raise ValidationError("Student has not selected a pathway yet")

        pathway = get_pathway(enrollment.get('pathway_key'))
        req = next((r for r in (pathway['requirements'] if pathway else []) if r['key'] == requirement_key), None)
        if not req:
            raise ValidationError(f"'{requirement_key}' is not a requirement of this pathway")

        credit = repo.add_credit(
            student_id=student_id,
            enrollment_id=enrollment['id'],
            requirement_key=requirement_key,
            category=req['category'],
            subject_key=req.get('subject_key'),
            course_name=course_name,
            credits=credits_value,
            created_by=user_id,
        )
        return jsonify({'success': True, 'credit': credit}), 201
    except AuthorizationError as e:
        return jsonify({'success': False, 'error': str(e)}), 403
    except (ValidationError, RepoValidationError) as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error adding OEA credit for student {student_id}: {e}")
        return jsonify({'success': False, 'error': 'Failed to add credit'}), 500


@bp.route('/credits/<credit_id>', methods=['PATCH'])
@require_auth
@validate_uuid_param('credit_id')
def update_student_credit(user_id, credit_id):
    """
    Update a credit: rename, mark complete, assign an A-F grade, toggle honors
    weighting. Marking complete with a grade stamps completed_at; reverting to
    in_progress clears the grade and completion timestamp.

    Body (any subset): course_name, status ('in_progress'|'complete'),
        letter_grade ('A'-'F'|null), is_weighted (bool)
    """
    try:
        data = request.get_json() or {}

        # admin client justified: cross-user parent -> student credit update.
        supabase = get_supabase_admin_client()
        repo = OEARepository(client=supabase)

        existing = repo.get_credit(credit_id)
        if not existing:
            raise NotFoundError("Credit not found")
        _verify_manages_student(user_id, existing['student_id'])

        fields = {}
        if 'course_name' in data:
            name = (data.get('course_name') or '').strip()
            if not name:
                raise ValidationError("course_name cannot be empty")
            fields['course_name'] = name
        if 'is_weighted' in data:
            fields['is_weighted'] = bool(data['is_weighted'])
        if 'letter_grade' in data:
            grade = data['letter_grade']
            if grade is not None and grade not in GRADE_POINTS:
                raise ValidationError("letter_grade must be one of A, B, C, D, F")
            fields['letter_grade'] = grade
        if 'status' in data:
            status = data['status']
            if status not in ('in_progress', 'complete'):
                raise ValidationError("status must be 'in_progress' or 'complete'")
            fields['status'] = status
            if status == 'complete':
                fields['completed_at'] = 'now()'
            else:
                # Reverting to in-progress clears grade + completion.
                fields['completed_at'] = None
                fields['letter_grade'] = None

        if not fields:
            raise ValidationError("No valid fields to update")

        credit = repo.update_credit(credit_id, fields)
        return jsonify({'success': True, 'credit': credit}), 200
    except AuthorizationError as e:
        return jsonify({'success': False, 'error': str(e)}), 403
    except (ValidationError, RepoValidationError) as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error updating OEA credit {credit_id}: {e}")
        return jsonify({'success': False, 'error': 'Failed to update credit'}), 500


@bp.route('/credits/<credit_id>', methods=['DELETE'])
@require_auth
@validate_uuid_param('credit_id')
def delete_student_credit(user_id, credit_id):
    """Delete a credit the acting parent manages."""
    try:
        # admin client justified: cross-user parent -> student credit delete.
        supabase = get_supabase_admin_client()
        repo = OEARepository(client=supabase)

        existing = repo.get_credit(credit_id)
        if not existing:
            raise NotFoundError("Credit not found")
        _verify_manages_student(user_id, existing['student_id'])

        repo.delete_credit(credit_id)
        return jsonify({'success': True}), 200
    except AuthorizationError as e:
        return jsonify({'success': False, 'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error deleting OEA credit {credit_id}: {e}")
        return jsonify({'success': False, 'error': 'Failed to delete credit'}), 500
