"""
Credits Routes
API endpoints for academic credit tracking and transcript generation.

REPOSITORY MIGRATION: NO MIGRATION NEEDED
- Already uses CreditMappingService (service layer pattern) - best practice
- No direct database calls
- Service layer is the preferred pattern over direct repository usage
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth, validate_uuid_param
from services.credit_mapping_service import CreditMappingService

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('credits', __name__, url_prefix='/api/credits')


@bp.route('/my-credits', methods=['GET'])
@require_auth
def get_user_credits(user_id):
    """
    Get user's earned credits summary.

    Returns:
        - total_credits: Total credits earned
        - credits_by_subject: Breakdown by subject
        - diploma_progress: Overall diploma completion percentage
    """
    credits = CreditMappingService.calculate_user_credits(user_id)

    return jsonify({
        'success': True,
        'credits': credits
    }), 200


@bp.route('/transcript', methods=['GET'])
@require_auth
def get_my_transcript(user_id):
    """
    Generate academic transcript for authenticated user.

    Query params:
        - format: 'json', 'html', or 'pdf' (default: 'json')
    """
    format_type = request.args.get('format', 'json')

    transcript = CreditMappingService.generate_transcript(user_id, format=format_type)

    return jsonify({
        'success': True,
        'transcript': transcript
    }), 200


@bp.route('/transcript/<target_user_id>', methods=['GET'])
@require_auth
@validate_uuid_param('target_user_id')
def get_transcript(user_id, target_user_id):
    """
    Get academic transcript for a specific user.

    Path params:
        target_user_id: User ID to get transcript for

    Query params:
        - format: 'json', 'html', or 'pdf' (default: 'json')

    Authorization:
        - User viewing their own transcript
        - Advisor assigned to this student
        - Admin/superadmin
        - Observer linked to this student
        - Parent if target is their dependent
        - Public access if portfolio is set to public
    """
    from database import get_supabase_admin_client
    from middleware.error_handler import AuthorizationError

    format_type = request.args.get('format', 'json')
    supabase = get_supabase_admin_client()

    # Check if user is viewing their own transcript
    if user_id == target_user_id:
        transcript = CreditMappingService.generate_transcript(target_user_id, format=format_type)
        return jsonify({'success': True, 'transcript': transcript}), 200

    # Get requesting user's role
    requesting_user = supabase.table('users').select('role, organization_id').eq('id', user_id).single().execute()

    if not requesting_user.data:
        raise AuthorizationError('Unauthorized access')

    user_role = requesting_user.data.get('role')

    # Admin/superadmin always has access
    if user_role == 'superadmin':
        transcript = CreditMappingService.generate_transcript(target_user_id, format=format_type)
        return jsonify({'success': True, 'transcript': transcript}), 200

    # Check if advisor is assigned to this student
    if user_role == 'advisor':
        assignment = supabase.table('advisor_student_assignments')\
            .select('id')\
            .eq('advisor_id', user_id)\
            .eq('student_id', target_user_id)\
            .eq('is_active', True)\
            .execute()

        if assignment.data and len(assignment.data) > 0:
            transcript = CreditMappingService.generate_transcript(target_user_id, format=format_type)
            return jsonify({'success': True, 'transcript': transcript}), 200

    # Check if observer is linked to this student
    if user_role == 'observer':
        link = supabase.table('observer_student_links')\
            .select('id')\
            .eq('observer_id', user_id)\
            .eq('student_id', target_user_id)\
            .eq('status', 'active')\
            .execute()

        if link.data and len(link.data) > 0:
            transcript = CreditMappingService.generate_transcript(target_user_id, format=format_type)
            return jsonify({'success': True, 'transcript': transcript}), 200

    # Check if parent and target is their dependent
    if user_role == 'parent':
        dependent = supabase.table('users')\
            .select('id')\
            .eq('id', target_user_id)\
            .eq('is_dependent', True)\
            .eq('managed_by_parent_id', user_id)\
            .execute()

        if dependent.data and len(dependent.data) > 0:
            transcript = CreditMappingService.generate_transcript(target_user_id, format=format_type)
            return jsonify({'success': True, 'transcript': transcript}), 200

        # Also check parent_student_links table for non-dependent children
        link = supabase.table('parent_student_links')\
            .select('id')\
            .eq('parent_user_id', user_id)\
            .eq('student_user_id', target_user_id)\
            .eq('status', 'approved')\
            .execute()

        if link.data and len(link.data) > 0:
            transcript = CreditMappingService.generate_transcript(target_user_id, format=format_type)
            return jsonify({'success': True, 'transcript': transcript}), 200

    # Check if target user's portfolio is public
    target_user = supabase.table('users').select('preferences').eq('id', target_user_id).single().execute()

    if target_user.data:
        preferences = target_user.data.get('preferences', {})
        if preferences.get('portfolio_public', False):
            transcript = CreditMappingService.generate_transcript(target_user_id, format=format_type)
            return jsonify({'success': True, 'transcript': transcript}), 200

    # No permission found
    raise AuthorizationError('You do not have permission to view this transcript')


@bp.route('/requirements', methods=['GET'])
def get_requirements():
    """
    Get diploma credit requirements.

    Returns:
        - requirements: Dictionary of subject requirements
        - total_credits_required: Total credits needed
        - xp_per_credit: XP to credit conversion rate
    """
    requirements = CreditMappingService.get_diploma_requirements()

    return jsonify({
        'success': True,
        'requirements': requirements
    }), 200


@bp.route('/ledger', methods=['GET'])
@require_auth
def get_credit_ledger(user_id):
    """
    Get detailed credit ledger entries for user.

    Query params:
        - year: Filter by academic year (optional)
        - subject: Filter by credit type/subject (optional)
    """
    academic_year = request.args.get('year', type=int)
    credit_type = request.args.get('subject')

    entries = CreditMappingService.get_credit_ledger_entries(
        user_id,
        academic_year=academic_year,
        credit_type=credit_type
    )

    return jsonify({
        'success': True,
        'entries': entries,
        'count': len(entries)
    }), 200


@bp.route('/quest/<quest_id>/calculate', methods=['GET'])
@validate_uuid_param('quest_id')
def calculate_quest_credits(quest_id):
    """
    Calculate total credits available from a quest.

    Path params:
        quest_id: Quest UUID

    Returns:
        - total_credits: Total credits from all tasks
        - credits_by_subject: Breakdown by subject
    """
    credits = CreditMappingService.calculate_quest_credits(quest_id)

    return jsonify({
        'success': True,
        'credits': credits
    }), 200


@bp.route('/calculator', methods=['POST'])
def calculate_credits():
    """
    Calculate credits for given XP amounts.

    Request body:
        - subject_xp: Dictionary mapping subjects to XP amounts
          Example: {"math": 500, "science": 300}

    Returns:
        - credits_by_subject: Calculated credits per subject
        - total_credits: Total credits
    """
    data = request.get_json()

    if 'subject_xp' not in data:
        return jsonify({
            'success': False,
            'error': 'Missing required field: subject_xp'
        }), 400

    subject_xp = data['subject_xp']
    credits_by_subject = {}
    total_credits = 0.0

    for subject, xp in subject_xp.items():
        credits = round(xp / CreditMappingService.XP_PER_CREDIT, 2)
        credits_by_subject[subject] = credits
        total_credits += credits

    return jsonify({
        'success': True,
        'credits_by_subject': credits_by_subject,
        'total_credits': round(total_credits, 2),
        'xp_per_credit': CreditMappingService.XP_PER_CREDIT
    }), 200
