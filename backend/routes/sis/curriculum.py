"""
SIS curriculum library — the org's curriculum, held separately from classes.

Why this is not just class materials: a school's curriculum outlives its
timetable. iCreate keeps curriculum for subjects they aren't teaching this
semester, and one curriculum (Reading Workshop) backs four different class
sections. So a curriculum entry exists on its own, carries the Google Drive
folder it lives in, and is ATTACHED to zero or more classes.

The other difference is audience. class_materials (routes/sis/class_materials.py)
are shown to enrolled STUDENTS. Curriculum is staff-only — teachers see the
curriculum for the classes they teach, students never see it at all. Keep that
line: it is the reason this is a separate table rather than a flag.

NEW, additive (/api/sis/curriculum). Admins manage the org-wide library; teachers
get the same form scoped to a class they teach (add/edit/remove their own entries
on that class) via the /classes/<id>/curriculum routes. Org scoping via
sis_service.resolve_org_id on every route.

A curriculum is also the CONTAINER for the teaching material a class inherits —
its quest set (sis_curriculum_quests, 20260804) and its courses
(sis_curriculum_courses, 20260806). iCreate, 2026-08-06: "admin should attach
courses/quests to curriculum so they're reusable year after year and teachers
have resources to use, rather than requiring teachers to create their own
quests." Both sets are edited here, in the library, because that is the object
that outlives the timetable; a class inherits from them.

The two sets behave differently on purpose:
  - quests are COPIED onto a section, which then owns its own list (per-section
    publish/due dates, removals) — see routes/sis/class_quests.py;
  - courses are LINKED, because a course carries no per-section state, so fixing
    the library should fix every class rather than leave stale copies behind.
"""

from datetime import datetime, timezone

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role, require_auth
from utils.logger import get_logger
from utils.validation import validate_uuid
from services import sis_service
from services.sis_quest_authoring import (
    QuestAuthoringError,
    create_org_quest,
    clean_task as _clean_task,
    norm_pillar as _norm_pillar,
)
from database import get_supabase_admin_client
from utils.sis_roles import STAFF_ROLES, ADMIN_ROLES

logger = get_logger(__name__)

bp = Blueprint('sis_curriculum', __name__, url_prefix='/api/sis')


_MAX_TITLE = 200
_MAX_URL = 2000


def _admin():
    return get_supabase_admin_client()


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


def _bad_uuid(*values):
    for v in values:
        ok, _ = validate_uuid(v)
        if not ok:
            return True
    return False


def _normalize_url(raw):
    """Accept a pasted Drive link with or without a scheme; reject anything else.

    Curriculum links are staff-entered and open in a new tab, so a javascript:
    or data: URL would be a stored-XSS vector — only http(s) gets through.
    """
    url = (raw or '').strip()
    if not url:
        return None
    if not url.lower().startswith(('http://', 'https://')):
        if '://' in url:  # some other scheme — refuse rather than rewrite it
            return None
        url = f'https://{url}'
    return url[:_MAX_URL]


def _owned(org_id, curriculum_id):
    rows = (_admin().table('sis_curriculum').select('*')
            .eq('id', curriculum_id).limit(1).execute()).data or []
    row = rows[0] if rows else None
    return row if row and row.get('organization_id') == org_id else None


def _attachments(curriculum_ids):
    """{curriculum_id: [{class_id, name, min_age, max_age}]} for the given curricula.

    The ages come along because the library list is sorted and scanned by age
    range — a curriculum has no age of its own, it inherits the span of the
    classes that teach it.
    """
    if not curriculum_ids:
        return {}
    links = (_admin().table('sis_curriculum_classes')
             .select('curriculum_id, class_id')
             .in_('curriculum_id', curriculum_ids).execute()).data or []
    class_ids = list({l['class_id'] for l in links})
    classes = {}
    if class_ids:
        rows = (_admin().table('org_classes').select('id, name, min_age, max_age')
                .in_('id', class_ids).execute()).data or []
        classes = {r['id']: r for r in rows}
    out = {}
    for l in links:
        c = classes.get(l['class_id']) or {}
        out.setdefault(l['curriculum_id'], []).append({
            'class_id': l['class_id'], 'name': c.get('name') or 'Untitled class',
            'min_age': c.get('min_age'), 'max_age': c.get('max_age'),
        })
    for entries in out.values():
        entries.sort(key=lambda c: (c['name'] or '').lower())
    return out


def _set_counts(table, curriculum_ids):
    """{curriculum_id: n} for one of the curriculum's attached sets.

    Bounded by the org's own curriculum list, so this is a single read rather
    than a per-row count — but it is a read of LINK rows, which grow with the
    library, so it pages.
    """
    if not curriculum_ids:
        return {}
    from utils.db_fetch import fetch_all_rows
    rows = fetch_all_rows(lambda: (
        _admin().table(table).select('id, curriculum_id')
        .in_('curriculum_id', curriculum_ids)
    ))
    counts = {}
    for r in rows:
        counts[r['curriculum_id']] = counts.get(r['curriculum_id'], 0) + 1
    return counts


# ── Admin: the library ────────────────────────────────────────────────────────

@bp.route('/curriculum', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_curriculum(user_id):
    """The org's curriculum library, each entry with the classes it is attached to."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    q = (_admin().table('sis_curriculum').select('*')
         .eq('organization_id', org_id).order('title'))
    if request.args.get('include_inactive') not in ('1', 'true', 'yes'):
        q = q.eq('is_active', True)
    rows = q.execute().data or []
    ids = [r['id'] for r in rows]
    attached = _attachments(ids)
    quest_counts = _set_counts('sis_curriculum_quests', ids)
    course_counts = _set_counts('sis_curriculum_courses', ids)
    for r in rows:
        r['classes'] = attached.get(r['id'], [])
        # What this curriculum carries, so the library can say "3 quests, 1
        # course" without a request per row. A curriculum with nothing on it is
        # the one a teacher still has to build from scratch.
        r['quest_count'] = quest_counts.get(r['id'], 0)
        r['course_count'] = course_counts.get(r['id'], 0)
    return jsonify({'success': True, 'curriculum': rows})


@bp.route('/curriculum', methods=['POST'])
@require_role(*ADMIN_ROLES)
def create_curriculum(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()[:_MAX_TITLE]
    if not title:
        return jsonify({'success': False, 'error': 'A title is required'}), 400
    if data.get('drive_url') and not _normalize_url(data.get('drive_url')):
        return jsonify({'success': False, 'error': 'The link must be a web address (http or https)'}), 400
    row = (_admin().table('sis_curriculum').insert({
        'organization_id': org_id,
        'title': title,
        'subject': (data.get('subject') or '').strip()[:_MAX_TITLE] or None,
        'description': (data.get('description') or '').strip() or None,
        'drive_url': _normalize_url(data.get('drive_url')),
        'notes': (data.get('notes') or '').strip() or None,
        'created_by': user_id,
    }).execute()).data
    return jsonify({'success': True, 'curriculum': row[0] if row else None}), 201


@bp.route('/curriculum/<curriculum_id>', methods=['PATCH'])
@require_role(*ADMIN_ROLES)
def update_curriculum(user_id, curriculum_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if _bad_uuid(curriculum_id) or not _owned(org_id, curriculum_id):
        return jsonify({'success': False, 'error': 'Curriculum not found'}), 404
    data = request.get_json(silent=True) or {}
    fields = {}
    if 'title' in data:
        title = (data.get('title') or '').strip()[:_MAX_TITLE]
        if not title:
            return jsonify({'success': False, 'error': 'A title is required'}), 400
        fields['title'] = title
    for key in ('subject', 'description', 'notes'):
        if key in data:
            value = (data.get(key) or '').strip()
            fields[key] = value[:_MAX_TITLE] if key == 'subject' else (value or None)
    if 'drive_url' in data:
        raw = (data.get('drive_url') or '').strip()
        if raw and not _normalize_url(raw):
            return jsonify({'success': False, 'error': 'The link must be a web address (http or https)'}), 400
        fields['drive_url'] = _normalize_url(raw)
    if 'is_active' in data:
        fields['is_active'] = bool(data.get('is_active'))
    if not fields:
        return jsonify({'success': False, 'error': 'Nothing to update'}), 400
    fields['updated_at'] = datetime.now(timezone.utc).isoformat()
    row = (_admin().table('sis_curriculum').update(fields)
           .eq('id', curriculum_id).execute()).data
    return jsonify({'success': True, 'curriculum': row[0] if row else None})


@bp.route('/curriculum/<curriculum_id>', methods=['DELETE'])
@require_role(*ADMIN_ROLES)
def delete_curriculum(user_id, curriculum_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if _bad_uuid(curriculum_id) or not _owned(org_id, curriculum_id):
        return jsonify({'success': False, 'error': 'Curriculum not found'}), 404
    # Attachments cascade; the Drive folder itself is untouched (we only ever
    # stored a link to it).
    _admin().table('sis_curriculum').delete().eq('id', curriculum_id).execute()
    return jsonify({'success': True})


# ── Admin: attaching to classes ───────────────────────────────────────────────

@bp.route('/curriculum/<curriculum_id>/classes', methods=['PUT'])
@require_role(*ADMIN_ROLES)
def set_curriculum_classes(user_id, curriculum_id):
    """Replace the set of classes this curriculum is attached to.

    Sent as the whole list rather than add/remove calls so the UI's multi-select
    is the source of truth and two admins editing at once can't interleave into
    a half-applied state.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if _bad_uuid(curriculum_id) or not _owned(org_id, curriculum_id):
        return jsonify({'success': False, 'error': 'Curriculum not found'}), 404
    data = request.get_json(silent=True) or {}
    requested = [c for c in (data.get('class_ids') or []) if c]
    if any(_bad_uuid(c) for c in requested):
        return jsonify({'success': False, 'error': 'Invalid class id'}), 400

    # Only this org's classes — never let an id from another school through.
    valid = set()
    if requested:
        rows = (_admin().table('org_classes').select('id')
                .eq('organization_id', org_id).in_('id', requested).execute()).data or []
        valid = {r['id'] for r in rows}
    rejected = [c for c in requested if c not in valid]

    _admin().table('sis_curriculum_classes').delete().eq('curriculum_id', curriculum_id).execute()
    if valid:
        _admin().table('sis_curriculum_classes').insert(
            [{'curriculum_id': curriculum_id, 'class_id': c} for c in valid]
        ).execute()
    return jsonify({'success': True, 'attached': len(valid), 'rejected': len(rejected)})


# ── The curriculum's teaching material: its quests and its courses ───────────
#
# Both sets used to be reachable only from a class — you opened a section, and
# from there pushed its quest list back onto the curriculum. That works for a
# teacher tidying up at the end of a term and not at all for an admin setting up
# a year's curriculum before any section exists. These routes are that missing
# direction: edit the durable object directly, and let classes inherit.


def _quest_titles(quest_ids):
    if not quest_ids:
        return {}
    rows = (_admin().table('quests').select('id, title, is_active')
            .in_('id', quest_ids).execute()).data or []
    return {r['id']: r for r in rows}


def _course_rows(course_ids):
    if not course_ids:
        return {}
    rows = (_admin().table('courses')
            .select('id, title, description, status, organization_id')
            .in_('id', course_ids).execute()).data or []
    return {r['id']: r for r in rows}


@bp.route('/curriculum/<curriculum_id>/resources', methods=['GET'])
@require_role(*STAFF_ROLES)
def curriculum_resources(user_id, curriculum_id):
    """The quests and courses this curriculum carries.

    Staff-tier, not admin-tier: a teacher reads this to see what their class is
    meant to be taught from. Writing is admin-only (the routes below).
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if _bad_uuid(curriculum_id) or not _owned(org_id, curriculum_id):
        return jsonify({'success': False, 'error': 'Curriculum not found'}), 404

    quest_links = (_admin().table('sis_curriculum_quests')
                   .select('quest_id, sequence_order')
                   .eq('curriculum_id', curriculum_id)
                   .order('sequence_order').execute()).data or []
    quests = _quest_titles([l['quest_id'] for l in quest_links])
    course_links = (_admin().table('sis_curriculum_courses')
                    .select('course_id, sequence_order')
                    .eq('curriculum_id', curriculum_id)
                    .order('sequence_order').execute()).data or []
    courses = _course_rows([l['course_id'] for l in course_links])

    return jsonify({
        'success': True,
        # A link can outlive what it points at (a quest deleted from the library,
        # a course archived). Drop the dangling ones from the read rather than
        # render a row with no title.
        'quests': [{'id': l['quest_id'], 'title': quests[l['quest_id']].get('title'),
                    'is_active': quests[l['quest_id']].get('is_active', True)}
                   for l in quest_links if l['quest_id'] in quests],
        'courses': [{'id': l['course_id'], **{k: courses[l['course_id']].get(k)
                                              for k in ('title', 'description', 'status')}}
                    for l in course_links if l['course_id'] in courses],
    })


@bp.route('/curriculum/<curriculum_id>/assignable-quests', methods=['GET'])
@require_role(*ADMIN_ROLES)
def curriculum_assignable_quests(user_id, curriculum_id):
    """Quests that could be added: the school's own, plus the Optio library.

    Same two sources and same shape as the class-level picker
    (/classes/<id>/assignable-quests) so the two screens don't disagree about
    what is available; this one just isn't scoped to a section.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if _bad_uuid(curriculum_id) or not _owned(org_id, curriculum_id):
        return jsonify({'success': False, 'error': 'Curriculum not found'}), 404
    search = (request.args.get('search') or '').strip()
    limit = min(int(request.args.get('limit', 40) or 40), 100)

    already = {r['quest_id'] for r in (
        _admin().table('sis_curriculum_quests').select('quest_id')
        .eq('curriculum_id', curriculum_id).execute()).data or []}

    def _q(base):
        if search:
            base = base.ilike('title', f'%{search}%')
        return base.limit(limit).execute().data or []

    org_quests = _q(_admin().table('quests')
                    .select('id, title, quest_type, organization_id')
                    .eq('organization_id', org_id).eq('is_active', True))
    lib_quests = _q(_admin().table('quests')
                    .select('id, title, quest_type, organization_id')
                    .is_('organization_id', 'null').eq('is_active', True).eq('is_public', True))

    out, seen = [], set()
    for source, rows in (('organization', org_quests), ('library', lib_quests)):
        for q in rows:
            if q['id'] in seen or q['id'] in already:
                continue
            seen.add(q['id'])
            out.append({'quest_id': q['id'], 'title': q.get('title'), 'source': source})
    return jsonify({'success': True, 'quests': out})


@bp.route('/curriculum/<curriculum_id>/assignable-courses', methods=['GET'])
@require_role(*ADMIN_ROLES)
def curriculum_assignable_courses(user_id, curriculum_id):
    """Courses that could be added: the school's own, plus public Optio ones."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if _bad_uuid(curriculum_id) or not _owned(org_id, curriculum_id):
        return jsonify({'success': False, 'error': 'Curriculum not found'}), 404
    search = (request.args.get('search') or '').strip()
    limit = min(int(request.args.get('limit', 40) or 40), 100)

    already = {r['course_id'] for r in (
        _admin().table('sis_curriculum_courses').select('course_id')
        .eq('curriculum_id', curriculum_id).execute()).data or []}

    def _q(base):
        if search:
            base = base.ilike('title', f'%{search}%')
        return base.limit(limit).execute().data or []

    org_courses = _q(_admin().table('courses')
                     .select('id, title, status, organization_id')
                     .eq('organization_id', org_id))
    # Archived library courses are noise in a picker — an org's own drafts are
    # not, because that is how a school builds one before publishing it.
    lib_courses = _q(_admin().table('courses')
                     .select('id, title, status, organization_id')
                     .eq('visibility', 'public').eq('status', 'published'))

    out, seen = [], set()
    for source, rows in (('organization', org_courses), ('library', lib_courses)):
        for c in rows:
            if c['id'] in seen or c['id'] in already:
                continue
            seen.add(c['id'])
            out.append({'course_id': c['id'], 'title': c.get('title'),
                        'status': c.get('status'), 'source': source})
    return jsonify({'success': True, 'courses': out})


def _replace_links(table, curriculum_id, id_field, ids, user_id):
    """Replace a curriculum's link set wholesale, preserving the given order.

    Sent as the whole list rather than add/remove calls for the same reason the
    class attachment is: the picker in front of the admin is the statement of
    what the set should be, and two admins editing at once can't interleave into
    a half-applied state.
    """
    admin = _admin()
    admin.table(table).delete().eq('curriculum_id', curriculum_id).execute()
    if ids:
        admin.table(table).insert([
            {'curriculum_id': curriculum_id, id_field: v,
             'sequence_order': i, 'added_by': user_id}
            for i, v in enumerate(ids)
        ]).execute()


@bp.route('/curriculum/<curriculum_id>/quests', methods=['PUT'])
@require_role(*ADMIN_ROLES)
def set_curriculum_quests(user_id, curriculum_id):
    """Set the curriculum's reusable quest set, in order.

    Classes COPY from this set (POST /classes/<id>/quests/from-curriculum), so
    editing it never changes what a section already has in front of enrolled
    students — it changes what the next section starts from.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if _bad_uuid(curriculum_id) or not _owned(org_id, curriculum_id):
        return jsonify({'success': False, 'error': 'Curriculum not found'}), 404
    requested = [q for q in ((request.get_json(silent=True) or {}).get('quest_ids') or []) if q]
    if any(_bad_uuid(q) for q in requested):
        return jsonify({'success': False, 'error': 'Invalid quest id'}), 400

    # Only this org's quests, or the shared Optio library (organization_id NULL).
    # Never another school's — a curriculum that points at one would 404 forever
    # for everybody but them.
    valid_order = []
    if requested:
        rows = (_admin().table('quests').select('id, organization_id')
                .in_('id', requested).execute()).data or []
        allowed = {r['id'] for r in rows
                   if r.get('organization_id') in (None, org_id)}
        seen = set()
        for q in requested:
            if q in allowed and q not in seen:
                seen.add(q)
                valid_order.append(q)

    _replace_links('sis_curriculum_quests', curriculum_id, 'quest_id', valid_order, user_id)
    return jsonify({'success': True, 'attached': len(valid_order),
                    'rejected': len(requested) - len(valid_order)})


@bp.route('/curriculum/<curriculum_id>/quests/create', methods=['POST'])
@require_role(*ADMIN_ROLES)
def create_curriculum_quest(user_id, curriculum_id):
    """Author a new school quest and append it to this curriculum's set.

    Same form and same result as the teacher's "create a quest" on a class
    (routes/sis/class_quests.py) — shared via services/sis_quest_authoring — the
    difference being where it lands. iCreate, 2026-08-12: the library could only
    attach a quest somebody had already built somewhere else, which is a dead end
    for an admin setting up next year before any section exists.

    Appended, not inserted: the quest set is ordered, and a new quest joining at
    the end is the only position that can't reorder what teachers already see.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if _bad_uuid(curriculum_id) or not _owned(org_id, curriculum_id):
        return jsonify({'success': False, 'error': 'Curriculum not found'}), 404

    data = request.get_json(silent=True) or {}
    try:
        created = create_org_quest(
            _admin(),
            org_id=org_id,
            user_id=user_id,
            title=data.get('title'),
            description=data.get('description'),
            raw_tasks=data.get('tasks'),
        )
    except QuestAuthoringError as e:
        return jsonify({'success': False, 'error': e.message}), e.status

    existing = (_admin().table('sis_curriculum_quests').select('sequence_order')
                .eq('curriculum_id', curriculum_id)
                .order('sequence_order', desc=True).limit(1).execute()).data
    next_order = ((existing[0]['sequence_order'] or 0) + 1) if existing else 0
    _admin().table('sis_curriculum_quests').insert({
        'curriculum_id': curriculum_id,
        'quest_id': created['quest_id'],
        'sequence_order': next_order,
        'added_by': user_id,
    }).execute()

    return jsonify({'success': True, 'quest_id': created['quest_id'],
                    'task_count': created['task_count']})


# ── One quest, as the curriculum carries it ───────────────────────────────────
# iCreate, 2026-08-31: "when admin creates a quest in /curriculum they need to
# be able to view the quests inside the curriculum and also have full CRUD."
# The library row was title-only: to see or fix a quest's tasks the admin had to
# find a class it was assigned to and edit it there. These mirror the class
# routes (routes/sis/class_quests.py) — admin-tier, scoped by the curriculum
# link instead of a class assignment. The same safety line holds: a shared
# Optio-library quest is readable here but never editable, because an edit
# would change it for every school using it.


def _serialize_template_task(t):
    return {
        'id': t['id'],
        'title': t.get('title'),
        'description': t.get('description') or '',
        'pillar': t.get('pillar'),
        'xp_value': t.get('xp_value'),
        'is_required': bool(t.get('is_required')),
        'order_index': t.get('order_index', 0),
    }


def _curriculum_quest(user_id, curriculum_id, quest_id):
    """(org_id, quest, err). The caller's org must own the curriculum and the
    quest must be linked to it."""
    org_id, err = _org_or_error(user_id)
    if err:
        return None, None, err
    if _bad_uuid(curriculum_id, quest_id) or not _owned(org_id, curriculum_id):
        return None, None, (jsonify({'success': False, 'error': 'Curriculum not found'}), 404)
    link = (_admin().table('sis_curriculum_quests').select('quest_id')
            .eq('curriculum_id', curriculum_id).eq('quest_id', quest_id)
            .limit(1).execute()).data
    if not link:
        return None, None, (jsonify({'success': False,
                                     'error': 'That quest is not on this curriculum.'}), 404)
    rows = (_admin().table('quests')
            .select('id, title, description, quest_type, organization_id, is_active')
            .eq('id', quest_id).limit(1).execute()).data
    if not rows:
        return None, None, (jsonify({'success': False, 'error': 'Quest not found'}), 404)
    return org_id, rows[0], None


def _library_quest_403():
    return (jsonify({
        'success': False,
        'error': "This quest comes from the Optio library and is shared with "
                 "other schools, so it can't be edited here.",
    }), 403)


def _resync_template(quest_id):
    """Template edits must reach students already enrolled — their task lists
    are copies taken at enrollment (same rule as the class routes)."""
    try:
        from utils.template_tasks import resync_enrollments_to_template
        resync_enrollments_to_template(_admin(), quest_id)
    except Exception as e:  # noqa: BLE001 — the edit itself succeeded
        logger.warning(f'Saved but enrollment resync failed for {quest_id}: {e}')


@bp.route('/curriculum/<curriculum_id>/quests/<quest_id>', methods=['PATCH'])
@require_role(*ADMIN_ROLES)
def update_curriculum_quest(user_id, curriculum_id, quest_id):
    """Rename a quest / rewrite its description, for the school's own quests."""
    org_id, quest, err = _curriculum_quest(user_id, curriculum_id, quest_id)
    if err:
        return err
    if quest.get('organization_id') != org_id:
        return _library_quest_403()

    data = request.get_json(silent=True) or {}
    updates = {}
    if 'title' in data:
        title = (data.get('title') or '').strip()[:_MAX_TITLE]
        if not title:
            return jsonify({'success': False, 'error': 'A title is required'}), 400
        updates['title'] = title
    if 'description' in data:
        updates['description'] = (data.get('description') or '').strip() or None
    if not updates:
        return jsonify({'success': False, 'error': 'Nothing to update'}), 400
    row = (_admin().table('quests').update(updates)
           .eq('id', quest_id).execute()).data
    q = row[0] if row else {}
    return jsonify({'success': True, 'quest': {
        'id': quest_id, 'title': q.get('title'), 'description': q.get('description') or '',
    }})


@bp.route('/curriculum/<curriculum_id>/quests/<quest_id>/delete', methods=['DELETE'])
@require_role(*ADMIN_ROLES)
def delete_curriculum_quest(user_id, curriculum_id, quest_id):
    """Delete one of the school's own quests outright, from the library page.

    Same guardrails as the class-level delete: never an Optio-library quest,
    and never a quest any student has started — that would erase their
    completed tasks and XP. Refusing names the count so the admin can detach
    it from the curriculum instead.
    """
    org_id, quest, err = _curriculum_quest(user_id, curriculum_id, quest_id)
    if err:
        return err
    if quest.get('organization_id') != org_id:
        return (jsonify({
            'success': False,
            'error': ('This quest comes from the Optio library and is shared with other '
                      'schools, so it can only be removed from your curriculum, not deleted.'),
        }), 403)

    started = (_admin().table('user_quests').select('id')
               .eq('quest_id', quest_id).limit(50).execute()).data or []
    if started:
        return jsonify({
            'success': False,
            'error': (f'{len(started)} student{"s have" if len(started) != 1 else " has"} '
                      'already started this quest, so deleting it would erase their work. '
                      'Remove it from the curriculum instead.'),
            'started_count': len(started),
        }), 409

    # Links first, quest row last, so a failure part-way leaves it reachable.
    _admin().table('class_quests').delete().eq('quest_id', quest_id).execute()
    _admin().table('sis_curriculum_quests').delete().eq('quest_id', quest_id).execute()
    _admin().table('quest_template_tasks').delete().eq('quest_id', quest_id).execute()
    _admin().table('quests').delete().eq('id', quest_id).execute()
    return jsonify({'success': True, 'title': quest.get('title')})


@bp.route('/curriculum/<curriculum_id>/quests/<quest_id>/tasks', methods=['GET'])
@require_role(*ADMIN_ROLES)
def curriculum_quest_tasks(user_id, curriculum_id, quest_id):
    """The quest's preset tasks (and its description, for the detail view).
    Same response shape as the class route so the two screens share a task
    manager; `editable` is false for Optio-library quests."""
    org_id, quest, err = _curriculum_quest(user_id, curriculum_id, quest_id)
    if err:
        return err
    tasks = (_admin().table('quest_template_tasks').select('*')
             .eq('quest_id', quest_id).order('order_index').execute()).data or []
    return jsonify({
        'success': True,
        'editable': quest.get('organization_id') == org_id,
        'quest': {'id': quest['id'], 'title': quest.get('title'),
                  'description': quest.get('description') or ''},
        'tasks': [_serialize_template_task(t) for t in tasks],
    })


@bp.route('/curriculum/<curriculum_id>/quests/<quest_id>/tasks', methods=['POST'])
@require_role(*ADMIN_ROLES)
def add_curriculum_quest_task(user_id, curriculum_id, quest_id):
    org_id, quest, err = _curriculum_quest(user_id, curriculum_id, quest_id)
    if err:
        return err
    if quest.get('organization_id') != org_id:
        return _library_quest_403()
    data = request.get_json(silent=True) or {}
    last = (_admin().table('quest_template_tasks').select('order_index')
            .eq('quest_id', quest_id).order('order_index', desc=True).limit(1).execute()).data
    next_order = ((last[0]['order_index'] or 0) + 1) if last else 0
    task = _clean_task(data, next_order)
    if not task:
        return jsonify({'success': False, 'error': 'A task title is required.'}), 400
    task['quest_id'] = quest_id
    row = _admin().table('quest_template_tasks').insert(task).execute().data
    if not row:
        return jsonify({'success': False, 'error': 'Could not add the task.'}), 500
    _resync_template(quest_id)
    return jsonify({'success': True, 'task': _serialize_template_task(row[0])})


@bp.route('/curriculum/<curriculum_id>/quests/<quest_id>/tasks/<task_id>', methods=['PATCH'])
@require_role(*ADMIN_ROLES)
def update_curriculum_quest_task(user_id, curriculum_id, quest_id, task_id):
    org_id, quest, err = _curriculum_quest(user_id, curriculum_id, quest_id)
    if err:
        return err
    if quest.get('organization_id') != org_id:
        return _library_quest_403()
    if _bad_uuid(task_id):
        return jsonify({'success': False, 'error': 'Invalid task id'}), 400

    data = request.get_json(silent=True) or {}
    updates = {}
    if 'title' in data:
        title = (data.get('title') or '').strip()
        if not title:
            return jsonify({'success': False, 'error': 'A task title is required.'}), 400
        updates['title'] = title
    if 'description' in data:
        updates['description'] = (data.get('description') or '').strip()
    if 'pillar' in data:
        updates['pillar'] = _norm_pillar(data.get('pillar'))
    if 'xp_value' in data:
        try:
            xp = int(data.get('xp_value'))
        except (TypeError, ValueError):
            return jsonify({'success': False, 'error': 'XP must be a number.'}), 400
        updates['xp_value'] = max(0, xp)
    if 'is_required' in data:
        updates['is_required'] = bool(data.get('is_required'))
    if not updates:
        return jsonify({'success': False, 'error': 'Nothing to update.'}), 400

    row = (_admin().table('quest_template_tasks').update(updates)
           .eq('id', task_id).eq('quest_id', quest_id).execute()).data
    if not row:
        return jsonify({'success': False, 'error': 'Task not found.'}), 404
    _resync_template(quest_id)
    return jsonify({'success': True, 'task': _serialize_template_task(row[0])})


@bp.route('/curriculum/<curriculum_id>/quests/<quest_id>/tasks/<task_id>', methods=['DELETE'])
@require_role(*ADMIN_ROLES)
def delete_curriculum_quest_task(user_id, curriculum_id, quest_id, task_id):
    org_id, quest, err = _curriculum_quest(user_id, curriculum_id, quest_id)
    if err:
        return err
    if quest.get('organization_id') != org_id:
        return _library_quest_403()
    if _bad_uuid(task_id):
        return jsonify({'success': False, 'error': 'Invalid task id'}), 400
    _admin().table('quest_template_tasks').delete() \
        .eq('id', task_id).eq('quest_id', quest_id).execute()
    _resync_template(quest_id)
    return jsonify({'success': True})


@bp.route('/curriculum/<curriculum_id>/courses', methods=['PUT'])
@require_role(*ADMIN_ROLES)
def set_curriculum_courses(user_id, curriculum_id):
    """Set the courses attached to this curriculum, in order.

    A live link: every class attached to the curriculum shows these, so removing
    a wrong one here removes it everywhere rather than leaving copies behind.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if _bad_uuid(curriculum_id) or not _owned(org_id, curriculum_id):
        return jsonify({'success': False, 'error': 'Curriculum not found'}), 404
    requested = [c for c in ((request.get_json(silent=True) or {}).get('course_ids') or []) if c]
    if any(_bad_uuid(c) for c in requested):
        return jsonify({'success': False, 'error': 'Invalid course id'}), 400

    valid_order = []
    if requested:
        rows = (_admin().table('courses').select('id, organization_id, visibility')
                .in_('id', requested).execute()).data or []
        # The org's own courses, plus public ones from the shared Optio library —
        # the same two sources the Classes page already offers.
        allowed = {r['id'] for r in rows
                   if r.get('organization_id') == org_id or r.get('visibility') == 'public'}
        seen = set()
        for c in requested:
            if c in allowed and c not in seen:
                seen.add(c)
                valid_order.append(c)

    _replace_links('sis_curriculum_courses', curriculum_id, 'course_id', valid_order, user_id)
    return jsonify({'success': True, 'attached': len(valid_order),
                    'rejected': len(requested) - len(valid_order)})


# ── Teacher: the curriculum for a class they teach ────────────────────────────
#
# Teachers READ the curriculum on their class (what the school gives them to
# teach from); adding, editing, and removing entries is admin-only, from here or
# the library page. What teachers add to a class is quests, which auto-attach to
# the class's curriculum (routes/sis/class_quests.py). iCreate, 2026-08-31.


def _class_access(user_id, class_id):
    """Resolve a caller's relationship to a class.

    Returns (class_row, is_teacher, is_admin). class_row is None when the class
    doesn't exist. is_teacher covers the primary instructor, named assistants,
    and active co-teachers (class_advisors); is_admin covers org admins /
    superadmins whose resolved org matches the class's org.

    Assistants count for the same reason they do in class_quests: the class is
    already in their portal (sis_service.advisor_class_ids lists it, and the
    roster loads), so leaving them out here gave them a class page whose
    Curriculum tab 403'd on open — Sentry OPTIO-WEB-3, an assistant reloading
    the tab four times.
    """
    admin = _admin()
    rows = (admin.table('org_classes')
            .select('id, organization_id, primary_instructor_id, assistant_instructor_ids')
            .eq('id', class_id).limit(1).execute()).data or []
    if not rows:
        return None, False, False
    class_row = rows[0]
    org_id = class_row['organization_id']

    is_admin = (sis_service.caller_is_admin(user_id)
                and sis_service.resolve_org_id(user_id, org_id) == org_id)
    is_teacher = (class_row.get('primary_instructor_id') == user_id
                  or user_id in (class_row.get('assistant_instructor_ids') or []))
    if not is_teacher and not is_admin:
        co_teacher = (admin.table('class_advisors').select('id')
                      .eq('class_id', class_id).eq('advisor_id', user_id)
                      .eq('is_active', True).limit(1).execute()).data
        is_teacher = bool(co_teacher)
    return class_row, is_teacher, is_admin


def _attached_to_class(curriculum_id, class_id):
    return bool((_admin().table('sis_curriculum_classes').select('curriculum_id')
                 .eq('curriculum_id', curriculum_id).eq('class_id', class_id)
                 .limit(1).execute()).data)


@bp.route('/classes/<class_id>/curriculum', methods=['GET'])
@require_auth
def class_curriculum(user_id, class_id):
    """Curriculum attached to one class. Staff only — a student enrolled in the
    class must not see it (that's what the class Curriculum/materials tab is for).
    """
    if _bad_uuid(class_id):
        return jsonify({'success': False, 'error': 'Invalid class id'}), 400
    class_row, is_teacher, is_admin = _class_access(user_id, class_id)
    if class_row is None:
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    if not (is_teacher or is_admin):
        return jsonify({'success': False, 'error': 'Not available'}), 403

    org_id = class_row['organization_id']
    # can_manage gates the staff-side conveniences (share-to-class, course edit
    # links); adding/editing/removing curriculum itself is admin-only — the
    # client reads is_admin for that (enforced server-side below regardless).
    links = (_admin().table('sis_curriculum_classes').select('curriculum_id')
             .eq('class_id', class_id).execute()).data or []
    ids = [l['curriculum_id'] for l in links]
    entries = []
    if ids:
        entries = (_admin().table('sis_curriculum')
                   .select('id, title, subject, description, drive_url, notes, is_active, created_by')
                   .in_('id', ids).eq('organization_id', org_id)
                   .eq('is_active', True).order('title').execute()).data or []
    # Each entry carries the courses and quests attached to it in the library.
    # This is the point of the container: a teacher opening their class finds
    # the school's material already there instead of being expected to build it
    # (iCreate, 2026-08-06). Both are live links, so what shows here is always
    # what the library currently says — including quests the teacher just added
    # to the class, which auto-attach to its curriculum (2026-08-31).
    _attach_courses(entries)
    _attach_quests(entries)
    return jsonify({
        'success': True,
        'curriculum': entries,
        'can_manage': bool(is_teacher or is_admin),
        'is_admin': bool(is_admin),
    })


def _attach_quests(entries):
    """Hang each curriculum entry's saved quest set off it, in order."""
    ids = [e['id'] for e in entries]
    for e in entries:
        e['quests'] = []
    if not ids:
        return
    links = (_admin().table('sis_curriculum_quests')
             .select('curriculum_id, quest_id, sequence_order')
             .in_('curriculum_id', ids).order('sequence_order').execute()).data or []
    quests = _quest_titles([l['quest_id'] for l in links])
    by_id = {e['id']: e for e in entries}
    for l in links:
        q = quests.get(l['quest_id'])
        if not q:  # link outlived the quest
            continue
        by_id[l['curriculum_id']]['quests'].append({
            'id': q['id'], 'title': q.get('title'),
        })


def _attach_courses(entries):
    """Hang each curriculum entry's linked courses off it, in order."""
    ids = [e['id'] for e in entries]
    for e in entries:
        e['courses'] = []
    if not ids:
        return
    links = (_admin().table('sis_curriculum_courses')
             .select('curriculum_id, course_id, sequence_order')
             .in_('curriculum_id', ids).order('sequence_order').execute()).data or []
    courses = _course_rows([l['course_id'] for l in links])
    by_id = {e['id']: e for e in entries}
    for l in links:
        course = courses.get(l['course_id'])
        if not course:  # link outlived the course
            continue
        by_id[l['curriculum_id']]['courses'].append({
            'id': course['id'], 'title': course.get('title'),
            'status': course.get('status'),
        })


@bp.route('/classes/<class_id>/curriculum', methods=['POST'])
@require_auth
def create_class_curriculum(user_id, class_id):
    """Admin creates a curriculum entry and attaches it to this class in one
    step. Same fields as the admin library form, minus the multi-class
    selector — the class is implied.

    Admin-only: teachers add QUESTS to the class (class_quests), which attach
    to the class's curriculum via to-curriculum; the curriculum itself is the
    school's to define (iCreate, 2026-08-31).
    """
    if _bad_uuid(class_id):
        return jsonify({'success': False, 'error': 'Invalid class id'}), 400
    class_row, is_teacher, is_admin = _class_access(user_id, class_id)
    if class_row is None:
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    if not is_admin:
        return jsonify({
            'success': False,
            'error': 'Only an administrator can add curriculum. You can add quests to the class instead.',
        }), 403

    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()[:_MAX_TITLE]
    if not title:
        return jsonify({'success': False, 'error': 'A title is required'}), 400
    if data.get('drive_url') and not _normalize_url(data.get('drive_url')):
        return jsonify({'success': False, 'error': 'The link must be a web address (http or https)'}), 400

    org_id = class_row['organization_id']
    row = (_admin().table('sis_curriculum').insert({
        'organization_id': org_id,
        'title': title,
        'subject': (data.get('subject') or '').strip()[:_MAX_TITLE] or None,
        'description': (data.get('description') or '').strip() or None,
        'drive_url': _normalize_url(data.get('drive_url')),
        'notes': (data.get('notes') or '').strip() or None,
        'created_by': user_id,
    }).execute()).data
    entry = row[0] if row else None
    if entry:
        _admin().table('sis_curriculum_classes').insert(
            {'curriculum_id': entry['id'], 'class_id': class_id}
        ).execute()
    return jsonify({'success': True, 'curriculum': entry}), 201


@bp.route('/classes/<class_id>/curriculum/<curriculum_id>', methods=['PATCH'])
@require_auth
def update_class_curriculum(user_id, class_id, curriculum_id):
    """Edit a curriculum entry from the class tab. Admin-only — curriculum is
    the school's to define; teachers see it read-only (iCreate, 2026-08-31).
    """
    if _bad_uuid(class_id, curriculum_id):
        return jsonify({'success': False, 'error': 'Invalid id'}), 400
    class_row, is_teacher, is_admin = _class_access(user_id, class_id)
    if class_row is None:
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    if not is_admin:
        return jsonify({'success': False, 'error': 'Only an administrator can edit curriculum.'}), 403

    org_id = class_row['organization_id']
    entry = _owned(org_id, curriculum_id)
    if not entry or not _attached_to_class(curriculum_id, class_id):
        return jsonify({'success': False, 'error': 'Curriculum not found'}), 404

    data = request.get_json(silent=True) or {}
    fields = {}
    if 'title' in data:
        title = (data.get('title') or '').strip()[:_MAX_TITLE]
        if not title:
            return jsonify({'success': False, 'error': 'A title is required'}), 400
        fields['title'] = title
    for key in ('subject', 'description', 'notes'):
        if key in data:
            value = (data.get(key) or '').strip()
            fields[key] = value[:_MAX_TITLE] if key == 'subject' else (value or None)
    if 'drive_url' in data:
        raw = (data.get('drive_url') or '').strip()
        if raw and not _normalize_url(raw):
            return jsonify({'success': False, 'error': 'The link must be a web address (http or https)'}), 400
        fields['drive_url'] = _normalize_url(raw)
    if not fields:
        return jsonify({'success': False, 'error': 'Nothing to update'}), 400
    fields['updated_at'] = datetime.now(timezone.utc).isoformat()
    row = (_admin().table('sis_curriculum').update(fields)
           .eq('id', curriculum_id).execute()).data
    return jsonify({'success': True, 'curriculum': row[0] if row else None})


@bp.route('/classes/<class_id>/curriculum/<curriculum_id>', methods=['DELETE'])
@require_auth
def remove_class_curriculum(user_id, class_id, curriculum_id):
    """Detach a curriculum entry from this class. Admin-only, like create and
    edit. Detaching only — the entry stays in the library, where admins delete
    outright.
    """
    if _bad_uuid(class_id, curriculum_id):
        return jsonify({'success': False, 'error': 'Invalid id'}), 400
    class_row, is_teacher, is_admin = _class_access(user_id, class_id)
    if class_row is None:
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    if not is_admin:
        return jsonify({'success': False, 'error': 'Only an administrator can remove curriculum.'}), 403

    org_id = class_row['organization_id']
    entry = _owned(org_id, curriculum_id)
    if not entry or not _attached_to_class(curriculum_id, class_id):
        return jsonify({'success': False, 'error': 'Curriculum not found'}), 404

    _admin().table('sis_curriculum_classes').delete().eq(
        'curriculum_id', curriculum_id).eq('class_id', class_id).execute()
    return jsonify({'success': True})
