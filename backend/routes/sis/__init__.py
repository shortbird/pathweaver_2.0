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
from utils.auth.relationships import require_relationship_to
from utils.logger import get_logger
from utils import person_name
from services import sis_service
from services import sis_staff_service
from services import sis_payment_profile
from repositories.household_repository import HouseholdRepository
from database import get_supabase_admin_client
from utils.sis_roles import STAFF_ROLES, ADMIN_ROLES, FINANCE_ROLES, ROLE_GRANT_ROLES
from utils.storage_urls import (
    parse_object_ref,
    public_object_url,
    sign_in_place,
    sign_stored_url,
)

logger = get_logger(__name__)

bp = Blueprint('sis', __name__, url_prefix='/api/sis')

# All staff (admins see everything; advisors get the scoped teacher portal).
# Imported by events.py for the read-only calendar endpoints.
# The admin tier: every endpoint in THIS file is org-management (households,
# registration data, staff accounts, full roster) — teacher-scoped equivalents
# live in routes/sis/staff_portal.py.


def _org_or_error(user_id):
    """Resolve the org for this request or return (None, error_response).

    Accepts organization_id from the query string, a JSON body (get_json(silent)
    so a DELETE/GET with no JSON body never raises UnsupportedMediaType), OR a
    multipart form field.

    The form field is not optional polish: a file upload is multipart, so
    get_json returns nothing and the org the SIS org picker sent arrives only in
    request.form. Every org-scoped caller was insulated from that because
    resolve_org_id falls back to their own organization_id — but a superadmin has
    none, so every upload endpoint answered "No organization in context" no
    matter which school they were viewing.
    """
    body = request.get_json(silent=True) or {}
    requested = (request.args.get('organization_id')
                 or body.get('organization_id')
                 or request.form.get('organization_id'))
    org_id = sis_service.resolve_org_id(user_id, requested)
    if not org_id:
        return None, (jsonify({
            'success': False,
            'error': 'No organization in context. Superadmins must pass ?organization_id.'
        }), 400)
    return org_id, None


@bp.route('/dashboard', methods=['GET'])
@require_role(*ADMIN_ROLES)
def dashboard(user_id):
    """The School Dashboard: the census, plus every queue waiting on the office.

    ADMIN_ROLES includes campus coordinators, so the service decides per caller
    what goes in the payload — finance is omitted for them rather than hidden by
    the frontend. See services/sis_dashboard_service.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    from services import sis_dashboard_service
    return jsonify({'success': True,
                    'data': sis_dashboard_service.get_admin_dashboard(org_id, user_id)})


@bp.route('/roster', methods=['GET'])
@require_role(*ADMIN_ROLES)
def roster(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'roster': sis_service.get_roster(org_id)})


@bp.route('/roster/export-details', methods=['GET'])
@require_role(*ADMIN_ROLES)
def roster_export_details(user_id):
    """Guardians, family phone and emergency contacts, keyed by user id.

    A companion to /roster rather than part of it: the People page loads the
    roster constantly and needs none of this, while the CSV export needs all of
    it once. Merged onto the visible rows by the client, so the export still
    honours whatever filters and sort are on screen.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True,
                    'details': sis_service.roster_export_details(org_id)})


@bp.route('/people/<target_id>/removal-preview', methods=['GET'])
@require_role(*ADMIN_ROLES)
def person_removal_preview(user_id, target_id):
    """What removing this person would affect — and whether their records rule
    out deleting the account outright. Works for students and guardians as well
    as staff (staff delegate to the staff path)."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    from services import sis_person_service
    result = sis_person_service.removal_preview(org_id, target_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 404
    return jsonify({'success': True, **result})


@bp.route('/people/<target_id>', methods=['DELETE'])
@require_role(*ADMIN_ROLES)
def remove_person(user_id, target_id):
    """Remove a person from the org: archive (default) or ?mode=delete.

    Deleting a family never deleted the accounts inside it, so duplicate
    registrations left orphaned people in the People list with no way out. This
    is that way out."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    mode = (request.args.get('mode') or 'archive').strip().lower()
    from services import sis_person_service
    result = sis_person_service.remove_person(org_id, target_id, actor_id=user_id, mode=mode)
    if result.get('error'):
        status = 404 if 'not found' in result['error'] else 409
        return jsonify({'success': False, 'error': result['error'],
                        'blocking': result.get('blocking')}), status
    return jsonify({'success': True, **result})


@bp.route('/members', methods=['GET'])
@require_role(*ADMIN_ROLES)
def org_members(user_id):
    """Everyone in the org (for household assignment pickers)."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'members': sis_service.list_org_members(org_id)})


@bp.route('/staff', methods=['GET'])
@require_role(*ADMIN_ROLES)
def org_staff(user_id):
    """Org staff (org_admin / advisor) for the SIS Staff page."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    staff = sis_service.list_org_staff(org_id)
    # `staff-photos` is private; sign the avatars for this page load only.
    sign_in_place(staff, ['avatar_url'], 'staff-photos')
    return jsonify({'success': True, 'staff': staff})


@bp.route('/staff', methods=['POST'])
@require_role(*ADMIN_ROLES)
def create_teacher(user_id):
    """Add a teacher (advisor) to the org: creates the account + sends the
    set-password email. Accepts first_name, last_name, email, bio."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = sis_service.create_org_teacher(org_id, request.get_json() or {}, actor_id=user_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    # A same-named placeholder exists: don't create a duplicate — let the UI
    # offer to link that account instead (or re-POST with force_new to override).
    if result.get('placeholder_match'):
        return jsonify({'success': True, 'placeholder_match': result['placeholder_match']}), 200
    # The email already belongs to somebody here (usually a parent). Don't create
    # a second login for one person — let the UI offer to add the teacher role.
    if result.get('existing_account'):
        return jsonify({'success': True, 'existing_account': result['existing_account']}), 200
    return jsonify({'success': True, **result}), 201


@bp.route('/staff/grant-role', methods=['POST'])
@require_role(*ADMIN_ROLES)
def grant_staff_role(user_id):
    """Add the teacher role to an existing account (the parent-who-teaches case).
    Body: {user_id, bio?, onboarding_template_id?}."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.get_json() or {}
    target_id = (data.get('user_id') or '').strip()
    if not target_id:
        return jsonify({'success': False, 'error': 'user_id is required'}), 400
    result = sis_service.grant_teacher_role(org_id, target_id, data, actor_id=user_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result})


@bp.route('/staff/<staff_id>/roles', methods=['PUT'])
@require_role(*ROLE_GRANT_ROLES)
@require_relationship_to('staff_id', allow=('org_staff',))
def set_staff_roles(user_id, staff_id):
    """Set a staff member's roles (teacher / campus coordinator / admin).

    ROLE_GRANT_ROLES, not ADMIN_ROLES: a campus coordinator must not be able to
    hand themselves the admin role and with it the finance access the
    coordinator tier exists to withhold.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    roles = (request.get_json() or {}).get('roles')
    result = sis_service.set_staff_roles(org_id, staff_id, roles, actor_id=user_id)
    if result.get('error'):
        status = 404 if 'not found' in result['error'] else 400
        return jsonify({'success': False, 'error': result['error']}), status
    return jsonify({'success': True, **result})


@bp.route('/staff/<staff_id>/link', methods=['POST'])
@require_role(*ADMIN_ROLES)
@require_relationship_to('staff_id', allow=('org_staff',))
def link_staff(user_id, staff_id):
    """Connect a placeholder staff row to the teacher's real email. Claims the
    account in place (new email + set-password invite) or, when the email
    already has an Optio account, merges the placeholder into it."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = sis_service.link_staff_account(
        org_id, staff_id, (request.get_json() or {}).get('email'))
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result})


@bp.route('/staff/<staff_id>/resend-invite', methods=['POST'])
@require_role(*ADMIN_ROLES)
@require_relationship_to('staff_id', allow=('org_staff',))
def resend_staff_invite(user_id, staff_id):
    """Re-send the account-setup email to a teacher who hasn't finished
    setting up their login. Refuses for already-active accounts."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = sis_service.resend_staff_invite(org_id, staff_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result})


@bp.route('/staff/<staff_id>', methods=['PATCH'])
@require_role(*ADMIN_ROLES)
@require_relationship_to('staff_id', allow=('org_staff',))
def update_staff(user_id, staff_id):
    """Edit a staff member's profile (name, email, bio)."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    updated = sis_service.update_staff_member(org_id, staff_id, request.get_json() or {})
    if updated is None:
        return jsonify({'success': False, 'error': 'Staff member not found'}), 404
    return jsonify({'success': True, 'staff': updated})


@bp.route('/staff/<staff_id>/removal-preview', methods=['GET'])
@require_role(*ADMIN_ROLES)
@require_relationship_to('staff_id', allow=('org_staff',))
def staff_removal_preview(user_id, staff_id):
    """What removing this person would affect — which classes lose their teacher,
    and whether they carry history that rules out deleting them outright."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = sis_staff_service.staff_removal_preview(org_id, staff_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 404
    return jsonify({'success': True, **result})


@bp.route('/staff/<staff_id>', methods=['DELETE'])
@require_role(*ADMIN_ROLES)
@require_relationship_to('staff_id', allow=('org_staff',))
def remove_staff(user_id, staff_id):
    """Archive a staff member, or delete them outright with ?mode=delete.

    Archive is the default because it is always safe. Delete is refused by the
    service when the person has attendance, timesheets, forms, or onboarding
    attached — it exists for the placeholder rows schools create while hiring.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if staff_id == user_id:
        return jsonify({'success': False, 'error': "You can't remove your own account"}), 400
    mode = (request.args.get('mode') or 'archive').strip().lower()
    if mode == 'delete':
        result = sis_staff_service.delete_staff(org_id, staff_id, actor_id=user_id)
    else:
        result = sis_staff_service.archive_staff(org_id, staff_id, actor_id=user_id)
    if result.get('error'):
        status = 404 if result['error'] == 'Staff member not found' else 409
        return jsonify({'success': False, 'error': result['error'],
                        'blocking': result.get('blocking')}), status
    return jsonify({'success': True, **result})


@bp.route('/staff/<staff_id>/restore', methods=['POST'])
@require_role(*ADMIN_ROLES)
@require_relationship_to('staff_id', allow=('org_staff',))
def restore_staff(user_id, staff_id):
    """Bring an archived staff member back. Their classes stay unassigned."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = sis_staff_service.restore_staff(org_id, staff_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 404
    return jsonify({'success': True, **result})


@bp.route('/staff/<staff_id>/photo', methods=['POST'])
@require_role(*ADMIN_ROLES)
@require_relationship_to('staff_id', allow=('org_staff',))
def upload_staff_photo(user_id, staff_id):
    """Upload (or replace) a staff member's photo. Stores avatar_url on the user."""
    import uuid as _uuid
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    # admin client justified: writes another user's avatar_url + storage bucket ops; gated by @require_role(ADMIN_ROLES) + staff-belongs-to-org check below
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

    # PRIVATE: a staff headshot is a photograph of an identifiable person.
    # This bucket is created lazily by this very request, so `public: False`
    # here is what actually decides whether it is world-readable.
    bucket = 'staff-photos'
    try:
        if not supabase.storage.get_bucket(bucket):
            supabase.storage.create_bucket(bucket, options={'public': False})
    except Exception:
        try:
            supabase.storage.create_bucket(bucket, options={'public': False})
        except Exception:
            # create-if-missing: the error means it already exists
            ...
    path = f"{staff_id}/{_uuid.uuid4().hex}.{ext}"
    old_ref = parse_object_ref(row[0].get('avatar_url'), bucket)
    if old_ref and old_ref[0] == bucket:
        try:
            supabase.storage.from_(bucket).remove([old_ref[1]])
        except Exception:
            # best-effort cleanup of the replaced file
            ...
    try:
        supabase.storage.from_(bucket).upload(
            path=path, file=file.read(),
            file_options={'content-type': file.content_type or f'image/{ext}'},
        )
        # Durable pointer in the DB; short-lived signed URL to the browser.
        avatar_url = public_object_url(bucket, path)
    except Exception as e:
        logger.error(f"Error uploading staff photo: {e}")
        return jsonify({'success': False, 'error': 'Failed to upload photo'}), 500

    supabase.table('users').update({'avatar_url': avatar_url}).eq('id', staff_id).execute()
    return jsonify({'success': True, 'avatar_url': sign_stored_url(avatar_url, bucket)})


# ── Households ───────────────────────────────────────────────────────────────
@bp.route('/households', methods=['GET'])
@require_role(*ADMIN_ROLES)
def list_households(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    households = sis_service.households_with_members(org_id)
    # What each family said at registration about how they pay. The office
    # invoices from this list, so "are they UFA?" has to be answerable here
    # rather than one family at a time (see services/sis_payment_profile.py).
    sis_payment_profile.attach_to_households(org_id, households)
    # `family-images` is private; the stored image_url is a pointer, not a
    # fetchable link. Sign the whole page in one batched call.
    sign_in_place(households, ['image_url'], 'family-images')
    return jsonify({'success': True, 'households': households})


@bp.route('/unassigned-students', methods=['GET'])
@require_role(*ADMIN_ROLES)
def unassigned_students(user_id):
    """Org students not in any family (excludes graduated/withdrawn), each flagged
    with any family member they look like — so staff merge duplicates instead of
    adding a second copy, and graduated students drop off the list."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'students': sis_service.unassigned_students(org_id)})


@bp.route('/households', methods=['POST'])
@require_role(*ADMIN_ROLES)
def create_household(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'success': False, 'error': 'Household name is required'}), 400
    # admin client justified: households create for the resolved org; gated by @require_role(ADMIN_ROLES)
    repo = HouseholdRepository(client=get_supabase_admin_client())
    fields = {k: data.get(k) for k in (
        'name', 'primary_contact_user_id', 'address_line1', 'address_line2',
        'city', 'state', 'postal_code', 'phone', 'notes'
    ) if data.get(k) is not None}
    fields['name'] = name
    household = repo.create(org_id, fields)
    return jsonify({'success': True, 'household': household}), 201


@bp.route('/households/<household_id>', methods=['PATCH'])
@require_role(*ADMIN_ROLES)
def update_household(user_id, household_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    # admin client justified: households update gated by @require_role(ADMIN_ROLES) + household-belongs-to-org check below
    repo = HouseholdRepository(client=get_supabase_admin_client())
    existing = repo.find_by_id(household_id)
    if not existing or existing.get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Household not found'}), 404
    fields = {k: data.get(k) for k in (
        'name', 'primary_contact_user_id', 'address_line1', 'address_line2',
        'city', 'state', 'postal_code', 'phone', 'notes', 'image_url',
        'registration_hold', 'registration_hold_reason', 'registration_tier',
        'directory_opt_in', 'directory_opted_out', 'carpool_interest',
        'ufa_private', 'funding_source', 'enrolled_private_school',
        'payment_plan_preference'
    ) if k in data}
    for flag in ('registration_hold', 'directory_opt_in', 'directory_opted_out',
                 'carpool_interest', 'ufa_private', 'enrolled_private_school'):
        if flag in fields:
            fields[flag] = bool(fields[flag])
    # Directory membership is one decision with two columns (an explicit opt-out
    # has to outlive the school switching its default on), so staff setting it
    # on a family's behalf writes both sides — the same as the family's own toggle.
    if 'directory_opt_in' in fields and 'directory_opted_out' not in fields:
        fields['directory_opted_out'] = not fields['directory_opt_in']
    # funding_source is the source of truth; keep the legacy ufa_private boolean
    # (which gates the learning-day feature) mirrored from it. Setting a funding
    # source of ufa_private also implies enrolled in the private school.
    if 'funding_source' in fields:
        fs = fields['funding_source'] or None
        if fs not in (None, 'ufa', 'ufa_private', 'private_pay', 'other'):
            return jsonify({'success': False, 'error': 'invalid funding_source'}), 400
        fields['funding_source'] = fs
        fields['ufa_private'] = (fs == 'ufa_private')
        if fs == 'ufa_private':
            fields['enrolled_private_school'] = True
    if 'payment_plan_preference' in fields:
        plan = fields['payment_plan_preference'] or None
        if plan not in (None,) + sis_payment_profile.PLAN_VALUES:
            return jsonify({'success': False, 'error': 'invalid payment_plan_preference'}), 400
        fields['payment_plan_preference'] = plan
    if 'registration_tier' in fields and fields['registration_tier'] is not None:
        try:
            fields['registration_tier'] = int(fields['registration_tier'])
        except (TypeError, ValueError):
            return jsonify({'success': False, 'error': 'registration_tier must be a number'}), 400
    return jsonify({'success': True, 'household': repo.update(household_id, fields)})


@bp.route('/households/<household_id>', methods=['DELETE'])
@require_role(*ADMIN_ROLES)
def delete_household(user_id, household_id):
    """Delete a family. Removes the household + its member links; the students,
    guardians, and their own records keep their accounts.

    Returns the people it just left without a family, because that is the next
    question every time: an admin deleted a test family and then could not work
    out why its children were still on the allergy report (iCreate, 2026-09-01:
    "once I delete a family...how can I delete the children?"). The dialog
    already said the accounts survive; it said so before the deletion, which is
    not when it is needed. Naming them afterwards is.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    # admin client justified: deletes a household + all member links (rows owned by other users); gated by @require_role(ADMIN_ROLES) + household-belongs-to-org check below
    supabase = get_supabase_admin_client()
    repo = HouseholdRepository(client=supabase)
    existing = repo.find_by_id(household_id)
    if not existing or existing.get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Household not found'}), 404

    links = (supabase.table('household_members').select('user_id, role')
             .eq('household_id', household_id).execute()).data or []
    orphaned = []
    member_ids = [link['user_id'] for link in links if link.get('user_id')]
    if member_ids:
        rows = (supabase.table('users')
                .select('id, display_name, first_name, last_name')
                .in_('id', member_ids).execute()).data or []
        roles = {link['user_id']: link.get('role') for link in links}
        orphaned = [{'id': r['id'], 'name': person_name.full_name(r),
                     'role': roles.get(r['id'])} for r in rows]
        orphaned.sort(key=lambda m: m['name'])

    supabase.table('household_members').delete().eq('household_id', household_id).execute()
    supabase.table('households').delete().eq('id', household_id).execute()
    return jsonify({'success': True, 'orphaned_members': orphaned})


@bp.route('/households/<household_id>/image', methods=['POST'])
@require_role(*ADMIN_ROLES)
def upload_household_image(user_id, household_id):
    """Upload (or replace) a family photo. Stores image_url on the household."""
    import uuid as _uuid
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    # admin client justified: storage bucket create/upload + households image_url write; gated by @require_role(ADMIN_ROLES) + household-belongs-to-org check below
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

    # PRIVATE: family photos are pictures of somebody's children.
    bucket = 'family-images'
    try:
        if not supabase.storage.get_bucket(bucket):
            supabase.storage.create_bucket(bucket, options={'public': False})
    except Exception:
        try:
            supabase.storage.create_bucket(bucket, options={'public': False})
        except Exception:
            # create-if-missing: the error means it already exists
            ...
    path = f"{household_id}/{_uuid.uuid4().hex}.{ext}"
    old_ref = parse_object_ref(existing.get('image_url'), bucket)
    if old_ref and old_ref[0] == bucket:
        try:
            supabase.storage.from_(bucket).remove([old_ref[1]])
        except Exception:
            # best-effort cleanup of the replaced file
            ...
    try:
        supabase.storage.from_(bucket).upload(
            path=path, file=file.read(),
            file_options={'content-type': file.content_type or f'image/{ext}'},
        )
        # Durable pointer in the DB; short-lived signed URL to the browser.
        image_url = public_object_url(bucket, path)
    except Exception as e:
        logger.error(f"Error uploading family image: {e}")
        return jsonify({'success': False, 'error': 'Failed to upload image'}), 500

    updated = repo.update(household_id, {'image_url': image_url})
    signed = sign_stored_url(image_url, bucket)
    if isinstance(updated, dict):
        updated = {**updated, 'image_url': signed}
    return jsonify({'success': True, 'image_url': signed, 'household': updated})


@bp.route('/households/<household_id>/members', methods=['POST'])
@require_role(*ADMIN_ROLES)
def add_household_member(user_id, household_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    member_user_id = data.get('user_id')
    email = (data.get('email') or '').strip().lower()
    relationship = data.get('relationship', 'student')
    # admin client justified: cross-user email->account lookup (platform accounts outside the org) + household member write; gated by @require_role(ADMIN_ROLES) + household-belongs-to-org check
    admin = get_supabase_admin_client()

    # Connect a student by their Optio account email — covers accounts that
    # aren't in the org yet (platform accounts don't appear in the org picker).
    if not member_user_id and email:
        if relationship != 'student':
            return jsonify({'success': False,
                            'error': 'Only students can be connected by email'}), 400
        rows = (admin.table('users').select('id')
                .eq('email', email).limit(1).execute()).data or []
        if not rows:
            return jsonify({'success': False,
                            'error': 'No Optio account uses that email'}), 404
        member_user_id = rows[0]['id']
    if not member_user_id:
        return jsonify({'success': False, 'error': 'user_id is required'}), 400

    repo = HouseholdRepository(client=admin)
    existing = repo.find_by_id(household_id)
    if not existing or existing.get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Household not found'}), 404

    # Guard against re-adding a kid who's already in this family under a second
    # account (the re-registration duplicate pattern): warn before adding so
    # staff don't silently end up with the same child twice. confirm_duplicate
    # lets them proceed when the match is a false positive.
    if relationship == 'student' and not data.get('confirm_duplicate'):
        dups = sis_service.find_household_duplicates(org_id, household_id, member_user_id)
        if dups:
            names = ', '.join(d['name'] for d in dups)
            return jsonify({
                'success': False,
                'needs_confirmation': True,
                'duplicates': dups,
                'error': f'This family already includes {names}, which looks like the '
                         'same student. They may have been registered twice. Add anyway?',
            }), 409

    # Students attach to the org FIRST (org fields + parent links) so a refused
    # attach never leaves a half-connected member: in the household but invisible
    # to the roster. attach refuses cross-org moves and non-student accounts.
    if relationship == 'student':
        guardians = [m['user_id'] for m in repo.members_for_households([household_id])
                     if m.get('relationship') != 'student']
        if not sis_service.attach_student_to_org(org_id, member_user_id, guardian_ids=guardians):
            return jsonify({'success': False,
                            'error': "This account can't be connected — it may belong to "
                                     'another school or not be a student account.'}), 409
    else:
        # Guardian added after students: backfill the parent links the
        # student-add path would have created had the guardian been there first.
        students = [m['user_id'] for m in repo.members_for_households([household_id])
                    if m.get('relationship') == 'student']
        sis_service.link_guardian_to_students(member_user_id, students)

    member = repo.add_member(
        household_id, member_user_id,
        relationship=relationship,
        is_primary_guardian=bool(data.get('is_primary_guardian')),
    )
    return jsonify({'success': True, 'member': member}), 201


@bp.route('/households/<household_id>/members/<member_user_id>', methods=['DELETE'])
@require_role(*ADMIN_ROLES)
def remove_household_member(user_id, household_id, member_user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    # admin client justified: removes another user's household_members link; gated by @require_role(ADMIN_ROLES) + household-belongs-to-org check below
    repo = HouseholdRepository(client=get_supabase_admin_client())
    existing = repo.find_by_id(household_id)
    if not existing or existing.get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Household not found'}), 404
    repo.remove_member(household_id, member_user_id)
    return jsonify({'success': True})


# ── Enrollment lifecycle ─────────────────────────────────────────────────────
@bp.route('/enrollments/<student_id>', methods=['PATCH'])
@require_role(*ADMIN_ROLES)
@require_relationship_to('student_id', allow=('org_staff',))
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
@require_role(*ADMIN_ROLES)
@require_relationship_to('student_id', allow=('org_staff',))
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
@require_role(*ADMIN_ROLES)
def get_org_user(user_id, target_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    u = sis_service.get_org_user(org_id, target_id)
    if not u:
        return jsonify({'success': False, 'error': 'User not found'}), 404
    return jsonify({'success': True, 'user': u})


@bp.route('/users/<target_id>/role', methods=['PATCH'])
@require_role(*ADMIN_ROLES)
def update_user_role(user_id, target_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    body = request.get_json() or {}
    result = sis_service.update_user_role(org_id, target_id,
                                          role=body.get('role'), roles=body.get('roles'),
                                          actor_id=user_id)
    if result.get('error'):
        code = 404 if result['error'] == 'User not found' else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result})


@bp.route('/students/<student_id>', methods=['GET'])
@require_role(*ADMIN_ROLES)
@require_relationship_to('student_id', allow=('org_staff',))
def get_student(user_id, student_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    student = sis_service.get_student(org_id, student_id)
    if not student:
        return jsonify({'success': False, 'error': 'Student not found'}), 404
    return jsonify({'success': True, 'student': student})


@bp.route('/students/<student_id>/classes', methods=['GET'])
@require_role(*ADMIN_ROLES)
@require_relationship_to('student_id', allow=('org_staff',))
def student_classes(user_id, student_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if not sis_service.student_in_org(student_id, org_id):
        return jsonify({'success': False, 'error': 'Student not found'}), 404
    return jsonify({'success': True, 'classes': sis_service.list_student_classes(org_id, student_id)})


@bp.route('/students/<student_id>/message', methods=['POST'])
@require_role(*ADMIN_ROLES)
@require_relationship_to('student_id', allow=('org_staff',))
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
        result = sis_service.message_student(org_id, student_id, user_id, (data.get('subject') or '').strip(), body)
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 403
    return jsonify({'success': True, **result})


# ── Emergency contacts ───────────────────────────────────────────────────────
# SECURITY (IDOR-H10 fix): every endpoint here resolves the caller's org and
# verifies the target student/contact belongs to it before reading or deleting
# a minor's emergency-contact PII (names, phones, pickup authorization).
@bp.route('/students/<student_id>/emergency-contacts', methods=['GET'])
@require_role(*ADMIN_ROLES)
@require_relationship_to('student_id', allow=('org_staff',))
def list_emergency_contacts(user_id, student_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if not sis_service.student_in_org(student_id, org_id):
        return jsonify({'success': False, 'error': 'Student not found'}), 404
    return jsonify({'success': True, 'contacts': sis_service.list_emergency_contacts(student_id)})


@bp.route('/students/<student_id>/emergency-contacts', methods=['POST'])
@require_role(*ADMIN_ROLES)
@require_relationship_to('student_id', allow=('org_staff',))
def add_emergency_contact(user_id, student_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if not sis_service.student_in_org(student_id, org_id):
        return jsonify({'success': False, 'error': 'Student not found'}), 404
    data = request.json or {}
    if not (data.get('name') or '').strip():
        return jsonify({'success': False, 'error': 'Contact name is required'}), 400
    contact = sis_service.add_emergency_contact(student_id, org_id, data)
    return jsonify({'success': True, 'contact': contact}), 201


@bp.route('/emergency-contacts/<contact_id>', methods=['DELETE'])
@require_role(*ADMIN_ROLES)
def delete_emergency_contact(user_id, contact_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if not sis_service.delete_emergency_contact(contact_id, org_id):
        return jsonify({'success': False, 'error': 'Contact not found'}), 404
    return jsonify({'success': True})


@bp.route('/students/<student_id>/emergency-contacts/copy-from-family', methods=['POST'])
@require_role(*ADMIN_ROLES)
@require_relationship_to('student_id', allow=('org_staff',))
def copy_family_contacts(user_id, student_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if not sis_service.student_in_org(student_id, org_id):
        return jsonify({'success': False, 'error': 'Student not found'}), 404
    return jsonify({'success': True, **sis_service.copy_family_contacts_to_student(org_id, student_id)})


@bp.route('/households/<household_id>/message', methods=['POST'])
@require_role(*ADMIN_ROLES)
def message_household(user_id, household_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    # admin client justified: household ownership check before messaging its guardians; gated by @require_role(ADMIN_ROLES) + household-belongs-to-org check below
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
@require_role(*ADMIN_ROLES)
def list_household_contacts(user_id, household_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'contacts': sis_service.household_emergency_contacts(org_id, household_id)})


@bp.route('/households/<household_id>/registration', methods=['GET'])
@require_role(*ADMIN_ROLES)
def get_household_registration(user_id, household_id):
    """Latest iCreate registration submitted by this household's guardians
    (answers, signatures, kids, fee). registration is null when none exists."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'registration': sis_service.household_registration(org_id, household_id)})


@bp.route('/households/<household_id>/waive-fee', methods=['POST'])
@require_role(*FINANCE_ROLES)
def waive_household_fee(user_id, household_id):
    """Waive this family's registration fee: mark them prepaid, finish an open
    registration at $0, and lift the fee hold. Finance-gated — it forgives money."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    # Blocks P4: the shared completion step lives in
    # services/registration_funnel_service.py — no more route-to-route import.
    from services.registration_funnel_service import finish_fee_step, org_funnel_config

    def _finish(reg):
        # admin client justified: completes the family's registration record at $0 on their behalf; route gated by @require_role(FINANCE_ROLES), org resolved above
        admin = get_supabase_admin_client()
        return finish_fee_step(admin, reg, org_funnel_config(admin, org_id),
                               extra_fields={'fee_cents': 0})

    result = sis_service.waive_registration_fee(org_id, household_id, actor_id=user_id,
                                                finish_registration=_finish)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result})


@bp.route('/households/<household_id>/emergency-contacts', methods=['POST'])
@require_role(*ADMIN_ROLES)
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
@require_role(*ADMIN_ROLES)
def remove_household_contact(user_id, household_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    ids = (request.json or {}).get('ids') or []
    sis_service.remove_household_emergency_contacts(org_id, household_id, ids)
    return jsonify({'success': True, 'contacts': sis_service.household_emergency_contacts(org_id, household_id)})


# ── Family directives — settings staged by parent email before registration ──
# Loaded from a school's legacy registration list (fee already paid, hold, tier);
# the iCreate funnel applies them when the family registers and creates a household.
@bp.route('/family-directives', methods=['GET'])
@require_role(*ADMIN_ROLES)
def list_family_directives(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    # admin client justified: sis_family_directives is a staff-managed staging table keyed by parent email (no owning user); gated by @require_role(ADMIN_ROLES), filtered to resolved org
    rows = (get_supabase_admin_client().table('sis_family_directives').select('*')
            .eq('organization_id', org_id).order('email').execute()).data or []
    return jsonify({'success': True, 'directives': rows})


@bp.route('/family-directives', methods=['POST'])
@require_role(*ADMIN_ROLES)
def upsert_family_directives(user_id):
    """Bulk upsert directives by email: {directives: [{email, registration_tier,
    registration_hold, hold_reason, fee_prepaid, notes}]}."""
    from datetime import datetime
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    rows = (request.json or {}).get('directives') or []
    if not isinstance(rows, list) or not rows:
        return jsonify({'success': False, 'error': 'directives must be a non-empty list'}), 400

    payload, skipped = [], []
    for r in rows:
        email = str(r.get('email') or '').strip().lower()
        if '@' not in email:
            skipped.append(r.get('email'))
            continue
        tier = r.get('registration_tier')
        if tier is not None:
            try:
                tier = int(tier)
            except (TypeError, ValueError):
                return jsonify({'success': False, 'error': f'Bad registration_tier for {email}'}), 400
        payload.append({
            'organization_id': org_id,
            'email': email,
            'registration_tier': tier,
            'registration_hold': bool(r.get('registration_hold')),
            'hold_reason': (r.get('hold_reason') or '').strip() or None,
            'fee_prepaid': bool(r.get('fee_prepaid')),
            'notes': (r.get('notes') or '').strip() or None,
            'updated_at': datetime.utcnow().isoformat(),
        })
    if not payload:
        return jsonify({'success': False, 'error': 'No rows had a valid email'}), 400
    # admin client justified: bulk upsert of staff-managed sis_family_directives (no owning user); gated by @require_role(ADMIN_ROLES), rows pinned to resolved org
    saved = (get_supabase_admin_client().table('sis_family_directives')
             .upsert(payload, on_conflict='organization_id,email').execute()).data or []
    return jsonify({'success': True, 'saved': len(saved), 'skipped': skipped}), 200


@bp.route('/family-directives/<directive_id>', methods=['DELETE'])
@require_role(*ADMIN_ROLES)
def delete_family_directive(user_id, directive_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    # admin client justified: delete of staff-managed sis_family_directives row; gated by @require_role(ADMIN_ROLES) + directive-belongs-to-org check below
    supabase = get_supabase_admin_client()
    existing = (supabase.table('sis_family_directives').select('id, organization_id')
                .eq('id', directive_id).limit(1).execute()).data or []
    if not existing or existing[0].get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Directive not found'}), 404
    supabase.table('sis_family_directives').delete().eq('id', directive_id).execute()
    return jsonify({'success': True})


# ── Reports ──────────────────────────────────────────────────────────────────
@bp.route('/reports/roster.csv', methods=['GET'])
@require_role(*ADMIN_ROLES)
def roster_csv(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    roster = sis_service.get_roster(org_id)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(['Name', 'Role', 'Email', 'Username', 'Enrollment Status',
                     'Grade Level', 'Household', 'Total XP', 'Last Active'])
    for r in roster:
        writer.writerow([
            r['name'], r.get('role') or '', r.get('email') or '', r.get('username') or '',
            r.get('enrollment_status') or '', r.get('grade_level') or '',
            r.get('household_name') or '', r.get('total_xp') or 0,
            r.get('last_active') or '',
        ])
    return Response(
        buf.getvalue(),
        mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename=roster.csv'},
    )


def register_sis_routes(app):
    """Register the SIS blueprints and attach the module gate to each.

    The gate (modules/gate.py, log-only until P3 flips a tier) is attached
    HERE, centrally, rather than as one line in each route file: this touches
    one file instead of thirty, several of which carry active backlog work
    (freeze-week discipline, 2026-08). The mapping below is the blueprint ->
    module ownership table; tests/unit/test_module_coverage.py fails when a
    new SIS blueprint is neither mapped nor on the exemption list.

    Deliberate exemptions:
      pay_bp        -- unauthenticated by design; the signed token is the
                       authorization, and it settles invoices that existed
                       when billing was on (see services/sis_pay_links.py)
      school_bp     -- the discovery endpoint that REPORTS the module set;
                       gating it would hide the answer to "what is on?"
      parent_bp     -- spans a dozen modules, so it tags per-route with
                       @require_module (P3); the handful of deliberately
                       ungated routes are named in its module docstring

    staff_portal_bp / staff_admin_bp carry a blueprint-level 'sis' baseline
    here PLUS per-route @require_module tags for the specific feature
    (classes/forms/tasks/onboarding/timesheets/secure_documents) -- both
    gates run, so a route needs its own module AND the sis parent on.
    """
    from modules.gate import module_guard

    from routes.sis.catalog import bp as catalog_bp
    from routes.sis.registration import bp as registration_bp
    from routes.sis.waitlist import bp as waitlist_bp
    from routes.sis.clp import bp as clp_bp
    from routes.sis.billing import bp as billing_bp
    from routes.sis.tuition import bp as tuition_bp
    from routes.sis.pay import bp as pay_bp
    from routes.sis.attendance import bp as attendance_bp
    from routes.sis.reports import bp as reports_bp
    from routes.sis.parent import bp as parent_bp
    from routes.sis.school import bp as school_bp
    from routes.sis.resources import bp as resources_bp
    from routes.sis.events import bp as events_bp
    from routes.sis.schedule_ai import bp as schedule_ai_bp
    from routes.sis.schedule_sync import bp as schedule_sync_bp
    from routes.sis.staff_portal import bp as staff_portal_bp
    from routes.sis.staff_admin import bp as staff_admin_bp
    from routes.sis.coordinator import bp as coordinator_bp
    from routes.sis.submissions import bp as submissions_bp
    from routes.sis.class_materials import bp as class_materials_bp
    from routes.sis.class_quests import bp as class_quests_bp
    from routes.sis.curriculum import bp as sis_curriculum_bp
    # Curriculum resources: links and documents a teacher saves on a curriculum
    # and can show to the students of every class teaching it.
    from routes.sis.curriculum_materials import bp as sis_curriculum_materials_bp
    from routes.sis.quest_drafts import bp as quest_drafts_bp
    from routes.sis.staff_training import bp as staff_training_bp
    from routes.sis.secure_documents import bp as secure_documents_bp
    from routes.sis.parent_forms import bp as parent_forms_bp
    from routes.sis.tasks import bp as sis_tasks_bp
    from routes.sis.parent_prior_learning import bp as parent_prior_learning_bp
    from routes.sis.prior_learning import bp as prior_learning_bp
    from routes.sis.gradebook import bp as gradebook_bp
    from routes.sis.engagement import bp as engagement_bp
    from routes.sis.goals import bp as goals_bp
    from routes.sis.student_records import bp as student_records_bp
    from routes.sis.community import bp as community_bp

    for blueprint, module_key in (
        (bp, 'sis'),                        # people/households/roster core
        (catalog_bp, 'classes'),
        (registration_bp, 'registration'),
        (waitlist_bp, 'registration'),
        (clp_bp, 'clp'),
        (billing_bp, 'billing'),
        (tuition_bp, 'billing'),
        (attendance_bp, 'attendance'),
        (reports_bp, 'reports'),
        (resources_bp, 'resources'),
        (events_bp, 'calendar'),
        (schedule_ai_bp, 'classes'),
        (schedule_sync_bp, 'classes'),
        (coordinator_bp, 'sis'),
        (submissions_bp, 'submissions'),
        (class_materials_bp, 'classes'),
        (class_quests_bp, 'classes'),
        (sis_curriculum_bp, 'curriculum'),
        (sis_curriculum_materials_bp, 'curriculum'),
        (quest_drafts_bp, 'curriculum'),
        (staff_training_bp, 'training'),
        (secure_documents_bp, 'secure_documents'),
        (sis_tasks_bp, 'tasks'),
        # prior_learning and community keep their bespoke enforced checks
        # (already live); the gate rides alongside so they join the same
        # telemetry and the bespoke checks can retire at P3.
        (prior_learning_bp, 'prior_learning'),
        (gradebook_bp, 'classes'),
        (engagement_bp, 'classes'),
        (goals_bp, 'goals'),
        (student_records_bp, 'sis'),
        (community_bp, 'community'),
        # P3: the staff surfaces get the 'sis' baseline (their per-feature
        # tags are on the routes); the two single-module family blueprints
        # join the table outright.
        (staff_portal_bp, 'sis'),
        (staff_admin_bp, 'sis'),
        (parent_forms_bp, 'forms'),
        (parent_prior_learning_bp, 'prior_learning'),
    ):
        module_guard(blueprint, module_key)

    # Registration order preserved exactly -- Flask dispatches duplicate rules
    # to whichever blueprint registered first, so reordering is a behavior
    # change even when nothing else moved (CLAUDE.md: one route, one owner).
    app.register_blueprint(bp)
    app.register_blueprint(catalog_bp)
    app.register_blueprint(registration_bp)
    app.register_blueprint(waitlist_bp)
    app.register_blueprint(clp_bp)
    app.register_blueprint(billing_bp)
    app.register_blueprint(tuition_bp)
    app.register_blueprint(pay_bp)
    app.register_blueprint(attendance_bp)
    app.register_blueprint(reports_bp)
    app.register_blueprint(parent_bp)
    app.register_blueprint(school_bp)
    app.register_blueprint(resources_bp)
    app.register_blueprint(events_bp)
    app.register_blueprint(schedule_ai_bp)
    app.register_blueprint(schedule_sync_bp)
    app.register_blueprint(staff_portal_bp)
    app.register_blueprint(staff_admin_bp)
    app.register_blueprint(coordinator_bp)
    app.register_blueprint(submissions_bp)
    app.register_blueprint(class_materials_bp)
    app.register_blueprint(class_quests_bp)
    app.register_blueprint(sis_curriculum_bp)
    app.register_blueprint(sis_curriculum_materials_bp)
    app.register_blueprint(quest_drafts_bp)
    app.register_blueprint(staff_training_bp)
    app.register_blueprint(secure_documents_bp)
    app.register_blueprint(parent_forms_bp)
    app.register_blueprint(sis_tasks_bp)
    app.register_blueprint(parent_prior_learning_bp)
    app.register_blueprint(prior_learning_bp)
    app.register_blueprint(gradebook_bp)
    app.register_blueprint(engagement_bp)
    app.register_blueprint(goals_bp)
    app.register_blueprint(student_records_bp)
    app.register_blueprint(community_bp)
