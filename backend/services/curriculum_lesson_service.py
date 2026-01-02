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


def validate_content_blocks(content: Any) -> Dict[str, Any]:
    """
    Validate and normalize lesson content block structure.

    Supported formats:
    1. Version 2 (step-based):
       { "version": 2, "steps": [{ "id": "...", "title": "...", "content": "...", "order": 0 }] }

    2. Legacy blocks format:
       { "blocks": [{ "id": "uuid", "type": "text|iframe|document", "content": "...", "data": {...} }] }

    3. HTML string (wrapped in a single text block)

    4. None (returns empty blocks)
    """
    if content is None:
        return {"blocks": []}

    # If content is a string (HTML from rich text editor), wrap it in a text block
    if isinstance(content, str):
        if content.strip():
            return {
                "blocks": [{
                    "id": f"block_{uuid.uuid4().hex[:12]}",
                    "type": "text",
                    "content": content,
                    "data": {}
                }]
            }
        return {"blocks": []}

    if not isinstance(content, dict):
        return {"blocks": []}

    # NEW: Handle version 2 step-based format - pass through as-is
    if content.get("version") == 2 and "steps" in content:
        steps = content.get("steps", [])
        if isinstance(steps, list):
            # Validate each step has required fields
            validated_steps = []
            for i, step in enumerate(steps):
                if isinstance(step, dict):
                    step_type = step.get("type", "text")
                    # Validate step type
                    if step_type not in ["text", "video", "file"]:
                        step_type = "text"

                    validated_step = {
                        "id": step.get("id") or f"step_{uuid.uuid4().hex[:12]}",
                        "type": step_type,
                        "title": step.get("title", f"Step {i + 1}"),
                        "content": step.get("content", ""),
                        "order": step.get("order", i)
                    }

                    # Include video_url for video steps
                    if step_type == "video":
                        validated_step["video_url"] = step.get("video_url") or None

                    # Include files for file steps
                    if step_type == "file":
                        files = step.get("files")
                        if isinstance(files, list):
                            validated_step["files"] = files
                        else:
                            validated_step["files"] = []

                    # Include attachments for any step type (downloadable files)
                    attachments = step.get("attachments")
                    if isinstance(attachments, list) and len(attachments) > 0:
                        validated_step["attachments"] = attachments

                    # Include links for any step type (external URLs with display text)
                    links = step.get("links")
                    if isinstance(links, list) and len(links) > 0:
                        validated_step["links"] = links

                    validated_steps.append(validated_step)

            logger.info(f"[VALIDATE_CONTENT] Version 2 format with {len(validated_steps)} steps")
            return {"version": 2, "steps": validated_steps}
        return {"version": 2, "steps": []}

    # Legacy blocks format
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
        content: Any,
        user_id: str,
        organization_id: str,
        sequence_order: Optional[int] = None,
        is_published: bool = True,
        is_required: bool = False,
        estimated_duration_minutes: Optional[int] = None,
        prerequisite_lesson_ids: Optional[List[str]] = None,
        xp_threshold: Optional[int] = 100,  # Default 100 XP to complete lesson
        video_url: Optional[str] = None,
        files: Optional[List[Dict]] = None
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
            # Always include xp_threshold (defaults to 100)
            lesson_data['xp_threshold'] = xp_threshold if xp_threshold is not None else 100
            if video_url:
                lesson_data['video_url'] = video_url
            if files:
                lesson_data['files'] = files

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

    def get_lessons_for_organization(
        self,
        quest_id: str,
        organization_id: Optional[str],
        include_unpublished: bool = False,
        is_superadmin: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Get lessons for a quest filtered by organization.
        Users see only their organization's curriculum.
        Superadmins see all lessons.

        Args:
            quest_id: Quest ID
            organization_id: User's organization ID
            include_unpublished: Include unpublished lessons
            is_superadmin: If user is superadmin (sees all)

        Returns:
            List of lessons for the user's organization
        """
        try:
            # DEBUG: Log filtering parameters
            logger.info(f"[CURRICULUM_SERVICE] get_lessons_for_organization: quest={quest_id[:8]}..., org={organization_id}, is_superadmin={is_superadmin}")

            query = self.supabase.table('curriculum_lessons')\
                .select('*')\
                .eq('quest_id', quest_id)\
                .order('sequence_order', desc=False)

            # Filter by organization unless superadmin
            if not is_superadmin and organization_id:
                logger.info(f"[CURRICULUM_SERVICE] Filtering by organization_id={organization_id}")
                query = query.eq('organization_id', organization_id)
            else:
                logger.info(f"[CURRICULUM_SERVICE] NOT filtering by org (is_superadmin={is_superadmin}, org={organization_id})")

            if not include_unpublished:
                query = query.eq('is_published', True)

            result = query.execute()
            lessons = result.data or []

            # DEBUG: Log what was returned
            logger.info(f"[CURRICULUM_SERVICE] Found {len(lessons)} lessons")

            # Fetch linked task IDs for all lessons
            if lessons:
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
            logger.error(f"Error fetching lessons for organization: {str(e)}")
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
            from datetime import datetime

            lesson = self.get_lesson(lesson_id)
            if not lesson or lesson['quest_id'] != quest_id:
                raise ValidationError("Lesson not found or does not belong to this quest", 404)

            # Valid columns in curriculum_lessons table
            valid_columns = {
                'title', 'description', 'content', 'sequence_order',
                'is_published', 'is_required', 'estimated_duration_minutes',
                'prerequisite_lesson_ids', 'xp_threshold',
                'video_url', 'files',  # Added in migration 026
                'last_edited_by', 'last_edited_at'
            }

            # Filter updates to only include valid columns
            filtered_updates = {k: v for k, v in updates.items() if k in valid_columns}

            # Debug logging
            logger.info(f"[UPDATE_LESSON_SERVICE] Updates received: {list(updates.keys())}")
            logger.info(f"[UPDATE_LESSON_SERVICE] Filtered updates: {list(filtered_updates.keys())}")

            # Validate content blocks if content is being updated
            if 'content' in filtered_updates:
                original_content = filtered_updates['content']
                filtered_updates['content'] = validate_content_blocks(filtered_updates['content'])
                logger.info(f"[UPDATE_LESSON_SERVICE] Content validated. Original type: {type(original_content)}, Result: {str(filtered_updates['content'])[:200]}")

            filtered_updates['last_edited_by'] = user_id
            filtered_updates['last_edited_at'] = datetime.utcnow().isoformat()

            logger.info(f"[UPDATE_LESSON_SERVICE] Final update data: {list(filtered_updates.keys())}")

            result = self.supabase.table('curriculum_lessons').update(filtered_updates).eq('id', lesson_id).execute()
            logger.info(f"[UPDATE_LESSON_SERVICE] Update result: {result.data[0] if result.data else 'No data returned'}")
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

            # Phase 1: Set all to temporary negative values to avoid unique constraint conflicts
            for idx, lesson_id in enumerate(lesson_order):
                self.supabase.table('curriculum_lessons').update({
                    'sequence_order': -(idx + 1000)
                }).eq('id', lesson_id).execute()

            # Phase 2: Set to final values
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
        curriculum_context: str = None,
        focus_pillar: str = None,
        custom_prompt: str = None,
        existing_tasks_context: str = None
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
            if existing_tasks_context:
                context_parts.append(f"Note: {existing_tasks_context}")

            context_section = "\n".join(context_parts) if context_parts else ""

            # Build pillar instruction
            pillar_instruction = ""
            if focus_pillar:
                pillar_instruction = f"\nIMPORTANT: Focus primarily on the '{focus_pillar}' pillar for these tasks."

            # Build custom prompt section
            custom_section = ""
            if custom_prompt:
                custom_section = f"\nADDITIONAL REQUIREMENTS:\n{custom_prompt[:500]}\n"

            prompt = f"""You are creating educational tasks for a curriculum lesson. These tasks should help students demonstrate understanding of the lesson content while building real-world skills.

{context_section}

Lesson Content:
{lesson_content[:2000]}

Generate {num_tasks} educational tasks with these requirements:
{pillar_instruction}
{custom_section}
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

    def create_tasks_from_suggestions(
        self,
        quest_id: str,
        lesson_id: str,
        user_id: str,
        tasks: List[Dict[str, Any]],
        link_to_lesson: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Create quest tasks from AI-generated suggestions.

        Handles:
        - Getting or creating user_quest enrollment
        - Validating task data (pillars, XP values)
        - Creating tasks in user_quest_tasks table
        - Optionally linking tasks to the lesson

        Args:
            quest_id: Quest ID
            lesson_id: Lesson ID to link tasks to
            user_id: User ID creating the tasks
            tasks: List of task objects with title, description, pillar, xp_value
            link_to_lesson: Whether to link created tasks to the lesson

        Returns:
            List of created task records

        Raises:
            ValidationError: If validation fails
        """
        from datetime import datetime

        try:
            if not tasks:
                raise ValidationError("At least one task is required", 400)

            # Get or create user_quest enrollment for the creating user
            enrollment = self.supabase.table('user_quests')\
                .select('id')\
                .eq('user_id', user_id)\
                .eq('quest_id', quest_id)\
                .eq('is_active', True)\
                .execute()

            if enrollment.data:
                user_quest_id = enrollment.data[0]['id']
            else:
                # Create enrollment for the user
                new_enrollment = self.supabase.table('user_quests').insert({
                    'user_id': user_id,
                    'quest_id': quest_id,
                    'started_at': datetime.utcnow().isoformat(),
                    'is_active': True,
                    'personalization_completed': True
                }).execute()

                if not new_enrollment.data:
                    raise ValidationError("Failed to create quest enrollment", 500)
                user_quest_id = new_enrollment.data[0]['id']

            # Get current max order_index for quest tasks
            existing_tasks = self.supabase.table('user_quest_tasks')\
                .select('order_index')\
                .eq('quest_id', quest_id)\
                .order('order_index', desc=True)\
                .limit(1)\
                .execute()
            max_order = existing_tasks.data[0]['order_index'] if existing_tasks.data else 0

            created_tasks = []
            valid_pillars = ['stem', 'wellness', 'communication', 'civics', 'art']

            for i, task in enumerate(tasks):
                title = task.get('title')
                if not title:
                    continue

                pillar = task.get('pillar', 'stem').lower()
                if pillar not in valid_pillars:
                    pillar = 'stem'

                xp_value = task.get('xp_value', 100)
                xp_value = max(50, min(300, int(xp_value)))

                # Build task data with only columns that exist in user_quest_tasks
                task_data = {
                    'user_id': user_id,
                    'quest_id': quest_id,
                    'user_quest_id': user_quest_id,
                    'title': title,
                    'description': task.get('description', ''),
                    'pillar': pillar,
                    'xp_value': xp_value,
                    'order_index': max_order + i + 1,
                    'is_required': False,
                    'is_manual': False,
                    'approval_status': 'approved'
                }

                result = self.supabase.table('user_quest_tasks').insert(task_data).execute()

                if result.data:
                    created_task = result.data[0]
                    created_tasks.append(created_task)

                    # Link to lesson if requested
                    if link_to_lesson:
                        try:
                            self.link_task_to_lesson(lesson_id, created_task['id'], quest_id)
                        except Exception as link_err:
                            logger.warning(f"Failed to link task to lesson: {link_err}")

            logger.info(f"Created {len(created_tasks)} curriculum tasks for quest {quest_id[:8]}")
            return created_tasks

        except ValidationError:
            raise
        except Exception as e:
            logger.error(f"Error creating curriculum tasks: {str(e)}", exc_info=True)
            raise ValidationError(f"Failed to create tasks: {str(e)}", 500)
