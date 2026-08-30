"""
Per-class discussion boards (2026-07-24) — threaded discussion for a single SIS
class (an org_classes row). Top-level posts + one level of replies.

NEW, additive (prefix /api/sis). Unlike the rest of the SIS console (which is
staff-only), these endpoints are open to any authenticated user, because the
participants of a class discussion are the class's teacher(s) and its enrolled
STUDENTS. Authorization is therefore not role-based — it is a per-class
participant gate enforced here in Python (see _authorize_class):

  A user may read/post in a class's discussion iff they are
    - an org_admin/superadmin of that class's organization, OR
    - the class's teacher (org_classes.primary_instructor_id or an active
      class_advisors row), OR
    - an actively enrolled student (class_enrollments row, status='active').
  A guardian of an actively enrolled student may READ, and nothing else
  (2026-08-30 -- Gryffin's students wrote 80 posts in two days on boards no
  adult surface rendered, while their teacher asked whether "teachers and
  parents see a group chat").

  org_classes.discussion_enabled is the per-class switch. Off: students and
  guardians get 403 (the component hides), nobody can post, and moderators
  (teacher/admin) still read and delete the history. Moderators flip it with
  PATCH /classes/<id>/discussion/settings.

class_id == org_classes.id (NOT a quests.id). A class links to learning quests
via class_quests; the /by-quest/<quest_id> variants resolve the owning class from
a quest id (used by the student-facing quest page, which only holds a quest id).

All DB access uses the service-role admin client (the class_discussion_posts
table is RLS-deny-all); authorization is done above every read/write.
"""

from datetime import datetime, timezone

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_auth
from utils.logger import get_logger
from utils.validation import validate_uuid
from services import sis_service
from database import get_supabase_admin_client

logger = get_logger(__name__)

bp = Blueprint('sis_class_discussions', __name__, url_prefix='/api/sis')

# Guard rails for a single post body.
_MAX_BODY_LEN = 8000


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _bad_uuid(*values):
    """True if any provided value is not a valid UUID."""
    for v in values:
        ok, _ = validate_uuid(v)
        if not ok:
            return True
    return False


def _load_org_class(admin, class_id):
    rows = (
        admin.table('org_classes')
        .select('id, organization_id, name, primary_instructor_id, status, discussion_enabled')
        .eq('id', class_id).limit(1).execute()
    ).data or []
    return rows[0] if rows else None


_NOT_A_PARTICIPANT = 'Discussion is available to the class teacher and enrolled students.'
_BOARD_OFF = 'Discussion is off for this class.'


def _access(user_id, class_row, admin):
    """(allowed, is_moderator, can_post) for this user against this class.

    is_moderator (teacher/org_admin/superadmin) may delete anyone's post and
    switch the board off. can_post is False for a guardian: they read their
    own child's class board and nothing more.
    """
    org_id = class_row.get('organization_id')

    # Admins: superadmin (any org) or org_admin of THIS class's org. resolve_org_id
    # locks a non-superadmin to their own org, so an org_admin of another org
    # resolves to a different org and is denied here.
    if sis_service.caller_is_admin(user_id):
        if sis_service.resolve_org_id(user_id, org_id) == org_id:
            return True, True, True
        return False, False, False

    # The class's teacher(s): primary instructor or an active co-teacher.
    if class_row.get('primary_instructor_id') == user_id:
        return True, True, True
    co_teacher = (
        admin.table('class_advisors').select('id')
        .eq('class_id', class_row['id']).eq('advisor_id', user_id)
        .eq('is_active', True).limit(1).execute()
    ).data
    if co_teacher:
        return True, True, True

    # Actively enrolled students.
    enrolled = (
        admin.table('class_enrollments').select('id')
        .eq('class_id', class_row['id']).eq('student_id', user_id)
        .eq('status', 'active').limit(1).execute()
    ).data
    if enrolled:
        return True, False, True

    # Guardians of an actively enrolled student: read-only. The same link the
    # rest of the platform uses for "my child" (managed_by_parent_id or an
    # approved parent_student_links row), narrowed to this class's roster.
    from utils import class_membership
    children = class_membership.children_of_parent(user_id)
    if children:
        child_here = (
            admin.table('class_enrollments').select('id')
            .eq('class_id', class_row['id']).eq('status', 'active')
            .in_('student_id', sorted(children)).limit(1).execute()
        ).data
        if child_here:
            return True, False, False

    return False, False, False


def _board_state(class_row, is_moderator, can_post):
    """What a participant may do on this board, or an error tuple when the
    board is switched off for them.

    Off means off for students and guardians (403, so the component hides),
    and read-only for moderators, who keep the history and the switch.
    """
    enabled = class_row.get('discussion_enabled') is not False
    if not enabled and not is_moderator:
        return None, (jsonify({'success': False, 'error': _BOARD_OFF}), 403)
    return {
        'is_moderator': is_moderator,
        'can_post': bool(can_post and enabled),
        'enabled': enabled,
    }, None


def _authorize_class(user_id, class_id):
    """Load + authorize a class for the caller.

    Returns (class_row, access, None) on success -- access is the dict from
    _board_state -- or (None, None, (response, status)) on failure.
    """
    if _bad_uuid(class_id):
        return None, None, (jsonify({'success': False, 'error': 'Invalid class id'}), 400)
    # admin client justified: discussion tables are RLS-deny-all; this loads the class and runs the _access participant gate (teacher/admin/enrolled student/guardian) before anything is returned
    admin = get_supabase_admin_client()
    class_row = _load_org_class(admin, class_id)
    if not class_row:
        return None, None, (jsonify({'success': False, 'error': 'Class not found'}), 404)
    allowed, is_moderator, can_post = _access(user_id, class_row, admin)
    if not allowed:
        return None, None, (jsonify({'success': False, 'error': _NOT_A_PARTICIPANT}), 403)
    access, err = _board_state(class_row, is_moderator, can_post)
    if err:
        return None, None, err
    return class_row, access, None


def _refuse_post(access):
    """The 403 for a participant who may read this board but not write on it."""
    if not access.get('enabled'):
        return jsonify({'success': False, 'error': _BOARD_OFF}), 403
    return jsonify({'success': False,
                    'error': 'You can read this board but not post on it.'}), 403


def _resolve_class_for_quest(user_id, quest_id):
    """Resolve the owning SIS class for a quest the caller participates in.

    A quest can be linked to several classes (class_quests); pick the first the
    caller can access whose board is open to them. Returns (class_row, access,
    None) or an error tuple: (None, None, (response, status)).
    """
    if _bad_uuid(quest_id):
        return None, None, (jsonify({'success': False, 'error': 'Invalid quest id'}), 400)
    # admin client justified: resolves quest -> owning class across class_quests/org_classes (deny-all RLS), then applies the _access participant gate per class
    admin = get_supabase_admin_client()
    links = (
        admin.table('class_quests').select('class_id')
        .eq('quest_id', quest_id).execute()
    ).data or []
    class_ids = list(dict.fromkeys(l['class_id'] for l in links if l.get('class_id')))
    if not class_ids:
        return None, None, (jsonify({'success': False, 'error': 'No class discussion for this quest'}), 404)
    classes = (
        admin.table('org_classes')
        .select('id, organization_id, name, primary_instructor_id, status, discussion_enabled')
        .in_('id', class_ids).execute()
    ).data or []
    switched_off = False
    for class_row in classes:
        allowed, is_moderator, can_post = _access(user_id, class_row, admin)
        if not allowed:
            continue
        access, err = _board_state(class_row, is_moderator, can_post)
        if err:
            switched_off = True
            continue
        return class_row, access, None
    return None, None, (jsonify({
        'success': False,
        'error': _BOARD_OFF if switched_off else _NOT_A_PARTICIPANT,
    }), 403)


def _display_name(u):
    return (
        (u.get('display_name') or '').strip()
        or f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip()
        or u.get('username') or u.get('email') or 'Member'
    )


def _names_for(admin, user_ids):
    ids = [i for i in {*user_ids} if i]
    if not ids:
        return {}
    rows = (
        admin.table('users')
        .select('id, display_name, first_name, last_name, username, email')
        .in_('id', ids).execute()
    ).data or []
    return {r['id']: _display_name(r) for r in rows}


def _serialize(post, names, user_id, is_moderator, *, tombstone=False):
    """Shape a post for the client. A tombstone is a soft-deleted parent that
    still has surviving replies — shown as '[deleted]', never deletable."""
    if tombstone:
        return {
            'id': post['id'],
            'body': '[deleted]',
            'author_user_id': None,
            'author_name': '[deleted]',
            'created_at': post.get('created_at'),
            'deleted': True,
            'can_delete': False,
        }
    return {
        'id': post['id'],
        'body': post.get('body'),
        'author_user_id': post.get('author_user_id'),
        'author_name': names.get(post.get('author_user_id'), 'Member'),
        'created_at': post.get('created_at'),
        'deleted': False,
        'can_delete': bool(is_moderator or post.get('author_user_id') == user_id),
    }


def _build_thread(class_row, user_id, is_moderator):
    """The full board for a class: top-level posts (newest first) each with their
    replies (oldest first). Soft-deleted leaf posts are omitted; a soft-deleted
    parent with surviving replies renders as a '[deleted]' tombstone."""
    # admin client justified: RLS-deny-all class_discussion_posts read + cross-user author-name hydration; callers already passed the participant gate
    admin = get_supabase_admin_client()
    posts = (
        admin.table('class_discussion_posts')
        .select('id, author_user_id, parent_post_id, body, created_at, deleted_at')
        .eq('class_id', class_row['id'])
        .order('created_at', desc=False).execute()
    ).data or []

    names = _names_for(admin, [p.get('author_user_id') for p in posts if not p.get('deleted_at')])

    children = {}
    tops = []
    for p in posts:
        if p.get('parent_post_id'):
            children.setdefault(p['parent_post_id'], []).append(p)
        else:
            tops.append(p)

    thread = []
    for top in tops:
        replies = [
            _serialize(r, names, user_id, is_moderator)
            for r in children.get(top['id'], [])
            if not r.get('deleted_at')
        ]  # already oldest-first from the query order
        if top.get('deleted_at'):
            # Drop a deleted top-level post unless replies keep it alive.
            if not replies:
                continue
            node = _serialize(top, names, user_id, is_moderator, tombstone=True)
        else:
            node = _serialize(top, names, user_id, is_moderator)
        node['replies'] = replies
        thread.append(node)

    # Top-level newest-first (most recent activity on top).
    thread.sort(key=lambda n: n.get('created_at') or '', reverse=True)
    return thread


def _create_post(class_row, user_id):
    data = request.get_json(silent=True) or {}
    body = (data.get('body') or '').strip()
    if not body:
        return jsonify({'success': False, 'error': 'Message body is required'}), 400
    if len(body) > _MAX_BODY_LEN:
        return jsonify({'success': False, 'error': f'Message is too long (max {_MAX_BODY_LEN} characters)'}), 400

    parent_post_id = data.get('parent_post_id')
    # admin client justified: RLS-deny-all class_discussion_posts insert; author is the authenticated caller and the participant gate was passed by the route
    admin = get_supabase_admin_client()

    if parent_post_id:
        if _bad_uuid(parent_post_id):
            return jsonify({'success': False, 'error': 'Invalid parent_post_id'}), 400
        parent = (
            admin.table('class_discussion_posts')
            .select('id, class_id, parent_post_id, deleted_at')
            .eq('id', parent_post_id).limit(1).execute()
        ).data
        parent = parent[0] if parent else None
        # Parent must exist, be in THIS class, be a top-level post (one nesting
        # level only), and not be deleted.
        if not parent or parent.get('class_id') != class_row['id']:
            return jsonify({'success': False, 'error': 'Parent post not found'}), 404
        if parent.get('parent_post_id'):
            return jsonify({'success': False, 'error': 'Replies can only be added to a top-level post'}), 400
        if parent.get('deleted_at'):
            return jsonify({'success': False, 'error': 'Cannot reply to a deleted post'}), 400

    inserted = (
        admin.table('class_discussion_posts').insert({
            'organization_id': class_row['organization_id'],
            'class_id': class_row['id'],
            'author_user_id': user_id,
            'parent_post_id': parent_post_id or None,
            'body': body,
        }).execute()
    ).data
    row = inserted[0] if inserted else {}
    author_name = _names_for(admin, [user_id]).get(user_id, 'Member')
    return jsonify({'success': True, 'post': {
        'id': row.get('id'),
        'body': row.get('body'),
        'author_user_id': user_id,
        'author_name': author_name,
        'created_at': row.get('created_at'),
        'parent_post_id': row.get('parent_post_id'),
        'deleted': False,
        'can_delete': True,
        'replies': [],
    }}), 201


# ── class_id-keyed endpoints (SIS class detail / teacher class page) ──────────
@bp.route('/classes/<class_id>/discussion', methods=['GET'])
@require_auth
def get_discussion(user_id, class_id):
    class_row, access, err = _authorize_class(user_id, class_id)
    if err:
        return err
    return jsonify({
        'success': True,
        'is_moderator': access['is_moderator'],
        'can_post': access['can_post'],
        'discussion_enabled': access['enabled'],
        'posts': _build_thread(class_row, user_id, access['is_moderator']),
    })


@bp.route('/classes/<class_id>/discussion', methods=['POST'])
@require_auth
def post_discussion(user_id, class_id):
    class_row, access, err = _authorize_class(user_id, class_id)
    if err:
        return err
    if not access['can_post']:
        return _refuse_post(access)
    return _create_post(class_row, user_id)


@bp.route('/classes/<class_id>/discussion/settings', methods=['PATCH'])
@require_auth
def update_discussion_settings(user_id, class_id):
    """Switch a class's board on or off. Moderators only (teacher or admin)."""
    class_row, access, err = _authorize_class(user_id, class_id)
    if err:
        return err
    if not access['is_moderator']:
        return jsonify({'success': False,
                        'error': 'Only the class teacher or an admin can change this.'}), 403
    data = request.get_json(silent=True) or {}
    enabled = data.get('enabled')
    if not isinstance(enabled, bool):
        return jsonify({'success': False, 'error': 'enabled must be true or false'}), 400
    # admin client justified: org_classes.discussion_enabled write, gated by the moderator check above
    get_supabase_admin_client().table('org_classes').update(
        {'discussion_enabled': enabled, 'updated_at': _now_iso()}
    ).eq('id', class_row['id']).execute()
    return jsonify({'success': True, 'discussion_enabled': enabled})


@bp.route('/classes/<class_id>/discussion/<post_id>', methods=['DELETE'])
@require_auth
def delete_discussion_post(user_id, class_id, post_id):
    class_row, access, err = _authorize_class(user_id, class_id)
    if err:
        return err
    if _bad_uuid(post_id):
        return jsonify({'success': False, 'error': 'Invalid post id'}), 400
    # admin client justified: soft-delete on RLS-deny-all class_discussion_posts; own-post-or-moderator check enforced below
    admin = get_supabase_admin_client()
    rows = (
        admin.table('class_discussion_posts')
        .select('id, class_id, author_user_id, deleted_at')
        .eq('id', post_id).limit(1).execute()
    ).data
    post = rows[0] if rows else None
    if not post or post.get('class_id') != class_row['id']:
        return jsonify({'success': False, 'error': 'Post not found'}), 404
    # Author may delete their own; moderators (teacher/admin) may delete anyone's.
    if not (access['is_moderator'] or post.get('author_user_id') == user_id):
        return jsonify({'success': False, 'error': 'You cannot delete this post'}), 403
    if not post.get('deleted_at'):
        admin.table('class_discussion_posts').update(
            {'deleted_at': _now_iso(), 'updated_at': _now_iso()}
        ).eq('id', post_id).execute()
    return jsonify({'success': True})


# ── by-quest variants (student-facing learning-app quest page) ────────────────
# The quest page only holds a quest id; resolve the owning class the caller
# participates in, then apply the identical participant gate.
@bp.route('/classes/by-quest/<quest_id>/discussion', methods=['GET'])
@require_auth
def get_discussion_by_quest(user_id, quest_id):
    class_row, access, err = _resolve_class_for_quest(user_id, quest_id)
    if err:
        return err
    is_moderator = access['is_moderator']
    return jsonify({
        'success': True,
        'class_id': class_row['id'],
        'class_name': class_row.get('name'),
        'is_moderator': is_moderator,
        'can_post': access['can_post'],
        'discussion_enabled': access['enabled'],
        'posts': _build_thread(class_row, user_id, is_moderator),
    })


@bp.route('/classes/by-quest/<quest_id>/discussion', methods=['POST'])
@require_auth
def post_discussion_by_quest(user_id, quest_id):
    class_row, access, err = _resolve_class_for_quest(user_id, quest_id)
    if err:
        return err
    if not access['can_post']:
        return _refuse_post(access)
    return _create_post(class_row, user_id)


@bp.route('/classes/by-quest/<quest_id>/discussion/<post_id>', methods=['DELETE'])
@require_auth
def delete_discussion_post_by_quest(user_id, quest_id, post_id):
    class_row, access, err = _resolve_class_for_quest(user_id, quest_id)
    if err:
        return err
    is_moderator = access['is_moderator']
    if _bad_uuid(post_id):
        return jsonify({'success': False, 'error': 'Invalid post id'}), 400
    # admin client justified: soft-delete on RLS-deny-all class_discussion_posts; own-post-or-moderator check enforced below
    admin = get_supabase_admin_client()
    rows = (
        admin.table('class_discussion_posts')
        .select('id, class_id, author_user_id, deleted_at')
        .eq('id', post_id).limit(1).execute()
    ).data
    post = rows[0] if rows else None
    if not post or post.get('class_id') != class_row['id']:
        return jsonify({'success': False, 'error': 'Post not found'}), 404
    if not (is_moderator or post.get('author_user_id') == user_id):
        return jsonify({'success': False, 'error': 'You cannot delete this post'}), 403
    if not post.get('deleted_at'):
        admin.table('class_discussion_posts').update(
            {'deleted_at': _now_iso(), 'updated_at': _now_iso()}
        ).eq('id', post_id).execute()
    return jsonify({'success': True})
