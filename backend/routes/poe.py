"""
POE (Pipe Organ Encounter) 2026 pilot routes.

Public, unauthenticated endpoints that back the per-camp enrollment funnel:

    GET  /api/public/poe/cohorts  -> active POE locations for the registration picker
    POST /api/public/poe/enroll   -> create the teen's account, record parental consent
                                     (inline e-signature), and set up their "Pipe Organ
                                     Encounter" journal topic for the selected location.

Design decisions (see CLAUDE.md memory project_poe_pilot):
- No course/quest/task. Each participant documents their week into a journal topic
  (interest_tracks row); poe_participants ties them to the camp and that topic.
- The participant gets an INDEPENDENT student account they own (ready at camp),
  not a 5-12 managed dependent.
- Consent is captured INLINE for minors (typed name + checkbox), logged to
  parental_consent_log with consent_method='esignature'.
- SOFT GATE: a teen may enroll and start logging even if the parent hasn't signed
  yet; consent only blocks credit finalization downstream (Phase 3). When the
  signature is present we mark consent verified immediately.
- Credit flows through Optio's standard review of the documented topic, not parent
  self-attestation.
"""

import re
import secrets
from datetime import datetime, date

from flask import Blueprint, request, jsonify

from database import get_supabase_admin_client
from middleware.rate_limiter import rate_limit
from utils.validation import sanitize_input
from utils.logger import get_logger
from utils.log_scrubber import mask_email

logger = get_logger(__name__)

bp = Blueprint('poe', __name__, url_prefix='/api/public/poe')

# Version stamp for the consent statement the parent agrees to. Bump when the
# wording on the enrollment page changes so logged consents stay auditable.
POE_CONSENT_VERSION = '2026-06-01'

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
    Create the participant's account, record parental consent, and set up their
    "Pipe Organ Encounter" journal topic for the POE they select at registration.

    Body:
        poe_cohort: slug of the selected POE location (poe_cohorts.slug)
        student:  { first_name, last_name, email, password, date_of_birth (YYYY-MM-DD) }
        parent:   { first_name?, last_name?, email }   # required for minors (13-17)
        consent:  { signature_name, agreed: true }     # parent's inline e-signature; optional (soft gate)
        school:   { is_homeschool, name, city?, state?, contact_email? }  # credit destination;
                  name required unless is_homeschool (then a standalone transcript is issued)

    Minors (13-17) must supply a parent email. If the parent's e-signature is
    present we mark consent verified now; if not, the account is still created
    (soft gate) with consent pending. Under-13 self-enrollment is blocked (COPPA).
    Adults (18+) self-consent; no parent required.
    """
    cohort_slug = ''
    try:
        data = request.json or {}
        cohort_slug = (data.get('poe_cohort') or '').strip()
        if not cohort_slug:
            return jsonify({'error': 'Please select your POE location.'}), 400
        student = data.get('student') or {}
        parent = data.get('parent') or {}
        consent = data.get('consent') or {}
        school = data.get('school') or {}

        first_name = (student.get('first_name') or '').strip()
        last_name = (student.get('last_name') or '').strip()
        email = (student.get('email') or '').strip().lower()
        password = student.get('password') or ''
        dob = (student.get('date_of_birth') or '').strip()

        # --- Basic validation ---
        if not first_name or not last_name:
            return jsonify({'error': 'First and last name are required.'}), 400
        if not EMAIL_RE.match(email):
            return jsonify({'error': 'A valid email address is required.'}), 400
        if len(password) < 6:
            return jsonify({'error': 'Password must be at least 6 characters.'}), 400

        age = _age_from_dob(dob)
        if age is None:
            return jsonify({'error': 'A valid date of birth (YYYY-MM-DD) is required.'}), 400

        if age < 13:
            # COPPA: under-13s cannot self-enroll. POE participants are teens, so
            # this is an edge case — route the family to the parent-managed path.
            return jsonify({
                'error': 'under_13_not_supported',
                'message': ('Participants under 13 cannot enroll directly. A parent '
                            'should create an Optio account and add the child as a '
                            'managed profile, then contact us about the POE.'),
            }), 400

        is_minor = age < 18
        parent_email = (parent.get('email') or '').strip().lower()
        if is_minor and not EMAIL_RE.match(parent_email):
            return jsonify({
                'error': 'parent_email_required',
                'message': 'A parent or guardian email is required to enroll a participant under 18.',
            }), 400

        signature_name = (consent.get('signature_name') or '').strip()
        consent_signed = bool(consent.get('agreed')) and bool(signature_name)

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

        # admin client justified: pre-auth enrollment; creates the auth user and
        # writes users/diplomas/consent before any session exists.
        client = get_supabase_admin_client()

        # --- Cohort lookup (must be active) ---
        cohort_result = client.table('poe_cohorts').select(
            'id, slug, display_name, is_active'
        ).eq('slug', cohort_slug).execute()
        if not cohort_result.data:
            return jsonify({'error': 'That POE location was not found.'}), 404
        cohort = cohort_result.data[0]
        if not cohort.get('is_active'):
            return jsonify({'error': 'Enrollment for this POE is closed.'}), 400

        # --- Create the participant's auth account ---
        from app_config import Config
        redirect_url = f"{Config.FRONTEND_URL}/login"
        try:
            auth_response = client.auth.sign_up({
                'email': email,
                'password': password,
                'options': {
                    'data': {'first_name': first_name, 'last_name': last_name},
                    'email_redirect_to': redirect_url,
                },
            })
        except Exception as auth_error:
            err = str(auth_error).lower()
            if any(s in err for s in ('already registered', 'already exists', 'user already exists')):
                return jsonify({
                    'error': 'email_exists',
                    'message': ('An account with this email already exists. Log in first, '
                                'then open the POE enrollment link again to join.'),
                }), 409
            if 'rate limit' in err:
                return jsonify({'error': 'Too many attempts. Please wait a minute and try again.'}), 429
            if 'weak' in err or 'pwned' in err or 'leaked' in err:
                return jsonify({'error': 'That password is too common or easy to guess. Please choose a stronger one.'}), 400
            if 'invalid' in err and 'email' in err:
                return jsonify({'error': 'That email address cannot be used. Please use a different one.'}), 400
            logger.error(f"[POE] auth sign_up failed for {mask_email(email)}: {auth_error}")
            return jsonify({'error': 'Could not create the account. Please try again.'}), 502

        if not auth_response.user:
            return jsonify({'error': 'Could not create the account. Please try again.'}), 502

        # Supabase does NOT raise for an already-registered email when email
        # confirmation is on; to prevent enumeration it returns an obfuscated
        # user with a random id and an empty identities list. Inserting that
        # fake id into users would violate the auth.users FK, so detect it here
        # and surface the same "email exists" guidance as the exception path.
        if not getattr(auth_response.user, 'identities', None):
            return jsonify({
                'error': 'email_exists',
                'message': ('An account with this email already exists. Log in first, '
                            'then open the POE enrollment link again to join.'),
            }), 409

        user_id = auth_response.user.id

        # --- Create the users profile row (independent platform student) ---
        from legal_versions import CURRENT_TOS_VERSION, CURRENT_PRIVACY_POLICY_VERSION
        user_data = {
            'id': user_id,
            'first_name': sanitize_input(first_name),
            'last_name': sanitize_input(last_name),
            'email': email,
            'role': 'student',
            'date_of_birth': dob,
            'tos_accepted_at': 'now()',
            'privacy_policy_accepted_at': 'now()',
            'tos_version': CURRENT_TOS_VERSION,
            'privacy_policy_version': CURRENT_PRIVACY_POLICY_VERSION,
            'created_at': 'now()',
        }
        if is_minor:
            # Track the guardian contact and consent state on the student record.
            user_data['parental_consent_email'] = parent_email
            user_data['requires_parental_consent'] = age < 13  # COPPA flag (always False here)
            user_data['parental_consent_verified'] = consent_signed
            user_data['parental_consent_status'] = 'approved' if consent_signed else 'pending_submission'
            if consent_signed:
                user_data['parental_consent_verified_at'] = 'now()'
                user_data['parental_consent_submitted_at'] = 'now()'

        try:
            client.table('users').upsert(user_data, on_conflict='id').execute()
        except Exception as profile_err:
            logger.error(f"[POE] profile creation failed for {mask_email(email)}: {profile_err}")
            return jsonify({'error': 'Could not finish creating the account. Please try again.'}), 500

        # Backstop diploma + skill initialization (DB trigger usually handles it).
        try:
            from routes.auth.registration import ensure_user_diploma_and_skills
            ensure_user_diploma_and_skills(client, user_id, user_data['first_name'], user_data['last_name'])
        except Exception as init_err:
            logger.warning(f"[POE] diploma/skill init skipped for {user_id}: {init_err}")

        # --- Log the consent record (audit trail) ---
        if is_minor:
            try:
                consent_row = {
                    'user_id': user_id,
                    'child_email': email,
                    'parent_email': parent_email,
                    'consent_token': secrets.token_urlsafe(32),
                    'consent_sent_at': 'now()',
                    'consent_method': 'esignature',
                    'consent_statement_version': POE_CONSENT_VERSION,
                }
                if consent_signed:
                    consent_row['signature_name'] = sanitize_input(signature_name)
                    consent_row['consent_verified_at'] = 'now()'
                    forwarded = request.headers.get('X-Forwarded-For', '')
                    ip = forwarded.split(',')[0].strip() if forwarded else request.remote_addr
                    if ip:
                        consent_row['ip_address'] = ip
                    consent_row['user_agent'] = request.headers.get('User-Agent')
                client.table('parental_consent_log').insert(consent_row).execute()
            except Exception as consent_err:
                # Consent logging failure shouldn't strand the account; log loudly.
                logger.error(f"[POE] consent log insert failed for {user_id}: {consent_err}")

        # --- Create the POE journal topic + participation record ---
        # Participants document their week into a "Pipe Organ Encounter" journal
        # topic (interest_tracks row). poe_participants ties the student to the camp
        # and to that topic so review and the post-pilot report can find their work.
        track_id = None
        try:
            from services.interest_tracks_service import InterestTracksService
            track_result = InterestTracksService.create_track(
                user_id=user_id,
                name='Pipe Organ Encounter',
                description=f"My {cohort['display_name']} learning journal.",
                icon='music',
            )
            if track_result.get('success'):
                track_id = (track_result.get('track') or {}).get('id')
            else:
                logger.warning(f"[POE] topic creation failed for {user_id}: {track_result.get('error')}")
        except Exception as track_err:
            logger.error(f"[POE] topic creation error for {user_id}: {track_err}")

        enrolled = False
        try:
            client.table('poe_participants').insert({
                'user_id': user_id,
                'poe_cohort_id': cohort['id'],
                'track_id': track_id,
                'is_homeschool': is_homeschool,
                'school_name': school_name or None,
                'school_city': school_city or None,
                'school_state': school_state or None,
                'school_contact_email': school_contact_email or None,
            }).execute()
            enrolled = True
        except Exception as part_err:
            logger.error(f"[POE] participant insert failed for {user_id}: {part_err}")

        logger.info(
            f"[POE] enrolled user={user_id} cohort={cohort['slug']} "
            f"minor={is_minor} consent_signed={consent_signed} topic={track_id} participant={enrolled}"
        )

        return jsonify({
            'success': True,
            'message': 'Account created. Check your email to verify, then log in to start logging your POE.',
            'email_verification_required': not bool(auth_response.session),
            'consent_pending': is_minor and not consent_signed,
            'enrolled': enrolled,
        }), 201

    except Exception as e:
        logger.error(f"[POE] enrollment error for cohort '{cohort_slug}': {str(e)}", exc_info=True)
        return jsonify({'error': 'Enrollment failed. Please try again.'}), 500
