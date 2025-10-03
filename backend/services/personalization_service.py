"""
Quest Personalization Service
==============================

Handles AI-powered task generation for personalized learning paths.
Students work with AI to create custom quests aligned with their interests.
"""

import hashlib
import json
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from database import get_supabase_admin_client

class TaskCacheService:
    """Caching service for AI-generated tasks"""

    def __init__(self):
        self.supabase = get_supabase_admin_client()

    def build_cache_key(self, interests: List[str], cross_curricular: List[str]) -> str:
        """Build a cache key from interests and cross-curricular subjects"""
        combined = sorted(interests) + sorted(cross_curricular)
        key_str = '|'.join(combined)
        return hashlib.md5(key_str.encode()).hexdigest()

    def get(self, quest_id: str, cache_key: str) -> Optional[Dict]:
        """Get cached tasks if available and not expired"""
        try:
            result = self.supabase.table('ai_task_cache')\
                .select('*')\
                .eq('quest_id', quest_id)\
                .eq('cache_key', cache_key)\
                .gt('expires_at', datetime.utcnow().isoformat())\
                .execute()

            if result.data:
                # Increment hit count
                cache_entry = result.data[0]
                self.supabase.table('ai_task_cache')\
                    .update({'hit_count': cache_entry['hit_count'] + 1})\
                    .eq('id', cache_entry['id'])\
                    .execute()

                print(f"✓ Cache hit for quest {quest_id[:8]}... (key: {cache_key[:8]}...)")
                return cache_entry['generated_tasks']

            return None
        except Exception as e:
            print(f"Cache get error: {e}")
            return None

    def set(self, quest_id: str, cache_key: str, tasks: Dict) -> None:
        """Store generated tasks in cache"""
        try:
            cache_entry = {
                'quest_id': quest_id,
                'cache_key': cache_key,
                'interests_hash': cache_key[:16],
                'generated_tasks': tasks,
                'hit_count': 0,
                'created_at': datetime.utcnow().isoformat(),
                'expires_at': (datetime.utcnow() + timedelta(days=7)).isoformat()
            }

            # Upsert to handle conflicts
            self.supabase.table('ai_task_cache')\
                .upsert(cache_entry, on_conflict='quest_id,cache_key')\
                .execute()

            print(f"✓ Cached tasks for quest {quest_id[:8]}... (key: {cache_key[:8]}...)")
        except Exception as e:
            print(f"Cache set error: {e}")

class PersonalizationService:
    """Main service for quest personalization"""

    def __init__(self):
        self.supabase = get_supabase_admin_client()
        self.cache = TaskCacheService()

        # Import AI service lazily to avoid circular imports
        from services.quest_ai_service import QuestAIService
        self.ai_service = QuestAIService()

    def start_personalization_session(
        self,
        user_id: str,
        quest_id: str
    ) -> Dict[str, Any]:
        """Initialize a new personalization session"""
        try:
            # Get quest details
            quest = self.supabase.table('quests')\
                .select('*')\
                .eq('id', quest_id)\
                .single()\
                .execute()

            if not quest.data:
                return {
                    'success': False,
                    'error': 'Quest not found'
                }

            # Check for existing session
            existing_session = self.supabase.table('quest_personalization_sessions')\
                .select('*')\
                .eq('user_id', user_id)\
                .eq('quest_id', quest_id)\
                .is_('completed_at', 'null')\
                .execute()

            if existing_session.data:
                # Resume existing session
                return {
                    'success': True,
                    'session': existing_session.data[0],
                    'resumed': True
                }

            # Create new session
            session = self.supabase.table('quest_personalization_sessions')\
                .insert({
                    'user_id': user_id,
                    'quest_id': quest_id,
                    'created_at': datetime.utcnow().isoformat()
                })\
                .execute()

            return {
                'success': True,
                'session': session.data[0],
                'resumed': False
            }

        except Exception as e:
            print(f"Error starting personalization session: {e}")
            return {
                'success': False,
                'error': str(e)
            }

    def generate_task_suggestions(
        self,
        session_id: str,
        quest_id: str,
        approach: str,
        interests: List[str],
        cross_curricular_subjects: List[str]
    ) -> Dict[str, Any]:
        """Generate AI task suggestions with caching"""
        try:
            # Check cache first
            cache_key = self.cache.build_cache_key(interests, cross_curricular_subjects)
            cached_tasks = self.cache.get(quest_id, cache_key)

            if cached_tasks:
                # Update session with cached results
                self.supabase.table('quest_personalization_sessions')\
                    .update({
                        'ai_generated_tasks': cached_tasks,
                        'selected_approach': approach,
                        'selected_interests': interests,
                        'cross_curricular_subjects': cross_curricular_subjects
                    })\
                    .eq('id', session_id)\
                    .execute()

                return {
                    'success': True,
                    'tasks': cached_tasks['tasks'],
                    'cached': True
                }

            # Generate new tasks with AI
            quest = self.supabase.table('quests')\
                .select('*')\
                .eq('id', quest_id)\
                .single()\
                .execute()

            if not quest.data:
                return {
                    'success': False,
                    'error': 'Quest not found'
                }

            # Build personalization prompt
            prompt = self._build_personalization_prompt(
                quest.data,
                approach,
                interests,
                cross_curricular_subjects
            )

            # Generate tasks using AI service
            result = self.ai_service.model.generate_content(prompt)

            if not result or not result.text:
                return {
                    'success': False,
                    'error': 'AI generation failed'
                }

            # Parse and validate response
            tasks_data = self.ai_service._parse_tasks_response(result.text)
            tasks_data = self._validate_tasks(tasks_data, interests, cross_curricular_subjects)

            # Ensure 50%+ tasks are 100 XP
            tasks_data = self._enforce_xp_distribution(tasks_data)

            # Store in cache
            cached_data = {'tasks': tasks_data}
            self.cache.set(quest_id, cache_key, cached_data)

            # Update session
            self.supabase.table('quest_personalization_sessions')\
                .update({
                    'ai_generated_tasks': cached_data,
                    'selected_approach': approach,
                    'selected_interests': interests,
                    'cross_curricular_subjects': cross_curricular_subjects,
                    'updated_at': datetime.utcnow().isoformat()
                })\
                .eq('id', session_id)\
                .execute()

            return {
                'success': True,
                'tasks': tasks_data,
                'cached': False
            }

        except Exception as e:
            print(f"Error generating task suggestions: {e}")
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'error': str(e)
            }

    def refine_task(
        self,
        session_id: str,
        task_index: int,
        student_edits: str
    ) -> Dict[str, Any]:
        """Refine a task based on student edits (AI reformats)"""
        try:
            # Get session
            session = self.supabase.table('quest_personalization_sessions')\
                .select('*')\
                .eq('id', session_id)\
                .single()\
                .execute()

            if not session.data:
                return {
                    'success': False,
                    'error': 'Session not found'
                }

            ai_tasks = session.data.get('ai_generated_tasks', {}).get('tasks', [])

            if task_index < 0 or task_index >= len(ai_tasks):
                return {
                    'success': False,
                    'error': 'Invalid task index'
                }

            original_task = ai_tasks[task_index]

            # Build refinement prompt
            prompt = f"""
            Refine this educational task based on student's input:

            Original Task:
            Title: {original_task['title']}
            Description: {original_task['description']}

            Student's Edit:
            {student_edits}

            Create an improved version that:
            1. Incorporates the student's ideas
            2. Maintains educational quality
            3. Keeps similar XP value ({original_task['xp_value']})
            4. Stays in the same pillar ({original_task['pillar']})

            Return as JSON with fields: title, description, pillar, xp_value, evidence_prompt
            """

            result = self.ai_service.model.generate_content(prompt)
            refined_task = self.ai_service._parse_quest_response(result.text)

            # Validate refined task
            refined_task = {
                'title': refined_task.get('title', original_task['title']),
                'description': refined_task.get('description', original_task['description']),
                'pillar': self.ai_service._validate_pillar(refined_task.get('pillar', original_task['pillar'])),
                'xp_value': self.ai_service._validate_xp(refined_task.get('xp_value', original_task['xp_value'])),
                'evidence_prompt': refined_task.get('evidence_prompt', original_task.get('evidence_prompt', '')),
                'cross_curricular_connections': original_task.get('cross_curricular_connections', [])
            }

            # Update task in session
            ai_tasks[task_index] = refined_task

            self.supabase.table('quest_personalization_sessions')\
                .update({
                    'ai_generated_tasks': {'tasks': ai_tasks},
                    'updated_at': datetime.utcnow().isoformat()
                })\
                .eq('id', session_id)\
                .execute()

            return {
                'success': True,
                'task': refined_task
            }

        except Exception as e:
            print(f"Error refining task: {e}")
            return {
                'success': False,
                'error': str(e)
            }

    def finalize_personalization(
        self,
        session_id: str,
        user_id: str,
        quest_id: str,
        user_quest_id: str
    ) -> Dict[str, Any]:
        """Finalize personalization and create user-specific tasks"""
        try:
            # Get session
            session = self.supabase.table('quest_personalization_sessions')\
                .select('*')\
                .eq('id', session_id)\
                .single()\
                .execute()

            if not session.data:
                return {
                    'success': False,
                    'error': 'Session not found'
                }

            ai_tasks = session.data.get('ai_generated_tasks', {}).get('tasks', [])

            if not ai_tasks:
                return {
                    'success': False,
                    'error': 'No tasks to finalize'
                }

            # Create user-specific tasks
            user_tasks = []
            for index, task in enumerate(ai_tasks):
                # Build description with bullet points
                description = task.get('description', '')
                if task.get('bullet_points'):
                    bullet_text = '\n'.join([f'• {point}' for point in task['bullet_points']])
                    description = f"{description}\n\n{bullet_text}" if description else bullet_text

                user_task = {
                    'user_id': user_id,
                    'quest_id': quest_id,
                    'user_quest_id': user_quest_id,
                    'title': task['title'],
                    'description': description,
                    'pillar': task['pillar'],
                    'diploma_subjects': task.get('diploma_subjects', ['Electives']),
                    'xp_value': task.get('xp_value', 100),
                    'order_index': index,
                    'is_required': True,
                    'is_manual': False,
                    'approval_status': 'approved',
                    'created_at': datetime.utcnow().isoformat()
                }
                user_tasks.append(user_task)

            # Insert user tasks
            result = self.supabase.table('user_quest_tasks')\
                .insert(user_tasks)\
                .execute()

            # Mark session as completed
            self.supabase.table('quest_personalization_sessions')\
                .update({
                    'finalized_tasks': {'tasks': ai_tasks},
                    'completed_at': datetime.utcnow().isoformat()
                })\
                .eq('id', session_id)\
                .execute()

            # Mark user_quest as personalization_completed
            self.supabase.table('user_quests')\
                .update({
                    'personalization_completed': True,
                    'personalization_session_id': session_id
                })\
                .eq('id', user_quest_id)\
                .execute()

            return {
                'success': True,
                'tasks': result.data,
                'message': f'Created {len(result.data)} personalized tasks'
            }

        except Exception as e:
            print(f"Error finalizing personalization: {e}")
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'error': str(e)
            }

    def _build_personalization_prompt(
        self,
        quest: Dict,
        approach: str,
        interests: List[str],
        cross_curricular_subjects: List[str]
    ) -> str:
        """Build AI prompt for personalized task generation"""

        quest_title = quest['title']
        quest_description = quest.get('big_idea') or quest.get('description', '')

        # Format interests
        interests_text = ', '.join(interests) if interests else 'general learning'

        # Format cross-curricular subjects
        subjects_text = ', '.join(cross_curricular_subjects) if cross_curricular_subjects else 'this subject only'

        # Approach descriptions
        approach_descriptions = {
            'real_world_project': 'Create a personalized, real-life project aligned with the student\'s interests, finding ways to incorporate the study topic into real-world activities.',
            'traditional_class': 'Take a traditional structured approach, such as through an online course or curriculum.',
            'hybrid': 'Combine a traditional structured approach with a personalized project component.'
        }

        approach_desc = approach_descriptions.get(approach, approach_descriptions['real_world_project'])

        return f"""
You are helping a student personalize their learning quest: "{quest_title}".

Quest Description: {quest_description}

Student's Selected Approach: {approach_desc}

Student's Interests: {interests_text}

Cross-Curricular Integration: The student wants to incorporate these subjects: {subjects_text}

Generate 6-10 tasks that:
1. Are equivalent to high school unit projects (not final projects, not quick worksheets)
2. At least 50% of tasks should be worth exactly 100 XP
3. Other tasks can range from 50-150 XP based on complexity
4. Each task must be assigned to ONE of these pillars:
   - STEM & Logic
   - Life & Wellness
   - Language & Communication
   - Society & Culture
   - Arts & Creativity
5. Each task must be mapped to one or more diploma subjects (XP split equally if multiple):
   - Language Arts, Mathematics, Science, Social Studies, Financial Literacy
   - Health, Physical Education, Fine Arts, Career & Technical Education
   - Digital Literacy, Electives
6. Incorporate the student's interests ({interests_text}) authentically
7. Integrate cross-curricular subjects ({subjects_text}) naturally where relevant
8. Follow the selected approach: {approach_desc}

IMPORTANT FORMAT REQUIREMENTS:
- Title: Clear, concise (5-8 words max)
- Description: 1-2 brief sentences ONLY
- Bullet Points: Exactly 3 main actions/steps
- Keep it simple and actionable, not wordy

IMPORTANT: Students should CHOOSE these tasks, not just agree to AI suggestions. Make tasks feel like genuine options, not prescriptive requirements.

Return as valid JSON array:
[
  {{
    "title": "Clear, concise task name (5-8 words)",
    "description": "1-2 brief sentences describing the task",
    "bullet_points": ["Main action 1", "Main action 2", "Main action 3"],
    "pillar": "One of the five pillars listed above",
    "diploma_subjects": ["Subject 1", "Subject 2"],
    "xp_value": 100
  }}
]
"""

    def _validate_tasks(
        self,
        tasks: List[Dict],
        interests: List[str],
        cross_curricular: List[str]
    ) -> List[Dict]:
        """Validate and enhance generated tasks"""

        validated = []
        for task in tasks:
            validated_task = {
                'title': task.get('title', 'Learning Task'),
                'description': task.get('description', ''),
                'bullet_points': task.get('bullet_points', []),
                'pillar': self.ai_service._validate_pillar(task.get('pillar', 'STEM & Logic')),
                'diploma_subjects': task.get('diploma_subjects', ['Electives']),
                'xp_value': self.ai_service._validate_xp(task.get('xp_value', 100))
            }
            validated.append(validated_task)

        return validated

    def _enforce_xp_distribution(self, tasks: List[Dict]) -> List[Dict]:
        """Ensure at least 50% of tasks are 100 XP"""

        total_tasks = len(tasks)
        tasks_at_100xp = sum(1 for task in tasks if task['xp_value'] == 100)

        required_100xp = total_tasks // 2

        if tasks_at_100xp < required_100xp:
            # Adjust some tasks to 100 XP
            tasks_to_adjust = required_100xp - tasks_at_100xp
            adjusted = 0

            for task in tasks:
                if adjusted >= tasks_to_adjust:
                    break

                if task['xp_value'] != 100:
                    task['xp_value'] = 100
                    adjusted += 1

        return tasks

# Global service instance
personalization_service = PersonalizationService()
