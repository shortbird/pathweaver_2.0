"""
POE (Pipe Organ Encounter) 2026 pilot — admin onboarding + credit endpoints.

Superadmin-only. These back the email-driven onboarding model (see
POE_LAUNCH_PLAN.md): `/poe` stays a pure interest form, participants self-register
in the normal app (Google or email/password), then Tanner runs these steps.

    GET  /api/admin/poe/signups?cohort=<slug>  -> reconcile signups vs registered vs linked
    POST /api/admin/poe/link-participant        -> link a registered user to POE
    POST /api/admin/poe/award-credit            -> attendance-confirmed -> award 0.5 Fine Arts credit

Credit model (decided 2026-06-04): attending the POE earns 0.5 Fine Arts credit.
Documenting the week in the app is encouraged but optional (not a credit gate).

- "link-participant" creates the student's own quest_type='class' "Pipe Organ
  Encounter" quest (transcript_subject='fine_arts'), enrolls them (the enrolled
  class doubles as the journal topic they document into), and writes a
  poe_participants row.
- "award-credit" (post-camp) marks that class credit_awarded AND deposits
  POE_CREDIT_XP fine_arts subject XP so the 0.5 credit lands on the transcript
  (the transcript is driven by user_subject_xp at 2000 XP/credit; the class
  flag alone does not add transcript credit). Idempotent via
  poe_participants.credit_awarded_at.
"""

from datetime import datetime, timezone

from flask import Blueprint, request

from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from utils.api_response_v1 import success_response, error_response
from utils.logger import get_logger
from utils.log_scrubber import mask_email

logger = get_logger(__name__)

bp = Blueprint('admin_poe', __name__, url_prefix='/api/admin/poe')

POE_CLASS_TITLE = 'Pipe Organ Encounter'
POE_CLASS_BIG_IDEA = (
    'Earn 0.5 Fine Arts credit by attending your 2026 Pipe Organ Encounter. '
    'Each day of camp, document what you worked on by attaching evidence to '
    "that day's task — photos, video, audio, or a few notes."
)
POE_TRANSCRIPT_SUBJECT = 'fine_arts'
POE_PILLAR = 'art'              # SUBJECT_TO_PILLAR['fine_arts'] in transfer_credits.py
# AGO Pipe Organ Encounters art (same assets as the /poe hero page). Root-relative
# so they resolve against whatever web origin serves the app (dev + prod).
#   - header_image_url = logo -> contained on the quest CARD (metadata.header_style
#     ='org_logo'); the card honors org_logo and renders it on white.
#   - image_url = hero photo -> full-bleed cover on the quest DETAIL page header
#     (QuestDetailHeader prefers a real cover photo over the org_logo banner).
POE_LOGO_URL = '/poe-logo-horizontal.jpg'
POE_HERO_URL = '/poe-hero.jpg'
POE_CREDIT_XP = 1000           # 0.5 credit at 2000 XP/credit (CreditMappingService.XP_PER_CREDIT)

# One task per day of camp. Students attach learning evidence to each day; the
# enrolled class quest renders these as its tasks on the web app.
#
# XP model (verified 2026-06-17): completing these via the web evidence editor
# (/api/evidence/documents/<id>/complete -> award_xp) awards ONLY pillar XP to
# user_skill_xp. Task completion never writes user_subject_xp (see
# routes/tasks/completion.py "Subject XP is NO LONGER auto-added at completion
# time"). The subject_xp_distribution below is therefore display-only: it drives
# the class progress bar (routes/quest/classes.py _compute_class_progress, a
# pure calc over completed tasks) to fill toward 1000 as the week is documented.
# The real 0.5 Fine Arts credit is deposited once by award-credit on confirmed
# attendance, so there is NO double-count even if a student documents all 5 days.
POE_DAILY_TASK_XP = 200        # 5 days x 200 = 1000 -> progress bar reads "complete"
POE_DAILY_TASKS = [
    ('POE Day 1',
     'Capture how your first day went. Add photos, a short video, or notes about '
     'your lessons, the instruments you saw, and what you want to learn this week.'),
    ('POE Day 2',
     'Document your practice and any theory or musicianship work. What clicked, '
     'and what are you still working on? Attach a recording or notes.'),
    ('POE Day 3',
     'Record what you took away from masterclasses and class sessions. Add notes, '
     'photos, or audio of a piece you heard or played.'),
    ('POE Day 4',
     'Show your repertoire progress and how you are preparing for the recital. '
     'Attach a practice recording, score, or reflection.'),
    ('POE Day 5',
     'Capture your final day: performances, what you accomplished, and a short '
     'reflection on the week. Add video, photos, or written notes.'),
]


def _ensure_daily_tasks(supabase, student_id: str, class_quest_id: str, user_quest_id: str) -> int:
    """Idempotently create the per-day POE tasks for this student's class quest.

    Inserts only the days that are missing (matched by title), so re-running
    link-participant backfills tasks for an already-linked student without
    duplicating them. Returns the number of tasks created.
    """
    existing = supabase.table('user_quest_tasks').select('title') \
        .eq('user_id', student_id).eq('quest_id', class_quest_id).execute().data or []
    existing_titles = {t.get('title') for t in existing}

    rows = []
    for idx, (title, description) in enumerate(POE_DAILY_TASKS):
        if title in existing_titles:
            continue
        rows.append({
            'user_id': student_id,
            'quest_id': class_quest_id,
            'user_quest_id': user_quest_id,
            'title': title,
            'description': description,
            'pillar': POE_PILLAR,
            'xp_value': POE_DAILY_TASK_XP,
            'order_index': idx,
            'is_required': True,
            'is_manual': True,
            'approval_status': 'approved',
            'diploma_subjects': ['Fine Arts'],
            'subject_xp_distribution': {POE_TRANSCRIPT_SUBJECT: POE_DAILY_TASK_XP},
        })

    if rows:
        supabase.table('user_quest_tasks').insert(rows).execute()
    return len(rows)


def _now():
    return datetime.now(timezone.utc).isoformat()


def _find_user_by_email(supabase, email: str):
    """Case-insensitive exact match on users.email. Returns the row or None."""
    res = supabase.table('users').select('id, email, first_name, last_name').ilike('email', email).execute()
    return (res.data or [None])[0]


def _get_cohort(supabase, slug: str):
    res = supabase.table('poe_cohorts').select('id, slug, display_name').eq('slug', slug).execute()
    return (res.data or [None])[0]


def _deposit_subject_xp(supabase, user_id: str, subject: str, pillar: str, xp: int):
    """Add `xp` to the user's subject XP (diploma credit) and pillar XP.

    Mirrors _sync_transfer_credits_to_user_subject_xp in transfer_credits.py so
    POE credit lands on the transcript the same way external/transfer credit does.
    Does NOT touch users.total_xp (transfer credits don't either).
    """
    cur = supabase.table('user_subject_xp').select('id, xp_amount') \
        .eq('user_id', user_id).eq('school_subject', subject).execute()
    if cur.data:
        new_xp = (cur.data[0].get('xp_amount') or 0) + xp
        supabase.table('user_subject_xp').update({'xp_amount': new_xp}).eq('id', cur.data[0]['id']).execute()
    else:
        supabase.table('user_subject_xp').insert({
            'user_id': user_id, 'school_subject': subject, 'xp_amount': xp,
        }).execute()

    cur_p = supabase.table('user_skill_xp').select('id, xp_amount') \
        .eq('user_id', user_id).eq('pillar', pillar).execute()
    if cur_p.data:
        new_p = (cur_p.data[0].get('xp_amount') or 0) + xp
        supabase.table('user_skill_xp').update({'xp_amount': new_p}).eq('id', cur_p.data[0]['id']).execute()
    else:
        supabase.table('user_skill_xp').insert({
            'user_id': user_id, 'pillar': pillar, 'xp_amount': xp,
        }).execute()


def _provision_poe(supabase, student_id: str, cohort: dict, signup: dict | None) -> dict:
    """Create/reuse a student's POE class quest, enroll them, populate the per-day
    tasks, and write a poe_participants row. Idempotent per (student, cohort).

    Shared by the admin link-participant endpoint and auto_link_poe_on_register.
    `supabase` must be an admin client. Returns a summary dict.
    """
    # Idempotency: already linked? Still backfill daily tasks so a participant
    # linked under the pre-daily-task code gets the per-day tasks on re-run.
    existing = supabase.table('poe_participants').select('id, class_quest_id') \
        .eq('user_id', student_id).eq('poe_cohort_id', cohort['id']).execute().data
    if existing:
        existing_class_quest_id = existing[0].get('class_quest_id')
        backfilled = 0
        if existing_class_quest_id:
            enr = supabase.table('user_quests').select('id') \
                .eq('user_id', student_id).eq('quest_id', existing_class_quest_id) \
                .limit(1).execute().data
            if enr:
                backfilled = _ensure_daily_tasks(
                    supabase, student_id, existing_class_quest_id, enr[0]['id']
                )
        return {
            'already_linked': True,
            'poe_participant_id': existing[0]['id'],
            'class_quest_id': existing_class_quest_id,
            'daily_tasks_created': backfilled,
            'user_id': student_id,
            'cohort': cohort['slug'],
        }

    # Reuse an existing POE class quest for this student if one is already there
    # (recovers from a partial prior run), else create it.
    existing_quest = supabase.table('quests').select('id') \
        .eq('created_by', student_id).eq('quest_type', 'class').eq('title', POE_CLASS_TITLE) \
        .limit(1).execute().data
    if existing_quest:
        class_quest_id = existing_quest[0]['id']
    else:
        quest = supabase.table('quests').insert({
            'title': POE_CLASS_TITLE,
            'big_idea': POE_CLASS_BIG_IDEA,
            'description': POE_CLASS_BIG_IDEA,
            'quest_type': 'class',
            'transcript_subject': POE_TRANSCRIPT_SUBJECT,
            'is_active': True,
            'is_public': False,
            'class_review_status': None,
            'created_by': student_id,
            # AGO logo on the card (org_logo, contained); hero photo on the detail page.
            'header_image_url': POE_LOGO_URL,
            'image_url': POE_HERO_URL,
            'metadata': {'header_style': 'org_logo'},
        }).execute()
        if not quest.data:
            raise RuntimeError('Failed to create POE class quest')
        class_quest_id = quest.data[0]['id']

    # Enroll (picked_up + active => shows in My Classes and as a journal topic).
    already_enrolled = supabase.table('user_quests').select('id') \
        .eq('user_id', student_id).eq('quest_id', class_quest_id).limit(1).execute().data
    if already_enrolled:
        user_quest_id = already_enrolled[0]['id']
    else:
        enrollment = supabase.table('user_quests').insert({
            'user_id': student_id,
            'quest_id': class_quest_id,
            'started_at': _now(),
            'is_active': True,
            'status': 'picked_up',
            'times_picked_up': 1,
            'last_picked_up_at': _now(),
            'personalization_completed': True,
        }).execute()
        if not enrollment.data:
            raise RuntimeError('Failed to enroll student in POE class')
        user_quest_id = enrollment.data[0]['id']

    # Populate one task per day of camp so the student has a structured place
    # to attach evidence each day (idempotent; backfills on re-run).
    tasks_created = _ensure_daily_tasks(supabase, student_id, class_quest_id, user_quest_id)

    participant_row = {
        'user_id': student_id,
        'poe_cohort_id': cohort['id'],
        'class_quest_id': class_quest_id,
    }
    if signup:
        participant_row.update({
            'is_homeschool': signup.get('is_homeschool'),
            'school_name': signup.get('school_name'),
            'school_city': signup.get('school_city'),
            'school_state': signup.get('school_state'),
            'school_contact_email': signup.get('school_contact_email'),
        })
    participant = supabase.table('poe_participants').insert(participant_row).execute()

    logger.info(
        f"[POE] provisioned user {student_id[:8]} for cohort {cohort['slug']} "
        f"(class {class_quest_id[:8]}, {tasks_created} daily tasks created)"
    )
    return {
        'linked': True,
        'poe_participant_id': participant.data[0]['id'] if participant.data else None,
        'class_quest_id': class_quest_id,
        'daily_tasks_created': tasks_created,
        'user_id': student_id,
        'cohort': cohort['slug'],
    }


def auto_link_poe_on_register(user_id: str, email: str) -> dict | None:
    """Best-effort: if `email` matches exactly one POE signup, provision that
    student's POE class (quest + daily tasks + participant). No-op otherwise.

    Called fire-and-forget from the registration / OAuth new-user paths, so it
    NEVER raises — any failure is logged and registration proceeds. Ambiguous
    matches (multiple signups) are left for manual link-participant, which can
    disambiguate by cohort. Always uses an admin client (POE tables are
    RLS-protected), so it is safe to call from user-scoped request contexts.
    """
    try:
        email = (email or '').strip().lower()
        if not email or not user_id:
            return None

        admin_supabase = get_supabase_admin_client()
        signups = admin_supabase.table('poe_signups').select(
            'poe_cohort_id, is_homeschool, school_name, school_city, school_state, school_contact_email'
        ).ilike('email', email).execute().data or []

        if len(signups) == 0:
            return None
        if len(signups) > 1:
            logger.info(f"[POE] auto-link skipped for {mask_email(email)}: {len(signups)} signups (needs manual cohort)")
            return {'skipped': 'multiple_signups'}

        signup = signups[0]
        cohort_row = admin_supabase.table('poe_cohorts').select('id, slug, display_name') \
            .eq('id', signup['poe_cohort_id']).execute().data
        cohort = (cohort_row or [None])[0]
        if not cohort:
            return None

        result = _provision_poe(admin_supabase, user_id, cohort, signup)
        logger.info(f"[POE] auto-linked new registration {mask_email(email)} -> cohort {cohort['slug']}")
        return result
    except Exception as e:
        logger.error(f"[POE] auto_link_poe_on_register failed for user {user_id[:8]}: {e}", exc_info=True)
        return None


def auto_link_poe_on_signup(email: str, cohort: dict, signup: dict) -> dict | None:
    """Best-effort: if a POE signup's email already belongs to an Optio account,
    provision that student's POE class immediately (quest + daily tasks +
    participant row).

    Counterpart to auto_link_poe_on_register, which only covers signup-then-
    register ordering; this covers register-then-signup (or a re-submitted form
    with the student's real email). The cohort and signup row are already known
    at the call site, so there is no multiple-signup ambiguity. Called
    fire-and-forget from the public /api/public/poe/enroll route, so it NEVER
    raises. Always uses an admin client (POE tables are RLS-protected).
    """
    try:
        email = (email or '').strip().lower()
        if not email or not cohort:
            return None

        admin_supabase = get_supabase_admin_client()
        user = _find_user_by_email(admin_supabase, email)
        if not user:
            return None

        result = _provision_poe(admin_supabase, user['id'], cohort, signup)
        logger.info(f"[POE] auto-linked existing account {mask_email(email)} -> cohort {cohort.get('slug')} on signup")
        return result
    except Exception as e:
        logger.error(f"[POE] auto_link_poe_on_signup failed for {mask_email(email)}: {e}", exc_info=True)
        return None


@bp.route('/signups', methods=['GET'])
@require_admin
def list_poe_signups(user_id: str):
    """Reconcile a cohort: who signed up, who registered an account, who's linked/awarded."""
    try:
        slug = (request.args.get('cohort') or '').strip()
        if not slug:
            return error_response(code='COHORT_REQUIRED', message='Pass ?cohort=<slug>', status=400)

        supabase = get_supabase_admin_client()
        cohort = _get_cohort(supabase, slug)
        if not cohort:
            return error_response(code='NOT_FOUND', message='Cohort not found', status=404)

        signups = supabase.table('poe_signups').select(
            'first_name, last_name, email, is_minor, parent_email, created_at'
        ).eq('poe_cohort_id', cohort['id']).order('created_at').execute().data or []

        participants = supabase.table('poe_participants').select(
            'user_id, credit_awarded_at'
        ).eq('poe_cohort_id', cohort['id']).execute().data or []

        # Map registered users by email so we can flag registered + linked state.
        emails = [s['email'] for s in signups if s.get('email')]
        users_by_email = {}
        if emails:
            urows = supabase.table('users').select('id, email').in_('email', emails).execute().data or []
            users_by_email = {(u.get('email') or '').lower(): u['id'] for u in urows}
        linked_user_ids = {p['user_id'] for p in participants}
        awarded_user_ids = {p['user_id'] for p in participants if p.get('credit_awarded_at')}

        items = []
        for s in signups:
            uid = users_by_email.get((s.get('email') or '').lower())
            items.append({
                'name': f"{s.get('first_name', '')} {s.get('last_name', '')}".strip(),
                'email': s.get('email'),
                'is_minor': bool(s.get('is_minor')),
                'parent_email': s.get('parent_email'),
                'registered': uid is not None,
                'linked': uid in linked_user_ids if uid else False,
                'credit_awarded': uid in awarded_user_ids if uid else False,
            })

        return success_response(data={
            'cohort': {'slug': cohort['slug'], 'display_name': cohort['display_name']},
            'counts': {
                'signups': len(items),
                'registered': sum(1 for i in items if i['registered']),
                'linked': sum(1 for i in items if i['linked']),
                'credit_awarded': sum(1 for i in items if i['credit_awarded']),
            },
            'participants': items,
        })

    except Exception as e:
        logger.error(f"[POE-admin] list_poe_signups failed: {e}", exc_info=True)
        return error_response(code='FETCH_ERROR', message='Failed to list POE signups', status=500)


@bp.route('/link-participant', methods=['POST'])
@require_admin
def link_participant(user_id: str):
    """
    Link a registered Optio account to POE: create their per-student Fine Arts
    class quest, enroll them (the class doubles as their journal topic), and
    write a poe_participants row. Idempotent per (user, cohort).

    Body: { email (required), poe_cohort (slug; optional if the email has exactly
            one signup) }
    """
    try:
        data = request.get_json() or {}
        email = (data.get('email') or '').strip().lower()
        slug = (data.get('poe_cohort') or '').strip()
        if not email:
            return error_response(code='EMAIL_REQUIRED', message='email is required', status=400)

        supabase = get_supabase_admin_client()

        user = _find_user_by_email(supabase, email)
        if not user:
            return error_response(
                code='NOT_REGISTERED',
                message='No registered Optio account for that email yet. Ask them to register first.',
                status=404,
            )
        student_id = user['id']

        # Find the signup(s) for this email to resolve the cohort + copy school-of-record.
        sq = supabase.table('poe_signups').select(
            'poe_cohort_id, is_homeschool, school_name, school_city, school_state, school_contact_email'
        ).ilike('email', email)
        signups = sq.execute().data or []

        cohort = None
        signup = None
        if slug:
            cohort = _get_cohort(supabase, slug)
            if not cohort:
                return error_response(code='NOT_FOUND', message='Cohort not found', status=404)
            signup = next((s for s in signups if s['poe_cohort_id'] == cohort['id']), None)
        else:
            if len(signups) == 1:
                signup = signups[0]
                cohort_row = supabase.table('poe_cohorts').select('id, slug, display_name') \
                    .eq('id', signup['poe_cohort_id']).execute().data
                cohort = (cohort_row or [None])[0]
            elif len(signups) == 0:
                return error_response(
                    code='NO_SIGNUP',
                    message='No POE signup found for that email. Pass poe_cohort to link anyway.',
                    status=404,
                )
            else:
                return error_response(
                    code='MULTIPLE_SIGNUPS',
                    message='That email signed up for more than one POE. Pass poe_cohort to choose.',
                    status=409,
                )

        if not cohort:
            return error_response(code='NOT_FOUND', message='Cohort not found', status=404)

        result = _provision_poe(supabase, student_id, cohort, signup)
        return success_response(data=result)

    except Exception as e:
        logger.error(f"[POE-admin] link_participant failed: {e}", exc_info=True)
        return error_response(code='LINK_FAILED', message='Failed to link participant', status=500)


@bp.route('/award-credit', methods=['POST'])
@require_admin
def award_credit(user_id: str):
    """
    Director confirmed attendance -> award the 0.5 Fine Arts credit.

    Marks the participant's POE class credit_awarded AND deposits POE_CREDIT_XP
    fine_arts subject XP (so the 0.5 credit shows on the transcript). Idempotent:
    re-running after credit_awarded_at is set does not double-deposit XP.

    Body: { email (required) | user_id, poe_cohort (slug; optional if unambiguous) }
    """
    try:
        data = request.get_json() or {}
        email = (data.get('email') or '').strip().lower()
        target_user_id = (data.get('user_id') or '').strip()
        slug = (data.get('poe_cohort') or '').strip()

        supabase = get_supabase_admin_client()

        if not target_user_id:
            if not email:
                return error_response(code='IDENT_REQUIRED', message='Pass email or user_id', status=400)
            user = _find_user_by_email(supabase, email)
            if not user:
                return error_response(code='NOT_REGISTERED', message='No account for that email', status=404)
            target_user_id = user['id']

        pq = supabase.table('poe_participants').select(
            'id, poe_cohort_id, class_quest_id, credit_awarded_at'
        ).eq('user_id', target_user_id)
        if slug:
            cohort = _get_cohort(supabase, slug)
            if not cohort:
                return error_response(code='NOT_FOUND', message='Cohort not found', status=404)
            pq = pq.eq('poe_cohort_id', cohort['id'])
        participants = pq.execute().data or []

        if not participants:
            return error_response(
                code='NOT_LINKED',
                message='That participant is not linked to POE yet. Run link-participant first.',
                status=404,
            )
        if len(participants) > 1:
            return error_response(
                code='MULTIPLE_PARTICIPANTS',
                message='Participant is in more than one POE. Pass poe_cohort to choose.',
                status=409,
            )

        participant = participants[0]
        class_quest_id = participant.get('class_quest_id')
        if not class_quest_id:
            return error_response(code='NO_CLASS', message='Participant has no linked class quest', status=409)

        if participant.get('credit_awarded_at'):
            return success_response(data={
                'already_awarded': True,
                'poe_participant_id': participant['id'],
                'user_id': target_user_id,
            })

        # Mark the class credit_awarded. class_review_submitted_at is set too so
        # is_class_credit_awarded surfaces a completion date in portfolio/My Classes.
        supabase.table('quests').update({
            'class_review_status': 'credit_awarded',
            'class_review_submitted_at': _now(),
            'class_review_notes': 'POE attendance confirmed by director.',
        }).eq('id', class_quest_id).execute()

        # Deposit the 0.5 Fine Arts credit as subject XP so it lands on the transcript.
        _deposit_subject_xp(supabase, target_user_id, POE_TRANSCRIPT_SUBJECT, POE_PILLAR, POE_CREDIT_XP)

        supabase.table('poe_participants').update({
            'attendance_confirmed_at': _now(),
            'credit_awarded_at': _now(),
        }).eq('id', participant['id']).execute()

        logger.info(f"[POE-admin] awarded 0.5 fine_arts credit to user {target_user_id[:8]} (class {class_quest_id[:8]})")
        return success_response(data={
            'awarded': True,
            'poe_participant_id': participant['id'],
            'user_id': target_user_id,
            'class_quest_id': class_quest_id,
            'credit': {'fine_arts': round(POE_CREDIT_XP / 2000, 2)},
        })

    except Exception as e:
        logger.error(f"[POE-admin] award_credit failed: {e}", exc_info=True)
        return error_response(code='AWARD_FAILED', message='Failed to award credit', status=500)
