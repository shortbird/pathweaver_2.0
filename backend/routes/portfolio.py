"""
REPOSITORY MIGRATION: COMPLETE
- Uses PortfolioService for all data operations
- Service orchestrates multiple repositories/tables
- Routes are thin controllers handling HTTP concerns only
"""

from flask import Blueprint, jsonify, request
from flask_cors import cross_origin
from services.portfolio_service import PortfolioService
from utils.auth.decorators import require_auth
from utils.api_response_v1 import success_response, error_response
from utils.session_manager import session_manager
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('portfolio', __name__)


@bp.route('/public/<portfolio_slug>', methods=['GET'])
@cross_origin()
def get_public_portfolio(portfolio_slug):
    """
    Public endpoint (no auth required) to view a student's portfolio.
    Returns: user info, completed quests with evidence, skill XP totals
    """
    try:
        portfolio_service = PortfolioService()
        result = portfolio_service.get_public_portfolio_data(portfolio_slug)

        if 'error' in result:
            return error_response(
                code='PORTFOLIO_NOT_FOUND',
                message=result['error'],
                status=404
            )

        return success_response(data=result)

    except Exception as e:
        import traceback
        logger.error(f"Error fetching portfolio: {str(e)}")
        logger.info(f"Full traceback: {traceback.format_exc()}")
        return error_response(
            code='PORTFOLIO_ERROR',
            message='Failed to fetch portfolio',
            status=500
        )


@bp.route('/user/<user_id>', methods=['GET'])
@cross_origin()
@require_auth
def get_user_portfolio(auth_user_id: str, user_id: str):
    """
    Get portfolio data for a specific user.
    """
    try:
        logger.info(f"Getting portfolio for user_id: {user_id}")
        portfolio_service = PortfolioService()
        result = portfolio_service.get_portfolio_summary(user_id)

        return jsonify(result), 200

    except Exception as e:
        import traceback
        logger.error(f"Error fetching user portfolio: {str(e)}")
        logger.info(f"Full traceback: {traceback.format_exc()}")
        # Return a minimal response even on error
        return jsonify({
            'diploma': {
                'portfolio_slug': f"user{user_id[:8]}",
                'issued_date': None,
                'is_public': True
            },
            'user': {'id': user_id},
            'skill_xp': [],
            'total_quests_completed': 0,
            'total_xp': 0,
            'portfolio_url': f"https://optio.com/portfolio/user{user_id[:8]}"
        }), 200


@bp.route('/diploma/<user_id>', methods=['GET'])
@cross_origin(supports_credentials=True)
def get_public_diploma_by_user_id(user_id):
    """
    Public endpoint to view a student's diploma by user ID.
    This is the route called by the diploma page when viewing /diploma/:userId
    """
    try:
        logger.info(f"=== DIPLOMA ENDPOINT CALLED FOR USER: {user_id} ===")

        portfolio_service = PortfolioService()

        # Get viewer for access check
        viewer_user_id = session_manager.get_current_user_id()
        logger.info(f"[FERPA] Viewer check: viewer_user_id={viewer_user_id}")

        # LTI SpeedGrader carve-out: a signed evidence token authorizes the
        # (unauthenticated) grading teacher to view this student's diploma
        # regardless of its public/private setting.
        lti_token = request.args.get('lti_token')
        lti_authorized = False
        if lti_token:
            from services.lti_service import verify_evidence_token
            lti_authorized = verify_evidence_token(lti_token, user_id)
            logger.info(f"[LTI] Evidence token presented; valid={lti_authorized}")

        result = portfolio_service.get_diploma_data(
            user_id, viewer_user_id, lti_authorized=lti_authorized
        )

        if 'error' in result:
            error_msg = result['error']
            if error_msg == 'User not found':
                logger.error(f"ERROR: User not found for ID: {user_id}")
                return jsonify({'error': 'User not found'}), 404
            else:
                logger.info(f"[FERPA] Access DENIED: viewer={viewer_user_id}, owner={user_id}")
                return jsonify({'error': 'Portfolio not found or private'}), 404

        logger.info(f"[FERPA] Access GRANTED: viewer={viewer_user_id}, owner={user_id}")
        logger.info(f"=== RETURNING DIPLOMA DATA ===")
        logger.info(f"Student: {result.get('student')}")
        logger.info(f"Achievements: {len(result.get('achievements', []))}")
        logger.info(f"Total XP: {result.get('total_xp')}")

        return jsonify(result), 200

    except Exception as e:
        import traceback
        logger.error(f"=== ERROR IN DIPLOMA ENDPOINT ===")
        logger.error(f"Error fetching diploma: {str(e)}")
        logger.info(f"Full traceback: {traceback.format_exc()}")
        return jsonify({'error': 'Failed to fetch diploma'}), 500


# =============================================================================
# PORTFOLIO CURATION ("Portfolio picks")
# =============================================================================

def _can_curate_for(caller_id: str, student_id: str) -> bool:
    """May the caller curate this student's portfolio?
    Allowed: the student themselves, their parent (parent_student_links or
    managed_by_parent_id), an org_admin of the student's org, and superadmin."""
    if caller_id == student_id:
        return True
    from database import get_supabase_admin_client
    # admin client justified: relationship/role verification before a cross-user
    # write (parent link, org admin, superadmin) — the write itself is a single
    # boolean flag on the student's own completion row.
    admin = get_supabase_admin_client()

    caller_rows = admin.table('users').select(
        'id, role, org_role, org_roles, organization_id'
    ).eq('id', caller_id).limit(1).execute().data
    if not caller_rows:
        return False
    caller = caller_rows[0]
    if caller.get('role') == 'superadmin':
        return True

    student_rows = admin.table('users').select(
        'id, organization_id, managed_by_parent_id'
    ).eq('id', student_id).limit(1).execute().data
    if not student_rows:
        return False
    student = student_rows[0]

    # Parent of a dependent
    if student.get('managed_by_parent_id') == caller_id:
        return True

    # Linked parent (statuses vary historically: approved / active)
    links = admin.table('parent_student_links').select('id, status')\
        .eq('parent_user_id', caller_id).eq('student_user_id', student_id).execute().data or []
    if any(l.get('status') in ('approved', 'active') for l in links):
        return True

    # Org admin of the student's org
    caller_org_roles = set(caller.get('org_roles') or [])
    if caller.get('org_role'):
        caller_org_roles.add(caller['org_role'])
    if ('org_admin' in caller_org_roles
            and caller.get('organization_id')
            and caller.get('organization_id') == student.get('organization_id')):
        return True
    return False


@bp.route('/completions/<completion_id>/curate', methods=['PATCH'])
@require_auth
def curate_completion(user_id, completion_id):
    """Toggle a completed task in/out of the curated "Portfolio picks" section.

    Body: {"in_portfolio": true|false}
    Allowed: the completion's student, their parent, an org_admin of the
    student's org, or superadmin.
    """
    try:
        data = request.json or {}
        if 'in_portfolio' not in data:
            return error_response(
                code='VALIDATION_ERROR',
                message='in_portfolio (boolean) is required',
                status=400
            )
        in_portfolio = bool(data.get('in_portfolio'))

        from database import get_supabase_admin_client
        # admin client justified: completion ownership + relationship checks done
        # in _can_curate_for before this single-flag write
        admin = get_supabase_admin_client()
        rows = admin.table('quest_task_completions').select('id, user_id')\
            .eq('id', completion_id).limit(1).execute().data
        if not rows:
            return error_response(code='NOT_FOUND', message='Completion not found', status=404)
        student_id = rows[0]['user_id']

        if not _can_curate_for(user_id, student_id):
            return error_response(
                code='PERMISSION_DENIED',
                message='You cannot curate this portfolio',
                status=403
            )

        admin.table('quest_task_completions').update(
            {'in_portfolio': in_portfolio}
        ).eq('id', completion_id).execute()

        return success_response(data={'completion_id': completion_id,
                                      'in_portfolio': in_portfolio})
    except Exception as e:
        logger.error(f"Error curating completion {completion_id}: {str(e)}")
        return error_response(code='CURATE_ERROR', message='Failed to update portfolio', status=500)


@bp.route('/completions/by-task/<task_id>', methods=['GET'])
@require_auth
def get_completion_by_task(user_id, task_id):
    """Resolve the caller's (or, with ?student_id=, their child's) completion row
    for a task — used by the "Include in portfolio" toggle to find completion_id.
    Returns {has_completion, completion_id, in_portfolio}."""
    try:
        student_id = request.args.get('student_id') or user_id
        if student_id != user_id and not _can_curate_for(user_id, student_id):
            return error_response(code='PERMISSION_DENIED',
                                  message='Not allowed for this student', status=403)
        from database import get_supabase_admin_client
        # admin client justified: read scoped to caller (or verified child) only
        admin = get_supabase_admin_client()
        rows = admin.table('quest_task_completions').select('id, in_portfolio')\
            .eq('user_quest_task_id', task_id).eq('user_id', student_id)\
            .limit(1).execute().data
        if not rows:
            return success_response(data={'has_completion': False})
        return success_response(data={
            'has_completion': True,
            'completion_id': rows[0]['id'],
            'in_portfolio': bool(rows[0].get('in_portfolio')),
        })
    except Exception as e:
        logger.error(f"Error fetching completion for task {task_id}: {str(e)}")
        return error_response(code='FETCH_ERROR', message='Failed to load completion', status=500)


@bp.route('/completions/curated', methods=['GET'])
@require_auth
def get_curated_completions(user_id):
    """The caller's curated "Portfolio picks" list (or a linked student's via
    ?student_id=, using the same permission rules as curation)."""
    try:
        student_id = request.args.get('student_id') or user_id
        if student_id != user_id and not _can_curate_for(user_id, student_id):
            return error_response(code='PERMISSION_DENIED',
                                  message='Not allowed for this student', status=403)
        curated = PortfolioService().get_curated_completions(student_id)
        return success_response(data={'curated': curated})
    except Exception as e:
        logger.error(f"Error fetching curated completions: {str(e)}")
        return error_response(code='FETCH_ERROR', message='Failed to load portfolio picks', status=500)


# =============================================================================
# FERPA COMPLIANCE: Privacy and Consent Management
# =============================================================================

@bp.route('/user/<user_id>/visibility-status', methods=['GET'])
@require_auth
def get_visibility_status(authenticated_user_id, user_id):
    """
    Get portfolio visibility status including consent and minor status.
    Used by frontend to determine what UI to show for privacy controls.
    """
    try:
        # Verify user is checking their own status
        if authenticated_user_id != user_id:
            return error_response(
                code='UNAUTHORIZED',
                message='Can only check your own visibility status',
                status=403
            )

        portfolio_service = PortfolioService()
        result = portfolio_service.get_visibility_status(user_id)

        if 'error' in result:
            return error_response(
                code='USER_NOT_FOUND',
                message=result['error'],
                status=404
            )

        return success_response(result)

    except Exception as e:
        import traceback
        logger.error(f"Error fetching visibility status: {str(e)}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return error_response(
            code='VISIBILITY_STATUS_ERROR',
            message=f'Failed to fetch visibility status: {str(e)}',
            status=500
        )


@bp.route('/user/<user_id>/privacy', methods=['PUT'])
@require_auth
def update_portfolio_privacy(authenticated_user_id, user_id):
    """
    Toggle portfolio privacy setting with FERPA-compliant consent flow.

    For making public:
    - Requires consent_acknowledged=true in request body
    - Minors (under 18 or is_dependent) require parent approval
    - Adults can consent directly

    For making private:
    - Always immediate, no restrictions
    """
    try:
        # Verify user is updating their own portfolio
        if authenticated_user_id != user_id:
            return error_response(
                code='UNAUTHORIZED',
                message='Can only update your own privacy settings',
                status=403
            )

        portfolio_service = PortfolioService()
        data = request.json or {}
        is_public = data.get('is_public', False)
        consent_acknowledged = data.get('consent_acknowledged', False)

        # MAKING PRIVATE - always allowed immediately
        if not is_public:
            result = portfolio_service.make_portfolio_private(user_id)
            return success_response({
                'message': 'Portfolio is now private',
                'is_public': False
            })

        # MAKING PUBLIC - requires consent and may require parent approval

        # Require consent acknowledgment
        if not consent_acknowledged:
            return error_response(
                code='CONSENT_REQUIRED',
                message='Must acknowledge consent to make portfolio public. '
                        'Set consent_acknowledged=true to confirm you understand '
                        'your educational records will be publicly accessible.',
                status=400
            )

        # Get user info to check if minor
        visibility_status = portfolio_service.get_visibility_status(user_id)

        if 'error' in visibility_status:
            return error_response(
                code='USER_NOT_FOUND',
                message='User not found',
                status=404
            )

        is_minor_user = visibility_status.get('is_minor', False)

        if is_minor_user:
            # Find parent
            from database import get_supabase_admin_client
            # admin client justified: minor-user portfolio share requires looking up parent (managed_by_parent_id) for consent verification
            supabase = get_supabase_admin_client()
            user_result = supabase.table('users').select(
                'managed_by_parent_id'
            ).eq('id', user_id).execute()

            user_data = user_result.data[0] if user_result.data else {}
            parent_id = portfolio_service.find_parent_id(user_id, user_data)

            if not parent_id:
                return error_response(
                    code='PARENT_REQUIRED',
                    message='Users under 18 must have a linked parent or guardian '
                            'to make their portfolio public. Please link a parent first.',
                    status=400
                )

            # Create parent approval request
            try:
                result = portfolio_service.create_parent_approval_request(user_id, parent_id)

                if 'error' in result:
                    error_code = result['error']
                    if error_code == 'REQUEST_PENDING':
                        return error_response(
                            code='REQUEST_PENDING',
                            message='A request for parent approval is already pending.',
                            status=400
                        )
                    elif error_code == 'REQUEST_DENIED_RECENTLY':
                        return error_response(
                            code='REQUEST_DENIED_RECENTLY',
                            message=result['message'],
                            status=400
                        )

                # Send notification to parent
                try:
                    from services.notification_service import NotificationService
                    notification_service = NotificationService()

                    student_result = supabase.table('users').select(
                        'first_name, organization_id'
                    ).eq('id', user_id).execute()
                    student_name = student_result.data[0]['first_name'] if student_result.data else 'Your child'
                    org_id = student_result.data[0].get('organization_id') if student_result.data else None

                    notification_service.notify_parent_approval_required(
                        parent_user_id=parent_id,
                        student_name=student_name,
                        student_id=user_id,
                        organization_id=org_id
                    )
                    logger.info(f"[FERPA] Sent parent approval notification to {parent_id} for student {user_id}")
                except Exception as notif_err:
                    logger.warning(f"Failed to send parent notification: {notif_err}")

                return success_response({
                    'message': f'Request sent to {result.get("parent_name", "your parent")} for approval',
                    'is_public': False,
                    'pending_parent_approval': True,
                    'parent_name': result.get('parent_name')
                })

            except Exception as minor_err:
                logger.error(f"Minor approval flow failed: {minor_err}")
                return error_response(
                    code='MIGRATION_REQUIRED',
                    message='The FERPA compliance migration needs to be applied. '
                            'Please run backend/migrations/20260102_ferpa_private_by_default.sql',
                    status=500
                )

        # NOT A MINOR - can consent directly
        result = portfolio_service.make_portfolio_public_adult(user_id)

        if result.get('success'):
            logger.info(f"[FERPA] User {user_id} consented to public portfolio")
            return success_response({
                'message': 'Portfolio is now public',
                'is_public': True,
                'consent_given': True
            })
        else:
            return error_response(
                code='UPDATE_FAILED',
                message='Failed to update privacy setting',
                status=400
            )

    except Exception as e:
        logger.error(f"Error updating privacy: {str(e)}")
        return error_response(
            code='PRIVACY_UPDATE_ERROR',
            message='Failed to update privacy setting',
            status=500
        )
