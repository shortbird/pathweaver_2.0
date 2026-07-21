"""
Transcript Generator Routes

Admin endpoints for generating formal academic transcripts and managing planned credits.

Endpoints:
- GET  /api/admin/transcript/<user_id> - Get full transcript data for a student
- GET  /api/admin/transcript/<user_id>/planned-credits - Get planned credits
- POST /api/admin/transcript/<user_id>/planned-credits - Add a planned credit
- PUT  /api/admin/transcript/<user_id>/planned-credits/<credit_id> - Update a planned credit
- DELETE /api/admin/transcript/<user_id>/planned-credits/<credit_id> - Delete a planned credit
"""

import base64
import re
from datetime import datetime

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_school_admin
from utils.auth.org_scope import caller_can_access_user, user_org, caller_can_access_org
from utils.api_response import success_response, error_response
from utils.logger import get_logger
from services.portfolio_service import PortfolioService
from utils.accreditation import resolve_transcript_accreditation
from app_config import Config

logger = get_logger(__name__)

bp = Blueprint('admin_transcript_generator', __name__, url_prefix='/api/admin/transcript')

XP_PER_CREDIT = 2000

# Each approved class (quest_type='class', 1000 subject XP target) is worth a
# fixed half credit on the transcript, with an A grade.
CLASS_CREDIT_VALUE = 0.5

SUBJECT_DISPLAY_NAMES = {
    'language_arts': 'Language Arts',
    'math': 'Mathematics',
    'science': 'Science',
    'social_studies': 'Social Studies',
    'financial_literacy': 'Financial Literacy',
    'health': 'Health',
    'pe': 'Physical Education',
    'fine_arts': 'Fine Arts',
    'cte': 'Career & Technical Education',
    'digital_literacy': 'Digital Literacy',
    'electives': 'Electives'
}

VALID_SUBJECTS = list(SUBJECT_DISPLAY_NAMES.keys())


@bp.route('/<user_id>', methods=['GET'])
@require_school_admin
def get_transcript_data(admin_user_id, user_id):
    """
    Get all data needed to generate a formal academic transcript.
    Aggregates: student info, earned subject credits, transfer credits, planned credits.
    """
    try:
        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        supabase = get_supabase_admin_client()

        # IDOR-C1 fix: the target student must be in the caller's org (superadmin exempt).
        if not caller_can_access_user(supabase, admin_user_id, user_id):
            return error_response('Access denied', status_code=403)

        # Student info
        user_result = supabase.table('users').select(
            'id, first_name, last_name, email, created_at, organization_id, date_of_birth'
        ).eq('id', user_id).execute()
        if not user_result.data:
            return error_response('User not found', status_code=404)

        student = user_result.data[0]

        # Org info if applicable
        org_name = None
        org_row = None
        if student.get('organization_id'):
            # Defensive: accreditation_source may not exist yet (pre-migration).
            try:
                org_result = supabase.table('organizations').select(
                    'name, accreditation_source'
                ).eq('id', student['organization_id']).execute()
            except Exception:
                org_result = supabase.table('organizations').select('name').eq(
                    'id', student['organization_id']
                ).execute()
            if org_result.data:
                org_row = org_result.data[0]
                org_name = org_row.get('name')

        # Whose accreditation this transcript is issued under (Optio Academy WASC,
        # the org's own, or none). Frontend shows the WASC mark only for 'optio'.
        accreditation = resolve_transcript_accreditation(
            student.get('organization_id'), org_row
        )

        # Transfer credits (all records) - fetch first to subtract from earned
        tc_result = supabase.table('transfer_credits').select('*').eq(
            'user_id', user_id
        ).order('created_at', desc=False).execute()

        transfer_credits = []
        for tc in (tc_result.data or []):
            subject_xp = tc.get('subject_xp', {})
            subjects = {}
            for subj, xp in subject_xp.items():
                subjects[subj] = {
                    'xp': xp,
                    'credits': round(xp / XP_PER_CREDIT, 2),
                    'display_name': SUBJECT_DISPLAY_NAMES.get(subj, subj)
                }
            transcript_url = tc.get('transcript_url')
            if transcript_url:
                transcript_url = transcript_url.replace(
                    'vvfgxcykxjybtvpfzwyx.supabase.co',
                    'auth.optioeducation.com'
                )
            transfer_credits.append({
                'id': tc['id'],
                'school_name': tc.get('school_name'),
                'subjects': subjects,
                'total_credits': sum(s['credits'] for s in subjects.values()),
                'transcript_url': transcript_url,
                'notes': tc.get('notes'),
                'created_at': tc.get('created_at'),
                'course_names': tc.get('course_names') or {}
            })

        # Aggregate transfer credit XP by subject to subtract from earned
        transfer_xp_by_subject = {}
        for tc in (tc_result.data or []):
            for subj, xp in tc.get('subject_xp', {}).items():
                transfer_xp_by_subject[subj] = transfer_xp_by_subject.get(subj, 0) + xp

        # Earned subject XP (from user_subject_xp table, minus transfer credit XP)
        subject_xp_result = supabase.table('user_subject_xp').select(
            'school_subject, xp_amount, pending_xp'
        ).eq('user_id', user_id).execute()

        earned_credits = {}
        for row in (subject_xp_result.data or []):
            subject = row['school_subject']
            total_xp = row.get('xp_amount', 0)
            # Subtract transfer credit XP that was synced into this table
            optio_xp = max(0, total_xp - transfer_xp_by_subject.get(subject, 0))
            if optio_xp > 0:
                earned_credits[subject] = {
                    'xp': optio_xp,
                    'credits': round(optio_xp / XP_PER_CREDIT, 2),
                    'display_name': SUBJECT_DISPLAY_NAMES.get(subject, subject)
                }

        # Awarded classes: class quests approved in admin class reviews.
        # Derived from class_review_status so already-approved classes appear
        # without any backfill. A POE class whose credit was awarded through
        # the POE award endpoint is excluded — that path deposits subject XP
        # into user_subject_xp (routes/admin/poe.py), so it already surfaces
        # through earned_credits above and a row here would double-count it.
        class_result = supabase.table('quests').select(
            'id, title, transcript_subject, class_review_submitted_at'
        ).eq('created_by', user_id).eq('quest_type', 'class').eq(
            'class_review_status', 'credit_awarded'
        ).order('class_review_submitted_at', desc=False).execute()

        poe_quest_ids = set()
        if class_result.data:
            poe_result = supabase.table('poe_participants').select(
                'class_quest_id'
            ).eq('user_id', user_id).not_.is_(
                'credit_awarded_at', 'null'
            ).execute()
            poe_quest_ids = {
                p['class_quest_id'] for p in (poe_result.data or [])
                if p.get('class_quest_id')
            }

        class_credits = []
        for cq in (class_result.data or []):
            if cq['id'] in poe_quest_ids:
                continue
            subject = cq.get('transcript_subject') or 'electives'
            class_credits.append({
                'quest_id': cq['id'],
                'school_subject': subject,
                'display_name': SUBJECT_DISPLAY_NAMES.get(subject, subject),
                'course_name': cq.get('title'),
                'credits': CLASS_CREDIT_VALUE,
                'grade': 'A',
                'awarded_at': cq.get('class_review_submitted_at')
            })

        # Planned/in-progress credits
        planned_result = supabase.table('planned_credits').select('*').eq(
            'user_id', user_id
        ).order('created_at', desc=False).execute()

        planned_credits = []
        for pc in (planned_result.data or []):
            planned_credits.append({
                'id': pc['id'],
                'school_subject': pc['school_subject'],
                'display_name': SUBJECT_DISPLAY_NAMES.get(pc['school_subject'], pc['school_subject']),
                'course_name': pc['course_name'],
                'credits': float(pc['credits']),
                'status': pc['status'],
                'source': pc.get('source'),
                'notes': pc.get('notes'),
                'created_at': pc.get('created_at')
            })

        # Completed quests summary (for transcript context)
        quests_result = supabase.table('user_quests').select(
            'completed_at, quests(title)'
        ).eq('user_id', user_id).not_.is_('completed_at', 'null').order(
            'completed_at', desc=False
        ).execute()

        completed_quests = []
        for uq in (quests_result.data or []):
            quest = uq.get('quests', {})
            if quest:
                completed_quests.append({
                    'title': quest.get('title'),
                    'completed_at': uq.get('completed_at')
                })

        # Overrides
        overrides_result = supabase.table('transcript_overrides').select('overrides').eq(
            'user_id', user_id
        ).execute()
        overrides = overrides_result.data[0]['overrides'] if overrides_result.data else {}

        # Totals
        total_earned_credits = sum(c['credits'] for c in earned_credits.values())
        total_class_credits = sum(cc['credits'] for cc in class_credits)
        total_transfer_credits = sum(tc['total_credits'] for tc in transfer_credits)
        total_planned_credits = sum(pc['credits'] for pc in planned_credits if pc['status'] == 'in_progress')

        return success_response({
            'student': {
                'id': student['id'],
                'first_name': student.get('first_name'),
                'last_name': student.get('last_name'),
                'email': student.get('email'),
                'date_of_birth': student.get('date_of_birth'),
                'enrolled_date': student.get('created_at'),
                'organization_name': org_name
            },
            'accreditation': accreditation,
            'earned_credits': earned_credits,
            'class_credits': class_credits,
            'transfer_credits': transfer_credits,
            'planned_credits': planned_credits,
            'completed_quests': completed_quests,
            'overrides': overrides,
            'totals': {
                'earned_credits': round(total_earned_credits, 2),
                'class_credits': round(total_class_credits, 2),
                'transfer_credits': round(total_transfer_credits, 2),
                'planned_credits': round(total_planned_credits, 2),
                'total_completed': round(total_earned_credits + total_class_credits + total_transfer_credits, 2)
            }
        })

    except Exception as e:
        logger.error(f"Error generating transcript for user {user_id}: {str(e)}")
        return error_response(f'Failed to generate transcript: {str(e)}', status_code=500)


@bp.route('/<user_id>/planned-credits', methods=['GET'])
@require_school_admin
def get_planned_credits(admin_user_id, user_id):
    """Get all planned/in-progress credits for a student."""
    try:
        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        supabase = get_supabase_admin_client()
        if not caller_can_access_user(supabase, admin_user_id, user_id):
            return error_response('Access denied', status_code=403)
        result = supabase.table('planned_credits').select('*').eq(
            'user_id', user_id
        ).order('created_at', desc=False).execute()

        return success_response({'planned_credits': result.data or []})
    except Exception as e:
        logger.error(f"Error getting planned credits: {str(e)}")
        return error_response(str(e), status_code=500)


@bp.route('/<user_id>/planned-credits', methods=['POST'])
@require_school_admin
def add_planned_credit(admin_user_id, user_id):
    """Add a planned/in-progress credit for a student."""
    try:
        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        supabase = get_supabase_admin_client()
        if not caller_can_access_user(supabase, admin_user_id, user_id):
            return error_response('Access denied', status_code=403)
        data = request.json or {}

        school_subject = data.get('school_subject', '').strip()
        course_name = data.get('course_name', '').strip()
        credits = data.get('credits', 0)
        source = data.get('source', '').strip() or None
        notes = data.get('notes', '').strip() or None
        status = data.get('status', 'in_progress')

        if not school_subject or school_subject not in VALID_SUBJECTS:
            return error_response(f'Invalid subject. Valid: {", ".join(VALID_SUBJECTS)}', status_code=400)
        if not course_name:
            return error_response('Course name is required', status_code=400)

        try:
            credits = float(credits)
            if credits <= 0 or credits > 10:
                return error_response('Credits must be between 0 and 10', status_code=400)
        except (ValueError, TypeError):
            return error_response('Invalid credits value', status_code=400)

        result = supabase.table('planned_credits').insert({
            'user_id': user_id,
            'school_subject': school_subject,
            'course_name': course_name,
            'credits': credits,
            'status': status,
            'source': source,
            'notes': notes,
            'created_by': admin_user_id
        }).execute()

        return success_response({'planned_credit': result.data[0]})
    except Exception as e:
        logger.error(f"Error adding planned credit: {str(e)}")
        return error_response(str(e), status_code=500)


@bp.route('/<user_id>/planned-credits/<credit_id>', methods=['PUT'])
@require_school_admin
def update_planned_credit(admin_user_id, user_id, credit_id):
    """Update a planned credit."""
    try:
        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        supabase = get_supabase_admin_client()
        if not caller_can_access_user(supabase, admin_user_id, user_id):
            return error_response('Access denied', status_code=403)
        data = request.json or {}

        update_data = {}
        if 'school_subject' in data:
            if data['school_subject'] not in VALID_SUBJECTS:
                return error_response('Invalid subject', status_code=400)
            update_data['school_subject'] = data['school_subject']
        if 'course_name' in data:
            update_data['course_name'] = data['course_name']
        if 'credits' in data:
            update_data['credits'] = float(data['credits'])
        if 'status' in data:
            if data['status'] not in ('in_progress', 'completed', 'dropped'):
                return error_response('Invalid status', status_code=400)
            update_data['status'] = data['status']
        if 'source' in data:
            update_data['source'] = data['source'] or None
        if 'notes' in data:
            update_data['notes'] = data['notes'] or None

        result = supabase.table('planned_credits').update(update_data).eq(
            'id', credit_id
        ).eq('user_id', user_id).execute()

        if not result.data:
            return error_response('Planned credit not found', status_code=404)

        return success_response({'planned_credit': result.data[0]})
    except Exception as e:
        logger.error(f"Error updating planned credit: {str(e)}")
        return error_response(str(e), status_code=500)


@bp.route('/<user_id>/planned-credits/<credit_id>', methods=['DELETE'])
@require_school_admin
def delete_planned_credit(admin_user_id, user_id, credit_id):
    """Delete a planned credit."""
    try:
        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        supabase = get_supabase_admin_client()
        if not caller_can_access_user(supabase, admin_user_id, user_id):
            return error_response('Access denied', status_code=403)
        supabase.table('planned_credits').delete().eq(
            'id', credit_id
        ).eq('user_id', user_id).execute()

        return success_response({'message': 'Planned credit deleted'})
    except Exception as e:
        logger.error(f"Error deleting planned credit: {str(e)}")
        return error_response(str(e), status_code=500)


@bp.route('/transfer-credits/<transfer_credit_id>/course-names', methods=['PUT'])
@require_school_admin
def update_course_names(admin_user_id, transfer_credit_id):
    """
    Update course name breakdowns for a transfer credit record.

    Request body:
        course_names: dict - Per-subject course breakdowns, e.g.:
            {"cte": [{"name": "Woodworking", "credits": 0.5}, {"name": "Auto Shop", "credits": 1.0}]}

    Course credits within a subject must sum to the subject's total credits.
    """
    try:
        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        supabase = get_supabase_admin_client()
        data = request.json or {}
        course_names = data.get('course_names', {})

        # Verify record exists
        existing = supabase.table('transfer_credits').select('id, subject_xp, user_id').eq(
            'id', transfer_credit_id
        ).execute()

        if not existing.data:
            return error_response('Transfer credit not found', status_code=404)

        # IDOR-C1 fix: the record's student must be in the caller's org.
        if not caller_can_access_user(supabase, admin_user_id, existing.data[0].get('user_id')):
            return error_response('Access denied', status_code=403)

        subject_xp = existing.data[0].get('subject_xp', {})

        # Validate: each subject in course_names must exist in subject_xp,
        # and course credits must sum to the subject total
        for subject, courses in course_names.items():
            if subject not in subject_xp:
                return error_response(
                    f'Subject "{subject}" not found in this transfer credit record',
                    status_code=400
                )
            if not isinstance(courses, list):
                return error_response(f'Courses for "{subject}" must be a list', status_code=400)

            total_course_credits = sum(float(c.get('credits', 0)) for c in courses)
            subject_credits = round(subject_xp[subject] / XP_PER_CREDIT, 2)

            if abs(total_course_credits - subject_credits) > 0.01:
                return error_response(
                    f'Course credits for {subject} ({total_course_credits}) must equal subject total ({subject_credits})',
                    status_code=400
                )

        supabase.table('transfer_credits').update({
            'course_names': course_names
        }).eq('id', transfer_credit_id).execute()

        return success_response({'message': 'Course names updated', 'course_names': course_names})

    except Exception as e:
        logger.error(f"Error updating course names for {transfer_credit_id}: {str(e)}")
        return error_response(str(e), status_code=500)


@bp.route('/<user_id>/exists', methods=['GET'])
@require_school_admin
def check_transcript_exists(admin_user_id, user_id):
    """Check if a transcript has been created for this student."""
    try:
        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        supabase = get_supabase_admin_client()
        if not caller_can_access_user(supabase, admin_user_id, user_id):
            return error_response('Access denied', status_code=403)
        result = supabase.table('transcript_overrides').select('id').eq(
            'user_id', user_id
        ).execute()
        return success_response({'exists': len(result.data or []) > 0})
    except Exception as e:
        return success_response({'exists': False})


@bp.route('/<user_id>/overrides', methods=['GET'])
@require_school_admin
def get_overrides(admin_user_id, user_id):
    """Get transcript field overrides for a student."""
    try:
        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        supabase = get_supabase_admin_client()
        if not caller_can_access_user(supabase, admin_user_id, user_id):
            return error_response('Access denied', status_code=403)
        result = supabase.table('transcript_overrides').select('overrides').eq(
            'user_id', user_id
        ).execute()
        overrides = result.data[0]['overrides'] if result.data else {}
        return success_response({'overrides': overrides})
    except Exception as e:
        logger.error(f"Error getting transcript overrides: {str(e)}")
        return error_response(str(e), status_code=500)


@bp.route('/<user_id>/overrides', methods=['PUT'])
@require_school_admin
def save_overrides(admin_user_id, user_id):
    """Save transcript field overrides for a student."""
    try:
        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        supabase = get_supabase_admin_client()
        if not caller_can_access_user(supabase, admin_user_id, user_id):
            return error_response('Access denied', status_code=403)
        overrides = request.json or {}

        existing = supabase.table('transcript_overrides').select('id').eq(
            'user_id', user_id
        ).execute()

        if existing.data:
            supabase.table('transcript_overrides').update({
                'overrides': overrides,
                'updated_by': admin_user_id,
                'updated_at': 'now()'
            }).eq('user_id', user_id).execute()
        else:
            supabase.table('transcript_overrides').insert({
                'user_id': user_id,
                'overrides': overrides,
                'updated_by': admin_user_id
            }).execute()

        return success_response({'message': 'Overrides saved'})
    except Exception as e:
        logger.error(f"Error saving transcript overrides: {str(e)}")
        return error_response(str(e), status_code=500)


# --- Transfer to school (official transcript email) ---

EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
MAX_TRANSCRIPT_PDF_BYTES = 15 * 1024 * 1024


@bp.route('/<user_id>/transfers', methods=['GET'])
@require_school_admin
def get_transfer_history(admin_user_id, user_id):
    """List prior transcript transfers for a student (most recent first)."""
    try:
        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        supabase = get_supabase_admin_client()
        if not caller_can_access_user(supabase, admin_user_id, user_id):
            return error_response('Access denied', status_code=403)
        result = supabase.table('transcript_transfer_log').select(
            'id, school_name, recipient_name, recipient_email, status, created_at'
        ).eq('user_id', user_id).order('created_at', desc=True).limit(20).execute()
        return success_response({'transfers': result.data or []})
    except Exception as e:
        logger.error(f"Error fetching transfer history: {str(e)}")
        return error_response(str(e), status_code=500)


@bp.route('/<user_id>/send', methods=['POST'])
@require_school_admin
def send_transcript_to_school(admin_user_id, user_id):
    """
    Email the official transcript PDF to a registrar at another school.

    The PDF is generated client-side (same html2pdf path as Download PDF, so
    the sent document is identical to the downloaded one) and posted here as
    base64. Sends from the records address with the student's verification
    link, and logs the transfer for auditing.
    """
    try:
        payload = request.json or {}
        school_name = (payload.get('school_name') or '').strip()
        recipient_name = (payload.get('recipient_name') or '').strip()
        recipient_email = (payload.get('recipient_email') or '').strip()
        message = (payload.get('message') or '').strip()
        pdf_base64 = payload.get('pdf_base64') or ''

        if not school_name:
            return error_response('School name is required', status_code=400)
        if not EMAIL_RE.match(recipient_email):
            return error_response('A valid recipient email is required', status_code=400)
        if not pdf_base64:
            return error_response('Transcript PDF is missing', status_code=400)

        # Accept both raw base64 and data-URI form from html2pdf
        if ',' in pdf_base64[:100]:
            pdf_base64 = pdf_base64.split(',', 1)[1]
        try:
            pdf_bytes = base64.b64decode(pdf_base64)
        except Exception:
            return error_response('Transcript PDF is not valid base64', status_code=400)
        if not pdf_bytes.startswith(b'%PDF'):
            return error_response('Attachment is not a PDF', status_code=400)
        if len(pdf_bytes) > MAX_TRANSCRIPT_PDF_BYTES:
            return error_response('Transcript PDF is too large', status_code=400)

        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        supabase = get_supabase_admin_client()

        # IDOR-C1 fix: only send an official transcript for a student in the
        # caller's org. Previously any org_admin could email any minor's
        # transcript + DOB to an attacker-supplied address.
        if not caller_can_access_user(supabase, admin_user_id, user_id):
            return error_response('Access denied', status_code=403)

        user_result = supabase.table('users').select(
            'id, first_name, last_name, date_of_birth, organization_id, email, '
            'is_dependent, managed_by_parent_id'
        ).eq('id', user_id).execute()
        if not user_result.data:
            return error_response('User not found', status_code=404)
        student = user_result.data[0]

        org_row = None
        if student.get('organization_id'):
            try:
                org_result = supabase.table('organizations').select(
                    'name, accreditation_source'
                ).eq('id', student['organization_id']).execute()
                org_row = org_result.data[0] if org_result.data else None
            except Exception:
                org_row = None
        accreditation = resolve_transcript_accreditation(
            student.get('organization_id'), org_row
        )

        # Overrides may carry a corrected display name / issue date / DOB.
        overrides_result = supabase.table('transcript_overrides').select('overrides').eq(
            'user_id', user_id
        ).execute()
        overrides = overrides_result.data[0]['overrides'] if overrides_result.data else None
        if overrides is None:
            # The public verification page only resolves for students with an
            # overrides row; make sure the link in the email works.
            supabase.table('transcript_overrides').insert({
                'user_id': user_id, 'overrides': {}, 'updated_by': admin_user_id
            }).execute()
            overrides = {}

        default_name = f"{student.get('first_name', '')} {student.get('last_name', '')}".strip()
        student_name = overrides.get('student_name') or default_name or 'Student'
        date_issued = overrides.get('date_issued') or datetime.now().strftime('%B %d, %Y').replace(' 0', ' ')

        # Format a raw YYYY-MM-DD DOB for display; naive string parse, never
        # through a timezone (a tz round-trip shifts it a day early).
        date_of_birth = overrides.get('date_of_birth') or ''
        if not date_of_birth and student.get('date_of_birth'):
            raw_dob = str(student['date_of_birth'])[:10]
            try:
                dob = datetime.strptime(raw_dob, '%Y-%m-%d')
                date_of_birth = dob.strftime('%B %d, %Y').replace(' 0', ' ')
            except ValueError:
                date_of_birth = raw_dob

        verification_url = f"https://www.optioeducation.com/public/transcript/{user_id}"
        safe_name = re.sub(r'[^A-Za-z0-9]+', '_', student_name).strip('_') or 'Student'
        filename = f"Transcript_{safe_name}_{datetime.now().strftime('%Y-%m-%d')}.pdf"

        from services.email_service import email_service
        html_body = email_service.jinja_env.get_template('email/transcript_transfer.html').render(
            student_name=student_name,
            date_of_birth=date_of_birth,
            date_issued=date_issued,
            school_name=school_name,
            recipient_name=recipient_name,
            message=message,
            verification_url=verification_url,
            # Contact + Reply-To are tanner@ (ADMIN_EMAIL): support@ delivers to
            # the rarely-checked optio inbox, while tanner@ auto-forwards to the
            # monitored gmail account. Keep every registrar path on tanner@.
            records_email=Config.ADMIN_EMAIL,
            is_wasc_accredited=accreditation.get('source') == 'optio',
        )
        text_body = (
            f"Official academic transcript for {student_name}, issued by Optio Academy "
            f"on {date_issued}, is attached. Verify at {verification_url}. "
            f"Questions: reply to this email ({Config.ADMIN_EMAIL})."
        )

        sent = email_service.send_email(
            to_email=recipient_email,
            subject=f"Official Transcript - {student_name} - Optio Academy",
            html_body=html_body,
            text_body=text_body,
            sender_name_override='Optio Academy Records',
            reply_to=Config.ADMIN_EMAIL,
            attachments=[{
                'filename': filename,
                'content': pdf_bytes,
                'mimetype': 'application/pdf',
            }],
        )

        log_row = {
            'user_id': user_id,
            'sent_by': admin_user_id,
            'school_name': school_name,
            'recipient_name': recipient_name or None,
            'recipient_email': recipient_email,
            'message': message or None,
            'status': 'sent' if sent else 'failed',
        }
        supabase.table('transcript_transfer_log').insert(log_row).execute()

        if not sent:
            return error_response('Failed to send transcript email', status_code=502)

        # Notify the student (or, for dependent accounts without their own
        # mailbox, the managing parent). Best-effort: a notification failure
        # never fails the transfer itself.
        try:
            notify_email = student.get('email')
            for_parent = False
            if student.get('is_dependent') and student.get('managed_by_parent_id'):
                parent_result = supabase.table('users').select('email, first_name').eq(
                    'id', student['managed_by_parent_id']
                ).execute()
                if parent_result.data and parent_result.data[0].get('email'):
                    notify_email = parent_result.data[0]['email']
                    notify_first_name = parent_result.data[0].get('first_name') or 'there'
                    for_parent = True
            if not for_parent:
                notify_first_name = student.get('first_name') or 'there'

            if notify_email and EMAIL_RE.match(notify_email):
                student_html = email_service.jinja_env.get_template(
                    'email/transcript_sent_student.html'
                ).render(
                    first_name=notify_first_name,
                    student_name=student_name,
                    school_name=school_name,
                    date_sent=datetime.now().strftime('%B %d, %Y').replace(' 0', ' '),
                    for_parent=for_parent,
                )
                who = "your" if not for_parent else f"{student_name}'s"
                student_text = (
                    f"We sent {who} official transcript to {school_name}. It went directly "
                    f"to their records office, so there is nothing you need to do. "
                    f"Questions? Reply to this email."
                )
                email_service.send_email(
                    to_email=notify_email,
                    subject=f"Your transcript was sent to {school_name}" if not for_parent
                    else f"{student_name}'s transcript was sent to {school_name}",
                    html_body=student_html,
                    text_body=student_text,
                    sender_name_override='Optio Academy Records',
                    reply_to=Config.ADMIN_EMAIL,
                )
        except Exception as notify_err:
            logger.error(f"Transcript sent but student notification failed: {notify_err}")

        return success_response({'message': f'Transcript sent to {recipient_email}'})
    except Exception as e:
        logger.error(f"Error sending transcript to school: {str(e)}")
        return error_response(str(e), status_code=500)
