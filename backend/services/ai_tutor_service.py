"""
AI Tutor Service for educational assistance and concept explanation.
Provides safe, encouraging, and educational AI tutoring for students.
"""

import json
import re
import os
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
from enum import Enum
import google.generativeai as genai

from services.safety_service import SafetyService, SafetyLevel
from utils.pillar_utils import get_pillar_name

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
    learning_style: Optional[str] = None
    conversation_mode: ConversationMode = ConversationMode.STUDY_BUDDY
    previous_messages: List[Dict] = None

@dataclass
class TutorResponse:
    """Response from AI tutor"""
    message: str
    suggestions: List[str] = None
    resources: List[Dict] = None
    next_questions: List[str] = None
    xp_bonus_eligible: bool = False
    requires_parent_notification: bool = False

class AITutorService:
    """AI-powered educational tutor service"""

    def __init__(self):
        """Initialize AI tutor service"""
        self.api_key = os.getenv('GOOGLE_API_KEY') or os.getenv('GEMINI_API_KEY')
        self.model_name = os.getenv('GEMINI_MODEL', 'gemini-1.5-flash')

        if not self.api_key:
            raise ValueError("GOOGLE_API_KEY not configured. Set GEMINI_API_KEY environment variable.")

        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel(self.model_name)
        self.safety_service = SafetyService()

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
        """Build comprehensive prompt for AI tutor"""

        # Base system prompt with safety and educational focus
        base_prompt = f"""You are OptioBot, a friendly AI tutor for teenagers on the Optio learning platform.

CORE PRINCIPLES:
- "The Process Is The Goal" - Focus on learning journey, not outcomes
- Use encouraging, growth-mindset language
- Be curious and ask good questions rather than giving direct answers
- Celebrate mistakes as learning opportunities
- Keep conversations educational and safe for teenagers
- Never provide external links or ask for personal information

CONVERSATION MODE: {context.conversation_mode.value.replace('_', ' ').title()}

SAFETY RULES:
- Only discuss educational topics related to the five learning pillars
- Never ask for or discuss personal information
- Keep language age-appropriate and encouraging
- If asked about non-educational topics, redirect to learning
- Focus on "how do you think" rather than "the answer is"

LEARNING PILLARS:
1. STEM & Logic (math, science, technology, programming, logic)
2. Life & Wellness (health, mindfulness, personal growth, life skills)
3. Language & Communication (writing, reading, speaking, literature)
4. Society & Culture (history, geography, cultures, communities)
5. Arts & Creativity (visual arts, music, creative writing, design)

"""

        # Add user context
        if context.user_age:
            base_prompt += f"USER AGE: {context.user_age} years old\n"

        # Only include quest/task context if actually provided
        if context.current_quest and context.current_quest.get('title'):
            quest_title = context.current_quest.get('title')
            base_prompt += f"CURRENT QUEST: {quest_title}\n"

        if context.current_task and context.current_task.get('title'):
            task_title = context.current_task.get('title')
            task_pillar = context.current_task.get('pillar', 'General')
            base_prompt += f"CURRENT TASK: {task_title} (Pillar: {task_pillar})\n"

        # Add conversation history context
        if context.previous_messages:
            recent_context = context.previous_messages[-3:]  # Last 3 messages for context
            base_prompt += "\nRECENT CONVERSATION:\n"
            for msg in recent_context:
                role = "Student" if msg.get('role') == 'user' else "You"
                base_prompt += f"{role}: {msg.get('content', '')}\n"

        # Mode-specific instructions
        mode_instructions = self._get_mode_instructions(context.conversation_mode)
        base_prompt += f"\n{mode_instructions}\n"

        # Add current message
        base_prompt += f"\nCURRENT STUDENT MESSAGE: {message}\n\n"

        # Response format instructions
        base_prompt += """
RESPONSE FORMAT:
Respond naturally and conversationally. Be encouraging but calm and thoughtful. Ask follow-up questions to deepen understanding. If the student seems stuck, provide gentle hints rather than direct answers.

LANGUAGE GUIDELINES:
- Be supportive without being overly enthusiastic
- Ask "What do you think about..." instead of "The answer is..."
- Say "That's good thinking" instead of "That's wrong"
- Focus on understanding and curiosity, not performance
- Keep responses measured and thoughtful

Remember: You're helping them develop genuine curiosity and understanding.
"""

        return base_prompt

    def _get_mode_instructions(self, mode: ConversationMode) -> str:
        """Get specific instructions for conversation mode"""
        instructions = {
            ConversationMode.STUDY_BUDDY: """
STUDY BUDDY MODE:
- Be casual, friendly, and encouraging
- Use "we" language ("let's explore this together")
- Share in their excitement and curiosity
- Offer to work through problems step by step
- Celebrate small wins and progress
""",
            ConversationMode.TEACHER: """
TEACHER MODE:
- More structured approach to explanations
- Break down complex concepts into simple steps
- Use analogies and examples relevant to their age
- Check for understanding frequently
- Provide clear frameworks and methods
""",
            ConversationMode.DISCOVERY: """
DISCOVERY MODE:
- Ask lots of open-ended questions
- Encourage experimentation and exploration
- Help them form their own hypotheses
- Guide them to discover answers themselves
- Focus on "what if" and "what do you think" questions
""",
            ConversationMode.REVIEW: """
REVIEW MODE:
- Help consolidate and connect previous learning
- Ask them to explain concepts in their own words
- Create connections between different ideas
- Focus on what they remember and understand
- Strengthen confidence in their knowledge
""",
            ConversationMode.CREATIVE: """
CREATIVE MODE:
- Encourage brainstorming and imagination
- Support creative problem-solving approaches
- Celebrate unique and original ideas
- Help them think outside the box
- Foster artistic and creative expression
"""
        }
        return instructions.get(mode, instructions[ConversationMode.STUDY_BUDDY])

    def _parse_and_enhance_response(self, ai_response: str, context: TutorContext) -> TutorResponse:
        """Parse AI response and add enhancements"""

        # Clean up the response
        message = ai_response.strip()

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
        """Load knowledge base organized by learning pillars"""
        return {
            'STEM & Logic': {
                'keywords': ['math', 'science', 'technology', 'programming', 'logic', 'engineering'],
                'concepts': ['problem solving', 'critical thinking', 'hypothesis', 'experiment'],
                'encouragement': 'Your logical thinking is developing beautifully!'
            },
            'Life & Wellness': {
                'keywords': ['health', 'wellness', 'mindfulness', 'growth', 'habits'],
                'concepts': ['self-care', 'emotional intelligence', 'goal setting', 'reflection'],
                'encouragement': 'You\'re growing into an amazing person!'
            },
            'Language & Communication': {
                'keywords': ['writing', 'reading', 'speaking', 'literature', 'grammar'],
                'concepts': ['expression', 'storytelling', 'communication', 'creativity'],
                'encouragement': 'Your voice and ideas are unique and valuable!'
            },
            'Society & Culture': {
                'keywords': ['history', 'culture', 'geography', 'community', 'tradition'],
                'concepts': ['diversity', 'perspective', 'change', 'connection'],
                'encouragement': 'You\'re discovering the rich tapestry of human experience!'
            },
            'Arts & Creativity': {
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