"""
Base AI Service
===============

Shared foundation for all AI-powered services.
Provides unified Gemini model access, retry logic, JSON parsing, and safety filtering.

Extends BaseService to inherit logging, validation, and error handling.

Usage:
    from services.base_ai_service import BaseAIService

    class MyAIService(BaseAIService):
        def generate_something(self, context: Dict) -> Dict:
            prompt = self.build_prompt(context)
            return self.generate_json(prompt)

Features:
    - Singleton Gemini model (single initialization across all services)
    - Unified retry logic with exponential backoff
    - Robust JSON extraction from AI responses
    - Optional safety filtering for generated content
    - Performance logging and metrics
"""

import os
import re
import json
import time
from typing import Dict, List, Optional, Any, Union
from services.base_service import BaseService

from utils.logger import get_logger

logger = get_logger(__name__)


class AIServiceError(Exception):
    """Base exception for AI service errors."""
    pass


class AIGenerationError(AIServiceError):
    """AI content generation failed."""
    pass


class AIParsingError(AIServiceError):
    """Failed to parse AI response."""
    pass


class BaseAIService(BaseService):
    """
    Base class for all AI-powered services.

    Provides:
    - Singleton Gemini model management
    - Unified generate() and generate_json() methods
    - Robust JSON extraction from various response formats
    - Retry logic with exponential backoff
    - Optional safety filtering

    All AI services should extend this class.
    """

    # Class-level singleton for Gemini model
    _model = None
    _model_name = None
    _api_key = None

    # Default configuration
    DEFAULT_MODEL = 'gemini-2.5-flash-lite'
    DEFAULT_MAX_RETRIES = 3
    DEFAULT_RETRY_DELAY = 1.0  # seconds
    MAX_RETRY_DELAY = 8.0  # seconds

    def __init__(self):
        """Initialize AI service with Gemini model."""
        super().__init__()
        self._ensure_model_initialized()
        self._safety_service = None  # Lazy-loaded

    @classmethod
    def _ensure_model_initialized(cls):
        """
        Initialize Gemini model as singleton.
        Only called once across all AI service instances.
        """
        if cls._model is not None:
            return

        # Get API key from environment
        api_key = os.getenv('GOOGLE_API_KEY') or os.getenv('GEMINI_API_KEY')
        if not api_key:
            raise AIServiceError(
                "GEMINI_API_KEY not configured. "
                "Set GOOGLE_API_KEY or GEMINI_API_KEY environment variable."
            )

        # Get model name from environment or use default
        model_name = os.getenv('GEMINI_MODEL', cls.DEFAULT_MODEL)

        try:
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            cls._model = genai.GenerativeModel(model_name)
            cls._model_name = model_name
            cls._api_key = api_key
            logger.info(f"Gemini model initialized: {model_name}")
        except Exception as e:
            raise AIServiceError(f"Failed to initialize Gemini model: {str(e)}")

    @property
    def model(self):
        """Get the Gemini model instance."""
        self._ensure_model_initialized()
        return self._model

    @property
    def model_name(self) -> str:
        """Get the current model name."""
        return self._model_name or self.DEFAULT_MODEL

    @property
    def safety_service(self):
        """Lazy-load SafetyService only when needed."""
        if self._safety_service is None:
            try:
                from services.safety_service import SafetyService
                self._safety_service = SafetyService()
            except ImportError:
                logger.warning("SafetyService not available")
                self._safety_service = None
        return self._safety_service

    def generate(
        self,
        prompt: str,
        max_retries: int = None,
        retry_delay: float = None,
        log_tokens: bool = True
    ) -> str:
        """
        Generate content using Gemini with retry logic.

        Args:
            prompt: The prompt to send to Gemini
            max_retries: Number of retry attempts (default: 3)
            retry_delay: Initial delay between retries in seconds (default: 1.0)
            log_tokens: Whether to log token usage (default: True)

        Returns:
            Generated text response

        Raises:
            AIGenerationError: If generation fails after all retries
        """
        max_retries = max_retries or self.DEFAULT_MAX_RETRIES
        retry_delay = retry_delay or self.DEFAULT_RETRY_DELAY

        start_time = time.time()
        last_error = None

        for attempt in range(max_retries):
            try:
                response = self.model.generate_content(prompt)

                if not response or not response.text:
                    raise AIGenerationError("Empty response from Gemini API")

                elapsed = time.time() - start_time

                if log_tokens:
                    self._log_generation(
                        attempt=attempt + 1,
                        elapsed_ms=int(elapsed * 1000),
                        prompt_length=len(prompt),
                        response_length=len(response.text)
                    )

                return response.text

            except Exception as e:
                last_error = e
                error_str = str(e).lower()

                # Don't retry on certain errors
                if any(x in error_str for x in ['api_key', 'authentication', 'quota', 'rate_limit']):
                    logger.error(f"Non-retryable error: {e}")
                    raise AIGenerationError(f"Gemini API error: {str(e)}")

                # Retry with exponential backoff
                if attempt < max_retries - 1:
                    delay = min(retry_delay * (2 ** attempt), self.MAX_RETRY_DELAY)
                    logger.warning(
                        f"AI generation attempt {attempt + 1}/{max_retries} failed: {e}. "
                        f"Retrying in {delay}s..."
                    )
                    time.sleep(delay)
                else:
                    logger.error(
                        f"AI generation failed after {max_retries} attempts: {e}"
                    )

        raise AIGenerationError(
            f"Generation failed after {max_retries} attempts: {str(last_error)}"
        )

    def generate_json(
        self,
        prompt: str,
        max_retries: int = None,
        strict: bool = False
    ) -> Union[Dict, List]:
        """
        Generate content and parse as JSON.

        Args:
            prompt: The prompt to send to Gemini
            max_retries: Number of retry attempts
            strict: If True, raise on parse failure; if False, return empty dict

        Returns:
            Parsed JSON as dict or list

        Raises:
            AIParsingError: If JSON parsing fails (when strict=True)
        """
        text = self.generate(prompt, max_retries=max_retries)
        result = self.extract_json(text)

        if result is None:
            if strict:
                raise AIParsingError(f"Failed to parse JSON from response: {text[:200]}...")
            logger.warning(f"Failed to parse JSON, returning empty dict. Response: {text[:100]}...")
            return {}

        return result

    def extract_json(self, text: str) -> Optional[Union[Dict, List]]:
        """
        Extract JSON from AI response text.
        Handles various formats: raw JSON, markdown code blocks, mixed text.

        Args:
            text: Raw text response from AI

        Returns:
            Parsed JSON as dict/list, or None if parsing fails
        """
        if not text:
            return None

        text = text.strip()

        # Clean common issues before parsing
        cleaned_text = self._clean_json_text(text)

        # Try 1: Direct parse (response is pure JSON)
        try:
            return json.loads(cleaned_text)
        except json.JSONDecodeError:
            pass

        # Try 2: Remove markdown code blocks
        # Pattern: ```json ... ``` or ``` ... ```
        code_block_patterns = [
            r'```json\s*([\s\S]*?)\s*```',
            r'```\s*([\s\S]*?)\s*```'
        ]

        for pattern in code_block_patterns:
            match = re.search(pattern, cleaned_text)
            if match:
                try:
                    extracted = self._clean_json_text(match.group(1).strip())
                    return json.loads(extracted)
                except json.JSONDecodeError as e:
                    logger.warning(f"Code block JSON parse failed: {e}")
                    continue

        # Try 3: Find JSON object { ... }
        json_obj_match = re.search(r'\{[\s\S]*\}', cleaned_text)
        if json_obj_match:
            try:
                return json.loads(json_obj_match.group())
            except json.JSONDecodeError:
                pass

        # Try 4: Find JSON array [ ... ]
        json_arr_match = re.search(r'\[[\s\S]*\]', cleaned_text)
        if json_arr_match:
            try:
                return json.loads(json_arr_match.group())
            except json.JSONDecodeError:
                pass

        # Try 5: Find first { and last } (greedy)
        first_brace = cleaned_text.find('{')
        last_brace = cleaned_text.rfind('}')
        if first_brace >= 0 and last_brace > first_brace:
            try:
                return json.loads(cleaned_text[first_brace:last_brace + 1])
            except json.JSONDecodeError:
                pass

        # Try 6: Find first [ and last ] (greedy)
        first_bracket = cleaned_text.find('[')
        last_bracket = cleaned_text.rfind(']')
        if first_bracket >= 0 and last_bracket > first_bracket:
            try:
                return json.loads(cleaned_text[first_bracket:last_bracket + 1])
            except json.JSONDecodeError:
                pass

        # Try 7: Repair truncated JSON (common with long responses)
        repaired = self._repair_truncated_json(cleaned_text)
        if repaired:
            try:
                return json.loads(repaired)
            except json.JSONDecodeError:
                pass

        logger.warning(f"Could not extract JSON from text: {cleaned_text[:200]}...")
        return None

    def _clean_json_text(self, text: str) -> str:
        """
        Clean common issues in JSON text from AI responses.
        """
        if not text:
            return text

        # Remove BOM and other invisible characters
        text = text.strip('\ufeff\u200b\u200c\u200d\u2060')

        # Remove control characters except newlines and tabs
        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)

        # Fix common escape issues
        # Replace literal backslash-n with actual newlines in strings (if not already)
        # This is tricky - only do it if it looks like a literal string "\\n"
        text = re.sub(r'(?<!\\)\\n(?![\s\S]*")', '\n', text)

        return text

    def _repair_truncated_json(self, text: str) -> Optional[str]:
        """
        Attempt to repair truncated JSON by closing unclosed brackets/braces.
        Common issue when AI response hits token limit.
        """
        # Find JSON start
        start_brace = text.find('{')
        start_bracket = text.find('[')

        if start_brace < 0 and start_bracket < 0:
            return None

        # Determine which comes first
        if start_brace >= 0 and (start_bracket < 0 or start_brace < start_bracket):
            start = start_brace
            json_text = text[start:]
        else:
            start = start_bracket
            json_text = text[start:]

        # Count unclosed braces/brackets
        open_braces = 0
        open_brackets = 0
        in_string = False
        escape_next = False

        for char in json_text:
            if escape_next:
                escape_next = False
                continue

            if char == '\\':
                escape_next = True
                continue

            if char == '"' and not escape_next:
                in_string = not in_string
                continue

            if in_string:
                continue

            if char == '{':
                open_braces += 1
            elif char == '}':
                open_braces -= 1
            elif char == '[':
                open_brackets += 1
            elif char == ']':
                open_brackets -= 1

        # If we have unclosed structures, try to close them
        if open_braces > 0 or open_brackets > 0:
            # Close any open string first
            if in_string:
                json_text += '"'

            # Add closing brackets and braces
            repair = ''
            for _ in range(open_brackets):
                repair += ']'
            for _ in range(open_braces):
                repair += '}'

            logger.info(f"Attempting JSON repair: adding {repair}")
            return json_text + repair

        return None

    def validate_content(
        self,
        content: Union[str, Dict],
        user_age: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Validate generated content for safety and philosophy alignment.

        Args:
            content: Text or dict to validate
            user_age: User's age for age-appropriate checks

        Returns:
            Dict with 'is_valid', 'score', 'issues' keys
        """
        from prompts.components import FORBIDDEN_WORDS, ENCOURAGED_WORDS

        if isinstance(content, dict):
            # Flatten dict values to text
            text = ' '.join(str(v) for v in content.values() if isinstance(v, str))
        else:
            text = str(content)

        text_lower = text.lower()
        issues = []
        score = 100

        # Check for forbidden words
        for word in FORBIDDEN_WORDS:
            if word in text_lower:
                issues.append(f"Contains forbidden word: '{word}'")
                score -= 10

        # Check for encouraged words (bonus points)
        encouraged_count = sum(1 for word in ENCOURAGED_WORDS if word in text_lower)
        if encouraged_count < 2:
            issues.append("Low use of encouraged process-focused language")
            score -= 5

        # Safety check if available
        if self.safety_service and isinstance(content, str):
            try:
                safety_result = self.safety_service.filter_ai_response(content, user_age)
                if hasattr(safety_result, 'level'):
                    from services.safety_service import SafetyLevel
                    if safety_result.level == SafetyLevel.BLOCKED:
                        issues.append("Content blocked by safety filter")
                        score = 0
                    elif safety_result.level == SafetyLevel.WARNING:
                        issues.append("Content flagged with safety warning")
                        score -= 20
            except Exception as e:
                logger.warning(f"Safety check failed: {e}")

        return {
            'is_valid': score >= 50,
            'score': max(0, min(100, score)),
            'issues': issues
        }

    def _log_generation(
        self,
        attempt: int,
        elapsed_ms: int,
        prompt_length: int,
        response_length: int
    ):
        """Log generation metrics for monitoring."""
        logger.info(
            f"[{self.__class__.__name__}] Generation complete: "
            f"attempt={attempt}, time={elapsed_ms}ms, "
            f"prompt={prompt_length} chars, response={response_length} chars"
        )


# =============================================================================
# Utility functions for backwards compatibility
# =============================================================================

def get_gemini_model():
    """
    Get singleton Gemini model instance.
    For use in modules that don't extend BaseAIService.

    Returns:
        GenerativeModel instance
    """
    BaseAIService._ensure_model_initialized()
    return BaseAIService._model


def extract_json_from_response(text: str) -> Optional[Union[Dict, List]]:
    """
    Extract JSON from AI response text.
    Standalone function for backwards compatibility.

    Args:
        text: Raw text response from AI

    Returns:
        Parsed JSON or None
    """
    service = BaseAIService()
    return service.extract_json(text)
