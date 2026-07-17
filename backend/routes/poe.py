"""
POE (Pipe Organ Encounter) 2026 pilot routes.

Public, unauthenticated endpoints that back the per-camp interest funnel:

    GET  /api/public/poe/cohorts  -> active POE locations for the registration picker
    POST /api/public/poe/enroll   -> add the participant to the POE credit-interest
                                     list and send a confirmation email.

Design decisions (see CLAUDE.md memory project_poe_pilot):
- This is an INTEREST CAPTURE list, NOT a sign-up / account-creation flow. We do
  not create an auth user, users row, journal topic, or consent record here. That
  page being a real signup added confusion; instead we collect contact info +
  which camp + where the credit should go, store it in poe_signups, and email a
  confirmation. Optio follows up closer to camp to onboard real accounts (where
  legal consent is then captured).
- For minors (under 18) we capture a parent/guardian email so we can follow up,
  and the confirmation email is also sent to the parent. We do not collect inline
  consent at this stage.
- Credit flows through Optio's standard review of documented work later in the
  pilot, not parent self-attestation.
"""

import re
from datetime import datetime, date

from flask import Blueprint, request, jsonify

from database import get_supabase_admin_client
from middleware.rate_limiter import rate_limit
from utils.validation import sanitize_input
from utils.logger import get_logger
from utils.log_scrubber import mask_email

logger = get_logger(__name__)

bp = Blueprint('poe', __name__, url_prefix='/api/public/poe')

EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


def _age_from_dob(dob_str):
    """Return age in years from a YYYY-MM-DD string, or None if unparseable."""
    try:
        dob = datetime.strptime(dob_str, '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return None
    return (date.today() - dob).days / 365.25


def _public_cohort(cohort):
    """Strip internal fields before returning a cohort to the public page."""
    return {
        'slug': cohort.get('slug'),
        'display_name': cohort.get('display_name'),
        'site_city': cohort.get('site_city'),
        'summary': cohort.get('summary'),
        'start_date': cohort.get('start_date'),
        'end_date': cohort.get('end_date'),
        'is_active': bool(cohort.get('is_active')),
        'enrollment_open': bool(cohort.get('is_active')),
    }


@bp.route('/cohorts', methods=['GET'])
def list_poe_cohorts():
    """Active POE locations for the registration picker. No auth required."""
    try:
        # admin client justified: unauthenticated public read; RLS denies anon by design
        client = get_supabase_admin_client()
        result = client.table('poe_cohorts').select(
            'slug, display_name, site_city, summary, start_date, end_date, is_active'
        ).eq('is_active', True).order('start_date').execute()

        cohorts = [_public_cohort(c) for c in (result.data or [])]
        return jsonify({'success': True, 'cohorts': cohorts}), 200

    except Exception as e:
        logger.error(f"Error listing POE cohorts: {str(e)}")
        return jsonify({'error': 'Failed to load POEs'}), 500


@bp.route('/enroll', methods=['POST'])
@rate_limit(max_requests=5, window_seconds=300)  # match /register
def enroll_in_poe():
    """
    Add a participant to the POE credit-interest list and email a confirmation.

    This does NOT create an account. It records the participant's contact info,
    which camp they're attending, and where their fine-arts credit should go, then
    sends a confirmation email (also to the parent for minors). Optio follows up
    later to onboard a real account.

    Body:
        poe_cohort: slug of the selected POE location (poe_cohorts.slug)
        student:  { first_name, last_name, email, date_of_birth (YYYY-MM-DD) }
        parent:   { first_name?, last_name?, email }   # required for minors (under 18)
        school:   { is_homeschool, name, city?, state?, contact_email? }  # credit destination;
                  name required unless is_homeschool (then a standalone transcript is issued)

    Minors (under 18) must supply a parent/guardian email. Under-13 self-signup is
    blocked (COPPA) — route those families to the parent-managed path.
    """
    cohort_slug = ''
    try:
        data = request.json or {}
        cohort_slug = (data.get('poe_cohort') or '').strip()
        if not cohort_slug:
            return jsonify({'error': 'Please select your POE location.'}), 400
        student = data.get('student') or {}
        parent = data.get('parent') or {}
        school = data.get('school') or {}

        first_name = (student.get('first_name') or '').strip()
        last_name = (student.get('last_name') or '').strip()
        email = (student.get('email') or '').strip().lower()
        dob = (student.get('date_of_birth') or '').strip()

        # --- Basic validation ---
        if not first_name or not last_name:
            return jsonify({'error': 'First and last name are required.'}), 400
        if not EMAIL_RE.match(email):
            return jsonify({'error': 'A valid email address is required.'}), 400

        age = _age_from_dob(dob)
        if age is None:
            return jsonify({'error': 'A valid date of birth (YYYY-MM-DD) is required.'}), 400

        if age < 13:
            # COPPA: under-13s cannot self-register. POE participants are teens, so
            # this is an edge case — route the family to the parent-managed path.
            return jsonify({
                'error': 'under_13_not_supported',
                'message': ('Participants under 13 cannot sign up directly. A parent '
                            'should reach out and we will help set things up.'),
            }), 400

        is_minor = age < 18
        parent_first_name = (parent.get('first_name') or '').strip()
        parent_last_name = (parent.get('last_name') or '').strip()
        parent_email = (parent.get('email') or '').strip().lower()
        if is_minor and not EMAIL_RE.match(parent_email):
            return jsonify({
                'error': 'parent_email_required',
                'message': 'A parent or guardian email is required to sign up a participant under 18.',
            }), 400

        # --- Credit destination: school of record, or homeschool/unenrolled ---
        is_homeschool = bool(school.get('is_homeschool'))
        school_name = (school.get('name') or '').strip()
        school_city = (school.get('city') or '').strip()
        school_state = (school.get('state') or '').strip()
        school_contact_email = (school.get('contact_email') or '').strip().lower()
        if not is_homeschool and not school_name:
            return jsonify({
                'error': 'school_required',
                'message': 'Tell us which school should receive your credit, or choose homeschool / not enrolled.',
            }), 400
        if school_contact_email and not EMAIL_RE.match(school_contact_email):
            return jsonify({'error': 'A valid school contact email is required (or leave it blank).'}), 400

        # admin client justified: unauthenticated public write; RLS denies anon by design.
        client = get_supabase_admin_client()

        # --- Cohort lookup (must be active) ---
        cohort_result = client.table('poe_cohorts').select(
            'id, slug, display_name, is_active'
        ).eq('slug', cohort_slug).execute()
        if not cohort_result.data:
            return jsonify({'error': 'That POE location was not found.'}), 404
        cohort = cohort_result.data[0]
        if not cohort.get('is_active'):
            return jsonify({'error': 'Signups for this POE are closed.'}), 400

        # --- Upsert the interest-list signup (one row per email per camp) ---
        signup_row = {
            'poe_cohort_id': cohort['id'],
            'first_name': sanitize_input(first_name),
            'last_name': sanitize_input(last_name),
            'email': email,
            'date_of_birth': dob,
            'is_minor': is_minor,
            'parent_first_name': sanitize_input(parent_first_name) if parent_first_name else None,
            'parent_last_name': sanitize_input(parent_last_name) if parent_last_name else None,
            'parent_email': parent_email or None,
            'is_homeschool': is_homeschool,
            'school_name': school_name or None,
            'school_city': school_city or None,
            'school_state': school_state or None,
            'school_contact_email': school_contact_email or None,
            'updated_at': 'now()',
        }
        try:
            client.table('poe_signups').upsert(
                signup_row, on_conflict='poe_cohort_id,email'
            ).execute()
        except Exception as signup_err:
            logger.error(f"[POE] signup insert failed for {mask_email(email)}: {signup_err}")
            return jsonify({'error': 'Could not save your signup. Please try again.'}), 500

        # If this email already has an Optio account, activate the POE class in
        # it right away. Registration-time auto-link only covers the
        # signup-then-register ordering; without this, an account created before
        # the form was submitted never gets linked. Fire-and-forget.
        try:
            from routes.admin.poe import auto_link_poe_on_signup
            auto_link_poe_on_signup(email, cohort, signup_row)
        except Exception as link_err:
            logger.warning(f"[POE] auto-link on signup skipped for {mask_email(email)}: {link_err}")

        # Marketing sync: parent email only, never the student's (all POE
        # signups are minors). Fire-and-forget.
        if parent_email:
            try:
                from services.brevo_service import sync_poe_parent
                sync_poe_parent(parent_email, first_name=parent_first_name, last_name=parent_last_name)
            except Exception as brevo_err:
                logger.warning(f"[POE] Brevo parent sync skipped: {brevo_err}")

        # --- Send the confirmation email (also to the parent for minors) ---
        email_sent = False
        try:
            from services.email_service import EmailService
            cc = [parent_email] if (is_minor and parent_email) else None
            email_sent = EmailService().send_poe_signup_confirmation(
                to_email=email,
                first_name=first_name,
                cohort_name=cohort.get('display_name') or 'your Pipe Organ Encounter',
                cc=cc,
            )
            if email_sent:
                client.table('poe_signups').update(
                    {'confirmation_sent_at': 'now()'}
                ).eq('poe_cohort_id', cohort['id']).eq('email', email).execute()
        except Exception as mail_err:
            # A failed confirmation email shouldn't lose the signup; log and move on.
            logger.error(f"[POE] confirmation email failed for {mask_email(email)}: {mail_err}")

        logger.info(
            f"[POE] signup user_email={mask_email(email)} cohort={cohort['slug']} "
            f"minor={is_minor} confirmation_sent={email_sent}"
        )

        return jsonify({
            'success': True,
            'message': "You're on the list. Check your email for a confirmation.",
            'confirmation_sent': email_sent,
        }), 201

    except Exception as e:
        logger.error(f"[POE] signup error for cohort '{cohort_slug}': {str(e)}", exc_info=True)
        return jsonify({'error': 'Signup failed. Please try again.'}), 500
