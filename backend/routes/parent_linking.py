"""
Parent-Student Linking API routes.
Admin-only workflow for connecting parents to students.
Once linked, connections are permanent.

NOTE: Admin client usage justified throughout this file for parent-student linking operations.
Managing parent-student relationships requires cross-user operations and elevated privileges.
"""
from flask import Blueprint, request, jsonify
from datetime import datetime
from database import get_supabase_admin_client
from backend.repositories import ParentRepository
from utils.auth.decorators import require_auth, require_admin
from middleware.error_handler import ValidationError, NotFoundError, AuthorizationError
import logging

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('parent_linking', __name__, url_prefix='/api/parents')


# ============================================================================
# PARENT ENDPOINTS - View linked students
# ============================================================================

@bp.route('/my-children', methods=['GET'])
@require_auth
def get_linked_children(user_id):
    """
    Get list of students linked to this parent account.
    Returns student details and learning progress.
    """
    try:
        supabase = get_supabase_admin_client()

        # Get all linked students (links are permanent once created)
        links_response = supabase.table('parent_student_links').select('''
            id,
            student_user_id,
            created_at,
            users!parent_student_links_student_user_id_fkey(
                id,
                first_name,
                last_name,
                avatar_url,
                level,
                total_xp
            )
        ''').eq('parent_user_id', user_id).execute()

        if not links_response.data:
            return jsonify({'children': []}), 200

        # Build response from joined data
        children = []
        for link in links_response.data:
            student = link.get('users')
            if student:
                children.append({
                    'link_id': link['id'],
                    'student_id': link['student_user_id'],
                    'student_first_name': student.get('first_name'),
                    'student_last_name': student.get('last_name'),
                    'student_avatar_url': student.get('avatar_url'),
                    'student_level': student.get('level', 1),
                    'student_total_xp': student.get('total_xp', 0),
                    'linked_since': link['created_at']
                })

        return jsonify({'children': children}), 200

    except Exception as e:
        logger.error(f"Error getting linked children: {str(e)}")
        return jsonify({'error': 'Failed to fetch linked children'}), 500


@bp.route('/my-links', methods=['GET'])
@require_auth
def get_parent_links(user_id):
    """
    Student view: Get list of linked parents.
    Returns empty list if no parents linked.
    """
    try:
        supabase = get_supabase_admin_client()

        # Get linked parents
        active_links_response = supabase.table('parent_student_links').select('''
            id,
            parent_user_id,
            created_at,
            users!parent_student_links_parent_user_id_fkey(
                id,
                first_name,
                last_name,
                email,
                avatar_url
            )
        ''').eq('student_user_id', user_id).execute()

        linked_parents = []
        if active_links_response.data:
            for link in active_links_response.data:
                parent = link.get('users')
                if parent:
                    linked_parents.append({
                        'link_id': link['id'],
                        'parent_id': link['parent_user_id'],
                        'parent_first_name': parent.get('first_name'),
                        'parent_last_name': parent.get('last_name'),
                        'parent_email': parent.get('email'),
                        'parent_avatar_url': parent.get('avatar_url'),
                        'linked_since': link['created_at']
                    })

        return jsonify({
            'linked_parents': linked_parents
        }), 200

    except Exception as e:
        logger.error(f"Error getting parent links: {str(e)}")
        return jsonify({'error': 'Failed to fetch parent links'}), 500


# ============================================================================
# ADMIN ENDPOINTS - Manage parent-student connections
# ============================================================================

@bp.route('/admin/link', methods=['POST'])
@require_admin
def admin_create_link(admin_id):
    """
    Admin creates a parent-student link.
    Links are permanent once created.

    Request body:
    {
        "parent_user_id": "uuid",
        "student_user_id": "uuid"
    }
    """
    try:
        data = request.get_json()
        parent_user_id = data.get('parent_user_id')
        student_user_id = data.get('student_user_id')

        if not parent_user_id or not student_user_id:
            raise ValidationError("Both parent_user_id and student_user_id are required")

        supabase = get_supabase_admin_client()

        # Verify parent exists and has parent role
        parent = supabase.table('users').select('id, role').eq('id', parent_user_id).execute()
        if not parent.data:
            raise NotFoundError("Parent user not found")
        if parent.data[0].get('role') != 'parent':
            raise ValidationError("User must have parent role")

        # Verify student exists and has student role
        student = supabase.table('users').select('id, role').eq('id', student_user_id).execute()
        if not student.data:
            raise NotFoundError("Student user not found")
        if student.data[0].get('role') != 'student':
            raise ValidationError("User must have student role")

        # Check if link already exists
        existing_link = supabase.table('parent_student_links').select('id').eq(
            'parent_user_id', parent_user_id
        ).eq('student_user_id', student_user_id).execute()

        if existing_link.data:
            return jsonify({'error': 'Link already exists'}), 400

        # Create link (permanent)
        link_data = {
            'parent_user_id': parent_user_id,
            'student_user_id': student_user_id,
            'admin_verified': True,
            'verified_by_admin_id': admin_id,
            'verified_at': datetime.utcnow().isoformat()
        }

        result = supabase.table('parent_student_links').insert(link_data).execute()

        logger.info(f"Admin {admin_id} linked parent {parent_user_id} to student {student_user_id}")

        return jsonify({
            'message': 'Parent-student link created successfully',
            'link_id': result.data[0]['id']
        }), 201

    except (ValidationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error creating parent-student link: {str(e)}")
        return jsonify({'error': 'Failed to create link'}), 500


@bp.route('/admin/link/<link_id>', methods=['DELETE'])
@require_admin
def admin_delete_link(admin_id, link_id):
    """
    Admin deletes a parent-student link.
    This is the only way to remove a link.
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify link exists
        link = supabase.table('parent_student_links').select('id').eq('id', link_id).execute()
        if not link.data:
            raise NotFoundError("Link not found")

        # Delete link
        supabase.table('parent_student_links').delete().eq('id', link_id).execute()

        logger.info(f"Admin {admin_id} deleted parent-student link {link_id}")

        return jsonify({'message': 'Link deleted successfully'}), 200

    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error deleting parent-student link: {str(e)}")
        return jsonify({'error': 'Failed to delete link'}), 500


@bp.route('/admin/links', methods=['GET'])
@require_admin
def admin_list_links(admin_id):
    """
    Admin views all parent-student links.
    Supports filtering by parent or student.

    Query params:
    - parent_user_id: Filter by parent
    - student_user_id: Filter by student
    """
    try:
        supabase = get_supabase_admin_client()

        parent_filter = request.args.get('parent_user_id')
        student_filter = request.args.get('student_user_id')

        # Build query
        query = supabase.table('parent_student_links').select('''
            id,
            parent_user_id,
            student_user_id,
            created_at,
            admin_verified,
            verified_at,
            parent:users!parent_student_links_parent_user_id_fkey(
                id,
                first_name,
                last_name,
                email
            ),
            student:users!parent_student_links_student_user_id_fkey(
                id,
                first_name,
                last_name,
                email
            )
        ''')

        if parent_filter:
            query = query.eq('parent_user_id', parent_filter)
        if student_filter:
            query = query.eq('student_user_id', student_filter)

        result = query.order('created_at', desc=True).execute()

        links = []
        for link in result.data:
            parent_data = link.get('parent', {})
            student_data = link.get('student', {})

            links.append({
                'link_id': link['id'],
                'parent': {
                    'id': link['parent_user_id'],
                    'first_name': parent_data.get('first_name'),
                    'last_name': parent_data.get('last_name'),
                    'email': parent_data.get('email')
                },
                'student': {
                    'id': link['student_user_id'],
                    'first_name': student_data.get('first_name'),
                    'last_name': student_data.get('last_name'),
                    'email': student_data.get('email')
                },
                'created_at': link['created_at'],
                'admin_verified': link.get('admin_verified', False),
                'verified_at': link.get('verified_at')
            })

        return jsonify({'links': links}), 200

    except Exception as e:
        logger.error(f"Error listing parent-student links: {str(e)}")
        return jsonify({'error': 'Failed to list links'}), 500
