"""
Curriculum AI Transformation Service

Handles AI-powered curriculum analysis and transformation:
- detect_structure(): Identify curriculum structure from parsed content
- align_philosophy(): Transform content to Optio philosophy
- generate_course_content(): Generate final course format
- process_generation(): From-scratch course generation
"""

import json
import uuid
from typing import Dict, List, Optional, Any

from services.base_ai_service import BaseAIService, AIGenerationError
from utils.logger import get_logger

logger = get_logger(__name__)


class CurriculumAIService(BaseAIService):
    """
    AI-powered curriculum transformation service.

    Handles the AI stages of the curriculum pipeline:
    - Stage 2: Structure detection
    - Stage 3: Philosophy alignment
    - Stage 4: Content generation

    Uses gemini-2.5-pro for better reasoning on complex curriculum tasks.
    """

    CURRICULUM_MODEL = 'gemini-2.5-pro'

    def __init__(self):
        """Initialize with advanced AI model for curriculum processing."""
        super().__init__(model_override=self.CURRICULUM_MODEL)
        logger.info(f"CurriculumAIService using model: {self.model_name}")

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

        raw_text = parse_result.get('raw_text', '')
        sections = parse_result.get('sections', [])

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
        - Language (prove->explore, demonstrate->share, etc.)
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

        structure_json = {
            'course': structure_result.get('course', {}),
            'modules': structure_result.get('modules', []),
            'lessons': structure_result.get('lessons', []),
            'tasks': structure_result.get('tasks', [])
        }

        structure_str = json.dumps(structure_json, indent=2)
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

    def generate_course_content(
        self,
        alignment_result: Dict,
        learning_objectives: List[str] = None
    ) -> Dict[str, Any]:
        """
        Stage 4: Generate final course content in Optio format.

        Creates:
        - Course metadata (title, description)
        - Projects (standalone Quests) - one per learning objective if provided
        - Step-based lessons for each Project (version 2 format)

        Note: Tasks are NOT generated - educators add tasks in CourseBuilder.

        Args:
            alignment_result: Output from align_philosophy()
            learning_objectives: Optional list of user-provided learning objectives.
                                 If provided, creates one project per objective.

        Returns:
            Dict with course and projects ready for CourseBuilder
        """
        from prompts.components import (
            PILLAR_DEFINITIONS_DETAILED,
            SCHOOL_SUBJECTS,
            JSON_OUTPUT_INSTRUCTIONS_STRICT
        )
        from prompts.curriculum_upload import STEP_GENERATION_PROMPT

        aligned_content = json.dumps({
            'course': alignment_result.get('course', {}),
            'modules': alignment_result.get('modules', []),
            'lessons': alignment_result.get('lessons', []),
            'tasks': alignment_result.get('tasks', [])
        }, indent=2)

        objectives_section = self._build_objectives_section(learning_objectives)

        prompt = f"""
{STEP_GENERATION_PROMPT}

{objectives_section}

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

            logger.info(f"AI returned {len(result.get('projects', []))} projects")

            course = self._process_course(result.get('course', {}))
            projects = self._process_projects(result.get('projects', []))

            logger.info(f"Processed {len(projects)} projects")

            return {
                'success': True,
                'course': course,
                'projects': projects,
                'raw_result': result
            }

        except AIGenerationError as e:
            logger.error(f"Content generation failed: {str(e)}")
            return {
                'success': False,
                'error': f'AI content generation failed: {str(e)}'
            }

    def generate_from_topic(
        self,
        topic: str,
        learning_objectives: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Generate a complete course from scratch based on topic.

        This bypasses the normal 4-stage pipeline since there's no source
        curriculum to parse, structure, or align.

        Args:
            topic: The course topic/name
            learning_objectives: Optional list of learning objectives

        Returns:
            Dict with course and projects
        """
        from prompts.components import (
            PILLAR_DEFINITIONS_DETAILED,
            SCHOOL_SUBJECTS,
            JSON_OUTPUT_INSTRUCTIONS_STRICT
        )
        from prompts.curriculum_upload import COURSE_GENERATION_PROMPT

        objectives_section = self._build_objectives_section(
            learning_objectives,
            for_generation=True
        )

        prompt = f"""
{COURSE_GENERATION_PROMPT}

COURSE TOPIC: {topic}

{objectives_section}

{PILLAR_DEFINITIONS_DETAILED}

SCHOOL SUBJECTS FOR DIPLOMA MAPPING: {', '.join(SCHOOL_SUBJECTS)}

{JSON_OUTPUT_INSTRUCTIONS_STRICT}
"""

        try:
            result = self.generate_json(prompt, strict=True)

            if not isinstance(result, dict):
                return {
                    'success': False,
                    'error': 'AI returned invalid format'
                }

            course = self._process_course(
                result.get('course', {'title': topic, 'description': f'A course about {topic}'})
            )
            projects = self._process_projects(result.get('projects', []))

            logger.info(f"Generated {len(projects)} projects for topic: {topic}")

            return {
                'success': True,
                'course': course,
                'projects': projects,
                'raw_result': result
            }

        except AIGenerationError as e:
            logger.error(f"Course generation failed: {str(e)}")
            return {
                'success': False,
                'error': f'AI generation failed: {str(e)}'
            }

    # =========================================================================
    # Helper Methods
    # =========================================================================

    def _build_content_summary(self, raw_text: str, sections: List[Dict]) -> str:
        """Build a content summary for AI analysis, with length limits."""
        MAX_CHARS = 15000

        parts = []

        if sections:
            parts.append("DOCUMENT STRUCTURE:")
            for i, section in enumerate(sections[:30]):
                indent = "  " * (section.get('level', 1) - 1)
                section_type = section.get('type', 'section')
                title = section.get('title', f'Section {i+1}')
                parts.append(f"{indent}- [{section_type}] {title}")
            parts.append("")

        parts.append("DOCUMENT CONTENT:")
        if len(raw_text) > MAX_CHARS:
            parts.append(raw_text[:MAX_CHARS])
            parts.append(f"\n... [Truncated, {len(raw_text) - MAX_CHARS} more characters]")
        else:
            parts.append(raw_text)

        return '\n'.join(parts)

    def _build_objectives_section(
        self,
        learning_objectives: Optional[List[str]],
        for_generation: bool = False
    ) -> str:
        """Build the learning objectives section for prompts."""
        if learning_objectives and len(learning_objectives) > 0:
            objectives_list = "\n".join([
                f"  {i+1}. {obj}"
                for i, obj in enumerate(learning_objectives)
            ])
            return f"""
USER-PROVIDED LEARNING OBJECTIVES:
==================================
The user has specified exactly {len(learning_objectives)} learning objectives.
Create EXACTLY {len(learning_objectives)} projects - one for each objective below:

{objectives_list}

CRITICAL REQUIREMENTS:
1. You MUST create exactly {len(learning_objectives)} projects (one per objective)
2. Each project's source_objective field should contain the corresponding objective text
3. Transform each objective into an Optio-style quest title that EMBODIES its intent:
   - Identify the core action/skill in the objective
   - Convert to action verb + specific, tangible outcome
   - The quest title should capture the objective's INTENT (not just rephrase it)
4. Completing each project should demonstrate mastery of that learning objective
"""
        elif for_generation:
            return """
NO LEARNING OBJECTIVES PROVIDED:
================================
Generate 4-6 appropriate learning objectives for this topic.
Create ONE project per generated objective.
Include the generated objectives in the "generated_objectives" field.
"""
        else:
            return """
NO LEARNING OBJECTIVES PROVIDED:
================================
Create 4-8 projects based on Optio's instructional design philosophy.

Apply "The Process Is The Goal" approach:
- Analyze content for natural project boundaries based on skills/knowledge areas
- Each project should result in a tangible creation (artifact, performance, deliverable)
- Name projects with action verbs + specific outcomes that make students WANT to start
- Projects should work as standalone quests in the public library
- Do NOT create projects named after modules (e.g., "Module 1: Basics")

Leave source_objective as null for all projects.
"""

    def _validate_philosophy_alignment(self, result: Dict) -> Dict:
        """
        Score content based on Optio philosophy alignment.

        This is informational only - all content is valid.
        Content creators have freedom in their word choices.
        """
        from prompts.components import ENCOURAGED_WORDS

        notes = []
        score = 100

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
            score = 70

        if result.get('course', {}).get('big_idea'):
            notes.append("Includes 'big idea' hook for student relevance")

        return {
            'score': score,
            'is_valid': True,
            'notes': notes
        }

    def _process_course(self, course_data: Dict) -> Dict:
        """Process and validate course data."""
        description = self._clean_course_description(course_data.get('description', ''))

        return {
            'title': course_data.get('title', 'Untitled Course'),
            'description': description,
            'status': 'draft',
            'visibility': 'organization',
            'navigation_mode': 'sequential'
        }

    def _clean_course_description(self, description: str) -> str:
        """
        Auto-clean course descriptions to remove teacher-voice content.

        Removes:
        - Greetings and welcomes
        - First-person teacher language
        - Instructor-focused content

        Converts to neutral 3rd-party description of course content.
        """
        import re

        if not description:
            return description

        original = description

        greeting_patterns = [
            r'^Welcome\s+to\s+[^.!]*[.!]\s*',
            r'^Hello\s+(students|class|everyone)[^.!]*[.!]\s*',
            r'^Hi\s+(there|everyone|class)[^.!]*[.!]\s*',
            r'^Greetings[^.!]*[.!]\s*',
            r'^Hey\s+(there|everyone)[^.!]*[.!]\s*',
        ]

        for pattern in greeting_patterns:
            description = re.sub(pattern, '', description, flags=re.IGNORECASE)

        teacher_sentence_patterns = [
            r"I'm\s+(so\s+)?excited\s+to\s+(be\s+)?teach(ing)?\s+[^.!?]*[.!?]\s*",
            r"I\s+can't\s+wait\s+to\s+[^.!?]*[.!?]\s*",
            r"I\s+look\s+forward\s+to\s+[^.!?]*[.!?]\s*",
            r"I\s+hope\s+you\s+(will\s+)?[^.!?]*[.!?]\s*",
            r"I\s+will\s+be\s+your\s+[^.!?]*[.!?]\s*",
            r"I\s+am\s+your\s+[^.!?]*[.!?]\s*",
            r"I\s+have\s+been\s+teaching\s+[^.!?]*[.!?]\s*",
            r"I\s+expect\s+(you|students)\s+[^.!?]*[.!?]\s*",
        ]

        for pattern in teacher_sentence_patterns:
            description = re.sub(pattern, '', description, flags=re.IGNORECASE)

        description = re.sub(r'\.\s+I\s+will\s+', '. The course will ', description, flags=re.IGNORECASE)
        description = re.sub(r'\.\s+I\s+am\s+', '. This course is ', description, flags=re.IGNORECASE)

        description = re.sub(r'\s+', ' ', description)
        description = re.sub(r'\.+', '.', description)
        description = description.strip()

        if description and description[0].islower():
            description = description[0].upper() + description[1:]

        if description != original:
            logger.debug("Auto-cleaned course description: removed teacher-voice content")

        return description

    def _clean_quest_description(self, description: str) -> str:
        """
        Auto-clean quest descriptions to remove project/course references.
        Quests must work standalone in the public library without course context.
        """
        import re

        if not description:
            return description

        original = description

        description = re.sub(r'^In this project,?\s*', '', description, flags=re.IGNORECASE)
        description = re.sub(r'(^|\.\s*)This project\s+', r'\1', description, flags=re.IGNORECASE)
        description = re.sub(r'\bthis project\b', 'this quest', description, flags=re.IGNORECASE)

        description = re.sub(r'\b(in|for|as part of|throughout) this course\b', '', description, flags=re.IGNORECASE)
        description = re.sub(r'\bthis course\b', '', description, flags=re.IGNORECASE)
        description = re.sub(r'\bthe course\b', '', description, flags=re.IGNORECASE)

        description = re.sub(r'\s+', ' ', description).strip()
        description = re.sub(r'^\s*([a-z])', lambda m: m.group(1).upper(), description)

        if description != original:
            logger.debug("Auto-cleaned quest description: removed project/course references")

        return description

    def _process_projects(self, projects_data: List) -> List[Dict]:
        """Process and validate projects (quests) with their lessons."""
        processed = []

        for i, project in enumerate(projects_data):
            lessons = self._process_lessons(project.get('lessons', []))

            cleaned_description = self._clean_quest_description(project.get('description', ''))
            cleaned_big_idea = self._clean_quest_description(project.get('big_idea', ''))
            unified_description = cleaned_description or cleaned_big_idea

            processed.append({
                'title': project.get('title', f'Project {i+1}'),
                'description': unified_description,
                'big_idea': unified_description,
                'order': project.get('order', i),
                'quest_type': 'optio',
                'is_active': False,
                'is_public': False,
                'lessons': lessons
            })

        return processed

    def _process_lessons(self, lessons_data: List) -> List[Dict]:
        """Process and validate lessons with step-based content."""
        processed = []

        for i, lesson in enumerate(lessons_data):
            steps = lesson.get('steps', lesson.get('content', []))

            if isinstance(steps, str):
                steps = [{
                    'id': f'step_{uuid.uuid4().hex[:8]}',
                    'type': 'text',
                    'title': 'Content',
                    'content': steps,
                    'order': 0
                }]
            elif isinstance(steps, list):
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
