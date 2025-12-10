"""
Task Library Sanitization Service
Automatically cleans up the task library by deduplicating, generalizing,
and removing low-quality tasks using AI.
"""

import os
import json
from typing import Dict, List, Optional
import google.generativeai as genai

from services.base_service import BaseService
from utils.logger import get_logger

logger = get_logger(__name__)


class TaskLibrarySanitizationService(BaseService):
    """Service for AI-powered task library sanitization"""

    def __init__(self, user_id: Optional[str] = None):
        """Initialize the sanitization service with Gemini configuration"""
        super().__init__(user_id)
        self.api_key = os.getenv('GOOGLE_API_KEY') or os.getenv('GEMINI_API_KEY')
        self.model_name = os.getenv('GEMINI_MODEL', 'gemini-2.5-flash-lite')

        if not self.api_key:
            raise ValueError("GOOGLE_API_KEY not configured. Set GEMINI_API_KEY environment variable.")

        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel(self.model_name)

    def sanitize_quest_tasks(self, quest_id: str, new_tasks: List[Dict]) -> Dict:
        """
        Sanitize the task library for a specific quest by combining existing and new tasks,
        then using AI to deduplicate, generalize, and filter low-quality tasks.

        Args:
            quest_id: The quest ID to sanitize tasks for
            new_tasks: List of newly created tasks to add to the library

        Returns:
            Dict containing sanitized tasks and statistics
        """
        try:
            logger.info(f"Starting task library sanitization for quest {quest_id}")

            # 1. Fetch existing library tasks for this quest
            existing_response = self.supabase.table('quest_sample_tasks') \
                .select('id, title, description, pillar, xp_value, diploma_subjects, usage_count, is_flagged') \
                .eq('quest_id', quest_id) \
                .eq('is_flagged', False) \
                .execute()

            existing_tasks = existing_response.data if existing_response.data else []
            logger.info(f"Found {len(existing_tasks)} existing tasks in library")

            # 2. Combine existing and new tasks
            all_tasks = existing_tasks + new_tasks

            if len(all_tasks) == 0:
                logger.info("No tasks to sanitize")
                return {
                    'success': True,
                    'sanitized_tasks': [],
                    'removed_count': 0,
                    'deduplicated_count': 0,
                    'generalized_count': 0
                }

            logger.info(f"Total tasks to sanitize: {len(all_tasks)} ({len(existing_tasks)} existing + {len(new_tasks)} new)")

            # 3. Call AI to sanitize
            sanitized_tasks = self._call_ai_sanitization(quest_id, all_tasks)

            # 4. Calculate statistics
            stats = self._calculate_sanitization_stats(
                existing_tasks,
                new_tasks,
                sanitized_tasks
            )

            # 5. Update database with sanitized tasks
            self._update_library_tasks(quest_id, existing_tasks, sanitized_tasks)

            logger.info(f"Sanitization complete: {stats['removed_count']} removed, "
                       f"{stats['deduplicated_count']} deduplicated, "
                       f"{stats['generalized_count']} generalized")

            return {
                'success': True,
                'sanitized_tasks': sanitized_tasks,
                **stats
            }

        except Exception as e:
            logger.error(f"Error sanitizing task library: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'sanitized_tasks': [],
                'removed_count': 0,
                'deduplicated_count': 0,
                'generalized_count': 0
            }

    def _call_ai_sanitization(self, quest_id: str, all_tasks: List[Dict]) -> List[Dict]:
        """
        Call Gemini AI to sanitize the task list

        Args:
            quest_id: The quest ID for context
            all_tasks: Combined list of existing and new tasks

        Returns:
            List of sanitized tasks
        """
        try:
            # Get quest context for better AI understanding
            quest_response = self.supabase.table('quests') \
                .select('title, big_idea') \
                .eq('id', quest_id) \
                .single() \
                .execute()

            quest_title = quest_response.data.get('title', 'Unknown Quest') if quest_response.data else 'Unknown Quest'
            quest_big_idea = quest_response.data.get('big_idea', '') if quest_response.data else ''

            # Build prompt
            prompt = self._build_sanitization_prompt(quest_title, quest_big_idea, all_tasks)

            # Call Gemini
            logger.info(f"Calling Gemini AI for task sanitization ({len(all_tasks)} tasks)")
            response = self.model.generate_content(prompt)

            if not response or not response.text:
                raise Exception("Empty response from Gemini API")

            # Parse the sanitized tasks
            sanitized_tasks = self._parse_sanitized_tasks_response(response.text)

            logger.info(f"AI returned {len(sanitized_tasks)} sanitized tasks")

            return sanitized_tasks

        except Exception as e:
            logger.error(f"Error calling AI sanitization: {str(e)}")
            # Fallback: return original tasks if AI fails
            return all_tasks

    def _build_sanitization_prompt(self, quest_title: str, quest_big_idea: str, all_tasks: List[Dict]) -> str:
        """
        Build the prompt for AI sanitization

        Args:
            quest_title: The title of the quest
            quest_big_idea: The description/big idea of the quest
            all_tasks: List of all tasks to sanitize

        Returns:
            Formatted prompt string
        """
        # Format tasks for the prompt
        tasks_json = json.dumps(all_tasks, indent=2)

        prompt = f"""You are helping maintain a high-quality task library for an educational platform.

Quest Context:
- Title: {quest_title}
- Description: {quest_big_idea}

Your job is to sanitize the task library by:
1. REMOVING duplicates (tasks with very similar titles/descriptions)
2. GENERALIZING tasks to make them more reusable (remove student-specific details, make them applicable to all learners)
3. REMOVING low-quality tasks (vague, incomplete, inappropriate, or poorly written)
4. KEEPING high-quality, diverse tasks that align with the quest goals

IMPORTANT RULES:
- Each task must have: title, description, pillar (stem/wellness/communication/civics/art), xp_value (number), diploma_subjects (dict mapping subject names to XP values)
- Preserve usage_count and id fields if they exist (for existing tasks)
- Remove personal pronouns and student-specific references from titles/descriptions
- Keep tasks general enough to be used by any student
- Aim for diversity across pillars and diploma subjects
- Remove tasks that are too similar (keep the best version)
- Prefer tasks with higher usage_count when choosing between duplicates

INPUT TASKS:
{tasks_json}

OUTPUT FORMAT:
Return ONLY a valid JSON array of sanitized tasks. Each task should have this structure:
{{
  "id": "original_id_if_exists_otherwise_null",
  "title": "General task title",
  "description": "General task description",
  "pillar": "stem|wellness|communication|civics|art",
  "xp_value": 100,
  "diploma_subjects": {{"Math": 50, "Science": 50}},
  "usage_count": 0,
  "reason": "kept|generalized|deduplicated|removed"
}}

ONLY return tasks with reason "kept", "generalized", or "deduplicated". Do NOT return tasks with reason "removed".

Return the JSON array now:"""

        return prompt

    def _parse_sanitized_tasks_response(self, response_text: str) -> List[Dict]:
        """
        Parse the AI response containing sanitized tasks

        Args:
            response_text: Raw text response from Gemini

        Returns:
            List of parsed task dictionaries
        """
        try:
            # Extract JSON from response (might be wrapped in markdown code blocks)
            json_match = response_text.strip()

            # Remove markdown code blocks if present
            if json_match.startswith('```'):
                json_match = json_match.split('```')[1]
                if json_match.startswith('json'):
                    json_match = json_match[4:]

            json_match = json_match.strip()

            # Parse JSON
            sanitized_tasks = json.loads(json_match)

            # Validate and filter
            valid_tasks = []
            for task in sanitized_tasks:
                # Only keep tasks that weren't marked for removal
                reason = task.get('reason', 'kept')
                if reason in ['kept', 'generalized', 'deduplicated']:
                    # Ensure required fields
                    if all(k in task for k in ['title', 'pillar', 'xp_value']):
                        valid_tasks.append(task)
                    else:
                        logger.warning(f"Skipping task with missing required fields: {task.get('title', 'Unknown')}")

            return valid_tasks

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse AI response as JSON: {str(e)}")
            logger.debug(f"Response text: {response_text[:500]}")
            return []
        except Exception as e:
            logger.error(f"Error parsing sanitized tasks: {str(e)}")
            return []

    def _calculate_sanitization_stats(
        self,
        existing_tasks: List[Dict],
        new_tasks: List[Dict],
        sanitized_tasks: List[Dict]
    ) -> Dict:
        """
        Calculate statistics about the sanitization process

        Args:
            existing_tasks: Original existing tasks in library
            new_tasks: New tasks that were added
            sanitized_tasks: Final sanitized tasks

        Returns:
            Dict with statistics
        """
        total_before = len(existing_tasks) + len(new_tasks)
        total_after = len(sanitized_tasks)

        # Count tasks by reason
        generalized_count = sum(1 for task in sanitized_tasks if task.get('reason') == 'generalized')
        deduplicated_count = sum(1 for task in sanitized_tasks if task.get('reason') == 'deduplicated')
        kept_count = sum(1 for task in sanitized_tasks if task.get('reason') == 'kept')

        removed_count = total_before - total_after

        return {
            'total_before': total_before,
            'total_after': total_after,
            'removed_count': removed_count,
            'generalized_count': generalized_count,
            'deduplicated_count': deduplicated_count,
            'kept_count': kept_count
        }

    def _update_library_tasks(
        self,
        quest_id: str,
        existing_tasks: List[Dict],
        sanitized_tasks: List[Dict]
    ):
        """
        Update the database with sanitized tasks

        Strategy:
        1. Delete all existing unflagged tasks for this quest
        2. Insert all sanitized tasks (preserving IDs and usage_count where possible)

        Args:
            quest_id: The quest ID
            existing_tasks: Original existing tasks (for reference)
            sanitized_tasks: New sanitized tasks to insert
        """
        try:
            logger.info(f"Updating task library in database for quest {quest_id}")

            # 1. Delete all existing unflagged tasks for this quest
            self.supabase.table('quest_sample_tasks') \
                .delete() \
                .eq('quest_id', quest_id) \
                .eq('is_flagged', False) \
                .execute()

            logger.info(f"Deleted {len(existing_tasks)} existing tasks")

            # 2. Prepare sanitized tasks for insertion
            insert_tasks = []
            for task in sanitized_tasks:
                insert_data = {
                    'quest_id': quest_id,
                    'title': task['title'],
                    'description': task.get('description', ''),
                    'pillar': task['pillar'],
                    'xp_value': task.get('xp_value', 100),
                    'diploma_subjects': task.get('diploma_subjects', {}),
                    'usage_count': task.get('usage_count', 0),
                    'flag_count': 0,
                    'is_flagged': False,
                    'ai_generated': True
                }

                # If task has an ID from existing library, try to preserve it
                # (Note: This might fail due to ID conflicts, in which case a new ID will be generated)
                if task.get('id'):
                    insert_data['id'] = task['id']

                insert_tasks.append(insert_data)

            # 3. Insert sanitized tasks
            if insert_tasks:
                self.supabase.table('quest_sample_tasks') \
                    .insert(insert_tasks) \
                    .execute()

                logger.info(f"Inserted {len(insert_tasks)} sanitized tasks")

        except Exception as e:
            logger.error(f"Error updating library tasks in database: {str(e)}")
            raise
