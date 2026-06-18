"""
The Treehouse program API (program-specific tab, gated by org slug 'treehouse').

Mirrors the OEA pattern (routes/oea.py): a self-contained blueprint that uses the
admin client for cross-user reads/writes and enforces program membership itself.
Superadmin always has access (Critical Rule #7).

Surfaces:
  - Student:   home payload, visual quest/badge browse, create help/proud signals.
  - Facilitator (advisor/org_admin): signal queue, pin-creation queue, showcase
    events + roster, student roster, spendable-XP balance + manual adjust, kiosk
    device provisioning.
  - Kiosk:     token-gated student roster + passwordless student login (shared device).
"""

import hashlib
import secrets
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, make_response

from database import get_supabase_admin_client
from repositories.treehouse_repository import TreehouseRepository
from repositories.class_repository import ClassRepository
from services.notification_service import NotificationService
from utils.treehouse import facilitators_for_student
from utils.auth.decorators import require_auth, validate_uuid_param
from utils.session_manager import SessionManager
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('treehouse', __name__, url_prefix='/api/treehouse')

TREEHOUSE_SLUG = 'treehouse'
PILLARS = ['art', 'stem', 'wellness', 'communication', 'civics']
# Student-facing category labels for the five pillars.
PILLAR_LABELS = {
    'art': 'Creative Expression',
    'stem': 'STEM',
    'wellness': 'Wellness',
    'communication': 'Communication',
    'civics': 'Civics',
}

_notifications = NotificationService()
_org_id_cache = {}


# ── membership / context ─────────────────────────────────────────────────────
def _treehouse_org_id():
    """Return the Treehouse organization id (cached for the process)."""
    if 'id' in _org_id_cache:
        return _org_id_cache['id']
    admin = get_supabase_admin_client()
    res = admin.table('organizations').select('id').eq('slug', TREEHOUSE_SLUG).limit(1).execute()
    org_id = res.data[0]['id'] if res.data else None
    _org_id_cache['id'] = org_id
    return org_id


def _context(user_id):
    """
    Resolve the caller's Treehouse context.

    Returns dict: {user, org_id, is_member, is_facilitator, is_superadmin}.
    A facilitator is an org_admin or advisor in the Treehouse org (or superadmin).
    """
    admin = get_supabase_admin_client()
    u = admin.table('users').select(
        'id, role, org_role, org_roles, organization_id, first_name, display_name'
    ).eq('id', user_id).limit(1).execute()
    user = u.data[0] if u.data else None
    org_id = _treehouse_org_id()
    if not user:
        return {'user': None, 'org_id': org_id, 'is_member': False,
                'is_facilitator': False, 'is_superadmin': False}

    is_superadmin = user.get('role') == 'superadmin'
    is_member = is_superadmin or (user.get('organization_id') == org_id)

    roles = set()
    if user.get('org_role'):
        roles.add(user['org_role'])
    if isinstance(user.get('org_roles'), list):
        roles.update(user['org_roles'])
    is_facilitator = is_superadmin or (
        user.get('organization_id') == org_id and bool(roles & {'org_admin', 'advisor'})
    )
    return {'user': user, 'org_id': org_id, 'is_member': is_member,
            'is_facilitator': is_facilitator, 'is_superadmin': is_superadmin}


def _org_student_ids(admin, org_id):
    res = admin.table('users').select('id').eq('organization_id', org_id).eq('org_role', 'student').execute()
    return [r['id'] for r in (res.data or [])]


def _student_in_org(admin, student_id, org_id):
    res = admin.table('users').select('id, organization_id').eq('id', student_id).limit(1).execute()
    return bool(res.data) and res.data[0].get('organization_id') == org_id


def _roles_of(user):
    roles = set()
    if user and user.get('org_role'):
        roles.add(user['org_role'])
    if user and isinstance(user.get('org_roles'), list):
        roles.update(user['org_roles'])
    return roles


def _is_admin(ctx):
    """Treehouse admin = org_admin (or superadmin). Used for cohort management + add-student."""
    return ctx['is_superadmin'] or 'org_admin' in _roles_of(ctx['user'])


def _cohort_student_ids(admin, class_ids):
    """Active-enrollment student ids across the given org_class ids."""
    if not class_ids:
        return []
    res = (admin.table('class_enrollments').select('student_id')
           .in_('class_id', class_ids).eq('status', 'active').execute())
    return list({r['student_id'] for r in (res.data or [])})


def _advisor_class_ids(admin, advisor_id):
    """org_class ids this advisor is actively assigned to."""
    res = (admin.table('class_advisors').select('class_id')
           .eq('advisor_id', advisor_id).eq('is_active', True).execute())
    return [r['class_id'] for r in (res.data or [])]


def _scoped_student_ids(admin, ctx, cohort_id=None):
    """
    Which Treehouse students a facilitator should see (A1 — cohort scoping).

    - cohort_id given     -> just that cohort's students (intersected with the org).
    - org_admin/superadmin -> all org students.
    - advisor             -> students across their assigned cohorts; if the advisor
                             has no cohort assignment yet, fall back to ALL org
                             students so initial setup isn't a dead end.
    """
    org_ids = set(_org_student_ids(admin, ctx['org_id']))
    if cohort_id:
        return list(set(_cohort_student_ids(admin, [cohort_id])) & org_ids)
    if _is_admin(ctx):
        return list(org_ids)
    my_classes = _advisor_class_ids(admin, ctx['user']['id'])
    if not my_classes:
        return list(org_ids)
    return list(set(_cohort_student_ids(admin, my_classes)) & org_ids)


@bp.route('/me', methods=['GET'])
@require_auth
def treehouse_me(user_id):
    """
    Lightweight Treehouse profile for the frontend to gate UI (F1/F2):
    membership, facilitator/admin role, and whether the student should get the
    simplified 'littles' UI (enrolled in a cohort with ui_mode='simple').
    """
    ctx = _context(user_id)
    simplified = False
    if ctx['is_member'] and not ctx['is_facilitator']:
        admin = get_supabase_admin_client()
        enr = (admin.table('class_enrollments').select('class_id')
               .eq('student_id', user_id).eq('status', 'active').execute().data or [])
        class_ids = [e['class_id'] for e in enr]
        if class_ids:
            modes = (admin.table('org_classes').select('ui_mode')
                     .in_('id', class_ids).execute().data or [])
            simplified = any((m.get('ui_mode') == 'simple') for m in modes)
    return jsonify({
        'success': True,
        'is_member': ctx['is_member'],
        'is_facilitator': ctx['is_facilitator'],
        'is_admin': _is_admin(ctx),
        'simplified': simplified,
    }), 200


# ── student: home ────────────────────────────────────────────────────────────
@bp.route('/home', methods=['GET'])
@require_auth
def home(user_id):
    """Young-learner home payload: most-recent active quest + its next task, counts."""
    ctx = _context(user_id)
    if not ctx['is_member']:
        return jsonify({'success': False, 'error': 'Not a Treehouse member'}), 403
    admin = get_supabase_admin_client()
    # Most recent active quest for this student.
    aq = (admin.table('user_quests')
          .select('quest_id, started_at')
          .eq('user_id', user_id).eq('is_active', True).is_('completed_at', 'null')
          .order('started_at', desc=True).limit(1).execute())
    recent = None
    if aq.data:
        quest_id = aq.data[0]['quest_id']
        q = admin.table('quests').select('id, title, image_url').eq('id', quest_id).limit(1).execute()
        # First not-yet-completed task in that quest.
        tasks = (admin.table('user_quest_tasks')
                 .select('id, title, pillar, order_index')
                 .eq('quest_id', quest_id).eq('user_id', user_id)
                 .eq('approval_status', 'approved').order('order_index').execute())
        done = (admin.table('quest_task_completions')
                .select('user_quest_task_id').eq('user_id', user_id).eq('quest_id', quest_id).execute())
        done_ids = {d.get('user_quest_task_id') for d in (done.data or [])}
        next_task = next((t for t in (tasks.data or []) if t['id'] not in done_ids), None)
        recent = {
            'quest': q.data[0] if q.data else {'id': quest_id},
            'next_task': next_task,
        }
    active_count = (admin.table('user_quests')
                    .select('id', count='exact')
                    .eq('user_id', user_id).eq('is_active', True).is_('completed_at', 'null').execute())
    # Student's own spendable-XP ("coins") balance for School Jobs rewards.
    from repositories.yeti_repository import YetiRepository
    spendable_xp = YetiRepository().get_spendable_xp_balance(user_id)
    return jsonify({
        'success': True,
        'recent': recent,
        'active_quest_count': active_count.count or 0,
        'spendable_xp': spendable_xp,
        'student_name': ctx['user'].get('first_name') or ctx['user'].get('display_name'),
    }), 200


# ── student: visual quest/badge browse ───────────────────────────────────────
@bp.route('/quests', methods=['GET'])
@require_auth
def list_quests(user_id):
    """
    Treehouse quests grouped for visual browsing. Each quest's category is the
    dominant pillar among its tasks (pillars live on tasks, not quests). Public
    'Path/badge' quests plus the caller's own personalized quests are returned.
    """
    ctx = _context(user_id)
    if not ctx['is_member']:
        return jsonify({'success': False, 'error': 'Not a Treehouse member'}), 403
    admin = get_supabase_admin_client()
    org_id = ctx['org_id']

    quests = (admin.table('quests')
              .select('id, title, big_idea, image_url, header_image_url, recommended_age, is_public, created_by, is_active')
              .eq('organization_id', org_id).eq('is_active', True).execute()).data or []
    # Show public org quests to everyone; private ones only to their creator.
    visible = [q for q in quests if q.get('is_public') or q.get('created_by') == user_id]
    quest_ids = [q['id'] for q in visible]

    pillars_by_quest = {qid: {} for qid in quest_ids}
    if quest_ids:
        tasks = (admin.table('user_quest_tasks')
                 .select('quest_id, pillar').in_('quest_id', quest_ids).execute()).data or []
        for t in tasks:
            qid, p = t.get('quest_id'), t.get('pillar')
            if qid in pillars_by_quest and p:
                pillars_by_quest[qid][p] = pillars_by_quest[qid].get(p, 0) + 1

    categories = {p: {'pillar': p, 'label': PILLAR_LABELS[p], 'quests': []} for p in PILLARS}
    uncategorized = []
    for q in visible:
        counts = pillars_by_quest.get(q['id'], {})
        dominant = max(counts, key=counts.get) if counts else None
        q['category'] = dominant
        q['pillars'] = list(counts.keys())
        if dominant in categories:
            categories[dominant]['quests'].append(q)
        else:
            uncategorized.append(q)

    return jsonify({
        'success': True,
        'categories': [categories[p] for p in PILLARS],
        'uncategorized': uncategorized,
        'count': len(visible),
    }), 200


# ── student: signals (I Need Help / I'm Proud) ───────────────────────────────
@bp.route('/signals', methods=['POST'])
@require_auth
def create_signal(user_id):
    """Student raises a help or proud signal; all Treehouse facilitators are notified."""
    ctx = _context(user_id)
    if not ctx['is_member']:
        return jsonify({'success': False, 'error': 'Not a Treehouse member'}), 403
    data = request.get_json() or {}
    signal_type = (data.get('signal_type') or '').strip()
    if signal_type not in ('help', 'proud'):
        return jsonify({'success': False, 'error': "signal_type must be 'help' or 'proud'"}), 400

    admin = get_supabase_admin_client()
    repo = TreehouseRepository(admin)
    row = repo.create_signal({
        'student_id': user_id,
        'organization_id': ctx['org_id'],
        'signal_type': signal_type,
        'quest_id': data.get('quest_id'),
        'task_id': data.get('task_id'),
        'note': (data.get('note') or '').strip() or None,
    })

    # Notify the student's facilitators (cohort-scoped; A1).
    student_name = ctx['user'].get('first_name') or ctx['user'].get('display_name') or 'A student'
    verb = 'needs help' if signal_type == 'help' else 'is proud of their work'
    ntype = 'treehouse_help' if signal_type == 'help' else 'treehouse_proud'
    title = f"{student_name} {verb}"
    for fid in facilitators_for_student(admin, ctx['org_id'], user_id):
        try:
            _notifications.create_notification(
                user_id=fid, notification_type=ntype, title=title,
                message=(data.get('note') or '').strip() or title,
                link='/treehouse/facilitator', organization_id=ctx['org_id'],
                metadata={'signal_id': row.get('id'), 'student_id': user_id},
            )
        except Exception as e:
            logger.warning(f"Treehouse signal notify failed for {fid}: {e}")
    return jsonify({'success': True, 'signal': row}), 201


@bp.route('/signals', methods=['GET'])
@require_auth
def list_signals(user_id):
    """Facilitator: open help/proud signal queue with student names attached."""
    ctx = _context(user_id)
    if not ctx['is_facilitator']:
        return jsonify({'success': False, 'error': 'Facilitator access required'}), 403
    admin = get_supabase_admin_client()
    repo = TreehouseRepository(admin)
    # Cohort scoping (A1): advisors see only their cohorts' students by default;
    # an explicit ?cohort_id= narrows to one cohort.
    allowed = set(_scoped_student_ids(admin, ctx, request.args.get('cohort_id') or None))
    signals = [s for s in repo.list_open_signals(ctx['org_id']) if s['student_id'] in allowed]
    sids = list({s['student_id'] for s in signals})
    names = {}
    if sids:
        us = admin.table('users').select('id, first_name, display_name, avatar_url').in_('id', sids).execute().data or []
        names = {u['id']: u for u in us}
    for s in signals:
        u = names.get(s['student_id'], {})
        s['student_name'] = u.get('first_name') or u.get('display_name')
        s['student_avatar'] = u.get('avatar_url')
    return jsonify({'success': True, 'signals': signals, 'count': len(signals)}), 200


@bp.route('/signals/<signal_id>/resolve', methods=['POST'])
@require_auth
@validate_uuid_param('signal_id')
def resolve_signal(user_id, signal_id):
    ctx = _context(user_id)
    if not ctx['is_facilitator']:
        return jsonify({'success': False, 'error': 'Facilitator access required'}), 403
    admin = get_supabase_admin_client()
    repo = TreehouseRepository(admin)
    sig = repo.get_signal(signal_id)
    if not sig or sig.get('organization_id') != ctx['org_id']:
        return jsonify({'success': False, 'error': 'Signal not found'}), 404
    return jsonify({'success': True, 'signal': repo.resolve_signal(signal_id, user_id)}), 200


# ── facilitator: student roster ──────────────────────────────────────────────
@bp.route('/students', methods=['GET'])
@require_auth
def list_students(user_id):
    """Facilitator: Treehouse student roster (id, name, avatar, total_xp), cohort-scoped."""
    ctx = _context(user_id)
    if not ctx['is_facilitator']:
        return jsonify({'success': False, 'error': 'Facilitator access required'}), 403
    admin = get_supabase_admin_client()
    allowed = _scoped_student_ids(admin, ctx, request.args.get('cohort_id') or None)
    if not allowed:
        return jsonify({'success': True, 'students': []}), 200
    res = (admin.table('users')
           .select('id, first_name, last_name, display_name, avatar_url, total_xp')
           .in_('id', allowed).execute())
    return jsonify({'success': True, 'students': res.data or []}), 200


# ── facilitator: pin-creation queue ──────────────────────────────────────────
@bp.route('/pins', methods=['GET'])
@require_auth
def list_pins(user_id):
    """
    Pin queue: 'ready' = completed Treehouse quests not yet marked; plus rows
    already marked created/distributed.
    """
    ctx = _context(user_id)
    if not ctx['is_facilitator']:
        return jsonify({'success': False, 'error': 'Facilitator access required'}), 403
    admin = get_supabase_admin_client()
    repo = TreehouseRepository(admin)
    org_id = ctx['org_id']
    student_ids = _scoped_student_ids(admin, ctx, request.args.get('cohort_id') or None)
    org_quest_ids = [q['id'] for q in (admin.table('quests').select('id')
                     .eq('organization_id', org_id).execute().data or [])]

    completed = []
    if student_ids and org_quest_ids:
        completed = (admin.table('user_quests')
                     .select('user_id, quest_id, completed_at')
                     .in_('user_id', student_ids).in_('quest_id', org_quest_ids)
                     .not_.is_('completed_at', 'null').execute().data or [])

    marked = {(p['student_id'], p['quest_id']): p for p in repo.list_marked_pins(org_id)}

    # Hydrate names/titles.
    sids = list({c['user_id'] for c in completed}) or ['00000000-0000-0000-0000-000000000000']
    qids = list({c['quest_id'] for c in completed}) or ['00000000-0000-0000-0000-000000000000']
    unames = {u['id']: (u.get('first_name') or u.get('display_name'))
              for u in (admin.table('users').select('id, first_name, display_name').in_('id', sids).execute().data or [])}
    qtitles = {q['id']: q.get('title')
               for q in (admin.table('quests').select('id, title').in_('id', qids).execute().data or [])}

    ready, done = [], []
    for c in completed:
        key = (c['user_id'], c['quest_id'])
        item = {
            'student_id': c['user_id'], 'quest_id': c['quest_id'],
            'student_name': unames.get(c['user_id']), 'quest_title': qtitles.get(c['quest_id']),
            'completed_at': c.get('completed_at'),
        }
        if key in marked:
            item['status'] = marked[key]['status']
            done.append(item)
        else:
            item['status'] = 'ready'
            ready.append(item)
    return jsonify({'success': True, 'ready': ready, 'marked': done}), 200


@bp.route('/pins/mark', methods=['POST'])
@require_auth
def mark_pins(user_id):
    """Batch mark pins created/distributed. Body: {items:[{student_id,quest_id}], status}."""
    ctx = _context(user_id)
    if not ctx['is_facilitator']:
        return jsonify({'success': False, 'error': 'Facilitator access required'}), 403
    data = request.get_json() or {}
    status = data.get('status', 'created')
    if status not in ('created', 'distributed'):
        return jsonify({'success': False, 'error': "status must be 'created' or 'distributed'"}), 400
    admin = get_supabase_admin_client()
    repo = TreehouseRepository(admin)
    out = []
    for item in (data.get('items') or []):
        if item.get('student_id') and item.get('quest_id'):
            out.append(repo.upsert_pin(item['student_id'], item['quest_id'],
                                       ctx['org_id'], status, user_id))
    return jsonify({'success': True, 'marked': out}), 200


# ── facilitator: spendable-XP balance (credits/materials) ────────────────────
@bp.route('/students/<student_id>/balance', methods=['GET'])
@require_auth
@validate_uuid_param('student_id')
def student_balance(user_id, student_id):
    ctx = _context(user_id)
    if not ctx['is_facilitator']:
        return jsonify({'success': False, 'error': 'Facilitator access required'}), 403
    admin = get_supabase_admin_client()
    if not (ctx['is_superadmin'] or _student_in_org(admin, student_id, ctx['org_id'])):
        return jsonify({'success': False, 'error': 'Student not in Treehouse'}), 403
    from repositories.yeti_repository import YetiRepository
    yeti = YetiRepository()  # no user_id -> admin client (BaseRepository default)
    balance = yeti.get_spendable_xp_balance(student_id)
    return jsonify({'success': True, 'spendable_xp': balance}), 200


@bp.route('/students/<student_id>/balance/adjust', methods=['POST'])
@require_auth
@validate_uuid_param('student_id')
def adjust_balance(user_id, student_id):
    """Facilitator manual balance adjustment. Body: {amount: int (+/-)}."""
    ctx = _context(user_id)
    if not ctx['is_facilitator']:
        return jsonify({'success': False, 'error': 'Facilitator access required'}), 403
    admin = get_supabase_admin_client()
    if not (ctx['is_superadmin'] or _student_in_org(admin, student_id, ctx['org_id'])):
        return jsonify({'success': False, 'error': 'Student not in Treehouse'}), 403
    data = request.get_json() or {}
    try:
        amount = int(data.get('amount'))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'amount must be an integer'}), 400
    from repositories.yeti_repository import YetiRepository
    yeti = YetiRepository()  # no user_id -> admin client (BaseRepository default)
    # K1 fix: add_spendable_xp is a no-op when the student has no Yeti pet (most
    # Treehouse students, who never opened the pet UI). Create one so the balance
    # actually persists — otherwise the adjust silently reverts on refresh.
    if not yeti.get_pet_by_user_id(student_id):
        yeti.create_pet(student_id, 'Coin Jar')
    yeti.add_spendable_xp(student_id, amount)
    logger.info(f"Treehouse balance adjust {amount} for {student_id[:8]} by {user_id[:8]}")
    return jsonify({'success': True, 'spendable_xp': yeti.get_spendable_xp_balance(student_id)}), 200


# ── showcase events ──────────────────────────────────────────────────────────
@bp.route('/showcase/events', methods=['GET'])
@require_auth
def list_showcase(user_id):
    ctx = _context(user_id)
    if not ctx['is_member']:
        return jsonify({'success': False, 'error': 'Not a Treehouse member'}), 403
    admin = get_supabase_admin_client()
    repo = TreehouseRepository(admin)
    events = repo.list_events(ctx['org_id'])
    # J2: flag events whose date has passed so the UI can keep the dashboard
    # focused on upcoming/today by default. ?scope=upcoming|past|all (default upcoming).
    today = datetime.now(timezone.utc).date().isoformat()
    scope = (request.args.get('scope') or 'upcoming').lower()
    for e in events:
        participants = repo.list_participants(e['id'])
        e['participant_count'] = len(participants)
        e['is_past'] = bool(e.get('showcase_date')) and e['showcase_date'] < today
        # The caller's own signup for this event (lets the student UI show
        # "You're signed up!" + their project title instead of a join button).
        mine = next((p for p in participants if p['student_id'] == user_id), None)
        e['my_participation'] = {'project_title': mine.get('project_title')} if mine else None
    if scope == 'upcoming':
        events = [e for e in events if not e['is_past']]
    elif scope == 'past':
        events = [e for e in events if e['is_past']]
    return jsonify({'success': True, 'events': events}), 200


@bp.route('/showcase/events', methods=['POST'])
@require_auth
def create_showcase(user_id):
    ctx = _context(user_id)
    if not ctx['is_facilitator']:
        return jsonify({'success': False, 'error': 'Facilitator access required'}), 403
    data = request.get_json() or {}
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'success': False, 'error': 'title is required'}), 400
    admin = get_supabase_admin_client()
    repo = TreehouseRepository(admin)
    event = repo.create_event({
        'organization_id': ctx['org_id'], 'title': title,
        'theme': (data.get('theme') or '').strip() or None,
        'description': (data.get('description') or '').strip() or None,
        'showcase_date': data.get('showcase_date') or None,
        'prompts': data.get('prompts') or [],
        'examples': data.get('examples') or [],
        'created_by': user_id,
    })
    return jsonify({'success': True, 'event': event}), 201


@bp.route('/showcase/events/<event_id>', methods=['PATCH'])
@require_auth
@validate_uuid_param('event_id')
def update_showcase(user_id, event_id):
    ctx = _context(user_id)
    if not ctx['is_facilitator']:
        return jsonify({'success': False, 'error': 'Facilitator access required'}), 403
    admin = get_supabase_admin_client()
    repo = TreehouseRepository(admin)
    event = repo.get_event(event_id)
    if not event or event.get('organization_id') != ctx['org_id']:
        return jsonify({'success': False, 'error': 'Event not found'}), 404
    allowed = {k: v for k, v in (request.get_json() or {}).items()
               if k in ('title', 'theme', 'description', 'showcase_date', 'prompts', 'examples', 'status')}
    return jsonify({'success': True, 'event': repo.update_event(event_id, allowed)}), 200


@bp.route('/showcase/events/<event_id>/roster', methods=['GET'])
@require_auth
@validate_uuid_param('event_id')
def showcase_roster(user_id, event_id):
    ctx = _context(user_id)
    if not ctx['is_member']:
        return jsonify({'success': False, 'error': 'Not a Treehouse member'}), 403
    admin = get_supabase_admin_client()
    repo = TreehouseRepository(admin)
    event = repo.get_event(event_id)
    if not event or event.get('organization_id') != ctx['org_id']:
        return jsonify({'success': False, 'error': 'Event not found'}), 404
    participants = repo.list_participants(event_id)
    sids = list({p['student_id'] for p in participants}) or ['00000000-0000-0000-0000-000000000000']
    names = {u['id']: (u.get('first_name') or u.get('display_name'))
             for u in (admin.table('users').select('id, first_name, display_name').in_('id', sids).execute().data or [])}
    for p in participants:
        p['student_name'] = names.get(p['student_id'])
    by_cat = {}
    for p in participants:
        by_cat[p.get('project_category') or 'Other'] = by_cat.get(p.get('project_category') or 'Other', 0) + 1
    return jsonify({'success': True, 'event': event, 'participants': participants,
                    'count': len(participants), 'by_category': by_cat}), 200


@bp.route('/showcase/events/<event_id>/join', methods=['POST'])
@require_auth
@validate_uuid_param('event_id')
def join_showcase(user_id, event_id):
    """Add a student to the showcase roster. Students self-join; facilitators may add any student."""
    ctx = _context(user_id)
    if not ctx['is_member']:
        return jsonify({'success': False, 'error': 'Not a Treehouse member'}), 403
    admin = get_supabase_admin_client()
    repo = TreehouseRepository(admin)
    event = repo.get_event(event_id)
    if not event or event.get('organization_id') != ctx['org_id']:
        return jsonify({'success': False, 'error': 'Event not found'}), 404
    data = request.get_json() or {}
    student_id = data.get('student_id') or user_id
    if student_id != user_id and not ctx['is_facilitator']:
        return jsonify({'success': False, 'error': 'Only facilitators may add other students'}), 403
    participant = repo.join_event({
        'event_id': event_id, 'student_id': student_id,
        'project_title': (data.get('project_title') or '').strip() or None,
        'project_category': (data.get('project_category') or '').strip() or None,
        'quest_id': data.get('quest_id'),
    })
    # Notify facilitators a student committed to a project.
    sname = (admin.table('users').select('first_name, display_name').eq('id', student_id).limit(1).execute().data or [{}])
    sname = sname[0].get('first_name') or sname[0].get('display_name') or 'A student'
    for fid in facilitators_for_student(admin, ctx['org_id'], student_id):
        try:
            _notifications.create_notification(
                user_id=fid, notification_type='treehouse_showcase_joined',
                title=f"{sname} joined the showcase",
                message=f"Project: {participant.get('project_title') or 'TBD'}",
                link='/treehouse/facilitator', organization_id=ctx['org_id'],
                metadata={'event_id': event_id, 'student_id': student_id})
        except Exception:
            pass
    return jsonify({'success': True, 'participant': participant}), 201


# ── cohorts: assign facilitators + enroll students (A1) ──────────────────────
@bp.route('/cohorts', methods=['GET'])
@require_auth
def list_cohorts(user_id):
    """
    Cohorts for the org with their advisors + student counts. Any facilitator can
    read (powers the dashboard cohort filter); management actions below are admin-only.
    """
    ctx = _context(user_id)
    if not ctx['is_facilitator']:
        return jsonify({'success': False, 'error': 'Facilitator access required'}), 403
    repo = ClassRepository()
    classes = repo.list_org_classes(ctx['org_id'], status='active')
    out = []
    for c in classes:
        advisors = repo.get_class_advisors(c['id'])
        students = repo.get_class_students(c['id'])
        out.append({
            'id': c['id'], 'name': c.get('name'), 'description': c.get('description'),
            'ui_mode': c.get('ui_mode'),
            'advisors': [{'id': a.get('advisor_id'), **(a.get('users') or {})} for a in advisors],
            'student_count': len(students),
            'student_ids': [s.get('student_id') for s in students],
        })
    return jsonify({'success': True, 'cohorts': out}), 200


@bp.route('/cohorts', methods=['POST'])
@require_auth
def create_cohort(user_id):
    ctx = _context(user_id)
    if not _is_admin(ctx):
        return jsonify({'success': False, 'error': 'Admin access required'}), 403
    name = ((request.get_json() or {}).get('name') or '').strip()
    if not name:
        return jsonify({'success': False, 'error': 'name is required'}), 400
    body = request.get_json() or {}
    ui_mode = body.get('ui_mode') if body.get('ui_mode') in ('simple', None) else None
    repo = ClassRepository()
    cohort = repo.create_class({
        'organization_id': ctx['org_id'], 'name': name,
        'description': (body.get('description') or '').strip() or None,
        'ui_mode': ui_mode, 'created_by': user_id, 'status': 'active',
    })
    return jsonify({'success': True, 'cohort': cohort}), 201


@bp.route('/cohorts/<class_id>', methods=['PATCH'])
@require_auth
@validate_uuid_param('class_id')
def update_cohort(user_id, class_id):
    """Update a cohort's name/description/ui_mode (admin)."""
    ctx = _context(user_id)
    if not _is_admin(ctx):
        return jsonify({'success': False, 'error': 'Admin access required'}), 403
    repo = ClassRepository()
    if not _verify_cohort_in_org(repo, class_id, ctx['org_id']):
        return jsonify({'success': False, 'error': 'Cohort not found'}), 404
    body = request.get_json() or {}
    updates = {}
    if 'name' in body and (body.get('name') or '').strip():
        updates['name'] = body['name'].strip()
    if 'description' in body:
        updates['description'] = (body.get('description') or '').strip() or None
    if 'ui_mode' in body:
        updates['ui_mode'] = 'simple' if body.get('ui_mode') == 'simple' else None
    if not updates:
        return jsonify({'success': False, 'error': 'No valid fields'}), 400
    return jsonify({'success': True, 'cohort': repo.update_class(class_id, updates)}), 200


def _verify_cohort_in_org(repo, class_id, org_id):
    c = repo.get_class_with_details(class_id)
    return bool(c) and c.get('organization_id') == org_id


@bp.route('/cohorts/<class_id>/advisors', methods=['POST'])
@require_auth
@validate_uuid_param('class_id')
def assign_cohort_advisor(user_id, class_id):
    """Assign a facilitator to a cohort. Body: {advisor_id}."""
    ctx = _context(user_id)
    if not _is_admin(ctx):
        return jsonify({'success': False, 'error': 'Admin access required'}), 403
    repo = ClassRepository()
    if not _verify_cohort_in_org(repo, class_id, ctx['org_id']):
        return jsonify({'success': False, 'error': 'Cohort not found'}), 404
    advisor_id = (request.get_json() or {}).get('advisor_id')
    if not advisor_id:
        return jsonify({'success': False, 'error': 'advisor_id is required'}), 400
    return jsonify({'success': True, 'advisor': repo.add_advisor(class_id, advisor_id, user_id)}), 201


@bp.route('/cohorts/<class_id>/advisors/<advisor_id>', methods=['DELETE'])
@require_auth
@validate_uuid_param('class_id')
@validate_uuid_param('advisor_id')
def remove_cohort_advisor(user_id, class_id, advisor_id):
    ctx = _context(user_id)
    if not _is_admin(ctx):
        return jsonify({'success': False, 'error': 'Admin access required'}), 403
    repo = ClassRepository()
    if not _verify_cohort_in_org(repo, class_id, ctx['org_id']):
        return jsonify({'success': False, 'error': 'Cohort not found'}), 404
    return jsonify({'success': repo.remove_advisor(class_id, advisor_id)}), 200


@bp.route('/cohorts/<class_id>/students', methods=['POST'])
@require_auth
@validate_uuid_param('class_id')
def enroll_cohort_students(user_id, class_id):
    """Bulk-enroll students into a cohort. Body: {student_ids: [...]}."""
    ctx = _context(user_id)
    if not _is_admin(ctx):
        return jsonify({'success': False, 'error': 'Admin access required'}), 403
    repo = ClassRepository()
    if not _verify_cohort_in_org(repo, class_id, ctx['org_id']):
        return jsonify({'success': False, 'error': 'Cohort not found'}), 404
    student_ids = (request.get_json() or {}).get('student_ids') or []
    # Only enroll students who actually belong to this org.
    org_ids = set(_org_student_ids(get_supabase_admin_client(), ctx['org_id']))
    student_ids = [s for s in student_ids if s in org_ids]
    if not student_ids:
        return jsonify({'success': True, 'enrolled': []}), 200
    return jsonify({'success': True, 'enrolled': repo.enroll_students_bulk(class_id, student_ids, user_id)}), 201


@bp.route('/cohorts/<class_id>/students/<student_id>', methods=['DELETE'])
@require_auth
@validate_uuid_param('class_id')
@validate_uuid_param('student_id')
def withdraw_cohort_student(user_id, class_id, student_id):
    ctx = _context(user_id)
    if not _is_admin(ctx):
        return jsonify({'success': False, 'error': 'Admin access required'}), 403
    repo = ClassRepository()
    if not _verify_cohort_in_org(repo, class_id, ctx['org_id']):
        return jsonify({'success': False, 'error': 'Cohort not found'}), 404
    return jsonify({'success': repo.withdraw_student(class_id, student_id)}), 200


# ── facilitator: phone capture → tag one or many students (G1) ───────────────
def _evidence_block(event_id, idx, media_item):
    """Build a learning_event_evidence_blocks row from a capture media item."""
    mtype = media_item.get('type', 'image')
    if mtype == 'link':
        return {'learning_event_id': event_id, 'block_type': 'link', 'order_index': idx,
                'content': {'url': media_item.get('url'), 'title': media_item.get('title', ''), 'caption': ''}}
    common = {
        'learning_event_id': event_id, 'order_index': idx,
        'file_url': media_item.get('file_url'), 'file_name': media_item.get('file_name'),
        'file_size': media_item.get('file_size', 0),
    }
    if mtype in ('document', 'video'):
        return {**common, 'block_type': mtype,
                'content': {'url': media_item.get('file_url'), 'filename': media_item.get('file_name', ''), 'caption': ''}}
    return {**common, 'block_type': 'image',
            'content': {'url': media_item.get('file_url'), 'caption': '', 'alt_text': media_item.get('file_name', '')}}


@bp.route('/capture', methods=['POST'])
@require_auth
def facilitator_capture(user_id):
    """
    G1 — facilitator captures one photo + caption on their phone and tags it to one
    OR many students. Creates a learning_event per student (their portfolio/journal)
    with the media as evidence blocks. Optionally attaches to one student's task.

    Body: {student_ids:[...], description?, attached_task_id?,
           media:[{type:'image'|'video'|'document'|'link', file_url, file_name, file_size, url, title}]}
    """
    ctx = _context(user_id)
    if not ctx['is_facilitator']:
        return jsonify({'success': False, 'error': 'Facilitator access required'}), 403
    data = request.get_json() or {}
    student_ids = [s for s in (data.get('student_ids') or []) if s]
    description = (data.get('description') or '').strip()
    media = data.get('media') or []
    attached_task_id = data.get('attached_task_id')
    if not student_ids:
        return jsonify({'success': False, 'error': 'Tag at least one student'}), 400
    if not description and not media:
        return jsonify({'success': False, 'error': 'Add a caption or a photo'}), 400

    admin = get_supabase_admin_client()
    org_ids = set(_org_student_ids(admin, ctx['org_id']))
    created = []
    for sid in student_ids:
        if sid not in org_ids:
            continue
        event_data = {
            'user_id': sid, 'captured_by_user_id': user_id,
            'description': description or 'Captured by facilitator',
            'source_type': 'advisor_captured', 'pillars': [],
        }
        # Only attach a task when it genuinely belongs to this student.
        if attached_task_id:
            owns = (admin.table('user_quest_tasks').select('id')
                    .eq('id', attached_task_id).eq('user_id', sid).limit(1).execute())
            if owns.data:
                event_data['attached_task_id'] = attached_task_id
        ev = admin.table('learning_events').insert(event_data).execute()
        if not ev.data:
            continue
        eid = ev.data[0]['id']
        blocks = [_evidence_block(eid, i, m) for i, m in enumerate(media)]
        if blocks:
            admin.table('learning_event_evidence_blocks').insert(blocks).execute()
        created.append({'student_id': sid, 'event_id': eid})
    return jsonify({'success': True, 'created': created, 'count': len(created)}), 201


@bp.route('/facilitators', methods=['GET'])
@require_auth
def list_facilitators(user_id):
    """Org facilitators (org_admin/advisor) for the cohort-assignment dropdown."""
    ctx = _context(user_id)
    if not _is_admin(ctx):
        return jsonify({'success': False, 'error': 'Admin access required'}), 403
    admin = get_supabase_admin_client()
    rows = (admin.table('users')
            .select('id, first_name, last_name, display_name, org_role, org_roles')
            .eq('organization_id', ctx['org_id']).execute().data or [])
    facs = [r for r in rows if ({r.get('org_role')} | set(r.get('org_roles') or [])) & {'org_admin', 'advisor'}]
    return jsonify({'success': True, 'facilitators': facs}), 200


# ── kiosk: device provisioning + passwordless student login ──────────────────
def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


@bp.route('/kiosk/devices', methods=['POST'])
@require_auth
def create_kiosk_device(user_id):
    """Facilitator provisions a shared-device token. The plaintext token is shown ONCE."""
    ctx = _context(user_id)
    if not ctx['is_facilitator']:
        return jsonify({'success': False, 'error': 'Facilitator access required'}), 403
    data = request.get_json() or {}
    label = (data.get('label') or 'Classroom device').strip()
    token = 'thk_' + secrets.token_urlsafe(24)
    admin = get_supabase_admin_client()
    repo = TreehouseRepository(admin)
    device = repo.create_kiosk_device({
        'organization_id': ctx['org_id'], 'label': label,
        'token_hash': _hash_token(token), 'created_by': user_id,
    })
    # Return the plaintext token a single time; only the hash is stored.
    return jsonify({'success': True, 'device': {'id': device.get('id'), 'label': label},
                    'device_token': token}), 201


@bp.route('/kiosk/roster', methods=['POST'])
def kiosk_roster():
    """Token-gated: return the org's student roster (photo + first name) for the picker. No auth cookie required."""
    data = request.get_json() or {}
    token = (data.get('device_token') or '').strip()
    if not token:
        return jsonify({'success': False, 'error': 'device_token required'}), 400
    admin = get_supabase_admin_client()
    repo = TreehouseRepository(admin)
    device = repo.get_active_device_by_hash(_hash_token(token))
    if not device:
        return jsonify({'success': False, 'error': 'Invalid device token'}), 401
    repo.touch_device(device['id'])
    res = (admin.table('users')
           .select('id, first_name, display_name, avatar_url')
           .eq('organization_id', device['organization_id']).eq('org_role', 'student').execute())
    students = [{'id': s['id'], 'name': s.get('first_name') or s.get('display_name'),
                 'avatar_url': s.get('avatar_url')} for s in (res.data or [])]
    # Org name + logo for kiosk branding (logo is uploaded via /organization →
    # branding_config.logo_url; may be absent until set).
    org = (admin.table('organizations').select('name, branding_config')
           .eq('id', device['organization_id']).limit(1).execute())
    org_name, org_logo = None, None
    if org.data:
        org_name = org.data[0].get('name')
        org_logo = (org.data[0].get('branding_config') or {}).get('logo_url')
    return jsonify({'success': True, 'students': students,
                    'org_name': org_name, 'org_logo': org_logo}), 200


@bp.route('/kiosk/login', methods=['POST'])
def kiosk_login():
    """
    Passwordless student login on a provisioned shared device. Verifies the device
    token and that the chosen student belongs to that device's org, then mints a
    normal session for the student and sets httpOnly cookies.
    """
    data = request.get_json() or {}
    token = (data.get('device_token') or '').strip()
    student_id = (data.get('student_id') or '').strip()
    if not token or not student_id:
        return jsonify({'success': False, 'error': 'device_token and student_id required'}), 400
    admin = get_supabase_admin_client()
    repo = TreehouseRepository(admin)
    device = repo.get_active_device_by_hash(_hash_token(token))
    if not device:
        return jsonify({'success': False, 'error': 'Invalid device token'}), 401
    if not _student_in_org(admin, student_id, device['organization_id']):
        return jsonify({'success': False, 'error': 'Student not on this device'}), 403

    sm = SessionManager()
    access = sm.generate_access_token(student_id)
    refresh = sm.generate_refresh_token(student_id)
    repo.touch_device(device['id'])
    resp = make_response(jsonify({'success': True, 'user_id': student_id}))
    sm.set_auth_cookies(resp, student_id, access_token=access, refresh_token=refresh)
    logger.info(f"Treehouse kiosk login: student {student_id[:8]} via device {device['id'][:8]}")
    return resp
