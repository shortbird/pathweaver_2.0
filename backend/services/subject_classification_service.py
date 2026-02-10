"""
Subject Classification Service for Task XP Distribution
Uses Gemini AI to determine school subject alignment for tasks.

Refactored (Jan 2026): Extended BaseAIService for unified AI handling.
"""

import json
from typing import Dict, Optional

from services.base_ai_service import BaseAIService, AIServiceError
from services.base_service import ValidationError

from utils.logger import get_logger

logger = get_logger(__name__)

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
    'language_arts': 'English, Literature, Writing, Reading Comprehension, Communication, Essays, Poetry, Journalism',
    'math': 'Algebra, Geometry, Statistics, Applied Mathematics, Mathematical Reasoning, Calculations, Numbers, Data Analysis',
    'science': 'Biology, Chemistry, Physics, Earth Sciences, Scientific Method, Experiments, Lab Work, Research',
    'social_studies': 'History, Government, Geography, Economics, Civics, Culture, Society, Politics',
    'financial_literacy': 'Personal Finance, Economics, Budgeting, Financial Planning, Money Management, Investing',
    'health': 'Health Education, Nutrition, Wellness, Mental Health, Safety, First Aid',
    'pe': 'Physical Fitness, Sports, Exercise Science, Movement, Athletics, Physical Activity',
    'fine_arts': 'Visual Arts, Music, Theater, Dance, Creative Expression, Drawing, Painting, Sculpture, Performance',
    'cte': 'Career Preparation, Technical Skills, Vocational Training, Professional Development, Trades, Hands-on Building',
    'digital_literacy': 'Computer Skills, Digital Citizenship, Technology, Coding, Programming, Web Development, Software',
    'electives': 'ONLY for tasks that genuinely do not fit ANY other category - should be rare'
}

class SubjectClassificationService(BaseAIService):
    """
    Service for classifying tasks into school subject areas using AI.

    Extends BaseAIService to leverage:
    - Unified retry logic with exponential backoff
    - Robust JSON extraction from AI responses
    - Token usage tracking and cost monitoring
    - Consistent model access (gemini-2.5-flash-lite per CLAUDE.md)
    """

    def __init__(self):
        """Initialize the service with BaseAIService."""
        from database import get_supabase_admin_client

        try:
            # Initialize BaseAIService (uses gemini-2.5-flash-lite by default)
            super().__init__()
            self._model_available = True
            logger.info("SubjectClassificationService initialized with Gemini model")
        except AIServiceError as e:
            logger.warning(f"Gemini API not available: {e}. Will use fallback mapping.")
            self._model_available = False

        # Initialize Supabase client for backfill operations
        self.supabase = get_supabase_admin_client()

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

        # If Gemini API not available, use fallback mapping
        if not self._model_available:
            logger.warning("Gemini API not available, using fallback subject mapping")
            return self._fallback_subject_mapping(pillar, xp_value, task_title)

        try:
            # Build prompt for Gemini
            prompt = self._build_classification_prompt(
                task_title,
                task_description,
                pillar,
                xp_value
            )

            logger.info(f"Classifying task: {task_title}")

            # Use inherited generate method with deterministic preset
            # (classification should be consistent and reproducible)
            response_text = self.generate(
                prompt,
                generation_config_preset='deterministic'
            )

            # Parse response
            subject_distribution = self._parse_ai_response(response_text, xp_value)

            logger.info(f"Classification result: {subject_distribution}")

            return subject_distribution

        except Exception as e:
            logger.error(f"Error in AI classification: {str(e)}")
            # Fall back to rule-based mapping on error
            return self._fallback_subject_mapping(pillar, xp_value, task_title)

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

IMPORTANT GUIDELINES:
1. Analyze the task and determine which 1-2 school subjects it most strongly aligns with
2. Distribute the total XP ({xp_value}) across those subjects based on relevance
3. The XP amounts MUST sum to exactly {xp_value}
4. Most tasks should have 1 primary subject (unless truly interdisciplinary)
5. AVOID 'electives' unless the task truly does not fit ANY specific subject category
   - Electives should be RARE (less than 5% of tasks)
   - If a task involves ANY creative work, use 'fine_arts'
   - If a task involves ANY math, numbers, or data, use 'math'
   - If a task involves ANY science concepts or experiments, use 'science'
   - If a task involves ANY writing or reading, use 'language_arts'
   - If a task involves ANY physical activity, use 'pe'
   - If a task involves ANY building, making, or hands-on skills, use 'cte'
   - If a task involves ANY technology or computers, use 'digital_literacy'
6. Return ONLY valid JSON in this exact format (no markdown, no code blocks):

{{"subject1": xp_amount1, "subject2": xp_amount2}}

CORRECT Examples:
Task: "Paint a landscape in watercolors" -> {{"fine_arts": {xp_value}}}
Task: "Solve 10 algebra problems" -> {{"math": {xp_value}}}
Task: "Build a birdhouse" -> {{"cte": {xp_value}}}
Task: "Write a lab report on photosynthesis" -> {{"science": 60, "language_arts": 40}}
Task: "Create a 3D object in Blender" -> {{"digital_literacy": 50, "fine_arts": 50}}
Task: "Practice yoga for 30 minutes" -> {{"pe": {xp_value}}}
Task: "Research World War II causes" -> {{"social_studies": {xp_value}}}

INCORRECT (do NOT do this):
Task: "Paint a landscape" -> {{"electives": {xp_value}}}  (WRONG: should be fine_arts)
Task: "Build a model rocket" -> {{"electives": {xp_value}}}  (WRONG: should be science + cte)
Task: "Learn guitar chords" -> {{"electives": {xp_value}}}  (WRONG: should be fine_arts)

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

    def _fallback_subject_mapping(self, pillar: str, xp_value: int, task_title: str = '') -> Dict[str, int]:
        """
        Fallback rule-based subject mapping when AI is unavailable.
        Uses keyword inference for better accuracy. Never defaults to electives.

        Args:
            pillar: Learning pillar
            xp_value: Total XP value
            task_title: Optional task title for keyword inference

        Returns:
            Subject distribution based on pillar and keywords
        """
        from utils.school_subjects import PILLAR_TO_SUBJECTS

        pillar_lower = pillar.lower() if pillar else ''
        title_lower = task_title.lower() if task_title else ''

        # First, try keyword inference from task title (more specific than pillar)
        if title_lower:
            subject = self._infer_subject_from_keywords(title_lower)
            if subject:
                logger.info(f"Using keyword inference: '{task_title[:50]}' -> {subject} ({xp_value} XP)")
                return {subject: xp_value}

        # Get candidate subjects from pillar using the comprehensive mapping
        subjects = PILLAR_TO_SUBJECTS.get(pillar_lower, [])

        # For STEM pillar, try to distinguish between math, science, and digital_literacy
        if pillar_lower in ['stem', 'stem_logic'] and title_lower:
            refined = self._refine_stem_subject(title_lower)
            if refined:
                subjects = [refined]

        # Use first subject from mapping, or CTE as last resort (not electives)
        if subjects:
            primary_subject = subjects[0]
        else:
            # Use CTE as catch-all for practical/hands-on work, not electives
            primary_subject = 'cte'

        logger.info(f"Using fallback mapping: {pillar} -> {primary_subject} ({xp_value} XP)")
        return {primary_subject: xp_value}

    def _infer_subject_from_keywords(self, text: str) -> Optional[str]:
        """
        Infer subject from keywords in task title/description.
        Returns None if no strong match found.
        """
        # Keyword patterns for each subject (ordered by specificity)
        keyword_patterns = {
            'math': ['math', 'algebra', 'geometry', 'calcul', 'statistic', 'equation', 'number', 'fraction', 'percent', 'graph', 'formula'],
            'science': ['science', 'experiment', 'hypothesis', 'lab', 'biology', 'chemistry', 'physics', 'molecule', 'cell', 'ecosystem', 'research'],
            'language_arts': ['write', 'essay', 'read', 'book', 'story', 'poem', 'literature', 'grammar', 'vocabulary', 'journal', 'author'],
            'social_studies': ['history', 'geography', 'government', 'civics', 'culture', 'society', 'war', 'president', 'country', 'civilization'],
            'fine_arts': ['paint', 'draw', 'art', 'music', 'song', 'instrument', 'dance', 'theater', 'sculpt', 'creative', 'design', 'sketch'],
            'pe': ['exercise', 'sport', 'fitness', 'workout', 'run', 'swim', 'yoga', 'athletic', 'physical', 'train'],
            'health': ['health', 'nutrition', 'wellness', 'mental', 'diet', 'safety', 'first aid', 'hygiene'],
            'digital_literacy': ['code', 'program', 'computer', 'software', 'app', 'website', 'digital', 'tech', 'algorithm'],
            'cte': ['build', 'construct', 'repair', 'tool', 'craft', 'trade', 'career', 'job', 'wood', 'metal', 'sew', 'cook'],
            'financial_literacy': ['money', 'budget', 'finance', 'invest', 'bank', 'saving', 'income', 'expense']
        }

        for subject, keywords in keyword_patterns.items():
            for keyword in keywords:
                if keyword in text:
                    return subject

        return None

    def _refine_stem_subject(self, title: str) -> Optional[str]:
        """
        For STEM pillar tasks, try to determine if it's more math, science, or digital_literacy.
        """
        # Math indicators
        math_keywords = ['math', 'algebra', 'geometry', 'calcul', 'equation', 'formula', 'number', 'statistic', 'data']
        for kw in math_keywords:
            if kw in title:
                return 'math'

        # Digital/Tech indicators
        tech_keywords = ['code', 'program', 'computer', 'software', 'app', 'website', 'digital', 'tech', 'algorithm', 'robot']
        for kw in tech_keywords:
            if kw in title:
                return 'digital_literacy'

        # Science indicators (default for STEM)
        science_keywords = ['science', 'experiment', 'lab', 'biology', 'chemistry', 'physics', 'molecule', 'cell', 'research']
        for kw in science_keywords:
            if kw in title:
                return 'science'

        # Default STEM to science
        return 'science'

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

            # Skip if already has subject distribution (not null and not empty object)
            subject_dist = task_data.get('subject_xp_distribution')
            if subject_dist and subject_dist != {}:
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
                # Query for tasks with null OR empty object subject_xp_distribution
                tasks = self.supabase.table('user_quest_tasks')\
                    .select('id, title, description, pillar, xp_value, subject_xp_distribution')\
                    .or_('subject_xp_distribution.is.null,subject_xp_distribution.eq.{}')\
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
