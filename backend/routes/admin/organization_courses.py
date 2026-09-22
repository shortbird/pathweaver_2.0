"""Course registration and enrolment for an organization.

Split out of organization_management.py on 2026-09-02: that file had grown past
the 1950-line exemption in tests/unit/test_route_file_sizes.py, whose whole
point is that a route file big enough to lose track of is a route file where a
missing auth decorator goes unnoticed. These three endpoints are the one
self-contained group in it -- a partner org registering a purchased student
into Optio courses, and the enrolment list behind that -- with no helper shared
with anything left behind.

Its own blueprint, mounted on the SAME /api/admin/organizations prefix, so the
URLs are unchanged. Paths do not overlap with organization_management's; see
the "One route, one owner" note in CLAUDE.md for why that matters.
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_org_admin
from repositories.partner_enrollment_repository import PartnerEnrollmentRepository
from database import get_supabase_admin_client
from generated.pillars import PILLAR_KEYS
from utils.logger import get_logger
from datetime import datetime, date
from urllib.parse import quote
import re
import secrets

logger = get_logger(__name__)

bp = Blueprint('organization_courses', __name__)


EMAIL_PATTERN = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')

# Pillars used to initialize a new student's skill XP rows
# The pillar KEYS, which is what user_skill_xp.pillar holds.
SKILL_PILLARS = list(PILLAR_KEYS)


def generate_unusable_password(length=32):
    """A random password for a new account that is never shown to anyone.

    Supabase requires a password at create_user time, but the student sets their
    real one through the invite link. This value is discarded the moment the
    account exists — see utils/invite_tokens.py for why we don't email it.
    """
    import string
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def _join_titles(titles):
    """Join titles into a readable phrase: 'A', 'A and B', or 'A, B, and C'."""
    titles = [t for t in titles if t]
    if not titles:
        return ''
    if len(titles) == 1:
        return titles[0]
    if len(titles) == 2:
        return f"{titles[0]} and {titles[1]}"
    return f"{', '.join(titles[:-1])}, and {titles[-1]}"


def _display_name(user):
    """Best available name for a user row, falling back to their email."""
    name = (user.get('display_name') or '').strip()
    if not name:
        name = f"{user.get('first_name') or ''} {user.get('last_name') or ''}".strip()
    return name or user.get('email') or 'Unnamed student'


def _effective_role(user):
    """The real role, whether the account is platform-side or org-managed.

    Mirrors get_effective_role(): an org member carries 'org_managed' in `role`
    and their real role in `org_role`. See the roles table in CLAUDE.md.
    """
    if (user.get('role') or '') == 'org_managed':
        return user.get('org_role') or ''
    return user.get('role') or ''


def _students_behind_email(repo, account):
    """The student accounts a partner may enrol on behalf of an existing login.

    A partner sells a course to a family and types the address the purchase came
    from. That address is often already an Optio login, and it is not always the
    student's:

      - the student themselves -> that one account
      - a parent or guardian    -> the children on their account, found through
        parent_student_links (the platform link) and household_members (the SIS
        one, which is how an org-managed family is put together)
      - anyone else (advisor, org_admin, observer, superadmin) -> nothing. A
        course enrolment on a staff account puts a child's work on an adult's
        login, and a partner has no business touching staff.

    Returns a list of {id, name, relationship} with the student's own account
    first. Never returns the parent's own account.
    """
    role = _effective_role(account)

    if role == 'student':
        return [{
            'id': account['id'],
            'name': _display_name(account),
            'relationship': 'self'
        }]

    if role != 'parent':
        return []

    # A SIS family is assembled out of households, not parent_student_links, so
    # a guardian can have children the link table has never heard of. Elvia
    # Labrador on 2026-09-22 was exactly this: a guardian row and a student row
    # in one household, no link row, and the partner form dead-ended.
    child_ids = repo.linked_student_ids(account['id'])
    if not child_ids:
        return []

    by_id = repo.accounts_by_ids(child_ids)

    # A household row says 'student' about its relationship, not about the
    # account, so confirm the role on the user row itself before offering it.
    return [
        {'id': cid, 'name': _display_name(by_id[cid]), 'relationship': 'child'}
        for cid in child_ids
        if cid in by_id and _effective_role(by_id[cid]) == 'student'
    ]


@bp.route('/<org_id>/register-student-for-course', methods=['POST'])
@require_org_admin
def register_student_for_course(current_user_id, current_org_id, is_superadmin, org_id):
    """
    Register a student into the organization and enroll them in one or more
    Optio courses in a single step.

    Designed for partner programs that sell one-off course purchases: the
    partner's org_admin fills out a simple form (student details + a multi-select
    of courses) after a purchase.

    Handles both cases:
      - New student: creates an org-managed account and emails the family a
        set-your-password invite link plus a "how Optio works" overview. The
        account's email stays unconfirmed until they click the link, so a
        mistyped address never becomes a working login.
      - Returning student (e.g. a second purchase months later): finds the
        existing account by email and enrolls it in the newly selected courses,
        skipping any they are already in. No invite is issued.
      - The address already logs in somewhere else: a platform student, another
        school's student, or a parent. The account is never adopted -- writing
        an org or a role onto it would move a student between schools or demote
        staff -- but the courses can still be added to the student behind that
        address. The first call answers 409 'existing_account' with the student
        or students to choose from; the caller picks one and repeats the call
        with student_id.

    Request body:
        first_name: str (required)
        last_name: str (required)
        student_email: str (required) - the student's login
        course_ids: list[str] (required) - one or more published courses
                    (a single course_id string is also accepted)
        date_of_birth: str (optional, YYYY-MM-DD)
        student_id: str (optional) - confirms which existing account to enrol,
                    answering a 409 'existing_account'
        family_email: str (optional) - where the email is sent (defaults to student_email)
    """
    try:
        # Verify access - org admin can only register into their own org
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        first_name = (data.get('first_name') or '').strip()
        last_name = (data.get('last_name') or '').strip()
        student_email = (data.get('student_email') or '').strip().lower()
        dob = (data.get('date_of_birth') or '').strip()

        # Accept either a list of course_ids or a single course_id
        course_ids = data.get('course_ids')
        if not course_ids:
            single = (data.get('course_id') or '').strip()
            course_ids = [single] if single else []
        # Normalize: stringify, strip, drop blanks, de-duplicate (order preserved)
        seen = set()
        course_ids = [c for c in (str(cid).strip() for cid in course_ids)
                      if c and not (c in seen or seen.add(c))]

        # Validate required fields
        if not first_name:
            return jsonify({'error': 'first_name is required'}), 400
        if not last_name:
            return jsonify({'error': 'last_name is required'}), 400
        if not student_email or not EMAIL_PATTERN.match(student_email):
            return jsonify({'error': 'A valid student_email is required'}), 400
        if not course_ids:
            return jsonify({'error': 'Select at least one course'}), 400

        # Validate date of birth if provided
        dob_iso = None
        requires_parental_consent = False
        if dob:
            try:
                dob_date = datetime.strptime(dob, '%Y-%m-%d').date()
            except ValueError:
                return jsonify({'error': 'date_of_birth must be in YYYY-MM-DD format'}), 400
            if dob_date > date.today():
                return jsonify({'error': 'date_of_birth cannot be in the future'}), 400
            dob_iso = dob_date.isoformat()
            if (date.today() - dob_date).days / 365.25 < 13:
                requires_parental_consent = True

        # admin client justified: admin-only route (@require_org_admin) — needs RLS bypass for cross-tenant administration
        client = get_supabase_admin_client()

        # Verify organization exists
        org_result = client.table('organizations').select('id, slug, name').eq('id', org_id).single().execute()
        if not org_result.data:
            return jsonify({'error': 'Organization not found'}), 404
        org_name = org_result.data.get('name')

        # Verify every selected course exists and is published
        courses_result = client.table('courses').select('id, title, status').in_('id', course_ids).execute()
        found = {c['id']: c for c in (courses_result.data or [])}
        missing = [cid for cid in course_ids if cid not in found]
        if missing:
            return jsonify({'error': 'One or more selected courses were not found'}), 404
        unpublished = [found[cid]['title'] for cid in course_ids if found[cid].get('status') != 'published']
        if unpublished:
            return jsonify({'error': f"These courses are not published: {', '.join(unpublished)}"}), 400
        ordered_courses = [found[cid] for cid in course_ids]  # preserve requested order

        # Look up an existing account by email
        repo = PartnerEnrollmentRepository(client=client)
        existing_user = repo.account_by_email(student_email)
        is_new_account = existing_user is None
        user_record = None
        enrolled_student = None

        if existing_user:
            existing_org = existing_user.get('organization_id')
            if existing_org == org_id:
                # A returning student of this partner: enrol their existing
                # account in whatever is newly selected.
                user_id = existing_user['id']
            else:
                # The address already logs in somewhere else. Never adopt or
                # modify that account -- writing organization_id or role onto it
                # would move a student between schools, or demote staff. Its
                # course enrolments, though, are per-user and carry no org, so
                # the partner can add the course they sold to the student who
                # is really behind this address without touching the user row.
                candidates = _students_behind_email(repo, existing_user)
                chosen_id = (data.get('student_id') or '').strip()

                if not candidates:
                    return jsonify({
                        'code': 'existing_account_no_student',
                        'error': (
                            f"{student_email} already signs in to Optio, but that account is not a "
                            f"student and has no student on it, so a course cannot be added to it. "
                            f"Register the student under their own email address."
                        )
                    }), 409

                if not chosen_id:
                    # Ask first. The address is often a parent's, and enrolling
                    # the wrong member of a family is not something the partner
                    # can undo without deleting the student's work.
                    return jsonify({
                        'code': 'existing_account',
                        'error': f"{student_email} already has an Optio account.",
                        'students': candidates,
                        'message': (
                            f"{student_email} already has an Optio account. Choose who the "
                            f"course should be added to, or register the student under a "
                            f"different email address."
                        )
                    }), 409

                enrolled_student = next((c for c in candidates if c['id'] == chosen_id), None)
                if not enrolled_student:
                    return jsonify({
                        'code': 'student_not_on_account',
                        'error': f"That student is no longer on the Optio account for {student_email}.",
                        'students': candidates
                    }), 409
                user_id = enrolled_student['id']
        else:
            # Create the Supabase Auth account. The password is random and
            # never leaves this function; the student sets a real one through
            # the invite link below, which is also what confirms their email.
            try:
                auth_response = client.auth.admin.create_user({
                    'email': student_email,
                    'password': generate_unusable_password(),
                    'email_confirm': False,
                    'user_metadata': {
                        'first_name': first_name,
                        'last_name': last_name,
                        'organization_id': org_id,
                        'created_via': 'org_course_registration'
                    }
                })
            except Exception as auth_error:
                error_str = str(auth_error).lower()
                if 'already registered' in error_str or 'already exists' in error_str:
                    return jsonify({
                        'error': f'An account already exists for {student_email}. Try again, or use the enrollment manager.'
                    }), 409
                logger.error(f"Failed to create auth account for {student_email}: {auth_error}")
                return jsonify({'error': 'Failed to create student account'}), 500

            if not auth_response.user:
                return jsonify({'error': 'Failed to create student account'}), 500
            user_id = auth_response.user.id

            user_data = {
                'id': user_id,
                'email': student_email,
                'first_name': first_name,
                'last_name': last_name,
                'display_name': f"{first_name} {last_name}",
                'organization_id': org_id,
                'role': 'org_managed',
                'org_role': 'student',
                'total_xp': 0,
                'level': 1,
                'streak_days': 0
            }
            if dob_iso:
                user_data['date_of_birth'] = dob_iso
            if requires_parental_consent:
                user_data['requires_parental_consent'] = True

            try:
                profile_result = client.table('users').insert(user_data).execute()
                if not profile_result.data:
                    raise Exception('Profile insert returned no data')
                user_record = profile_result.data[0]
            except Exception as profile_error:
                try:
                    client.auth.admin.delete_user(user_id)
                except Exception as cleanup_error:
                    logger.warning(f"Failed to clean up auth user {user_id} after profile failure: {cleanup_error}")
                logger.error(f"Failed to create profile for {student_email}: {profile_error}")
                return jsonify({'error': 'Failed to create student profile'}), 500

            # Initialize skill XP rows (best-effort)
            try:
                # ignore_duplicates: these rows carry xp_amount 0 and a plain
                # upsert OVERWRITES on conflict, so a re-run would zero a real
                # balance. See routes/auth/login/security.py for the full note.
                client.table('user_skill_xp').upsert(
                    [{'user_id': user_id, 'pillar': pillar, 'xp_amount': 0} for pillar in SKILL_PILLARS],
                    on_conflict='user_id,pillar', ignore_duplicates=True
                ).execute()
            except Exception as skill_error:
                logger.warning(f"Failed to initialize skill XP for {user_id}: {skill_error}")

        # Enroll the student in each selected course
        from services.course_enrollment_service import CourseEnrollmentService
        enrollment_service = CourseEnrollmentService(client)

        course_results = []
        newly_enrolled_titles = []
        for course in ordered_courses:
            result = enrollment_service.enroll_user(
                user_id, course['id'], enrolled_by_organization_id=org_id
            )
            status = result.get('status', 'failed') if result.get('success') else 'failed'
            course_results.append({
                'course_id': course['id'],
                'course_title': course['title'],
                'status': status,
                'quests_enrolled': result.get('quests_enrolled', 0) if result.get('success') else 0,
                'error': None if result.get('success') else result.get('error')
            })
            if status in ('enrolled', 'reactivated'):
                newly_enrolled_titles.append(course['title'])

        any_enrolled = any(r['status'] in ('enrolled', 'reactivated', 'already_enrolled') for r in course_results)
        if is_new_account and not any_enrolled:
            logger.error(f"Created student {user_id} but no course enrollment succeeded: {course_results}")
            return jsonify({
                'error': 'The account was created but course enrollment failed. Enroll them manually from the enrollment manager.',
                'user_id': user_id,
                'courses': course_results
            }), 500

        # Human-readable course phrase for the email
        email_titles = newly_enrolled_titles if newly_enrolled_titles else [c['title'] for c in ordered_courses]
        courses_sentence = _join_titles(email_titles)

        # Send the appropriate email (best-effort; never fail the request on email)
        email_sent = False
        try:
            from app_config import Config
            from services.email_service import email_service
            frontend_url = (Config.FRONTEND_URL or '').rstrip('/')
            login_url = f"{frontend_url}/login"
            if is_new_account:
                # Marketing: brand-new course students join the Course Student
                # Onboarding funnel, which teaches how Optio and courses work.
                # Taking a purchased course from us is the email permission, so
                # there is no age gate here (unlike self-serve registration).
                # Fire-and-forget; the returned automation name rides along so
                # the [COPY] to Tanner says whether a sequence follows.
                crm_funnel = None
                try:
                    from services.crm_service import sync_course_student
                    crm_funnel = sync_course_student(student_email, first_name, last_name)
                except Exception as brevo_err:
                    logger.warning(f"Brevo course-student sync failed for {student_email}: {brevo_err}")
                # One link that both confirms the address and sets the password.
                # If the token write fails there is no safe email to send — a
                # welcome with a dead link is worse than none, and the admin can
                # resend from the enrollment manager.
                from utils.invite_tokens import mint_invite_token, INVITE_EXPIRY_DAYS
                invite_token = mint_invite_token(user_id, admin=client)
                if invite_token:
                    invite_link = (
                        f"{frontend_url}/student/welcome?token={invite_token}"
                        f"&email={quote(student_email)}"
                    )
                    email_sent = email_service.send_org_course_welcome_email(
                        to_email=student_email,
                        student_name=first_name,
                        student_email=student_email,
                        invite_link=invite_link,
                        org_name=org_name,
                        courses_sentence=courses_sentence,
                        course_count=len(email_titles),
                        expiry_days=INVITE_EXPIRY_DAYS,
                        crm_funnel=crm_funnel
                    )
                else:
                    logger.error(
                        f"Could not mint invite token for {user_id}; welcome email skipped"
                    )
            elif newly_enrolled_titles:
                # Name the student the courses actually landed on. On an
                # existing account that is the name Optio already holds, which
                # may not be the one typed into the partner's form.
                notify_name = first_name
                if enrolled_student:
                    notify_name = (enrolled_student['name'].split() or [first_name])[0]
                email_sent = email_service.send_org_courses_added_email(
                    to_email=student_email,
                    student_name=notify_name,
                    org_name=org_name,
                    courses_sentence=courses_sentence,
                    course_count=len(newly_enrolled_titles),
                    login_url=login_url
                )
        except Exception as email_error:
            logger.warning(f"Welcome/added email to {student_email} failed: {email_error}")

        logger.info(
            f"{'Created' if is_new_account else 'Updated'} student {user_id} ({student_email})"
            f"{' [existing account outside the org]' if enrolled_student else ''} in org {org_id}; "
            f"courses={[r['status'] for r in course_results]}; email_sent={email_sent} by {current_user_id}"
        )

        response = {
            'success': True,
            'is_new_account': is_new_account,
            'user_id': user_id,
            'courses': course_results,
            'email_to': student_email,
            'email_sent': email_sent,
        }
        if user_record is not None:
            response['user'] = user_record
        if enrolled_student is not None:
            response['enrolled_student'] = enrolled_student
        if is_new_account:
            # No credential exists to hand back: the student sets their own
            # password through the invite link in the welcome email.
            response['message'] = (
                'Student registered and enrolled. A welcome email was sent with a link to set their password.'
                if email_sent else
                'Student registered and enrolled, but the welcome email could not be sent. '
                'Ask them to use "Forgot password" on the login page with this email address.'
            )
        elif enrolled_student is not None:
            response['message'] = (
                f"{enrolled_student['name']}'s existing Optio account was enrolled in the "
                f"selected course(s). Nothing else on that account changed."
            )
        else:
            response['message'] = 'Existing student enrolled in the selected course(s).'
        return jsonify(response), 201

    except Exception as e:
        logger.error(f"Error registering student for courses in org {org_id}: {e}")
        raise


@bp.route('/<org_id>/course-enrollments', methods=['GET'])
@require_org_admin
def list_org_course_enrollments(current_user_id, current_org_id, is_superadmin, org_id):
    """
    List course enrollments for every student in the organization, with student
    and course details. Used by the partner dashboard's "Active Enrollments" tab.

    Also lists what this org sold to students who are not its own: a partner can
    add a course to an Optio account that already exists elsewhere, and an
    enrolment nobody can see is an enrolment nobody can correct. Those rows are
    marked external.

    Query params:
        status: enrollment status filter (default 'active'; pass 'all' for everything)
    """
    try:
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        status_filter = (request.args.get('status') or 'active').strip().lower()

        # admin client justified: admin-only route (@require_org_admin) — needs RLS bypass for cross-tenant administration
        client = get_supabase_admin_client()

        # All users in the organization
        users_res = client.table('users')\
            .select('id, first_name, last_name, display_name, email, date_of_birth')\
            .eq('organization_id', org_id)\
            .execute()
        users_by_id = {u['id']: u for u in (users_res.data or [])}
        member_ids = set(users_by_id.keys())

        enrollments = []
        if member_ids:
            query = client.table('course_enrollments')\
                .select('id, user_id, course_id, status, enrolled_at')\
                .in_('user_id', list(member_ids))
            if status_filter != 'all':
                query = query.eq('status', status_filter)
            enrollments = (query.order('enrolled_at', desc=True).execute().data) or []

        # Enrolments this org created on accounts it does not own
        repo = PartnerEnrollmentRepository(client=client)
        sold = repo.sold_to_outside_accounts(
            org_id, None if status_filter == 'all' else status_filter
        )
        external = [e for e in sold if e.get('user_id') not in member_ids]

        external_ids = {e['user_id'] for e in external if e.get('user_id')}
        if external_ids:
            users_by_id.update(repo.roster_by_ids(external_ids))
            enrollments = enrollments + external

        if not enrollments:
            return jsonify({'success': True, 'enrollments': [], 'total': 0}), 200

        # Course titles
        course_ids = list({e['course_id'] for e in enrollments if e.get('course_id')})
        courses_by_id = {}
        if course_ids:
            courses_res = client.table('courses').select('id, title').in_('id', course_ids).execute()
            courses_by_id = {c['id']: c['title'] for c in (courses_res.data or [])}

        result = []
        for e in enrollments:
            u = users_by_id.get(e['user_id'], {})
            name = (u.get('display_name') or f"{u.get('first_name', '') or ''} {u.get('last_name', '') or ''}").strip()
            result.append({
                'enrollment_id': e['id'],
                'student_id': e['user_id'],
                'student_name': name or u.get('email'),
                'student_email': u.get('email'),
                'date_of_birth': u.get('date_of_birth'),
                'course_id': e.get('course_id'),
                'course_title': courses_by_id.get(e.get('course_id'), 'Unknown course'),
                'status': e.get('status'),
                'enrolled_at': e.get('enrolled_at'),
                'external_account': e['user_id'] not in member_ids,
            })

        result.sort(key=lambda r: r.get('enrolled_at') or '', reverse=True)
        return jsonify({'success': True, 'enrollments': result, 'total': len(result)}), 200

    except Exception as e:
        logger.error(f"Error listing course enrollments for org {org_id}: {e}")
        raise


@bp.route('/<org_id>/course-enrollments/remove', methods=['POST'])
@require_org_admin
def remove_org_course_enrollment(current_user_id, current_org_id, is_superadmin, org_id):
    """
    Remove a student's access to a course (unenroll). Used by the partner
    dashboard's "Remove access" action.

    Request body:
        student_id: str (required) - the student to unenroll
        course_id: str (required) - the course to remove access to
    """
    try:
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json() or {}
        student_id = (data.get('student_id') or '').strip()
        course_id = (data.get('course_id') or '').strip()
        if not student_id or not course_id:
            return jsonify({'error': 'student_id and course_id are required'}), 400

        # admin client justified: admin-only route (@require_org_admin) — needs RLS bypass for cross-tenant administration
        client = get_supabase_admin_client()

        # The student must belong to this organization, or the enrolment must be
        # one this org created on an outside account. That second case is the
        # whole boundary: unenroll_user() deletes user_quests and
        # user_quest_tasks, so a partner may withdraw what it sold and nothing
        # else. An enrolment somebody else made carries somebody else's work.
        student_res = client.table('users').select('id, organization_id').eq('id', student_id).single().execute()
        if not student_res.data:
            return jsonify({'error': 'Student not found in this organization'}), 404
        if student_res.data.get('organization_id') != org_id:
            repo = PartnerEnrollmentRepository(client=client)
            if not repo.was_sold_by(org_id, student_id, course_id):
                return jsonify({'error': 'Student not found in this organization'}), 404

        from services.course_enrollment_service import CourseEnrollmentService
        result = CourseEnrollmentService(client).unenroll_user(student_id, course_id)
        if not result.get('success'):
            return jsonify({'error': result.get('error', 'Failed to remove access')}), 500

        logger.info(f"Removed course {course_id} access for student {student_id} in org {org_id} by {current_user_id}")
        return jsonify({'success': True, 'message': 'Access removed.'}), 200

    except Exception as e:
        logger.error(f"Error removing course enrollment in org {org_id}: {e}")
        raise
