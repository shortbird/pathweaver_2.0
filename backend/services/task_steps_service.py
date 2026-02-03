"""
Task Steps AI Service
=====================

AI-powered service for generating kid-friendly, neurodivergent-supportive
task step breakdowns. Supports adaptive granularity (Quick/Detailed) and
recursive "I'm stuck" drill-down.

Uses BaseAIService for unified Gemini access, retry logic, and JSON parsing.
"""

import json
from typing import Dict, List, Optional, Any
from datetime import datetime

from services.base_ai_service import BaseAIService, AIGenerationError, AIParsingError
from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)


class TaskStepsService(BaseAIService):
    """
    Service for generating and managing AI-powered task step breakdowns.

    Designed specifically for neurodivergent students with:
    - Clear, single-action steps
    - Concrete, specific language
    - Sensory/physical cues when helpful
    - Two granularity levels: Quick (3-5 steps) and Detailed (10-15 steps)
    - Recursive drill-down for "I'm stuck" scenarios
    """

    def __init__(self):
        super().__init__()
        self._supabase = None  # Lazy initialization to avoid app context issues

    @property
    def supabase(self):
        """Lazy-load Supabase client to avoid app context issues at import time."""
        if self._supabase is None:
            self._supabase = get_supabase_admin_client()
        return self._supabase

    def generate_steps(
        self,
        task_id: str,
        user_id: str,
        granularity: str = 'quick'
    ) -> Dict[str, Any]:
        """
        Generate AI-powered steps for a task.

        Args:
            task_id: The user_quest_tasks ID
            user_id: The user's ID
            granularity: 'quick' (3-5 steps) or 'detailed' (10-15 steps)

        Returns:
            Dict with generated steps and metadata
        """
        # Validate granularity
        if granularity not in ['quick', 'detailed']:
            granularity = 'quick'

        # Fetch task details
        task_result = self.supabase.table('user_quest_tasks').select(
            'id, title, description, pillar, xp_value, quest_id'
        ).eq('id', task_id).eq('user_id', user_id).single().execute()

        if not task_result.data:
            raise ValueError("Task not found or not owned by user")

        task = task_result.data

        # Fetch quest context for better step generation
        quest_result = self.supabase.table('quests').select(
            'title, description, big_idea'
        ).eq('id', task['quest_id']).single().execute()

        quest = quest_result.data if quest_result.data else {}

        # Delete existing top-level steps for this task/user/granularity
        self.supabase.table('task_steps').delete().eq(
            'task_id', task_id
        ).eq('user_id', user_id).is_('parent_step_id', 'null').eq(
            'granularity', granularity
        ).execute()

        # Build and execute prompt
        prompt = self._build_generation_prompt(task, quest, granularity)

        try:
            response = self.generate_json(prompt, strict=True)
        except AIParsingError as e:
            logger.error(f"Failed to parse step generation response: {e}")
            raise AIGenerationError("Failed to generate steps. Please try again.")

        steps_data = response.get('steps', [])
        if not steps_data:
            raise AIGenerationError("AI generated empty step list")

        # Save steps to database
        saved_steps = self._save_steps(
            steps_data=steps_data,
            task_id=task_id,
            user_id=user_id,
            granularity=granularity,
            parent_step_id=None,
            generation_depth=0
        )

        return {
            'success': True,
            'steps': saved_steps,
            'granularity': granularity,
            'task_id': task_id
        }

    def drill_down_step(
        self,
        step_id: str,
        task_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """
        Generate sub-steps for a step the user is stuck on.

        Args:
            step_id: The parent step ID to drill down
            task_id: The task ID
            user_id: The user's ID

        Returns:
            Dict with generated sub-steps
        """
        # Fetch the parent step
        step_result = self.supabase.table('task_steps').select(
            'id, title, description, generation_depth, granularity'
        ).eq('id', step_id).eq('task_id', task_id).eq('user_id', user_id).single().execute()

        if not step_result.data:
            raise ValueError("Step not found or not owned by user")

        parent_step = step_result.data

        # Limit drill-down depth to prevent infinite recursion
        if parent_step['generation_depth'] >= 3:
            raise ValueError("Maximum drill-down depth reached")

        # Fetch task for context
        task_result = self.supabase.table('user_quest_tasks').select(
            'id, title, description, pillar'
        ).eq('id', task_id).single().execute()

        task = task_result.data if task_result.data else {}

        # Delete existing sub-steps for this parent
        self.supabase.table('task_steps').delete().eq(
            'parent_step_id', step_id
        ).execute()

        # Build drill-down prompt
        prompt = self._build_drill_down_prompt(parent_step, task)

        try:
            response = self.generate_json(prompt, strict=True)
        except AIParsingError as e:
            logger.error(f"Failed to parse drill-down response: {e}")
            raise AIGenerationError("Failed to generate sub-steps. Please try again.")

        steps_data = response.get('steps', [])
        if not steps_data:
            raise AIGenerationError("AI generated empty sub-step list")

        # Save sub-steps
        saved_steps = self._save_steps(
            steps_data=steps_data,
            task_id=task_id,
            user_id=user_id,
            granularity=parent_step['granularity'],
            parent_step_id=step_id,
            generation_depth=parent_step['generation_depth'] + 1
        )

        return {
            'success': True,
            'steps': saved_steps,
            'parent_step_id': step_id
        }

    def get_steps(self, task_id: str, user_id: str) -> List[Dict]:
        """
        Get all steps for a task, including sub-steps.

        Returns a nested structure with parent steps containing their children.
        """
        result = self.supabase.table('task_steps').select('*').eq(
            'task_id', task_id
        ).eq('user_id', user_id).order('order_index').execute()

        if not result.data:
            return []

        # Build nested structure
        steps_by_id = {s['id']: {**s, 'sub_steps': []} for s in result.data}
        root_steps = []

        for step in result.data:
            if step['parent_step_id']:
                parent = steps_by_id.get(step['parent_step_id'])
                if parent:
                    parent['sub_steps'].append(steps_by_id[step['id']])
            else:
                root_steps.append(steps_by_id[step['id']])

        return root_steps

    def toggle_step(
        self,
        step_id: str,
        task_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """
        Toggle a step's completion status.
        """
        # Fetch current step
        step_result = self.supabase.table('task_steps').select(
            'id, is_completed'
        ).eq('id', step_id).eq('task_id', task_id).eq('user_id', user_id).single().execute()

        if not step_result.data:
            raise ValueError("Step not found or not owned by user")

        step = step_result.data
        new_status = not step['is_completed']

        update_data = {
            'is_completed': new_status,
            'completed_at': datetime.utcnow().isoformat() if new_status else None,
            'updated_at': datetime.utcnow().isoformat()
        }

        self.supabase.table('task_steps').update(update_data).eq('id', step_id).execute()

        return {
            'success': True,
            'step_id': step_id,
            'is_completed': new_status
        }

    def delete_all_steps(self, task_id: str, user_id: str) -> Dict[str, Any]:
        """
        Delete all steps for a task.
        """
        self.supabase.table('task_steps').delete().eq(
            'task_id', task_id
        ).eq('user_id', user_id).execute()

        return {'success': True, 'task_id': task_id}

    def _save_steps(
        self,
        steps_data: List[Dict],
        task_id: str,
        user_id: str,
        granularity: str,
        parent_step_id: Optional[str],
        generation_depth: int
    ) -> List[Dict]:
        """Save generated steps to database."""
        saved_steps = []

        for idx, step in enumerate(steps_data):
            step_record = {
                'task_id': task_id,
                'user_id': user_id,
                'parent_step_id': parent_step_id,
                'title': step.get('title', f'Step {idx + 1}'),
                'description': step.get('description'),
                'order_index': idx,
                'is_completed': False,
                'granularity': granularity,
                'generation_depth': generation_depth
            }

            result = self.supabase.table('task_steps').insert(step_record).execute()
            if result.data:
                saved_steps.append(result.data[0])

        return saved_steps

    def _build_generation_prompt(
        self,
        task: Dict,
        quest: Dict,
        granularity: str
    ) -> str:
        """Build the prompt for step generation."""

        step_count = "3-5" if granularity == 'quick' else "10-15"
        style_note = (
            "high-level steps showing the main phases"
            if granularity == 'quick'
            else "detailed micro-steps with transition cues between each step"
        )

        prompt = f"""You are helping a student break down a learning task into manageable steps.

TASK TO BREAK DOWN:
Title: {task.get('title', 'Unknown Task')}
Description: {task.get('description', 'No description provided')}
Learning Area: {task.get('pillar', 'general')}

QUEST CONTEXT:
Quest: {quest.get('title', 'Unknown Quest')}
Big Idea: {quest.get('big_idea', 'Learning and growth')}

STEP GENERATION GUIDELINES (Neurodivergent-Supportive):

1. SINGLE ACTION PER STEP
   - Each step must be ONE clear action, not multiple actions combined
   - Bad: "Research the topic and take notes"
   - Good: "Open a new document for notes"

2. CONCRETE, SPECIFIC LANGUAGE
   - Avoid vague instructions
   - Bad: "Think about what you want to say"
   - Good: "Write down three things you already know about this topic"

3. SUGGEST GOOGLE SEARCHES
   - When students need information, give them a specific search term to Google
   - Bad: "Research different types of ecosystems"
   - Good: "Google 'types of ecosystems for kids' and pick one that interests you"
   - This teaches safe internet research skills
   - Always suggest kid-friendly search terms when appropriate

4. TIME-BOUNDED
   - Each step should be achievable in 5-15 minutes
   - Break longer activities into multiple steps

5. TRANSITION CUES (for detailed mode)
   - Help students know when to move on
   - Example: "Once you have 3 bullet points, you're ready for the next step"

6. CALM, SUPPORTIVE TONE
   - No exclamation points or hype
   - Reassuring without being patronizing
   - Simple, direct language

7. EVIDENCE COLLECTION
   - Only suggest evidence for meaningful completions, NOT trivial setup steps
   - Bad: "Open a document" does NOT need a screenshot of a blank page
   - Good: "Brainstorm 3 ideas" DOES deserve "Snap a photo of your brainstorm"
   - Evidence is for showing real work and thinking, not busywork
   - Examples of steps worth documenting: completed brainstorms, research findings,
     drafts, sketches, completed sections, interesting discoveries

Generate {step_count} {style_note}.

OUTPUT FORMAT:
Return a JSON object with a "steps" array. Each step has:
- "title": Short action phrase (5-10 words)
- "description": For meaningful steps, what to capture as evidence. For simple steps, null or a brief tip.

Example format:
{{"steps": [
  {{"title": "Open a new document for notes", "description": null}},
  {{"title": "Brainstorm three initial ideas", "description": "Snap a photo of your brainstorm when done."}},
  {{"title": "Google 'examples of persuasive writing'", "description": "Screenshot one example that stands out to you."}},
  {{"title": "Pick your favorite idea to explore", "description": "Write a sentence about why you chose this one."}}
]}}

Return ONLY the JSON object, no other text."""

        return prompt

    def _build_drill_down_prompt(self, parent_step: Dict, task: Dict) -> str:
        """Build prompt for drilling down into a step."""

        prompt = f"""A student is stuck on this step and needs it broken down further.

STEP THEY'RE STUCK ON:
"{parent_step.get('title', 'Unknown step')}"
{parent_step.get('description') or ''}

ORIGINAL TASK CONTEXT:
{task.get('title', 'Unknown Task')}

GUIDELINES:
1. Break this ONE step into 3-5 smaller, concrete actions
2. Each micro-step should be very specific and achievable in 2-5 minutes
3. Use calm, patient language - they're feeling stuck
4. First step should be the absolute smallest possible starting action
5. If they need information, suggest a specific Google search term (e.g., "Google 'how to start a paragraph'")
6. Only suggest evidence for steps with meaningful output - not setup or trivial actions
7. We care about their PROCESS - real work is worth documenting, busywork is not

OUTPUT FORMAT:
Return a JSON object with a "steps" array. Each step has:
- "title": Very specific micro-action (3-8 words)
- "description": For meaningful steps, what to capture. For simple steps, null or a brief tip.

Example:
{{"steps": [
  {{"title": "Read the step title out loud", "description": null}},
  {{"title": "Write what you think it means", "description": "This sentence is your evidence for this step."}},
  {{"title": "Find one example to look at", "description": "Screenshot the example you found."}}
]}}

Return ONLY the JSON object, no other text."""

        return prompt


# Singleton instance
task_steps_service = TaskStepsService()
