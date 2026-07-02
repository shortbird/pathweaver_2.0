"""
SIS (Student Information System) routes — microschool management console API.

All endpoints are NEW and additive (prefix /api/sis); they never alter existing
routes. Access is gated to staff roles (org_admin, advisor, superadmin); superadmin
is always allowed (require_role grants it implicitly). Org scoping is enforced via
SisService.resolve_org_id — non-superadmins can only ever touch their own org.

Reuses existing infrastructure where possible: family announcements/messaging go
through the existing /api/announcements endpoint (the SIS console calls it directly),
so this module focuses on roster, households, enrollment, emergency contacts, and
the SIS dashboard + CSV reports.
"""

import csv
import io

from flask import Blueprint, request, jsonify, Response

from utils.auth.decorators import require_role
from utils.logger import get_logger
from services import sis_service
from repositories.household_repository import HouseholdRepository
from database import get_supabase_admin_client

logger = get_logger(__name__)

bp = Blueprint('sis', __name__, url_prefix='/api/sis')

STAFF_ROLES = ('org_admin', 'advisor', 'superadmin')


def _org_or_error(user_id):
    """Resolve the org for this request or return (None, error_response).

    Accepts organization_id from the query string OR a JSON body (get_json(silent)
    so a DELETE/GET with no JSON body never raises UnsupportedMediaType).
    """
    body = request.get_json(silent=True) or {}
    requested = request.args.get('organization_id') or body.get('organization_id')
    org_id = sis_service.resolve_org_id(user_id, requested)
    if not org_id:
        return None, (jsonify({
            'success': False,
            'error': 'No organization in context. Superadmins must pass ?organization_id.'
        }), 400)
    return org_id, None


@bp.route('/dashboard', methods=['GET'])
@require_role(*STAFF_ROLES)
def dashboard(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'data': sis_service.get_dashboard(org_id)})


@bp.route('/roster', methods=['GET'])
@require_role(*STAFF_ROLES)
def roster(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'roster': sis_service.get_roster(org_id)})


@bp.route('/members', methods=['GET'])
@require_role(*STAFF_ROLES)
def org_members(user_id):
    """Everyone in the org (for household assignment pickers)."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'members': sis_service.list_org_members(org_id)})


@bp.route('/staff', methods=['GET'])
@require_role(*STAFF_ROLES)
def org_staff(user_id):
    """Org staff (org_admin / advisor) for the SIS Staff page."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'staff': sis_service.list_org_staff(org_id)})


@bp.route('/staff', methods=['POST'])
@require_role(*STAFF_ROLES)
def create_teacher(user_id):
    """Add a teacher (advisor) to the org: creates the account + sends the
    set-password email. Accepts first_name, last_name, email, bio."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = sis_service.create_org_teacher(org_id, request.get_json() or {})
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result}), 201


@bp.route('/staff/<staff_id>', methods=['PATCH'])
@require_role(*STAFF_ROLES)
def update_staff(user_id, staff_id):
    """Edit a staff member's profile (name, email, bio)."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    updated = sis_service.update_staff_member(org_id, staff_id, request.get_json() or {})
    if updated is None:
        return jsonify({'success': False, 'error': 'Staff member not found'}), 404
    return jsonify({'success': True, 'staff': updated})


@bp.route('/staff/<staff_id>/photo', methods=['POST'])
@require_role(*STAFF_ROLES)
def upload_staff_photo(user_id, staff_id):
    """Upload (or replace) a staff member's photo. Stores avatar_url on the user."""
    import uuid as _uuid
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    supabase = get_supabase_admin_client()
    row = (
        supabase.table('users').select('id, organization_id, avatar_url')
        .eq('id', staff_id).limit(1).execute()
    ).data
    if not row or row[0].get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Staff member not found'}), 404

    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No file provided'}), 400
    file = request.files['file']
    if not file.filename:
        return jsonify({'success': False, 'error': 'No file selected'}), 400
    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    if ext not in ('jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'):
        return jsonify({'success': False, 'error': 'Invalid file type'}), 400
    file.seek(0, 2)
    if file.tell() > 5 * 1024 * 1024:
        return jsonify({'success': False, 'error': 'File size exceeds 5MB limit'}), 400
    file.seek(0)

    bucket = 'staff-photos'
    try:
        if not supabase.storage.get_bucket(bucket):
            supabase.storage.create_bucket(bucket, options={'public': True})
    except Exception:
        try:
            supabase.storage.create_bucket(bucket, options={'public': True})
        except Exception:
            pass
    path = f"{staff_id}/{_uuid.uuid4().hex}.{ext}"
    old = row[0].get('avatar_url')
    if old and f'{bucket}/' in old:
        try:
            supabase.storage.from_(bucket).remove([old.split(f'{bucket}/')[-1]])
        except Exception:
            pass
    try:
        supabase.storage.from_(bucket).upload(
            path=path, file=file.read(),
            file_options={'content-type': file.content_type or f'image/{ext}'},
        )
        avatar_url = supabase.storage.from_(bucket).get_public_url(path)
    except Exception as e:
        logger.error(f"Error uploading staff photo: {e}")
        return jsonify({'success': False, 'error': 'Failed to upload photo'}), 500

    supabase.table('users').update({'avatar_url': avatar_url}).eq('id', staff_id).execute()
    return jsonify({'success': True, 'avatar_url': avatar_url})


# ── Households ───────────────────────────────────────────────────────────────
@bp.route('/households', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_households(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'households': sis_service.households_with_members(org_id)})


@bp.route('/households', methods=['POST'])
@require_role(*STAFF_ROLES)
def create_household(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'success': False, 'error': 'Household name is required'}), 400
    repo = HouseholdRepository(client=get_supabase_admin_client())
    fields = {k: data.get(k) for k in (
        'name', 'primary_contact_user_id', 'address_line1', 'address_line2',
        'city', 'state', 'postal_code', 'phone', 'notes'
    ) if data.get(k) is not None}
    fields['name'] = name
    household = repo.create(org_id, fields)
    return jsonify({'success': True, 'household': household}), 201


@bp.route('/households/<household_id>', methods=['PATCH'])
@require_role(*STAFF_ROLES)
def update_household(user_id, household_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    repo = HouseholdRepository(client=get_supabase_admin_client())
    existing = repo.find_by_id(household_id)
    if not existing or existing.get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Household not found'}), 404
    fields = {k: data.get(k) for k in (
        'name', 'primary_contact_user_id', 'address_line1', 'address_line2',
        'city', 'state', 'postal_code', 'phone', 'notes', 'image_url'
    ) if k in data}
    return jsonify({'success': True, 'household': repo.update(household_id, fields)})


@bp.route('/households/<household_id>', methods=['DELETE'])
@require_role(*STAFF_ROLES)
def delete_household(user_id, household_id):
    """Delete a family. Removes the household + its member links; the students,
    guardians, and their own records keep their accounts."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    supabase = get_supabase_admin_client()
    repo = HouseholdRepository(client=supabase)
    existing = repo.find_by_id(household_id)
    if not existing or existing.get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Household not found'}), 404
    supabase.table('household_members').delete().eq('household_id', household_id).execute()
    supabase.table('households').delete().eq('id', household_id).execute()
    return jsonify({'success': True})


@bp.route('/households/<household_id>/image', methods=['POST'])
@require_role(*STAFF_ROLES)
def upload_household_image(user_id, household_id):
    """Upload (or replace) a family photo. Stores image_url on the household."""
    import uuid as _uuid
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    supabase = get_supabase_admin_client()
    repo = HouseholdRepository(client=supabase)
    existing = repo.find_by_id(household_id)
    if not existing or existing.get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Household not found'}), 404

    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No file provided'}), 400
    file = request.files['file']
    if not file.filename:
        return jsonify({'success': False, 'error': 'No file selected'}), 400
    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    if ext not in ('jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'):
        return jsonify({'success': False, 'error': 'Invalid file type'}), 400
    file.seek(0, 2)
    if file.tell() > 5 * 1024 * 1024:
        return jsonify({'success': False, 'error': 'File size exceeds 5MB limit'}), 400
    file.seek(0)

    bucket = 'family-images'
    try:
        if not supabase.storage.get_bucket(bucket):
            supabase.storage.create_bucket(bucket, options={'public': True})
    except Exception:
        try:
            supabase.storage.create_bucket(bucket, options={'public': True})
        except Exception:
            pass
    path = f"{household_id}/{_uuid.uuid4().hex}.{ext}"
    old = existing.get('image_url')
    if old and f'{bucket}/' in old:
        try:
            supabase.storage.from_(bucket).remove([old.split(f'{bucket}/')[-1]])
        except Exception:
            pass
    try:
        supabase.storage.from_(bucket).upload(
            path=path, file=file.read(),
            file_options={'content-type': file.content_type or f'image/{ext}'},
        )
        image_url = supabase.storage.from_(bucket).get_public_url(path)
    except Exception as e:
        logger.error(f"Error uploading family image: {e}")
        return jsonify({'success': False, 'error': 'Failed to upload image'}), 500

    updated = repo.update(household_id, {'image_url': image_url})
    return jsonify({'success': True, 'image_url': image_url, 'household': updated})


@bp.route('/households/<household_id>/members', methods=['POST'])
@require_role(*STAFF_ROLES)
def add_household_member(user_id, household_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    member_user_id = data.get('user_id')
    if not member_user_id:
        return jsonify({'success': False, 'error': 'user_id is required'}), 400
    repo = HouseholdRepository(client=get_supabase_admin_client())
    existing = repo.find_by_id(household_id)
    if not existing or existing.get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Household not found'}), 404
    member = repo.add_member(
        household_id, member_user_id,
        relationship=data.get('relationship', 'student'),
        is_primary_guardian=bool(data.get('is_primary_guardian')),
    )
    return jsonify({'success': True, 'member': member}), 201


@bp.route('/households/<household_id>/members/<member_user_id>', methods=['DELETE'])
@require_role(*STAFF_ROLES)
def remove_household_member(user_id, household_id, member_user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    repo = HouseholdRepository(client=get_supabase_admin_client())
    existing = repo.find_by_id(household_id)
    if not existing or existing.get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Household not found'}), 404
    repo.remove_member(household_id, member_user_id)
    return jsonify({'success': True})


# ── Enrollment lifecycle ─────────────────────────────────────────────────────
@bp.route('/enrollments/<student_id>', methods=['PATCH'])
@require_role(*STAFF_ROLES)
def update_enrollment(user_id, student_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    status = data.get('status')
    if status and status not in sis_service.ENROLLMENT_STATUSES:
        return jsonify({'success': False, 'error': f'Invalid status: {status}'}), 400
    enrollment = sis_service.upsert_enrollment(org_id, student_id, data)
    return jsonify({'success': True, 'enrollment': enrollment})


# ── Student account admin (edit profile, message guardians) ──────────────────
@bp.route('/students/<student_id>', methods=['PATCH'])
@require_role(*STAFF_ROLES)
def update_student(user_id, student_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.get_json() or {}
    updated = sis_service.update_student_profile(org_id, student_id, data)
    if updated is None:
        return jsonify({'success': False, 'error': 'Student not found'}), 404
    return jsonify({'success': True, 'student': updated})


@bp.route('/users/<target_id>', methods=['GET'])
@require_role(*STAFF_ROLES)
def get_org_user(user_id, target_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    u = sis_service.get_org_user(org_id, target_id)
    if not u:
        return jsonify({'success': False, 'error': 'User not found'}), 404
    return jsonify({'success': True, 'user': u})


@bp.route('/users/<target_id>/role', methods=['PATCH'])
@require_role(*STAFF_ROLES)
def update_user_role(user_id, target_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    role = (request.get_json() or {}).get('role')
    result = sis_service.update_user_role(org_id, target_id, role)
    if result.get('error'):
        code = 404 if result['error'] == 'User not found' else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result})


@bp.route('/students/<student_id>', methods=['GET'])
@require_role(*STAFF_ROLES)
def get_student(user_id, student_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    student = sis_service.get_student(org_id, student_id)
    if not student:
        return jsonify({'success': False, 'error': 'Student not found'}), 404
    return jsonify({'success': True, 'student': student})


@bp.route('/students/<student_id>/classes', methods=['GET'])
@require_role(*STAFF_ROLES)
def student_classes(user_id, student_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if not sis_service.student_in_org(student_id, org_id):
        return jsonify({'success': False, 'error': 'Student not found'}), 404
    return jsonify({'success': True, 'classes': sis_service.list_student_classes(org_id, student_id)})


@bp.route('/students/<student_id>/message', methods=['POST'])
@require_role(*STAFF_ROLES)
def message_student(user_id, student_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if not sis_service.student_in_org(student_id, org_id):
        return jsonify({'success': False, 'error': 'Student not found'}), 404
    data = request.get_json() or {}
    body = (data.get('body') or '').strip()
    if not body:
        return jsonify({'success': False, 'error': 'Message body is required'}), 400
    try:
        result = sis_service.message_student(student_id, user_id, (data.get('subject') or '').strip(), body)
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 403
    return jsonify({'success': True, **result})


# ── Emergency contacts ───────────────────────────────────────────────────────
@bp.route('/students/<student_id>/emergency-contacts', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_emergency_contacts(user_id, student_id):
    return jsonify({'success': True, 'contacts': sis_service.list_emergency_contacts(student_id)})


@bp.route('/students/<student_id>/emergency-contacts', methods=['POST'])
@require_role(*STAFF_ROLES)
def add_emergency_contact(user_id, student_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    if not (data.get('name') or '').strip():
        return jsonify({'success': False, 'error': 'Contact name is required'}), 400
    contact = sis_service.add_emergency_contact(student_id, org_id, data)
    return jsonify({'success': True, 'contact': contact}), 201


@bp.route('/emergency-contacts/<contact_id>', methods=['DELETE'])
@require_role(*STAFF_ROLES)
def delete_emergency_contact(user_id, contact_id):
    sis_service.delete_emergency_contact(contact_id)
    return jsonify({'success': True})


@bp.route('/students/<student_id>/emergency-contacts/copy-from-family', methods=['POST'])
@require_role(*STAFF_ROLES)
def copy_family_contacts(user_id, student_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if not sis_service.student_in_org(student_id, org_id):
        return jsonify({'success': False, 'error': 'Student not found'}), 404
    return jsonify({'success': True, **sis_service.copy_family_contacts_to_student(org_id, student_id)})


@bp.route('/households/<household_id>/message', methods=['POST'])
@require_role(*STAFF_ROLES)
def message_household(user_id, household_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    repo = HouseholdRepository(client=get_supabase_admin_client())
    existing = repo.find_by_id(household_id)
    if not existing or existing.get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Household not found'}), 404
    data = request.get_json() or {}
    body = (data.get('body') or '').strip()
    if not body:
        return jsonify({'success': False, 'error': 'Message body is required'}), 400
    result = sis_service.message_household_guardians(org_id, household_id, user_id, (data.get('subject') or '').strip(), body)
    return jsonify({'success': True, **result})


# ── Family (household) emergency contacts — shared across the family's students ─
@bp.route('/households/<household_id>/emergency-contacts', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_household_contacts(user_id, household_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'contacts': sis_service.household_emergency_contacts(org_id, household_id)})


@bp.route('/households/<household_id>/registration', methods=['GET'])
@require_role(*STAFF_ROLES)
def get_household_registration(user_id, household_id):
    """Latest iCreate registration submitted by this household's guardians
    (answers, signatures, kids, fee). registration is null when none exists."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'registration': sis_service.household_registration(org_id, household_id)})


@bp.route('/households/<household_id>/emergency-contacts', methods=['POST'])
@require_role(*STAFF_ROLES)
def add_household_contact(user_id, household_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    if not (data.get('name') or '').strip():
        return jsonify({'success': False, 'error': 'Contact name is required'}), 400
    result = sis_service.add_household_emergency_contact(org_id, household_id, data)
    return jsonify({'success': True, **result,
                    'contacts': sis_service.household_emergency_contacts(org_id, household_id)}), 201


@bp.route('/households/<household_id>/emergency-contacts/delete', methods=['POST'])
@require_role(*STAFF_ROLES)
def remove_household_contact(user_id, household_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    ids = (request.json or {}).get('ids') or []
    sis_service.remove_household_emergency_contacts(ids)
    return jsonify({'success': True, 'contacts': sis_service.household_emergency_contacts(org_id, household_id)})


# ── Reports ──────────────────────────────────────────────────────────────────
@bp.route('/reports/roster.csv', methods=['GET'])
@require_role(*STAFF_ROLES)
def roster_csv(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    roster = sis_service.get_roster(org_id)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(['Name', 'Email', 'Username', 'Enrollment Status',
                     'Grade Level', 'Household', 'Total XP', 'Last Active'])
    for r in roster:
        writer.writerow([
            r['name'], r.get('email') or '', r.get('username') or '',
            r['enrollment_status'], r.get('grade_level') or '',
            r.get('household_name') or '', r.get('total_xp') or 0,
            r.get('last_active') or '',
        ])
    return Response(
        buf.getvalue(),
        mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename=roster.csv'},
    )


def register_sis_routes(app):
    """Register the SIS blueprints (MVP + catalog/programs+classes)."""
    app.register_blueprint(bp)
    from routes.sis.catalog import bp as catalog_bp
    app.register_blueprint(catalog_bp)
    from routes.sis.registration import bp as registration_bp
    app.register_blueprint(registration_bp)
    from routes.sis.waitlist import bp as waitlist_bp
    app.register_blueprint(waitlist_bp)
    from routes.sis.billing import bp as billing_bp
    app.register_blueprint(billing_bp)
    from routes.sis.attendance import bp as attendance_bp
    app.register_blueprint(attendance_bp)
    from routes.sis.reports import bp as reports_bp
    app.register_blueprint(reports_bp)
    from routes.sis.parent import bp as parent_bp
    app.register_blueprint(parent_bp)
