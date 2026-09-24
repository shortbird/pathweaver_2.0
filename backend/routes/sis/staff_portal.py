"""
SIS teacher portal routes — what an advisor (teacher) can do in the SIS.

All endpoints are staff-gated but SCOPED: teachers only reach their own
classes (sis_service.class_scope), their own time entries, their own
onboarding, and their own tasks. Org admins can call these too (the
scope check passes everything for them).
"""

import uuid as _uuid

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from modules.gate import require_module
from utils.logger import get_logger
from utils import class_membership as membership
from services import sis_service
from services import sis_staff_service as staff
from routes.sis import portal_views
from services import sis_supply_budget_service as supply_budget
from database import get_supabase_admin_client
from utils.sis_roles import STAFF_ROLES
from utils.storage_urls import sign_in_place

logger = get_logger(__name__)

bp = Blueprint('sis_staff_portal', __name__, url_prefix='/api/sis/teacher')


_DOC_EXTENSIONS = {'pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'webp'}
_MAX_DOC_BYTES = 10 * 1024 * 1024


def _preview_target(user_id, org_id):
    """The OTHER staff member an admin is previewing, or None when there is no
    preview in play (no ?teacher_id=, the caller's own id, a caller who is not
    an admin, or a target outside this org).

    Kept as a name here because this module reads it a dozen times, but the
    RULE moved to sis_service.resolve_preview_target when the announcements
    list needed the same answer — the preview chrome reaches more than
    /teacher/*, and two copies of an authorization check drift. This end owns
    only where the id comes from.

    Still split out from _read_target because "nobody is being previewed" and
    "a preview was asked for and refused" are not the same answer everywhere:
    a page that may not show someone else's data has to say so rather than
    quietly answer with the caller's own (see _documents_target).
    """
    requested = request.args.get('teacher_id') or \
        (request.get_json(silent=True) or {}).get('teacher_id')
    return sis_service.resolve_preview_target(user_id, org_id, requested)


def _read_target(user_id, org_id):
    """Whose portal data a read endpoint returns. Admins may preview another
    staff member's portal via ?teacher_id= ("View portal" on the Staff page);
    everyone else always gets their own. Write endpoints never use this —
    checking off steps stays caller-bound."""
    return _preview_target(user_id, org_id) or user_id


@bp.route('/dashboard', methods=['GET'])
@require_role(*STAFF_ROLES)
def dashboard(user_id):
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    target = _read_target(user_id, org_id)
    return jsonify({'success': True, 'data': staff.teacher_dashboard(target, org_id)})


@bp.route('/classes', methods=['GET'])
@require_role(*STAFF_ROLES)
@require_module('classes')
def my_classes(user_id):
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    target = _read_target(user_id, org_id)
    return jsonify({'success': True, 'classes': staff.teacher_classes(target, org_id)})


@bp.route('/classes/<class_id>/roster', methods=['GET'])
@require_role(*STAFF_ROLES)
@require_module('classes')
def class_roster(user_id, class_id):
    """Roster with guardian contacts + health/safety alerts. Access is limited
    to the class's own teachers (and admins) and every view is access-logged."""
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    # Today, in the school's clock: a substitute the office marked for this
    # class today sees its roster today and not tomorrow (P7).
    today = staff._org_now(org_id).date().isoformat()
    scope = sis_service.class_scope(user_id, org_id, on_date=today)
    if scope is not None and class_id not in scope:
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    # admin client justified: org_classes ownership check for a roster read; gated by @require_role(STAFF_ROLES) + class_scope filter above, views access-logged
    cls = (get_supabase_admin_client().table('org_classes')
           .select('id, name, organization_id, supply_fee, supply_budget_per_student')
           .eq('id', class_id).limit(1).execute()).data
    if not cls or cls[0].get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    # The audit row has to name the capacity the viewer actually acted in. An
    # unscoped caller was logged as 'org_admin' regardless, which made a
    # superadmin look like the org's own admin and a campus coordinator look
    # like someone with access to the money. Ask for the real role.
    role = (sis_service.caller_org_roles(user_id) or ['advisor'])[0]
    data = staff.class_roster_detail(org_id, class_id, user_id, role)
    # Teachers plan materials against this; it rides along with the roster so the
    # class page doesn't need a second round trip.
    budget = supply_budget.budget_for_class(org_id, cls[0])
    return jsonify({'success': True,
                    'class': {'id': cls[0]['id'], 'name': cls[0]['name']},
                    'supply_budget': budget or None,
                    **data})


@bp.route('/classes/<class_id>/messaging', methods=['GET'])
@require_role(*STAFF_ROLES)
@require_module('classes')
def class_messaging(user_id, class_id):
    """Everything the class Messages tab needs: the class's two group chats
    (the parent chat and the student chat) and the people a teacher can message
    one-to-one (students on the roster, their guardians, plus any co-teachers).

    The groups are synced from the roster on every call, so opening the tab
    both creates the chats for a class that never had them and repairs
    membership after an enrollment change. The caller is ensured into both as
    an admin — reading a group requires membership, and staff who can reach
    this class administer its chats.

    Deliberately NOT the roster endpoint: this returns no health or guardian
    data, so it does not belong in student_access_logs.
    """
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    scope = sis_service.class_scope(user_id, org_id)
    if scope is not None and class_id not in scope:
        return jsonify({'success': False, 'error': 'Class not found'}), 404

    # admin client justified: cross-user reads/writes (group_members, class roster user profiles) gated by @require_role(STAFF_ROLES) + class_scope filter above
    admin = get_supabase_admin_client()
    cls = (admin.table('org_classes')
           .select('id, name, organization_id, primary_instructor_id, assistant_instructor_ids')
           .eq('id', class_id).limit(1).execute()).data
    if not cls or cls[0].get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    cls = cls[0]

    from services.class_group_sync_service import sync_class_groups
    group_ids = sync_class_groups(class_id, actor_id=user_id)

    def _load_group(group_id, fallback_name):
        if not group_id:
            return None
        me = (admin.table('group_members').select('id, role')
              .eq('group_id', group_id).eq('user_id', user_id).limit(1).execute()).data
        if not me:
            admin.table('group_members').insert({
                'group_id': group_id, 'user_id': user_id,
                'role': 'admin', 'added_by': user_id,
            }).execute()
        elif me[0].get('role') != 'admin':
            admin.table('group_members').update({'role': 'admin'}).eq('id', me[0]['id']).execute()
        rows = (admin.table('group_conversations')
                .select('id, name, announcement_only, last_message_at')
                .eq('id', group_id).limit(1).execute()).data
        group = rows[0] if rows else {'id': group_id, 'name': fallback_name}
        group['source_class_id'] = class_id
        return group

    group = _load_group(group_ids.get('family'), f"{cls.get('name')} Parent Chat")
    student_group = _load_group(group_ids.get('student'), f"{cls.get('name')} Student Chat")

    student_ids = membership.class_student_ids(class_id)

    # Co-teachers, and only for someone who actually teaches this class. An admin
    # opening a teacher's class page is looking at that teacher's workspace, so
    # listing its teacher there reads as "message yourself". The viewer is always
    # excluded, and placeholder staff rows are too: they have no real login, so a
    # DM to one is never read by anybody.
    teacher_ids = set()
    if user_id in membership.class_teacher_ids(class_id, class_row=cls):
        teacher_ids = membership.class_teacher_ids(class_id, class_row=cls) - {user_id}

    def _people(ids, relationship, subtitles=None):
        ids = [i for i in ids if i]
        if not ids:
            return []
        out = []
        for i in range(0, len(ids), 100):
            rows = (admin.table('users')
                    .select('id, email, first_name, last_name, display_name, preferred_name, avatar_url')
                    .in_('id', ids[i:i + 100]).execute()).data or []
            for u in rows:
                if u['id'] == user_id or sis_service.is_placeholder_staff_email(u.get('email')):
                    continue
                name = (' '.join(filter(None, [u.get('first_name'), u.get('last_name')])).strip()
                        or u.get('display_name') or 'Unknown')
                out.append({
                    'id': u['id'],
                    'name': name,
                    'preferred_name': u.get('preferred_name'),
                    'avatar_url': u.get('avatar_url'),
                    'relationship': relationship,
                    **({'subtitle': (subtitles or {}).get(u['id'])} if subtitles else {}),
                })
        out.sort(key=lambda p: p['name'].lower())
        # Private-bucket photos, signed one batch per bucket for the group.
        sign_in_place(out, ['avatar_url'])
        return out

    # Guardians of the enrolled students, one-to-one. The parent chat reaches
    # them all at once; a teacher wanting a word with ONE family had nowhere to
    # go from here (iCreate, 2026-09-02: "could we have a way to message the
    # individual parents here?"). Each is labelled with whose parent they are,
    # because a surname alone doesn't say which child.
    guardians_by_student = membership.guardians_by_student(student_ids)
    guardian_ids = {g for gs in guardians_by_student.values() for g in gs} - set(teacher_ids) - {user_id}
    child_names = {}
    if guardian_ids:
        student_names = {}
        sids = [i for i in student_ids if i]
        for i in range(0, len(sids), 100):
            for u in (admin.table('users')
                      .select('id, first_name, last_name, display_name, preferred_name')
                      .in_('id', sids[i:i + 100]).execute()).data or []:
                student_names[u['id']] = ((u.get('preferred_name') or u.get('first_name') or '').strip()
                                          or u.get('display_name') or 'a student')
        kids_by_guardian = {}
        for sid, gids in guardians_by_student.items():
            for gid in gids:
                if sid in student_names:
                    kids_by_guardian.setdefault(gid, set()).add(student_names[sid])
        for gid, kids in kids_by_guardian.items():
            child_names[gid] = 'Parent of ' + ' and '.join(sorted(kids))

    return jsonify({
        'success': True,
        'class': {'id': cls['id'], 'name': cls['name']},
        'group': group,
        'student_group': student_group,
        'students': _people(student_ids, 'student'),
        'guardians': _people(guardian_ids, 'parent', subtitles=child_names),
        'teachers': _people(teacher_ids, 'teacher'),
    })


@bp.route('/schedule', methods=['GET'])
@require_role(*STAFF_ROLES)
@require_module('classes')
def schedule(user_id):
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    target = _read_target(user_id, org_id)
    return jsonify({'success': True, **staff.teacher_schedule(target, org_id)})


@bp.route('/directory', methods=['GET'])
@require_role(*STAFF_ROLES)
def directory(user_id):
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'staff': staff.staff_directory(org_id)})


@bp.route('/profile', methods=['GET'])
@require_role(*STAFF_ROLES)
def my_profile(user_id):
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    profile = staff.get_staff_profile_with_contact(org_id, _read_target(user_id, org_id))
    # Employment/pay details are finance-facing; the teacher-portal profile hides
    # ALL of them (hourly_rate_cents AND pay_type/payroll_id). Popping only the
    # rate previously leaked pay_type and payroll_id — and _read_target lets an
    # admin/coordinator preview another staff member — so redact the full
    # PAY_FIELDS set here. Finance sees pay via the staff_admin path (redact_pay).
    # Pay only: somebody's own hire date and employment type are theirs to see.
    profile = staff.redact_pay(profile, redact=True, fields=staff.PAY_FIELDS)
    return jsonify({'success': True, 'profile': profile})


@bp.route('/profile', methods=['PATCH'])
@require_role(*STAFF_ROLES)
def update_my_profile(user_id):
    """Teachers maintain their own emergency contact info."""
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    result = staff.upsert_staff_profile(org_id, user_id, request.get_json() or {},
                                        allowed=staff.SELF_PROFILE_FIELDS)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result})


@bp.route('/tasks', methods=['GET'])
@require_role(*STAFF_ROLES)
@require_module('tasks')
def my_tasks(user_id):
    """Open tasks assigned to the caller (or to the staff member an admin is
    previewing). Any staff member can be an assignee."""
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    return portal_views.list_assigned_tasks(org_id, _read_target(user_id, org_id))


# ── Onboarding (mine) ────────────────────────────────────────────────────────
# The bodies are routes/sis/portal_views.py, shared with the family portal
# (routes/sis/parent.py); this side reads the staff audience and the
# staff-documents bucket, and an admin may open any file in the org.

@bp.route('/onboarding', methods=['GET'])
@require_role(*STAFF_ROLES)
@require_module('tasks', 'onboarding', any_of=True)
def my_onboarding(user_id):
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    # The mirror of the family portal's filter: staff checklists only, so a
    # teacher who is also a parent doesn't meet their family paperwork here.
    return portal_views.list_onboarding(org_id, _read_target(user_id, org_id), 'staff')


@bp.route('/onboarding/<assignment_id>/items/<item_key>', methods=['PATCH'])
@require_role(*STAFF_ROLES)
@require_module('tasks', 'onboarding', any_of=True)
def update_onboarding_item(user_id, assignment_id, item_key):
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    return portal_views.update_onboarding_item(org_id, user_id, assignment_id, item_key,
                                               is_admin=sis_service.caller_is_admin(user_id))


@bp.route('/onboarding/upload', methods=['POST'])
@require_role(*STAFF_ROLES)
@require_module('tasks', 'onboarding', any_of=True)
def upload_onboarding_doc(user_id):
    """Upload an onboarding document to the PRIVATE staff-documents bucket.
    Returns a storage path; reads go through signed URLs (below)."""
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    return portal_views.upload_doc(org_id, user_id, portal_views.STAFF_DOCS_BUCKET)


@bp.route('/onboarding/doc-url', methods=['GET'])
@require_role(*STAFF_ROLES)
@require_module('tasks', 'onboarding', any_of=True)
def onboarding_doc_url(user_id):
    """Signed (1h) URL for a staff document. Teachers can only open their own
    files; admins can open any file in their org."""
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    return portal_views.doc_url(org_id, user_id, portal_views.STAFF_DOCS_BUCKET,
                                any_in_org=sis_service.caller_is_admin(user_id))


# ── My documents (the staff member's own secure documents) ────────────────────

_SECURE_DOCS_BUCKET = 'sis-secure-documents'  # PRIVATE — same store the admin page uses
_MAX_DOC_TITLE_LEN = 200


def _clean_doc_title(value, fallback):
    """A document's display name: trimmed, capped, never empty.

    Mirrors routes/sis/secure_documents._clean_title — both write the same
    column, and a title that can be blank on one path is a blank row in the
    office's list.
    """
    title = (value or '').strip() or (fallback or '').strip() or 'Untitled document'
    return title[:_MAX_DOC_TITLE_LEN]


def _documents_target(user_id, org_id):
    """Whose documents to answer with: (owner_user_id, error).

    The teacher-portal preview reaches this page too, and it has to: checking
    that a contract actually landed in a teacher's portal is most of why the
    office previews at all. Until now this endpoint ignored ?teacher_id= and
    answered with the CALLER's own documents, so an admin who walked the staff
    list saw the same file under every teacher's name — their own background
    check (iCreate, 2026-08-19).

    Previewing somebody else's documents is HR_ROLES only. This store holds
    contracts and background checks, which a campus coordinator does not see
    (utils/sis_roles.HR_ROLES), and refusing is the honest answer — falling back
    to the caller's own documents is the bug above, wearing a different hat.
    """
    target = _preview_target(user_id, org_id)
    if not target:
        return user_id, None
    if not sis_service.caller_sees_hr(user_id):
        return None, (jsonify({
            'success': False,
            'error': "Only an administrator can view another person's documents",
        }), 403)
    return target, None


@bp.route('/my-documents', methods=['GET'])
@require_role(*STAFF_ROLES)
@require_module('secure_documents')
def my_documents(user_id):
    """One staff member's documents — the caller's own, or, for an HR admin
    previewing a teacher's portal, that teacher's (see _documents_target).

    Two kinds, and only two: documents an admin has explicitly SHARED with the
    owner (shared_with_owner), and documents they uploaded themselves.
    Everything else filed about a staff member — background checks above all —
    stays invisible here. The org filter plus the owner filter is the whole
    access rule; there is no id-based lookup that could be walked.
    """
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    owner, err = _documents_target(user_id, org_id)
    if err:
        return err
    # admin client justified: sis_secure_documents is a service-role-only staff-records table; read filtered to the resolved owner AND shared_with_owner
    rows = (get_supabase_admin_client().table('sis_secure_documents')
            .select('id, filename, title, category, note, size_bytes, created_at, '
                    'shared_with_owner, uploaded_by_owner')
            .eq('organization_id', org_id).eq('owner_user_id', owner)
            .eq('shared_with_owner', True)
            .order('created_at', desc=True).execute()).data or []
    # So the page can say whose documents these are rather than calling somebody
    # else's contract "yours".
    return jsonify({'success': True, 'documents': rows,
                    'previewing': owner != user_id})


@bp.route('/my-documents/upload', methods=['POST'])
@require_role(*STAFF_ROLES)
@require_module('secure_documents')
def upload_my_document(user_id):
    """Send a document in to the school — a signed contract, a certificate.

    Files land in the same private store the office already uses, attached to
    the uploader and shared back to them so they can see what they sent. The
    school gets it immediately; there is no paper step.
    """
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No file provided'}), 400
    file = request.files['file']
    if not file.filename:
        return jsonify({'success': False, 'error': 'No file selected'}), 400
    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    if ext not in _DOC_EXTENSIONS:
        return jsonify({'success': False, 'error': 'Allowed types: pdf, doc, docx, png, jpg, webp'}), 400
    file.seek(0, 2)
    size_bytes = file.tell()
    if size_bytes > _MAX_DOC_BYTES:
        return jsonify({'success': False, 'error': 'File size exceeds 10MB limit'}), 400
    file.seek(0)

    # admin client justified: upload + insert into service-role-only sis_secure_documents / private bucket; owner_user_id forced to the authenticated caller
    supabase = get_supabase_admin_client()
    try:
        supabase.storage.get_bucket(_SECURE_DOCS_BUCKET)
    except Exception:
        try:
            supabase.storage.create_bucket(_SECURE_DOCS_BUCKET, options={'public': False})
        except Exception:
            # create-if-missing: the error means it already exists
            ...
    path = f"{org_id}/{_uuid.uuid4().hex}.{ext}"
    try:
        supabase.storage.from_(_SECURE_DOCS_BUCKET).upload(
            path=path, file=file.read(),
            file_options={'content-type': file.content_type or 'application/octet-stream'},
        )
    except Exception as e:
        logger.error(f'Staff document upload failed: {e}')
        return jsonify({'success': False, 'error': 'Failed to upload document'}), 500

    category = (request.form.get('category') or '').strip() or 'Submitted by staff'
    row = {
        'organization_id': org_id,
        'owner_user_id': user_id,      # always themselves — never a form field
        'uploaded_by': user_id,
        'storage_path': path,
        'filename': file.filename,
        # The uploader names it. iCreate's ask: a teacher naming the file in the
        # office's standard form up front saves the office renaming it later.
        'title': _clean_doc_title(request.form.get('title'), file.filename),
        'content_type': file.content_type,
        'size_bytes': size_bytes,
        'category': category,
        'note': (request.form.get('note') or '').strip() or None,
        'shared_with_owner': True,     # it's theirs; they can see it
        'uploaded_by_owner': True,     # distinguishes "they sent this" in the office view
    }
    try:
        inserted = (supabase.table('sis_secure_documents').insert(row).execute()).data
    except Exception as e:
        logger.error(f'Staff document insert failed: {e}')
        try:
            supabase.storage.from_(_SECURE_DOCS_BUCKET).remove([path])
        except Exception:
            # best-effort cleanup of the replaced file
            ...
        return jsonify({'success': False, 'error': 'Failed to save document'}), 500
    return jsonify({'success': True, 'document': (inserted or [row])[0]}), 201


@bp.route('/my-documents/<doc_id>/url', methods=['GET'])
@require_role(*STAFF_ROLES)
@require_module('secure_documents')
def my_document_url(user_id, doc_id):
    """Signed URL for a document belonging to whoever this portal is showing --
    the caller, or the teacher an HR admin is previewing. Ownership and sharing
    are re-checked in the shared body, not trusted from the list call."""
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    owner, err = _documents_target(user_id, org_id)
    if err:
        return err
    return portal_views.office_document_url(org_id, owner, doc_id)
