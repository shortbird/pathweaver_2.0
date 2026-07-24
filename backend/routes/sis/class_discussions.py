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
        .select('id, organization_id, name, primary_instructor_id, status')
        .eq('id', class_id).limit(1).execute()
    ).data or []
    return rows[0] if rows else None


def _access(user_id, class_row, admin):
    """(allowed, is_moderator) for this user against this class.

    is_moderator (teacher/org_admin/superadmin) may delete anyone's post.
    """
    org_id = class_row.get('organization_id')

    # Admins: superadmin (any org) or org_admin of THIS class's org. resolve_org_id
    # locks a non-superadmin to their own org, so an org_admin of another org
    # resolves to a different org and is denied here.
    if sis_service.caller_is_admin(user_id):
        if sis_service.resolve_org_id(user_id, org_id) == org_id:
            return True, True
        return False, False

    # The class's teacher(s): primary instructor or an active co-teacher.
    if class_row.get('primary_instructor_id') == user_id:
        return True, True
    co_teacher = (
        admin.table('class_advisors').select('id')
        .eq('class_id', class_row['id']).eq('advisor_id', user_id)
        .eq('is_active', True).limit(1).execute()
    ).data
    if co_teacher:
        return True, True

    # Actively enrolled students.
    enrolled = (
        admin.table('class_enrollments').select('id')
        .eq('class_id', class_row['id']).eq('student_id', user_id)
        .eq('status', 'active').limit(1).execute()
    ).data
    if enrolled:
        return True, False

    return False, False


def _authorize_class(user_id, class_id):
    """Load + authorize a class for the caller.

    Returns (class_row, is_moderator, None) on success, or
    (None, False, (response, status)) on failure.
    """
    if _bad_uuid(class_id):
        return None, False, (jsonify({'success': False, 'error': 'Invalid class id'}), 400)
    admin = get_supabase_admin_client()
    class_row = _load_org_class(admin, class_id)
    if not class_row:
        return None, False, (jsonify({'success': False, 'error': 'Class not found'}), 404)
    allowed, is_moderator = _access(user_id, class_row, admin)
    if not allowed:
        return None, False, (jsonify({
            'success': False,
            'error': 'Discussion is available to the class teacher and enrolled students.'
        }), 403)
    return class_row, is_moderator, None


def _resolve_class_for_quest(user_id, quest_id):
    """Resolve the owning SIS class for a quest the caller participates in.

    A quest can be linked to several classes (class_quests); pick the first the
    caller can access. Returns (class_row, is_moderator, None) or an error tuple:
    (None, False, (response, status)).
    """
    if _bad_uuid(quest_id):
        return None, False, (jsonify({'success': False, 'error': 'Invalid quest id'}), 400)
    admin = get_supabase_admin_client()
    links = (
        admin.table('class_quests').select('class_id')
        .eq('quest_id', quest_id).execute()
    ).data or []
    class_ids = list(dict.fromkeys(l['class_id'] for l in links if l.get('class_id')))
    if not class_ids:
        return None, False, (jsonify({'success': False, 'error': 'No class discussion for this quest'}), 404)
    classes = (
        admin.table('org_classes')
        .select('id, organization_id, name, primary_instructor_id, status')
        .in_('id', class_ids).execute()
    ).data or []
    for class_row in classes:
        allowed, is_moderator = _access(user_id, class_row, admin)
        if allowed:
            return class_row, is_moderator, None
    return None, False, (jsonify({
        'success': False,
        'error': 'Discussion is available to the class teacher and enrolled students.'
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
    class_row, is_moderator, err = _authorize_class(user_id, class_id)
    if err:
        return err
    return jsonify({
        'success': True,
        'is_moderator': is_moderator,
        'posts': _build_thread(class_row, user_id, is_moderator),
    })


@bp.route('/classes/<class_id>/discussion', methods=['POST'])
@require_auth
def post_discussion(user_id, class_id):
    class_row, _is_moderator, err = _authorize_class(user_id, class_id)
    if err:
        return err
    return _create_post(class_row, user_id)


@bp.route('/classes/<class_id>/discussion/<post_id>', methods=['DELETE'])
@require_auth
def delete_discussion_post(user_id, class_id, post_id):
    class_row, is_moderator, err = _authorize_class(user_id, class_id)
    if err:
        return err
    if _bad_uuid(post_id):
        return jsonify({'success': False, 'error': 'Invalid post id'}), 400
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
    if not (is_moderator or post.get('author_user_id') == user_id):
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
    class_row, is_moderator, err = _resolve_class_for_quest(user_id, quest_id)
    if err:
        return err
    return jsonify({
        'success': True,
        'class_id': class_row['id'],
        'class_name': class_row.get('name'),
        'is_moderator': is_moderator,
        'posts': _build_thread(class_row, user_id, is_moderator),
    })


@bp.route('/classes/by-quest/<quest_id>/discussion', methods=['POST'])
@require_auth
def post_discussion_by_quest(user_id, quest_id):
    class_row, _is_moderator, err = _resolve_class_for_quest(user_id, quest_id)
    if err:
        return err
    return _create_post(class_row, user_id)


@bp.route('/classes/by-quest/<quest_id>/discussion/<post_id>', methods=['DELETE'])
@require_auth
def delete_discussion_post_by_quest(user_id, quest_id, post_id):
    class_row, is_moderator, err = _resolve_class_for_quest(user_id, quest_id)
    if err:
        return err
    if _bad_uuid(post_id):
        return jsonify({'success': False, 'error': 'Invalid post id'}), 400
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
