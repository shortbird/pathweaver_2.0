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

import hmac
import re
from datetime import datetime, date

from flask import Blueprint, request, jsonify

from app_config import Config
from database import get_supabase_admin_client
from middleware.rate_limiter import rate_limit
from utils.validation import sanitize_input
from utils.logger import get_logger
from utils.log_scrubber import mask_email
from utils.storage_urls import sign_stored_urls, sign_thumb_urls

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
        # POE Parents has no automation behind it today, so crm_funnel is
        # normally None and the confirmation's [COPY] tells Tanner to reply
        # himself. It picks one up automatically if an automation is ever added.
        crm_funnel = None
        if parent_email:
            try:
                from services.crm_service import sync_poe_parent
                crm_funnel = sync_poe_parent(
                    parent_email, first_name=parent_first_name, last_name=parent_last_name
                )
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
                crm_funnel=crm_funnel,
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


# ── Showcase: the whole 2026 pilot on one unauthenticated page ────────────────
#
# POE/AGO leadership are not Optio users and never will be, so the summary of
# what their campers documented cannot live behind a login. It is gated on an
# unguessable key in the URL (Config.POE_SHOWCASE_KEY) instead. Everything the
# page returns is deliberately narrowed:
#
#   * blocks a student or family marked private are dropped
#   * evidence documents still in `draft`, or marked confidential, are dropped
#   * participants are named "First L." — enough for staff who ran the camp to
#     recognize a camper, without publishing a minor's full name next to their
#     photograph
#   * internal test participants (plus-addressed superadmin accounts) are skipped
#
# The dataset is the four 2026 camps: ~20 participants, ~70 documents, ~200
# blocks. It is bounded by the pilot, not by org size, so the reads below are
# single un-paged queries on purpose.

SHOWCASE_MEDIA_BLOCKS = ('image', 'video', 'document', 'link')


def _is_internal_test_account(email):
    """True for plus-addressed variants of the superadmin's own address.

    The pilot has one such participant (a dry run of the camper flow). It is a
    real row with real evidence, so nothing else distinguishes it from a camper.
    """
    superadmin = (Config.SUPERADMIN_EMAIL or '').strip().lower()
    email = (email or '').strip().lower()
    if not superadmin or not email:
        return False
    if email == superadmin:
        return True
    local, _, domain = superadmin.partition('@')
    return bool(local) and email.startswith(f'{local}+') and email.endswith(f'@{domain}')


def _short_name(first, last):
    """"Aleena Mayer" -> "Aleena M." """
    first = (first or '').strip()
    last = (last or '').strip()
    if not first:
        return 'Participant'
    return f'{first} {last[0]}.' if last else first


def _day_number(title):
    """Sort key from a "POE Day 3" task title; unrecognized titles sort last."""
    match = re.search(r'(\d+)', title or '')
    return int(match.group(1)) if match else 99


def _block_items(content):
    """The item dicts in a block, across both shapes stored in the table.

    Current blocks hold ``{'items': [...]}``; older ones are a single item with
    ``url``/``filename`` at the top level.
    """
    items = content.get('items')
    if isinstance(items, list):
        return [i for i in items if isinstance(i, dict)]
    return [content] if content.get('url') else []


def _showcase_block(block, urls):
    """One evidence block, reduced to what the page renders.

    ``urls`` maps a stored URL to ``(display_url, thumb_url)``. Returns None for
    a block with nothing left to show (an image block whose only item failed to
    resolve, say), so empty shells don't reach the page.
    """
    block_type = block.get('block_type')
    content = block.get('content') or {}

    if block_type == 'text':
        text = (content.get('text') or '').strip()
        return {'type': 'text', 'text': text} if text else None

    if block_type not in SHOWCASE_MEDIA_BLOCKS:
        return None

    items = []
    for item in _block_items(content):
        raw = item.get('url')
        url, thumb = urls.get(raw, (raw, None))
        if not url:
            continue
        shaped = {
            'url': url,
            'title': (item.get('title') or item.get('filename') or '').strip() or None,
            'caption': (item.get('caption') or '').strip() or None,
        }
        if thumb:
            shaped['thumb_url'] = thumb
        items.append(shaped)

    return {'type': block_type, 'items': items} if items else None


@bp.route('/showcase', methods=['GET'])
@rate_limit(max_requests=30, window_seconds=60)
def poe_showcase():
    """Every non-private piece of POE evidence, grouped camp -> camper -> day.

    Auth: `?key=` must equal Config.POE_SHOWCASE_KEY. A wrong or missing key is
    a 404, not a 403 — a caller without the link learns nothing about whether
    the page exists.
    """
    expected = Config.POE_SHOWCASE_KEY
    supplied = request.args.get('key') or ''
    if not expected or not hmac.compare_digest(str(supplied), str(expected)):
        return jsonify({'error': 'Not found'}), 404

    try:
        # admin client justified: unauthenticated key-gated read; RLS denies anon by design
        client = get_supabase_admin_client()

        cohorts = (client.table('poe_cohorts')
                   .select('id, slug, display_name, site_city, summary, start_date, end_date')
                   .order('start_date').execute().data or [])
        if not cohorts:
            return jsonify({'error': 'Not found'}), 404

        participants = (client.table('poe_participants')
                        .select('user_id, poe_cohort_id, class_quest_id, credit_awarded_at')
                        .execute().data or [])
        participants = [p for p in participants if p.get('user_id') and p.get('class_quest_id')]
        if not participants:
            return jsonify({'error': 'Not found'}), 404

        user_ids = list({p['user_id'] for p in participants})
        users = (client.table('users').select('id, first_name, last_name, email')
                 .in_('id', user_ids).execute().data or [])
        users_by_id = {u['id']: u for u in users}

        participants = [
            p for p in participants
            if p['user_id'] in users_by_id
            and not _is_internal_test_account(users_by_id[p['user_id']].get('email'))
        ]
        user_ids = list({p['user_id'] for p in participants})
        quest_ids = list({p['class_quest_id'] for p in participants})

        # Submitted evidence only. A draft is a camper's unfinished page, and a
        # confidential document was flagged as not for outside eyes.
        # Credit is recorded on the class quest's review, not on
        # poe_participants.credit_awarded_at — that column is still null for the
        # whole 2026 pilot, so reading it reported "0 credits awarded" for a
        # cohort where 14 campers had in fact been granted the credit.
        credited_quest_ids = set()
        if quest_ids:
            credited = (client.table('quests').select('id, class_review_status')
                        .in_('id', quest_ids)
                        .eq('class_review_status', 'credit_awarded').execute().data or [])
            credited_quest_ids = {q['id'] for q in credited}

        docs = (client.table('user_task_evidence_documents')
                .select('id, user_id, quest_id, task_id, completed_at, updated_at')
                .in_('user_id', user_ids).in_('quest_id', quest_ids)
                .eq('status', 'completed').neq('is_confidential', True)
                .execute().data or [])

        task_ids = list({d['task_id'] for d in docs if d.get('task_id')})
        tasks_by_id = {}
        if task_ids:
            tasks = (client.table('user_quest_tasks').select('id, title, xp_value')
                     .in_('id', task_ids).execute().data or [])
            tasks_by_id = {t['id']: t for t in tasks}

        doc_ids = [d['id'] for d in docs]
        blocks = []
        if doc_ids:
            blocks = (client.table('evidence_document_blocks')
                      .select('document_id, block_type, content, order_index')
                      .in_('document_id', doc_ids).eq('is_private', False)
                      .order('order_index').execute().data or [])

        # quest-evidence is a private bucket, so every URL the database holds
        # has to be re-signed to be loadable at all. 4h rather than the platform
        # default of 1h: this is ~200 media items somebody reads end to end in
        # one sitting, and on the default TTL the photos further down go dead
        # mid-read. Long enough to read, short enough that a copied image URL
        # isn't a lasting handout.
        ttl = 4 * 3600
        image_urls, other_urls = [], []
        for block in blocks:
            target = image_urls if block.get('block_type') == 'image' else other_urls
            target.extend(
                item['url'] for item in _block_items(block.get('content') or {})
                if item.get('url')
            )

        # Photos go through the image transform twice: a grid thumbnail, and a
        # downscaled full view for the lightbox. Serving 195 original phone
        # photos would make the page unusable, and the transform is also what
        # renders the one HEIC upload in a browser that can't decode HEIC.
        urls = {}
        if other_urls:
            urls.update({
                raw: (signed, None)
                for raw, signed in sign_stored_urls(other_urls, expires_in=ttl).items()
            })
        if image_urls:
            full = sign_stored_urls(image_urls, expires_in=ttl)
            large = sign_thumb_urls(image_urls, expires_in=ttl, size=1600, quality=80)
            thumbs = sign_thumb_urls(image_urls, expires_in=ttl, size=640, quality=70)
            for raw in set(image_urls):
                # A transform can fail (missing object); fall back to the plain
                # signed URL rather than dropping the photo off the page.
                urls[raw] = (large.get(raw) or full.get(raw) or raw,
                             thumbs.get(raw) or full.get(raw) or raw)

        blocks_by_doc = {}
        for block in blocks:
            shaped = _showcase_block(block, urls)
            if shaped:
                blocks_by_doc.setdefault(block['document_id'], []).append(shaped)

        docs_by_user = {}
        for doc in docs:
            docs_by_user.setdefault(doc['user_id'], []).append(doc)

        totals = {
            'cohorts': 0, 'participants': 0, 'participants_with_evidence': 0,
            'credits_awarded': 0, 'days_documented': 0,
            'reflections': 0, 'words': 0, 'photos': 0, 'videos': 0, 'documents': 0,
        }

        out_cohorts = []
        for cohort in cohorts:
            cohort_participants = []
            for participant in participants:
                if participant['poe_cohort_id'] != cohort['id']:
                    continue
                user = users_by_id[participant['user_id']]
                credit_awarded = (
                    bool(participant.get('credit_awarded_at'))
                    or participant['class_quest_id'] in credited_quest_ids
                )

                days = []
                for doc in docs_by_user.get(participant['user_id'], []):
                    if doc.get('quest_id') != participant['class_quest_id']:
                        continue
                    doc_blocks = blocks_by_doc.get(doc['id'])
                    if not doc_blocks:
                        continue
                    task = tasks_by_id.get(doc.get('task_id')) or {}
                    days.append({
                        'title': task.get('title') or 'Evidence',
                        'day': _day_number(task.get('title')),
                        'completed_at': doc.get('completed_at') or doc.get('updated_at'),
                        'blocks': doc_blocks,
                    })
                days.sort(key=lambda d: d['day'])

                # Participants who documented nothing are counted, not listed —
                # an empty card adds no signal to a page about the work done.
                if not days:
                    totals['participants'] += 1
                    if credit_awarded:
                        totals['credits_awarded'] += 1
                    continue

                for day in days:
                    for block in day['blocks']:
                        if block['type'] == 'text':
                            totals['reflections'] += 1
                            totals['words'] += len(block['text'].split())
                        elif block['type'] == 'image':
                            totals['photos'] += len(block['items'])
                        elif block['type'] == 'video':
                            totals['videos'] += len(block['items'])
                        elif block['type'] == 'document':
                            totals['documents'] += len(block['items'])

                totals['participants'] += 1
                totals['participants_with_evidence'] += 1
                totals['days_documented'] += len(days)
                if credit_awarded:
                    totals['credits_awarded'] += 1

                cohort_participants.append({
                    'name': _short_name(user.get('first_name'), user.get('last_name')),
                    'credit_awarded': credit_awarded,
                    'days': days,
                })

            if not cohort_participants:
                continue

            cohort_participants.sort(key=lambda p: p['name'])
            totals['cohorts'] += 1
            out_cohorts.append({
                'slug': cohort.get('slug'),
                'display_name': cohort.get('display_name'),
                'site_city': cohort.get('site_city'),
                'start_date': cohort.get('start_date'),
                'end_date': cohort.get('end_date'),
                'participants': cohort_participants,
            })

        return jsonify({
            'success': True,
            'generated_at': datetime.utcnow().isoformat() + 'Z',
            'totals': totals,
            'cohorts': out_cohorts,
        }), 200

    except Exception as e:
        logger.error(f"[POE] showcase failed: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to load the POE showcase'}), 500
