"""
Demo API endpoints.
Provides AI-powered task generation for the public demo experience.

This endpoint does NOT require authentication - it's designed for unauthenticated
demo users to experience the platform's personalization capabilities.
"""

from flask import Blueprint, request, jsonify
from middleware.rate_limiter import rate_limit, get_real_ip

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('demo', __name__, url_prefix='/api/demo')

# Lazy loading for AI service to save memory
_demo_ai_service = None


def get_demo_ai_service():
    """Get demo AI service with lazy initialization"""
    global _demo_ai_service
    if _demo_ai_service is None:
        from services.demo_ai_service import DemoAIService
        _demo_ai_service = DemoAIService()
    return _demo_ai_service


# Basic profanity/inappropriate content filter
# Words that should trigger moderation - return generic tasks instead
BLOCKED_WORDS = [
    # Explicit content
    'porn', 'sex', 'nude', 'naked', 'xxx', 'nsfw',
    # Violence
    'kill', 'murder', 'bomb', 'terrorist', 'weapon',
    # Hate speech indicators
    'nazi', 'kkk', 'racist', 'hate',
    # Drug-related
    'cocaine', 'heroin', 'meth', 'drug dealer',
    # Other inappropriate
    'suicide', 'self-harm', 'anorexia'
]


def is_content_appropriate(text: str) -> bool:
    """
    Check if user input is appropriate for AI processing.

    Returns True if content is appropriate, False if it should be filtered.
    """
    if not text:
        return True

    text_lower = text.lower()

    for word in BLOCKED_WORDS:
        if word in text_lower:
            logger.warning(f"Demo content moderation flagged input containing: {word}")
            return False

    return True


# Fallback tasks when content is flagged or AI fails
FALLBACK_TASKS = {
    'build-robot': [
        {
            'title': 'Design your robot blueprint',
            'description': 'Sketch out your robot design including components and movement patterns',
            'xp': 100,
            'subjects': ['science', 'digital_literacy']
        },
        {
            'title': 'Build the robot frame',
            'description': 'Construct the physical structure using available materials',
            'xp': 150,
            'subjects': ['science', 'cte']
        },
        {
            'title': 'Program basic movements',
            'description': 'Write code to make your robot move forward, backward, and turn',
            'xp': 100,
            'subjects': ['digital_literacy', 'math']
        }
    ],
    'compose-music': [
        {
            'title': 'Study music theory basics',
            'description': 'Learn about scales, chords, and rhythm patterns',
            'xp': 100,
            'subjects': ['fine_arts']
        },
        {
            'title': 'Compose your melody',
            'description': 'Write an original melody using what you learned',
            'xp': 150,
            'subjects': ['fine_arts', 'language_arts']
        },
        {
            'title': 'Record and share your piece',
            'description': 'Record a performance of your composition',
            'xp': 100,
            'subjects': ['fine_arts', 'digital_literacy']
        }
    ],
    'start-business': [
        {
            'title': 'Identify your market opportunity',
            'description': 'Research what products or services people in your community need',
            'xp': 100,
            'subjects': ['financial_literacy', 'social_studies']
        },
        {
            'title': 'Create a business plan',
            'description': 'Write a plan including your product, pricing, and marketing strategy',
            'xp': 150,
            'subjects': ['language_arts', 'math']
        },
        {
            'title': 'Make your first sale',
            'description': 'Execute your plan and complete your first customer transaction',
            'xp': 100,
            'subjects': ['financial_literacy', 'language_arts']
        }
    ],
    'train-5k': [
        {
            'title': 'Create your training schedule',
            'description': 'Plan a weekly workout routine building up to 5K distance',
            'xp': 100,
            'subjects': ['pe', 'health', 'math']
        },
        {
            'title': 'Track your progress',
            'description': 'Log your runs and analyze your improvement over time',
            'xp': 100,
            'subjects': ['math', 'health']
        },
        {
            'title': 'Complete your 5K',
            'description': 'Run your full 5K and document the achievement',
            'xp': 150,
            'subjects': ['pe', 'health']
        }
    ],
    'create-film': [
        {
            'title': 'Write your screenplay',
            'description': 'Develop characters, dialogue, and scene descriptions',
            'xp': 100,
            'subjects': ['language_arts', 'fine_arts']
        },
        {
            'title': 'Plan and shoot your scenes',
            'description': 'Create a shot list and film your footage',
            'xp': 150,
            'subjects': ['fine_arts', 'digital_literacy']
        },
        {
            'title': 'Edit and present your film',
            'description': 'Edit your footage and hold a premiere screening',
            'xp': 100,
            'subjects': ['digital_literacy', 'language_arts']
        }
    ],
    'design-garden': [
        {
            'title': 'Research local growing conditions',
            'description': 'Study what plants thrive in your climate and soil type',
            'xp': 100,
            'subjects': ['science', 'social_studies']
        },
        {
            'title': 'Design your garden layout',
            'description': 'Create a plan showing plant placement and community access',
            'xp': 100,
            'subjects': ['science', 'math']
        },
        {
            'title': 'Plant and document growth',
            'description': 'Start planting and track your garden progress with photos',
            'xp': 150,
            'subjects': ['science', 'health']
        }
    ]
}


@bp.route('/generate-tasks', methods=['POST'])
@rate_limit(calls=3, period=3600)  # 3 per hour per IP - generous for demo
def generate_tasks():
    """
    Generate personalized tasks for a demo quest based on user interests.

    This is a PUBLIC endpoint - no authentication required.
    Rate limited to 3 requests per IP per hour.

    Request:
        {
            "quest_id": "build-robot",
            "quest_title": "Build a Robot",
            "interests": ["gaming", "technology"],
            "custom_input": "I love video games" (optional, max 100 chars)
        }

    Response:
        {
            "tasks": [
                {
                    "title": "Program robot to respond to game controller",
                    "description": "Connect your robot to a game controller...",
                    "xp": 150,
                    "subjects": ["science", "digital_literacy"]
                },
                ...
            ],
            "rate_limit_remaining": 2
        }
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'Request body is required'
            }), 400

        # Validate required fields
        quest_id = data.get('quest_id', '').strip()
        quest_title = data.get('quest_title', '').strip()
        interests = data.get('interests', [])
        custom_input = data.get('custom_input', '').strip()[:100]  # Limit to 100 chars

        if not quest_id:
            return jsonify({
                'success': False,
                'error': 'quest_id is required'
            }), 400

        if not quest_title:
            return jsonify({
                'success': False,
                'error': 'quest_title is required'
            }), 400

        # Validate interests is a list
        if not isinstance(interests, list):
            interests = []

        # Limit interests to 5 items, each max 50 chars
        interests = [str(i).strip()[:50] for i in interests[:5]]

        # Get rate limit info from request context (set by decorator)
        rate_info = getattr(request, 'rate_limit_info', {})
        rate_remaining = rate_info.get('remaining', 2)

        # Check content moderation for custom input
        combined_input = ' '.join(interests) + ' ' + custom_input
        if not is_content_appropriate(combined_input):
            # Return fallback tasks silently (no error to user)
            logger.warning(f"Demo moderation: flagged input from IP {get_real_ip()}")
            fallback = FALLBACK_TASKS.get(quest_id, FALLBACK_TASKS['build-robot'])
            return jsonify({
                'success': True,
                'tasks': fallback,
                'rate_limit_remaining': rate_remaining
            }), 200

        # Try AI generation
        try:
            ai_service = get_demo_ai_service()
            result = ai_service.generate_personalized_tasks(
                quest_id=quest_id,
                quest_title=quest_title,
                interests=interests,
                custom_input=custom_input
            )

            if result['success'] and result.get('tasks'):
                return jsonify({
                    'success': True,
                    'tasks': result['tasks'],
                    'rate_limit_remaining': rate_remaining
                }), 200
            else:
                # AI failed, use fallback
                logger.warning(f"Demo AI generation failed: {result.get('error', 'Unknown')}")
                fallback = FALLBACK_TASKS.get(quest_id, FALLBACK_TASKS['build-robot'])
                return jsonify({
                    'success': True,
                    'tasks': fallback,
                    'rate_limit_remaining': rate_remaining
                }), 200

        except Exception as e:
            # AI error, use fallback silently
            logger.error(f"Demo AI service error: {str(e)}")
            fallback = FALLBACK_TASKS.get(quest_id, FALLBACK_TASKS['build-robot'])
            return jsonify({
                'success': True,
                'tasks': fallback,
                'rate_limit_remaining': rate_remaining
            }), 200

    except Exception as e:
        logger.error(f"Demo generate-tasks error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to generate tasks'
        }), 500
