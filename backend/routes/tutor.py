"""
AI Tutor API routes for chat functionality.
Handles conversations, messages, settings, and safety monitoring.
"""

from flask import Blueprint, request, jsonify
from datetime import datetime, date
from typing import Dict, List, Optional, Any
import uuid

from database import get_user_client, get_supabase_admin_client
from utils.auth.decorators import require_auth
from services.ai_tutor_service import AITutorService, TutorContext, ConversationMode
from services.safety_service import SafetyService, SafetyLevel
from services.tutor_tier_service import tutor_tier_service
from middleware.error_handler import ValidationError, AuthorizationError
from utils.validation.validators import validate_required_fields, validate_string_length
from utils.api_response import success_response, error_response

bp = Blueprint('tutor', __name__, url_prefix='/api/tutor')

# Initialize services
tutor_service = AITutorService()
safety_service = SafetyService()

@bp.route('/chat', methods=['POST'])
@require_auth
def send_message(user_id: str):
    """Send a message to AI tutor and get response"""
    try:
        data = request.get_json()

        # Validate required fields
        required_fields = ['message']
        validate_required_fields(data, required_fields)

        message = data['message'].strip()
        conversation_id = data.get('conversation_id')
        conversation_mode = data.get('mode', 'study_buddy')

        # Validate message
        if not message:
            raise ValidationError("Message cannot be empty")

        validate_string_length(message, 'message', max_length=2000)

        # Check daily message limit and tier access
        message_check = tutor_tier_service.can_send_message(user_id)
        if not message_check['can_send']:
            upgrade_suggestions = tutor_tier_service.get_upgrade_suggestions(user_id)
            return error_response(
                f"Daily message limit reached ({message_check['limit']} messages). Upgrade your subscription for more messages.",
                "rate_limit_exceeded",
                status_code=429,
                details={
                    'upgrade_url': '/subscription',
                    'current_tier': message_check['tier'],
                    'messages_remaining': message_check['messages_remaining'],
                    'upgrade_suggestions': upgrade_suggestions['suggestions']
                }
            )

        supabase = get_user_client(user_id)

        # Get or create conversation
        if conversation_id:
            conversation = _get_conversation(supabase, conversation_id, user_id)
            if not conversation:
                raise ValidationError("Conversation not found")
        else:
            conversation = _create_conversation(supabase, user_id, conversation_mode)
            conversation_id = conversation['id']

        # Build context for AI tutor
        context = _build_tutor_context(supabase, user_id, conversation)

        # Get user's current quest/task context if available
        current_quest_data = data.get('current_quest')
        current_task_data = data.get('current_task')

        if current_quest_data:
            context.current_quest = current_quest_data
        if current_task_data:
            context.current_task = current_task_data

        # Store user message
        user_message = _store_message(
            supabase, conversation_id, 'user', message, user_id
        )

        # Process message with AI tutor
        tutor_response = tutor_service.process_message(message, context)

        if not tutor_response['success']:
            return error_response(
                tutor_response.get('response', 'Failed to process message'),
                tutor_response.get('error', 'processing_failed'),
                status_code=500
            )

        # Store AI response
        ai_message = _store_message(
            supabase, conversation_id, 'assistant', tutor_response['response'], user_id,
            metadata={
                'safety_level': tutor_response.get('safety_level'),
                'suggestions': tutor_response.get('suggestions'),
                'next_questions': tutor_response.get('next_questions'),
                'xp_bonus_eligible': tutor_response.get('xp_bonus_eligible', False)
            }
        )

        # Increment message usage through tier service
        supabase_admin = get_supabase_admin_client()
        supabase_admin.rpc('increment_message_usage', {'p_user_id': user_id}).execute()

        # Award XP bonus if eligible
        if tutor_response.get('xp_bonus_eligible', False):
            _award_tutor_xp_bonus(supabase, user_id, ai_message['id'])

        # Notify parents if needed
        if tutor_response.get('requires_parent_notification', False):
            _schedule_parent_notification(user_id, conversation_id, message)

        return success_response({
            'conversation_id': conversation_id,
            'message_id': ai_message['id'],
            'response': tutor_response['response'],
            'suggestions': tutor_response.get('suggestions', []),
            'next_questions': tutor_response.get('next_questions', []),
            'xp_bonus_awarded': tutor_response.get('xp_bonus_eligible', False),
            'mode': conversation_mode
        })

    except ValidationError as e:
        return error_response(str(e), "validation_error", status_code=400)
    except Exception as e:
        return error_response(f"Failed to process message: {str(e)}", "internal_error", status_code=500)

@bp.route('/conversations', methods=['GET'])
@require_auth
def get_conversations(user_id: str):
    """Get user's tutor conversations"""
    try:
        supabase = get_user_client(user_id)

        # Get query parameters
        limit = min(int(request.args.get('limit', 20)), 100)
        offset = int(request.args.get('offset', 0))
        include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'

        query = supabase.table('tutor_conversations').select('''
            id, title, conversation_mode, quest_id, task_id,
            is_active, message_count, last_message_at, created_at,
            quests(title),
            quest_tasks(title, pillar)
        ''').eq('user_id', user_id)

        if not include_inactive:
            query = query.eq('is_active', True)

        conversations = query.order('last_message_at', desc=True).range(offset, offset + limit - 1).execute()

        return success_response({
            'conversations': conversations.data,
            'total': len(conversations.data),
            'limit': limit,
            'offset': offset
        })

    except Exception as e:
        return error_response(f"Failed to get conversations: {str(e)}", "internal_error", status_code=500)

@bp.route('/conversations/<conversation_id>', methods=['GET'])
@require_auth
def get_conversation(user_id: str, conversation_id: str):
    """Get specific conversation with messages"""
    try:
        supabase = get_user_client(user_id)

        # Verify conversation ownership
        conversation = _get_conversation(supabase, conversation_id, user_id)
        if not conversation:
            return error_response("Conversation not found", "not_found", status_code=404)

        # Get messages
        messages_limit = min(int(request.args.get('limit', 50)), 100)
        messages_offset = int(request.args.get('offset', 0))

        messages = supabase.table('tutor_messages').select('''
            id, role, content, safety_level, created_at, context_data
        ''').eq('conversation_id', conversation_id).order('created_at').range(
            messages_offset, messages_offset + messages_limit - 1
        ).execute()

        return success_response({
            'conversation': conversation,
            'messages': messages.data,
            'message_count': len(messages.data)
        })

    except Exception as e:
        return error_response(f"Failed to get conversation: {str(e)}", "internal_error", status_code=500)

@bp.route('/conversations/<conversation_id>', methods=['PUT'])
@require_auth
def update_conversation(user_id: str, conversation_id: str):
    """Update conversation settings"""
    try:
        data = request.get_json()
        supabase = get_user_client(user_id)

        # Verify conversation ownership
        conversation = _get_conversation(supabase, conversation_id, user_id)
        if not conversation:
            return error_response("Conversation not found", "not_found", status_code=404)

        update_data = {}

        if 'title' in data:
            validate_string_length(data['title'], 'title', max_length=255)
            update_data['title'] = data['title']

        if 'conversation_mode' in data:
            try:
                ConversationMode(data['conversation_mode'])
                update_data['conversation_mode'] = data['conversation_mode']
            except ValueError:
                raise ValidationError("Invalid conversation mode")

        if 'is_active' in data:
            update_data['is_active'] = bool(data['is_active'])

        if update_data:
            update_data['updated_at'] = datetime.utcnow().isoformat()

            result = supabase.table('tutor_conversations').update(update_data).eq(
                'id', conversation_id
            ).execute()

            return success_response({'conversation': result.data[0]})

        return success_response({'message': 'No updates provided'})

    except ValidationError as e:
        return error_response(str(e), "validation_error", status_code=400)
    except Exception as e:
        return error_response(f"Failed to update conversation: {str(e)}", "internal_error", status_code=500)

@bp.route('/settings', methods=['GET'])
@require_auth
def get_settings(user_id: str):
    """Get user's tutor settings"""
    try:
        supabase = get_user_client(user_id)

        settings = supabase.table('tutor_settings').select('*').eq('user_id', user_id).single().execute()

        if not settings.data:
            # Create default settings
            default_settings = _create_default_settings(supabase, user_id)
            return success_response({'settings': default_settings})

        return success_response({'settings': settings.data})

    except Exception as e:
        return error_response(f"Failed to get settings: {str(e)}", "internal_error", status_code=500)

@bp.route('/settings', methods=['PUT'])
@require_auth
def update_settings(user_id: str):
    """Update user's tutor settings"""
    try:
        data = request.get_json()
        supabase = get_user_client(user_id)

        update_data = {}

        if 'preferred_mode' in data:
            try:
                ConversationMode(data['preferred_mode'])
                update_data['preferred_mode'] = data['preferred_mode']
            except ValueError:
                raise ValidationError("Invalid preferred mode")

        if 'parent_monitoring_enabled' in data:
            update_data['parent_monitoring_enabled'] = bool(data['parent_monitoring_enabled'])

        if 'notification_preferences' in data:
            update_data['notification_preferences'] = data['notification_preferences']

        if 'age_verification' in data:
            age = int(data['age_verification'])
            if age < 5 or age > 18:
                raise ValidationError("Age must be between 5 and 18")
            update_data['age_verification'] = age

        if 'learning_style' in data:
            valid_styles = ['visual', 'auditory', 'kinesthetic', 'mixed']
            if data['learning_style'] not in valid_styles:
                raise ValidationError(f"Learning style must be one of: {', '.join(valid_styles)}")
            update_data['learning_style'] = data['learning_style']

        if update_data:
            update_data['updated_at'] = datetime.utcnow().isoformat()

            result = supabase.table('tutor_settings').upsert({
                'user_id': user_id,
                **update_data
            }).execute()

            return success_response({'settings': result.data[0]})

        return success_response({'message': 'No updates provided'})

    except ValidationError as e:
        return error_response(str(e), "validation_error", status_code=400)
    except Exception as e:
        return error_response(f"Failed to update settings: {str(e)}", "internal_error", status_code=500)

@bp.route('/report', methods=['POST'])
@require_auth
def report_content(user_id: str):
    """Report concerning content from tutor interaction"""
    try:
        data = request.get_json()

        required_fields = ['message_id', 'reason']
        validate_required_fields(data, required_fields)

        message_id = data['message_id']
        reason = data['reason']
        description = data.get('description', '')

        supabase = get_user_client(user_id)

        # Verify message ownership
        message = supabase.table('tutor_messages').select('''
            id, conversation_id, content,
            tutor_conversations!inner(user_id)
        ''').eq('id', message_id).single().execute()

        if not message.data or message.data['tutor_conversations']['user_id'] != user_id:
            return error_response("Message not found", "not_found", status_code=404)

        # Create safety report
        report = {
            'id': str(uuid.uuid4()),
            'user_id': user_id,
            'message_id': message_id,
            'conversation_id': message.data['conversation_id'],
            'incident_type': 'user_reported',
            'safety_level': 'requires_review',
            'original_message': message.data['content'],
            'safety_reasons': [reason],
            'admin_notes': f"User reported: {description}" if description else f"User reported: {reason}",
            'created_at': datetime.utcnow().isoformat()
        }

        supabase.table('tutor_safety_reports').insert(report).execute()

        return success_response({
            'message': 'Report submitted successfully',
            'report_id': report['id']
        })

    except ValidationError as e:
        return error_response(str(e), "validation_error", status_code=400)
    except Exception as e:
        return error_response(f"Failed to submit report: {str(e)}", "internal_error", status_code=500)

@bp.route('/starters', methods=['GET'])
@require_auth
def get_conversation_starters(user_id: str):
    """Get conversation starters based on user's current context"""
    try:
        supabase = get_user_client(user_id)

        # Build basic context
        context = _build_tutor_context(supabase, user_id)

        # Get conversation starters
        starters = tutor_service.get_conversation_starters(context)

        return success_response({
            'starters': starters,
            'mode': context.conversation_mode.value
        })

    except Exception as e:
        return error_response(f"Failed to get conversation starters: {str(e)}", "internal_error", status_code=500)

@bp.route('/usage', methods=['GET'])
@require_auth
def get_usage_stats(user_id: str):
    """Get user's tutor usage statistics"""
    try:
        # Get usage stats from tier service
        message_status = tutor_tier_service.can_send_message(user_id)
        feature_access = tutor_tier_service.get_feature_access(user_id)

        supabase = get_user_client(user_id)

        # Get today's analytics
        today = date.today().isoformat()
        today_analytics = supabase.table('tutor_analytics').select('*').eq(
            'user_id', user_id
        ).eq('date', today).single().execute()

        usage_data = {
            'daily_limit': message_status['limit'],
            'messages_used_today': message_status.get('messages_used', 0),
            'messages_remaining': message_status['messages_remaining'],
            'tier_name': message_status['tier'],
            'tier_features': message_status.get('tier_features', []),
            'feature_access': feature_access
        }

        if today_analytics.data:
            usage_data.update({
                'topics_discussed': today_analytics.data.get('topics_discussed', []),
                'learning_pillars_covered': today_analytics.data.get('learning_pillars_covered', []),
                'engagement_score': today_analytics.data.get('engagement_score', 0.0)
            })

        # Get overall stats
        total_conversations = supabase.table('tutor_conversations').select('id', count='exact').eq('user_id', user_id).execute()
        usage_data['total_conversations'] = total_conversations.count if total_conversations.count else 0

        return success_response({'usage': usage_data})

    except Exception as e:
        return error_response(f"Failed to get usage stats: {str(e)}", "internal_error", status_code=500)

@bp.route('/tier-info', methods=['GET'])
@require_auth
def get_tier_info(user_id: str):
    """Get user's subscription tier information and available features"""
    try:
        feature_access = tutor_tier_service.get_feature_access(user_id)
        upgrade_suggestions = tutor_tier_service.get_upgrade_suggestions(user_id)
        message_status = tutor_tier_service.can_send_message(user_id)

        return success_response({
            'tier_info': {
                'current_tier': feature_access['tier_name'],
                'daily_message_limit': feature_access['daily_limit'],
                'max_conversations': feature_access['max_conversations'],
                'messages_remaining': message_status['messages_remaining'],
                'can_send_message': message_status['can_send']
            },
            'features': {
                'basic_chat': feature_access['basic_chat'],
                'advanced_explanations': feature_access['advanced_explanations'],
                'quest_integration': feature_access['quest_integration'],
                'conversation_modes': feature_access['conversation_modes'],
                'learning_analytics': feature_access['learning_analytics'],
                'priority_support': feature_access['priority_support'],
                'unlimited_chat': feature_access['unlimited_chat'],
                'custom_learning_paths': feature_access['custom_learning_paths']
            },
            'upgrade_options': upgrade_suggestions['suggestions']
        })

    except Exception as e:
        return error_response(f"Failed to get tier info: {str(e)}", "internal_error", status_code=500)

# Helper functions

# Note: Message limit checking and usage tracking now handled by tutor_tier_service

def _get_conversation(supabase, conversation_id: str, user_id: str) -> Optional[Dict]:
    """Get conversation by ID if user owns it"""
    try:
        result = supabase.table('tutor_conversations').select('*').eq(
            'id', conversation_id
        ).eq('user_id', user_id).single().execute()
        return result.data
    except Exception:
        return None

def _create_conversation(supabase, user_id: str, mode: str = 'study_buddy') -> Dict:
    """Create new tutor conversation"""
    conversation_data = {
        'id': str(uuid.uuid4()),
        'user_id': user_id,
        'title': f"Chat Session - {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        'conversation_mode': mode,
        'created_at': datetime.utcnow().isoformat()
    }

    result = supabase.table('tutor_conversations').insert(conversation_data).execute()
    return result.data[0]

def _store_message(supabase, conversation_id: str, role: str, content: str, user_id: str, metadata: Optional[Dict] = None) -> Dict:
    """Store message in database"""
    message_data = {
        'id': str(uuid.uuid4()),
        'conversation_id': conversation_id,
        'role': role,
        'content': content,
        'created_at': datetime.utcnow().isoformat()
    }

    if metadata:
        message_data.update({
            'safety_level': metadata.get('safety_level', 'safe'),
            'context_data': {
                'suggestions': metadata.get('suggestions', []),
                'next_questions': metadata.get('next_questions', []),
                'xp_bonus_eligible': metadata.get('xp_bonus_eligible', False)
            }
        })

    result = supabase.table('tutor_messages').insert(message_data).execute()
    return result.data[0]

def _build_tutor_context(supabase, user_id: str, conversation: Optional[Dict] = None) -> TutorContext:
    """Build tutor context from user data"""
    context = TutorContext(user_id=user_id)

    try:
        # Get user settings
        settings = supabase.table('tutor_settings').select('*').eq('user_id', user_id).single().execute()
        if settings.data:
            context.user_age = settings.data.get('age_verification')
            context.learning_style = settings.data.get('learning_style')
            if settings.data.get('preferred_mode'):
                context.conversation_mode = ConversationMode(settings.data['preferred_mode'])

        # Get recent messages for context
        if conversation:
            messages = supabase.table('tutor_messages').select('role, content').eq(
                'conversation_id', conversation['id']
            ).order('created_at', desc=True).limit(5).execute()
            context.previous_messages = messages.data

        # Get user's current active quest
        active_quest = supabase.table('user_quests').select('''
            quest_id,
            quests!inner(id, title, description)
        ''').eq('user_id', user_id).eq('is_active', True).limit(1).execute()

        if active_quest.data:
            quest_data = active_quest.data[0]['quests']
            context.current_quest = quest_data

    except Exception as e:
        # If context building fails, use defaults
        print(f"Warning: Failed to build full context for user {user_id}: {e}")

    return context

def _create_default_settings(supabase, user_id: str) -> Dict:
    """Create default tutor settings for user"""
    default_settings = {
        'user_id': user_id,
        'preferred_mode': 'study_buddy',
        'daily_message_limit': 50,  # Will be updated based on subscription tier
        'messages_used_today': 0,
        'last_reset_date': date.today().isoformat(),
        'parent_monitoring_enabled': True,
        'notification_preferences': {},
        'created_at': datetime.utcnow().isoformat()
    }

    result = supabase.table('tutor_settings').insert(default_settings).execute()
    return result.data[0]

def _award_tutor_xp_bonus(supabase, user_id: str, message_id: str):
    """Award XP bonus for deep engagement with tutor"""
    try:
        # Award 25 XP bonus for thoughtful tutor interaction
        # This would integrate with the existing XP system
        bonus_xp = 25

        # Update message to mark XP as awarded
        supabase.table('tutor_messages').update({
            'xp_bonus_awarded': True
        }).eq('id', message_id).execute()

        # TODO: Integrate with existing XP service
        # from services.xp_service import award_bonus_xp
        # award_bonus_xp(user_id, bonus_xp, 'tutor_engagement')

    except Exception as e:
        print(f"Failed to award tutor XP bonus: {e}")

def _schedule_parent_notification(user_id: str, conversation_id: str, message_content: str):
    """Schedule notification to parents about concerning content"""
    try:
        # This would integrate with the notification system
        # For now, just log the event
        print(f"Parent notification scheduled for user {user_id}, conversation {conversation_id}")

        # TODO: Implement actual parent notification system
        # - Check if parent monitoring is enabled
        # - Get parent contact info
        # - Send appropriate notification

    except Exception as e:
        print(f"Failed to schedule parent notification: {e}")

# Error handlers
@bp.errorhandler(ValidationError)
def handle_validation_error(error):
    return error_response(str(error), "validation_error", status_code=400)

@bp.errorhandler(AuthorizationError)
def handle_authorization_error(error):
    return error_response(str(error), "authorization_error", status_code=403)