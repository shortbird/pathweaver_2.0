"""
Curriculum Upload Service
=========================

Orchestrates the AI curriculum upload pipeline:
1. Parse source (PDF, DOCX, text, IMSCC)
2. Detect structure (AI identifies modules, lessons)
3. Align philosophy (Transform to Optio language)
4. Generate content (Create step-based lessons)

Processes in background and auto-creates draft course.
Notifies user when complete so they can edit in CourseBuilder.
"""

import uuid
from typing import Dict, List, Optional, Any
from services.base_ai_service import BaseAIService, AIGenerationError
from services.document_parser_service import DocumentParserService
from services.imscc_parser_service import IMSCCParserService

from utils.logger import get_logger

logger = get_logger(__name__)


class CurriculumUploadError(Exception):
    """Base exception for curriculum upload errors."""
    pass


class CurriculumUploadService(BaseAIService):
    """
    Orchestrates the multi-stage AI curriculum upload pipeline.

    Pipeline Stages:
    1. parse_source() - Extract raw content from IMSCC/PDF/DOCX/text
    2. detect_structure() - AI identifies curriculum structure
    3. align_philosophy() - Transform language to Optio philosophy
    4. generate_course_content() - Create step-based lessons (no tasks)

    Output is auto-saved as draft course for editing in CourseBuilder.
    """

    def __init__(self):
        """Initialize with document parsers."""
        super().__init__()
        self.document_parser = DocumentParserService()
        self.imscc_parser = IMSCCParserService()

    def process_upload(
        self,
        source_type: str,
        content: bytes,
        filename: Optional[str] = None,
        options: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Execute the full curriculum upload pipeline.

        Args:
            source_type: Type of content ('imscc', 'pdf', 'docx', 'text')
            content: Raw bytes of the uploaded file (or text string)
            filename: Original filename for metadata
            options: Optional configuration for the pipeline:
                - transformation_level: 'light', 'moderate', 'full' (default: 'moderate')
                - preserve_structure: True/False (default: True)

        Returns:
            Dict with all pipeline outputs:
            {
                'success': bool,
                'error': str (if failed),
                'stages': {
                    'parse': {...},
                    'structure': {...},
                    'alignment': {...},
                    'content': {...}
                },
                'preview': {
                    'course': {...},
                    'lessons': [...]
                },
                'metadata': {...}
            }
        """
        options = options or {}
        transformation_level = options.get('transformation_level', 'moderate')
        preserve_structure = options.get('preserve_structure', True)

        try:
            # Stage 1: Parse source content
            logger.info(f"Stage 1: Parsing {source_type} content")
            parse_result = self.parse_source(source_type, content, filename)

            if not parse_result.get('success'):
                return {
                    'success': False,
                    'error': parse_result.get('error', 'Failed to parse source'),
                    'stages': {'parse': parse_result}
                }

            # Stage 2: Detect curriculum structure
            logger.info("Stage 2: Detecting curriculum structure")
            structure_result = self.detect_structure(parse_result)

            if not structure_result.get('success'):
                return {
                    'success': False,
                    'error': structure_result.get('error', 'Failed to detect structure'),
                    'stages': {
                        'parse': parse_result,
                        'structure': structure_result
                    }
                }

            # Stage 3: Align to Optio philosophy
            logger.info(f"Stage 3: Aligning to Optio philosophy (level={transformation_level}, preserve={preserve_structure})")
            alignment_result = self.align_philosophy(
                structure_result,
                transformation_level=transformation_level,
                preserve_structure=preserve_structure
            )

            if not alignment_result.get('success'):
                return {
                    'success': False,
                    'error': alignment_result.get('error', 'Failed to align philosophy'),
                    'stages': {
                        'parse': parse_result,
                        'structure': structure_result,
                        'alignment': alignment_result
                    }
                }

            # Stage 4: Generate course content
            logger.info("Stage 4: Generating course content")
            content_result = self.generate_course_content(alignment_result)

            if not content_result.get('success'):
                return {
                    'success': False,
                    'error': content_result.get('error', 'Failed to generate content'),
                    'stages': {
                        'parse': parse_result,
                        'structure': structure_result,
                        'alignment': alignment_result,
                        'content': content_result
                    }
                }

            # Build final preview
            preview = self._build_preview(content_result)

            return {
                'success': True,
                'stages': {
                    'parse': parse_result,
                    'structure': structure_result,
                    'alignment': alignment_result,
                    'content': content_result
                },
                'preview': preview,
                'metadata': {
                    'source_type': source_type,
                    'filename': filename,
                    'transformation_level': transformation_level,
                    'preserve_structure': preserve_structure,
                    'source_sections': len(parse_result.get('sections', [])),
                    'detected_modules': len(structure_result.get('modules', [])),
                    'generated_lessons': len(content_result.get('lessons', []))
                }
            }

        except Exception as e:
            logger.error(f"Curriculum upload pipeline failed: {str(e)}")
            return {
                'success': False,
                'error': f'Pipeline failed: {str(e)}'
            }

    def parse_source(
        self,
        source_type: str,
        content: bytes,
        filename: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Stage 1: Parse source content into raw text and sections.

        Delegates to appropriate parser based on source type.

        Args:
            source_type: Type of content
            content: Raw bytes or text
            filename: Original filename

        Returns:
            Dict with raw_text, sections, metadata
        """
        if source_type == 'imscc':
            # Use IMSCC parser for Canvas exports
            result = self.imscc_parser.parse_imscc_file(content)

            if not result.get('success'):
                return result

            # Convert IMSCC output to our standard format
            return {
                'success': True,
                'raw_text': self._imscc_to_text(result),
                'sections': self._imscc_to_sections(result),
                'metadata': {
                    'source_type': 'imscc',
                    'filename': filename,
                    'course_title': result.get('course', {}).get('title', ''),
                    'total_assignments': result.get('stats', {}).get('total_assignments', 0),
                    'total_modules': result.get('stats', {}).get('total_modules', 0)
                },
                'original_data': result  # Keep for reference
            }
        else:
            # Use document parser for PDF, DOCX, text
            return self.document_parser.parse_document(content, source_type, filename)

    def detect_structure(self, parse_result: Dict) -> Dict[str, Any]:
        """
        Stage 2: Use AI to identify curriculum structure.

        Analyzes parsed content to identify:
        - Course metadata (title, description, objectives)
        - Modules/units
        - Lessons
        - Tasks/assignments

        Args:
            parse_result: Output from parse_source()

        Returns:
            Dict with detected curriculum structure
        """
        from prompts.components import (
            PILLAR_DEFINITIONS_DETAILED,
            JSON_OUTPUT_INSTRUCTIONS_STRICT
        )
        from prompts.curriculum_upload import CURRICULUM_STRUCTURE_DETECTION

        # Prepare content for AI (truncate if too long)
        raw_text = parse_result.get('raw_text', '')
        sections = parse_result.get('sections', [])

        # Build structured input for AI
        content_summary = self._build_content_summary(raw_text, sections)

        prompt = f"""
{CURRICULUM_STRUCTURE_DETECTION}

{PILLAR_DEFINITIONS_DETAILED}

CONTENT TO ANALYZE:
{content_summary}

{JSON_OUTPUT_INSTRUCTIONS_STRICT}
"""

        try:
            result = self.generate_json(prompt, strict=True)

            # Validate structure
            if not isinstance(result, dict):
                return {
                    'success': False,
                    'error': 'AI returned invalid structure format'
                }

            return {
                'success': True,
                'course': result.get('course', {}),
                'modules': result.get('modules', []),
                'lessons': result.get('lessons', []),
                'tasks': result.get('tasks', []),
                'curriculum_type': result.get('curriculum_type', 'unknown'),
                'raw_result': result
            }

        except AIGenerationError as e:
            logger.error(f"Structure detection failed: {str(e)}")
            return {
                'success': False,
                'error': f'AI structure detection failed: {str(e)}'
            }

    def align_philosophy(
        self,
        structure_result: Dict,
        transformation_level: str = 'moderate',
        preserve_structure: bool = True
    ) -> Dict[str, Any]:
        """
        Stage 3: Transform content to align with Optio philosophy.

        Transforms:
        - Language (prove→explore, demonstrate→share, etc.)
        - Task descriptions (flexible, discovery-focused)
        - Assessment framing (reflection, not testing)
        - Removes grade/future-focused language

        Args:
            structure_result: Output from detect_structure()
            transformation_level: 'light', 'moderate', or 'full'
            preserve_structure: True to keep original structure

        Returns:
            Dict with philosophy-aligned content
        """
        from prompts.components import (
            CORE_PHILOSOPHY,
            LANGUAGE_GUIDELINES,
            JSON_OUTPUT_INSTRUCTIONS_STRICT
        )
        from prompts.curriculum_upload import get_alignment_prompt

        # Build input from detected structure
        structure_json = {
            'course': structure_result.get('course', {}),
            'modules': structure_result.get('modules', []),
            'lessons': structure_result.get('lessons', []),
            'tasks': structure_result.get('tasks', [])
        }

        import json
        structure_str = json.dumps(structure_json, indent=2)

        # Get the alignment prompt with specified options
        alignment_prompt = get_alignment_prompt(transformation_level, preserve_structure)

        prompt = f"""
{alignment_prompt}

{CORE_PHILOSOPHY}

{LANGUAGE_GUIDELINES}

CONTENT TO TRANSFORM:
```json
{structure_str}
```

{JSON_OUTPUT_INSTRUCTIONS_STRICT}
"""

        try:
            result = self.generate_json(prompt, strict=True)

            if not isinstance(result, dict):
                return {
                    'success': False,
                    'error': 'AI returned invalid alignment format'
                }

            # Validate content against philosophy
            validation = self._validate_philosophy_alignment(result)

            return {
                'success': True,
                'course': result.get('course', {}),
                'modules': result.get('modules', []),
                'lessons': result.get('lessons', []),
                'tasks': result.get('tasks', []),
                'transformation_notes': result.get('transformation_notes', []),
                'validation': validation,
                'raw_result': result
            }

        except AIGenerationError as e:
            logger.error(f"Philosophy alignment failed: {str(e)}")
            return {
                'success': False,
                'error': f'AI philosophy alignment failed: {str(e)}'
            }

    def generate_course_content(self, alignment_result: Dict) -> Dict[str, Any]:
        """
        Stage 4: Generate final course content in Optio format.

        Creates:
        - Quest metadata (title, description, big_idea, pillar)
        - Step-based lessons (version 2 format)

        Note: Tasks are NOT generated - users create tasks in CourseBuilder.

        Args:
            alignment_result: Output from align_philosophy()

        Returns:
            Dict with course and lessons ready for CourseBuilder
        """
        from prompts.components import (
            PILLAR_DEFINITIONS_DETAILED,
            SCHOOL_SUBJECTS,
            JSON_OUTPUT_INSTRUCTIONS_STRICT
        )
        from prompts.curriculum_upload import STEP_GENERATION_PROMPT

        import json
        aligned_content = json.dumps({
            'course': alignment_result.get('course', {}),
            'modules': alignment_result.get('modules', []),
            'lessons': alignment_result.get('lessons', []),
            'tasks': alignment_result.get('tasks', [])
        }, indent=2)

        prompt = f"""
{STEP_GENERATION_PROMPT}

{PILLAR_DEFINITIONS_DETAILED}

SCHOOL SUBJECTS FOR DIPLOMA MAPPING: {', '.join(SCHOOL_SUBJECTS)}

ALIGNED CONTENT TO FORMAT:
```json
{aligned_content}
```

{JSON_OUTPUT_INSTRUCTIONS_STRICT}
"""

        try:
            result = self.generate_json(prompt, strict=True)

            if not isinstance(result, dict):
                return {
                    'success': False,
                    'error': 'AI returned invalid content format'
                }

            # Process and validate generated content
            quest = self._process_quest(result.get('quest', result.get('course', {})))
            lessons = self._process_lessons(result.get('lessons', []))

            return {
                'success': True,
                'quest': quest,
                'lessons': lessons,
                'raw_result': result
            }

        except AIGenerationError as e:
            logger.error(f"Content generation failed: {str(e)}")
            return {
                'success': False,
                'error': f'AI content generation failed: {str(e)}'
            }

    def _imscc_to_text(self, imscc_result: Dict) -> str:
        """Convert IMSCC parse result to plain text."""
        parts = []

        course = imscc_result.get('course', {})
        if course.get('title'):
            parts.append(f"Course: {course['title']}")
        if course.get('description'):
            parts.append(f"Description: {course['description']}")

        tasks = imscc_result.get('tasks_preview', [])
        for task in tasks:
            parts.append(f"\nAssignment: {task.get('title', '')}")
            if task.get('description'):
                parts.append(task['description'])

        return '\n\n'.join(parts)

    def _imscc_to_sections(self, imscc_result: Dict) -> List[Dict]:
        """Convert IMSCC parse result to sections format."""
        sections = []

        course = imscc_result.get('course', {})
        if course.get('title') or course.get('description'):
            sections.append({
                'title': course.get('title', 'Course Overview'),
                'type': 'course',
                'content': course.get('description', ''),
                'level': 1
            })

        for module in imscc_result.get('course', {}).get('modules', []):
            sections.append({
                'title': module.get('title', 'Module'),
                'type': 'module',
                'content': '',
                'level': 1
            })

        for task in imscc_result.get('tasks_preview', []):
            sections.append({
                'title': task.get('title', 'Assignment'),
                'type': 'assignment',
                'content': task.get('description', ''),
                'level': 2,
                'xp_value': task.get('xp_value', 0)
            })

        return sections

    def _build_content_summary(self, raw_text: str, sections: List[Dict]) -> str:
        """Build a content summary for AI analysis, with length limits."""
        MAX_CHARS = 15000  # Reasonable limit for AI processing

        parts = []

        # Include section structure
        if sections:
            parts.append("DOCUMENT STRUCTURE:")
            for i, section in enumerate(sections[:30]):  # Limit sections
                indent = "  " * (section.get('level', 1) - 1)
                section_type = section.get('type', 'section')
                title = section.get('title', f'Section {i+1}')
                parts.append(f"{indent}- [{section_type}] {title}")

            parts.append("")

        # Include raw text (truncated)
        parts.append("DOCUMENT CONTENT:")
        if len(raw_text) > MAX_CHARS:
            parts.append(raw_text[:MAX_CHARS])
            parts.append(f"\n... [Truncated, {len(raw_text) - MAX_CHARS} more characters]")
        else:
            parts.append(raw_text)

        return '\n'.join(parts)

    def _validate_philosophy_alignment(self, result: Dict) -> Dict:
        """
        Score content based on Optio philosophy alignment.

        This is informational only - all content is valid.
        Content creators have freedom in their word choices.
        """
        from prompts.components import ENCOURAGED_WORDS

        notes = []
        score = 100  # Start at 100, this is a quality indicator not a pass/fail

        # Collect all text content
        def collect_text(obj):
            texts = []
            if isinstance(obj, dict):
                for v in obj.values():
                    texts.extend(collect_text(v))
            elif isinstance(obj, list):
                for item in obj:
                    texts.extend(collect_text(item))
            elif isinstance(obj, str):
                texts.append(obj)
            return texts

        all_text = ' '.join(collect_text(result)).lower()

        # Check for Optio-aligned language (bonus, not requirement)
        encouraged_count = sum(1 for word in ENCOURAGED_WORDS if word in all_text)

        if encouraged_count >= 5:
            notes.append("Strong use of process-focused, discovery language")
            score = 100
        elif encouraged_count >= 3:
            notes.append("Good use of Optio-aligned language")
            score = 90
        elif encouraged_count >= 1:
            notes.append("Some Optio-aligned language present")
            score = 80
        else:
            notes.append("Original voice preserved (no Optio language added)")
            score = 70  # Still valid, just indicates light transformation

        # Check for big_idea presence
        if result.get('course', {}).get('big_idea'):
            notes.append("Includes 'big idea' hook for student relevance")

        return {
            'score': score,
            'is_valid': True,  # All content is valid - creator freedom
            'notes': notes
        }

    def _process_quest(self, quest_data: Dict) -> Dict:
        """Process and validate quest data."""
        from prompts.components import VALID_PILLARS

        pillar = quest_data.get('pillar_primary', quest_data.get('pillar', 'stem'))
        if pillar not in VALID_PILLARS:
            pillar = 'stem'

        return {
            'title': quest_data.get('title', 'Untitled Course'),
            'description': quest_data.get('description', ''),
            'big_idea': quest_data.get('big_idea', ''),
            'pillar_primary': pillar,
            'quest_type': 'course',
            'is_active': False,  # Start as draft
            'is_public': False
        }

    def _process_lessons(self, lessons_data: List) -> List[Dict]:
        """Process and validate lessons with step-based content."""
        processed = []

        for i, lesson in enumerate(lessons_data):
            # Ensure steps are in version 2 format
            steps = lesson.get('steps', lesson.get('content', []))
            if isinstance(steps, str):
                # Convert string content to single step
                steps = [{
                    'id': f'step_{uuid.uuid4().hex[:8]}',
                    'type': 'text',
                    'title': 'Content',
                    'content': steps,
                    'order': 0
                }]
            elif isinstance(steps, list):
                # Ensure each step has required fields
                processed_steps = []
                for j, step in enumerate(steps):
                    if isinstance(step, str):
                        step = {'content': step}

                    processed_steps.append({
                        'id': step.get('id', f'step_{uuid.uuid4().hex[:8]}'),
                        'type': step.get('type', 'text'),
                        'title': step.get('title', f'Step {j+1}'),
                        'content': step.get('content', ''),
                        'order': step.get('order', j),
                        'video_url': step.get('video_url', ''),
                        'files': step.get('files', [])
                    })
                steps = processed_steps

            processed.append({
                'title': lesson.get('title', f'Lesson {i+1}'),
                'description': lesson.get('description', ''),
                'order_index': lesson.get('order', i),
                'curriculum_content': {
                    'version': 2,
                    'steps': steps
                }
            })

        return processed

    def _build_preview(self, content_result: Dict) -> Dict:
        """Build the final preview structure for CourseBuilder."""
        return {
            'course': content_result.get('quest', {}),
            'lessons': content_result.get('lessons', [])
        }
