"""Peer connection API.

Thin transport over services/peer_connection_service. Every rule that decides
who may connect to whom, and what an age screen is allowed to do, lives in that
service so the four safety properties can be read in one place; these handlers
authenticate, parse, and translate PeerConnectionError into a 400.

Rate limits here are deliberate rather than boilerplate:
  * ``/request`` is the one endpoint that consumes a secret typed in by hand.
    Without a limit, an 8-character code over a 31-glyph alphabet is guessable
    by a script. With one, it isn't.
  * ``/age-check`` is write-once per account anyway, but limiting it stops a
    caller from farming validation responses.
"""

from flask import Blueprint, request

from middleware.rate_limiter import rate_limit
from services import peer_connection_service as svc
from services.peer_connection_service import PeerConnectionError
from utils.api_response import success_response, error_response
from utils.auth.decorators import require_auth
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('connections', __name__, url_prefix='/api/connections')


def _fail(e: PeerConnectionError):
    # Every message raised by the service is written for a student or a parent
    # to read, so it is passed through rather than replaced with a generic one.
    return error_response(str(e), status_code=400)


@bp.route('/eligibility', methods=['GET'])
@require_auth
def get_eligibility(user_id):
    """What state is the caller in: eligible, needs a DOB, or under 13?"""
    return success_response(data=svc.eligibility(user_id))


@bp.route('/age-check', methods=['POST'])
@require_auth
@rate_limit(calls=10, period=3600, per_user=True)
def post_age_check(user_id):
    """Record a self-attested date of birth, once."""
    data = request.get_json() or {}
    try:
        return success_response(data=svc.age_check(user_id, data.get('date_of_birth')))
    except PeerConnectionError as e:
        return _fail(e)


@bp.route('/code', methods=['POST'])
@require_auth
@rate_limit(calls=20, period=3600, per_user=True)
def post_code(user_id):
    """Mint a fresh share code, retiring the previous one."""
    try:
        return success_response(data=svc.issue_code(user_id))
    except PeerConnectionError as e:
        return _fail(e)


@bp.route('/request', methods=['POST'])
@require_auth
@rate_limit(calls=10, period=3600, per_user=True)
def post_request(user_id):
    """Start a connection by entering another student's share code."""
    data = request.get_json() or {}
    try:
        conn = svc.request_by_code(user_id, data.get('code'))
        return success_response(data={'id': conn['id'], 'status': conn['status']})
    except PeerConnectionError as e:
        return _fail(e)


@bp.route('/<connection_id>/respond', methods=['POST'])
@require_auth
def post_respond(user_id, connection_id):
    """The receiving student accepts or declines."""
    data = request.get_json() or {}
    try:
        conn = svc.respond_to_request(user_id, connection_id, bool(data.get('accept')))
        return success_response(data={'id': conn['id'], 'status': conn['status']})
    except PeerConnectionError as e:
        return _fail(e)


@bp.route('/<connection_id>/revoke', methods=['POST'])
@require_auth
def post_revoke(user_id, connection_id):
    """End a connection. Either student, or either side's approver."""
    data = request.get_json() or {}
    try:
        conn = svc.revoke(user_id, connection_id, data.get('reason'))
        return success_response(data={'id': conn['id'], 'status': conn['status']})
    except PeerConnectionError as e:
        return _fail(e)


@bp.route('', methods=['GET'])
@require_auth
def get_connections(user_id):
    """Everything the connections page renders."""
    return success_response(data=svc.list_connections(user_id))


@bp.route('/feed', methods=['GET'])
@require_auth
def get_feed(user_id):
    """The student's own work plus their connected peers', interleaved."""
    limit = min(int(request.args.get('limit', 20)), 50)
    return success_response(data=svc.feed(user_id, limit=limit,
                                          cursor=request.args.get('cursor')))


# ---------------------------------------------------------------------------
# Approver side
# ---------------------------------------------------------------------------

@bp.route('/approvals', methods=['GET'])
@require_auth
def get_approvals(user_id):
    """What this adult needs to decide, and what they already decided.

    Both in one response because they are one page: a parent who approved a
    connection last month and wants it gone should not have to find a different
    screen than the one they approved it on.
    """
    return success_response(data={
        'pending': svc.pending_approvals(user_id),
        'approved': svc.approved_connections(user_id),
    })


@bp.route('/<connection_id>/approve', methods=['POST'])
@require_auth
def post_approve(user_id, connection_id):
    """A parent or same-org admin answers for their own child's side."""
    data = request.get_json() or {}
    try:
        conn = svc.approver_decision(user_id, connection_id, bool(data.get('approve')))
        return success_response(data={'id': conn['id'], 'status': conn['status']})
    except PeerConnectionError as e:
        return _fail(e)


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------

@bp.route('/comments', methods=['POST'])
@require_auth
@rate_limit(calls=60, period=3600, per_user=True)
def post_comment(user_id):
    """Comment on a connected peer's work."""
    data = request.get_json() or {}
    try:
        comment = svc.add_comment(
            author_id=user_id,
            student_id=data.get('student_id'),
            text=data.get('text'),
            learning_event_id=data.get('learning_event_id'),
            task_completion_id=data.get('task_completion_id'),
            quest_id=data.get('quest_id'),
        )
        return success_response(data=comment)
    except PeerConnectionError as e:
        return _fail(e)


@bp.route('/comments', methods=['GET'])
@require_auth
def get_comments(user_id):
    """Peer comments on one item."""
    student_id = request.args.get('student_id')
    if not student_id:
        return error_response('student_id is required', status_code=400)
    try:
        comments = svc.list_comments(
            caller_id=user_id,
            student_id=student_id,
            learning_event_id=request.args.get('learning_event_id'),
            task_completion_id=request.args.get('task_completion_id'),
            quest_id=request.args.get('quest_id'),
        )
        return success_response(data={'comments': comments})
    except PeerConnectionError as e:
        return _fail(e)


@bp.route('/comments/<comment_id>', methods=['DELETE'])
@require_auth
def delete_comment(user_id, comment_id):
    """Author removes their own; the student removes anything on their work."""
    try:
        svc.delete_comment(user_id, comment_id)
        return success_response(data={'deleted': True})
    except PeerConnectionError as e:
        return _fail(e)
