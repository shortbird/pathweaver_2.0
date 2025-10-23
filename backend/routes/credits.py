"""
Credits Routes
API endpoints for academic credit tracking and transcript generation.
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth
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
def get_transcript(target_user_id):
    """
    Get academic transcript for a specific user (public or advisor access).

    Path params:
        target_user_id: User ID to get transcript for

    Query params:
        - format: 'json', 'html', or 'pdf' (default: 'json')
    """
    format_type = request.args.get('format', 'json')

    # TODO: Add permission check - only allow if:
    # - User is viewing their own transcript
    # - User is an advisor for this student
    # - User is an admin
    # - Transcript is set to public in portfolio settings

    transcript = CreditMappingService.generate_transcript(target_user_id, format=format_type)

    return jsonify({
        'success': True,
        'transcript': transcript
    }), 200


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
