"""
Curriculum lesson service for managing quest curriculum lessons and progress.

Handles lesson CRUD operations, progress tracking, search, and AI task generation.
"""

from services.base_service import BaseService
from typing import Dict, List, Optional, Any
from utils.logger import get_logger
from middleware.error_handler import ValidationError
import os
import uuid
import google.generativeai as genai

logger = get_logger(__name__)


def validate_content_blocks(content: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate and normalize lesson content block structure.

    Expected format:
    {
        "blocks": [
            { "id": "uuid", "type": "text|iframe|document", "content": "...", "data": {...} }
        ]
    }
    """
    if content is None:
        return {"blocks": []}

    if not isinstance(content, dict):
        return {"blocks": []}

    blocks = content.get("blocks", [])

    if not isinstance(blocks, list):
        # If content has old format (markdown + embeds), convert to blocks
        if "markdown" in content or "embeds" in content:
            new_blocks = []

            # Convert markdown to text block
            if content.get("markdown"):
                new_blocks.append({
                    "id": f"block_{uuid.uuid4().hex[:12]}",
                    "type": "text",
                    "content": content["markdown"],
                    "data": {}
                })

            # Convert embeds to iframe blocks
            for embed in content.get("embeds", []):
                new_blocks.append({
                    "id": embed.get("id", f"block_{uuid.uuid4().hex[:12]}"),
                    "type": "iframe",
                    "content": embed.get("url", ""),
                    "data": {
                        "title": embed.get("title", ""),
                        "originalUrl": embed.get("originalUrl", embed.get("url", ""))
                    }
                })

            return {"blocks": new_blocks}

        return {"blocks": []}

    # Validate each block
    validated_blocks = []
    for block in blocks:
        if not isinstance(block, dict):
            continue

        # Ensure required fields
        block_id = block.get("id") or f"block_{uuid.uuid4().hex[:12]}"
        block_type = block.get("type", "text")
        block_content = block.get("content", "")
        block_data = block.get("data", {})

        # Validate type - allow all supported block types
        valid_types = ["text", "iframe", "document", "image", "callout", "divider"]
        if block_type not in valid_types:
            block_type = "text"

        validated_blocks.append({
            "id": block_id,
            "type": block_type,
            "content": block_content,
            "data": block_data if isinstance(block_data, dict) else {}
        })

    return {"blocks": validated_blocks}


class CurriculumLessonService(BaseService):
    """Manages quest curriculum lessons and student progress."""

    def __init__(self, supabase=None):
        """Initialize the service."""
        super().__init__()
        self.supabase = supabase

        # AI configuration for task generation
        self.api_key = os.getenv('GOOGLE_API_KEY') or os.getenv('GEMINI_API_KEY')
        self.model_name = os.getenv('GEMINI_MODEL', 'gemini-2.5-flash-lite')

        if self.api_key:
            genai.configure(api_key=self.api_key)
            self.model = genai.GenerativeModel(self.model_name)
        else:
            self.model = None
            logger.warning("AI model not configured - task generation will be unavailable")

    def create_lesson(
        self,
        quest_id: str,
        title: str,
        description: str,
        content: Dict[str, Any],
        user_id: str,
        organization_id: str,
        sequence_order: Optional[int] = None,
        is_published: bool = True,
        is_required: bool = False,
        estimated_duration_minutes: Optional[int] = None,
        prerequisite_lesson_ids: Optional[List[str]] = None,
        xp_threshold: Optional[int] = None
    ) -> Dict[str, Any]:
        """Create a new curriculum lesson."""
        try:
            if sequence_order is None:
                max_order = self.supabase.table('curriculum_lessons')\
                    .select('sequence_order')\
                    .eq('quest_id', quest_id)\
                    .order('sequence_order', desc=True)\
                    .limit(1)\
                    .execute()
                sequence_order = (max_order.data[0]['sequence_order'] + 1) if max_order.data else 1

            # Validate and normalize content blocks
            validated_content = validate_content_blocks(content)

            lesson_data = {
                'quest_id': quest_id,
                'title': title,
                'description': description,
                'content': validated_content,
                'sequence_order': sequence_order,
                'is_published': is_published,
                'is_required': is_required,
                'created_by': user_id,
                'organization_id': organization_id
            }

            if estimated_duration_minutes is not None:
                lesson_data['estimated_duration_minutes'] = estimated_duration_minutes
            if prerequisite_lesson_ids:
                lesson_data['prerequisite_lesson_ids'] = prerequisite_lesson_ids
            if xp_threshold is not None:
                lesson_data['xp_threshold'] = xp_threshold

            result = self.supabase.table('curriculum_lessons').insert(lesson_data).execute()
            logger.info(f"Created lesson '{title}' for quest {quest_id}")
            return result.data[0] if result.data else {}
        except Exception as e:
            logger.error(f"Error creating lesson: {str(e)}")
            raise

    def get_lessons(self, quest_id: str, include_unpublished: bool = False) -> List[Dict[str, Any]]:
        """Get all lessons for a quest with their linked task IDs."""
        try:
            query = self.supabase.table('curriculum_lessons').select('*').eq('quest_id', quest_id).order('sequence_order', desc=False)
            if not include_unpublished:
                query = query.eq('is_published', True)
            result = query.execute()
            lessons = result.data or []

            # Fetch linked task IDs for all lessons in this quest
            if lessons:
                lesson_ids = [lesson['id'] for lesson in lessons]
                links_result = self.supabase.table('curriculum_lesson_tasks')\
                    .select('lesson_id, task_id')\
                    .eq('quest_id', quest_id)\
                    .execute()

                # Build a mapping of lesson_id -> list of task_ids
                lesson_tasks_map = {}
                for link in (links_result.data or []):
                    lesson_id = link['lesson_id']
                    if lesson_id not in lesson_tasks_map:
                        lesson_tasks_map[lesson_id] = []
                    lesson_tasks_map[lesson_id].append(link['task_id'])

                # Add linked_task_ids to each lesson
                for lesson in lessons:
                    lesson['linked_task_ids'] = lesson_tasks_map.get(lesson['id'], [])

            return lessons
        except Exception as e:
            logger.error(f"Error fetching lessons: {str(e)}")
            raise

    def get_lesson(self, lesson_id: str) -> Optional[Dict[str, Any]]:
        """Get a single lesson by ID."""
        try:
            result = self.supabase.table('curriculum_lessons').select('*').eq('id', lesson_id).execute()
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"Error fetching lesson: {str(e)}")
            raise

    def update_lesson(self, lesson_id: str, quest_id: str, user_id: str, **updates) -> Dict[str, Any]:
        """Update a curriculum lesson."""
        try:
            lesson = self.get_lesson(lesson_id)
            if not lesson or lesson['quest_id'] != quest_id:
                raise ValidationError("Lesson not found or does not belong to this quest", 404)

            # Validate content blocks if content is being updated
            if 'content' in updates:
                updates['content'] = validate_content_blocks(updates['content'])

            updates['last_edited_by'] = user_id
            updates['last_edited_at'] = 'now()'
            result = self.supabase.table('curriculum_lessons').update(updates).eq('id', lesson_id).execute()
            logger.info(f"Updated lesson {lesson_id}")
            return result.data[0] if result.data else {}
        except ValidationError:
            raise
        except Exception as e:
            logger.error(f"Error updating lesson: {str(e)}")
            raise

    def delete_lesson(self, lesson_id: str, quest_id: str) -> bool:
        """Delete a curriculum lesson."""
        try:
            lesson = self.get_lesson(lesson_id)
            if not lesson or lesson['quest_id'] != quest_id:
                raise ValidationError("Lesson not found or does not belong to this quest", 404)
            self.supabase.table('curriculum_lessons').delete().eq('id', lesson_id).execute()
            logger.info(f"Deleted lesson {lesson_id}")
            return True
        except ValidationError:
            raise
        except Exception as e:
            logger.error(f"Error deleting lesson: {str(e)}")
            raise

    def reorder_lessons(self, quest_id: str, lesson_order: List[str]) -> List[Dict[str, Any]]:
        """Reorder lessons within a quest."""
        try:
            lessons = self.get_lessons(quest_id, include_unpublished=True)
            lesson_ids = {lesson['id'] for lesson in lessons}
            if set(lesson_order) != lesson_ids:
                raise ValidationError("Lesson IDs don't match quest lessons", 400)

            updated_lessons = []
            for index, lesson_id in enumerate(lesson_order, start=1):
                result = self.supabase.table('curriculum_lessons').update({'sequence_order': index}).eq('id', lesson_id).execute()
                if result.data:
                    updated_lessons.append(result.data[0])

            logger.info(f"Reordered {len(updated_lessons)} lessons for quest {quest_id}")
            return updated_lessons
        except ValidationError:
            raise
        except Exception as e:
            logger.error(f"Error reordering lessons: {str(e)}")
            raise

    def get_lesson_progress(self, user_id: str, quest_id: str) -> List[Dict[str, Any]]:
        """Get user's progress for all lessons in a quest."""
        try:
            result = self.supabase.table('curriculum_lesson_progress').select('*').eq('user_id', user_id).eq('quest_id', quest_id).execute()
            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching lesson progress: {str(e)}")
            raise

    def update_lesson_progress(
        self,
        user_id: str,
        lesson_id: str,
        quest_id: str,
        organization_id: str,
        status: Optional[str] = None,
        progress_percentage: Optional[int] = None,
        time_spent_seconds: Optional[int] = None,
        last_position: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Update or create user progress for a lesson."""
        try:
            existing = self.supabase.table('curriculum_lesson_progress').select('id').eq('user_id', user_id).eq('lesson_id', lesson_id).execute()
            progress_data = {}

            if status is not None:
                progress_data['status'] = status
                if status == 'in_progress' and not existing.data:
                    progress_data['started_at'] = 'now()'
                elif status == 'completed':
                    progress_data['completed_at'] = 'now()'
                    progress_data['progress_percentage'] = 100

            if progress_percentage is not None:
                progress_data['progress_percentage'] = progress_percentage
            if time_spent_seconds is not None:
                progress_data['time_spent_seconds'] = time_spent_seconds
            if last_position is not None:
                progress_data['last_position'] = last_position

            if existing.data:
                result = self.supabase.table('curriculum_lesson_progress').update(progress_data).eq('user_id', user_id).eq('lesson_id', lesson_id).execute()
            else:
                progress_data.update({
                    'user_id': user_id,
                    'lesson_id': lesson_id,
                    'quest_id': quest_id,
                    'organization_id': organization_id
                })
                result = self.supabase.table('curriculum_lesson_progress').insert(progress_data).execute()

            return result.data[0] if result.data else {}
        except Exception as e:
            logger.error(f"Error updating lesson progress: {str(e)}")
            raise

    def search_lessons(self, quest_id: str, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        """Search lessons using full-text search."""
        try:
            result = self.supabase.rpc('search_curriculum_lessons', {'p_quest_id': quest_id, 'p_query': query, 'p_limit': limit}).execute()
            return result.data or []
        except Exception as e:
            logger.warning(f"Full-text search failed, using fallback: {str(e)}")
            result = self.supabase.table('curriculum_lessons').select('*').eq('quest_id', quest_id).eq('is_published', True).ilike('title', f'%{query}%').limit(limit).execute()
            return result.data or []

    def generate_ai_tasks(
        self,
        lesson_id: str,
        lesson_content: str,
        num_tasks: int = 5,
        lesson_title: str = None,
        quest_title: str = None,
        quest_description: str = None,
        curriculum_context: str = None
    ) -> List[Dict[str, Any]]:
        """Generate task suggestions from lesson content using AI with full curriculum context."""
        if not self.model:
            raise ValidationError("AI task generation not available - API key not configured", 503)

        try:
            # Build context sections
            context_parts = []
            if quest_title:
                context_parts.append(f"Quest: {quest_title}")
            if quest_description:
                context_parts.append(f"Quest Description: {quest_description[:500]}")
            if lesson_title:
                context_parts.append(f"Lesson: {lesson_title}")
            if curriculum_context:
                context_parts.append(f"Curriculum Overview: {curriculum_context[:500]}")

            context_section = "\n".join(context_parts) if context_parts else ""

            prompt = f"""You are creating educational tasks for a curriculum lesson. These tasks should help students demonstrate understanding of the lesson content while building real-world skills.

{context_section}

Lesson Content:
{lesson_content[:2000]}

Generate {num_tasks} educational tasks with these requirements:

TASK DESIGN PRINCIPLES:
- Tasks should directly connect to the lesson content
- Focus on real-world application and skill demonstration
- Allow flexibility in how students show their work
- Progress from foundational to advanced understanding
- Be achievable independently by students

For each task, provide these fields:
- title: Action-oriented title using verbs like Create, Research, Design, Analyze, Build, Write, Explore (5-8 words max)
- description: Clear explanation (2-3 sentences) of what the student should do
- pillar: One of: stem, wellness, communication, civics, art - choose the best fit for the task
- xp_value: XP points (50-200) based on complexity and time required
- evidence_prompt: How students can demonstrate completion - offer multiple formats (written work, video, presentation, project, etc.)

STYLE GUIDELINES:
- Use simple, direct, actionable language
- No motivational hype or flowery language
- Be specific about what students should create or demonstrate
- Evidence prompts should be flexible: "Show your work through a written summary, video, diagram, project, or format of your choice"

Return ONLY a valid JSON array with these exact field names. No markdown, no code blocks, no extra text."""

            response = self.model.generate_content(prompt)
            import json
            import re
            response_text = response.text.strip()
            json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
            tasks = json.loads(json_match.group(0) if json_match else response_text)

            # Normalize and validate tasks
            validated_tasks = []
            valid_pillars = ['stem', 'wellness', 'communication', 'civics', 'art']
            for task in tasks[:num_tasks]:
                pillar = task.get('pillar', 'stem').lower()
                if pillar not in valid_pillars:
                    pillar = 'stem'

                xp = task.get('xp_value') or task.get('estimated_xp') or 100
                xp = max(50, min(200, int(xp)))

                validated_tasks.append({
                    'title': task.get('title', 'Complete Task'),
                    'description': task.get('description', ''),
                    'pillar': pillar,
                    'xp_value': xp,
                    'evidence_prompt': task.get('evidence_prompt', 'Show your work through writing, video, or another format of your choice.')
                })

            logger.info(f"Generated {len(validated_tasks)} AI tasks for lesson {lesson_id}")
            return validated_tasks
        except Exception as e:
            logger.error(f"Error generating AI tasks: {str(e)}")
            raise ValidationError(f"AI task generation failed: {str(e)}", 500)

    def link_task_to_lesson(self, lesson_id: str, task_id: str, quest_id: str) -> Dict[str, Any]:
        """Link an existing quest task to a lesson."""
        try:
            lesson = self.get_lesson(lesson_id)
            if not lesson or lesson['quest_id'] != quest_id:
                raise ValidationError("Lesson not found or does not belong to this quest", 404)

            # Check if task exists (just check by ID, not quest - tasks may have different quest_ids)
            task = self.supabase.table('user_quest_tasks').select('id, quest_id').eq('id', task_id).execute()
            if not task.data:
                raise ValidationError("Task not found", 404)

            # Check if already linked
            existing = self.supabase.table('curriculum_lesson_tasks')\
                .select('id')\
                .eq('lesson_id', lesson_id)\
                .eq('task_id', task_id)\
                .execute()

            if existing.data:
                # Already linked, return existing link
                logger.info(f"Task {task_id} already linked to lesson {lesson_id}")
                return existing.data[0]

            # Get the next display order
            max_order = self.supabase.table('curriculum_lesson_tasks')\
                .select('display_order')\
                .eq('lesson_id', lesson_id)\
                .order('display_order', desc=True)\
                .limit(1)\
                .execute()
            next_order = (max_order.data[0]['display_order'] + 1) if max_order.data else 0

            result = self.supabase.table('curriculum_lesson_tasks').insert({
                'lesson_id': lesson_id,
                'task_id': task_id,
                'quest_id': quest_id,
                'display_order': next_order
            }).execute()

            logger.info(f"Linked task {task_id} to lesson {lesson_id}")
            return result.data[0] if result.data else {}
        except ValidationError:
            raise
        except Exception as e:
            logger.error(f"Error linking task to lesson: {str(e)}", exc_info=True)
            raise ValidationError(f"Failed to link task: {str(e)}", 500)

    def unlink_task_from_lesson(self, lesson_id: str, task_id: str) -> bool:
        """Unlink a task from a lesson."""
        try:
            self.supabase.table('curriculum_lesson_tasks').delete().eq('lesson_id', lesson_id).eq('task_id', task_id).execute()
            logger.info(f"Unlinked task {task_id} from lesson {lesson_id}")
            return True
        except Exception as e:
            logger.error(f"Error unlinking task from lesson: {str(e)}")
            raise
