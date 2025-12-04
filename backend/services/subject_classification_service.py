"""
Subject Classification Service for Task XP Distribution
Uses Gemini AI to determine school subject alignment for tasks.
"""

import os
import json
from typing import Dict, Optional
from services.base_service import BaseService, ValidationError
import google.generativeai as genai

from utils.logger import get_logger

logger = get_logger(__name__)

# Configure Gemini
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# School subjects for diploma credits
SCHOOL_SUBJECTS = [
    'language_arts',
    'math',
    'science',
    'social_studies',
    'financial_literacy',
    'health',
    'pe',
    'fine_arts',
    'cte',
    'digital_literacy',
    'electives'
]

SUBJECT_DESCRIPTIONS = {
    'language_arts': 'English, Literature, Writing, Reading Comprehension, Communication',
    'math': 'Algebra, Geometry, Statistics, Applied Mathematics, Mathematical Reasoning',
    'science': 'Biology, Chemistry, Physics, Earth Sciences, Scientific Method',
    'social_studies': 'History, Government, Geography, Economics, Civics',
    'financial_literacy': 'Personal Finance, Economics, Budgeting, Financial Planning',
    'health': 'Health Education, Nutrition, Wellness, Mental Health',
    'pe': 'Physical Fitness, Sports, Exercise Science, Movement',
    'fine_arts': 'Visual Arts, Music, Theater, Dance, Creative Expression',
    'cte': 'Career Preparation, Technical Skills, Vocational Training, Professional Development',
    'digital_literacy': 'Computer Skills, Digital Citizenship, Technology, Coding',
    'electives': 'General interest areas, exploratory learning, interdisciplinary topics'
}

class SubjectClassificationService(BaseService):
    """Service for classifying tasks into school subject areas using AI."""

    def __init__(self, client=None):
        """Initialize the service."""
        super().__init__(client)
        self.model = None
        if GEMINI_API_KEY:
            try:
                # ALWAYS use gemini-2.5-flash-lite as specified in CLAUDE.md
                self.model = genai.GenerativeModel('gemini-2.5-flash-lite')
                logger.info("Gemini model initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize Gemini model: {str(e)}")

    def classify_task_subjects(
        self,
        task_title: str,
        task_description: str,
        pillar: str,
        xp_value: int
    ) -> Dict[str, int]:
        """
        Use AI to determine which school subjects a task aligns with and distribute XP.

        Args:
            task_title: Title of the task
            task_description: Description of the task
            pillar: Learning pillar (stem, art, wellness, communication, civics)
            xp_value: Total XP value for the task

        Returns:
            Dictionary mapping school subjects to XP amounts
            Example: {'fine_arts': 25, 'cte': 75}

        Raises:
            ValidationError: If inputs are invalid
        """
        # Validate inputs
        if not task_title or not isinstance(task_title, str):
            raise ValidationError("task_title is required and must be a string")

        if not isinstance(xp_value, int) or xp_value <= 0:
            raise ValidationError(f"xp_value must be positive integer, got: {xp_value}")

        # If no Gemini API key, use fallback mapping
        if not self.model:
            logger.warning("Gemini API not available, using fallback subject mapping")
            return self._fallback_subject_mapping(pillar, xp_value)

        try:
            # Build prompt for Gemini
            prompt = self._build_classification_prompt(
                task_title,
                task_description,
                pillar,
                xp_value
            )

            logger.info(f"Classifying task: {task_title}")

            # Call Gemini API
            response = self.model.generate_content(prompt)

            # Parse response
            subject_distribution = self._parse_ai_response(response.text, xp_value)

            logger.info(f"Classification result: {subject_distribution}")

            return subject_distribution

        except Exception as e:
            logger.error(f"Error in AI classification: {str(e)}")
            # Fall back to rule-based mapping on error
            return self._fallback_subject_mapping(pillar, xp_value)

    def _build_classification_prompt(
        self,
        task_title: str,
        task_description: str,
        pillar: str,
        xp_value: int
    ) -> str:
        """Build the classification prompt for Gemini."""

        # Build subject list with descriptions
        subjects_text = "\n".join([
            f"- {subject}: {SUBJECT_DESCRIPTIONS[subject]}"
            for subject in SCHOOL_SUBJECTS
        ])

        prompt = f"""You are an educational content classifier. Your job is to determine which high school diploma subjects a learning task aligns with.

Task Information:
- Title: {task_title}
- Description: {task_description or 'No description provided'}
- Learning Pillar: {pillar}
- Total XP Value: {xp_value}

Available School Subjects:
{subjects_text}

Instructions:
1. Analyze the task and determine which 1-2 school subjects it most strongly aligns with
2. Distribute the total XP ({xp_value}) across those subjects based on relevance
3. The XP amounts MUST sum to exactly {xp_value}
4. Most tasks should have 1 primary subject (unless truly interdisciplinary)
5. Return ONLY valid JSON in this exact format (no markdown, no code blocks):

{{"subject1": xp_amount1, "subject2": xp_amount2}}

Example 1:
Task: "Create a 3D object in Blender"
Response: {{"fine_arts": 25, "cte": 75}}

Example 2:
Task: "Write a persuasive essay about climate change"
Response: {{"language_arts": 60, "science": 40}}

Example 3:
Task: "Practice yoga for 30 minutes"
Response: {{"pe": 100}}

Now classify the task above. Return ONLY the JSON object."""

        return prompt

    def _parse_ai_response(self, response_text: str, expected_total: int) -> Dict[str, int]:
        """
        Parse Gemini's response and validate the subject distribution.

        Args:
            response_text: Raw response from Gemini
            expected_total: Total XP that should be distributed

        Returns:
            Validated subject distribution dictionary
        """
        try:
            # Clean up response (remove markdown code blocks if present)
            cleaned_text = response_text.strip()
            if cleaned_text.startswith('```'):
                # Extract JSON from code block
                lines = cleaned_text.split('\n')
                json_lines = []
                in_json = False
                for line in lines:
                    if line.startswith('```'):
                        in_json = not in_json
                        continue
                    if in_json or (line.strip().startswith('{') or json_lines):
                        json_lines.append(line)
                cleaned_text = '\n'.join(json_lines)

            # Parse JSON
            subject_distribution = json.loads(cleaned_text)

            # Validate structure
            if not isinstance(subject_distribution, dict):
                raise ValueError("Response is not a dictionary")

            # Validate subjects are valid
            for subject in subject_distribution.keys():
                if subject not in SCHOOL_SUBJECTS:
                    logger.warning(f"Invalid subject '{subject}' returned by AI, removing")
                    del subject_distribution[subject]

            if not subject_distribution:
                raise ValueError("No valid subjects in response")

            # Validate XP amounts
            for subject, xp in subject_distribution.items():
                if not isinstance(xp, (int, float)) or xp <= 0:
                    raise ValueError(f"Invalid XP amount for {subject}: {xp}")

            # Check if sum matches expected total (with small tolerance for rounding)
            actual_total = sum(subject_distribution.values())
            if abs(actual_total - expected_total) > 1:
                logger.warning(f"XP sum mismatch: expected {expected_total}, got {actual_total}. Adjusting...")
                # Proportionally adjust to match expected total
                ratio = expected_total / actual_total
                subject_distribution = {
                    subject: int(round(xp * ratio))
                    for subject, xp in subject_distribution.items()
                }

                # Handle rounding errors by adjusting largest value
                new_total = sum(subject_distribution.values())
                if new_total != expected_total:
                    diff = expected_total - new_total
                    largest_subject = max(subject_distribution.items(), key=lambda x: x[1])[0]
                    subject_distribution[largest_subject] += diff

            # Ensure all values are integers
            subject_distribution = {
                subject: int(xp) for subject, xp in subject_distribution.items()
            }

            return subject_distribution

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse AI response as JSON: {response_text}")
            raise ValueError(f"Invalid JSON response from AI: {str(e)}")
        except Exception as e:
            logger.error(f"Error parsing AI response: {str(e)}")
            raise

    def _fallback_subject_mapping(self, pillar: str, xp_value: int) -> Dict[str, int]:
        """
        Fallback rule-based subject mapping when AI is unavailable.

        Args:
            pillar: Learning pillar
            xp_value: Total XP value

        Returns:
            Subject distribution based on pillar
        """
        # Map pillars to primary school subjects
        pillar_to_subject = {
            'stem': 'science',
            'art': 'fine_arts',
            'wellness': 'health',
            'communication': 'language_arts',
            'civics': 'social_studies'
        }

        # Get primary subject for this pillar
        primary_subject = pillar_to_subject.get(pillar.lower(), 'electives')

        logger.info(f"Using fallback mapping: {pillar} -> {primary_subject} ({xp_value} XP)")

        return {primary_subject: xp_value}

    def backfill_task_subjects(self, task_id: str) -> bool:
        """
        Backfill subject classification for an existing task.

        Args:
            task_id: ID of the task to classify

        Returns:
            True if successful, False otherwise
        """
        try:
            # Get task details
            task = self.supabase.table('user_quest_tasks')\
                .select('id, title, description, pillar, xp_value, subject_xp_distribution')\
                .eq('id', task_id)\
                .single()\
                .execute()

            if not task.data:
                logger.error(f"Task {task_id} not found")
                return False

            task_data = task.data

            # Skip if already has subject distribution
            if task_data.get('subject_xp_distribution'):
                logger.info(f"Task {task_id} already has subject distribution")
                return True

            # Classify the task
            subject_distribution = self.classify_task_subjects(
                task_data['title'],
                task_data.get('description', ''),
                task_data['pillar'],
                task_data.get('xp_value', 100)
            )

            # Update task with subject distribution
            self.supabase.table('user_quest_tasks')\
                .update({'subject_xp_distribution': subject_distribution})\
                .eq('id', task_id)\
                .execute()

            logger.info(f"Successfully backfilled task {task_id} with subjects: {subject_distribution}")
            return True

        except Exception as e:
            logger.error(f"Error backfilling task {task_id}: {str(e)}")
            return False

    def backfill_all_tasks(self, batch_size: int = 100) -> Dict[str, int]:
        """
        Backfill subject classifications for all tasks without them.

        Args:
            batch_size: Number of tasks to process at a time

        Returns:
            Statistics dictionary with success/failure counts
        """
        stats = {
            'total': 0,
            'success': 0,
            'failed': 0,
            'skipped': 0
        }

        try:
            # Get all tasks without subject distribution
            offset = 0

            while True:
                tasks = self.supabase.table('user_quest_tasks')\
                    .select('id, title, description, pillar, xp_value, subject_xp_distribution')\
                    .is_('subject_xp_distribution', 'null')\
                    .range(offset, offset + batch_size - 1)\
                    .execute()

                if not tasks.data:
                    break

                stats['total'] += len(tasks.data)

                for task in tasks.data:
                    try:
                        # Classify the task
                        subject_distribution = self.classify_task_subjects(
                            task['title'],
                            task.get('description', ''),
                            task['pillar'],
                            task.get('xp_value', 100)
                        )

                        # Update task with subject distribution
                        self.supabase.table('user_quest_tasks')\
                            .update({'subject_xp_distribution': subject_distribution})\
                            .eq('id', task['id'])\
                            .execute()

                        stats['success'] += 1
                        logger.info(f"Backfilled task {task['id']}: {subject_distribution}")

                    except Exception as e:
                        stats['failed'] += 1
                        logger.error(f"Failed to backfill task {task['id']}: {str(e)}")

                # Move to next batch
                offset += batch_size

                # Stop if we got fewer than batch_size results
                if len(tasks.data) < batch_size:
                    break

            logger.info(f"Backfill complete: {stats}")
            return stats

        except Exception as e:
            logger.error(f"Error in backfill_all_tasks: {str(e)}")
            return stats
