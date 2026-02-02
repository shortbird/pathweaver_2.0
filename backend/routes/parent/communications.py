"""
Parent Communications - Read-Only Student Conversation Viewing.
Allows parents to view their children's DMs, groups, and AI tutor conversations.
Part of org feedback features (February 2026).
"""
from flask import Blueprint, jsonify, request
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth, validate_uuid_param
from middleware.error_handler import AuthorizationError, NotFoundError
from utils.logger import get_logger
from .dashboard_overview import verify_parent_access

logger = get_logger(__name__)

bp = Blueprint('parent_communications', __name__, url_prefix='/api/parent')


@bp.route('/student/<student_id>/conversations/all', methods=['GET'])
@require_auth
@validate_uuid_param('student_id')
def get_all_student_conversations(user_id, student_id):
    """
    Get unified list of all conversation types for a student.
    Includes: DMs, groups, AI tutor conversations.
    Read-only access for parents.
    """
    try:
        supabase = get_supabase_admin_client()
        verify_parent_access(supabase, user_id, student_id)

        conversations = []

        # 1. Get DM conversations
        dm_convos_p1 = supabase.table('message_conversations').select('''
            id, participant_1_id, participant_2_id, last_message_at,
            last_message_preview, created_at
        ''').eq('participant_1_id', student_id).execute()

        dm_convos_p2 = supabase.table('message_conversations').select('''
            id, participant_1_id, participant_2_id, last_message_at,
            last_message_preview, created_at
        ''').eq('participant_2_id', student_id).execute()

        # Get other participant info for DMs
        all_dm_convos = (dm_convos_p1.data or []) + (dm_convos_p2.data or [])
        for dm in all_dm_convos:
            other_user_id = dm['participant_2_id'] if dm['participant_1_id'] == student_id else dm['participant_1_id']
            user_info = _get_user_display_info(supabase, other_user_id)
            conversations.append({
                'id': dm['id'],
                'type': 'dm',
                'name': user_info.get('display_name') or f"{user_info.get('first_name', '')} {user_info.get('last_name', '')}".strip() or 'Unknown',
                'avatar_url': user_info.get('avatar_url'),
                'last_message_at': dm['last_message_at'],
                'last_message_preview': dm['last_message_preview'] or '',
                'other_user_id': other_user_id
            })

        # 2. Get group conversations
        group_memberships = supabase.table('group_members').select('''
            group_id,
            group_conversations:group_id(id, name, description, created_at, last_message_at, last_message_preview)
        ''').eq('user_id', student_id).execute()

        for membership in (group_memberships.data or []):
            group = membership.get('group_conversations')
            if group:
                conversations.append({
                    'id': group['id'],
                    'type': 'group',
                    'name': group['name'],
                    'description': group.get('description'),
                    'avatar_url': None,
                    'last_message_at': group.get('last_message_at'),
                    'last_message_preview': group.get('last_message_preview') or ''
                })

        # 3. Get AI tutor conversations
        tutor_convos = supabase.table('tutor_conversations').select('''
            id, title, conversation_mode, created_at, updated_at, last_message_at
        ''').eq('user_id', student_id).order('updated_at', desc=True).limit(50).execute()

        for tutor in (tutor_convos.data or []):
            conversations.append({
                'id': tutor['id'],
                'type': 'tutor',
                'name': tutor.get('title') or 'AI Tutor Chat',
                'mode': tutor.get('conversation_mode'),
                'last_message_at': tutor.get('last_message_at') or tutor.get('updated_at'),
                'last_message_preview': ''
            })

        # Sort all conversations by last_message_at
        conversations.sort(key=lambda x: x.get('last_message_at') or '', reverse=True)

        return jsonify({
            'success': True,
            'conversations': conversations,
            'counts': {
                'dm': len([c for c in conversations if c['type'] == 'dm']),
                'group': len([c for c in conversations if c['type'] == 'group']),
                'tutor': len([c for c in conversations if c['type'] == 'tutor'])
            }
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error getting student conversations: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to get conversations'}), 500


@bp.route('/student/<student_id>/dm-conversations', methods=['GET'])
@require_auth
@validate_uuid_param('student_id')
def get_student_dm_conversations(user_id, student_id):
    """Get all DM conversations for a student (read-only for parent)."""
    try:
        supabase = get_supabase_admin_client()
        verify_parent_access(supabase, user_id, student_id)

        # Get DM conversations
        dm_convos_p1 = supabase.table('message_conversations').select('''
            id, participant_1_id, participant_2_id, last_message_at,
            last_message_preview, created_at
        ''').eq('participant_1_id', student_id).execute()

        dm_convos_p2 = supabase.table('message_conversations').select('''
            id, participant_1_id, participant_2_id, last_message_at,
            last_message_preview, created_at
        ''').eq('participant_2_id', student_id).execute()

        conversations = []
        for dm in (dm_convos_p1.data or []) + (dm_convos_p2.data or []):
            other_user_id = dm['participant_2_id'] if dm['participant_1_id'] == student_id else dm['participant_1_id']
            user_info = _get_user_display_info(supabase, other_user_id)
            conversations.append({
                'id': dm['id'],
                'other_user': user_info,
                'last_message_at': dm['last_message_at'],
                'last_message_preview': dm['last_message_preview'] or '',
                'created_at': dm['created_at']
            })

        conversations.sort(key=lambda x: x.get('last_message_at') or '', reverse=True)

        return jsonify({
            'success': True,
            'conversations': conversations,
            'total': len(conversations)
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error getting student DM conversations: {str(e)}")
        return jsonify({'error': 'Failed to get DM conversations'}), 500


@bp.route('/student/<student_id>/dm-conversations/<conversation_id>/messages', methods=['GET'])
@require_auth
@validate_uuid_param('student_id', 'conversation_id')
def get_student_dm_messages(user_id, student_id, conversation_id):
    """Get messages for a specific DM conversation (read-only for parent)."""
    try:
        supabase = get_supabase_admin_client()
        verify_parent_access(supabase, user_id, student_id)

        # Verify student is a participant in this conversation
        conversation = supabase.table('message_conversations').select('*').eq('id', conversation_id).single().execute()
        if not conversation.data:
            raise NotFoundError("Conversation not found")

        if conversation.data['participant_1_id'] != student_id and conversation.data['participant_2_id'] != student_id:
            raise AuthorizationError("Student is not a participant in this conversation")

        # Get pagination params
        limit = min(int(request.args.get('limit', 50)), 100)
        offset = int(request.args.get('offset', 0))

        # Get messages
        messages = supabase.table('direct_messages').select('''
            id, sender_id, content, created_at, is_read,
            sender:sender_id(id, display_name, first_name, last_name, avatar_url, role)
        ''').eq('conversation_id', conversation_id).order('created_at', desc=True).range(offset, offset + limit - 1).execute()

        return jsonify({
            'success': True,
            'messages': messages.data or [],
            'conversation_id': conversation_id,
            'count': len(messages.data or []),
            'limit': limit,
            'offset': offset
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error getting DM messages: {str(e)}")
        return jsonify({'error': 'Failed to get messages'}), 500


@bp.route('/student/<student_id>/group-conversations', methods=['GET'])
@require_auth
@validate_uuid_param('student_id')
def get_student_group_conversations(user_id, student_id):
    """Get all group conversations for a student (read-only for parent)."""
    try:
        supabase = get_supabase_admin_client()
        verify_parent_access(supabase, user_id, student_id)

        group_memberships = supabase.table('group_members').select('''
            group_id, joined_at,
            group_conversations:group_id(id, name, description, created_by, created_at, last_message_at, last_message_preview)
        ''').eq('user_id', student_id).execute()

        groups = []
        for membership in (group_memberships.data or []):
            group = membership.get('group_conversations')
            if group:
                groups.append({
                    **group,
                    'joined_at': membership['joined_at']
                })

        groups.sort(key=lambda x: x.get('last_message_at') or '', reverse=True)

        return jsonify({
            'success': True,
            'groups': groups,
            'total': len(groups)
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error getting student group conversations: {str(e)}")
        return jsonify({'error': 'Failed to get group conversations'}), 500


@bp.route('/student/<student_id>/group-conversations/<group_id>/messages', methods=['GET'])
@require_auth
@validate_uuid_param('student_id', 'group_id')
def get_student_group_messages(user_id, student_id, group_id):
    """Get messages for a specific group conversation (read-only for parent)."""
    try:
        supabase = get_supabase_admin_client()
        verify_parent_access(supabase, user_id, student_id)

        # Verify student is a member of this group
        membership = supabase.table('group_members').select('id').eq('group_id', group_id).eq('user_id', student_id).execute()
        if not membership.data:
            raise AuthorizationError("Student is not a member of this group")

        # Get pagination params
        limit = min(int(request.args.get('limit', 50)), 100)
        offset = int(request.args.get('offset', 0))

        # Get messages
        messages = supabase.table('group_messages').select('''
            id, sender_id, content, created_at,
            sender:sender_id(id, display_name, first_name, last_name, avatar_url, role)
        ''').eq('group_id', group_id).order('created_at', desc=True).range(offset, offset + limit - 1).execute()

        return jsonify({
            'success': True,
            'messages': messages.data or [],
            'group_id': group_id,
            'count': len(messages.data or []),
            'limit': limit,
            'offset': offset
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error getting group messages: {str(e)}")
        return jsonify({'error': 'Failed to get messages'}), 500


@bp.route('/student/<student_id>/tutor-conversations', methods=['GET'])
@require_auth
@validate_uuid_param('student_id')
def get_student_tutor_conversations(user_id, student_id):
    """Get all AI tutor conversations for a student (read-only for parent)."""
    try:
        supabase = get_supabase_admin_client()
        verify_parent_access(supabase, user_id, student_id)

        conversations = supabase.table('tutor_conversations').select('''
            id, title, conversation_mode, quest_id, task_id, created_at, updated_at, last_message_at, message_count
        ''').eq('user_id', student_id).order('updated_at', desc=True).limit(50).execute()

        return jsonify({
            'success': True,
            'conversations': conversations.data or [],
            'total': len(conversations.data or [])
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error getting student tutor conversations: {str(e)}")
        return jsonify({'error': 'Failed to get tutor conversations'}), 500


@bp.route('/student/<student_id>/tutor-conversations/<conversation_id>/messages', methods=['GET'])
@require_auth
@validate_uuid_param('student_id', 'conversation_id')
def get_student_tutor_messages(user_id, student_id, conversation_id):
    """Get messages for a specific AI tutor conversation (read-only for parent)."""
    try:
        supabase = get_supabase_admin_client()
        verify_parent_access(supabase, user_id, student_id)

        # Verify the conversation belongs to this student
        conversation = supabase.table('tutor_conversations').select('id, user_id, title, conversation_mode').eq('id', conversation_id).single().execute()
        if not conversation.data:
            raise NotFoundError("Conversation not found")

        if conversation.data['user_id'] != student_id:
            raise AuthorizationError("Conversation does not belong to this student")

        # Get pagination params
        limit = min(int(request.args.get('limit', 50)), 100)
        offset = int(request.args.get('offset', 0))

        # Get messages
        messages = supabase.table('tutor_messages').select('''
            id, role, content, created_at
        ''').eq('conversation_id', conversation_id).order('created_at', desc=True).range(offset, offset + limit - 1).execute()

        return jsonify({
            'success': True,
            'messages': messages.data or [],
            'conversation': {
                'id': conversation.data['id'],
                'title': conversation.data.get('title'),
                'mode': conversation.data.get('conversation_mode')
            },
            'count': len(messages.data or []),
            'limit': limit,
            'offset': offset
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error getting tutor messages: {str(e)}")
        return jsonify({'error': 'Failed to get messages'}), 500


def _get_user_display_info(supabase, user_id):
    """Get basic user info for display in conversation list."""
    try:
        user = supabase.table('users').select(
            'id, display_name, first_name, last_name, avatar_url, role'
        ).eq('id', user_id).single().execute()
        return user.data if user.data else {'id': user_id}
    except Exception:
        return {'id': user_id}
