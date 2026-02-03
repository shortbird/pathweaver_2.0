"""
AI Tutor Service for educational assistance and concept explanation.
Provides safe, encouraging, and educational AI tutoring for students.

Refactored (Jan 2026): Now extends BaseAIService for unified Gemini access
and uses shared prompt components from prompts.components.
"""

import re
from typing import Dict, List, Optional, Any
from services.base_ai_service import BaseAIService
from database import get_supabase_admin_client
from dataclasses import dataclass
from enum import Enum

from utils.logger import get_logger

logger = get_logger(__name__)

from services.safety_service import SafetyService, SafetyLevel
from utils.pillar_utils import get_pillar_name

# Import shared prompt components
from prompts.components import (
    OPTIO_AI_PERSONA,
    CORE_PHILOSOPHY,
    TONE_LEVELS,
    PILLAR_DEFINITIONS_DETAILED,
    PILLAR_DISPLAY_NAMES,
    CONVERSATION_MODE_INSTRUCTIONS,
    LEARNING_STYLE_INSTRUCTIONS,
    ACTION_TYPE_INSTRUCTIONS,
    build_quest_context,
    build_lesson_context,
)

class ConversationMode(Enum):
    """Different modes for AI tutor conversations"""
    STUDY_BUDDY = "study_buddy"
    TEACHER = "teacher"
    DISCOVERY = "discovery"
    REVIEW = "review"
    CREATIVE = "creative"

@dataclass
class TutorContext:
    """Context information for tutor conversations"""
    user_id: str
    user_age: Optional[int] = None
    current_quest: Optional[Dict] = None
    current_task: Optional[Dict] = None
    current_lesson: Optional[Dict] = None  # Lesson context for lesson-integrated chatbot
    lesson_action_type: Optional[str] = None  # example, analogy, draw, debate
    learning_style: Optional[str] = None
    conversation_mode: ConversationMode = ConversationMode.TEACHER
    previous_messages: List[Dict] = None
    vision_statement: Optional[str] = None  # User's learning vision from profile

@dataclass
class TutorResponse:
    """Response from AI tutor"""
    message: str
    suggestions: List[str] = None
    resources: List[Dict] = None
    next_questions: List[str] = None
    xp_bonus_eligible: bool = False
    requires_parent_notification: bool = False

class AITutorService(BaseAIService):
    """AI-powered educational tutor service"""

    def __init__(self):
        """Initialize AI tutor service.

        Gemini model initialization is handled by BaseAIService (singleton).
        """
        super().__init__()
        self.supabase = get_supabase_admin_client()
        # Safety service is lazy-loaded from BaseAIService

        # Load educational knowledge base
        self.pillar_knowledge = self._load_pillar_knowledge()
        self.conversation_templates = self._load_conversation_templates()

    def process_message(self, message: str, context: TutorContext) -> Dict[str, Any]:
        """
        Process a user message and generate appropriate tutor response

        Args:
            message: User's message/question
            context: Context information about the user and conversation

        Returns:
            Dict containing response and metadata
        """
        try:
            # Safety check on user message
            safety_result = self.safety_service.check_message_safety(
                message,
                context.user_age
            )

            if safety_result.level == SafetyLevel.BLOCKED:
                return {
                    'success': False,
                    'error': 'message_blocked',
                    'response': self.safety_service.get_safe_response_template('inappropriate_content'),
                    'safety_reasons': safety_result.reasons
                }

            # Generate AI response based on context and message
            ai_response = self._generate_tutor_response(message, context)

            # Safety check on AI response
            response_safety = self.safety_service.filter_ai_response(
                ai_response.message,
                context.user_age
            )

            if response_safety.level == SafetyLevel.BLOCKED:
                # Fallback to safe template if AI generated inappropriate content
                safe_response = self.safety_service.get_safe_response_template('off_topic')
                ai_response.message = safe_response
            else:
                ai_response.message = response_safety.filtered_content

            # Log safety incidents if needed
            if safety_result.level in [SafetyLevel.WARNING, SafetyLevel.REQUIRES_REVIEW]:
                self.safety_service.log_safety_incident(
                    context.user_id,
                    message,
                    safety_result
                )

            return {
                'success': True,
                'response': ai_response.message,
                'suggestions': ai_response.suggestions,
                'resources': ai_response.resources,
                'next_questions': ai_response.next_questions,
                'xp_bonus_eligible': ai_response.xp_bonus_eligible,
                'requires_parent_notification': ai_response.requires_parent_notification,
                'conversation_mode': context.conversation_mode.value,
                'safety_level': safety_result.level.value
            }

        except Exception as e:
            return {
                'success': False,
                'error': 'processing_failed',
                'response': "I'm having trouble right now, but I'm still here to help you learn! Try asking your question differently.",
                'details': str(e)
            }

    def _generate_tutor_response(self, message: str, context: TutorContext) -> TutorResponse:
        """Generate AI tutor response based on message and context"""

        # Build context-aware prompt
        prompt = self._build_tutor_prompt(message, context)

        # Generate response using Gemini
        response = self.model.generate_content(prompt)

        if not response or not response.text:
            return TutorResponse(
                message="I'm here to help you learn! Could you ask that question in a different way?",
                suggestions=["Try being more specific about what you'd like to understand"]
            )

        # Parse and enhance the response
        parsed_response = self._parse_and_enhance_response(response.text, context)

        return parsed_response

    def _build_tutor_prompt(self, message: str, context: TutorContext) -> str:
        """Build optimized prompt for concise, well-formatted responses.

        Uses shared components from prompts.components for consistency.
        For lesson helper actions (pre-set buttons), uses a direct, non-conversational style.
        """

        # Check if this is a lesson helper action (pre-set button, not free-form chat)
        is_lesson_helper = context.lesson_action_type and context.current_lesson

        if is_lesson_helper:
            # Use direct, prepared-content style for lesson helper
            base_prompt = f"""You are an educational content assistant helping a student understand lesson material.

{TONE_LEVELS['content_generation']}

{CORE_PHILOSOPHY}

SAFETY RULES:
- Only educational topics
- Age-appropriate language for teenagers
- No external links or personal information requests

{PILLAR_DEFINITIONS_DETAILED}

"""
        else:
            # Use conversational style for regular chat
            # Dynamic greeting to avoid repetition
            greeting_style = self._get_dynamic_greeting_style(context)

            # Get conversation mode instructions from shared components
            mode_key = context.conversation_mode.value
            mode_instructions = CONVERSATION_MODE_INSTRUCTIONS.get(mode_key, '')

            # Base system prompt with natural conversation requirements
            base_prompt = f"""{OPTIO_AI_PERSONA}

{TONE_LEVELS['student_facing']}

CONVERSATION STYLE:
- Talk like a knowledgeable friend who's genuinely curious about learning
- Be natural and conversational, not formal or robotic
- Keep responses 50-150 words maximum
- AVOID rigid templates - let the conversation flow naturally
- Use bullet points only when they genuinely help organize information

GREETING STYLE: {greeting_style}

RESPONSE APPROACH:
- React naturally to what they shared
- Use **bold** sparingly for truly key concepts only
- Use formatting when it genuinely helps understanding, not just for structure
- Ask follow-up questions that feel like genuine curiosity
- Share insights like you're thinking out loud together
- Make them feel heard and understood

{CORE_PHILOSOPHY}

CONVERSATION MODE: {context.conversation_mode.value.replace('_', ' ').title()}

SAFETY RULES:
- Only educational topics (5 learning pillars below)
- Age-appropriate language for teenagers
- No external links or personal information requests
- Redirect off-topic questions back to learning

{PILLAR_DEFINITIONS_DETAILED}

"""

        # Add user context
        if context.user_age:
            base_prompt += f"USER AGE: {context.user_age} years old\n"

        # Add vision statement as light background context
        if context.vision_statement:
            base_prompt += f"\nBACKGROUND (optional reference): The student mentioned: \"{context.vision_statement[:500]}\"\n"

        # Add quest context - handle both rich context (from quest_id) and simple context (legacy)
        if context.current_quest:
            # Check if this is rich quest context (from build_quest_context)
            if 'quest' in context.current_quest and 'tasks' in context.current_quest:
                quest_data = context.current_quest
                quest = quest_data['quest']
                tasks = quest_data['tasks']
                completed = quest_data['completed_count']
                total = quest_data['total_count']

                base_prompt += f"\n--- QUEST CONTEXT ---\n"
                base_prompt += f"QUEST: {quest.get('title', 'Unknown')}\n"
                if quest.get('description'):
                    base_prompt += f"DESCRIPTION: {quest['description'][:200]}...\n" if len(quest.get('description', '')) > 200 else f"DESCRIPTION: {quest['description']}\n"
                if quest.get('big_idea'):
                    base_prompt += f"BIG IDEA: {quest['big_idea']}\n"
                if quest.get('pillar_primary'):
                    base_prompt += f"PRIMARY PILLAR: {quest['pillar_primary']}\n"

                base_prompt += f"\nPROGRESS: {completed}/{total} tasks completed\n"

                # List remaining tasks
                remaining_tasks = [t for t in tasks if not t.get('is_completed')]
                if remaining_tasks:
                    base_prompt += "REMAINING TASKS:\n"
                    for task in remaining_tasks[:5]:  # Limit to 5
                        base_prompt += f"  - {task['title']} ({task.get('pillar', 'General')}, {task.get('xp_value', 0)} XP)\n"

                # Include recent evidence for context
                evidence = quest_data.get('recent_evidence', [])
                if evidence:
                    base_prompt += "\nRECENT WORK (student's own words):\n"
                    for ev in evidence[:2]:  # Limit to 2
                        base_prompt += f"  - Task '{ev['task_title']}': \"{ev['evidence_text'][:150]}...\"\n" if len(ev.get('evidence_text', '')) > 150 else f"  - Task '{ev['task_title']}': \"{ev['evidence_text']}\"\n"

                base_prompt += "--- END QUEST CONTEXT ---\n\n"
                base_prompt += "QUEST-SPECIFIC INSTRUCTIONS:\n"
                base_prompt += "- Reference the quest goals and remaining tasks when relevant\n"
                base_prompt += "- Celebrate completed work and evidence the student has shared\n"
                base_prompt += "- Help them understand how current questions connect to their quest\n"
                base_prompt += "- Suggest next steps when appropriate\n\n"

            # Legacy simple quest context (backwards compatibility)
            elif context.current_quest.get('title'):
                quest_title = context.current_quest.get('title')
                base_prompt += f"CURRENT QUEST: {quest_title}\n"

        if context.current_task and context.current_task.get('title'):
            task_title = context.current_task.get('title')
            task_pillar = context.current_task.get('pillar', 'General')
            base_prompt += f"CURRENT TASK: {task_title} (Pillar: {task_pillar})\n"

        # Add lesson context if available (lesson-integrated chatbot)
        if context.current_lesson:
            lesson_data = context.current_lesson
            lesson = lesson_data.get('lesson', {})
            current_block = lesson_data.get('current_block')
            progress = lesson_data.get('progress', {})
            linked_tasks = lesson_data.get('linked_tasks', [])
            learning_style = lesson_data.get('learning_style', 'mixed')

            base_prompt += f"\n--- LESSON CONTEXT ---\n"
            base_prompt += f"LESSON: {lesson.get('title', 'Unknown')}\n"
            base_prompt += f"QUEST: {lesson.get('quest_title', 'Unknown')}\n"
            if lesson.get('description'):
                base_prompt += f"LESSON DESCRIPTION: {lesson['description'][:200]}\n"

            # Include the specific content block the student is viewing
            if current_block:
                base_prompt += f"\nSTUDENT IS VIEWING (Block {current_block['index'] + 1}):\n"
                base_prompt += f'"""\n{current_block["content"]}\n"""\n'

            # Include progress info
            base_prompt += f"\nPROGRESS: {progress.get('progress_percentage', 0)}% complete, "
            base_prompt += f"{progress.get('time_spent_seconds', 0) // 60} minutes spent\n"

            # Include linked tasks
            if linked_tasks:
                base_prompt += "\nRELATED TASKS:\n"
                for task in linked_tasks[:3]:
                    base_prompt += f"  - {task.get('title')} ({task.get('pillar')})\n"

            base_prompt += f"\nSTUDENT'S LEARNING STYLE: {learning_style}\n"
            base_prompt += "--- END LESSON CONTEXT ---\n\n"

            # Add action-specific instructions based on what button the student clicked
            action_type = context.lesson_action_type
            if action_type and action_type in ACTION_TYPE_INSTRUCTIONS:
                base_prompt += f"\n{ACTION_TYPE_INSTRUCTIONS[action_type]}\n\n"

            # Learning style adaptations from shared components
            if learning_style in LEARNING_STYLE_INSTRUCTIONS:
                base_prompt += f"\nLEARNING STYLE ADAPTATION: {LEARNING_STYLE_INSTRUCTIONS[learning_style]}\n\n"

        # Add conversation history context (filter out quest-specific references)
        if context.previous_messages:
            recent_context = context.previous_messages[-3:]  # Last 3 messages for context
            base_prompt += "\nRECENT CONVERSATION:\n"
            for msg in recent_context:
                role = "Student" if msg.get('role') == 'user' else "You"
                content = msg.get('content', '')

                # Filter out specific quest references to make OptioBot truly global
                quest_references = [
                    "Journey Through Middle-earth",
                    "your quest",
                    "this quest",
                    "current quest",
                    "quest you're on",
                    "in your journey through",
                    "in this adventure"
                ]

                # Remove quest-specific references but preserve the general conversation flow
                filtered_content = content
                for ref in quest_references:
                    # Use case-insensitive replacement
                    filtered_content = re.sub(re.escape(ref), "your learning", filtered_content, flags=re.IGNORECASE)

                base_prompt += f"{role}: {filtered_content}\n"

        # Final instructions differ based on whether this is lesson helper or chat
        if is_lesson_helper:
            # For lesson helper: direct content delivery, no conversation
            base_prompt += f"""
STUDENT REQUEST: "{message}"

Deliver the requested content directly. No greetings, no follow-up questions, no conversational phrases.
Just provide focused, helpful educational content about the lesson material shown above.
"""
        else:
            # For regular chat: conversational style
            greeting_style = self._get_dynamic_greeting_style(context)

            # Mode-specific instructions
            mode_instructions = self._get_mode_instructions(context.conversation_mode)
            base_prompt += f"\n{mode_instructions}\n"

            base_prompt += f"""
CURRENT STUDENT MESSAGE: "{message}"

CRITICAL REMINDERS:
- Respond naturally to what they shared
- Use the specified greeting style: {greeting_style}
- Keep response 50-150 words maximum
- Format only when it genuinely helps understanding
- Ask follow-up questions that flow from the conversation
- Focus on sparking curiosity and building on their thinking

Remember: Be genuine, curious, and encouraging!
"""

        return base_prompt

    def _get_dynamic_greeting_style(self, context: TutorContext) -> str:
        """Generate dynamic greeting instructions to avoid repetition"""

        # Count previous messages to vary greeting style
        msg_count = len(context.previous_messages) if context.previous_messages else 0

        greeting_styles = [
            "Start with curiosity about their question (avoid 'Hey there!')",
            "Acknowledge what they're exploring with enthusiasm",
            "Begin with encouraging recognition of their thinking",
            "Open by connecting to their learning journey",
            "Start by validating their curiosity or confusion",
            "Begin with a thought-provoking observation about their question",
            "Open with excitement about the topic they've raised",
            "Start by building on something they said previously"
        ]

        # Use message count to cycle through different greeting approaches
        selected_style = greeting_styles[msg_count % len(greeting_styles)]

        return selected_style

    def _get_mode_instructions(self, mode: ConversationMode) -> str:
        """Get concise, formatting-focused instructions for conversation mode.

        Uses shared CONVERSATION_MODE_INSTRUCTIONS from prompts.components.
        """
        mode_key = mode.value  # e.g., 'study_buddy', 'teacher'
        return CONVERSATION_MODE_INSTRUCTIONS.get(mode_key, CONVERSATION_MODE_INSTRUCTIONS['study_buddy'])

    def _parse_and_enhance_response(self, ai_response: str, context: TutorContext) -> TutorResponse:
        """Parse AI response and add enhancements"""

        # Clean up the response
        message = ai_response.strip()

        # Check if this is a lesson helper action (pre-set button)
        is_lesson_helper = context.lesson_action_type and context.current_lesson

        if is_lesson_helper:
            # For lesson helper: return clean response without chat enhancements
            return TutorResponse(
                message=message,
                suggestions=[],
                next_questions=[],
                xp_bonus_eligible=False,
                requires_parent_notification=False
            )

        # For regular chat: add full enhancements
        # Generate helpful suggestions based on context
        suggestions = self._generate_suggestions(context)

        # Generate follow-up questions
        next_questions = self._generate_next_questions(message, context)

        # Check if response qualifies for XP bonus (deep engagement)
        xp_bonus_eligible = self._check_xp_bonus_eligibility(message)

        # Check if parent should be notified
        parent_notification = self._check_parent_notification_needed(message, context)

        return TutorResponse(
            message=message,
            suggestions=suggestions,
            next_questions=next_questions,
            xp_bonus_eligible=xp_bonus_eligible,
            requires_parent_notification=parent_notification
        )

    def _generate_suggestions(self, context: TutorContext) -> List[str]:
        """Generate helpful suggestions based on context"""
        suggestions = []

        # Only add quest-specific suggestions if there's actually a quest
        if context.current_quest and context.current_quest.get('title'):
            suggestions.append(f"Ask about concepts in your current quest: {context.current_quest.get('title')}")

        if context.current_task and context.current_task.get('pillar'):
            pillar = context.current_task.get('pillar')
            suggestions.append(f"Explore more {pillar} topics")

        # General learning suggestions (always available)
        general_suggestions = [
            "Ask 'What if...' questions about any topic",
            "Share what you're curious about today",
            "Describe something you created or discovered",
            "Ask for help understanding a concept",
            "Request examples or analogies",
            "Explore math, science, or creative topics",
            "Get help with writing or communication skills",
            "Learn about history, culture, or wellness"
        ]

        # Fill remaining slots with random general suggestions
        import random
        needed = 3 - len(suggestions)  # Always show 3 suggestions total
        available = [s for s in general_suggestions if s not in suggestions]
        suggestions.extend(random.sample(available, min(needed, len(available))))

        return suggestions[:3]  # Limit to 3 suggestions

    def _generate_next_questions(self, response: str, context: TutorContext) -> List[str]:
        """Generate follow-up questions to continue learning"""
        questions = []

        # Extract topic from response for follow-up
        if "math" in response.lower() or "calculate" in response.lower():
            questions.extend([
                "What patterns do you notice?",
                "How could you solve this differently?",
                "Where might you use this in real life?"
            ])
        elif "science" in response.lower() or "experiment" in response.lower():
            questions.extend([
                "What do you predict will happen?",
                "What questions does this raise for you?",
                "How could you test this idea?"
            ])
        elif "writing" in response.lower() or "story" in response.lower():
            questions.extend([
                "What story are you telling?",
                "How does this make you feel?",
                "What would you change or add?"
            ])

        # General curiosity questions
        general_questions = [
            "What interests you most about this?",
            "What would you like to explore next?",
            "How does this connect to something else you know?"
        ]

        questions.extend(general_questions)
        return questions[:3]  # Limit to 3 questions

    def _check_xp_bonus_eligibility(self, response: str) -> bool:
        """Check if the interaction qualifies for XP bonus"""
        # Deep engagement indicators
        deep_indicators = [
            'connection', 'relationship', 'pattern', 'because', 'therefore',
            'discover', 'explore', 'experiment', 'question', 'wonder',
            'analyze', 'compare', 'contrast', 'synthesis'
        ]

        response_lower = response.lower()
        indicator_count = sum(1 for indicator in deep_indicators if indicator in response_lower)

        # Award XP bonus for responses that encourage deep thinking
        return indicator_count >= 2 and len(response) > 150

    def _check_parent_notification_needed(self, response: str, context: TutorContext) -> bool:
        """Check if parents should be notified of this interaction"""
        # Notify parents for certain scenarios
        if context.user_age and context.user_age < 10:
            return True  # Always notify for very young children

        notification_triggers = [
            'difficult', 'struggling', 'frustrated', 'help me',
            'don\'t understand', 'confused', 'give up'
        ]

        response_lower = response.lower()
        return any(trigger in response_lower for trigger in notification_triggers)

    def _load_pillar_knowledge(self) -> Dict[str, Any]:
        """Load knowledge base organized by learning pillars.

        Uses PILLAR_DISPLAY_NAMES from shared components for consistency.
        """
        # Map using display names from shared components
        return {
            PILLAR_DISPLAY_NAMES.get('stem', 'STEM & Logic'): {
                'keywords': ['math', 'science', 'technology', 'programming', 'logic', 'engineering'],
                'concepts': ['problem solving', 'critical thinking', 'hypothesis', 'experiment'],
                'encouragement': 'Your logical thinking is developing beautifully!'
            },
            PILLAR_DISPLAY_NAMES.get('wellness', 'Life & Wellness'): {
                'keywords': ['health', 'wellness', 'mindfulness', 'growth', 'habits'],
                'concepts': ['self-care', 'emotional intelligence', 'goal setting', 'reflection'],
                'encouragement': 'You\'re growing into an amazing person!'
            },
            PILLAR_DISPLAY_NAMES.get('communication', 'Language & Communication'): {
                'keywords': ['writing', 'reading', 'speaking', 'literature', 'grammar'],
                'concepts': ['expression', 'storytelling', 'communication', 'creativity'],
                'encouragement': 'Your voice and ideas are unique and valuable!'
            },
            PILLAR_DISPLAY_NAMES.get('civics', 'Society & Culture'): {
                'keywords': ['history', 'culture', 'geography', 'community', 'tradition'],
                'concepts': ['diversity', 'perspective', 'change', 'connection'],
                'encouragement': 'You\'re discovering the rich tapestry of human experience!'
            },
            PILLAR_DISPLAY_NAMES.get('art', 'Arts & Creativity'): {
                'keywords': ['art', 'music', 'creative', 'design', 'imagination'],
                'concepts': ['expression', 'originality', 'aesthetics', 'innovation'],
                'encouragement': 'Your creativity is bringing something new into the world!'
            }
        }

    def _load_conversation_templates(self) -> Dict[str, str]:
        """Load conversation templates for different scenarios"""
        return {
            'greeting': "Hi there! I'm OptioBot, your learning companion. What are you curious about today?",
            'encouragement': "That's wonderful thinking! You're really exploring this topic deeply.",
            'redirect': "That's an interesting question! Let's explore how it connects to your learning journey.",
            'stuck': "Sometimes the best learning happens when we feel stuck. What have you tried so far?",
            'celebration': "Amazing work! I can see how much you're growing as a learner.",
            'goodbye': "Keep being curious and asking great questions! I'm here whenever you want to explore something new."
        }

    def get_conversation_starters(self, context: TutorContext) -> List[str]:
        """Generate conversation starters based on user context"""
        starters = []

        if context.current_quest:
            quest_title = context.current_quest.get('title', '')
            starters.append(f"What's the most interesting part of '{quest_title}' so far?")
            starters.append(f"What questions do you have about your '{quest_title}' quest?")

        if context.current_task:
            task_pillar = context.current_task.get('pillar', '')
            pillar_display = get_pillar_name(task_pillar)
            starters.append(f"Need help with your {pillar_display} task?")

        # General starters
        general_starters = [
            "What did you discover in your learning today?",
            "What's something you're curious about?",
            "Tell me about a project you're working on!",
            "What's the coolest thing you learned recently?",
            "What would you like to understand better?"
        ]

        starters.extend(general_starters[:3])
        return starters

    def update_conversation_mode(self, mode: str, context: TutorContext) -> TutorContext:
        """Update the conversation mode based on user preference"""
        try:
            new_mode = ConversationMode(mode)
            context.conversation_mode = new_mode
            return context
        except ValueError:
            # Invalid mode, keep current mode
            return context