"""
AI-powered curriculum content enhancement service using Google Gemini API.
Enhances lesson content by splitting into digestible steps with better formatting.

RESTRICTED: Only available to superadmin users.

Refactored (Jan 2026): Now uses shared prompt components for consistency.
"""

import json
import re
import os
from typing import Dict, List, Optional, Any
import google.generativeai as genai

from utils.logger import get_logger

# Import shared prompt components
from prompts.components import (
    CORE_PHILOSOPHY,
    TONE_LEVELS,
)

logger = get_logger(__name__)


class CurriculumAIService:
    """Service for AI-powered curriculum content enhancement using Gemini API"""

    def __init__(self):
        """Initialize the AI service with Gemini configuration"""
        self.api_key = os.getenv('GOOGLE_API_KEY') or os.getenv('GEMINI_API_KEY')
        self.model_name = os.getenv('GEMINI_MODEL', 'gemini-2.5-flash-lite')

        if not self.api_key:
            raise ValueError("GOOGLE_API_KEY not configured")

        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel(self.model_name)

    def enhance_lesson_content(
        self,
        content: str,
        lesson_title: Optional[str] = None,
        suggest_resources: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Enhance lesson content by splitting it into digestible steps.

        Args:
            content: The raw lesson content (HTML or text)
            lesson_title: Optional title for context
            suggest_resources: List of resource types to suggest (videos, articles, books, files, links)

        Returns:
            Dict with 'steps' array containing enhanced content including resource suggestions
        """
        try:
            # Strip HTML tags for analysis but preserve them for content
            text_content = self._strip_html(content)

            if len(text_content.strip()) < 50:
                raise ValueError("Content is too short to enhance")

            prompt = self._build_enhancement_prompt(content, lesson_title, suggest_resources or [])

            response = self.model.generate_content(prompt)
            if not response or not response.text:
                raise Exception("Empty response from Gemini API")

            # Parse the response
            steps = self._parse_enhancement_response(response.text)

            if not steps:
                raise Exception("Failed to parse enhanced content")

            logger.info(f"Enhanced content into {len(steps)} steps")

            return {
                'success': True,
                'steps': steps
            }

        except Exception as e:
            logger.error(f"Content enhancement failed: {str(e)}")
            raise

    def _strip_html(self, html: str) -> str:
        """Remove HTML tags for text analysis"""
        clean = re.compile('<.*?>')
        return re.sub(clean, '', html)

    def _convert_markdown_to_html(self, text: str) -> str:
        """Convert any stray markdown syntax to HTML"""
        if not text:
            return text

        # Remove horizontal rules
        text = re.sub(r'^---+\s*$', '', text, flags=re.MULTILINE)
        text = re.sub(r'^\*\*\*+\s*$', '', text, flags=re.MULTILINE)

        # Remove markdown headings (# ## ###) - just keep the text
        text = re.sub(r'^#{1,6}\s+(.+)$', r'\1', text, flags=re.MULTILINE)

        # Convert **bold** to <strong>
        text = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', text)
        # Convert __bold__ to <strong>
        text = re.sub(r'__([^_]+)__', r'<strong>\1</strong>', text)
        # Convert *italic* to <em> (but not if inside a tag or list item)
        text = re.sub(r'(?<![<\w\-])\*([^*\n]+)\*(?![>\w])', r'<em>\1</em>', text)
        # Convert _italic_ to <em>
        text = re.sub(r'(?<![<\w])_([^_\n]+)_(?![>\w])', r'<em>\1</em>', text)

        # Remove table pipe characters and clean up table rows
        text = re.sub(r'\|[-:\s]+\|', '', text)  # Remove separator rows like |---|---|
        text = re.sub(r'^\s*\||\|\s*$', '', text, flags=re.MULTILINE)  # Remove leading/trailing pipes
        text = re.sub(r'\s*\|\s*', ' - ', text)  # Convert remaining pipes to dashes

        # Clean up any double spaces
        text = re.sub(r'  +', ' ', text)

        return text

    def _build_enhancement_prompt(
        self,
        content: str,
        lesson_title: Optional[str],
        suggest_resources: List[str]
    ) -> str:
        """Build the prompt for content enhancement with optional resource suggestions"""

        title_context = f'The lesson is titled "{lesson_title}".' if lesson_title else ''

        # Build resource suggestion instructions
        resource_instructions = ""
        if suggest_resources:
            resource_types = []
            if 'videos' in suggest_resources:
                resource_types.append("educational videos (YouTube, Vimeo, etc.)")
            if 'articles' in suggest_resources:
                resource_types.append("articles and blog posts")
            if 'books' in suggest_resources:
                resource_types.append("books for deeper learning")
            if 'files' in suggest_resources:
                resource_types.append("downloadable resources (worksheets, templates)")
            if 'links' in suggest_resources:
                resource_types.append("external websites and tools")

            resource_list = ", ".join(resource_types)
            resource_instructions = f"""

RESOURCE SUGGESTIONS:
The user wants you to suggest relevant supplementary resources. For each major concept or section, consider adding a "video" or "file" type step with suggestions for: {resource_list}.

For VIDEO suggestion steps:
- Set "type": "video"
- Leave "video_url" empty (the educator will find the actual video)
- In "content", provide specific suggestions like:
  - What type of video would work well here
  - Specific topics or keywords to search for
  - Why a video would enhance learning at this point
  - Example search terms they could use

For FILE/RESOURCE suggestion steps:
- Set "type": "file"
- Leave "files" as an empty array
- In "content", provide specific suggestions like:
  - What type of downloadable resource would help
  - Ideas for worksheets, templates, or reference materials
  - Book recommendations with titles and authors
  - Links to specific websites or tools (include URLs if known)
  - Why this resource would be valuable at this point

Place resource suggestion steps at logical points in the lesson flow where they would enhance understanding.
Do NOT add resource steps after every text step - be strategic about placement."""

        return f"""You are an expert educational content organizer for the Optio learning platform.

{TONE_LEVELS['admin_tools']}

{CORE_PHILOSOPHY}

Your ONLY task is to split the following lesson content into logical steps while PRESERVING THE EXACT ORIGINAL TEXT.

{title_context}

ORIGINAL CONTENT:
{content}

CRITICAL RULE - PRESERVE ORIGINAL TEXT:
- Keep the EXACT original wording and sentences - do NOT summarize or paraphrase
- Do NOT add new content or explanations that weren't in the original
- Every sentence from the original must appear in your output
- Your job is to split, organize, and convert formatting - NOT to rewrite content

HANDLING MARKDOWN INPUT:
- The input may contain markdown formatting - you MUST convert it to HTML
- Convert markdown headings (# ## ###) to step breaks - use the heading text as step titles
- Convert *italic* or _italic_ to <em>text</em>
- Convert **bold** or __bold__ to <strong>text</strong>
- Convert markdown lists (- item or * item) to <ul><li>item</li></ul>
- Convert markdown tables to simple HTML: use <strong> for headers, <ul><li> for rows
- Remove horizontal rules (---) - use them as natural step break points
- NEVER include raw markdown syntax in the output (no #, *, -, |, ---, etc.)

INSTRUCTIONS:
1. Split content at natural breakpoints: markdown headings (##), horizontal rules (---), topic changes
2. Each step should cover ONE main concept or section
3. Use as many steps as needed - do NOT artificially combine content
4. Use markdown headings as step titles when available, otherwise create descriptive titles (3-6 words)
5. Output ONLY clean HTML - no markdown syntax allowed
6. Wrap paragraphs in <p> tags
7. Make sure the flow feels natural from step to step
{resource_instructions}

STEP TYPES:
- "text": Regular text content step (default)
- "video": Video suggestion step - educator will add the actual video
- "file": Resource/file suggestion step - educator will add actual files

CRITICAL HTML FORMATTING:
- Use ONLY HTML tags, NEVER use markdown syntax
- Use <em>text</em> for italics, NOT *text* or _text_
- Use <strong>text</strong> for bold, NOT **text** or __text__
- Use <p> tags to separate paragraphs, but paragraphs should be 2-5 sentences each
- AVOID single-sentence paragraphs and single-word paragraphs - group related sentences together
- BAD: <p>This is one sentence.</p><p>This is another.</p><p>And another.</p>
- GOOD: <p>This is one sentence. This is another related sentence. And a third that connects.</p><p>Now a new thought begins here with its own context.</p>
- Keep the writing flowing and connected, not choppy or fragmented
- Lists should use <ul><li>item</li></ul> structure

CRITICAL JSON FORMATTING RULES:
- Escape all double quotes inside content strings with backslash: \\"
- Do not use actual newlines inside JSON strings - use a single space instead
- Keep HTML simple - avoid complex nested structures

FINAL REMINDER:
- The "content" field must contain the ORIGINAL TEXT, converted to clean HTML (no markdown)
- Do NOT rewrite, summarize, or paraphrase the text itself
- Output must be valid HTML only - absolutely NO markdown syntax (#, *, -, |, ---, etc.)

OUTPUT FORMAT (valid JSON only):
{{"steps":[
  {{"type":"text","title":"Introduction","content":"<p>Text content here.</p>"}},
  {{"type":"text","title":"Key Concept","content":"<p>More text content.</p>"}},
  {{"type":"video","title":"Video: Deep Dive","content":"<p><strong>Suggested Video:</strong> Search for a video about [topic].</p><p>Look for videos that explain [specific aspect]. Keywords to try: [search terms].</p>","video_url":""}},
  {{"type":"text","title":"Next Section","content":"<p>Continuing with text.</p>"}},
  {{"type":"file","title":"Practice Resources","content":"<p><strong>Recommended Resources:</strong></p><ul><li>Download a worksheet on [topic]</li><li>Book: [Title] by [Author]</li></ul>","files":[]}}
]}}

Respond with ONLY the JSON object. No markdown, no explanation, no code blocks.
"""

    def _parse_enhancement_response(self, response_text: str) -> List[Dict[str, str]]:
        """Parse the AI response into steps array"""
        try:
            # Clean the response - remove markdown code blocks if present
            text = response_text.strip()
            if text.startswith('```'):
                # Remove markdown code block
                text = re.sub(r'^```(?:json)?\n?', '', text)
                text = re.sub(r'\n?```$', '', text)

            # Remove any leading/trailing whitespace again
            text = text.strip()

            # Try to find JSON object in the response
            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                text = json_match.group(0)

            # Fix common JSON issues from AI responses
            # Replace actual newlines in strings with spaces
            text = re.sub(r'(?<!\\)\n', ' ', text)

            # Try to parse JSON
            try:
                data = json.loads(text)
            except json.JSONDecodeError:
                # Try fixing unescaped quotes in content
                # This is a common issue with AI-generated JSON
                logger.warning("Initial JSON parse failed, attempting to fix...")

                # More aggressive cleanup - try to extract steps manually
                steps = self._extract_steps_fallback(text)
                if steps:
                    return steps
                raise

            if not isinstance(data, dict) or 'steps' not in data:
                logger.error(f"Invalid response structure: {text[:200]}")
                return []

            steps = data['steps']

            if not isinstance(steps, list) or len(steps) == 0:
                logger.error("No steps found in response")
                return []

            # Validate each step has required fields
            validated_steps = []
            for i, step in enumerate(steps):
                if isinstance(step, dict) and 'title' in step:
                    # Convert any stray markdown to HTML
                    content = self._convert_markdown_to_html(str(step.get('content', '')).strip())
                    step_type = step.get('type', 'text')

                    # Validate step type
                    if step_type not in ['text', 'video', 'file']:
                        step_type = 'text'

                    validated_step = {
                        'type': step_type,
                        'title': str(step['title']).strip(),
                        'content': content
                    }

                    # Add video_url for video steps
                    if step_type == 'video':
                        validated_step['video_url'] = step.get('video_url', '')

                    # Add files for file steps
                    if step_type == 'file':
                        validated_step['files'] = step.get('files', [])

                    validated_steps.append(validated_step)
                else:
                    logger.warning(f"Skipping invalid step {i}: {step}")

            return validated_steps

        except json.JSONDecodeError as e:
            logger.error(f"JSON parse error: {str(e)}")
            logger.error(f"Response was: {response_text[:500]}")
            return []
        except Exception as e:
            logger.error(f"Parse error: {str(e)}")
            return []

    def _extract_steps_fallback(self, text: str) -> List[Dict[str, str]]:
        """
        Fallback method to extract steps when JSON parsing fails.
        Uses regex to find title/content pairs.
        """
        try:
            steps = []
            # Look for patterns like "title": "...", "content": "..."
            pattern = r'"title"\s*:\s*"([^"]+)"\s*,\s*"content"\s*:\s*"((?:[^"\\]|\\.)*)\"'
            matches = re.findall(pattern, text, re.DOTALL)

            for title, content in matches:
                # Unescape the content
                content = content.replace('\\"', '"').replace('\\n', ' ')
                # Convert any stray markdown to HTML
                content = self._convert_markdown_to_html(content.strip())
                steps.append({
                    'title': title.strip(),
                    'content': content
                })

            if steps:
                logger.info(f"Fallback extraction found {len(steps)} steps")
                return steps

            return []
        except Exception as e:
            logger.error(f"Fallback extraction failed: {str(e)}")
            return []


# Singleton instance
_service_instance = None

def get_curriculum_ai_service() -> CurriculumAIService:
    """Get singleton instance of curriculum AI service"""
    global _service_instance
    if _service_instance is None:
        _service_instance = CurriculumAIService()
    return _service_instance
