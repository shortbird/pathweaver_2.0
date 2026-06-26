"""
SIS Registration service — multi-step, resumable, per-student registration.

Composes DB reads with the pure rules in services/sis_eligibility.py. Completing a
registration is the bridge from SIS registration to LMS delivery: it creates the
real class_enrollments rows (so the student starts receiving the class's quests) and
upserts school_enrollments to 'enrolled'. Full classes with waitlist enabled produce
a 'waitlisted' item instead (the ordered waitlist queue is Phase 4).

Admin (service_role) client throughout — SIS tables are RLS-locked to backend-only,
same justification as sis_service.py.
"""

from datetime import datetime, timezone
from typing import Dict, List, Any, Optional

from database import get_supabase_admin_client
from repositories.sis_class_repository import SisClassRepository
from services import sis_eligibility as elig
from utils.logger import get_logger

logger = get_logger(__name__)

REGISTRATION_STATUSES = ('draft', 'in_progress', 'submitted', 'completed', 'cancelled')
ITEM_STATUSES = ('selected', 'enrolled', 'waitlisted', 'dropped')


def _admin():
    return get_supabase_admin_client()


def _now():
    return datetime.now(timezone.utc).isoformat()


def _classes_repo():
    return SisClassRepository(client=_admin())


def _student_name(u: Dict[str, Any]) -> str:
    name = (u.get('display_name') or
            f"{u.get('first_name') or ''} {u.get('last_name') or ''}").strip()
    return name or (u.get('username') or u.get('email') or 'Unnamed')


# ── CRUD ─────────────────────────────────────────────────────────────────────
def create_registration(org_id: str, student_user_id: str,
                        guardian_user_id: Optional[str] = None,
                        household_id: Optional[str] = None) -> Dict[str, Any]:
    payload = {
        'organization_id': org_id,
        'student_user_id': student_user_id,
        'guardian_user_id': guardian_user_id,
        'household_id': household_id,
        'status': 'draft',
    }
    resp = _admin().table('sis_registrations').insert(payload).execute()
    return resp.data[0] if resp.data else None


def update_registration(org_id: str, reg_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    payload = {k: fields[k] for k in ('current_step', 'notes', 'status', 'household_id', 'guardian_user_id')
               if k in fields}
    if not payload:
        return get_registration(org_id, reg_id)
    payload['updated_at'] = _now()
    resp = (
        _admin().table('sis_registrations')
        .update(payload).eq('id', reg_id).eq('organization_id', org_id)
        .execute()
    )
    return resp.data[0] if resp.data else None


def _items_for(reg_id: str) -> List[Dict[str, Any]]:
    return (
        _admin().table('sis_registration_items')
        .select('*').eq('registration_id', reg_id).execute()
    ).data or []


def list_registrations(org_id: str, status: Optional[str] = None) -> List[Dict[str, Any]]:
    query = _admin().table('sis_registrations').select('*').eq('organization_id', org_id)
    if status:
        query = query.eq('status', status)
    regs = query.order('created_at', desc=True).execute().data or []
    if not regs:
        return []
    # hydrate student names + item counts
    student_ids = list({r['student_user_id'] for r in regs})
    users = {
        u['id']: u for u in (
            _admin().table('users')
            .select('id, display_name, first_name, last_name, username, email')
            .in_('id', student_ids).execute()
        ).data or []
    }
    reg_ids = [r['id'] for r in regs]
    items = (
        _admin().table('sis_registration_items')
        .select('registration_id').in_('registration_id', reg_ids).execute()
    ).data or []
    counts: Dict[str, int] = {}
    for it in items:
        counts[it['registration_id']] = counts.get(it['registration_id'], 0) + 1
    for r in regs:
        r['student_name'] = _student_name(users.get(r['student_user_id'], {}))
        r['item_count'] = counts.get(r['id'], 0)
    return regs


def get_registration(org_id: str, reg_id: str) -> Optional[Dict[str, Any]]:
    reg = (
        _admin().table('sis_registrations')
        .select('*').eq('id', reg_id).eq('organization_id', org_id).limit(1)
        .execute()
    ).data
    if not reg:
        return None
    reg = reg[0]
    items = _items_for(reg_id)
    # hydrate class names
    class_ids = [it['class_id'] for it in items]
    classes = {}
    if class_ids:
        classes = {
            c['id']: c for c in (
                _admin().table('org_classes').select('id, name, price_cents, capacity')
                .in_('id', class_ids).execute()
            ).data or []
        }
    for it in items:
        c = classes.get(it['class_id'], {})
        it['class_name'] = c.get('name')
    reg['items'] = items
    student = (
        _admin().table('users')
        .select('id, display_name, first_name, last_name, username, email')
        .eq('id', reg['student_user_id']).limit(1).execute()
    ).data
    reg['student_name'] = _student_name(student[0]) if student else None
    return reg


# ── Items + eligibility ──────────────────────────────────────────────────────
def _student_satisfied_class_ids(student_user_id: str) -> set:
    rows = (
        _admin().table('class_enrollments')
        .select('class_id, status').eq('student_id', student_user_id)
        .in_('status', ['active', 'completed']).execute()
    ).data or []
    return {r['class_id'] for r in rows}


def _student_existing_meetings(student_user_id: str, exclude_class_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Meetings of every class the student is actively enrolled in (for conflict checks)."""
    enr = (
        _admin().table('class_enrollments')
        .select('class_id').eq('student_id', student_user_id).eq('status', 'active')
        .execute()
    ).data or []
    class_ids = [e['class_id'] for e in enr if e['class_id'] != exclude_class_id]
    if not class_ids:
        return []
    return _classes_repo().meetings_for_classes(class_ids)


def evaluate_eligibility(org_id: str, class_id: str, student_user_id: str) -> Dict[str, Any]:
    repo = _classes_repo()
    klass = repo.find_by_id(class_id)
    if not klass or klass.get('organization_id') != org_id:
        return {'error': 'Class not found'}
    student = (
        _admin().table('users').select('id, date_of_birth')
        .eq('id', student_user_id).limit(1).execute()
    ).data
    dob = student[0].get('date_of_birth') if student else None
    enrolled = repo.active_enrollment_count(class_id)
    prerequisites = repo.list_prerequisites(class_id)
    satisfied = _student_satisfied_class_ids(student_user_id)
    prospective = repo.list_meetings(class_id)
    existing = _student_existing_meetings(student_user_id, exclude_class_id=class_id)
    return elig.evaluate(
        student_dob=dob, klass=klass, enrolled=enrolled,
        prerequisites=prerequisites, satisfied_class_ids=satisfied,
        prospective_meetings=prospective, existing_meetings=existing,
    )


def add_item(org_id: str, reg_id: str, class_id: str) -> Dict[str, Any]:
    """Add a class to a registration. Returns the item + soft-eligibility eval."""
    reg = get_registration(org_id, reg_id)
    if not reg:
        return {'error': 'Registration not found'}
    repo = _classes_repo()
    klass = repo.find_by_id(class_id)
    if not klass or klass.get('organization_id') != org_id:
        return {'error': 'Class not found'}
    evaluation = evaluate_eligibility(org_id, class_id, reg['student_user_id'])
    payload = {
        'registration_id': reg_id,
        'class_id': class_id,
        'program_id': klass.get('program_id'),
        'status': 'selected',
        'price_snapshot_cents': klass.get('price_cents'),
    }
    resp = (
        _admin().table('sis_registration_items')
        .upsert(payload, on_conflict='registration_id,class_id').execute()
    )
    # bump the registration out of 'draft' once it has a selection
    if reg.get('status') == 'draft':
        update_registration(org_id, reg_id, {'status': 'in_progress'})
    return {'item': resp.data[0] if resp.data else None, 'evaluation': evaluation}


def remove_item(reg_id: str, item_id: str) -> None:
    (
        _admin().table('sis_registration_items')
        .delete().eq('id', item_id).eq('registration_id', reg_id).execute()
    )


def submit(org_id: str, reg_id: str) -> Optional[Dict[str, Any]]:
    resp = (
        _admin().table('sis_registrations')
        .update({'status': 'submitted', 'submitted_at': _now(), 'updated_at': _now()})
        .eq('id', reg_id).eq('organization_id', org_id).execute()
    )
    return resp.data[0] if resp.data else None


def complete(org_id: str, reg_id: str, completed_by: str) -> Dict[str, Any]:
    """
    Finalize: enroll the student into each selected class (or waitlist if full),
    upsert their school enrollment to 'enrolled', and mark the registration complete.
    """
    reg = get_registration(org_id, reg_id)
    if not reg:
        return {'error': 'Registration not found'}
    student_id = reg['student_user_id']
    repo = _classes_repo()
    results = []
    for item in reg.get('items', []):
        if item['status'] not in ('selected', 'waitlisted'):
            continue
        klass = repo.find_by_id(item['class_id'])
        if not klass:
            continue
        enrolled = repo.active_enrollment_count(item['class_id'])
        if elig.is_full(klass.get('capacity'), enrolled) and klass.get('waitlist_enabled', True):
            new_status = 'waitlisted'
            from services import sis_waitlist_service
            sis_waitlist_service.add_to_waitlist(org_id, item['class_id'], student_id)
        else:
            # create the LMS enrollment (idempotent on class_id+student_id)
            _admin().table('class_enrollments').upsert({
                'class_id': item['class_id'],
                'student_id': student_id,
                'status': 'active',
                'enrolled_by': completed_by,
            }, on_conflict='class_id,student_id').execute()
            new_status = 'enrolled'
        _admin().table('sis_registration_items').update(
            {'status': new_status, 'updated_at': _now()}
        ).eq('id', item['id']).execute()
        results.append({'class_id': item['class_id'], 'status': new_status})

    # school enrollment lifecycle -> enrolled
    _admin().table('school_enrollments').upsert({
        'organization_id': org_id,
        'student_user_id': student_id,
        'status': 'enrolled',
        'updated_at': _now(),
    }, on_conflict='organization_id,student_user_id').execute()

    resp = (
        _admin().table('sis_registrations')
        .update({'status': 'completed', 'completed_at': _now(),
                 'completed_by': completed_by, 'updated_at': _now()})
        .eq('id', reg_id).eq('organization_id', org_id).execute()
    )

    # Notify the guardian (best-effort) that enrollment is confirmed.
    enrolled_count = sum(1 for r in results if r['status'] == 'enrolled')
    waitlisted_count = sum(1 for r in results if r['status'] == 'waitlisted')
    from services import sis_notifications
    summary = f'{enrolled_count} class(es) enrolled'
    if waitlisted_count:
        summary += f', {waitlisted_count} waitlisted'
    sis_notifications.notify(
        reg.get('guardian_user_id'),
        'Registration confirmed',
        f'Registration is complete: {summary}.',
        organization_id=org_id,
    )

    return {'registration': resp.data[0] if resp.data else None, 'results': results}
