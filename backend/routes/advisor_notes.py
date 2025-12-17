"""
Advisor Notes Routes
API endpoints for confidential advisor notes about students/parents.

REPOSITORY MIGRATION: NO MIGRATION NEEDED
- Already uses AdvisorNotesRepository for all note operations
- Direct database calls only for admin role checks (simple queries, acceptable)
- Repository pattern fully implemented for core functionality
"""

from flask import Blueprint, request, jsonify
from datetime import datetime
from utils.auth.decorators import require_role
from repositories.advisor_notes_repository import AdvisorNotesRepository

notes_bp = Blueprint('advisor_notes', __name__)


@notes_bp.route('/api/advisor/notes/<subject_id>', methods=['GET', 'OPTIONS'])
@require_role('advisor', 'admin')
def get_subject_notes(user_id, subject_id):
    """
    Get all notes for a specific subject (student or parent).
    Advisors see only their notes, admins see all notes.
    """
    try:
        repository = AdvisorNotesRepository()

        # Check if user is admin
        from database import get_supabase_admin_client
        supabase = get_supabase_admin_client()
        user_response = supabase.table('users')\
            .select('role')\
            .eq('id', user_id)\
            .single()\
            .execute()

        is_admin = user_response.data and user_response.data.get('role') == 'admin'

        # Admins see all notes, advisors see only their own
        notes = repository.get_notes_for_subject(
            subject_id,
            advisor_id=None if is_admin else user_id
        )

        # Format advisor names
        for note in notes:
            if 'users' in note:
                advisor_data = note['users']
                display_name = advisor_data.get('display_name')
                if not display_name:
                    first_name = advisor_data.get('first_name', '')
                    last_name = advisor_data.get('last_name', '')
                    display_name = f"{first_name} {last_name}".strip() or 'Advisor'
                note['advisor_name'] = display_name

        return jsonify({
            'success': True,
            'notes': notes
        }), 200

    except Exception as e:
        print(f"Error fetching advisor notes: {str(e)}")
        return jsonify({'error': f'Failed to fetch notes: {str(e)}'}), 500


@notes_bp.route('/api/advisor/notes', methods=['POST', 'OPTIONS'])
@require_role('advisor', 'admin')
def create_note(user_id):
    """
    Create a new advisor note.

    Expected JSON body:
    {
        "subject_id": "uuid",
        "note_text": "text"
    }
    """
    try:
        repository = AdvisorNotesRepository()
        data = request.get_json()

        # Validate required fields
        if 'subject_id' not in data or 'note_text' not in data:
            return jsonify({'error': 'Missing required fields: subject_id, note_text'}), 400

        if not data['note_text'].strip():
            return jsonify({'error': 'Note text cannot be empty'}), 400

        # Verify advisor has access to this subject (student or parent)
        from database import get_supabase_admin_client
        supabase = get_supabase_admin_client()

        # Check if user is admin
        user_response = supabase.table('users')\
            .select('role')\
            .eq('id', user_id)\
            .single()\
            .execute()

        is_admin = user_response.data and user_response.data.get('role') == 'admin'

        # If not admin, verify advisor-student relationship
        if not is_admin:
            # Check if subject is a student assigned to this advisor
            assignment_response = supabase.table('advisor_student_assignments')\
                .select('id')\
                .eq('advisor_id', user_id)\
                .eq('student_id', data['subject_id'])\
                .eq('is_active', True)\
                .execute()

            if not assignment_response.data:
                # Check if subject is a parent of an assigned student
                parent_link_response = supabase.table('parent_student_links')\
                    .select('student_id')\
                    .eq('parent_id', data['subject_id'])\
                    .execute()

                if parent_link_response.data:
                    student_ids = [link['student_id'] for link in parent_link_response.data]
                    assignment_response = supabase.table('advisor_student_assignments')\
                        .select('id')\
                        .eq('advisor_id', user_id)\
                        .in_('student_id', student_ids)\
                        .eq('is_active', True)\
                        .execute()

                    if not assignment_response.data:
                        return jsonify({'error': 'Not authorized to create notes for this subject'}), 403
                else:
                    return jsonify({'error': 'Not authorized to create notes for this subject'}), 403

        # Create note
        note_data = {
            'advisor_id': user_id,
            'subject_id': data['subject_id'],
            'note_text': data['note_text'].strip()
        }

        note = repository.create_note(note_data)

        return jsonify({
            'success': True,
            'note': note
        }), 201

    except Exception as e:
        print(f"Error creating advisor note: {str(e)}")
        return jsonify({'error': f'Failed to create note: {str(e)}'}), 500


@notes_bp.route('/api/advisor/notes/<note_id>', methods=['PUT', 'OPTIONS'])
@require_role('advisor', 'admin')
def update_note(user_id, note_id):
    """
    Update an advisor note.

    Expected JSON body:
    {
        "note_text": "updated text"
    }
    """
    try:
        repository = AdvisorNotesRepository()
        data = request.get_json()

        if 'note_text' not in data:
            return jsonify({'error': 'Missing required field: note_text'}), 400

        if not data['note_text'].strip():
            return jsonify({'error': 'Note text cannot be empty'}), 400

        # Verify ownership
        note = repository.get_note_by_id(note_id)
        if not note:
            return jsonify({'error': 'Note not found'}), 404

        # Check if user is admin or note owner
        from database import get_supabase_admin_client
        supabase = get_supabase_admin_client()
        user_response = supabase.table('users')\
            .select('role')\
            .eq('id', user_id)\
            .single()\
            .execute()

        is_admin = user_response.data and user_response.data.get('role') == 'admin'

        if note['advisor_id'] != user_id and not is_admin:
            return jsonify({'error': 'Not authorized to update this note'}), 403

        # Update note
        updated_note = repository.update_note(note_id, data['note_text'].strip())

        return jsonify({
            'success': True,
            'note': updated_note
        }), 200

    except Exception as e:
        print(f"Error updating advisor note: {str(e)}")
        return jsonify({'error': f'Failed to update note: {str(e)}'}), 500


@notes_bp.route('/api/advisor/notes/<note_id>', methods=['DELETE', 'OPTIONS'])
@require_role('advisor', 'admin')
def delete_note(user_id, note_id):
    """
    Delete an advisor note.
    """
    try:
        repository = AdvisorNotesRepository()

        # Verify ownership
        note = repository.get_note_by_id(note_id)
        if not note:
            return jsonify({'error': 'Note not found'}), 404

        # Check if user is admin or note owner
        from database import get_supabase_admin_client
        supabase = get_supabase_admin_client()
        user_response = supabase.table('users')\
            .select('role')\
            .eq('id', user_id)\
            .single()\
            .execute()

        is_admin = user_response.data and user_response.data.get('role') == 'admin'

        if note['advisor_id'] != user_id and not is_admin:
            return jsonify({'error': 'Not authorized to delete this note'}), 403

        # Delete note
        success = repository.delete_note(note_id)

        if success:
            return jsonify({'success': True}), 200
        else:
            return jsonify({'error': 'Failed to delete note'}), 500

    except Exception as e:
        print(f"Error deleting advisor note: {str(e)}")
        return jsonify({'error': f'Failed to delete note: {str(e)}'}), 500
