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
    - Generation config for temperature/sampling control
    - Token usage tracking for cost monitoring
    - Optional response caching
"""

import os
import re
import json
import time
import hashlib
from typing import Dict, List, Optional, Any, Union
from services.base_service import BaseService

from utils.logger import get_logger

logger = get_logger(__name__)


# =============================================================================
# Standardized Generation Configs
# =============================================================================

GENERATION_CONFIGS = {
    'default': {
        'temperature': 0.7,
        'top_p': 0.9,
        'max_output_tokens': 2048,
    },
    'quality_scoring': {
        'temperature': 0.3,
        'top_p': 0.8,
        'top_k': 40,
        'max_output_tokens': 1500,
    },
    'creative_generation': {
        'temperature': 0.8,
        'top_p': 0.95,
        'max_output_tokens': 4096,
    },
    'structured_output': {
        'temperature': 0.5,
        'top_p': 0.85,
        'max_output_tokens': 2048,
    },
    'deterministic': {
        'temperature': 0.1,
        'top_p': 0.7,
        'max_output_tokens': 1024,
    },
}


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

    # Class-level singleton for Gemini model (default)
    _model = None
    _model_name = None
    _api_key = None

    # Class-level cache for alternative models
    _alt_models = {}

    # Default configuration
    DEFAULT_MODEL = 'gemini-2.5-flash-lite'
    DEFAULT_MAX_RETRIES = 3
    DEFAULT_RETRY_DELAY = 1.0  # seconds
    MAX_RETRY_DELAY = 8.0  # seconds

    def __init__(self, model_override: str = None):
        """
        Initialize AI service with Gemini model.

        Args:
            model_override: Optional model name to use instead of default.
                           Use for services that need more capable models.
        """
        super().__init__()
        self._ensure_model_initialized()
        self._safety_service = None  # Lazy-loaded
        self._model_override = model_override

        # Initialize alternative model if specified
        if model_override and model_override != self._model_name:
            self._ensure_alt_model_initialized(model_override)

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

    @classmethod
    def _ensure_alt_model_initialized(cls, model_name: str):
        """
        Initialize an alternative model (cached at class level).
        Used when a service needs a different model than the default.
        """
        if model_name in cls._alt_models:
            return

        # Get API key (should already be set from default model init)
        api_key = cls._api_key or os.getenv('GOOGLE_API_KEY') or os.getenv('GEMINI_API_KEY')
        if not api_key:
            raise AIServiceError("API key not configured")

        try:
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            cls._alt_models[model_name] = genai.GenerativeModel(model_name)
            logger.info(f"Alternative Gemini model initialized: {model_name}")
        except Exception as e:
            raise AIServiceError(f"Failed to initialize model {model_name}: {str(e)}")

    @property
    def model(self):
        """Get the Gemini model instance (uses override if specified)."""
        self._ensure_model_initialized()
        if self._model_override and self._model_override in self._alt_models:
            return self._alt_models[self._model_override]
        return self._model

    @property
    def model_name(self) -> str:
        """Get the current model name."""
        if self._model_override:
            return self._model_override
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
        log_tokens: bool = True,
        temperature: float = None,
        max_output_tokens: int = None,
        top_p: float = None,
        top_k: int = None,
        generation_config_preset: str = None,
        cache_ttl: int = None
    ) -> str:
        """
        Generate content using Gemini with retry logic.

        Args:
            prompt: The prompt to send to Gemini
            max_retries: Number of retry attempts (default: 3)
            retry_delay: Initial delay between retries in seconds (default: 1.0)
            log_tokens: Whether to log token usage (default: True)
            temperature: Sampling temperature (0.0-1.0). Lower = more deterministic.
            max_output_tokens: Maximum tokens in response.
            top_p: Nucleus sampling parameter (0.0-1.0).
            top_k: Top-k sampling parameter.
            generation_config_preset: Use a preset config ('quality_scoring',
                'creative_generation', 'structured_output', 'deterministic').
            cache_ttl: Cache response for this many seconds (None = no caching).

        Returns:
            Generated text response

        Raises:
            AIGenerationError: If generation fails after all retries
        """
        import gc
        from cache import cache

        max_retries = max_retries or self.DEFAULT_MAX_RETRIES
        retry_delay = retry_delay or self.DEFAULT_RETRY_DELAY

        # Build generation config
        gen_config = self._build_generation_config(
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            top_p=top_p,
            top_k=top_k,
            preset=generation_config_preset
        )

        # Check cache if caching is enabled
        if cache_ttl is not None and cache_ttl > 0:
            cache_key = self._get_prompt_cache_key(prompt, gen_config)
            cached_result = cache.get(cache_key)
            if cached_result is not None:
                logger.info(f"[{self.__class__.__name__}] Cache hit for prompt")
                return cached_result

        start_time = time.time()
        last_error = None

        for attempt in range(max_retries):
            response = None
            try:
                # Set timeout for API call (120 seconds) to prevent indefinite hangs
                from google.generativeai.types import RequestOptions
                response = self.model.generate_content(
                    prompt,
                    generation_config=gen_config if gen_config else None,
                    request_options=RequestOptions(timeout=120)
                )

                if not response or not response.text:
                    raise AIGenerationError("Empty response from Gemini API")

                # Extract text immediately to allow response object cleanup
                result_text = response.text
                response_length = len(result_text)

                elapsed = time.time() - start_time

                # Extract actual token usage from response metadata
                input_tokens = None
                output_tokens = None
                if hasattr(response, 'usage_metadata') and response.usage_metadata:
                    try:
                        input_tokens = getattr(response.usage_metadata, 'prompt_token_count', None)
                        output_tokens = getattr(response.usage_metadata, 'candidates_token_count', None)
                    except Exception as e:
                        logger.debug(f"Could not extract usage metadata: {e}")

                if log_tokens:
                    self._log_generation(
                        attempt=attempt + 1,
                        elapsed_ms=int(elapsed * 1000),
                        prompt_length=len(prompt),
                        response_length=response_length,
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                        model_name=self.model_name,
                        gen_config=gen_config
                    )

                # Cache the result if caching is enabled
                if cache_ttl is not None and cache_ttl > 0:
                    cache_key = self._get_prompt_cache_key(prompt, gen_config)
                    cache.set(cache_key, result_text, cache_ttl)
                    logger.debug(f"Cached AI response for {cache_ttl}s")

                return result_text

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
            finally:
                # Explicitly clean up response object to free Gemini SDK memory
                if response is not None:
                    del response
                gc.collect()

        raise AIGenerationError(
            f"Generation failed after {max_retries} attempts: {str(last_error)}"
        )

    def _build_generation_config(
        self,
        temperature: float = None,
        max_output_tokens: int = None,
        top_p: float = None,
        top_k: int = None,
        preset: str = None
    ) -> Optional[Dict[str, Any]]:
        """
        Build generation config from parameters or preset.

        Args:
            temperature: Sampling temperature
            max_output_tokens: Max output tokens
            top_p: Nucleus sampling parameter
            top_k: Top-k sampling parameter
            preset: Name of preset config to use

        Returns:
            Generation config dict or None if no config specified
        """
        config = {}

        # Start with preset if specified
        if preset and preset in GENERATION_CONFIGS:
            config = GENERATION_CONFIGS[preset].copy()
        elif preset:
            logger.warning(f"Unknown generation config preset: {preset}")

        # Override with explicit parameters
        if temperature is not None:
            config['temperature'] = max(0.0, min(1.0, temperature))
        if max_output_tokens is not None:
            config['max_output_tokens'] = max_output_tokens
        if top_p is not None:
            config['top_p'] = max(0.0, min(1.0, top_p))
        if top_k is not None:
            config['top_k'] = top_k

        return config if config else None

    def _get_prompt_cache_key(self, prompt: str, gen_config: Optional[Dict] = None) -> str:
        """
        Generate a cache key for a prompt + config combination.

        Args:
            prompt: The prompt text
            gen_config: Generation config dict

        Returns:
            Cache key string
        """
        # Create hash of prompt + config
        key_parts = [prompt]
        if gen_config:
            key_parts.append(json.dumps(gen_config, sort_keys=True))
        key_parts.append(self.model_name)

        combined = '|'.join(key_parts)
        hash_value = hashlib.sha256(combined.encode()).hexdigest()[:16]

        return f"ai_response:{self.__class__.__name__}:{hash_value}"

    def generate_json(
        self,
        prompt: str,
        max_retries: int = None,
        strict: bool = False,
        temperature: float = None,
        max_output_tokens: int = None,
        top_p: float = None,
        top_k: int = None,
        generation_config_preset: str = None,
        cache_ttl: int = None
    ) -> Union[Dict, List]:
        """
        Generate content and parse as JSON.

        Args:
            prompt: The prompt to send to Gemini
            max_retries: Number of retry attempts
            strict: If True, raise on parse failure; if False, return empty dict
            temperature: Sampling temperature (0.0-1.0). Lower = more deterministic.
            max_output_tokens: Maximum tokens in response.
            top_p: Nucleus sampling parameter (0.0-1.0).
            top_k: Top-k sampling parameter.
            generation_config_preset: Use a preset config ('quality_scoring',
                'creative_generation', 'structured_output', 'deterministic').
            cache_ttl: Cache response for this many seconds (None = no caching).

        Returns:
            Parsed JSON as dict or list

        Raises:
            AIParsingError: If JSON parsing fails (when strict=True)
        """
        import gc

        text = self.generate(
            prompt,
            max_retries=max_retries,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            top_p=top_p,
            top_k=top_k,
            generation_config_preset=generation_config_preset,
            cache_ttl=cache_ttl
        )

        # Log the raw response length for debugging
        logger.info(f"AI response length: {len(text)} chars")

        # Save raw response BEFORE any processing for debugging (only for debugging)
        # Disabled by default to reduce disk I/O
        # try:
        #     import tempfile
        #     import os
        #     debug_file = os.path.join(tempfile.gettempdir(), 'curriculum_ai_response_raw.txt')
        #     with open(debug_file, 'w', encoding='utf-8') as f:
        #         f.write(text)
        # except Exception:
        #     pass

        result = self.extract_json(text)

        # Clear the raw text after JSON extraction to free memory
        del text
        gc.collect()

        if result is None:
            # Comprehensive debugging for JSON parse failures
            logger.error("=" * 60)
            logger.error("JSON PARSING FAILED - DETAILED DEBUG INFO")
            logger.error("=" * 60)
            logger.error(f"Response length: {len(text)} chars")

            # Check for common issues
            has_opening_brace = '{' in text
            has_closing_brace = '}' in text
            starts_with_code_block = text.strip().startswith('```')
            ends_with_code_block = text.strip().endswith('```')
            open_braces = text.count('{')
            close_braces = text.count('}')

            logger.error(f"Contains '{{': {has_opening_brace}, Contains '}}': {has_closing_brace}")
            logger.error(f"Open braces: {open_braces}, Close braces: {close_braces}")
            logger.error(f"Starts with ```: {starts_with_code_block}, Ends with ```: {ends_with_code_block}")

            # Show start of response
            preview_start = text[:800] if len(text) > 800 else text
            logger.error(f"Response START (first 800 chars):\n{preview_start}")

            # Show end of response
            if len(text) > 800:
                preview_end = text[-400:]
                logger.error(f"Response END (last 400 chars):\n...{preview_end}")

            logger.error("=" * 60)

            if strict:
                # Build a helpful error message
                issues = []
                if starts_with_code_block:
                    issues.append("Response wrapped in markdown code blocks")
                if open_braces != close_braces:
                    issues.append(f"Unbalanced braces: {open_braces} open, {close_braces} close (JSON may be truncated)")
                if not has_opening_brace:
                    issues.append("No JSON object found in response")

                issue_summary = "; ".join(issues) if issues else "Unknown parsing error"
                error_preview = text[:200].replace('\n', '\\n') if text else '(empty)'
                raise AIParsingError(f"Failed to parse JSON: {issue_summary}. Preview: {error_preview}...")

            logger.warning(f"Failed to parse JSON, returning empty dict.")
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

        # First, strip markdown code block markers if present
        # This is more robust than regex for handling truncated responses
        logger.warning(f"extract_json: about to call _strip_markdown_code_blocks")
        text = self._strip_markdown_code_blocks(text)
        logger.warning(f"extract_json: after stripping, text starts with: {repr(text[:50]) if text else '(empty)'}")

        # Clean common issues before parsing
        cleaned_text = self._clean_json_text(text)

        # Log first attempt info
        logger.debug(f"Attempting JSON parse, text length: {len(cleaned_text)}")
        logger.debug(f"Text starts with: {cleaned_text[:50] if cleaned_text else '(empty)'}")
        logger.debug(f"Text ends with: {cleaned_text[-50:] if len(cleaned_text) > 50 else cleaned_text}")

        # Try 1: Direct parse (response is pure JSON)
        try:
            result = json.loads(cleaned_text)
            logger.info("JSON parsed successfully on first attempt")
            return result
        except json.JSONDecodeError as e:
            # Log the ACTUAL error with position info
            logger.warning(f"Direct parse failed at position {e.pos}: {e.msg}")
            logger.warning(f"Context around error: ...{cleaned_text[max(0,e.pos-50):e.pos+50]}...")
            logger.warning(f"Character at error pos: {repr(cleaned_text[e.pos]) if e.pos < len(cleaned_text) else 'EOF'}")

        # Try 2: Remove markdown code blocks with regex (backup approach)
        # Pattern: ```json ... ``` or ``` ... ```
        logger.debug("Try 2: Attempting regex code block extraction")
        code_block_patterns = [
            r'```json\s*([\s\S]*?)\s*```',
            r'```\s*([\s\S]*?)\s*```'
        ]

        for pattern in code_block_patterns:
            match = re.search(pattern, cleaned_text)
            if match:
                try:
                    extracted = self._clean_json_text(match.group(1).strip())
                    result = json.loads(extracted)
                    logger.info("JSON parsed via regex code block extraction")
                    return result
                except json.JSONDecodeError as e:
                    logger.debug(f"Code block regex parse failed: {e}")
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
        logger.debug("Try 7: Attempting truncated JSON repair")
        repaired = self._repair_truncated_json(cleaned_text)
        if repaired:
            try:
                result = json.loads(repaired)
                logger.info("JSON parsed via truncated repair")
                return result
            except json.JSONDecodeError as e:
                logger.debug(f"Truncated repair parse failed: {e}")

        # Try 8: Aggressive repair (finds valid JSON boundaries)
        logger.debug("Try 8: Attempting aggressive JSON repair")
        aggressive = self._aggressive_json_repair(cleaned_text)
        if aggressive:
            try:
                result = json.loads(aggressive)
                logger.info("JSON parsed via aggressive repair")
                return result
            except json.JSONDecodeError as e:
                logger.debug(f"Aggressive repair parse failed: {e}")

        logger.warning(f"All JSON extraction methods failed")
        return None

    def _strip_markdown_code_blocks(self, text: str) -> str:
        """
        Strip markdown code block markers from AI responses.

        Handles cases like:
        - ```json\n{...}\n```
        - ```\n{...}\n```
        - ```json\n{...} (truncated, no closing ```)
        - Mixed content with code blocks

        Args:
            text: Raw AI response text

        Returns:
            Text with markdown code block markers removed
        """
        # Log entry - use WARNING to ensure visibility
        logger.warning(f"_strip_markdown_code_blocks called with {len(text) if text else 0} chars")

        if not text:
            return text

        original_len = len(text)

        # Strip whitespace first
        text = text.strip()

        logger.warning(f"Text starts with: {repr(text[:20])}")

        # Check if it starts with a code block marker
        if text.startswith('```'):
            logger.warning("Found opening ``` marker - stripping")
            # Find the end of the opening marker line (handle both \n and \r\n)
            first_newline = -1
            for i, char in enumerate(text):
                if char == '\n':
                    first_newline = i
                    break
                elif char == '\r' and i + 1 < len(text) and text[i + 1] == '\n':
                    first_newline = i
                    break

            if first_newline > 0:
                marker_line = text[:first_newline].strip()
                logger.warning(f"Opening marker line: '{marker_line}'")
                # Strip the opening marker line (skip \r\n if present)
                if text[first_newline] == '\r':
                    text = text[first_newline + 2:]
                else:
                    text = text[first_newline + 1:]
                logger.warning(f"After stripping opening, starts with: {repr(text[:30])}")
            else:
                logger.warning(f"No newline found after ```, first_newline={first_newline}")
        else:
            logger.warning(f"Text does NOT start with ```, starts with: {repr(text[:10])}")

        # Strip trailing code block marker if present
        text_stripped = text.rstrip()
        if text_stripped.endswith('```'):
            logger.warning("Found closing ``` marker - stripping")
            # Find and remove the last ```
            last_marker = text.rfind('```')
            if last_marker >= 0:
                text = text[:last_marker].rstrip()
                logger.warning(f"After stripping closing, ends with: {repr(text[-30:])}")

        final_len = len(text)
        if final_len != original_len:
            logger.warning(f"Stripped markdown: {original_len} -> {final_len} chars")
        else:
            logger.warning(f"No stripping performed (length: {original_len})")

        return text

    def _clean_json_text(self, text: str) -> str:
        """
        Clean common issues in JSON text from AI responses.
        """
        if not text:
            return text

        original_len = len(text)
        logger.warning(f"_clean_json_text called with {original_len} chars")

        # Remove BOM and other invisible characters
        text = text.strip('\ufeff\u200b\u200c\u200d\u2060')

        # Remove null characters that cause DB issues
        text = text.replace('\x00', '').replace('\\u0000', '')

        # Replace smart quotes with regular quotes
        text = text.replace('\u2018', "'")  # Left single quote
        text = text.replace('\u2019', "'")  # Right single quote (apostrophe)
        text = text.replace('\u201c', '"')  # Left double quote
        text = text.replace('\u201d', '"')  # Right double quote
        text = text.replace('\u2013', '-')  # En dash
        text = text.replace('\u2014', '-')  # Em dash
        text = text.replace('\u2026', '...')  # Ellipsis

        # Fix common AI typos in JSON syntax
        text = re.sub(r'":=\s*"', '": "', text)  # Fix ":=" to ": " (AI typo)
        text = re.sub(r'":\s*=\s*"', '": "', text)  # Fix ": =" to ": "

        # Escape control characters inside strings (they're invalid in JSON)
        # This handles raw newlines, tabs, etc. inside string values
        def escape_control_in_strings(match):
            """Escape control characters inside JSON string values."""
            content = match.group(1)
            # Escape control characters
            content = content.replace('\n', '\\n')
            content = content.replace('\r', '\\r')
            content = content.replace('\t', '\\t')
            # Remove other control characters
            content = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', content)
            return '"' + content + '"'

        # Match JSON strings (content between quotes, handling escapes)
        # Pattern matches: opening quote, content (non-quote or escaped chars), closing quote
        text = re.sub(r'"((?:[^"\\]|\\.)*)"', escape_control_in_strings, text)

        # Also handle any remaining control characters outside strings
        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)

        # Fix invalid escape sequences
        # Valid JSON escapes: \", \\, \/, \b, \f, \n, \r, \t, \uXXXX
        # Replace invalid escapes (backslash followed by invalid char) with escaped backslash
        def fix_invalid_escapes(match):
            char = match.group(1)
            # Valid escape characters (note: \/ is valid in JSON but rare)
            if char in r'"\\/bfnrt':
                return match.group(0)  # Keep valid escapes
            if char == 'u':
                # Check if it's a valid \uXXXX sequence
                return match.group(0)  # Keep \u (validator will check the rest)
            # Invalid escape - escape the backslash
            return '\\\\' + char

        text = re.sub(r'\\([^"\\\/bfnrtu])', fix_invalid_escapes, text)

        # Remove trailing commas before closing brackets/braces (common AI error)
        text = re.sub(r',(\s*[\]\}])', r'\1', text)

        # Remove JavaScript-style block comments only (/* ... */)
        # Note: We intentionally DON'T remove // line comments because they would
        # incorrectly match URLs (https://...) and corrupt the JSON
        text = re.sub(r'/\*[\s\S]*?\*/', '', text)

        final_len = len(text)
        if final_len != original_len:
            logger.warning(f"_clean_json_text modified: {original_len} -> {final_len} chars")
        logger.warning(f"_clean_json_text output starts with: {repr(text[:50])}")
        logger.warning(f"_clean_json_text output ends with: {repr(text[-50:])}")

        return text

    def _aggressive_json_repair(self, text: str) -> Optional[str]:
        """
        More aggressive JSON repair for stubborn syntax errors.
        """
        if not text:
            return None

        # Find the JSON content
        start = text.find('{')
        if start < 0:
            return None

        json_text = text[start:]

        # Try to find a valid ending
        # Sometimes AI adds extra text after the JSON
        depth = 0
        in_string = False
        escape_next = False
        end_pos = -1

        for i, char in enumerate(json_text):
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
                depth += 1
            elif char == '}':
                depth -= 1
                if depth == 0:
                    end_pos = i
                    break

        if end_pos > 0:
            json_text = json_text[:end_pos + 1]

        # Clean and try to parse
        json_text = self._clean_json_text(json_text)

        # Try to parse, and if it fails, keep fixing errors up to 10 times
        # (there may be multiple unescaped quotes in the document)
        max_fix_attempts = 10
        for attempt in range(max_fix_attempts):
            try:
                result = json.loads(json_text)
                if attempt > 0:
                    logger.info(f"JSON parsed successfully after {attempt} fix(es)")
                return json_text
            except json.JSONDecodeError as e:
                logger.warning(f"Parse attempt {attempt + 1} failed at pos {e.pos}: {e.msg}")
                # Try to fix specific issues based on error
                fixed_text = self._fix_json_at_position(json_text, e)
                if fixed_text and fixed_text != json_text:
                    logger.warning(f"Fix applied, text length changed from {len(json_text)} to {len(fixed_text)}")
                    json_text = fixed_text
                    # Continue loop to try parsing the fixed text
                else:
                    # No fix was applied, give up
                    logger.warning(f"No fix applied on attempt {attempt + 1}, giving up")
                    break

        return None

    def _fix_json_at_position(self, text: str, error: json.JSONDecodeError) -> Optional[str]:
        """
        Try to fix JSON based on the specific error position.
        """
        pos = error.pos
        msg = str(error)

        # Log for debugging
        context_start = max(0, pos - 50)
        context_end = min(len(text), pos + 50)
        logger.warning(f"_fix_json_at_position: error at pos {pos}: {msg}")
        logger.warning(f"_fix_json_at_position: context: ...{text[context_start:context_end]}...")

        # Special fix: unescaped quotes inside string values (common with citations)
        if "Expecting ',' delimiter" in msg or "Expecting ':' delimiter" in msg:
            # The error position is likely pointing right after an unescaped quote
            # Look for the pattern where we have a quote that looks like it's inside a string
            # Find the problematic area around the error
            search_start = max(0, pos - 200)
            search_end = min(len(text), pos + 200)
            context = text[search_start:search_end]

            # Look for unescaped quotes that appear to be citations/titles inside strings
            def escape_inner_quotes(m):
                return m.group(1) + '\\"' + m.group(2) + '\\"'

            fixed_context = context

            # Pattern 1: Citation-style quotes after punctuation: `. "Title"` or `, "Title"`
            fixed_context = re.sub(
                r'(\w[.,]\s*)"([^"\\]{2,150})"(?=\s*[^:])',
                escape_inner_quotes,
                fixed_context
            )

            # Pattern 2: Quotes after common words like "about", "called", "named", "titled"
            # Catches: `talking about "graduation requirements."` or `called "something"`
            fixed_context = re.sub(
                r'(\b(?:about|called|named|titled|says|said|like|as)\s+)"([^"\\]{2,100})"',
                escape_inner_quotes,
                fixed_context,
                flags=re.IGNORECASE
            )

            # Pattern 3: Any quoted phrase that ends with punctuation inside the quote
            # Catches: `"some phrase."` or `"some phrase!"`
            fixed_context = re.sub(
                r'(\s)"([^"\\]{2,100}[.!?])"(?=\s)',
                escape_inner_quotes,
                fixed_context
            )

            if fixed_context != context:
                logger.warning(f"Fixed unescaped quotes in context (pattern matching)")
                fixed_text = text[:search_start] + fixed_context + text[search_end:]
                return fixed_text

            # Pattern 4: Last resort - escape ALL unescaped quotes in the window
            # except those that look like JSON structure boundaries
            # Look for quotes preceded by a non-backslash character
            new_context = []
            i = 0
            fixed_any = False
            while i < len(context):
                char = context[i]
                if char == '"':
                    # Check if this quote is already escaped
                    is_escaped = i > 0 and context[i-1] == '\\'
                    if not is_escaped:
                        # Check if this looks like JSON structure
                        # JSON structure: after `: ` or after `, ` or at start, or before `:`
                        before = context[max(0, i-5):i].rstrip()
                        after = context[i+1:i+3] if i+1 < len(context) else ''
                        is_json_key_start = before.endswith(':') or before.endswith(',') or before.endswith('{') or before.endswith('[')
                        is_json_key_end = after.startswith(':')

                        if not is_json_key_start and not is_json_key_end:
                            # This is likely an unescaped quote inside a string value
                            new_context.append('\\')
                            fixed_any = True
                new_context.append(char)
                i += 1

            if fixed_any:
                fixed_context = ''.join(new_context)
                logger.warning(f"Fixed unescaped quotes in context (character scan)")
                fixed_text = text[:search_start] + fixed_context + text[search_end:]
                return fixed_text

        # Fix "Expecting ',' delimiter" - often means missing comma
        if "Expecting ',' delimiter" in msg:
            # Look backwards for the last complete value and add comma
            # Common pattern: }"value" should be },"value"
            if pos > 0 and pos < len(text):
                before = text[pos-1:pos]
                after = text[pos:pos+1] if pos < len(text) else ''

                # Missing comma between } and "
                if before == '}' and after == '"':
                    return text[:pos] + ',' + text[pos:]
                # Missing comma between ] and "
                if before == ']' and after == '"':
                    return text[:pos] + ',' + text[pos:]
                # Missing comma between " and "
                if before == '"' and after == '"':
                    return text[:pos] + ',' + text[pos:]
                # Missing comma between } and {
                if before == '}' and after == '{':
                    return text[:pos] + ',' + text[pos:]

        # Fix "Expecting ':' delimiter" - maybe extra quote or wrong structure
        if "Expecting ':' delimiter" in msg:
            # Look for patterns like ""key" which should be "key"
            if pos > 1 and text[pos-2:pos] == '""':
                return text[:pos-1] + text[pos:]

        # Fix "Expecting value" - could be trailing comma or empty value
        if "Expecting value" in msg:
            if pos > 0 and text[pos-1] == ',':
                # Trailing comma before ] or }
                return text[:pos-1] + text[pos:]

        return None

    def _repair_truncated_json(self, text: str) -> Optional[str]:
        """
        Attempt to repair truncated JSON by closing unclosed brackets/braces.
        Common issue when AI response hits token limit.
        """
        logger.debug(f"_repair_truncated_json called with {len(text)} chars")

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

        # Log what we found
        logger.debug(f"Truncated repair analysis: open_braces={open_braces}, open_brackets={open_brackets}, in_string={in_string}")

        # If we have unclosed structures, try to close them
        if open_braces > 0 or open_brackets > 0 or in_string:
            repair_parts = []

            # Close any open string first
            if in_string:
                # Truncated inside a string - close it and potentially truncate cleanly
                # Find last good position (not in the middle of an escape sequence)
                json_text += '"'
                repair_parts.append('closed open string')

            # Add closing brackets and braces
            repair = ''
            for _ in range(open_brackets):
                repair += ']'
            for _ in range(open_braces):
                repair += '}'

            if repair:
                repair_parts.append(f'added {repair}')

            logger.info(f"Truncated JSON repair: {', '.join(repair_parts)}")
            return json_text + repair

        logger.debug("No truncation detected, returning None")
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
        response_length: int,
        input_tokens: Optional[int] = None,
        output_tokens: Optional[int] = None,
        model_name: Optional[str] = None,
        gen_config: Optional[Dict] = None
    ):
        """
        Log generation metrics for monitoring.

        Logs both character counts and actual token usage when available.
        Token usage is extracted from Gemini's response.usage_metadata.
        """
        # Build log message
        log_parts = [
            f"[{self.__class__.__name__}] Generation complete:",
            f"attempt={attempt}",
            f"time={elapsed_ms}ms",
            f"prompt={prompt_length} chars",
            f"response={response_length} chars",
        ]

        # Add actual token usage if available
        if input_tokens is not None and output_tokens is not None:
            log_parts.append(f"tokens_in={input_tokens}")
            log_parts.append(f"tokens_out={output_tokens}")

            # Calculate estimated cost
            cost = self._calculate_token_cost(input_tokens, output_tokens)
            if cost > 0:
                log_parts.append(f"cost=${cost:.6f}")

        # Add model info
        if model_name:
            log_parts.append(f"model={model_name}")

        # Add config info if custom
        if gen_config and 'temperature' in gen_config:
            log_parts.append(f"temp={gen_config['temperature']}")

        logger.info(" ".join(log_parts))

        # Track usage for cost monitoring (async/non-blocking)
        if input_tokens is not None and output_tokens is not None:
            self._track_usage_async(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                model_name=model_name or self.model_name,
                response_time_ms=elapsed_ms,
                gen_config=gen_config
            )

    def _calculate_token_cost(
        self,
        input_tokens: int,
        output_tokens: int,
        model: str = None
    ) -> float:
        """
        Calculate estimated cost for token usage.

        Args:
            input_tokens: Number of input tokens
            output_tokens: Number of output tokens
            model: Model name (for future model-specific pricing)

        Returns:
            Estimated cost in USD
        """
        # Gemini 2.5 Flash Lite pricing (January 2025)
        INPUT_COST_PER_MILLION = 0.075
        OUTPUT_COST_PER_MILLION = 0.30

        input_cost = (input_tokens / 1_000_000) * INPUT_COST_PER_MILLION
        output_cost = (output_tokens / 1_000_000) * OUTPUT_COST_PER_MILLION

        return input_cost + output_cost

    def _track_usage_async(
        self,
        input_tokens: int,
        output_tokens: int,
        model_name: str,
        prompt_hash: str = None,
        response_time_ms: int = None,
        gen_config: Dict = None,
        user_id: str = None,
        success: bool = True,
        error_message: str = None
    ):
        """
        Track AI usage for cost monitoring.
        Logs to ai_usage_logs table for persistent tracking.

        Args:
            input_tokens: Number of input tokens
            output_tokens: Number of output tokens
            model_name: Model used for generation
            prompt_hash: Hash of prompt for deduplication analysis
            response_time_ms: Response time in milliseconds
            gen_config: Generation config used
            user_id: User ID if available from request context
            success: Whether generation succeeded
            error_message: Error message if generation failed
        """
        cost = self._calculate_token_cost(input_tokens, output_tokens)

        # Log for immediate visibility
        logger.debug(
            f"AI Usage: {input_tokens}+{output_tokens} tokens, "
            f"${cost:.6f}, model={model_name}"
        )

        # Optionally persist to database (non-blocking)
        # Skip if no tokens to log (e.g., cache hits)
        if input_tokens == 0 and output_tokens == 0:
            return

        try:
            from database import get_supabase_admin_client

            supabase = get_supabase_admin_client()
            if supabase:
                log_entry = {
                    'service_name': self.__class__.__name__,
                    'model_name': model_name,
                    'input_tokens': input_tokens,
                    'output_tokens': output_tokens,
                    'estimated_cost': float(cost),
                    'success': success,
                }

                # Add optional fields if provided
                if prompt_hash:
                    log_entry['prompt_hash'] = prompt_hash
                if response_time_ms is not None:
                    log_entry['response_time_ms'] = response_time_ms
                if gen_config:
                    log_entry['generation_config'] = gen_config
                if user_id:
                    log_entry['user_id'] = user_id
                if error_message:
                    log_entry['error_message'] = error_message

                # Insert asynchronously (fire and forget)
                supabase.table('ai_usage_logs').insert(log_entry).execute()
        except Exception as e:
            # Don't let logging failures affect the main operation
            logger.warning(f"Failed to log AI usage to database: {e}")


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
