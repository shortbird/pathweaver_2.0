"""
Student Quest Assistant Service
Personalized AI-powered quest creation wizard for students.
"""

from typing import Dict, List, Optional, Any
from database import get_supabase_admin_client
from services.quest_ai_service import QuestAIService
from services.ai_quest_maintenance_service import AIQuestMaintenanceService
import json


class StudentQuestAssistantService:
    """Service for helping students create custom quests aligned with their goals"""

    @staticmethod
    def analyze_student_profile(user_id: str) -> Dict[str, Any]:
        """
        Analyze student's learning history to provide personalized recommendations.

        Args:
            user_id: User UUID

        Returns:
            Dict containing profile analysis and recommendations
        """
        supabase = get_supabase_admin_client()

        # Get user data
        user = supabase.table('users').select('*').eq('id', user_id).single().execute()
        if not user.data:
            raise ValueError(f"User {user_id} not found")

        user_data = user.data

        # Get XP distribution across pillars
        skill_xp = supabase.table('user_skill_xp').select('*').eq('user_id', user_id).execute()
        pillar_xp = {row['pillar']: row['xp_amount'] for row in skill_xp.data} if skill_xp.data else {}

        # Get completed quests
        completed_quests = supabase.table('user_quests')\
            .select('quest_id, completed_at')\
            .eq('user_id', user_id)\
            .not_('completed_at', 'is', None)\
            .execute()

        completed_count = len(completed_quests.data) if completed_quests.data else 0

        # Get active quests
        active_quests = supabase.table('user_quests')\
            .select('quest_id, started_at')\
            .eq('user_id', user_id)\
            .eq('is_active', True)\
            .is_('completed_at', None)\
            .execute()

        active_count = len(active_quests.data) if active_quests.data else 0

        # Get selected badges
        selected_badges = supabase.table('user_selected_badges')\
            .select('badge_id, badges(name, pillar_primary, identity_statement)')\
            .eq('user_id', user_id)\
            .execute()

        badge_data = []
        if selected_badges.data:
            for row in selected_badges.data:
                if row.get('badges'):
                    badge_data.append(row['badges'])

        # Get badge progress
        badge_progress = supabase.table('user_badge_progress')\
            .select('badge_id, quests_completed, xp_earned')\
            .eq('user_id', user_id)\
            .execute()

        # Identify strongest and weakest pillars
        if pillar_xp:
            strongest_pillar = max(pillar_xp.items(), key=lambda x: x[1])
            weakest_pillar = min(pillar_xp.items(), key=lambda x: x[1])
        else:
            strongest_pillar = None
            weakest_pillar = None

        # Determine recommended focus areas
        recommendations = []

        if completed_count == 0:
            recommendations.append({
                'type': 'getting_started',
                'message': 'Start with an introductory quest to begin your learning journey',
                'action': 'browse_quests'
            })
        elif active_count == 0:
            recommendations.append({
                'type': 'resume_learning',
                'message': 'You have no active quests. Start a new one to continue building your skills!',
                'action': 'browse_quests'
            })

        if len(badge_data) == 0:
            recommendations.append({
                'type': 'select_badge',
                'message': 'Select badges that represent your learning goals and identity',
                'action': 'browse_badges'
            })
        elif len(badge_data) > 0 and badge_progress.data:
            # Check for badges close to completion
            for progress in badge_progress.data:
                badge_info = next((b for b in badge_data if b.get('id') == progress['badge_id']), None)
                if badge_info:
                    # Get badge requirements
                    badge = supabase.table('badges').select('*').eq('id', progress['badge_id']).single().execute()
                    if badge.data:
                        required_quests = badge.data.get('min_quests', 5)
                        completed = progress.get('quests_completed', 0)
                        remaining = required_quests - completed

                        if 0 < remaining <= 2:
                            recommendations.append({
                                'type': 'complete_badge',
                                'message': f'You are {remaining} quest(s) away from earning the "{badge_info["name"]}" badge!',
                                'action': 'create_quest',
                                'badge_id': progress['badge_id'],
                                'badge_name': badge_info['name']
                            })

        # Suggest diversification if too focused on one pillar
        if strongest_pillar and weakest_pillar:
            ratio = strongest_pillar[1] / (weakest_pillar[1] if weakest_pillar[1] > 0 else 1)
            if ratio > 5:
                recommendations.append({
                    'type': 'diversify',
                    'message': f'Consider exploring {weakest_pillar[0]} to build a more balanced skill set',
                    'action': 'create_quest',
                    'suggested_pillar': weakest_pillar[0]
                })

        return {
            'user_id': user_id,
            'profile': {
                'level': user_data.get('level', 1),
                'total_xp': user_data.get('total_xp', 0),
                'completed_quests': completed_count,
                'active_quests': active_count,
                'selected_badges': len(badge_data)
            },
            'skill_distribution': pillar_xp,
            'strongest_pillar': strongest_pillar[0] if strongest_pillar else None,
            'weakest_pillar': weakest_pillar[0] if weakest_pillar else None,
            'selected_badges': badge_data,
            'recommendations': recommendations
        }

    @staticmethod
    def generate_quest_suggestions(
        user_id: str,
        interest_keywords: List[str],
        target_pillars: Optional[List[str]] = None,
        target_badge_id: Optional[str] = None,
        difficulty_level: str = 'intermediate'
    ) -> Dict[str, Any]:
        """
        Generate personalized quest suggestions based on student input.

        Args:
            user_id: User UUID
            interest_keywords: List of topics/interests the student wants to explore
            target_pillars: Optional list of specific pillars to focus on
            target_badge_id: Optional badge to align quest with
            difficulty_level: beginner, intermediate, or advanced

        Returns:
            Dict containing quest suggestions
        """
        # Get student profile for context
        profile = StudentQuestAssistantService.analyze_student_profile(user_id)

        # Get badge context if specified
        badge_context = None
        if target_badge_id:
            supabase = get_supabase_admin_client()
            badge = supabase.table('badges').select('*').eq('id', target_badge_id).single().execute()
            if badge.data:
                badge_context = badge.data

        # Prepare AI service
        ai_service = QuestAIService()

        # Generate quest suggestions
        suggestions = []
        num_suggestions = 3

        for i in range(num_suggestions):
            try:
                if badge_context:
                    # Generate badge-aligned quest
                    quest_data = ai_service.generate_quest_for_badge(
                        badge_id=target_badge_id,
                        badge_context=badge_context
                    )
                else:
                    # Generate custom quest based on interests
                    prompt_context = {
                        'interests': interest_keywords,
                        'pillars': target_pillars or [profile['strongest_pillar']] if profile['strongest_pillar'] else None,
                        'difficulty': difficulty_level,
                        'student_level': profile['profile']['level']
                    }

                    quest_data = ai_service._generate_custom_quest(prompt_context)

                suggestions.append({
                    'title': quest_data.get('title'),
                    'description': quest_data.get('description'),
                    'tasks': quest_data.get('tasks', []),
                    'estimated_xp': sum(task.get('xp_value', 0) for task in quest_data.get('tasks', [])),
                    'primary_pillars': list(set(task.get('pillar') for task in quest_data.get('tasks', []))),
                    'difficulty': difficulty_level
                })

            except Exception as e:
                print(f"Error generating suggestion {i}: {e}")
                continue

        return {
            'user_id': user_id,
            'profile_summary': profile['profile'],
            'suggestions': suggestions,
            'badge_context': badge_context['name'] if badge_context else None,
            'total_suggestions': len(suggestions)
        }

    @staticmethod
    def refine_quest_idea(
        user_id: str,
        quest_title: str,
        quest_description: str,
        desired_changes: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Help student refine their quest idea with AI assistance.

        Args:
            user_id: User UUID
            quest_title: Student's proposed quest title
            quest_description: Student's description of what they want to learn
            desired_changes: Optional feedback on what to improve

        Returns:
            Dict containing refined quest with suggestions
        """
        ai_service = QuestAIService()

        # Create refinement prompt
        refinement_prompt = f"""
You are helping a student refine their custom quest idea.

Original Quest Title: {quest_title}
Original Description: {quest_description}

Student Feedback: {desired_changes if desired_changes else "No specific feedback provided"}

Please provide:
1. A refined, engaging quest title (keep it concise and inspiring)
2. An improved description (2-3 sentences, focus on what they'll learn and create)
3. Suggested improvements and considerations
4. Recommended skill pillars this quest aligns with

Format as JSON:
{{
    "refined_title": "...",
    "refined_description": "...",
    "improvements": ["...", "..."],
    "suggested_pillars": ["pillar1", "pillar2"],
    "considerations": ["...", "..."]
}}
"""

        try:
            response = ai_service.gemini_client.generate_content(refinement_prompt)
            response_text = response.text.strip()

            # Parse JSON from response
            if response_text.startswith('```json'):
                response_text = response_text[7:]
            if response_text.endswith('```'):
                response_text = response_text[:-3]

            refinement_data = json.loads(response_text.strip())

            return {
                'user_id': user_id,
                'original': {
                    'title': quest_title,
                    'description': quest_description
                },
                'refined': refinement_data,
                'status': 'success'
            }

        except Exception as e:
            print(f"Error refining quest idea: {e}")
            return {
                'user_id': user_id,
                'original': {
                    'title': quest_title,
                    'description': quest_description
                },
                'error': str(e),
                'status': 'error'
            }

    @staticmethod
    def validate_custom_quest(quest_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate a student's custom quest before submission.

        Args:
            quest_data: Quest data to validate

        Returns:
            Dict containing validation results and recommendations
        """
        validation_results = {
            'is_valid': True,
            'errors': [],
            'warnings': [],
            'recommendations': []
        }

        # Required fields
        if not quest_data.get('title'):
            validation_results['errors'].append('Quest title is required')
            validation_results['is_valid'] = False

        if not quest_data.get('description'):
            validation_results['errors'].append('Quest description is required')
            validation_results['is_valid'] = False

        # Title length check
        title = quest_data.get('title', '')
        if len(title) > 100:
            validation_results['warnings'].append('Title is quite long - consider shortening for clarity')
        elif len(title) < 10:
            validation_results['errors'].append('Title is too short - provide more context')
            validation_results['is_valid'] = False

        # Description length check
        description = quest_data.get('description', '')
        if len(description) < 50:
            validation_results['warnings'].append('Description is brief - consider adding more detail about learning goals')
        elif len(description) > 1000:
            validation_results['warnings'].append('Description is very long - consider condensing key points')

        # Task validation
        tasks = quest_data.get('suggested_tasks', [])
        if not tasks or len(tasks) == 0:
            validation_results['errors'].append('Quest must have at least one task')
            validation_results['is_valid'] = False
        elif len(tasks) > 20:
            validation_results['warnings'].append('Quest has many tasks - consider splitting into multiple quests')

        # Task structure validation
        for idx, task in enumerate(tasks):
            if not task.get('title'):
                validation_results['errors'].append(f'Task {idx + 1} is missing a title')
                validation_results['is_valid'] = False

            if not task.get('pillar'):
                validation_results['errors'].append(f'Task {idx + 1} is missing a pillar assignment')
                validation_results['is_valid'] = False

            if not task.get('xp_value') or task.get('xp_value', 0) <= 0:
                validation_results['errors'].append(f'Task {idx + 1} must have a positive XP value')
                validation_results['is_valid'] = False

        # XP balance check
        if tasks:
            total_xp = sum(task.get('xp_value', 0) for task in tasks)
            if total_xp < 50:
                validation_results['warnings'].append('Quest offers minimal XP - consider adding more substantial tasks')
            elif total_xp > 1000:
                validation_results['warnings'].append('Quest offers very high XP - ensure tasks are appropriately challenging')

        # Pillar diversity check
        if tasks:
            unique_pillars = set(task.get('pillar') for task in tasks if task.get('pillar'))
            if len(unique_pillars) == 1:
                validation_results['recommendations'].append('Consider adding tasks from other pillars for interdisciplinary learning')
            elif len(unique_pillars) > 4:
                validation_results['recommendations'].append('Quest covers many pillars - ensure it maintains coherent focus')

        return validation_results

    @staticmethod
    def create_quest_from_wizard(
        user_id: str,
        quest_data: Dict[str, Any],
        make_public: bool = False
    ) -> Dict[str, Any]:
        """
        Create a custom quest from the student wizard interface.

        Args:
            user_id: User UUID
            quest_data: Complete quest data from wizard
            make_public: Whether to submit for public approval

        Returns:
            Dict containing created quest or submission status
        """
        # Validate quest
        validation = StudentQuestAssistantService.validate_custom_quest(quest_data)
        if not validation['is_valid']:
            return {
                'status': 'validation_failed',
                'validation': validation
            }

        supabase = get_supabase_admin_client()

        # Create quest submission
        submission_data = {
            'user_id': user_id,
            'title': quest_data['title'],
            'description': quest_data['description'],
            'suggested_tasks': quest_data.get('suggested_tasks', []),
            'make_public': make_public,
            'status': 'pending' if make_public else 'approved'
        }

        submission = supabase.table('quest_submissions').insert(submission_data).execute()

        if not submission.data:
            return {
                'status': 'error',
                'message': 'Failed to create quest submission'
            }

        submission_id = submission.data[0]['id']

        # If not making public, auto-create as personal quest
        if not make_public:
            quest_insert = {
                'title': quest_data['title'],
                'description': quest_data['description'],
                'source': 'custom',
                'is_active': True,
                'created_by': user_id
            }

            created_quest = supabase.table('quests').insert(quest_insert).execute()

            if created_quest.data:
                quest_id = created_quest.data[0]['id']

                # Create tasks
                for idx, task in enumerate(quest_data.get('suggested_tasks', [])):
                    task_insert = {
                        'quest_id': quest_id,
                        'title': task['title'],
                        'description': task.get('description', ''),
                        'pillar': task['pillar'],
                        'xp_value': task['xp_value'],
                        'order_index': idx,
                        'is_required': task.get('is_required', True)
                    }
                    supabase.table('quest_tasks').insert(task_insert).execute()

                # Update submission with approved quest ID
                supabase.table('quest_submissions')\
                    .update({'approved_quest_id': quest_id, 'status': 'approved'})\
                    .eq('id', submission_id)\
                    .execute()

                return {
                    'status': 'created',
                    'quest_id': quest_id,
                    'submission_id': submission_id,
                    'validation': validation
                }

        return {
            'status': 'submitted',
            'submission_id': submission_id,
            'message': 'Quest submitted for review',
            'validation': validation
        }
