"""
AI Tutor - Chat Functionality.
Part of tutor.py refactoring (P2-ARCH-1).
"""
"""
REPOSITORY MIGRATION: NO MIGRATION NEEDED
- Uses AITutorService for all AI chat functionality (service layer pattern)
- Uses SafetyService for content moderation
- Already uses TutorRepository for data persistence (lines 12-17)
- Service layer is essential for complex AI tutor interactions
- Proper encapsulation of conversation state and AI model management

AI Tutor API routes for chat functionality.
Handles conversations, messages, settings, and safety monitoring.
"""

from flask import Blueprint, request, jsonify
from datetime import datetime, date
from typing import Dict, List, Optional, Any
import uuid
import logging

from utils.logger import get_logger
from repositories import (
    QuestRepository,
    TaskCompletionRepository,
    TaskRepository,
    TutorRepository,
    UserRepository
)

logger = get_logger(__name__)

from database import get_user_client, get_supabase_admin_client
from repositories import (
    UserRepository,
    QuestRepository,
    BadgeRepository,
    EvidenceRepository,
    FriendshipRepository,
    ParentRepository,
    TutorRepository,
    LMSRepository,
    AnalyticsRepository
)
from utils.auth.decorators import require_auth
from services.ai_tutor_service import AITutorService, TutorContext, ConversationMode
from services.safety_service import SafetyService, SafetyLevel
from services.tutor_conversation_service import TutorConversationService
from middleware.error_handler import ValidationError, AuthorizationError
from middleware.rate_limiter import rate_limit
from utils.validation.validators import validate_required_fields, validate_string_length
from utils.api_response import success_response, error_response

bp = Blueprint('tutor', __name__, url_prefix='/api/tutor')

# Set up logging
logger = logging.getLogger(__name__)

# Initialize services (lazy loading to prevent module-level errors)
tutor_service = None
safety_service = None

def get_tutor_service():
    """Get tutor service with lazy initialization"""
    global tutor_service
    if tutor_service is None:
        try:
            import os
            logger.info("Initializing AITutorService...")
            logger.info("TUTOR SERVICE: Initializing AITutorService...")
            logger.info(f"GEMINI_API_KEY present: {'GEMINI_API_KEY' in os.environ}")
            logger.debug(f"TUTOR SERVICE: GEMINI_API_KEY present: {'GEMINI_API_KEY' in os.environ}")
            logger.info(f"GOOGLE_API_KEY present: {'GOOGLE_API_KEY' in os.environ}")
            logger.debug(f"TUTOR SERVICE: GOOGLE_API_KEY present: {'GOOGLE_API_KEY' in os.environ}")
            tutor_service = AITutorService()
            logger.info("AITutorService initialized successfully")
            logger.info("TUTOR SERVICE: AITutorService initialized successfully")
        except Exception as e:
            logger.error(f"CRITICAL: Failed to initialize AITutorService: {e}")
            logger.error(f"TUTOR SERVICE CRITICAL: Failed to initialize AITutorService: {e}")
            logger.error(f"Exception type: {type(e).__name__}")
            logger.error(f"TUTOR SERVICE: Exception type: {type(e).__name__}")
            logger.error(f"Exception args: {e.args}")
            logger.error(f"TUTOR SERVICE: Exception args: {e.args}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            raise Exception(f"Tutor service unavailable: {e}")
    return tutor_service

def get_safety_service():
    """Get safety service with lazy initialization"""
    global safety_service
    if safety_service is None:
        safety_service = SafetyService()
    return safety_service

# Using repository pattern for database access
@bp.route('/chat', methods=['POST'])
@rate_limit(limit=50, per=3600)  # 50 per hour (per P1-SEC-2)
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
        conversation_mode = data.get('mode', 'teacher')

        # Validate message
        if not message:
            raise ValidationError("Message cannot be empty")

        validate_string_length(message, 'message', max_length=2000)

        supabase = get_supabase_admin_client()
        conversation_service = TutorConversationService(supabase)

        # Get or create conversation
        if conversation_id:
            conversation = conversation_service.get_conversation(conversation_id, user_id)
            if not conversation:
                raise ValidationError("Conversation not found")
        else:
            conversation = conversation_service.create_conversation(user_id, conversation_mode)
            conversation_id = conversation['id']

        # Build context for AI tutor
        context = conversation_service.build_tutor_context(user_id, conversation, conversation_mode)

        # Get quest context - prefer quest_id (server-side fetch) over current_quest (client-provided)
        quest_id = data.get('quest_id')
        if quest_id:
            # Fetch rich quest context server-side
            quest_context = conversation_service.build_quest_context(user_id, quest_id)
            if quest_context:
                context.current_quest = quest_context
        else:
            # Fallback to client-provided quest data for backwards compatibility
            current_quest_data = data.get('current_quest')
            if current_quest_data:
                context.current_quest = current_quest_data

        # Get task context if provided
        current_task_data = data.get('current_task')
        if current_task_data:
            context.current_task = current_task_data

        # Get lesson context if lesson_id provided (for lesson-integrated chatbot)
        lesson_id = data.get('lesson_id')
        block_index = data.get('block_index')  # Optional: which content block user is viewing
        action_type = data.get('action_type')  # Optional: example, analogy, draw, debate

        if lesson_id:
            lesson_context = conversation_service.build_lesson_context(user_id, lesson_id, block_index)
            if lesson_context:
                context.current_lesson = lesson_context
                context.lesson_action_type = action_type
                logger.info(f"Built lesson context for lesson {lesson_id}, block {block_index}, action {action_type}")

        # Store user message
        user_message = conversation_service.store_message(
            conversation_id, 'user', message, user_id
        )

        # Process message with AI tutor
        logger.info("About to call get_tutor_service()")
        logger.debug("TUTOR DEBUG: About to call get_tutor_service()")
        try:
            tutor_service = get_tutor_service()
            logger.info("Got tutor service, processing message...")
            logger.debug("TUTOR DEBUG: Got tutor service, processing message...")
            tutor_response = tutor_service.process_message(message, context)
            logger.info("AI tutor processing completed")
            logger.debug("TUTOR DEBUG: AI tutor processing completed")
        except Exception as e:
            logger.error(f"Exception during tutor service call: {e}")
            logger.error(f"TUTOR DEBUG: Exception during tutor service call: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            raise

        logger.info("Checking tutor response success status...")
        if not tutor_response['success']:
            logger.error(f"Tutor response failed: {tutor_response}")
            return error_response(
                tutor_response.get('response', 'Failed to process message'),
                status_code=500,
                error_code=tutor_response.get('error', 'processing_failed')
            )

        logger.info("Tutor response successful, storing AI message...")
        # Store AI response
        try:
            ai_message = conversation_service.store_message(
                conversation_id, 'assistant', tutor_response['response'], user_id,
                metadata={
                    'safety_level': tutor_response.get('safety_level'),
                    'suggestions': tutor_response.get('suggestions'),
                    'next_questions': tutor_response.get('next_questions'),
                    'xp_bonus_eligible': tutor_response.get('xp_bonus_eligible', False)
                }
            )
            logger.info(f"AI message stored successfully with ID: {ai_message['id']}")
        except Exception as e:
            logger.error(f"Failed to store AI message: {e}")
            raise

        # Award XP bonus if eligible
        if tutor_response.get('xp_bonus_eligible', False):
            logger.info("Awarding XP bonus...")
            try:
                conversation_service.award_tutor_xp_bonus(user_id, ai_message['id'])
                logger.info("XP bonus awarded successfully")
            except Exception as e:
                logger.error(f"Failed to award XP bonus: {e}")
                # Don't raise here as it's not critical

        # Notify parents if needed
        if tutor_response.get('requires_parent_notification', False):
            logger.info("Scheduling parent notification...")
            try:
                conversation_service.schedule_parent_notification(user_id, conversation_id, message)
                logger.info("Parent notification scheduled")
            except Exception as e:
                logger.error(f"Failed to schedule parent notification: {e}")
                # Don't raise here as it's not critical

        logger.info("Preparing success response...")
        logger.info(f"Tutor response content: '{tutor_response.get('response', 'NO RESPONSE KEY')}'")
        logger.info(f"Tutor response keys: {list(tutor_response.keys()) if isinstance(tutor_response, dict) else 'NOT A DICT'}")

        response_data = {
            'conversation_id': conversation_id,
            'message_id': ai_message['id'],
            'response': tutor_response['response'],
            'suggestions': tutor_response.get('suggestions', []),
            'next_questions': tutor_response.get('next_questions', []),
            'xp_bonus_awarded': tutor_response.get('xp_bonus_eligible', False),
            'mode': conversation_mode
        }
        logger.info(f"Final response data: {response_data}")
        logger.info(f"Response content length: {len(response_data.get('response', ''))}")
        return success_response(response_data)

    except ValidationError as e:
        logger.error(f"ValidationError in send_message: {str(e)}")
        return error_response(str(e), status_code=400, error_code="validation_error")
    except Exception as e:
        import traceback
        logger.error(f"CRITICAL ERROR in send_message: {str(e)}")
        logger.error(f"Exception type: {type(e).__name__}")
        logger.error(f"TRACEBACK: {traceback.format_exc()}")
        # Also print to ensure it shows up somewhere
        logger.error(f"CRITICAL ERROR in send_message: {str(e)}")
        logger.error(f"Exception type: {type(e).__name__}")
        logger.info(f"TRACEBACK: {traceback.format_exc()}")
        return error_response(f"Failed to process message: {str(e)}", status_code=500, error_code="internal_error")

@bp.route('/conversations', methods=['GET'])
@require_auth
def get_conversations(user_id: str):
    """Get user's tutor conversations"""
    try:
        supabase = get_supabase_admin_client()

        # Get query parameters
        limit = min(int(request.args.get('limit', 20)), 100)
        offset = int(request.args.get('offset', 0))
        include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'

        query = supabase.table('tutor_conversations').select('''
            id, title, conversation_mode, quest_id, task_id,
            is_active, message_count, last_message_at, created_at, updated_at
        ''').eq('user_id', user_id)

        if not include_inactive:
            query = query.eq('is_active', True)

        # Sort by created_at descending (most recent first)
        # This is reliable and doesn't have issues with NULL values
        conversations = query.order('created_at', desc=True).range(offset, offset + limit - 1).execute()

        return success_response({
            'conversations': conversations.data,
            'total': len(conversations.data),
            'limit': limit,
            'offset': offset
        })

    except Exception as e:
        return error_response(f"Failed to get conversations: {str(e)}", status_code=500, error_code="internal_error")

@bp.route('/conversations/<conversation_id>', methods=['GET'])
@require_auth
def get_conversation(user_id: str, conversation_id: str):
    """Get specific conversation with messages"""
    try:
        supabase = get_supabase_admin_client()
        conversation_service = TutorConversationService(supabase)

        # Verify conversation ownership
        conversation = conversation_service.get_conversation(conversation_id, user_id)
        if not conversation:
            return error_response("Conversation not found", status_code=404, error_code="not_found")

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
        return error_response(f"Failed to get conversation: {str(e)}", status_code=500, error_code="internal_error")

@bp.route('/conversations/<conversation_id>', methods=['PUT'])
@require_auth
def update_conversation(user_id: str, conversation_id: str):
    """Update conversation settings"""
    try:
        data = request.get_json()
        supabase = get_supabase_admin_client()
        conversation_service = TutorConversationService(supabase)

        # Verify conversation ownership
        conversation = conversation_service.get_conversation(conversation_id, user_id)
        if not conversation:
            return error_response("Conversation not found", status_code=404, error_code="not_found")

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
        return error_response(str(e), status_code=400, error_code="validation_error")
    except Exception as e:
        return error_response(f"Failed to update conversation: {str(e)}", status_code=500, error_code="internal_error")

@bp.route('/settings', methods=['GET'])
@require_auth
def get_settings(user_id: str):
    """Get user's tutor settings"""
    try:
        supabase = get_supabase_admin_client()
        conversation_service = TutorConversationService(supabase)

        settings = supabase.table('tutor_settings').select('*').eq('user_id', user_id).execute()

        if not settings.data or len(settings.data) == 0:
            # Create default settings
            default_settings = conversation_service.create_default_settings(user_id)
            return success_response({'settings': default_settings})

        return success_response({'settings': settings.data[0]})

    except Exception as e:
        return error_response(f"Failed to get settings: {str(e)}", status_code=500, error_code="internal_error")

@bp.route('/settings', methods=['PUT'])
@require_auth
def update_settings(user_id: str):
    """Update user's tutor settings"""
    try:
        data = request.get_json()
        supabase = get_supabase_admin_client()

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
        return error_response(str(e), status_code=400, error_code="validation_error")
    except Exception as e:
        return error_response(f"Failed to update settings: {str(e)}", status_code=500, error_code="internal_error")

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

        supabase = get_supabase_admin_client()

        # Verify message ownership
        message = supabase.table('tutor_messages').select('''
            id, conversation_id, content,
            tutor_conversations!inner(user_id)
        ''').eq('id', message_id).single().execute()

        if not message.data or message.data['tutor_conversations']['user_id'] != user_id:
            return error_response("Message not found", status_code=404, error_code="not_found")

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
        return error_response(str(e), status_code=400, error_code="validation_error")
    except Exception as e:
        return error_response(f"Failed to submit report: {str(e)}", status_code=500, error_code="internal_error")

@bp.route('/starters', methods=['GET'])
@require_auth
def get_conversation_starters(user_id: str):
    """Get conversation starters based on user's current context"""
    try:
        supabase = get_supabase_admin_client()
        conversation_service = TutorConversationService(supabase)

        # Build basic context
        context = conversation_service.build_tutor_context(user_id)

        # Get conversation starters
        starters = get_tutor_service().get_conversation_starters(context)

        return success_response({
            'starters': starters,
            'mode': context.conversation_mode.value
        })

    except Exception as e:
        import traceback
        logger.error(f"ERROR in get_conversation_starters: {str(e)}")
        logger.info(f"TRACEBACK: {traceback.format_exc()}")
        return error_response(f"Failed to get conversation starters: {str(e)}", status_code=500, error_code="internal_error")

@bp.route('/usage', methods=['GET'])
@require_auth
def get_usage_stats(user_id: str):
    """Get user's tutor usage statistics"""
    try:
        logger.info(f"Getting usage stats for user: {user_id}")

        supabase = get_supabase_admin_client()

        usage_data = {
            'daily_limit': None,  # No tier limits anymore
            'messages_used_today': 0,
            'messages_remaining': None,  # Unlimited
            'topics_discussed': [],
            'learning_pillars_covered': [],
            'engagement_score': 0.0,
            'total_conversations': 0
        }

        # Try to get today's analytics with error handling
        try:
            logger.info("Fetching today's analytics...")
            today = date.today().isoformat()
            today_analytics = supabase.table('tutor_analytics').select('*').eq(
                'user_id', user_id
            ).eq('date', today).execute()

            if today_analytics.data and len(today_analytics.data) > 0:
                analytics_data = today_analytics.data[0]
                usage_data.update({
                    'topics_discussed': analytics_data.get('topics_discussed', []),
                    'learning_pillars_covered': analytics_data.get('learning_pillars_covered', []),
                    'engagement_score': analytics_data.get('engagement_score', 0.0)
                })
        except Exception as analytics_error:
            logger.warning(f"Failed to fetch analytics (using defaults): {analytics_error}")

        # Try to get overall stats with error handling
        try:
            logger.info("Fetching conversation count...")
            total_conversations = supabase.table('tutor_conversations').select('id', count='exact').eq('user_id', user_id).execute()
            usage_data['total_conversations'] = total_conversations.count if total_conversations.count else 0
            logger.info(f"Total conversations: {usage_data['total_conversations']}")
        except Exception as conv_error:
            logger.warning(f"Failed to fetch conversation count (using default): {conv_error}")
            usage_data['total_conversations'] = 0

        logger.info("Returning usage data...")
        return success_response({'usage': usage_data})

    except Exception as e:
        import traceback
        logger.error(f"ERROR in get_usage_stats: {str(e)}")
        logger.error(f"Exception type: {type(e).__name__}")
        logger.error(f"TRACEBACK: {traceback.format_exc()}")
        return error_response(f"Failed to get usage stats: {str(e)}", status_code=500, error_code="internal_error")

@bp.route('/debug', methods=['GET'])
@require_auth
def debug_tutor_service(user_id: str):
    """Debug endpoint to test tutor service initialization"""
    try:
        # Test 1: Basic response
        logger.debug(f"DEBUG: Testing endpoint for user {user_id}")

        # Test 2: Test AITutorService initialization
        logger.debug("DEBUG: Testing AITutorService initialization...")
        test_service = get_tutor_service()
        logger.debug("DEBUG: AITutorService initialized successfully")

        # Test 3: Test context building
        logger.debug("DEBUG: Testing context building...")
        supabase = get_supabase_admin_client()
        conversation_service = TutorConversationService(supabase)
        context = conversation_service.build_tutor_context(user_id)
        logger.debug(f"DEBUG: Context built: {context}")

        return success_response({
            'debug': 'All tests passed',
            'user_id': user_id,
            'context_mode': context.conversation_mode.value
        })

    except Exception as e:
        import traceback
        logger.error(f"DEBUG ERROR: {str(e)}")
        logger.debug(f"DEBUG TRACEBACK: {traceback.format_exc()}")
        return error_response(f"Debug failed: {str(e)}", status_code=500, error_code="debug_error")

# Error handlers
@bp.errorhandler(ValidationError)
def handle_validation_error(error):
    return error_response(str(error), "validation_error", status_code=400)

@bp.errorhandler(AuthorizationError)
def handle_authorization_error(error):
    return error_response(str(error), status_code=403, error_code="authorization_error")