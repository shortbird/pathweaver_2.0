"""
CRM admin console API (docs/CRM_REPLACEMENT_PLAN.md — "API contract").

Superadmin-only. Serves the console at /admin/crm: funnel overview, funnel +
step CRUD (step content IS the email — no separate template table), the lead
list/detail with per-lead timeline, manual lead actions, suppressions, and a
manual sweep trigger. Every '/api/admin/crm/...' literal in the frontend's
crmApi.js must have a rule here (test_client_api_paths_exist.py enforces it).

Aggregates are computed in Python over fetch_all_rows reads — fine at the
current volume (hundreds of leads); move to a Postgres RPC when an overview
read starts pulling tens of thousands of send rows.
"""
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request
from postgrest.exceptions import APIError

from utils.auth.decorators import require_superadmin
from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('admin_crm', __name__, url_prefix='/api/admin/crm')

VALID_CONTACT_TYPES = ['demo', 'sales', 'general', 'families', 'philosophy',
                       'academy', 'claim_free_class', 'course_purchase']


def _db():
    from database import get_supabase_admin_client
    # admin client justified: CRM tables are service-role only; every route
    # here is behind require_superadmin.
    return get_supabase_admin_client()


def _repo():
    from repositories.crm_repository import CrmRepository
    return CrmRepository(client=_db())


def _audit(user_id, action_type, resource_type, resource_id, metadata=None):
    try:
        from services.admin_audit_service import AdminAuditService
        AdminAuditService(user_id=user_id).log_action(
            admin_id=user_id, action_type=action_type,
            resource_type=resource_type, resource_id=str(resource_id),
            metadata=metadata or {})
    except Exception as e:  # noqa: BLE001
        logger.warning(f'CRM audit log failed ({action_type}): {e}')


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------- overview

@bp.route('/overview', methods=['GET'])
@require_superadmin
def overview(user_id):
    db = _db()
    funnels = (db.table('crm_funnels').select('*')
               .neq('status', 'archived').order('created_at').execute()).data or []
    steps = (db.table('crm_funnel_steps').select('*')
             .order('step_order').execute()).data or []
    steps_by_funnel = {}
    for s in steps:
        steps_by_funnel.setdefault(s['funnel_id'], []).append(s)

    memberships = fetch_all_rows(lambda: (
        db.table('crm_funnel_memberships')
        .select('funnel_id, status, last_step_sent, exit_reason')))
    sends = fetch_all_rows(lambda: (
        db.table('crm_sends').select('id, step_id, status')))
    events = fetch_all_rows(lambda: (
        db.table('crm_email_events').select('send_id, event_type')
        .in_('event_type', ['open', 'click', 'bounce'])))

    send_step = {s['id']: s['step_id'] for s in sends}
    step_stats = {}
    for s in sends:
        stat = step_stats.setdefault(s['step_id'], {'sent': 0, 'opened': set(),
                                                    'clicked': set(), 'bounced': set()})
        if s['status'] == 'sent':
            stat['sent'] += 1
    for e in events:
        step_id = send_step.get(e.get('send_id'))
        if not step_id:
            continue
        stat = step_stats.setdefault(step_id, {'sent': 0, 'opened': set(),
                                               'clicked': set(), 'bounced': set()})
        bucket = {'open': 'opened', 'click': 'clicked', 'bounce': 'bounced'}[e['event_type']]
        stat[bucket].add(e['send_id'])

    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    month_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    summary = {
        'active_leads': (db.table('crm_leads').select('id', count='exact')
                         .eq('status', 'active').execute()).count or 0,
        'sends_7d': (db.table('crm_sends').select('id', count='exact')
                     .eq('status', 'sent').gte('sent_at', week_ago).execute()).count or 0,
        'conversions_30d': (db.table('crm_leads').select('id', count='exact')
                            .eq('status', 'converted').gte('converted_at', month_ago)
                            .execute()).count or 0,
        'suppressed': (db.table('crm_suppressions').select('id', count='exact')
                       .execute()).count or 0,
    }

    settings = (db.table('crm_settings').select('key, value')
                .eq('key', 'postal_address').execute()).data
    postal = settings[0]['value'] if settings else ''
    if isinstance(postal, dict):
        postal = postal.get('text', '')

    out = []
    for f in funnels:
        f_steps = steps_by_funnel.get(f['id'], [])
        f_members = [m for m in memberships if m['funnel_id'] == f['id']]
        exited = [m for m in f_members if m['status'] == 'exited']
        totals = {
            'active': sum(1 for m in f_members if m['status'] == 'active'),
            'completed': sum(1 for m in f_members if m['status'] == 'completed'),
            'converted': sum(1 for m in exited
                             if str(m.get('exit_reason') or '').startswith('converted')
                             or m.get('exit_reason') == 'import_converted'),
            'unsubscribed': sum(1 for m in exited
                                if m.get('exit_reason') in ('unsubscribed', 'suppressed')),
        }
        step_rows = []
        active_step_orders = sorted(s['step_order'] for s in f_steps if s['is_active'])
        for s in f_steps:
            waiting = 0
            if s['is_active']:
                for m in f_members:
                    if m['status'] != 'active':
                        continue
                    nxt = next((o for o in active_step_orders
                                if o > (m['last_step_sent'] or 0)), None)
                    if nxt == s['step_order']:
                        waiting += 1
            stat = step_stats.get(s['id'], {})
            step_rows.append({
                'id': s['id'], 'step_order': s['step_order'], 'name': s['name'],
                'delay_hours': s['delay_hours'], 'is_active': s['is_active'],
                'active_leads': waiting,
                'sent': stat.get('sent', 0),
                'opened': len(stat.get('opened', ())),
                'clicked': len(stat.get('clicked', ())),
                'bounced': len(stat.get('bounced', ())),
            })
        out.append({
            'id': f['id'], 'key': f['key'], 'name': f['name'],
            'status': f['status'], 'funnel_type': f['funnel_type'],
            'entry_types': f.get('entry_types') or [],
            'totals': totals, 'steps': step_rows,
            # The pipeline card reads these two shapes (crmApi contract).
            'active_leads': totals['active'],
            'exits': {'converted': totals['converted'],
                      'completed': totals['completed'],
                      'unsubscribed': totals['unsubscribed']},
        })

    return jsonify({'summary': summary, 'funnels': out,
                    'postal_address_missing': not str(postal).strip()})


# ----------------------------------------------------------------- funnels

def _entry_type_conflicts(db, entry_types, exclude_funnel_id=None):
    """[(type, funnel_row)] for entry types already claimed by another funnel."""
    conflicts = []
    for t in entry_types or []:
        rows = (db.table('crm_funnels').select('id, name, entry_types')
                .contains('entry_types', [t]).neq('status', 'archived')
                .execute()).data or []
        for row in rows:
            if row['id'] != exclude_funnel_id:
                conflicts.append((t, row))
    return conflicts


def _steal_entry_types(db, conflicts):
    for t, row in conflicts:
        remaining = [x for x in (row.get('entry_types') or []) if x != t]
        db.table('crm_funnels').update({
            'entry_types': remaining, 'updated_at': _now_iso(),
        }).eq('id', row['id']).execute()


@bp.route('/funnels', methods=['GET'])
@require_superadmin
def list_funnels(user_id):
    db = _db()
    funnels = (db.table('crm_funnels').select('*')
               .neq('status', 'archived').order('created_at').execute()).data or []
    for f in funnels:
        f['step_count'] = (db.table('crm_funnel_steps').select('id', count='exact')
                           .eq('funnel_id', f['id']).execute()).count or 0
        f['active_leads'] = (db.table('crm_funnel_memberships')
                             .select('id', count='exact')
                             .eq('funnel_id', f['id']).eq('status', 'active')
                             .execute()).count or 0
    return jsonify({'funnels': funnels})


@bp.route('/funnels', methods=['POST'])
@require_superadmin
def create_funnel(user_id):
    db = _db()
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Name is required'}), 400
    key = (data.get('key') or name.lower().replace(' ', '_')).strip()
    entry_types = [t for t in (data.get('entry_types') or []) if t in VALID_CONTACT_TYPES]
    conflicts = _entry_type_conflicts(db, entry_types)
    if conflicts and not data.get('steal'):
        t, row = conflicts[0]
        return jsonify({'error': f"'{t}' already feeds funnel '{row['name']}'",
                        'conflicting_funnel': row['name']}), 409
    if conflicts:
        _steal_entry_types(db, conflicts)
    try:
        funnel = (db.table('crm_funnels').insert({
            'key': key, 'name': name,
            'description': data.get('description'),
            'funnel_type': data.get('funnel_type') or 'nurture',
            'status': 'paused',
            'entry_types': entry_types,
        }).execute()).data[0]
    except APIError as e:
        return jsonify({'error': f'Could not create funnel: {e.message}'}), 400
    _audit(user_id, 'crm_funnel_created', 'crm_funnel', funnel['id'], {'key': key})
    return jsonify({'funnel': funnel}), 201


@bp.route('/funnels/<funnel_id>', methods=['GET'])
@require_superadmin
def get_funnel(user_id, funnel_id):
    db = _db()
    rows = (db.table('crm_funnels').select('*').eq('id', funnel_id)
            .limit(1).execute()).data
    if not rows:
        return jsonify({'error': 'Funnel not found'}), 404
    funnel = rows[0]
    funnel['steps'] = (db.table('crm_funnel_steps').select('*')
                       .eq('funnel_id', funnel_id).order('step_order')
                       .execute()).data or []
    funnel['active_lead_count'] = (db.table('crm_funnel_memberships')
                                   .select('id', count='exact')
                                   .eq('funnel_id', funnel_id).eq('status', 'active')
                                   .execute()).count or 0
    return jsonify({'funnel': funnel})


@bp.route('/funnels/<funnel_id>', methods=['PUT'])
@require_superadmin
def update_funnel(user_id, funnel_id):
    db = _db()
    data = request.get_json(silent=True) or {}
    updates = {}
    for field in ('name', 'description', 'funnel_type'):
        if field in data:
            updates[field] = data[field]
    if 'status' in data:
        if data['status'] not in ('active', 'paused', 'archived'):
            return jsonify({'error': 'Invalid status'}), 400
        updates['status'] = data['status']
    if 'entry_types' in data:
        entry_types = [t for t in (data.get('entry_types') or [])
                       if t in VALID_CONTACT_TYPES]
        conflicts = _entry_type_conflicts(db, entry_types, exclude_funnel_id=funnel_id)
        if conflicts and not data.get('steal'):
            t, row = conflicts[0]
            return jsonify({'error': f"'{t}' already feeds funnel '{row['name']}'",
                            'conflicting_funnel': row['name']}), 409
        if conflicts:
            _steal_entry_types(db, conflicts)
        updates['entry_types'] = entry_types
    if not updates:
        return jsonify({'error': 'Nothing to update'}), 400
    updates['updated_at'] = _now_iso()
    rows = (db.table('crm_funnels').update(updates).eq('id', funnel_id)
            .execute()).data
    if not rows:
        return jsonify({'error': 'Funnel not found'}), 404
    _audit(user_id, 'crm_funnel_updated', 'crm_funnel', funnel_id,
           {'fields': sorted(updates)})
    return jsonify({'funnel': rows[0]})


@bp.route('/funnels/<funnel_id>/status', methods=['POST'])
@require_superadmin
def set_funnel_status(user_id, funnel_id):
    status = (request.get_json(silent=True) or {}).get('status')
    if status not in ('active', 'paused'):
        return jsonify({'error': "status must be 'active' or 'paused'"}), 400
    rows = (_db().table('crm_funnels').update({
        'status': status, 'updated_at': _now_iso(),
    }).eq('id', funnel_id).execute()).data
    if not rows:
        return jsonify({'error': 'Funnel not found'}), 404
    _audit(user_id, f'crm_funnel_{status}', 'crm_funnel', funnel_id)
    return jsonify({'funnel': rows[0]})


@bp.route('/funnels/<funnel_id>', methods=['DELETE'])
@require_superadmin
def delete_funnel(user_id, funnel_id):
    db = _db()
    active = (db.table('crm_funnel_memberships').select('id', count='exact')
              .eq('funnel_id', funnel_id).eq('status', 'active').execute()).count or 0
    if active:
        return jsonify({'error': f'{active} leads are mid-funnel; pause or move '
                                 'them first'}), 409
    db.table('crm_funnels').delete().eq('id', funnel_id).execute()
    _audit(user_id, 'crm_funnel_deleted', 'crm_funnel', funnel_id)
    return '', 204


# ------------------------------------------------------------------- steps

@bp.route('/funnels/<funnel_id>/steps', methods=['POST'])
@require_superadmin
def create_step(user_id, funnel_id):
    db = _db()
    data = request.get_json(silent=True) or {}
    existing = (db.table('crm_funnel_steps').select('step_order')
                .eq('funnel_id', funnel_id).order('step_order', desc=True)
                .limit(1).execute()).data
    next_order = (existing[0]['step_order'] + 1) if existing else 1
    try:
        step = (db.table('crm_funnel_steps').insert({
            'funnel_id': funnel_id,
            'step_order': next_order,
            'name': data.get('name') or f'Step {next_order}',
            'subject': data.get('subject') or 'New email',
            'html_body': data.get('html_body') or '<p>Hi {{first_name}},</p>',
            'text_body': data.get('text_body'),
            'delay_hours': int(data.get('delay_hours') or 24),
            'updated_by': user_id,
        }).execute()).data[0]
    except APIError as e:
        return jsonify({'error': f'Could not create step: {e.message}'}), 400
    _audit(user_id, 'crm_step_created', 'crm_funnel_step', step['id'],
           {'funnel_id': funnel_id})
    return jsonify({'step': step}), 201


@bp.route('/funnels/<funnel_id>/steps/reorder', methods=['POST'])
@require_superadmin
def reorder_steps(user_id, funnel_id):
    db = _db()
    step_ids = (request.get_json(silent=True) or {}).get('step_ids') or []
    current = (db.table('crm_funnel_steps').select('id')
               .eq('funnel_id', funnel_id).execute()).data or []
    if sorted(step_ids) != sorted(s['id'] for s in current):
        return jsonify({'error': 'step_ids must be exactly this funnel\'s steps'}), 400
    # Two passes so intermediate states never collide with UNIQUE(funnel_id, step_order).
    for i, step_id in enumerate(step_ids):
        db.table('crm_funnel_steps').update({'step_order': 1000 + i}) \
            .eq('id', step_id).execute()
    for i, step_id in enumerate(step_ids):
        db.table('crm_funnel_steps').update({
            'step_order': i + 1, 'updated_at': _now_iso(), 'updated_by': user_id,
        }).eq('id', step_id).execute()
    _audit(user_id, 'crm_steps_reordered', 'crm_funnel', funnel_id)
    steps = (db.table('crm_funnel_steps').select('*').eq('funnel_id', funnel_id)
             .order('step_order').execute()).data or []
    return jsonify({'steps': steps})


@bp.route('/steps/<step_id>', methods=['PUT'])
@require_superadmin
def update_step(user_id, step_id):
    data = request.get_json(silent=True) or {}
    updates = {}
    for field in ('name', 'subject', 'html_body', 'text_body'):
        if field in data:
            updates[field] = data[field]
    if 'delay_hours' in data:
        try:
            updates['delay_hours'] = max(0, int(data['delay_hours']))
        except (TypeError, ValueError):
            return jsonify({'error': 'delay_hours must be a number'}), 400
    if 'is_active' in data:
        updates['is_active'] = bool(data['is_active'])
    if not updates:
        return jsonify({'error': 'Nothing to update'}), 400
    updates['updated_at'] = _now_iso()
    updates['updated_by'] = user_id
    rows = (_db().table('crm_funnel_steps').update(updates).eq('id', step_id)
            .execute()).data
    if not rows:
        return jsonify({'error': 'Step not found'}), 404
    _audit(user_id, 'crm_step_updated', 'crm_funnel_step', step_id,
           {'fields': sorted(updates)})
    return jsonify({'step': rows[0]})


@bp.route('/steps/<step_id>', methods=['DELETE'])
@require_superadmin
def delete_step(user_id, step_id):
    db = _db()
    sends = (db.table('crm_sends').select('id', count='exact')
             .eq('step_id', step_id).execute()).count or 0
    if sends:
        return jsonify({'error': 'This step has send history; deactivate it '
                                 'instead (is_active=false)'}), 409
    db.table('crm_funnel_steps').delete().eq('id', step_id).execute()
    _audit(user_id, 'crm_step_deleted', 'crm_funnel_step', step_id)
    return '', 204


@bp.route('/steps/<step_id>/test-send', methods=['POST'])
@require_superadmin
def test_send_step(user_id, step_id):
    """Send this step (draft overrides allowed) to the requesting superadmin
    — never to an arbitrary address."""
    db = _db()
    data = request.get_json(silent=True) or {}
    rows = (db.table('crm_funnel_steps').select('*').eq('id', step_id)
            .limit(1).execute()).data
    if not rows:
        return jsonify({'error': 'Step not found'}), 404
    step = rows[0]
    subject = data.get('subject') or step['subject']
    html_body = data.get('html_body') or step['html_body']

    me = (db.table('users').select('email, first_name, last_name')
          .eq('id', user_id).limit(1).execute()).data
    if not me or not me[0].get('email'):
        return jsonify({'error': 'Could not resolve your email'}), 400
    my_email = me[0]['email']

    from services.crm_funnel_engine import render_step_content, _with_footer, \
        _marketing_footer
    sample = {'first_name': me[0].get('first_name') or 'Jordan',
              'last_name': me[0].get('last_name') or '', 'email': my_email}
    html = _with_footer(render_step_content(html_body, sample, '#'),
                        _marketing_footer('#', '[postal address]'))
    from services.email_service import email_service
    message_id = email_service.send_crm_email(
        to_email=my_email,
        subject=f"[TEST] {render_step_content(subject, sample, '#')}",
        html_body=html, funnel_key='test-send',
    )
    if message_id is None:
        return jsonify({'error': 'Send failed (is SENDGRID_API_KEY set?)'}), 502
    return jsonify({'sent_to': my_email})


# ------------------------------------------------------------------- leads

@bp.route('/leads', methods=['GET'])
@require_superadmin
def list_leads(user_id):
    db = _db()
    page = max(1, int(request.args.get('page', 1)))
    limit = min(100, max(1, int(request.args.get('limit', 25))))
    offset = (page - 1) * limit

    funnel_id = request.args.get('funnel_id')
    embed = ('crm_funnel_memberships!inner(funnel_id, status, last_step_sent, '
             'entered_at, last_sent_at, crm_funnels(name, key))') if funnel_id else \
            ('crm_funnel_memberships(funnel_id, status, last_step_sent, '
             'entered_at, last_sent_at, crm_funnels(name, key))')
    query = db.table('crm_leads').select(f'*, {embed}', count='exact')
    if funnel_id:
        query = query.eq('crm_funnel_memberships.funnel_id', funnel_id)
    if request.args.get('status'):
        query = query.eq('status', request.args['status'])
    if request.args.get('source'):
        query = query.eq('lead_type', request.args['source'])
    search = (request.args.get('search') or '').strip()
    if search:
        from utils.validation.sanitizers import pgrst_pattern
        if pgrst_pattern(search):
            query = query.or_(
                f'email.ilike.%{pgrst_pattern(search)}%,'
                f'first_name.ilike.%{pgrst_pattern(search)}%,'
                f'last_name.ilike.%{pgrst_pattern(search)}%')
    result = query.order('created_at', desc=True).range(offset, offset + limit - 1).execute()

    step_counts = {}
    for s in (db.table('crm_funnel_steps').select('funnel_id, id')
              .execute()).data or []:
        step_counts[s['funnel_id']] = step_counts.get(s['funnel_id'], 0) + 1

    leads = []
    for lead in result.data or []:
        memberships = lead.pop('crm_funnel_memberships', None) or []
        current = next((m for m in memberships if m['status'] == 'active'),
                       memberships[0] if memberships else None)
        funnel = (current or {}).get('crm_funnels') or {}
        leads.append({
            **{k: lead.get(k) for k in ('id', 'email', 'first_name', 'last_name',
                                        'status', 'lead_type', 'lead_source',
                                        'created_at')},
            'funnel_id': (current or {}).get('funnel_id'),
            'funnel_name': funnel.get('name'),
            'membership_status': (current or {}).get('status'),
            'current_step_order': ((current or {}).get('last_step_sent') or 0) + 1
                                  if current and current['status'] == 'active' else
                                  (current or {}).get('last_step_sent'),
            'step_count': step_counts.get((current or {}).get('funnel_id'), 0),
            'entered_at': (current or {}).get('entered_at'),
            'last_activity_at': (current or {}).get('last_sent_at')
                                or (current or {}).get('entered_at')
                                or lead.get('created_at'),
        })
    return jsonify({'leads': leads, 'total': result.count or 0})


@bp.route('/leads', methods=['POST'])
@require_superadmin
def create_lead(user_id):
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').lower().strip()
    if not email or '@' not in email:
        return jsonify({'error': 'A valid email is required'}), 400
    db = _db()
    from services.crm_service import _upsert_lead, _enter_funnel
    lead = _upsert_lead(db, email, first_name=data.get('first_name'),
                        last_name=data.get('last_name'), lead_source='manual')
    if not lead:
        return jsonify({'error': 'Could not create lead'}), 500
    if data.get('funnel_id'):
        funnel_rows = (db.table('crm_funnels').select('*')
                       .eq('id', data['funnel_id']).limit(1).execute()).data
        if funnel_rows:
            _enter_funnel(db, lead, funnel_rows[0], source='manual')
    _audit(user_id, 'crm_lead_created', 'crm_lead', lead['id'])
    return jsonify({'lead': lead}), 201


@bp.route('/leads/<lead_id>', methods=['GET'])
@require_superadmin
def get_lead(user_id, lead_id):
    db = _db()
    rows = (db.table('crm_leads').select('*').eq('id', lead_id)
            .limit(1).execute()).data
    if not rows:
        return jsonify({'error': 'Lead not found'}), 404
    lead = rows[0]

    memberships = (db.table('crm_funnel_memberships')
                   .select('*, crm_funnels(name, key, funnel_type)')
                   .eq('lead_id', lead_id).order('created_at', desc=True)
                   .execute()).data or []
    current = next((m for m in memberships if m['status'] == 'active'), None)

    sends = (db.table('crm_sends')
             .select('*, crm_funnel_steps(name, step_order)')
             .eq('lead_id', lead_id).order('created_at').execute()).data or []
    send_events = (db.table('crm_email_events')
                   .select('send_id, event_type, occurred_at')
                   .eq('lead_id', lead_id).execute()).data or []
    events = (db.table('crm_events').select('*')
              .eq('lead_id', lead_id).order('created_at').execute()).data or []

    events_by_send = {}
    for e in send_events:
        events_by_send.setdefault(e.get('send_id'), []).append(e)

    timeline = []
    for e in events:
        timeline.append({'type': e['event_type'], 'at': e['created_at'],
                         'detail': e.get('detail') or {}})
    for s in sends:
        step = s.get('crm_funnel_steps') or {}
        per = events_by_send.get(s['id'], [])
        first = {}
        for ev in per:
            key = ev['event_type']
            if key not in first or (ev.get('occurred_at') or '') < (first[key] or ''):
                first[key] = ev.get('occurred_at')
        timeline.append({
            'type': 'send', 'at': s.get('sent_at') or s['created_at'],
            'detail': {
                'step_name': step.get('name'), 'step_order': step.get('step_order'),
                'subject': s.get('subject'), 'status': s['status'],
                'error': s.get('error'),
                'opened_at': first.get('open'), 'clicked_at': first.get('click'),
                'bounced_at': first.get('bounce'),
            },
        })
    timeline.sort(key=lambda t: t['at'] or '', reverse=True)

    step_count = 0
    next_send_at = None
    if current:
        f_steps = (db.table('crm_funnel_steps').select('step_order, delay_hours')
                   .eq('funnel_id', current['funnel_id']).eq('is_active', True)
                   .order('step_order').execute()).data or []
        step_count = len(f_steps)
        nxt = next((s for s in f_steps
                    if s['step_order'] > (current['last_step_sent'] or 0)), None)
        if nxt:
            entered = datetime.fromisoformat(
                str(current['entered_at']).replace('Z', '+00:00'))
            next_send_at = (entered + timedelta(hours=nxt['delay_hours'])).isoformat()

    return jsonify({
        'lead': lead,
        'memberships': memberships,
        'current_membership': current,
        'step_count': step_count,
        'next_send_at': next_send_at,
        'timeline': timeline,
    })


@bp.route('/leads/<lead_id>/convert', methods=['POST'])
@require_superadmin
def convert_lead(user_id, lead_id):
    db = _db()
    rows = (db.table('crm_leads').select('*').eq('id', lead_id).limit(1).execute()).data
    if not rows:
        return jsonify({'error': 'Lead not found'}), 404
    from services.crm_service import _mark_converted_row
    _mark_converted_row(db, rows[0], 'manual')
    _audit(user_id, 'crm_lead_converted', 'crm_lead', lead_id)
    lead = (db.table('crm_leads').select('*').eq('id', lead_id).limit(1).execute()).data[0]
    return jsonify({'lead': lead})


@bp.route('/leads/<lead_id>/exit', methods=['POST'])
@require_superadmin
def exit_lead(user_id, lead_id):
    db = _db()
    memberships = (db.table('crm_funnel_memberships').select('id')
                   .eq('lead_id', lead_id).eq('status', 'active').execute()).data or []
    for m in memberships:
        db.table('crm_funnel_memberships').update({
            'status': 'exited', 'exit_reason': 'manual', 'exited_at': _now_iso(),
        }).eq('id', m['id']).execute()
    try:
        db.table('crm_events').insert({
            'lead_id': lead_id, 'event_type': 'exited', 'detail': {'by': 'admin'},
        }).execute()
    except Exception as e:  # noqa: BLE001
        logger.warning(f'CRM exit: event write failed: {e}')
    _audit(user_id, 'crm_lead_exited', 'crm_lead', lead_id)
    rows = (db.table('crm_leads').select('*').eq('id', lead_id).limit(1).execute()).data
    if not rows:
        return jsonify({'error': 'Lead not found'}), 404
    return jsonify({'lead': rows[0]})


@bp.route('/leads/<lead_id>/move', methods=['POST'])
@require_superadmin
def move_lead(user_id, lead_id):
    """Move a lead to a funnel/step. Exits any current membership (manual) and
    creates one positioned so the target step is the next due: entered_at is
    back-dated by the target's delay, and already-past delays drain at one
    email per day via the sweep throttle."""
    db = _db()
    data = request.get_json(silent=True) or {}
    funnel_id = data.get('funnel_id')
    step_order = int(data.get('step_order') or 1)
    lead_rows = (db.table('crm_leads').select('*').eq('id', lead_id)
                 .limit(1).execute()).data
    if not lead_rows:
        return jsonify({'error': 'Lead not found'}), 404
    funnel_rows = (db.table('crm_funnels').select('*').eq('id', funnel_id)
                   .limit(1).execute()).data
    if not funnel_rows:
        return jsonify({'error': 'Funnel not found'}), 404
    target = (db.table('crm_funnel_steps').select('delay_hours')
              .eq('funnel_id', funnel_id).eq('step_order', step_order)
              .limit(1).execute()).data
    if not target:
        return jsonify({'error': 'Step not found in that funnel'}), 404

    for m in (db.table('crm_funnel_memberships').select('id')
              .eq('lead_id', lead_id).eq('status', 'active').execute()).data or []:
        db.table('crm_funnel_memberships').update({
            'status': 'exited', 'exit_reason': 'manual', 'exited_at': _now_iso(),
        }).eq('id', m['id']).execute()

    entered_at = (datetime.now(timezone.utc)
                  - timedelta(hours=target[0]['delay_hours'])).isoformat()
    try:
        db.table('crm_funnel_memberships').insert({
            'lead_id': lead_id, 'funnel_id': funnel_id,
            'entered_at': entered_at, 'last_step_sent': step_order - 1,
        }).execute()
    except APIError as e:
        return jsonify({'error': f'Could not move lead: {e.message}'}), 409
    try:
        db.table('crm_events').insert({
            'lead_id': lead_id, 'event_type': 'moved',
            'detail': {'funnel_key': funnel_rows[0]['key'], 'step_order': step_order},
        }).execute()
    except Exception as e:  # noqa: BLE001
        logger.warning(f'CRM move: event write failed: {e}')
    _audit(user_id, 'crm_lead_moved', 'crm_lead', lead_id,
           {'funnel_id': funnel_id, 'step_order': step_order})
    return jsonify({'lead': lead_rows[0]})


@bp.route('/leads/<lead_id>/notes', methods=['POST'])
@require_superadmin
def add_lead_note(user_id, lead_id):
    body = ((request.get_json(silent=True) or {}).get('body') or '').strip()
    if not body:
        return jsonify({'error': 'Note body is required'}), 400
    db = _db()
    try:
        note = (db.table('crm_events').insert({
            'lead_id': lead_id, 'event_type': 'note',
            'detail': {'body': body, 'author_id': user_id},
        }).execute()).data[0]
    except APIError:
        return jsonify({'error': 'Lead not found'}), 404
    return jsonify({'note': note}), 201


# ------------------------------------------------------------ suppressions

@bp.route('/suppressions', methods=['GET'])
@require_superadmin
def list_suppressions(user_id):
    db = _db()
    page = max(1, int(request.args.get('page', 1)))
    limit = min(100, max(1, int(request.args.get('limit', 25))))
    offset = (page - 1) * limit
    query = db.table('crm_suppressions').select('*', count='exact')
    search = (request.args.get('search') or '').strip()
    if search:
        query = query.ilike('email', f'%{search}%')
    result = query.order('created_at', desc=True).range(offset, offset + limit - 1).execute()
    return jsonify({'entries': result.data or [], 'total': result.count or 0})


@bp.route('/suppressions', methods=['POST'])
@require_superadmin
def add_suppression(user_id):
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').lower().strip()
    if not email or '@' not in email:
        return jsonify({'error': 'A valid email is required'}), 400
    repo = _repo()
    # One shared path with the webhook and the unsubscribe link, so a
    # hand-added suppression leaves the lead in exactly the same state.
    if not repo.suppress(email, 'manual', source=f'admin:{user_id}'):
        return jsonify({'error': 'Already suppressed'}), 409
    entry = (_db().table('crm_suppressions').select('*')
             .eq('email', email).limit(1).execute()).data[0]
    _audit(user_id, 'crm_suppression_added', 'crm_suppression', entry['id'],
           {'email': email})
    return jsonify({'entry': entry}), 201


@bp.route('/suppressions/<suppression_id>', methods=['DELETE'])
@require_superadmin
def remove_suppression(user_id, suppression_id):
    repo = _repo()
    # Reopen the lead too. Without this the row leaves the suppression list
    # but the lead stays status='suppressed' forever, which every funnel
    # entry gate reads as "never mail this person" — an un-suppress that
    # un-suppresses nothing.
    entry = repo.find_suppression(suppression_id)
    _db().table('crm_suppressions').delete().eq('id', suppression_id).execute()
    if entry:
        repo.unsuppress(entry['email'])
    _audit(user_id, 'crm_suppression_removed', 'crm_suppression', suppression_id)
    return '', 204


# ------------------------------------------------------------------- sweep

@bp.route('/sweep/run', methods=['POST'])
@require_superadmin
def run_sweep_now(user_id):
    from services.crm_funnel_engine import run_sweep
    _audit(user_id, 'crm_sweep_manual', 'crm_sweep', 'manual')
    return jsonify({'success': True, **run_sweep()})
