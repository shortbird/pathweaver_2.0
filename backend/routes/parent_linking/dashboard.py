"""Parent/family views: my-children, my-links, family-parents.

Split from routes/parent_linking.py on 2026-04-14 (Q1).
"""

"""
REPOSITORY MIGRATION: MIGRATION CANDIDATE
- 30+ direct database calls for parent-student linking operations
- Complex JOIN queries with nested select (users table)
- Could create ParentLinkingRepository with methods:
  - get_linked_children(parent_id)
  - get_parent_links(student_id)
  - create_admin_link(parent_id, student_id, admin_id)
  - delete_link(link_id, admin_id)
  - submit_connection_requests(parent_id, children_data)
  - get_pending_requests(student_id)
  - approve_connection(link_id, student_id)
  - reject_connection(link_id, student_id)
- Note: Already uses ParentRepository (imported but unused), needs integration

Parent-Student Linking API routes.
Admin-only workflow for connecting parents to students.
Once linked, connections are permanent.

NOTE: Admin client usage justified throughout this file for parent-student linking operations.
Managing parent-student relationships requires cross-user operations and elevated privileges.
"""
from flask import Blueprint, request, jsonify
from datetime import datetime
from database import get_supabase_admin_client
from repositories import ParentRepository
from utils.auth.decorators import require_auth, require_admin
from middleware.error_handler import ValidationError, NotFoundError, AuthorizationError
import logging

from utils.logger import get_logger

logger = get_logger(__name__)



from routes.parent_linking import bp



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
        # admin client justified: parent-student link lifecycle (request/approve/revoke); cross-user writes to parent_student_links + cross-user reads of users for invitee lookup gated by user_id from @require_auth + status checks
        supabase = get_supabase_admin_client()

        # Get all linked students (only approved links)
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
                total_xp,
                ai_features_enabled,
                ai_chatbot_enabled,
                ai_lesson_helper_enabled,
                ai_task_generation_enabled
            )
        ''').eq('parent_user_id', user_id).eq('status', 'approved').execute()

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
                    'ai_features_enabled': student.get('ai_features_enabled', False),
                    'ai_chatbot_enabled': student.get('ai_chatbot_enabled', True),
                    'ai_lesson_helper_enabled': student.get('ai_lesson_helper_enabled', True),
                    'ai_task_generation_enabled': student.get('ai_task_generation_enabled', True),
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
        # admin client justified: parent-student link lifecycle (request/approve/revoke); cross-user writes to parent_student_links + cross-user reads of users for invitee lookup gated by user_id from @require_auth + status checks
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


@bp.route('/family-parents', methods=['GET'])
@require_auth
def get_family_parents(user_id):
    """
    Get list of co-parents who share access to this parent's children.
    Co-parents are determined by shared access to the same dependents or linked students.
    """
    try:
        # admin client justified: parent-student link lifecycle (request/approve/revoke); cross-user writes to parent_student_links + cross-user reads of users for invitee lookup gated by user_id from @require_auth + status checks
        supabase = get_supabase_admin_client()

        # Get current user's dependents (children they manage)
        dependents_response = supabase.table('users').select('id').eq('managed_by_parent_id', user_id).execute()
        dependent_ids = [d['id'] for d in (dependents_response.data or [])]

        # Get current user's linked students
        links_response = supabase.table('parent_student_links').select('student_user_id').eq('parent_user_id', user_id).eq('status', 'approved').execute()
        linked_student_ids = [l['student_user_id'] for l in (links_response.data or [])]

        all_child_ids = dependent_ids + linked_student_ids

        if not all_child_ids:
            return jsonify({'parents': []}), 200

        co_parent_ids = set()

        # Find other parents who manage the same dependents
        for dep_id in dependent_ids:
            # Get the dependent's info to find other parents with access
            dep_info = supabase.table('users').select('managed_by_parent_id').eq('id', dep_id).single().execute()
            if dep_info.data and dep_info.data.get('managed_by_parent_id'):
                other_parent_id = dep_info.data['managed_by_parent_id']
                if other_parent_id != user_id:
                    co_parent_ids.add(other_parent_id)

        # Find other parents linked to any of this parent's children
        for student_id in all_child_ids:
            other_links = supabase.table('parent_student_links').select('parent_user_id').eq('student_user_id', student_id).eq('status', 'approved').neq('parent_user_id', user_id).execute()
            for link in (other_links.data or []):
                co_parent_ids.add(link['parent_user_id'])

        # Get co-parent details
        parents = []
        for parent_id in co_parent_ids:
            parent_info = supabase.table('users').select('id, first_name, last_name, email, avatar_url, display_name').eq('id', parent_id).single().execute()
            if parent_info.data:
                p = parent_info.data
                parents.append({
                    'id': p['id'],
                    'name': p.get('display_name') or f"{p.get('first_name', '')} {p.get('last_name', '')}".strip() or 'Parent',
                    'email': p.get('email'),
                    'avatar_url': p.get('avatar_url'),
                    'status': 'active'
                })

        return jsonify({'parents': parents}), 200

    except Exception as e:
        logger.error(f"Error getting family parents: {str(e)}")
        return jsonify({'error': 'Failed to fetch family parents'}), 500


