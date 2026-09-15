"""Friends API (peer connections).

Thin transport over services/peer_connection_service and
services/peer_policy_service. Every rule that decides who may connect to whom,
what a family's policy allows, and what an age screen is allowed to do lives
in those services so the safety properties can be read in one place; these
handlers authenticate, parse, and translate service errors into a 400.

Three gates, stacked:
  * ``module_guard(bp, 'friends')`` -- the school's switch. Off, and no route
    here answers for a student in that org. A platform student has no org to
    resolve and passes through; their family's policy is the only gate.
  * ``@student_scope`` on the student-shaped routes -- a parent works on a
    child's account as themselves (utils/guardian_scope). The route body sees
    the CHILD's id; the parent stays on g.student_scope for attribution. This
    is how the parent of a dependent (no login) sends, accepts and ends
    friend requests for them.
  * ``@require_relationship_to`` on the parent-shaped routes that name the
    child in the path -- the policy and the oversight view.

The request target on POST /request is ``peer_id``, never ``student_id``:
``student_id`` is the scope parameter and would be read as "act for this
student", which is exactly the confusion guardian_scope names.

Rate limits here are deliberate rather than boilerplate:
  * ``/request`` is the one endpoint that consumes a secret typed in by hand.
    Without a limit, an 8-character code over a 31-glyph alphabet is guessable
    by a script. With one, it isn't.
  * ``/age-check`` is write-once per account anyway, but limiting it stops a
    caller from farming validation responses.
"""

from typing import Optional

from flask import Blueprint, g, request

from middleware.rate_limiter import rate_limit
from modules.gate import module_guard
from services import peer_connection_service as svc
from services import peer_policy_service as policy_svc
from services.peer_connection_service import PeerConnectionError
from services.peer_policy_service import PeerPolicyError
from utils.api_response import success_response, error_response
from utils.auth.decorators import require_auth, require_org_admin, validate_uuid_param
from utils.auth.relationships import require_relationship_to, student_scope
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('connections', __name__, url_prefix='/api/connections')
module_guard(bp, policy_svc.MODULE_KEY)


def _fail(e: Exception):
    # Every message raised by the services is written for a student or a
    # parent to read, so it is passed through rather than replaced with a
    # generic one.
    return error_response(str(e), status_code=400)


def _acting_user_id() -> Optional[str]:
    """The signed-in person, whoever the request is about. None outside a
    scoped route, where the service treats the caller as the student."""
    scope = getattr(g, 'student_scope', None)
    return scope.caller_id if scope else None


# ---------------------------------------------------------------------------
# The student's side (a parent reaches all of these through student scope)
# ---------------------------------------------------------------------------

@bp.route('/eligibility', methods=['GET'])
@require_auth
@student_scope()
def get_eligibility(user_id):
    """What state is the student in: eligible, needs a DOB, Friends off?"""
    return success_response(data=svc.eligibility(user_id))


@bp.route('/age-check', methods=['POST'])
@require_auth
@rate_limit(calls=10, period=3600, per_user=True)
def post_age_check(user_id):
    """Record a self-attested date of birth, once. Never delegated: a
    parent sets a child's date of birth from the child's profile."""
    data = request.get_json() or {}
    try:
        return success_response(data=svc.age_check(user_id, data.get('date_of_birth')))
    except PeerConnectionError as e:
        return _fail(e)


@bp.route('/code', methods=['POST'])
@require_auth
@rate_limit(calls=20, period=3600, per_user=True)
@student_scope()
def post_code(user_id):
    """Mint a fresh share code, retiring the previous one."""
    try:
        return success_response(data=svc.issue_code(user_id))
    except PeerConnectionError as e:
        return _fail(e)


@bp.route('/request', methods=['POST'])
@require_auth
@rate_limit(calls=10, period=3600, per_user=True)
@student_scope()
def post_request(user_id):
    """Start a connection.

    Body: ``{code}`` (optionally ``source: 'link'`` when the code arrived by
    invite link) or ``{peer_id, source}`` with source 'classmates' or 'school'.
    """
    data = request.get_json() or {}
    try:
        conn = svc.request(
            user_id,
            code=data.get('code'),
            peer_id=data.get('peer_id'),
            source=data.get('source'),
            acting_user_id=_acting_user_id(),
        )
        return success_response(data={'id': conn['id'], 'status': conn['status']})
    except PeerConnectionError as e:
        return _fail(e)


@bp.route('/<connection_id>/respond', methods=['POST'])
@require_auth
@student_scope()
def post_respond(user_id, connection_id):
    """The receiving student accepts or declines."""
    data = request.get_json() or {}
    try:
        conn = svc.respond_to_request(user_id, connection_id, bool(data.get('accept')),
                                      acting_user_id=_acting_user_id())
        return success_response(data={'id': conn['id'], 'status': conn['status']})
    except PeerConnectionError as e:
        return _fail(e)


@bp.route('/<connection_id>/revoke', methods=['POST'])
@require_auth
@student_scope()
def post_revoke(user_id, connection_id):
    """End a connection. Either student, either student's parent, or either
    side's approver. Through student scope the parent revokes AS the child;
    a parent may also call this as themselves and pass is_parent_of."""
    data = request.get_json() or {}
    try:
        conn = svc.revoke(user_id, connection_id, data.get('reason'))
        return success_response(data={'id': conn['id'], 'status': conn['status']})
    except PeerConnectionError as e:
        return _fail(e)


@bp.route('', methods=['GET'])
@require_auth
@student_scope('peer_connections')
def get_connections(user_id):
    """Everything the friends page renders. With ?student_id= a parent reads
    their child's list, logged as a disclosure."""
    return success_response(data=svc.list_connections(user_id))


@bp.route('/feed', methods=['GET'])
@require_auth
@student_scope('activity')
def get_feed(user_id):
    """The student's own work plus their connected peers', interleaved."""
    limit = min(int(request.args.get('limit', 20)), 50)
    return success_response(data=svc.feed(user_id, limit=limit,
                                          cursor=request.args.get('cursor')))


@bp.route('/suggestions', methods=['GET'])
@require_auth
@student_scope()
def get_suggestions(user_id):
    """Who the student may ask, from the vetted pools: classmates, and the
    school where it opted in. Never a search; never anyone whose family has
    not turned Friends on."""
    try:
        return success_response(data=svc.suggestions(user_id))
    except PeerConnectionError as e:
        return _fail(e)


@bp.route('/reactions', methods=['GET'])
@require_auth
def get_reactions_palette(user_id):
    """The fixed palette, in display order, so the clients render one list."""
    return success_response(data={
        'reactions': [{'key': k, 'label': label} for k, label in svc.REACTIONS],
    })


@bp.route('/reactions', methods=['POST'])
@require_auth
@rate_limit(calls=120, period=3600, per_user=True)
def post_reaction(user_id):
    """React to a friend's work. Body: student_id (the work owner), reaction,
    and exactly one of task_completion_id / learning_event_id / quest_id."""
    data = request.get_json() or {}
    try:
        out = svc.set_reaction(
            author_id=user_id,
            student_id=data.get('student_id'),
            reaction=data.get('reaction'),
            learning_event_id=data.get('learning_event_id'),
            task_completion_id=data.get('task_completion_id'),
            quest_id=data.get('quest_id'),
        )
        return success_response(data=out)
    except PeerConnectionError as e:
        return _fail(e)


@bp.route('/reactions', methods=['DELETE'])
@require_auth
def delete_reaction(user_id):
    """Take a reaction back. The target comes on the query string (a DELETE
    has no body worth relying on): one of task_completion_id /
    learning_event_id / quest_id."""
    try:
        svc.clear_reaction(
            user_id,
            learning_event_id=request.args.get('learning_event_id'),
            task_completion_id=request.args.get('task_completion_id'),
            quest_id=request.args.get('quest_id'),
        )
        return success_response(data={'deleted': True})
    except PeerConnectionError as e:
        return _fail(e)


# ---------------------------------------------------------------------------
# The parent's side: the policy, the oversight view
# ---------------------------------------------------------------------------

@bp.route('/children/<student_id>/policy', methods=['GET'])
@require_auth
@validate_uuid_param('student_id')
@require_relationship_to('student_id', allow=('self', 'parent', 'org_staff'))
def get_child_policy(user_id, student_id):
    """The Friends policy in force for this child, and who could change it.
    'self' is here for the adult student who sets their own."""
    policy = policy_svc.effective_policy(student_id)
    return success_response(data={
        'policy': policy.to_dict(),
        'can_set': _can_set(user_id, student_id),
    })


@bp.route('/children/<student_id>/policy', methods=['PUT'])
@require_auth
@validate_uuid_param('student_id')
@require_relationship_to('student_id', allow=('self', 'parent', 'org_staff'))
def put_child_policy(user_id, student_id):
    """Set the child's Friends policy. Body: enabled, approval_mode,
    request_sources, friends_can (all optional; unspecified keeps the current
    value). Turning it off revokes the child's live connections and says how
    many. The relationship gate admits staff; the service narrows that to the
    org admin, and only for a student with no parent linked."""
    data = request.get_json() or {}
    try:
        result = policy_svc.set_policy(
            student_id, user_id, data,
            ip_address=request.headers.get('X-Forwarded-For', request.remote_addr),
            user_agent=request.headers.get('User-Agent'),
        )
        return success_response(data=result)
    except PeerPolicyError as e:
        return _fail(e)


@bp.route('/children/<student_id>/friends-count', methods=['GET'])
@require_auth
@validate_uuid_param('student_id')
@require_relationship_to('student_id', allow=('self', 'parent', 'org_staff'))
def get_child_friends_count(user_id, student_id):
    """How many friends the child has -- the number the confirm dialog names
    before a parent turns Friends off."""
    from repositories.peer_connection_repository import PeerConnectionRepository
    return success_response(data={
        'active': PeerConnectionRepository().active_count_for(student_id),
    })


@bp.route('/children/<student_id>/activity', methods=['GET'])
@require_auth
@validate_uuid_param('student_id')
@require_relationship_to('student_id', allow=('parent', 'org_staff'),
                         discloses='peer_activity')
def get_child_activity(user_id, student_id):
    """What happened between this child and their friends in the last N days
    (default 30, max 90): friends added and removed, comments given and
    received. Read-only, and logged as a disclosure -- a parent reading what
    other children wrote to theirs is reading an education record."""
    try:
        days = int(request.args.get('days', 30))
    except (TypeError, ValueError):
        days = 30
    return success_response(data=svc.peer_activity(student_id, days=days))


def _can_set(caller_id: str, student_id: str) -> bool:
    try:
        policy_svc.setter_kind(caller_id, student_id)
        return True
    except PeerPolicyError:
        return False


# ---------------------------------------------------------------------------
# The school's defaults (org admin)
# ---------------------------------------------------------------------------

@bp.route('/org/settings', methods=['GET'])
@require_org_admin
def get_org_settings(user_id, organization_id, is_superadmin):
    """The org's Friends defaults for students with no parent linked, and the
    school-wide pool switch. A superadmin names the org with ?organization_id=."""
    org_id = request.args.get('organization_id') if is_superadmin else organization_id
    org_id = org_id or organization_id
    if not org_id:
        return error_response('organization_id is required', status_code=400)
    return success_response(data=policy_svc.org_friends_settings(org_id))


@bp.route('/org/settings', methods=['PUT'])
@require_org_admin
def put_org_settings(user_id, organization_id, is_superadmin):
    """Body: default_enabled, default_approval_mode, school_pool (each
    optional)."""
    data = request.get_json() or {}
    org_id = data.get('organization_id') if is_superadmin else organization_id
    org_id = org_id or organization_id
    if not org_id:
        return error_response('organization_id is required', status_code=400)
    try:
        return success_response(data=policy_svc.set_org_friends_settings(org_id, data))
    except PeerPolicyError as e:
        return _fail(e)


# ---------------------------------------------------------------------------
# Approver side (ask-first requests)
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
    """A parent (any parent of that side) or the standing-in school admin
    answers for one side of an ask-first request."""
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


@bp.route('/ask-parent', methods=['POST'])
@require_auth
@rate_limit(calls=3, period=86400, per_user=True)
def ask_parent(user_id):
    """The student asks their parent to turn Friends on. Three a day: a
    reminder is fine, a drumbeat is not."""
    try:
        return success_response(data=svc.ask_parent(user_id))
    except PeerConnectionError as e:
        return _fail(e)


@bp.route('/comments/<comment_id>/hide', methods=['POST'])
@require_auth
@validate_uuid_param('comment_id')
def hide_comment(user_id, comment_id):
    """A parent takes a comment off their child's work. The service checks
    the relationship (the comment names the child; the route cannot)."""
    try:
        return success_response(data=svc.hide_comment(user_id, comment_id))
    except PeerConnectionError as e:
        return _fail(e)
