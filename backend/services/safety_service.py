"""
Safety service for AI tutor content moderation and child protection.
Ensures all AI interactions are safe, educational, and appropriate for children.
"""

import re
import json
import logging
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

class SafetyLevel(Enum):
    """Safety levels for content filtering"""
    SAFE = "safe"
    WARNING = "warning"
    BLOCKED = "blocked"
    REQUIRES_REVIEW = "requires_review"

@dataclass
class SafetyResult:
    """Result of safety check"""
    level: SafetyLevel
    confidence: float
    reasons: List[str]
    filtered_content: Optional[str] = None
    flagged_terms: List[str] = None

class SafetyService:
    """Service for content safety and moderation in AI tutor interactions"""

    def __init__(self):
        """Initialize safety service with filtering rules and patterns"""
        self.blocked_patterns = self._load_blocked_patterns()
        self.warning_patterns = self._load_warning_patterns()
        self.educational_topics = self._load_educational_topics()
        self.personal_info_patterns = self._load_personal_info_patterns()

    def check_message_safety(self, message: str, user_age: Optional[int] = None) -> SafetyResult:
        """
        Comprehensive safety check for user messages

        Args:
            message: User input message to check
            user_age: Optional age for age-appropriate filtering

        Returns:
            SafetyResult with safety level and details
        """
        message_lower = message.lower().strip()
        reasons = []
        flagged_terms = []
        confidence = 1.0

        # Check for blocked content
        blocked_result = self._check_blocked_content(message_lower)
        if blocked_result.level == SafetyLevel.BLOCKED:
            return SafetyResult(
                level=SafetyLevel.BLOCKED,
                confidence=blocked_result.confidence,
                reasons=blocked_result.reasons,
                flagged_terms=blocked_result.flagged_terms
            )

        # Check for personal information
        personal_info_result = self._check_personal_info(message)
        if personal_info_result.level != SafetyLevel.SAFE:
            reasons.extend(personal_info_result.reasons)
            flagged_terms.extend(personal_info_result.flagged_terms or [])
            if personal_info_result.level == SafetyLevel.BLOCKED:
                return SafetyResult(
                    level=SafetyLevel.BLOCKED,
                    confidence=personal_info_result.confidence,
                    reasons=reasons,
                    flagged_terms=flagged_terms
                )

        # Check if topic is educational
        educational_result = self._check_educational_topic(message_lower)
        if not educational_result:
            reasons.append("Topic is not educational or quest-related")
            confidence *= 0.7

        # Age-appropriate content check
        if user_age:
            age_result = self._check_age_appropriate(message_lower, user_age)
            if age_result.level != SafetyLevel.SAFE:
                reasons.extend(age_result.reasons)
                confidence *= age_result.confidence

        # Check for warning patterns
        warning_result = self._check_warning_patterns(message_lower)
        if warning_result.level == SafetyLevel.WARNING:
            reasons.extend(warning_result.reasons)
            flagged_terms.extend(warning_result.flagged_terms or [])
            confidence *= 0.8

        # Determine final safety level
        final_level = SafetyLevel.SAFE
        if confidence < 0.5:
            final_level = SafetyLevel.REQUIRES_REVIEW
        elif confidence < 0.7:
            final_level = SafetyLevel.WARNING
        elif reasons:
            final_level = SafetyLevel.WARNING

        return SafetyResult(
            level=final_level,
            confidence=confidence,
            reasons=reasons,
            flagged_terms=flagged_terms
        )

    def filter_ai_response(self, response: str, user_age: Optional[int] = None) -> SafetyResult:
        """
        Filter and validate AI responses before sending to user

        Args:
            response: AI-generated response to filter
            user_age: Optional age for age-appropriate filtering

        Returns:
            SafetyResult with filtered content
        """
        filtered_content = response
        reasons = []
        flagged_terms = []
        confidence = 1.0

        # Remove any URLs or links
        filtered_content, url_removed = self._remove_urls(filtered_content)
        if url_removed:
            reasons.append("Removed external links for safety")

        # Check for inappropriate content in AI response
        safety_check = self._check_blocked_content(filtered_content.lower())
        if safety_check.level == SafetyLevel.BLOCKED:
            return SafetyResult(
                level=SafetyLevel.BLOCKED,
                confidence=0.0,
                reasons=["AI response contained inappropriate content"],
                flagged_terms=safety_check.flagged_terms
            )

        # Ensure response is educational and encouraging
        if not self._is_educational_response(filtered_content):
            reasons.append("Response may not be sufficiently educational")
            confidence *= 0.8

        # Age-appropriate language check
        if user_age and user_age < 13:
            filtered_content = self._simplify_language(filtered_content)

        # Apply Optio's philosophy language patterns
        filtered_content = self._apply_philosophy_language(filtered_content)

        return SafetyResult(
            level=SafetyLevel.SAFE,
            confidence=confidence,
            reasons=reasons,
            filtered_content=filtered_content,
            flagged_terms=flagged_terms
        )

    def _load_blocked_patterns(self) -> List[str]:
        """Load patterns for content that should be blocked"""
        return [
            # Personal information patterns
            r'\b\d{3}-\d{2}-\d{4}\b',  # SSN
            r'\b\d{3}-\d{3}-\d{4}\b',  # Phone numbers
            r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',  # Email

            # Inappropriate content
            r'\b(violence|weapon|drug|alcohol|suicide)\b',
            r'\b(hate|racist|sexist|bullying)\b',
            r'\b(password|login|hack|cheat)\b',

            # Off-topic content
            r'\b(dating|romance|relationship|boyfriend|girlfriend)\b',
            r'\b(money|buy|sell|purchase|payment)\b',
            r'\b(politics|religion|controversial)\b',
        ]

    def _load_warning_patterns(self) -> List[str]:
        """Load patterns that trigger warnings but don't block"""
        return [
            r'\b(scary|frightening|worried|stressed|sad|angry)\b',
            r'\b(help me|i need|please|urgent)\b',
            r'\b(grade|test|exam|homework|assignment)\b',
        ]

    def _load_educational_topics(self) -> List[str]:
        """Load approved educational topics and keywords"""
        return [
            # STEM & Logic
            'math', 'science', 'technology', 'programming', 'coding', 'algorithm',
            'engineering', 'physics', 'chemistry', 'biology', 'computer',
            'calculate', 'equation', 'formula', 'experiment', 'hypothesis',

            # Language & Communication
            'writing', 'reading', 'grammar', 'vocabulary', 'essay', 'story',
            'poem', 'literature', 'language', 'communication', 'speech',

            # Arts & Creativity
            'art', 'music', 'drawing', 'painting', 'creative', 'design',
            'theater', 'drama', 'dance', 'photography', 'sculpture',

            # Society & Culture
            'history', 'geography', 'culture', 'society', 'community',
            'government', 'civilization', 'ancient', 'modern', 'tradition',

            # Life & Wellness
            'health', 'nutrition', 'exercise', 'wellness', 'mindfulness',
            'growth', 'development', 'skills', 'habits', 'goals',

            # Quest-related
            'quest', 'task', 'evidence', 'learning', 'discovery', 'explore',
            'understand', 'explain', 'help', 'how', 'what', 'why', 'where'
        ]

    def _load_personal_info_patterns(self) -> List[str]:
        """Load patterns that detect personal information sharing"""
        return [
            r'\b(my name is|i am|i live|my address|my phone|my email)\b',
            r'\b(school is|go to.*school|my teacher)\b',
            r'\b(mom|dad|parent|family.*live|home address)\b',
            r'\b\d{1,5}\s+[A-Za-z]+\s+(street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd)\b',
        ]

    def _check_blocked_content(self, message: str) -> SafetyResult:
        """Check message against blocked content patterns"""
        flagged_terms = []
        reasons = []

        for pattern in self.blocked_patterns:
            matches = re.findall(pattern, message, re.IGNORECASE)
            if matches:
                flagged_terms.extend(matches)
                reasons.append(f"Contains blocked content: {pattern}")

        if flagged_terms:
            return SafetyResult(
                level=SafetyLevel.BLOCKED,
                confidence=1.0,
                reasons=reasons,
                flagged_terms=flagged_terms
            )

        return SafetyResult(level=SafetyLevel.SAFE, confidence=1.0, reasons=[])

    def _check_personal_info(self, message: str) -> SafetyResult:
        """Check for personal information sharing attempts"""
        flagged_terms = []
        reasons = []

        for pattern in self.personal_info_patterns:
            matches = re.findall(pattern, message, re.IGNORECASE)
            if matches:
                flagged_terms.extend(matches)
                reasons.append("Attempted to share personal information")

        if flagged_terms:
            return SafetyResult(
                level=SafetyLevel.BLOCKED,
                confidence=1.0,
                reasons=reasons,
                flagged_terms=flagged_terms
            )

        return SafetyResult(level=SafetyLevel.SAFE, confidence=1.0, reasons=[])

    def _check_educational_topic(self, message: str) -> bool:
        """Check if message relates to educational topics"""
        message_words = set(re.findall(r'\w+', message.lower()))
        educational_words = set(self.educational_topics)

        # Check for overlap between message words and educational topics
        overlap = message_words.intersection(educational_words)

        # Require at least one educational keyword for messages longer than 10 words
        if len(message_words) > 10:
            return len(overlap) > 0

        # For shorter messages, be more lenient
        return len(overlap) > 0 or any(word in message for word in ['help', 'how', 'what', 'explain', 'understand'])

    def _check_warning_patterns(self, message: str) -> SafetyResult:
        """Check for patterns that trigger warnings"""
        flagged_terms = []
        reasons = []

        for pattern in self.warning_patterns:
            matches = re.findall(pattern, message, re.IGNORECASE)
            if matches:
                flagged_terms.extend(matches)
                if 'emotional' in pattern or any(word in pattern for word in ['sad', 'angry', 'worried']):
                    reasons.append("Message indicates emotional distress")
                elif 'help' in pattern or 'urgent' in pattern:
                    reasons.append("Message requests immediate help")
                elif 'grade' in pattern or 'test' in pattern:
                    reasons.append("Message relates to academic pressure")

        level = SafetyLevel.WARNING if flagged_terms else SafetyLevel.SAFE
        return SafetyResult(
            level=level,
            confidence=0.8 if flagged_terms else 1.0,
            reasons=reasons,
            flagged_terms=flagged_terms
        )

    def _check_age_appropriate(self, message: str, age: int) -> SafetyResult:
        """Check if content is appropriate for user's age"""
        reasons = []
        confidence = 1.0

        # More strict filtering for younger children
        if age < 10:
            complex_patterns = [
                r'\b(complex|complicated|advanced|difficult|challenging)\b',
                r'\b(college|university|graduate|phd|master)\b',
            ]
            for pattern in complex_patterns:
                if re.search(pattern, message):
                    reasons.append("Content may be too advanced for age group")
                    confidence *= 0.7

        level = SafetyLevel.WARNING if reasons else SafetyLevel.SAFE
        return SafetyResult(level=level, confidence=confidence, reasons=reasons)

    def _remove_urls(self, text: str) -> Tuple[str, bool]:
        """Remove URLs and links from text for safety"""
        url_pattern = r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+'
        original_text = text
        filtered_text = re.sub(url_pattern, '[LINK REMOVED FOR SAFETY]', text)
        return filtered_text, original_text != filtered_text

    def _is_educational_response(self, response: str) -> bool:
        """Check if AI response is educational and appropriate"""
        educational_indicators = [
            'learn', 'understand', 'discover', 'explore', 'think about',
            'consider', 'practice', 'try', 'experiment', 'observe',
            'question', 'wonder', 'curious', 'interesting', 'amazing'
        ]

        response_lower = response.lower()
        return any(indicator in response_lower for indicator in educational_indicators)

    def _simplify_language(self, text: str) -> str:
        """Simplify language for younger users"""
        # Replace complex words with simpler alternatives
        simplifications = {
            'demonstrate': 'show',
            'comprehend': 'understand',
            'utilize': 'use',
            'facilitate': 'help',
            'acquire': 'learn',
            'accomplish': 'do',
            'investigate': 'look into',
            'examine': 'look at',
        }

        for complex_word, simple_word in simplifications.items():
            text = re.sub(r'\b' + complex_word + r'\b', simple_word, text, flags=re.IGNORECASE)

        return text

    def _apply_philosophy_language(self, text: str) -> str:
        """Apply Optio's philosophy language patterns to responses"""
        # Replace outcome-focused language with process-focused language
        philosophy_replacements = {
            r'\b(you will be|you\'ll be) successful\b': 'you are learning and growing',
            r'\bget good grades\b': 'understand deeply',
            r'\bpass the test\b': 'show what you know',
            r'\bwin\b': 'grow',
            r'\bbeat\b': 'improve',
            r'\bcompete\b': 'explore together',
            r'\bprove yourself\b': 'discover what you can do',
        }

        for pattern, replacement in philosophy_replacements.items():
            text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)

        return text

    def log_safety_incident(self, user_id: str, message: str, safety_result: SafetyResult):
        """Log safety incidents for review and monitoring"""
        incident_data = {
            'user_id': user_id,
            'message': message,
            'safety_level': safety_result.level.value,
            'confidence': safety_result.confidence,
            'reasons': safety_result.reasons,
            'flagged_terms': safety_result.flagged_terms,
            'timestamp': json.dumps({'timestamp': 'now()'}, default=str)
        }

        # Log to application logs
        if safety_result.level in [SafetyLevel.BLOCKED, SafetyLevel.REQUIRES_REVIEW]:
            logger.warning(f"Safety incident: {incident_data}")
        else:
            logger.info(f"Safety check: {incident_data}")

        # TODO: Store in database for admin review
        # This would be implemented with the database schema

    def get_safe_response_template(self, safety_issue: str) -> str:
        """Get appropriate response template for safety issues"""
        templates = {
            'inappropriate_content': "I'm here to help with learning and educational topics. Let's focus on something related to your quests or schoolwork!",
            'personal_information': "Remember, it's important to keep personal information private. Let's talk about your learning instead!",
            'off_topic': "That's an interesting question, but I'm designed to help with educational topics and quests. What are you curious about learning?",
            'emotional_distress': "I notice you might be feeling upset. Learning can be challenging sometimes! Would you like help with a specific topic or quest?",
            'academic_pressure': "Learning should be enjoyable! Instead of worrying about grades, let's focus on understanding the concepts. What would you like to explore?"
        }

        return templates.get(safety_issue, "I'm here to help you learn and discover new things. What educational topic interests you?")