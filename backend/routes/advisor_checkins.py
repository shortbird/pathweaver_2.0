"""
Advisor Check-in Routes
API endpoints for advisor check-in functionality.

REPOSITORY MIGRATION: NO MIGRATION NEEDED
- Already uses CheckinService (service layer) and CheckinRepository
- Direct database calls only for admin role checks (simple queries, acceptable)
- Service layer and repository pattern fully implemented
"""

from flask import Blueprint, request, jsonify
from datetime import datetime, timezone
from utils.auth.decorators import require_role, require_admin
from services.checkin_service import CheckinService
from services.checkin_email_service import CheckinEmailService
from services.email_service import EmailService
from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

checkins_bp = Blueprint('advisor_checkins', __name__)


@checkins_bp.route('/api/advisor/checkins', methods=['POST', 'OPTIONS'])
@require_role('advisor', 'superadmin')
def create_checkin(user_id):
    """
    Create a new advisor check-in.

    Expected JSON body:
    {
        "student_id": "uuid",
        "checkin_date": "2025-01-11T10:00:00Z",
        "growth_moments": "text",
        "student_voice": "text",
        "obstacles": "text",
        "solutions": "text",
        "advisor_notes": "text",
        "active_quests_snapshot": [...],
        "quest_notes": [{ "quest_id": "uuid", "notes": "text" }, ...]
    }
    """
    try:
        checkin_service = CheckinService()
        data = request.get_json()

        # Validate required fields
        required_fields = ['student_id', 'checkin_date']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        # Parse checkin_date
        try:
            checkin_date = datetime.fromisoformat(data['checkin_date'].replace('Z', '+00:00'))
        except ValueError:
            return jsonify({'error': 'Invalid checkin_date format. Use ISO 8601.'}), 400

        # Create check-in
        checkin = checkin_service.create_checkin(
            advisor_id=user_id,
            student_id=data['student_id'],
            checkin_date=checkin_date,
            growth_moments=data.get('growth_moments', ''),
            student_voice=data.get('student_voice', ''),
            obstacles=data.get('obstacles', ''),
            solutions=data.get('solutions', ''),
            advisor_notes=data.get('advisor_notes', ''),
            active_quests_snapshot=data.get('active_quests_snapshot', []),
            quest_notes=data.get('quest_notes', []),
            reading_notes=data.get('reading_notes', ''),
            writing_notes=data.get('writing_notes', ''),
            math_notes=data.get('math_notes', '')
        )

        return jsonify({
            'success': True,
            'checkin': checkin
        }), 201

    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': f'Failed to create check-in: {str(e)}'}), 500


@checkins_bp.route('/api/advisor/students/<student_id>/quests/<quest_id>/end', methods=['POST', 'OPTIONS'])
@require_role('advisor', 'superadmin')
def advisor_end_student_quest(user_id, student_id, quest_id):
    """
    End an active quest for a student (advisor action during check-in).
    Sets is_active=False and completed_at on the user_quests record.
    """
    try:
        from repositories.checkin_repository import CheckinRepository
        repository = CheckinRepository()

        # Verify advisor-student relationship
        if not repository.verify_advisor_student_relationship(user_id, student_id):
            return jsonify({'error': 'Not authorized for this student'}), 403

        # admin client justified: advisor check-ins on assigned students; cross-user writes gated by @require_advisor + advisor_student_assignments verification
        supabase = get_supabase_admin_client()

        # Find the active enrollment
        enrollment = supabase.table('user_quests')\
            .select('id, is_active, completed_at')\
            .eq('user_id', student_id)\
            .eq('quest_id', quest_id)\
            .eq('is_active', True)\
            .is_('completed_at', 'null')\
            .execute()

        if not enrollment.data:
            return jsonify({'error': 'No active enrollment found for this quest'}), 404

        # End the quest
        supabase.table('user_quests')\
            .update({
                'is_active': False,
                'completed_at': datetime.now(timezone.utc).isoformat(),
                'last_set_down_at': datetime.now(timezone.utc).isoformat()
            })\
            .eq('id', enrollment.data[0]['id'])\
            .execute()

        logger.info(f"Advisor {user_id} ended quest {quest_id} for student {student_id}")

        return jsonify({
            'success': True,
            'message': 'Quest ended successfully'
        }), 200

    except Exception as e:
        logger.error(f"Error ending quest: {str(e)}")
        return jsonify({'error': f'Failed to end quest: {str(e)}'}), 500


@checkins_bp.route('/api/advisor/checkins', methods=['GET', 'OPTIONS'])
@require_role('advisor', 'superadmin')
def get_advisor_checkins(user_id):
    """
    Get all check-ins created by the current advisor.
    """
    try:
        from repositories.checkin_repository import CheckinRepository
        repository = CheckinRepository()

        limit = request.args.get('limit', 100, type=int)
        checkins = repository.get_advisor_checkins(user_id, limit)

        return jsonify({
            'success': True,
            'checkins': checkins
        }), 200

    except Exception as e:
        return jsonify({'error': f'Failed to fetch check-ins: {str(e)}'}), 500


@checkins_bp.route('/api/advisor/students/<student_id>/checkins', methods=['GET', 'OPTIONS'])
@require_role('advisor', 'superadmin')
def get_student_checkins(user_id, student_id):
    """
    Get all check-ins for a specific student.
    Organization isolation is enforced.
    Admins see ALL check-ins for the student (in their org), advisors see only their own.
    """
    try:
        from database import get_supabase_admin_client
        from repositories.checkin_repository import CheckinRepository

        # ORGANIZATION ISOLATION: Verify user and student are in the same org
        repository = CheckinRepository()
        if not repository._verify_same_organization(user_id, student_id):
            return jsonify({'error': 'Not authorized to view this student'}), 403

        # Check if user is admin
        # admin client justified: advisor check-ins on assigned students; cross-user writes gated by @require_advisor + advisor_student_assignments verification
        supabase = get_supabase_admin_client()
        user_response = supabase.table('users').select('role').eq('id', user_id).single().execute()
        is_admin = user_response.data and user_response.data.get('role') == 'superadmin'

        # If admin, don't filter by advisor_id (pass None)
        # If advisor, filter by their advisor_id (pass user_id)
        advisor_filter = None if is_admin else user_id

        checkin_service = CheckinService()
        checkins = checkin_service.get_checkin_history(student_id, advisor_filter)

        return jsonify({
            'success': True,
            'checkins': checkins
        }), 200

    except Exception as e:
        return jsonify({'error': f'Failed to fetch student check-ins: {str(e)}'}), 500


@checkins_bp.route('/api/advisor/students/<student_id>/checkin-data', methods=['GET', 'OPTIONS'])
@require_role('advisor', 'superadmin')
def get_checkin_data(user_id, student_id):
    """
    Get pre-populated data for check-in form (active quests, etc.).
    Organization isolation is enforced.
    Admins see ALL check-ins for the student (in their org), advisors see only their own.
    """
    try:
        from database import get_supabase_admin_client
        from repositories.checkin_repository import CheckinRepository

        # ORGANIZATION ISOLATION: Verify user and student are in the same org
        repository = CheckinRepository()
        if not repository._verify_same_organization(user_id, student_id):
            return jsonify({'error': 'Not authorized to view this student'}), 403

        # Check if user is admin
        # admin client justified: advisor check-ins on assigned students; cross-user writes gated by @require_advisor + advisor_student_assignments verification
        supabase = get_supabase_admin_client()
        user_response = supabase.table('users').select('role').eq('id', user_id).single().execute()
        is_admin = user_response.data and user_response.data.get('role') == 'superadmin'

        # If admin, don't filter by advisor_id (pass None)
        # If advisor, filter by their advisor_id (pass user_id)
        advisor_filter = None if is_admin else user_id

        checkin_service = CheckinService()
        # Get active quests data
        quests_data = checkin_service.get_student_active_quests_data(student_id)

        # Get last check-in info
        last_checkin_info = checkin_service.get_last_checkin_info(student_id, advisor_filter)

        return jsonify({
            'success': True,
            'active_quests': quests_data,
            'last_checkin': last_checkin_info
        }), 200

    except Exception as e:
        return jsonify({'error': f'Failed to fetch check-in data: {str(e)}'}), 500


@checkins_bp.route('/api/advisor/checkins/<checkin_id>', methods=['GET', 'OPTIONS'])
@require_role('advisor', 'superadmin')
def get_checkin_by_id(user_id, checkin_id):
    """
    Get a specific check-in by ID.
    """
    try:
        checkin_service = CheckinService()
        checkin = checkin_service.get_checkin_by_id(checkin_id, user_id)

        if not checkin:
            return jsonify({'error': 'Check-in not found'}), 404

        return jsonify({
            'success': True,
            'checkin': checkin
        }), 200

    except PermissionError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        return jsonify({'error': f'Failed to fetch check-in: {str(e)}'}), 500


@checkins_bp.route('/api/advisor/checkins/analytics', methods=['GET', 'OPTIONS'])
@require_role('advisor', 'superadmin')
def get_checkin_analytics(user_id):
    """
    Get analytics for advisor's check-ins.
    """
    try:
        checkin_service = CheckinService()
        analytics = checkin_service.get_checkin_analytics(user_id)

        return jsonify({
            'success': True,
            'analytics': analytics
        }), 200

    except Exception as e:
        import traceback
        logger.error(f"Error in get_checkin_analytics: {str(e)}")
        logger.info(traceback.format_exc())
        return jsonify({'error': f'Failed to fetch analytics: {str(e)}'}), 500


@checkins_bp.route('/api/advisor/checkins/generate-email', methods=['POST', 'OPTIONS'])
@require_role('advisor', 'superadmin')
def generate_checkin_email(user_id):
    """
    Generate a parent recap email from meeting notes using AI.

    Expected JSON body:
    {
        "student_id": "uuid",
        "meeting_notes": "text of meeting notes/transcript"
    }

    Returns generated email subject and body for advisor review.
    """
    try:
        data = request.get_json()

        student_id = data.get('student_id')
        meeting_notes = data.get('meeting_notes', '').strip()

        if not student_id:
            return jsonify({'error': 'Missing required field: student_id'}), 400
        if not meeting_notes:
            return jsonify({'error': 'Missing required field: meeting_notes'}), 400

        # admin client justified: advisor check-ins on assigned students; cross-user writes gated by @require_advisor + advisor_student_assignments verification
        supabase = get_supabase_admin_client()

        # Verify advisor-student relationship
        from repositories.checkin_repository import CheckinRepository
        repository = CheckinRepository()
        if not repository.verify_advisor_student_relationship(user_id, student_id):
            return jsonify({'error': 'Not authorized for this student'}), 403

        # Get advisor info
        advisor_resp = supabase.table('users')\
            .select('display_name, first_name, last_name')\
            .eq('id', user_id)\
            .single()\
            .execute()
        advisor = advisor_resp.data
        advisor_name = advisor.get('display_name') or f"{advisor.get('first_name', '')} {advisor.get('last_name', '')}".strip() or 'Your Advisor'

        # Get student info
        student_resp = supabase.table('users')\
            .select('display_name, first_name, last_name, managed_by_parent_id, is_dependent')\
            .eq('id', student_id)\
            .single()\
            .execute()
        student = student_resp.data
        student_first_name = student.get('first_name') or (student.get('display_name', '').split()[0] if student.get('display_name') else '') or 'your student'

        # Find parent - check both mechanisms
        parent_name = 'there'
        parent_email = None

        # Mechanism 1: dependent (managed_by_parent_id)
        if student.get('is_dependent') and student.get('managed_by_parent_id'):
            parent_resp = supabase.table('users')\
                .select('id, display_name, first_name, last_name, email')\
                .eq('id', student['managed_by_parent_id'])\
                .single()\
                .execute()
            if parent_resp.data:
                parent = parent_resp.data
                parent_name = parent.get('display_name') or parent.get('first_name') or 'there'
                parent_email = parent.get('email')

        # Mechanism 2: parent_student_links table
        if not parent_email:
            links_resp = supabase.table('parent_student_links')\
                .select('parent_user_id, parent:parent_user_id(id, display_name, first_name, last_name, email)')\
                .eq('student_user_id', student_id)\
                .eq('status', 'approved')\
                .limit(1)\
                .execute()
            if links_resp.data and links_resp.data[0].get('parent'):
                parent = links_resp.data[0]['parent']
                parent_name = parent.get('display_name') or parent.get('first_name') or 'there'
                parent_email = parent.get('email')

        if not parent_email:
            return jsonify({'error': 'No linked parent found for this student. A parent must be linked before sending a recap email.'}), 404

        # Generate email with AI
        email_service = CheckinEmailService()
        result = email_service.generate_parent_email(
            meeting_notes=meeting_notes,
            advisor_name=advisor_name,
            student_name=student_first_name,
            parent_name=parent_name
        )

        return jsonify({
            'success': True,
            'email': {
                'subject': result['subject'],
                'body': result['body'],
                'parent_email': parent_email,
                'parent_name': parent_name,
                'advisor_name': advisor_name,
                'student_name': student_first_name
            }
        }), 200

    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error generating check-in email: {str(e)}")
        return jsonify({'error': f'Failed to generate email: {str(e)}'}), 500


@checkins_bp.route('/api/advisor/checkins/send-email', methods=['POST', 'OPTIONS'])
@require_role('advisor', 'superadmin')
def send_checkin_email(user_id):
    """
    Send the advisor-reviewed parent recap email.

    Expected JSON body:
    {
        "student_id": "uuid",
        "parent_email": "email@example.com",
        "subject": "email subject",
        "body": "email body text",
        "meeting_notes": "original meeting notes (stored with check-in record)",
        "test": false  // optional - if true, sends to advisor's email instead
    }
    """
    try:
        data = request.get_json()

        student_id = data.get('student_id')
        parent_email = data.get('parent_email')
        subject = data.get('subject', '').strip()
        body = data.get('body', '').strip()
        meeting_notes = data.get('meeting_notes', '')
        is_test = data.get('test', False)

        if not student_id:
            return jsonify({'error': 'Missing required field: student_id'}), 400
        if not parent_email:
            return jsonify({'error': 'Missing required field: parent_email'}), 400
        if not subject:
            return jsonify({'error': 'Missing required field: subject'}), 400
        if not body:
            return jsonify({'error': 'Missing required field: body'}), 400

        # Verify advisor-student relationship
        from repositories.checkin_repository import CheckinRepository
        repository = CheckinRepository()
        if not repository.verify_advisor_student_relationship(user_id, student_id):
            return jsonify({'error': 'Not authorized for this student'}), 403

        # For test sends, get advisor email and send there instead
        if is_test:
            # admin client justified: advisor check-ins on assigned students; cross-user writes gated by @require_advisor + advisor_student_assignments verification
            supabase = get_supabase_admin_client()
            advisor_resp = supabase.table('users')\
                .select('email')\
                .eq('id', user_id)\
                .single()\
                .execute()
            send_to_email = advisor_resp.data.get('email')
            send_subject = f"[TEST] {subject}"
        else:
            send_to_email = parent_email
            send_subject = subject

        # Convert plain text body to HTML for email
        body_lines = body.split('\n')
        html_parts = []
        for line in body_lines:
            stripped = line.strip()
            if stripped.startswith('- '):
                html_parts.append(f'<li style="margin-bottom: 6px; line-height: 1.6; color: #333333;">{stripped[2:]}</li>')
            elif stripped == '':
                html_parts.append('<br>')
            else:
                html_parts.append(f'<p style="margin: 8px 0; line-height: 1.6; color: #333333;">{stripped}</p>')

        # Wrap bullet points in <ul>
        html_body_str = ''
        in_list = False
        for part in html_parts:
            if part.startswith('<li'):
                if not in_list:
                    html_body_str += '<ul style="margin: 14px 0; padding-left: 20px;">'
                    in_list = True
                html_body_str += part
            else:
                if in_list:
                    html_body_str += '</ul>'
                    in_list = False
                html_body_str += part
        if in_list:
            html_body_str += '</ul>'

        # Wrap in a styled container with Optio logo
        logo_url = 'https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/site-assets/email/optio-logo.png'
        html_email = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 24px;">
                <img src="{logo_url}" alt="Optio" style="height: 40px; width: auto;" />
            </div>
            {html_body_str}
        </div>
        """

        # Send email
        email_svc = EmailService()
        success = email_svc.send_email(
            to_email=send_to_email,
            subject=send_subject,
            html_body=html_email,
            text_body=body
        )

        if not success:
            return jsonify({'error': 'Failed to send email. Please try again.'}), 500

        # Only create a check-in record for real sends (not test)
        if not is_test:
            checkin_service = CheckinService()
            checkin_service.create_checkin(
                advisor_id=user_id,
                student_id=student_id,
                checkin_date=datetime.now(timezone.utc),
                advisor_notes=f"[Meeting Notes Email Sent to Parent]\n\n{meeting_notes}",
                growth_moments='',
                student_voice='',
                obstacles='',
                solutions='',
                active_quests_snapshot=[],
                quest_notes=[],
                reading_notes='',
                writing_notes='',
                math_notes=''
            )

        log_target = f"self (test)" if is_test else parent_email
        logger.info(f"Advisor {user_id} sent {'test ' if is_test else ''}check-in recap email to {log_target} for student {student_id}")

        return jsonify({
            'success': True,
            'message': 'Test email sent to your inbox.' if is_test else 'Email sent successfully.',
            'test': is_test
        }), 200

    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error sending check-in email: {str(e)}")
        return jsonify({'error': f'Failed to send email: {str(e)}'}), 500


@checkins_bp.route('/api/admin/checkins', methods=['GET', 'OPTIONS'])
@require_admin
def get_all_checkins_admin(user_id):
    """
    Get all check-ins with pagination (admin only).
    """
    try:
        page = request.args.get('page', 1, type=int)
        limit = request.args.get('limit', 50, type=int)

        from repositories.checkin_repository import CheckinRepository
        repository = CheckinRepository()
        result = repository.get_all_checkins(page, limit)

        return jsonify({
            'success': True,
            **result
        }), 200

    except Exception as e:
        return jsonify({'error': f'Failed to fetch check-ins: {str(e)}'}), 500


@checkins_bp.route('/api/admin/checkins/analytics', methods=['GET', 'OPTIONS'])
@require_admin
def get_admin_analytics(user_id):
    """
    Get system-wide check-in analytics (admin only).
    """
    try:
        from repositories.checkin_repository import CheckinRepository
        repository = CheckinRepository()
        analytics = repository.get_checkin_analytics(advisor_id=None)

        return jsonify({
            'success': True,
            'analytics': analytics
        }), 200

    except Exception as e:
        return jsonify({'error': f'Failed to fetch analytics: {str(e)}'}), 500
