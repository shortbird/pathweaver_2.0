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
from utils.oea_pathways import list_pathways, get_pathway, PROGRAM_KEY
from utils.oea_grades import compute_gpa, compute_progress, GRADE_POINTS
from utils import oea_rules
from utils.roles import UserRole
from app_config import Config
from middleware.error_handler import ValidationError, AuthorizationError
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('oea', __name__, url_prefix='/api/oea')


def _student_org_id(student_id):
    """Return the student's organization_id (or None for platform OEA families)."""
    supabase = get_supabase_admin_client()
    row = supabase.table('users').select('organization_id').eq('id', student_id).execute()
    return row.data[0].get('organization_id') if row.data else None


def _settings_for_student(student_id):
    """Load effective OEA settings (program defaults <- the student's org override)."""
    return oea_rules.load_oea_settings(get_supabase_admin_client(), _student_org_id(student_id))


def _verify_admin_for_student(user_id, student_id):
    """
    Confirm the acting user is a Hearthwood/OEA admin for this student:
    superadmin, or an org_admin of the student's organization. Used for the
    cap-override endpoint (parents cannot raise their own student's limits).
    """
    supabase = get_supabase_admin_client()
    actor = supabase.table('users') \
        .select('role, org_role, org_roles, organization_id').eq('id', user_id).execute()
    if not actor.data:
        raise AuthorizationError("Not authorized")
    a = actor.data[0]
    if a.get('role') == UserRole.SUPERADMIN.value:
        return
    roles = set()
    if a.get('org_role'):
        roles.add(a['org_role'])
    if isinstance(a.get('org_roles'), list):
        roles.update(a['org_roles'])
    if 'org_admin' in roles and a.get('organization_id') and a['organization_id'] == _student_org_id(student_id):
        return
    raise AuthorizationError("Only a Hearthwood admin can change credit limits")


def _verify_manages_student(parent_id: str, student_id: str, allow_self: bool = False):
    """
    Confirm the acting user may access this OEA student's data.

    Allowed when the user is superadmin, the student is a dependent with
    managed_by_parent_id == parent_id, the caller is a parent with an approved
    parent_student_link to the student, or (when allow_self is True) the caller
    is the student viewing their own record.

    The link case supports OEA org students: they keep their own login and a
    parent is connected via the platform's standard request/approve flow
    (parent_student_links, status='approved'), rather than being a managed
    dependent.

    allow_self is used by the read-only endpoints so an OEA student can view
    their own diploma (pathway / credits / GPA). Writes never pass allow_self —
    only a managing/connected parent or superadmin may modify a student's record.

    Raises:
        AuthorizationError: caller is not permitted to access this student.
        NotFoundError: student does not exist.
    """
    # A student may read their own record when the endpoint opts in.
    if allow_self and parent_id == student_id:
        return

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

    # Managing parent of a dependent.
    if student.data[0].get('managed_by_parent_id') == parent_id:
        return

    # Connected parent via an approved parent<->student link (org students).
    link = supabase.table('parent_student_links') \
        .select('id') \
        .eq('parent_user_id', parent_id) \
        .eq('student_user_id', student_id) \
        .eq('status', 'approved') \
        .limit(1).execute()
    if link.data:
        return

    raise AuthorizationError("You do not manage this student")


def _is_oea_student(student_id: str) -> bool:
    """
    Whether a student belongs to the OpenEd Academy program — by program_key
    ('opened-academy', set for partner-signup families) or by membership in the
    OEA organization (slug 'oea', for org-managed students whose program_key is
    null). Used so the overview can show OEA diploma progress / a choose-pathway
    prompt instead of Optio's XP-based credits.
    """
    supabase = get_supabase_admin_client()
    u = supabase.table('users') \
        .select('program_key, organization_id').eq('id', student_id).execute()
    if not u.data:
        return False
    row = u.data[0]
    if row.get('program_key') == PROGRAM_KEY:
        return True
    org_id = row.get('organization_id')
    if org_id:
        org = supabase.table('organizations').select('slug').eq('id', org_id).execute()
        if org.data and org.data[0].get('slug') == 'oea':
            return True
    return False


def _ensure_course_quest(repo, credit):
    """
    Return the credit's linked quest id, creating + linking a quest the first time.

    Idempotent: a credit that already has quest_id returns it unchanged. Used both
    when a course is first added and lazily for credits created before the
    course-as-quest feature existed.
    """
    if credit.get('quest_id'):
        return credit['quest_id']

    # Best-effort subject label from the student's pathway requirement.
    label = None
    enrollment = repo.get_enrollment(credit['student_id'])
    if enrollment:
        pathway = get_pathway(enrollment.get('pathway_key'))
        req = next((r for r in (pathway['requirements'] if pathway else [])
                    if r['key'] == credit.get('requirement_key')), None)
        label = req['label'] if req else None

    quest_id = repo.create_course_quest(credit['student_id'], credit['course_name'], label)
    repo.update_credit(credit['id'], {'quest_id': quest_id})
    return quest_id


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
        _verify_manages_student(user_id, student_id, allow_self=True)

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
        _verify_manages_student(user_id, student_id, allow_self=True)

        # admin client justified: cross-user parent -> student credit reads.
        supabase = get_supabase_admin_client()
        repo = OEARepository(client=supabase)

        enrollment = repo.get_enrollment(student_id)
        credits = repo.get_credits(student_id)
        pathway_key = enrollment.get('pathway_key') if enrollment else None

        # Attach an evidence count to each credit so the dashboard can badge it.
        counts = repo.get_evidence_counts(student_id)
        for c in credits:
            c['evidence_count'] = counts.get(c['id'], 0)

        if enrollment:
            enrollment['pathway'] = get_pathway(pathway_key)

        progress = compute_progress(pathway_key, credits) if pathway_key else None
        gpa = compute_gpa(credits)

        settings = _settings_for_student(student_id)
        eligibility = oea_rules.diploma_eligibility(progress, credits, settings)
        totals = oea_rules.source_totals(credits)
        caps = oea_rules.caps_for(enrollment, settings)
        credit_summary = {
            'transfer_used': totals['transfer'],
            'transfer_cap': caps['transfer'],
            'nondirect_used': totals['nondirect'],
            'nondirect_cap': caps['nondirect'],
            'direct_complete': oea_rules.direct_credits_earned(credits),
        }

        return jsonify({
            'success': True,
            'enrollment': enrollment,
            'credits': credits,
            'progress': progress,
            'gpa': gpa,
            'diploma_eligibility': eligibility,
            'credit_summary': credit_summary,
            'school_year': settings['school_year'],
            'is_oea_student': _is_oea_student(student_id),
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
        credit_source = (data.get('credit_source') or 'direct').strip()
        is_weighted = bool(data.get('is_weighted'))
        letter_grade = data.get('letter_grade')

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
        if credit_source not in oea_rules.CREDIT_SOURCES:
            raise ValidationError(
                f"credit_source must be one of {', '.join(oea_rules.CREDIT_SOURCES)}")
        if letter_grade is not None and letter_grade not in GRADE_POINTS:
            raise ValidationError("letter_grade must be one of A, B, C, D, F")

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

        # Enforce transfer / earned-elsewhere caps (combined, with admin override).
        settings = _settings_for_student(student_id)
        oea_rules.check_credit_source_caps(
            repo.get_credits(student_id), credit_source, credits_value, enrollment, settings)

        # Transfer / earned-elsewhere credits carry a grade and no logs/artifacts,
        # so they are created already complete. Direct credits start in_progress.
        is_nondirect = credit_source in oea_rules.NONDIRECT_SOURCES
        status = 'complete' if (is_nondirect and letter_grade) else 'in_progress'

        credit = repo.add_credit(
            student_id=student_id,
            enrollment_id=enrollment['id'],
            requirement_key=requirement_key,
            category=req['category'],
            subject_key=req.get('subject_key'),
            course_name=course_name,
            credits=credits_value,
            created_by=user_id,
            credit_source=credit_source,
            is_weighted=is_weighted,
            status=status,
            letter_grade=letter_grade if is_nondirect else None,
        )
        # Only direct credits get a linked working quest; transfer/elsewhere credits
        # have no Optio coursework behind them.
        if credit_source == 'direct':
            credit['quest_id'] = _ensure_course_quest(repo, credit)
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
        if 'credits' in data:
            try:
                cv = float(data['credits'])
            except (TypeError, ValueError):
                raise ValidationError("credits must be a number")
            if cv <= 0:
                raise ValidationError("credits must be greater than 0")
            fields['credits'] = cv
        if 'credit_source' in data:
            src = (data.get('credit_source') or '').strip()
            if src not in oea_rules.CREDIT_SOURCES:
                raise ValidationError(
                    f"credit_source must be one of {', '.join(oea_rules.CREDIT_SOURCES)}")
            fields['credit_source'] = src
        # Re-check caps when the source or credit value changes.
        if 'credit_source' in fields or 'credits' in fields:
            new_source = fields.get('credit_source', existing.get('credit_source') or 'direct')
            new_value = fields.get('credits', float(existing.get('credits') or 0))
            enrollment = repo.get_enrollment(existing['student_id'])
            settings = _settings_for_student(existing['student_id'])
            oea_rules.check_credit_source_caps(
                repo.get_credits(existing['student_id']), new_source, new_value,
                enrollment, settings, exclude_credit_id=credit_id)
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

        # Keep the student's linked course quest in sync with the credit's
        # completion: completing the credit marks the quest done (drops it off
        # their current quests); reverting reopens it.
        if 'status' in fields and existing.get('quest_id'):
            repo.set_course_quest_completed(
                existing['student_id'],
                existing['quest_id'],
                completed=(fields['status'] == 'complete'),
            )

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


@bp.route('/credits/<credit_id>/quest', methods=['POST'])
@require_auth
@validate_uuid_param('credit_id')
def ensure_credit_quest(user_id, credit_id):
    """
    Ensure a credit has a linked student quest, creating one if needed.

    Used by the dashboard's "Start quest" action for credits created before the
    course-as-quest feature. Returns the quest id to navigate to.
    """
    try:
        # admin client justified: cross-user parent -> student quest creation.
        supabase = get_supabase_admin_client()
        repo = OEARepository(client=supabase)

        credit = repo.get_credit(credit_id)
        if not credit:
            raise NotFoundError("Credit not found")
        _verify_manages_student(user_id, credit['student_id'])

        quest_id = _ensure_course_quest(repo, credit)
        return jsonify({'success': True, 'quest_id': quest_id}), 200
    except AuthorizationError as e:
        return jsonify({'success': False, 'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error ensuring quest for credit {credit_id}: {e}")
        return jsonify({'success': False, 'error': 'Failed to create quest'}), 500


# ── Credit evidence (text / link / file proof attached to a credit) ──────────

# Accepted evidence content fields per block type. Files are uploaded separately
# via /api/uploads/evidence; only the returned URL + metadata is stored here.
_EVIDENCE_TYPES = ('text', 'link', 'file')


@bp.route('/credits/<credit_id>/evidence', methods=['GET'])
@require_auth
@validate_uuid_param('credit_id')
def list_credit_evidence(user_id, credit_id):
    """Return the evidence blocks attached to a credit."""
    try:
        # admin client justified: cross-user parent -> student evidence read.
        supabase = get_supabase_admin_client()
        repo = OEARepository(client=supabase)

        credit = repo.get_credit(credit_id)
        if not credit:
            raise NotFoundError("Credit not found")
        _verify_manages_student(user_id, credit['student_id'], allow_self=True)

        return jsonify({'success': True, 'evidence': repo.get_credit_evidence(credit_id)}), 200
    except AuthorizationError as e:
        return jsonify({'success': False, 'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error listing evidence for credit {credit_id}: {e}")
        return jsonify({'success': False, 'error': 'Failed to fetch evidence'}), 500


@bp.route('/credits/<credit_id>/evidence', methods=['POST'])
@require_auth
@validate_uuid_param('credit_id')
def add_credit_evidence(user_id, credit_id):
    """
    Attach an evidence block to a credit.

    Body:
        block_type: 'text' | 'link' | 'file'
        content:    object shaped by type:
                      text -> { text }
                      link -> { url, title? }
                      file -> { url, name?, mime?, size? }  (url from /api/uploads/evidence)
    """
    try:
        data = request.get_json() or {}
        block_type = (data.get('block_type') or '').strip()
        content = data.get('content') or {}

        if block_type not in _EVIDENCE_TYPES:
            raise ValidationError(f"block_type must be one of {', '.join(_EVIDENCE_TYPES)}")
        if not isinstance(content, dict):
            raise ValidationError("content must be an object")
        if block_type == 'text' and not (content.get('text') or '').strip():
            raise ValidationError("text evidence requires non-empty 'text'")
        if block_type in ('link', 'file') and not (content.get('url') or '').strip():
            raise ValidationError(f"{block_type} evidence requires a 'url'")

        # admin client justified: cross-user parent -> student evidence write.
        supabase = get_supabase_admin_client()
        repo = OEARepository(client=supabase)

        credit = repo.get_credit(credit_id)
        if not credit:
            raise NotFoundError("Credit not found")
        _verify_manages_student(user_id, credit['student_id'])

        evidence = repo.add_credit_evidence(
            credit_id=credit_id,
            student_id=credit['student_id'],
            block_type=block_type,
            content=content,
            created_by=user_id,
        )
        return jsonify({'success': True, 'evidence': evidence}), 201
    except AuthorizationError as e:
        return jsonify({'success': False, 'error': str(e)}), 403
    except (ValidationError, RepoValidationError) as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error adding evidence to credit {credit_id}: {e}")
        return jsonify({'success': False, 'error': 'Failed to add evidence'}), 500


@bp.route('/evidence/<evidence_id>', methods=['DELETE'])
@require_auth
@validate_uuid_param('evidence_id')
def delete_credit_evidence(user_id, evidence_id):
    """Delete an evidence block the acting parent manages."""
    try:
        # admin client justified: cross-user parent -> student evidence delete.
        supabase = get_supabase_admin_client()
        repo = OEARepository(client=supabase)

        evidence = repo.get_evidence(evidence_id)
        if not evidence:
            raise NotFoundError("Evidence not found")
        _verify_manages_student(user_id, evidence['student_id'])

        repo.delete_credit_evidence(evidence_id)
        return jsonify({'success': True}), 200
    except AuthorizationError as e:
        return jsonify({'success': False, 'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error deleting evidence {evidence_id}: {e}")
        return jsonify({'success': False, 'error': 'Failed to delete evidence'}), 500


# ── Admin cap overrides ──────────────────────────────────────────────────────

@bp.route('/enrollments/<student_id>/caps', methods=['PATCH'])
@require_auth
@validate_uuid_param('student_id')
def set_credit_caps(user_id, student_id):
    """
    Raise (or clear) a student's transfer / non-direct credit ceilings.
    Hearthwood admin (org_admin of the student's org) or superadmin only. Send a
    number to override, or null to revert to the program default.

    Body (any subset): max_transfer_credits (number|null), max_nondirect_credits (number|null)
    """
    try:
        _verify_admin_for_student(user_id, student_id)
        data = request.get_json() or {}

        fields = {}
        for key in ('max_transfer_credits', 'max_nondirect_credits'):
            if key in data:
                val = data[key]
                if val is not None:
                    try:
                        val = float(val)
                    except (TypeError, ValueError):
                        raise ValidationError(f"{key} must be a number or null")
                    if val < 0:
                        raise ValidationError(f"{key} cannot be negative")
                fields[key] = val
        if not fields:
            raise ValidationError("No cap fields to update")

        supabase = get_supabase_admin_client()
        repo = OEARepository(client=supabase)
        enrollment = repo.set_cap_overrides(student_id, fields)
        logger.info(f"Admin {user_id} set caps {fields} for student {student_id}")
        return jsonify({'success': True, 'enrollment': enrollment}), 200
    except AuthorizationError as e:
        return jsonify({'success': False, 'error': str(e)}), 403
    except (ValidationError, RepoValidationError) as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error setting caps for student {student_id}: {e}")
        return jsonify({'success': False, 'error': 'Failed to update caps'}), 500


# ── Grade periods (quarter / semester / annual grades + summaries) ───────────

@bp.route('/credits/<credit_id>/periods', methods=['GET'])
@require_auth
@validate_uuid_param('credit_id')
def list_credit_periods(user_id, credit_id):
    """Return the grade-period rows for a credit (quarter/semester/annual)."""
    try:
        supabase = get_supabase_admin_client()
        repo = OEARepository(client=supabase)
        credit = repo.get_credit(credit_id)
        if not credit:
            raise NotFoundError("Credit not found")
        _verify_manages_student(user_id, credit['student_id'], allow_self=True)
        return jsonify({'success': True, 'periods': repo.get_periods(credit_id)}), 200
    except AuthorizationError as e:
        return jsonify({'success': False, 'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error listing periods for credit {credit_id}: {e}")
        return jsonify({'success': False, 'error': 'Failed to fetch grade periods'}), 500


@bp.route('/credits/<credit_id>/periods', methods=['PUT'])
@require_auth
@validate_uuid_param('credit_id')
def upsert_credit_period(user_id, credit_id):
    """
    Record a quarter / semester / annual grade + summary for a course.

    Quarter entries are progress-only (the quarterly report card). Writing a
    SEMESTER or ANNUAL grade is the transcript grade: it is gated on the course's
    quarterly upload minimums for the quarters it spans (422 if short), then it
    derives oea_credits.letter_grade (annual > semester; quarters are never
    averaged) and marks the credit complete.

    Body: term_type ('quarter'|'semester'|'annual'), term_index (int),
          grade ('A'-'F'|null), summary (str|null), school_year (str, optional)
    """
    try:
        data = request.get_json() or {}
        term_type = (data.get('term_type') or '').strip()
        try:
            term_index = int(data.get('term_index'))
        except (TypeError, ValueError):
            raise ValidationError("term_index must be an integer")
        grade = data.get('grade')
        summary = data.get('summary')

        if not oea_rules.is_valid_term(term_type, term_index):
            raise ValidationError("Invalid term_type / term_index")
        if grade is not None and grade not in GRADE_POINTS:
            raise ValidationError("grade must be one of A, B, C, D, F")

        supabase = get_supabase_admin_client()
        repo = OEARepository(client=supabase)
        credit = repo.get_credit(credit_id)
        if not credit:
            raise NotFoundError("Credit not found")
        _verify_manages_student(user_id, credit['student_id'])

        settings = _settings_for_student(credit['student_id'])
        school_year = (data.get('school_year') or settings['school_year']).strip()

        # Gate transcript grades (semester/annual) on quarterly upload compliance.
        if term_type in ('semester', 'annual') and grade:
            from services import oea_compliance_service
            covered = oea_rules.quarters_covered(term_type, term_index)
            check = oea_compliance_service.quarters_compliant(
                supabase, credit, settings, school_year, covered)
            if not check['is_compliant']:
                return jsonify({
                    'success': False,
                    'error': ("Required quarterly uploads are missing for this course, so a "
                              "semester or annual grade can't be entered yet. Each quarter needs "
                              f"{settings['minimums']['logs_per_quarter']} learning logs, "
                              f"{settings['minimums']['artifacts_per_quarter']} artifacts, and a "
                              "quarterly summary."),
                    'compliance': check,
                }), 422

        period = repo.upsert_period(
            credit_id=credit_id, student_id=credit['student_id'], school_year=school_year,
            term_type=term_type, term_index=term_index, grade=grade, summary=summary,
            entered_by=user_id)

        # A semester/annual grade is the transcript grade: derive letter_grade
        # (override, not average) and complete the credit.
        if term_type in ('semester', 'annual'):
            all_periods = repo.get_periods(credit_id)
            transcript_grade = oea_rules.transcript_grade_for_credit(all_periods)
            if transcript_grade:
                repo.update_credit(credit_id, {
                    'letter_grade': transcript_grade, 'status': 'complete', 'completed_at': 'now()'})
                if credit.get('quest_id'):
                    repo.set_course_quest_completed(credit['student_id'], credit['quest_id'], completed=True)

        return jsonify({'success': True, 'period': period}), 200
    except AuthorizationError as e:
        return jsonify({'success': False, 'error': str(e)}), 403
    except (ValidationError, RepoValidationError) as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error saving period for credit {credit_id}: {e}")
        return jsonify({'success': False, 'error': 'Failed to save grade period'}), 500


# ── Transcript + quarterly progress report (data for the printable views) ────

def _org_branding(org_id):
    """Return {'name', 'logo_url'} for the transcript header (or Optio defaults)."""
    if not org_id:
        return {'name': 'OpenEd Academy', 'logo_url': None}
    supabase = get_supabase_admin_client()
    row = supabase.table('organizations').select('name, branding_config').eq('id', org_id).execute()
    if not row.data:
        return {'name': 'OpenEd Academy', 'logo_url': None}
    o = row.data[0]
    return {'name': o.get('name') or 'OpenEd Academy',
            'logo_url': (o.get('branding_config') or {}).get('logo_url')}


@bp.route('/students/<student_id>/transcript', methods=['GET'])
@require_auth
@validate_uuid_param('student_id')
def get_student_transcript(user_id, student_id):
    """
    Assemble OEA-branded transcript data: student info, pathway, credits (with
    grades, source, and the earned-elsewhere notation), GPA, progress, and diploma
    eligibility. The frontend renders + prints it.
    """
    try:
        _verify_manages_student(user_id, student_id, allow_self=True)

        supabase = get_supabase_admin_client()
        repo = OEARepository(client=supabase)

        student = supabase.table('users') \
            .select('first_name, last_name, display_name, email, date_of_birth, organization_id') \
            .eq('id', student_id).execute()
        if not student.data:
            raise NotFoundError("Student not found")
        s = student.data[0]

        enrollment = repo.get_enrollment(student_id)
        pathway_key = enrollment.get('pathway_key') if enrollment else None
        pathway = get_pathway(pathway_key) if pathway_key else None
        credits = repo.get_credits(student_id)

        req_label = {r['key']: r['label'] for r in (pathway['requirements'] if pathway else [])}
        rows = []
        for c in credits:
            src = c.get('credit_source') or 'direct'
            rows.append({
                'id': c['id'],
                'course_name': c['course_name'],
                'requirement_label': req_label.get(c.get('requirement_key'), c.get('requirement_key')),
                'category': c.get('category'),
                'credits': c.get('credits'),
                'credit_source': src,
                'letter_grade': c.get('letter_grade'),
                'is_weighted': c.get('is_weighted'),
                'status': c.get('status'),
                'completed_at': c.get('completed_at'),
                # 'transfer' looks native (no note); 'earned_elsewhere' is annotated.
                'note': oea_rules.TRANSFER_NOTE if src == 'earned_elsewhere' else None,
            })

        progress = compute_progress(pathway_key, credits) if pathway_key else None
        settings = oea_rules.load_oea_settings(supabase, s.get('organization_id'))

        return jsonify({
            'success': True,
            'student': {
                'name': (f"{s.get('first_name') or ''} {s.get('last_name') or ''}".strip()
                         or s.get('display_name')),
                'email': s.get('email'),
                'date_of_birth': s.get('date_of_birth'),
            },
            'organization': _org_branding(s.get('organization_id')),
            'pathway': pathway,
            'credits': rows,
            'gpa': compute_gpa(credits),
            'progress': progress,
            'diploma_eligibility': oea_rules.diploma_eligibility(progress, credits, settings),
            'school_year': settings['school_year'],
            'transfer_note': oea_rules.TRANSFER_NOTE,
        }), 200
    except AuthorizationError as e:
        return jsonify({'success': False, 'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error building transcript for student {student_id}: {e}")
        return jsonify({'success': False, 'error': 'Failed to build transcript'}), 500


@bp.route('/students/<student_id>/progress-report', methods=['GET'])
@require_auth
@validate_uuid_param('student_id')
def get_progress_report(user_id, student_id):
    """
    Quarterly progress report (the coach report card): each in-progress course with
    its parent-entered quarter grade + summary for the requested term, plus the
    per-course upload compliance for that quarter.

    Query: ?term=<1-4> (quarter index; defaults to 1), ?school_year=<...>
    """
    try:
        _verify_manages_student(user_id, student_id, allow_self=True)

        try:
            term_index = int(request.args.get('term', 1))
        except (TypeError, ValueError):
            raise ValidationError("term must be an integer 1-4")
        if term_index not in (1, 2, 3, 4):
            raise ValidationError("term must be 1-4")

        supabase = get_supabase_admin_client()
        repo = OEARepository(client=supabase)
        from services import oea_compliance_service

        settings = _settings_for_student(student_id)
        school_year = (request.args.get('school_year') or settings['school_year']).strip()
        enrollment = repo.get_enrollment(student_id)
        credits = repo.get_credits(student_id)
        periods = repo.get_periods_for_student(student_id, school_year)

        # Index quarter periods by credit for quick lookup.
        by_credit = {}
        for p in periods:
            if p.get('term_type') == 'quarter' and int(p.get('term_index') or 0) == term_index:
                by_credit[p['credit_id']] = p

        student = supabase.table('users') \
            .select('first_name, last_name, display_name, organization_id').eq('id', student_id).execute()
        s = student.data[0] if student.data else {}

        courses = []
        for c in credits:
            if c.get('status') == 'complete' and (c.get('credit_source') or 'direct') != 'direct':
                continue  # finished transfer credits aren't "in progress this quarter"
            p = by_credit.get(c['id']) or {}
            entry = {
                'credit_id': c['id'],
                'course_name': c['course_name'],
                'credit_source': c.get('credit_source') or 'direct',
                'quarter_grade': p.get('grade'),
                'quarter_summary': p.get('summary'),
            }
            if (c.get('credit_source') or 'direct') == 'direct':
                entry['compliance'] = oea_compliance_service.evaluate_course_quarter(
                    supabase, c, settings, school_year, term_index)
            courses.append(entry)

        return jsonify({
            'success': True,
            'student': {'name': (f"{s.get('first_name') or ''} {s.get('last_name') or ''}".strip()
                                 or s.get('display_name'))},
            'organization': _org_branding(s.get('organization_id')),
            'term_index': term_index,
            'school_year': school_year,
            'pathway': get_pathway(enrollment.get('pathway_key')) if enrollment else None,
            'courses': courses,
        }), 200
    except AuthorizationError as e:
        return jsonify({'success': False, 'error': str(e)}), 403
    except (ValidationError, RepoValidationError) as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error building progress report for student {student_id}: {e}")
        return jsonify({'success': False, 'error': 'Failed to build progress report'}), 500


# ── Compliance sweep (cron) ──────────────────────────────────────────────────

@bp.route('/internal/compliance-sweep', methods=['POST'])
def compliance_sweep():
    """Cron entrypoint: flag org admins about missing quarterly uploads.
    X-Cron-Secret, or a signed-in superadmin (mirrors the SIS attendance sweep)."""
    secret = request.headers.get('X-Cron-Secret')
    is_cron = bool(secret and Config.CRON_SECRET and secret == Config.CRON_SECRET)
    if not is_cron:
        from utils.session_manager import session_manager
        uid = session_manager.get_effective_user_id()
        is_super = False
        if uid:
            row = get_supabase_admin_client().table('users').select('role') \
                .eq('id', uid).limit(1).execute().data
            is_super = bool(row and row[0].get('role') == 'superadmin')
        if not is_super:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    from services import oea_compliance_sweep_service
    return jsonify({'success': True, **oea_compliance_sweep_service.run_sweep()}), 200
