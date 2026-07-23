"""
SIS submissions inbox — one unified queue of everything newly submitted by
students in a teacher's classes, with a review-and-advance flow.

A "submission" is a quest_task_completions row whose student is actively
enrolled in one of the caller's classes AND whose quest is attached to that
class via class_quests. Review state lives in sis_submission_reviews
(completion_id UNIQUE); a completion with no row is "new".

NEW, additive (/api/sis), staff-gated, org-scoped. Advisors are limited to
their own classes via sis_service.class_scope; org admins see the whole org.
"""

from datetime import datetime, timezone

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.logger import get_logger
from services import sis_service
from database import get_supabase_admin_client

logger = get_logger(__name__)

bp = Blueprint('sis_submissions', __name__, url_prefix='/api/sis')

STAFF_ROLES = ('org_admin', 'advisor', 'superadmin')


def _org_or_error(user_id):
    body = request.get_json(silent=True) or {}
    requested = request.args.get('organization_id') or body.get('organization_id')
    org_id = sis_service.resolve_org_id(user_id, requested)
    if not org_id:
        return None, (jsonify({
            'success': False,
            'error': 'No organization in context. Superadmins must pass ?organization_id.'
        }), 400)
    return org_id, None


def _display_name(u):
    if not u:
        return 'User'
    return (u.get('display_name')
            or ' '.join(filter(None, [u.get('first_name'), u.get('last_name')])).strip()
            or u.get('email') or 'User')


def _scope_classes(user_id, org_id):
    """Classes the caller may review, as {class_id: class_name}.

    Advisors: their own classes (primary instructor or active class_advisors).
    Org admins / superadmin: every class in the org. Always constrained to the
    resolved org so an advisor's cross-org class ids (impossible today, cheap
    to guard) never leak another org's submissions.
    """
    admin = get_supabase_admin_client()
    scope = sis_service.class_scope(user_id, org_id)  # None = unrestricted
    q = admin.table('org_classes').select('id, name').eq('organization_id', org_id)
    if scope is not None:
        if not scope:
            return {}
        q = q.in_('id', scope)
    rows = q.execute().data or []
    return {r['id']: r.get('name') or 'Class' for r in rows}


def _class_maps(class_ids):
    """(enrolled, attached): {class_id: set(student_ids)}, {class_id: set(quest_ids)}."""
    admin = get_supabase_admin_client()
    enrolled = {}
    rows = (
        admin.table('class_enrollments').select('class_id, student_id')
        .in_('class_id', class_ids).eq('status', 'active').execute()
    ).data or []
    for r in rows:
        enrolled.setdefault(r['class_id'], set()).add(r['student_id'])
    attached = {}
    rows = (
        admin.table('class_quests').select('class_id, quest_id')
        .in_('class_id', class_ids).execute()
    ).data or []
    for r in rows:
        attached.setdefault(r['class_id'], set()).add(r['quest_id'])
    return enrolled, attached


def _match_class(completion, class_ids, enrolled, attached):
    """First class where the student is enrolled AND the quest is attached."""
    for cid in class_ids:
        if (completion['user_id'] in enrolled.get(cid, ())
                and completion.get('quest_id') in attached.get(cid, ())):
            return cid
    return None


def _completion_in_scope(user_id, org_id, completion_id):
    """(completion, error_response). Verifies the completion's student+quest sit
    inside one of the caller's classes; otherwise a scope-safe 404."""
    classes = _scope_classes(user_id, org_id)
    if not classes:
        return None, (jsonify({'success': False, 'error': 'Submission not found'}), 404)
    admin = get_supabase_admin_client()
    rows = (
        admin.table('quest_task_completions')
        .select('id, user_id, quest_id, user_quest_task_id, completed_at')
        .eq('id', completion_id).limit(1).execute()
    ).data or []
    if not rows:
        return None, (jsonify({'success': False, 'error': 'Submission not found'}), 404)
    completion = rows[0]
    class_ids = list(classes.keys())
    enrolled, attached = _class_maps(class_ids)
    if _match_class(completion, class_ids, enrolled, attached) is None:
        return None, (jsonify({'success': False, 'error': 'Submission not found'}), 404)
    return completion, None


@bp.route('/submissions', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_submissions(user_id):
    """Unified inbox. ?scope=new|reviewed&class_id=&limit=&offset=

    'new' is ordered oldest-first (teachers work the backlog in order);
    'reviewed' newest-first. Both totals are always returned for the badge.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    scope = request.args.get('scope', 'new')
    if scope not in ('new', 'reviewed'):
        return jsonify({'success': False, 'error': "scope must be 'new' or 'reviewed'"}), 400
    try:
        limit = min(max(int(request.args.get('limit', 50)), 1), 200)
        offset = max(int(request.args.get('offset', 0)), 0)
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'limit and offset must be integers'}), 400

    def empty():
        return jsonify({'success': True, 'submissions': [],
                        'counts': {'new': 0, 'reviewed': 0},
                        'total': 0, 'limit': limit, 'offset': offset})

    classes = _scope_classes(user_id, org_id)
    class_filter = request.args.get('class_id')
    if class_filter:
        if class_filter not in classes:
            return jsonify({'success': False, 'error': 'Class not found'}), 404
        classes = {class_filter: classes[class_filter]}
    if not classes:
        return empty()

    class_ids = list(classes.keys())
    enrolled, attached = _class_maps(class_ids)
    all_students = set().union(*enrolled.values()) if enrolled else set()
    all_quests = set().union(*attached.values()) if attached else set()
    if not all_students or not all_quests:
        return empty()

    admin = get_supabase_admin_client()
    completions = (
        admin.table('quest_task_completions')
        .select('id, user_id, quest_id, user_quest_task_id, completed_at')
        .in_('user_id', list(all_students))
        .in_('quest_id', list(all_quests))
        .order('completed_at', desc=False)
        .execute()
    ).data or []

    # Keep only completions that land in one of the caller's classes
    # (student enrolled AND quest attached to the same class).
    matched = []
    for c in completions:
        cid = _match_class(c, class_ids, enrolled, attached)
        if cid:
            c['class_id'] = cid
            c['class_name'] = classes[cid]
            matched.append(c)
    if not matched:
        return empty()

    # Review state (org-scoped; UNIQUE completion_id)
    review_rows = (
        admin.table('sis_submission_reviews')
        .select('completion_id, reviewed_by, action, reviewed_at')
        .eq('organization_id', org_id)
        .execute()
    ).data or []
    reviews = {r['completion_id']: r for r in review_rows}

    new_items = [c for c in matched if c['id'] not in reviews]           # oldest first
    reviewed_items = [c for c in matched if c['id'] in reviews][::-1]    # newest first
    counts = {'new': len(new_items), 'reviewed': len(reviewed_items)}

    pool = new_items if scope == 'new' else reviewed_items
    total = len(pool)
    page = pool[offset:offset + limit]

    # ── Enrich the page: student, quest, task, evidence, reviewer name ──
    student_ids = list({c['user_id'] for c in page})
    quest_ids = list({c['quest_id'] for c in page if c.get('quest_id')})
    task_ids = list({c['user_quest_task_id'] for c in page if c.get('user_quest_task_id')})
    reviewer_ids = list({reviews[c['id']]['reviewed_by'] for c in page
                         if c['id'] in reviews and reviews[c['id']].get('reviewed_by')})

    students_map = {}
    people_ids = list(set(student_ids + reviewer_ids))
    if people_ids:
        rows = (admin.table('users')
                .select('id, display_name, first_name, last_name, avatar_url')
                .in_('id', people_ids).execute()).data or []
        students_map = {u['id']: u for u in rows}

    quests_map = {}
    if quest_ids:
        rows = (admin.table('quests').select('id, title')
                .in_('id', quest_ids).execute()).data or []
        quests_map = {q['id']: q for q in rows}

    tasks_map = {}
    if task_ids:
        rows = (admin.table('user_quest_tasks')
                .select('id, title, description, pillar, xp_value')
                .in_('id', task_ids).execute()).data or []
        tasks_map = {t['id']: t for t in rows}

    # Evidence: one document per (task_id, user_id), blocks ordered.
    doc_map, blocks_by_doc = {}, {}
    if task_ids:
        docs = (admin.table('user_task_evidence_documents')
                .select('id, task_id, user_id')
                .in_('task_id', task_ids).execute()).data or []
        for d in docs:
            doc_map[(d['task_id'], d['user_id'])] = d['id']
        doc_ids = list(doc_map.values())
        if doc_ids:
            blocks = (admin.table('evidence_document_blocks')
                      .select('id, document_id, block_type, content, order_index')
                      .in_('document_id', doc_ids)
                      .order('order_index').execute()).data or []
            for b in blocks:
                blocks_by_doc.setdefault(b['document_id'], []).append(b)

    items = []
    for c in page:
        student = students_map.get(c['user_id'], {})
        task = tasks_map.get(c.get('user_quest_task_id'), {})
        quest = quests_map.get(c.get('quest_id'), {})
        review = reviews.get(c['id'])
        doc_id = doc_map.get((c.get('user_quest_task_id'), c['user_id']))
        items.append({
            'completion_id': c['id'],
            'completed_at': c.get('completed_at'),
            'student': {
                'id': c['user_id'],
                'name': _display_name(student),
                'avatar_url': student.get('avatar_url'),
            },
            'class_id': c['class_id'],
            'class_name': c['class_name'],
            'quest_id': c.get('quest_id'),
            'quest_title': quest.get('title', 'Quest'),
            'task': {
                'id': c.get('user_quest_task_id'),
                'title': task.get('title', 'Task'),
                'description': task.get('description'),
                'pillar': task.get('pillar'),
                'xp_value': task.get('xp_value', 0),
            },
            'evidence_blocks': blocks_by_doc.get(doc_id, []),
            'review': ({
                'reviewed_by': review.get('reviewed_by'),
                'reviewed_by_name': _display_name(students_map.get(review.get('reviewed_by'))),
                'action': review.get('action'),
                'reviewed_at': review.get('reviewed_at'),
            } if review else None),
        })

    return jsonify({'success': True, 'submissions': items, 'counts': counts,
                    'total': total, 'limit': limit, 'offset': offset})


@bp.route('/submissions/<completion_id>/review', methods=['POST'])
@require_role(*STAFF_ROLES)
def review_submission(user_id, completion_id):
    """Mark a submission reviewed ({action}, default 'accepted'). Idempotent:
    re-reviewing updates the existing row (completion_id is UNIQUE)."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    completion, err = _completion_in_scope(user_id, org_id, completion_id)
    if err:
        return err
    action = ((request.get_json(silent=True) or {}).get('action') or 'accepted').strip()
    admin = get_supabase_admin_client()
    try:
        saved = admin.table('sis_submission_reviews').upsert({
            'organization_id': org_id,
            'completion_id': completion_id,
            'reviewed_by': user_id,
            'action': action,
            'reviewed_at': datetime.now(timezone.utc).isoformat(),
        }, on_conflict='completion_id').execute()
    except Exception as e:
        logger.error(f"Error reviewing submission {completion_id}: {e}")
        return jsonify({'success': False, 'error': 'Failed to save review'}), 500
    review = (saved.data or [None])[0]
    return jsonify({'success': True, 'review': review}), 201


@bp.route('/submissions/<completion_id>/review', methods=['DELETE'])
@require_role(*STAFF_ROLES)
def unreview_submission(user_id, completion_id):
    """Un-review (move back to 'new') — for accidental accepts."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    _, err = _completion_in_scope(user_id, org_id, completion_id)
    if err:
        return err
    admin = get_supabase_admin_client()
    try:
        admin.table('sis_submission_reviews').delete() \
            .eq('completion_id', completion_id) \
            .eq('organization_id', org_id).execute()
    except Exception as e:
        logger.error(f"Error un-reviewing submission {completion_id}: {e}")
        return jsonify({'success': False, 'error': 'Failed to remove review'}), 500
    return jsonify({'success': True})
