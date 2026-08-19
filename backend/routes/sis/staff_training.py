"""
SIS school quests — the quests a school sets for its own teachers and families.

iCreate wanted teacher training as quests rather than a separate video system:
an onboarding walkthrough, plus optional themed courses ("Classroom
Management", "Whole Brain Learning") that uplevel teaching. Rather than build a
parallel content system, this marks existing quests as school-set and reads
completion back from the ordinary quest tables — so the content is authored in
the normal curriculum editor, videos and all.

Two audiences, one catalog (`audience`, added 2026-08-06):
  staff   the original meaning — training for teachers.
  family  quests for GUARDIANS, on their own accounts. iCreate, 2026-08-06:
          "back to school night with families will be a quest." A parent
          completes it themselves; it is not their child's work.

Anyone completing one is a learner like any other: they enrol in the quest and
finish its tasks in the web platform. This module only answers "which quests has
the school set, for whom, and how far has each person got".

NEW, additive (/api/sis/training). Admin manages the catalog; teachers read their
own progress here, and guardians read theirs through /api/sis/parent/quests.
"""

import uuid
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify

from middleware.rate_limiter import rate_limit
from utils.auth.decorators import require_role
from utils.logger import get_logger
from utils.validation import validate_uuid
from services import sis_service
from services import sis_training_service
from database import get_supabase_admin_client
from utils.sis_roles import STAFF_ROLES, ADMIN_ROLES, clean_visible_roles

logger = get_logger(__name__)

bp = Blueprint('sis_staff_training', __name__, url_prefix='/api/sis')


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


# Who a catalog row can be set for. Listed in the order a row's PRIMARY group is
# picked when it targets several — see _primary_audience.
AUDIENCES = ('staff', 'family', 'student')

# Quest-authoring limits and pillar handling, matching routes/sis/class_quests.py
# — the same rules about what a quest IS, reached from the other screen that
# builds one.
_MAX_TITLE_LEN = 300
_MAX_TASKS = 40
_PILLAR_ALIASES = {
    'art': 'art', 'creativity': 'art', 'arts_creativity': 'art',
    'stem': 'stem', 'critical_thinking': 'stem',
    'communication': 'communication',
    'wellness': 'wellness', 'practical_skills': 'wellness',
    'civics': 'civics', 'cultural_literacy': 'civics',
}
_DEFAULT_PILLAR = 'art'
_DEFAULT_XP = 100
# The XP floor since the scale was halved (2026-06-15).
_MIN_XP = 25


# What our own upload endpoint returns. The image URL arrives from the client,
# so it is pinned to that bucket rather than trusted — otherwise an admin could
# point a school's quest header at any URL on the internet, which then renders
# inside the app and calls out from every learner's browser.
_HEADER_IMAGE_PATH = '/storage/v1/object/public/quest-headers/'


def _clean_image_url(raw):
    """(url, error). Empty means 'no image', which falls back to the stock search."""
    url = (raw or '').strip()
    if not url:
        return None, None
    if _HEADER_IMAGE_PATH not in url:
        return None, 'That image was not uploaded here. Upload the file instead of linking to it.'
    return url, None


def _uploaded_image(url):
    """The url only if it is one of ours, otherwise ''. See get_training_quest."""
    return url if (url and _HEADER_IMAGE_PATH in url) else ''


def _org_logo(org_id):
    """The school's logo, usually a base64 data URI (that is how SisOrgSettings
    stores an upload). Renderable as-is; nothing to sign."""
    try:
        rows = (_admin().table('organizations').select('branding_config')
                .eq('id', org_id).limit(1).execute()).data
        return ((rows[0].get('branding_config') or {}).get('logo_url') or None) if rows else None
    except Exception as e:  # noqa: BLE001 — artwork is never worth failing a create
        logger.warning(f'Could not read org logo for {org_id}: {e}')
        return None


# Source material is capped where the drafter caps it, so what is stored is what
# the model was actually shown (routes/sis/quest_drafts._MAX_CONTEXT_CHARS).
_MAX_SOURCE_CHARS = 20000


def _clean_xp_threshold(raw):
    """The XP somebody must earn before the quest counts as finished.

    Stored on the quest itself (`quests.xp_threshold`), which the ordinary
    completion route already enforces — POST /api/quests/<id>/end refuses with
    XP_THRESHOLD_NOT_MET below it (routes/quest/completion.py). So training
    inherits the same gate every other quest uses rather than inventing one.

    Returns (value, error). None/0/'' means no requirement, which is how every
    quest behaved before an admin set one.
    """
    if raw is None or raw == '':
        return None, None
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None, 'XP required must be a number.'
    if value < 0:
        return None, 'XP required cannot be negative.'
    return (value or None), None


def _clean_task(raw, order_index):
    """One preset task, or None when it has no title (an untouched blank row)."""
    if not isinstance(raw, dict):
        return None
    title = (raw.get('title') or '').strip()
    if not title:
        return None
    try:
        xp = int(raw.get('xp_value') or _DEFAULT_XP)
    except (TypeError, ValueError):
        xp = _DEFAULT_XP
    now = datetime.now(timezone.utc).isoformat()
    return {
        'title': title[:_MAX_TITLE_LEN],
        'description': (raw.get('description') or '').strip(),
        'pillar': _PILLAR_ALIASES.get((raw.get('pillar') or '').strip().lower(), _DEFAULT_PILLAR),
        'xp_value': max(_MIN_XP, xp),
        # Mirrors quest_ai_service._normalize: an absent flag means the caller
        # (usually a generated draft) did not say, and an unstated requirement
        # is not one. The staff form always sends the checkbox either way.
        'is_required': bool(raw.get('is_required', False)),
        'order_index': order_index,
        'ai_generated': False,
        'created_at': now,
        'updated_at': now,
    }


def _audience(value):
    """Normalise an audience, defaulting to the original 'staff' meaning."""
    v = (str(value or '').strip().lower())
    return v if v in AUDIENCES else 'staff'


def _audiences(value, fallback=None):
    """Every group a row is set for, in AUDIENCES order, never empty.

    iCreate, 2026-08-17: "assign to 12+ students and all parents". One quest,
    two groups — so who a row is for is a set, not a value. `fallback` is the
    row's old single `audience`, which is what a catalog nobody has edited since
    still carries.
    """
    if isinstance(value, str):
        value = [value]
    if isinstance(value, (list, tuple)):
        wanted = {str(v).strip().lower() for v in value if v}
        picked = [a for a in AUDIENCES if a in wanted]
        if picked:
            return picked
    return [_audience(fallback)]


def _primary_audience(audiences):
    """The one value the `audience` column keeps holding.

    It carries the one-row-per-quest unique index, and the guardian family
    portal still reads on it — so a row that includes parents must resolve to
    'family' rather than to whatever happens to sort first.
    """
    return audiences[0]


def _row_audiences(row):
    """A catalog row's groups, tolerating a row written before the column."""
    return _audiences(row.get('audiences'), row.get('audience'))


def _clean_age(raw, label):
    """(age, error) for one end of the student age window."""
    if raw is None or raw == '':
        return None, None
    try:
        age = int(raw)
    except (TypeError, ValueError):
        return None, f'{label} must be a number.'
    if age < 0 or age > 120:
        return None, f'{label} must be between 0 and 120.'
    return age, None


def _clean_age_window(data):
    """(min, max, error). An inverted window assigns to nobody, which looks
    exactly like a broken assign button, so it is refused here."""
    lo, err = _clean_age(data.get('student_min_age'), 'The youngest age')
    if err:
        return None, None, err
    hi, err = _clean_age(data.get('student_max_age'), 'The oldest age')
    if err:
        return None, None, err
    if lo is not None and hi is not None and lo > hi:
        return None, None, 'The youngest age cannot be above the oldest age.'
    return lo, hi, None


def _catalog(org_id, audience='staff', include_drafts=False):
    """The org's quests for one audience, in order, with quest titles.

    include_drafts is for admins only. A draft is an ordinary quest with
    is_active=False — built, reviewable, previewable, but not on anybody's
    account and invisible to the people it is eventually for.
    """
    # Filtered on `audiences` rather than the primary `audience` column: a quest
    # set for parents AND students belongs on both tabs, and reading the single
    # column would drop it from one of them.
    rows = (_admin().table('sis_staff_training')
            .select('id, quest_id, category, is_required, sequence_order, audience, '
                    'audiences, student_min_age, student_max_age, '
                    'visible_to_roles, auto_assign, '
                    'quests(id, title, description, is_active, xp_threshold, organization_id)')
            .eq('organization_id', org_id)
            .contains('audiences', [_audience(audience)])
            .order('sequence_order').execute()).data or []
    out = []
    for r in rows:
        q = r.get('quests') or {}
        # A quest deleted out from under the catalog shouldn't show up as a
        # broken training item. An inactive one is either a draft the admin is
        # still working on or a quest somebody retired — either way the people
        # it is for must not see it.
        if not q.get('is_active') and not include_drafts:
            continue
        out.append({
            'id': r['id'],
            'quest_id': r['quest_id'],
            'title': q.get('title') or 'Untitled',
            'description': q.get('description'),
            'category': r.get('category'),
            'is_required': bool(r.get('is_required')),
            'sequence_order': r.get('sequence_order') or 0,
            'audience': _audience(r.get('audience')),
            'audiences': _row_audiences(r),
            'student_min_age': r.get('student_min_age'),
            'student_max_age': r.get('student_max_age'),
            'visible_to_roles': r.get('visible_to_roles'),
            'auto_assign': bool(r.get('auto_assign')),
            'is_draft': not q.get('is_active'),
            'xp_threshold': q.get('xp_threshold') or 0,
            # A library quest belongs to everybody, so its finish line is not
            # this school's to move — the UI hides the field rather than
            # offering an edit the backend will refuse.
            'quest_is_ours': q.get('organization_id') == org_id,
        })
    return out


def _fetch_in_chunks(table, columns, key, values, chunk=100):
    """Every row matching `key IN values`, chunked for the URL and PAGED inside
    each chunk.

    Both halves matter. Chunking keeps the `in_()` filter out of URL-length
    trouble; paging is what keeps the answer true. A single chunk's response is
    still capped at 1000 rows and PostgREST does not say when it hit the cap —
    which is exactly how this report went wrong (Sentry OPTIO-BACKEND-5T,
    2026-08-18): one orientation quest on 152 accounts is 2,398
    user_quest_tasks rows, so a plain read returned the first 1000 and the
    training page quietly showed most of the school a task total that was
    short. See the Row Limits note in CLAUDE.md.
    """
    from utils.db_fetch import fetch_all_rows

    out = []
    for i in range(0, len(values), chunk):
        part = values[i:i + chunk]
        out.extend(fetch_all_rows(lambda p=part: (
            _admin().table(table).select(columns).in_(key, p)
        )))
    return out


def _progress_for(user_ids, quest_ids):
    """{(user_id, quest_id): {started, completed, done, total}} from the normal
    quest tables — the same records that drive a learner's own dashboard."""
    if not user_ids or not quest_ids:
        return {}
    # Scoped to these quests first, then filtered to the people asked about:
    # the row count grows with the size of the school, so every read here is
    # paged (_fetch_in_chunks).
    wanted = set(user_ids)
    user_quests = [uq for uq in _fetch_in_chunks(
        'user_quests', 'id, user_id, quest_id, completed_at, started_at',
        'quest_id', list(quest_ids)) if uq['user_id'] in wanted]
    uq_ids = [uq['id'] for uq in user_quests]
    tasks = []
    if uq_ids:
        # xp_value rides along because a training quest can carry an XP finish
        # line; there is no xp_awarded column, so earned XP is always summed
        # from the completed tasks' xp_value (see services/xp_goal_service.py).
        tasks = _fetch_in_chunks('user_quest_tasks', 'id, user_quest_id, xp_value',
                                 'user_quest_id', uq_ids)
    task_ids = [t['id'] for t in tasks]
    done_ids = {r['task_id'] for r in
                _fetch_in_chunks('quest_task_completions', 'id, task_id',
                                 'task_id', task_ids, chunk=200)}
    by_uq = {}
    for t in tasks:
        by_uq.setdefault(t['user_quest_id'], []).append(t)
    out = {}
    for uq in user_quests:
        own = by_uq.get(uq['id'], [])
        finished = [t for t in own if t['id'] in done_ids]
        out[(uq['user_id'], uq['quest_id'])] = {
            'started': True,
            'completed': bool(uq.get('completed_at')),
            'done': len(finished),
            'total': len(own),
            'earned_xp': sum(t.get('xp_value') or 0 for t in finished),
            'available_xp': sum(t.get('xp_value') or 0 for t in own),
        }
    return out


_NOT_STARTED = {'started': False, 'completed': False, 'done': 0, 'total': 0,
                'earned_xp': 0, 'available_xp': 0}


# ── Putting the quest on people's accounts ────────────────────────────────────
#
# Until 2026-08-17 the catalog only *listed* quests: everyone had to find the
# quest and pick it up themselves, and "required" was a label with nothing
# behind it. iCreate running orientation and teacher training as quests needs
# the quest to already be there. Two ways in, sharing one primitive:
#   assign     an admin presses the button, the current roster is enrolled.
#   auto_assign the catalog row keeps doing it, so whoever joins next week is
#              enrolled on their own next read instead of being missed.

def _audience_people(org_id, audience):
    """Everyone in one group, each tagged with the group they came from — a
    person can be in two (an iCreate admin is a parent as well), and which one
    they were reached as is what decides whether a row applies to them."""
    audience = _audience(audience)
    if audience == 'family':
        people = _guardians(org_id)
    elif audience == 'student':
        people = _org_students(org_id)
    else:
        people = sis_service.list_org_staff(org_id)
    for p in people:
        p['group'] = audience
    return people


# Whoever runs the school. Always assignable, whatever a row targets.
_ADMIN_ORG_ROLES = ('org_admin', 'campus_coordinator')


def _roles_of(user):
    """Every role a user holds: the org_roles array, org_role, and the platform
    role. A person can hold several — at iCreate the admins are parents too —
    and reading only one column is how a parent-who-is-also-an-admin went
    missing from their own school's family quests.
    """
    roles = set()
    if isinstance(user.get('org_roles'), list):
        roles.update(r for r in user['org_roles'] if r)
    for key in ('org_role', 'role'):
        if user.get(key):
            roles.add(user[key])
    return roles


def _item_applies_to(item, person, audience=None):
    """Whether one person, reached as one group, is in a row's audience.

    Students are narrowed by age, staff by role. Guardians carry no targeting.
    Mirrors _applies() in the progress report.

    An admin is always eligible for staff training. A course aimed at teachers
    still has to be doable by the person who set it — to try it before it goes
    out, and because at a small school the admin teaches too. Narrowing is about
    not burying a teacher in campus-operations training, not about locking
    admins out. It is deliberately NOT extended to the student age window: an
    admin is not a student, and a quest for 12-year-olds should not land on
    their account because they run the school.
    """
    group = person.get('group') or _audience(audience)
    if group == 'student':
        # Shared with the family-portal catch-up, which has to gate on exactly
        # the same window (services/sis_training_service.py).
        return sis_training_service.student_in_age_window(item, person)
    if group == 'family':
        return True
    targets = item.get('visible_to_roles')
    if not targets:
        return True
    roles = set(person.get('roles') or [])
    if roles & set(_ADMIN_ORG_ROLES):
        return True
    return bool(set(targets) & roles)


def _owned_item(user_id, training_id):
    """(row, error) for one catalog row this caller's org actually owns.

    The id comes from the browser, so ownership is re-checked before anything is
    read or written — otherwise one school could assign quests to another's
    families, or publish their drafts.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return None, err
    if _bad_uuid(training_id):
        return None, (jsonify({'success': False, 'error': 'Invalid id'}), 400)
    rows = (_admin().table('sis_staff_training')
            .select('id, organization_id, quest_id, audience, audiences, '
                    'student_min_age, student_max_age, visible_to_roles, '
                    'auto_assign, category, is_required, quests(is_active)')
            .eq('id', training_id).limit(1).execute()).data
    if not rows or rows[0].get('organization_id') != org_id:
        return None, (jsonify({'success': False, 'error': 'Not found'}), 404)
    return rows[0], None


def _eligible_people(org_id, item, audience=None):
    """Everyone a catalog row actually reaches, across every group it targets.

    `audience` is only a fallback for a row that predates the audiences column.
    Somebody who is in two groups — the iCreate admins are parents too — is
    listed once, under the first group that reached them, so the assign count is
    a count of people rather than of memberships.
    """
    seen, out = set(), []
    for group in _audiences(item.get('audiences'), audience or item.get('audience')):
        for p in _audience_people(org_id, group):
            if p['id'] in seen or not _item_applies_to(item, p):
                continue
            seen.add(p['id'])
            out.append(p)
    return out


def _assign_item(org_id, item, audience=None, people=None, only_user_ids=None):
    """Enroll the people this catalog row applies to. Idempotent — see
    utils.quest_assignment. Returns the counts.

    only_user_ids narrows it to a chosen few, and is INTERSECTED with the
    eligible set rather than trusted: the ids come from the browser, and an
    admin must not be able to enrol somebody from another school, a student, or
    a teacher the training was never aimed at by editing a request.
    """
    from utils.quest_assignment import assign_quest_to_users

    people = _eligible_people(org_id, item, audience) if people is None else people
    user_ids = [p['id'] for p in people]
    if only_user_ids is not None:
        chosen = set(only_user_ids)
        user_ids = [uid for uid in user_ids if uid in chosen]
    # admin client justified: enrolling OTHER people is a cross-user write, and
    # the route above is ADMIN_ROLES-gated (or the caller is enrolling themself).
    return assign_quest_to_users(_admin(), item['quest_id'], user_ids)


def catch_up_auto_assigned(user_id, catalog, audience):
    """Enroll one person into the auto-assign quests on their own list.

    Called from the audience's own read path — the staff training page and the
    family portal — so somebody who joined after the admin pressed the button
    still lands with the quest on their account. Best-effort: a failure here
    must never cost somebody their training page. Returns how many enrollments
    it created, so the caller knows whether to re-read progress.
    """
    from utils.quest_assignment import assign_quest_to_users

    # A draft is not on anybody's account yet — that is what makes it a draft.
    pending = [c for c in catalog
               if c.get('auto_assign') and not c.get('is_draft')
               and not (c.get('my_progress') or {}).get('started')]
    if not pending:
        return 0
    admin = _admin()
    created = 0
    for c in pending:
        try:
            created += assign_quest_to_users(admin, c['quest_id'], [user_id])['enrolled']
        except Exception as e:  # noqa: BLE001 — reading the list is the point
            logger.warning(f"Auto-assign catch-up failed for quest {c['quest_id']}: {e}")
    return created


# ── Catalog ───────────────────────────────────────────────────────────────────

@bp.route('/training', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_training(user_id):
    """The catalog for one audience, plus the caller's own progress through it.

    Defaults to 'staff' so a teacher opening their training page sees exactly
    what they saw before the family audience existed.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    audience = _audience(request.args.get('audience'))
    # Only an admin sees work in progress; a teacher's list is what the school
    # has actually set for them.
    catalog = _catalog(org_id, audience, include_drafts=sis_service.caller_is_admin(user_id))
    # Role-narrowed staff training only reaches the roles it targets — a
    # teacher's list does not carry the coordinator's campus-operations course.
    if audience == 'staff':
        catalog = sis_service.filter_role_visible(user_id, catalog)
    quest_ids = [c['quest_id'] for c in catalog]
    progress = _progress_for([user_id], quest_ids)
    for c in catalog:
        c['my_progress'] = progress.get((user_id, c['quest_id']), dict(_NOT_STARTED))
    # A teacher hired after the admin pressed "assign to everyone" gets the
    # auto-assign quests here, on their first look at the page.
    if catch_up_auto_assigned(user_id, catalog, audience):
        progress = _progress_for([user_id], quest_ids)
        for c in catalog:
            c['my_progress'] = progress.get((user_id, c['quest_id']), dict(_NOT_STARTED))
    return jsonify({'success': True, 'training': catalog, 'audience': audience})


@bp.route('/training/assignable-quests', methods=['GET'])
@require_role(*ADMIN_ROLES)
def assignable_training_quests(user_id):
    """Quests that could become training: the school's own, plus the public
    Optio library. Mirrors the class-quest picker, minus anything already on
    the catalog."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    admin = _admin()
    # Scoped to the audience being edited: a quest already set for teachers is
    # still a fair choice for families (a school-values quest everyone does).
    audience = _audience(request.args.get('audience'))
    already = {r['quest_id'] for r in (admin.table('sis_staff_training')
               .select('quest_id').eq('organization_id', org_id)
               .eq('audience', audience).execute()).data or []}
    search = (request.args.get('search') or '').strip()

    def _q(base):
        if search:
            base = base.ilike('title', f'%{search}%')
        return base.limit(100).execute().data or []

    org_quests = _q(admin.table('quests').select('id, title, organization_id')
                    .eq('organization_id', org_id).eq('is_active', True))
    lib_quests = _q(admin.table('quests').select('id, title, organization_id')
                    .is_('organization_id', 'null').eq('is_active', True).eq('is_public', True))

    out, seen = [], set()
    for source, rows in (('organization', org_quests), ('library', lib_quests)):
        for q in rows:
            if q['id'] in seen or q['id'] in already:
                continue
            seen.add(q['id'])
            out.append({'quest_id': q['id'], 'title': q.get('title'), 'source': source})
    return jsonify({'success': True, 'quests': out})


@bp.route('/training', methods=['POST'])
@require_role(*ADMIN_ROLES)
def add_training(user_id):
    """Mark one of the org's quests as staff training."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    quest_id = (data.get('quest_id') or '').strip()
    if _bad_uuid(quest_id):
        return jsonify({'success': False, 'error': 'Invalid quest id'}), 400
    quest = (_admin().table('quests').select('id, organization_id, is_public, is_active')
             .eq('id', quest_id).limit(1).execute()).data
    quest = quest[0] if quest else None
    # Same rule as class quests: the org's own quests, or the public library.
    if not quest or not (quest.get('organization_id') == org_id
                         or (quest.get('organization_id') is None and quest.get('is_public'))):
        return jsonify({'success': False, 'error': 'That quest is not available'}), 404

    audiences = _audiences(data.get('audiences'), data.get('audience'))
    audience = _primary_audience(audiences)
    visible_to_roles, roles_err = clean_visible_roles(data.get('visible_to_roles'))
    if roles_err:
        return jsonify({'success': False, 'error': roles_err}), 400
    min_age, max_age, age_err = _clean_age_window(data)
    if age_err:
        return jsonify({'success': False, 'error': age_err}), 400
    last = (_admin().table('sis_staff_training').select('sequence_order')
            .eq('organization_id', org_id).eq('audience', audience)
            .order('sequence_order', desc=True).limit(1).execute()).data
    # The finish line lives on the quest. Only movable for the school's own
    # quests — a library quest is shared, so one school must not retune it for
    # everybody else.
    if 'xp_threshold' in data and quest.get('organization_id') == org_id:
        xp_threshold, xp_err = _clean_xp_threshold(data.get('xp_threshold'))
        if xp_err:
            return jsonify({'success': False, 'error': xp_err}), 400
        _admin().table('quests').update({'xp_threshold': xp_threshold}) \
            .eq('id', quest_id).execute()

    auto_assign = bool(data.get('auto_assign'))
    row = (_admin().table('sis_staff_training').upsert({
        'organization_id': org_id,
        'quest_id': quest_id,
        'audience': audience,
        'audiences': audiences,
        'category': (data.get('category') or '').strip() or None,
        'is_required': bool(data.get('is_required')),
        'visible_to_roles': visible_to_roles if 'staff' in audiences else None,
        'student_min_age': min_age if 'student' in audiences else None,
        'student_max_age': max_age if 'student' in audiences else None,
        'auto_assign': auto_assign,
        'sequence_order': ((last[0]['sequence_order'] or 0) + 1) if last else 0,
        'created_by': user_id,
    }, on_conflict='organization_id,quest_id,audience').execute()).data
    # Ticking auto-assign means "everyone does this", so the people who are
    # already here get it now rather than on their next page load.
    assigned = _assign_item(org_id, {
        'quest_id': quest_id, 'visible_to_roles': visible_to_roles,
        'audiences': audiences,
        'student_min_age': min_age, 'student_max_age': max_age,
    }) if auto_assign else None
    return jsonify({'success': True, 'training': row[0] if row else None,
                    'assigned': assigned}), 201


@bp.route('/training/header-image', methods=['POST'])
@require_role(*ADMIN_ROLES)
@rate_limit(max_requests=30, window_seconds=300)
def upload_training_header_image(user_id):
    """Upload a header image for a training quest being built.

    Uploaded BEFORE the quest exists, because this screen creates the quest in
    one submit and an admin should see the picture in the preview before
    committing to any of it. The path is keyed on a fresh id rather than a quest
    id for the same reason; nothing else in the system reads these by path.

    `quest-headers` is a deliberately public bucket (see utils/storage_urls.py)
    — quest artwork is referenced raw from emails and cached pages, where a
    signed URL would expire before it was looked at.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err

    file = request.files.get('image')
    if not file or not file.filename:
        return jsonify({'success': False, 'error': 'Choose an image to upload.'}), 400

    data = file.read()
    if not data:
        return jsonify({'success': False, 'error': 'That file is empty.'}), 400

    from services.file_upload_service import FileUploadService
    result = FileUploadService().upload_quest_header(
        file_data=data,
        filename=file.filename,
        content_type=file.content_type,
        # Not a quest id — the quest does not exist yet. Just a unique folder.
        quest_id=f'training/{uuid.uuid4().hex[:12]}',
    )
    if not result.success:
        return jsonify({'success': False,
                        'error': result.error_message or 'Could not upload that image.'}), 400
    logger.info(f"Training header image uploaded by {user_id} for org {org_id}")
    return jsonify({'success': True, 'url': result.url})


@bp.route('/training/create', methods=['POST'])
@require_role(*ADMIN_ROLES)
def create_training_quest(user_id):
    """Build a new quest and set it for this audience in one step.

    iCreate, 2026-08-06, of the family-quest screen: "where does the quest get
    built?" It could only attach a quest that already existed somewhere else,
    which is a dead end if you have not made one — and "go to the learning app,
    author a quest, come back, find it in a dropdown" is not a flow anybody
    completes. Same builder the class-quest screen uses (the shared
    QuestDraftForm), pointed at the catalog instead of at a class.

    Body: {title, description?, tasks?[], audience?, category?, is_required?}
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'success': False, 'error': 'A quest title is required.'}), 400
    if len(title) > _MAX_TITLE_LEN:
        return jsonify({'success': False, 'error': 'Title is too long.'}), 400
    raw_tasks = data.get('tasks') or []
    if len(raw_tasks) > _MAX_TASKS:
        return jsonify({'success': False,
                        'error': f'A quest can have at most {_MAX_TASKS} tasks.'}), 400

    description = (data.get('description') or '').strip()
    audiences = _audiences(data.get('audiences'), data.get('audience'))
    audience = _primary_audience(audiences)
    min_age, max_age, age_err = _clean_age_window(data)
    if age_err:
        return jsonify({'success': False, 'error': age_err}), 400
    admin = _admin()

    # Header image, in order of what the school actually meant:
    #   1. one they uploaded here,
    #   2. their own logo — training is the school talking to its own people, so
    #      its badge beats a stock photo of somebody else's classroom,
    #   3. the stock search, for an org that has never set a logo.
    # The logo is contained rather than cropped full-bleed, which is what
    # metadata.header_style='org_logo' tells the card and the detail header to do
    # (same flag OEA and POE use).
    image_url, image_err = _clean_image_url(data.get('image_url'))
    if image_err:
        return jsonify({'success': False, 'error': image_err}), 400
    header_style = None
    if not image_url:
        image_url = _org_logo(org_id)
        if image_url:
            header_style = 'org_logo'
    if not image_url:
        try:
            from services.image_service import search_quest_image
            image_url = search_quest_image(title, description)
        except Exception as e:  # noqa: BLE001 — a missing header image is not a failure
            logger.warning(f'Training-quest image lookup failed (non-fatal): {e}')

    xp_threshold, xp_err = _clean_xp_threshold(data.get('xp_threshold'))
    if xp_err:
        return jsonify({'success': False, 'error': xp_err}), 400

    now = datetime.now(timezone.utc).isoformat()
    # is_public False: a school's own quest, not pushed into the shared library.
    # Off unless asked for: training is a set list of things the school needs
    # done, so a learner inventing extra tasks for themselves is the exception.
    allow_custom_tasks = bool(data.get('allow_custom_tasks'))
    source_material = (data.get('source_material') or '').strip()[:_MAX_SOURCE_CHARS]

    # A draft is built, previewable and editable, but is on nobody's account and
    # invisible to the people it is for. is_active=False is what every other
    # read already keys off, so nothing else has to learn the word "draft".
    is_draft = bool(data.get('is_draft'))

    quest = (admin.table('quests').insert({
        'title': title, 'big_idea': description, 'description': description,
        'is_v3': True, 'is_active': not is_draft, 'is_public': False,
        'quest_type': 'optio', 'header_image_url': image_url, 'image_url': image_url,
        'metadata': {'header_style': header_style} if header_style else {},
        'xp_threshold': xp_threshold,
        'allow_custom_tasks': allow_custom_tasks,
        # Only worth keeping if they can actually generate against it.
        'source_material': source_material if (allow_custom_tasks and source_material) else None,
        'created_by': user_id, 'created_at': now, 'organization_id': org_id,
    }).execute()).data
    if not quest:
        return jsonify({'success': False, 'error': 'Could not create the quest.'}), 500
    quest_id = quest[0]['id']

    cleaned = [t for t in (_clean_task(r, i) for i, r in enumerate(raw_tasks)) if t]
    if cleaned:
        for t in cleaned:
            t['quest_id'] = quest_id
        admin.table('quest_template_tasks').insert(cleaned).execute()

    visible_to_roles, roles_err = clean_visible_roles(data.get('visible_to_roles'))
    if roles_err:
        return jsonify({'success': False, 'error': roles_err}), 400
    last = (admin.table('sis_staff_training').select('sequence_order')
            .eq('organization_id', org_id).eq('audience', audience)
            .order('sequence_order', desc=True).limit(1).execute()).data
    auto_assign = bool(data.get('auto_assign'))
    admin.table('sis_staff_training').insert({
        'organization_id': org_id, 'quest_id': quest_id, 'audience': audience,
        'audiences': audiences,
        'category': (data.get('category') or '').strip() or None,
        'is_required': bool(data.get('is_required')),
        'visible_to_roles': visible_to_roles if 'staff' in audiences else None,
        'student_min_age': min_age if 'student' in audiences else None,
        'student_max_age': max_age if 'student' in audiences else None,
        'auto_assign': auto_assign,
        'sequence_order': ((last[0]['sequence_order'] or 0) + 1) if last else 0,
        'created_by': user_id,
    }).execute()

    # Built and set for everyone in one step — the roster that exists right now
    # is enrolled here; later arrivals are picked up by the catch-up on read.
    # A draft assigns to nobody, whatever the auto-assign box says; publishing
    # it is what turns that intent into enrollments.
    assigned = _assign_item(org_id, {
        'quest_id': quest_id, 'visible_to_roles': visible_to_roles,
        'audiences': audiences,
        'student_min_age': min_age, 'student_max_age': max_age,
    }) if (auto_assign and not is_draft) else None

    return jsonify({'success': True, 'quest_id': quest_id,
                    'task_count': len(cleaned), 'audience': audience,
                    'audiences': audiences,
                    'is_draft': is_draft, 'assigned': assigned}), 201


@bp.route('/training/<training_id>', methods=['PATCH'])
@require_role(*ADMIN_ROLES)
def update_training(user_id, training_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if _bad_uuid(training_id):
        return jsonify({'success': False, 'error': 'Invalid id'}), 400
    owned = (_admin().table('sis_staff_training').select('id, organization_id, quest_id')
             .eq('id', training_id).limit(1).execute()).data
    if not owned or owned[0].get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Not found'}), 404
    data = request.get_json(silent=True) or {}

    # The XP finish line is a column on the quest, not on the catalog row, so
    # that the ordinary completion gate enforces it. Same rule as attaching:
    # only the school's own quests can be retuned.
    if 'xp_threshold' in data:
        xp_threshold, xp_err = _clean_xp_threshold(data.get('xp_threshold'))
        if xp_err:
            return jsonify({'success': False, 'error': xp_err}), 400
        quest = (_admin().table('quests').select('id, organization_id')
                 .eq('id', owned[0]['quest_id']).limit(1).execute()).data
        if not quest or quest[0].get('organization_id') != org_id:
            return jsonify({
                'success': False,
                'error': 'That quest belongs to the Optio library, so its XP requirement cannot be changed here.',
            }), 403
        _admin().table('quests').update({'xp_threshold': xp_threshold}) \
            .eq('id', owned[0]['quest_id']).execute()
        # The finish line lives on the quest, so this request can be complete
        # without touching the catalog row at all.
        changed_quest = True
    else:
        changed_quest = False

    fields = {}
    if 'category' in data:
        fields['category'] = (data.get('category') or '').strip() or None
    if 'is_required' in data:
        fields['is_required'] = bool(data.get('is_required'))
    if 'auto_assign' in data:
        fields['auto_assign'] = bool(data.get('auto_assign'))
    if 'visible_to_roles' in data:
        visible_to_roles, roles_err = clean_visible_roles(data.get('visible_to_roles'))
        if roles_err:
            return jsonify({'success': False, 'error': roles_err}), 400
        fields['visible_to_roles'] = visible_to_roles
    if 'sequence_order' in data:
        try:
            fields['sequence_order'] = int(data.get('sequence_order'))
        except (TypeError, ValueError):
            return jsonify({'success': False, 'error': 'sequence_order must be a number'}), 400
    if not fields:
        if changed_quest:
            return jsonify({'success': True})
        return jsonify({'success': False, 'error': 'Nothing to update'}), 400
    _admin().table('sis_staff_training').update(fields).eq('id', training_id).execute()
    return jsonify({'success': True})


@bp.route('/training/<training_id>/assign', methods=['POST'])
@require_role(*ADMIN_ROLES)
def assign_training(user_id, training_id):
    """Put this quest on every eligible account in its audience, now.

    Safe to press again — anyone already enrolled is counted and left alone,
    including somebody who has finished it, so re-running to catch new families
    never restarts anybody's quest.
    """
    item, err = _owned_item(user_id, training_id)
    if err:
        return err
    org_id = item['organization_id']
    audience = _audience(item.get('audience'))

    if not (item.get('quests') or {}).get('is_active'):
        return jsonify({
            'success': False,
            'error': 'That quest is still a draft. Publish it before assigning it.',
        }), 400

    # Optional: just these people, rather than the whole audience.
    data = request.get_json(silent=True) or {}
    only = data.get('user_ids')
    if only is not None:
        if not isinstance(only, list):
            return jsonify({'success': False, 'error': 'user_ids must be a list'}), 400
        if _bad_uuid(*only):
            return jsonify({'success': False, 'error': 'Invalid user id'}), 400
        if not only:
            return jsonify({'success': False, 'error': 'Choose at least one person.'}), 400

    counts = _assign_item(org_id, item, only_user_ids=only)
    logger.info(
        f"Training {training_id} assigned by {user_id} "
        f"({'chosen' if only is not None else 'everyone'}): "
        f"{counts['enrolled']} enrolled, {counts['already']} already, {counts['failed']} failed"
    )
    return jsonify({'success': True, 'audience': audience,
                    'audiences': _row_audiences(item), **counts})


@bp.route('/training/<training_id>/people', methods=['GET'])
@require_role(*ADMIN_ROLES)
def training_people(user_id, training_id):
    """Who this training could go to, and who already has it.

    Feeds the "choose people" picker. Returns only those the row applies to, so
    a coordinator-only course does not offer the whole staff room, and a quest
    set for 12-and-up does not offer the six-year-olds.
    """
    item, err = _owned_item(user_id, training_id)
    if err:
        return err
    audience = _audience(item.get('audience'))
    people = _eligible_people(item['organization_id'], item)
    progress = _progress_for([p['id'] for p in people], [item['quest_id']])
    return jsonify({'success': True, 'audience': audience,
                    'audiences': _row_audiences(item), 'people': [{
                        'user_id': p['id'],
                        'name': p.get('name'),
                        'email': p.get('email'),
                        # Which group reached them, so the picker can group a
                        # mixed list rather than showing one flat run of names.
                        'group': p.get('group'),
                        'age': p.get('age'),
                        'progress': progress.get((p['id'], item['quest_id']),
                                                 dict(_NOT_STARTED)),
                    } for p in people]})


@bp.route('/training/<training_id>/quest', methods=['GET'])
@require_role(*ADMIN_ROLES)
def get_training_quest(user_id, training_id):
    """Everything the builder needs to reopen this quest for editing.

    A draft that cannot be picked back up is not a draft, it is a dead end.
    """
    item, err = _owned_item(user_id, training_id)
    if err:
        return err
    admin = _admin()
    rows = (admin.table('quests')
            .select('id, title, description, big_idea, header_image_url, is_active, '
                    'xp_threshold, allow_custom_tasks, source_material, organization_id')
            .eq('id', item['quest_id']).limit(1).execute()).data
    if not rows:
        return jsonify({'success': False, 'error': 'Not found'}), 404
    q = rows[0]
    tasks = (admin.table('quest_template_tasks')
             .select('title, description, pillar, xp_value, is_required, order_index')
             .eq('quest_id', item['quest_id']).order('order_index').execute()).data or []
    return jsonify({'success': True, 'quest': {
        'quest_id': q['id'],
        'title': q.get('title') or '',
        'description': q.get('big_idea') or q.get('description') or '',
        # Only an image uploaded here can be handed back to the form. A quest
        # created without one carries the org logo (a base64 data URI) or a
        # stock search result in this column, and echoing that into the form
        # means the very next save posts it back and is rejected as "not
        # uploaded here" — an admin who only changed a task's wording could not
        # save at all (iCreate, 2026-08-17). Blank shows the same logo fallback
        # the builder shows, and leaves the stored artwork untouched.
        'image_url': _uploaded_image(q.get('header_image_url')),
        'xp_threshold': q.get('xp_threshold') or 0,
        'allow_custom_tasks': bool(q.get('allow_custom_tasks')),
        'has_source_material': bool(q.get('source_material')),
        'is_draft': not q.get('is_active'),
        # A library quest is shared with every other school, so its content is
        # not this one's to rewrite.
        'quest_is_ours': q.get('organization_id') == item['organization_id'],
        'tasks': tasks,
    }, 'training': {
        'category': item.get('category') or '',
        'is_required': bool(item.get('is_required')),
        'auto_assign': bool(item.get('auto_assign')),
        'visible_to_roles': item.get('visible_to_roles'),
        'audience': _audience(item.get('audience')),
        'audiences': _row_audiences(item),
        'student_min_age': item.get('student_min_age'),
        'student_max_age': item.get('student_max_age'),
    }})


@bp.route('/training/<training_id>/quest', methods=['PUT'])
@require_role(*ADMIN_ROLES)
def update_training_quest(user_id, training_id):
    """Save edits to a quest built here — its content and its catalog settings.

    Template tasks are replaced wholesale rather than diffed: they are a short
    authored list, and matching them up by hand would be a lot of machinery for
    no visible difference.

    The save then pushes those tasks onto everyone already holding the quest.
    That is deliberately narrower than the quest library at large, where an edit
    must not reach into work a learner is part-way through — but a training or
    orientation quest is the school's own document, the admin edits it BECAUSE
    the people holding it need the new wording, and until 2026-08-18 there was
    no way to give it to them: iCreate saved a fix mid-orientation and all 152
    families stayed on the previous copy. Anything already completed, or
    carrying an evidence upload, is left exactly as it is — see
    resync_enrollments_to_template, which rewrites rows in place for that reason.
    """
    item, err = _owned_item(user_id, training_id)
    if err:
        return err
    org_id = item['organization_id']
    admin = _admin()

    owned = (admin.table('quests').select('id, organization_id, header_image_url')
             .eq('id', item['quest_id']).limit(1).execute()).data
    if not owned or owned[0].get('organization_id') != org_id:
        return jsonify({
            'success': False,
            'error': 'That quest belongs to the Optio library, so it cannot be edited here.',
        }), 403

    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'success': False, 'error': 'A quest title is required.'}), 400
    if len(title) > _MAX_TITLE_LEN:
        return jsonify({'success': False, 'error': 'Title is too long.'}), 400
    raw_tasks = data.get('tasks') or []
    if len(raw_tasks) > _MAX_TASKS:
        return jsonify({'success': False,
                        'error': f'A quest can have at most {_MAX_TASKS} tasks.'}), 400

    xp_threshold, xp_err = _clean_xp_threshold(data.get('xp_threshold'))
    if xp_err:
        return jsonify({'success': False, 'error': xp_err}), 400
    # A form that posts back the artwork the quest already has is not uploading
    # anything, whatever that artwork is — so it is a no-op, not an error.
    raw_image = (data.get('image_url') or '').strip()
    if raw_image and raw_image == (owned[0].get('header_image_url') or ''):
        image_url, image_err = None, None
    else:
        image_url, image_err = _clean_image_url(raw_image)
    if image_err:
        return jsonify({'success': False, 'error': image_err}), 400
    visible_to_roles, roles_err = clean_visible_roles(data.get('visible_to_roles'))
    if roles_err:
        return jsonify({'success': False, 'error': roles_err}), 400

    description = (data.get('description') or '').strip()
    allow_custom_tasks = bool(data.get('allow_custom_tasks'))
    fields = {
        'title': title, 'big_idea': description, 'description': description,
        'xp_threshold': xp_threshold,
        'allow_custom_tasks': allow_custom_tasks,
    }
    # Only touch the artwork when a new one was uploaded — an untouched form
    # must not wipe the header image the quest already has.
    if image_url:
        fields['header_image_url'] = image_url
        fields['image_url'] = image_url
        fields['metadata'] = {}
    # Turning learner generation off makes the stored handbook dead weight.
    if not allow_custom_tasks:
        fields['source_material'] = None
    elif (data.get('source_material') or '').strip():
        fields['source_material'] = data['source_material'].strip()[:_MAX_SOURCE_CHARS]
    admin.table('quests').update(fields).eq('id', item['quest_id']).execute()

    cleaned = [t for t in (_clean_task(r, i) for i, r in enumerate(raw_tasks)) if t]
    admin.table('quest_template_tasks').delete().eq('quest_id', item['quest_id']).execute()
    if cleaned:
        for t in cleaned:
            t['quest_id'] = item['quest_id']
        admin.table('quest_template_tasks').insert(cleaned).execute()

    # Best-effort: the edit is saved either way. An admin told the save failed
    # would press it again and edit twice, which is worse than a stale copy.
    try:
        from utils.template_tasks import resync_enrollments_to_template
        synced = resync_enrollments_to_template(admin, item['quest_id'])
        logger.info(f"Training quest {item['quest_id']} resynced: {synced}")
    except Exception as e:  # noqa: BLE001
        logger.error(f"Could not resync enrollments for {item['quest_id']}: {e}",
                     exc_info=True)

    # Who it is for can be changed here too — an orientation quest that went to
    # parents is the same quest when the school decides the teenagers should do
    # it as well. Left alone when the form does not send it, so a client that
    # only knows about the old fields cannot silently narrow the audience.
    audiences = (_audiences(data.get('audiences')) if data.get('audiences')
                 else _row_audiences(item))
    min_age, max_age, age_err = _clean_age_window(data)
    if age_err:
        return jsonify({'success': False, 'error': age_err}), 400
    if 'student_min_age' not in data and 'student_max_age' not in data:
        min_age, max_age = item.get('student_min_age'), item.get('student_max_age')

    catalog_fields = {
        'category': (data.get('category') or '').strip() or None,
        'is_required': bool(data.get('is_required')),
        'auto_assign': bool(data.get('auto_assign')),
        'audience': _primary_audience(audiences),
        'audiences': audiences,
        'visible_to_roles': visible_to_roles if 'staff' in audiences else None,
        'student_min_age': min_age if 'student' in audiences else None,
        'student_max_age': max_age if 'student' in audiences else None,
    }
    admin.table('sis_staff_training').update(catalog_fields).eq('id', training_id).execute()

    logger.info(f"Training quest {item['quest_id']} edited by {user_id}")
    return jsonify({'success': True, 'quest_id': item['quest_id'],
                    'task_count': len(cleaned), 'audiences': audiences})


@bp.route('/training/<training_id>/publish', methods=['POST'])
@require_role(*ADMIN_ROLES)
def publish_training(user_id, training_id):
    """Take a draft live.

    Publishing is the moment the quest becomes real for its audience: it starts
    showing on their list, and if it was built to go on everybody's accounts,
    this is when that happens.

    Body: {assign: false} publishes without enrolling anybody, which is what the
    people-picker does when it is about to enrol a chosen few — otherwise going
    live would sweep in the whole audience a moment before.
    """
    item, err = _owned_item(user_id, training_id)
    if err:
        return err
    org_id = item['organization_id']
    audience = _audience(item.get('audience'))
    data = request.get_json(silent=True) or {}

    _admin().table('quests').update({'is_active': True}) \
        .eq('id', item['quest_id']).eq('organization_id', org_id).execute()

    assign_now = data.get('assign', True) and item.get('auto_assign')
    assigned = _assign_item(org_id, item) if assign_now else None
    logger.info(f"Training {training_id} published by {user_id}")
    return jsonify({'success': True, 'audience': audience, 'assigned': assigned})


@bp.route('/training/<training_id>', methods=['DELETE'])
@require_role(*ADMIN_ROLES)
def remove_training(user_id, training_id):
    """Take a quest off the training catalog. The quest itself is untouched, and
    so is any progress teachers already made on it."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if _bad_uuid(training_id):
        return jsonify({'success': False, 'error': 'Invalid id'}), 400
    owned = (_admin().table('sis_staff_training').select('id, organization_id')
             .eq('id', training_id).limit(1).execute()).data
    if not owned or owned[0].get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Not found'}), 404
    _admin().table('sis_staff_training').delete().eq('id', training_id).execute()
    return jsonify({'success': True})


# ── Who has done what ─────────────────────────────────────────────────────────

@bp.route('/training/progress', methods=['GET'])
@require_role(*ADMIN_ROLES)
def training_progress(user_id):
    """Everyone in the audience against every quest set for them — the
    completion record an accreditor or UFA would ask for, and for families the
    answer to "who still hasn't done back to school night".
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    audience = _audience(request.args.get('audience'))
    catalog = _catalog(org_id, audience)
    # One tab, one group of people. A quest set for parents AND students shows
    # on both tabs, but each tab reports on the people that tab is about — a
    # report mixing parents and students into one list answers neither
    # "which families still owe us orientation" nor "which teenagers have done it".
    staff = _audience_people(org_id, audience)
    quest_ids = [c['quest_id'] for c in catalog]
    progress = _progress_for([s['id'] for s in staff], quest_ids)

    def _applies(c, person):
        """Whether a quest counts against this person at all. The same rule the
        assignment uses (_item_applies_to), so the report cannot claim somebody
        is behind on a quest they were never going to be given."""
        return _item_applies_to(c, person, audience)

    rows = []
    for s in staff:
        cells = [{'quest_id': c['quest_id'],
                  'applies': _applies(c, s),
                  **progress.get((s['id'], c['quest_id']), dict(_NOT_STARTED))}
                 for c in catalog]
        required_done = len([c for c, cell in zip(catalog, cells)
                             if c['is_required'] and cell['applies'] and cell['completed']])
        rows.append({
            'user_id': s['id'], 'name': s['name'], 'cells': cells,
            'completed': len([c for c in cells if c['completed']]),
            'required_completed': required_done,
            # A person's own denominator: only the required quests aimed at them.
            'required_total': len([c for c, cell in zip(catalog, cells)
                                   if c['is_required'] and cell['applies']]),
        })
    required_total = len([c for c in catalog if c['is_required']])
    return jsonify({'success': True, 'training': catalog, 'staff': rows,
                    'audience': audience, 'required_total': required_total})


def _org_students(org_id):
    """The org's students, shaped like the other two listers, with their age.

    Age is carried on the person rather than looked up later because it is what
    the row's window is checked against, and a student whose DOB was never
    recorded has to come through as age None so the window can leave them out
    rather than silently include them.
    """
    from utils.db_fetch import fetch_all_rows
    rows = fetch_all_rows(lambda: (
        _admin().table('users')
        .select('id, first_name, last_name, display_name, email, username, '
                'org_role, org_roles, role, date_of_birth')
        .eq('organization_id', org_id)
    ))
    out = []
    for u in rows:
        roles = _roles_of(u)
        # Students only. An admin or a parent who also happens to hold the
        # student role at their own school is reached as a student here, which
        # is correct — it is the role that decides, not the person.
        if 'student' not in roles:
            continue
        out.append({
            'id': u['id'],
            'name': (u.get('display_name')
                     or f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip()
                     or u.get('username') or u.get('email') or 'Unnamed'),
            'email': u.get('email'),
            'roles': sorted(roles),
            'age': sis_service.age_years(u.get('date_of_birth')),
        })
    out.sort(key=lambda p: (p['name'] or '').lower())
    return out


def _guardians(org_id):
    """The org's guardians, shaped like list_org_staff so the report is one code
    path for both audiences.

    Roles are read from `org_roles` as well as `org_role`. A person can hold
    several — at iCreate the admins are parents too — and the old check looked
    only at the single `org_role` column, so a parent whose primary role was
    org_admin was missing from their own school's family quests.

    Org admins are included whether or not they are parents: they run the
    school, and a back-to-school-night quest is theirs to be able to do (and to
    try out before it goes to real families).
    """
    from utils.db_fetch import fetch_all_rows
    rows = fetch_all_rows(lambda: (
        _admin().table('users')
        .select('id, first_name, last_name, display_name, email, org_role, org_roles, role')
        .eq('organization_id', org_id)
    ))
    school_account = None
    try:
        school_account = sis_service.org_messaging_email(org_id)
    except Exception:  # noqa: BLE001 — worst case the placeholder shows up
        pass

    out = []
    for u in rows:
        # The org's messaging identity is infrastructure, not a person.
        if school_account and u.get('email') == school_account:
            continue
        roles = _roles_of(u)
        if not (roles & {'parent', *_ADMIN_ORG_ROLES}):
            continue
        out.append({
            'id': u['id'],
            'name': (u.get('display_name')
                     or f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip()
                     or u.get('email') or 'Unnamed'),
            'email': u.get('email'),
            'roles': sorted(roles),
        })
    out.sort(key=lambda p: (p['name'] or '').lower())
    return out
