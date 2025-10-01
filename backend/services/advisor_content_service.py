"""
Advisor Content Service
Tools for advisors to create custom badges and quests for their students.
"""

from typing import Dict, List, Optional, Any
from datetime import datetime
from database import get_supabase_admin_client
from services.quest_ai_service import QuestAIService
from services.ai_quest_maintenance_service import AIQuestMaintenanceService
import json


class AdvisorContentService:
    """Service for advisor-created content management"""

    @staticmethod
    def create_custom_badge(
        advisor_id: str,
        badge_data: Dict[str, Any],
        is_school_wide: bool = False
    ) -> Dict[str, Any]:
        """
        Create a custom badge designed by an advisor.

        Args:
            advisor_id: UUID of the advisor creating the badge
            badge_data: Badge configuration data
            is_school_wide: Whether badge should be available to all students in advisor's school

        Returns:
            Dict containing created badge information
        """
        supabase = get_supabase_admin_client()

        # Verify advisor role
        advisor = supabase.table('users').select('role').eq('id', advisor_id).single().execute()
        if not advisor.data or advisor.data.get('role') != 'advisor':
            raise ValueError("Only advisors can create custom badges")

        # Validate required fields
        required_fields = ['name', 'identity_statement', 'description', 'pillar_primary', 'min_xp', 'min_quests']
        missing_fields = [field for field in required_fields if not badge_data.get(field)]
        if missing_fields:
            raise ValueError(f"Missing required fields: {', '.join(missing_fields)}")

        # Create badge
        badge_insert = {
            'name': badge_data['name'],
            'identity_statement': badge_data['identity_statement'],
            'description': badge_data['description'],
            'pillar_primary': badge_data['pillar_primary'],
            'pillar_secondary': badge_data.get('pillar_secondary'),
            'min_xp': badge_data['min_xp'],
            'min_quests': badge_data['min_quests'],
            'icon_url': badge_data.get('icon_url'),
            'created_by': advisor_id,
            'is_custom': True,
            'is_school_wide': is_school_wide,
            'created_at': datetime.utcnow().isoformat()
        }

        created_badge = supabase.table('badges').insert(badge_insert).execute()

        if not created_badge.data:
            raise Exception("Failed to create badge")

        badge_id = created_badge.data[0]['id']

        # If school-wide, link to advisor's school
        if is_school_wide:
            # Get advisor's school
            advisor_profile = supabase.table('advisor_profiles')\
                .select('school_id')\
                .eq('user_id', advisor_id)\
                .single()\
                .execute()

            if advisor_profile.data and advisor_profile.data.get('school_id'):
                school_id = advisor_profile.data['school_id']

                # Create school-badge link
                supabase.table('school_badges').insert({
                    'school_id': school_id,
                    'badge_id': badge_id
                }).execute()

        return {
            'status': 'success',
            'badge_id': badge_id,
            'badge': created_badge.data[0],
            'is_school_wide': is_school_wide
        }

    @staticmethod
    def generate_badge_quest_sequence(
        advisor_id: str,
        badge_id: str,
        num_quests: int = 5
    ) -> Dict[str, Any]:
        """
        Generate a complete sequence of quests for a custom badge.

        Args:
            advisor_id: UUID of the advisor
            badge_id: Badge to generate quests for
            num_quests: Number of quests to generate (default matches badge min_quests)

        Returns:
            Dict containing generated quest sequence
        """
        supabase = get_supabase_admin_client()

        # Get badge details
        badge = supabase.table('badges').select('*').eq('id', badge_id).single().execute()
        if not badge.data:
            raise ValueError(f"Badge {badge_id} not found")

        badge_data = badge.data

        # Verify advisor ownership or school-wide access
        if badge_data.get('created_by') != advisor_id and not badge_data.get('is_school_wide'):
            raise ValueError("Advisor can only generate quests for their own badges or school-wide badges")

        # Use AI service to generate quest sequence
        ai_service = QuestAIService()
        generated_quests = []

        target_xp_per_quest = badge_data['min_xp'] // num_quests

        for i in range(num_quests):
            try:
                # Generate quest aligned with badge
                quest_data = ai_service.generate_quest_for_badge(
                    badge_id=badge_id,
                    badge_context=badge_data
                )

                generated_quests.append({
                    'sequence_number': i + 1,
                    'title': quest_data['title'],
                    'description': quest_data['description'],
                    'tasks': quest_data['tasks'],
                    'estimated_xp': sum(task.get('xp_value', 0) for task in quest_data['tasks']),
                    'applicable_badges': quest_data.get('applicable_badges', [badge_id])
                })

            except Exception as e:
                print(f"Error generating quest {i + 1}: {e}")
                continue

        return {
            'badge_id': badge_id,
            'badge_name': badge_data['name'],
            'target_xp': badge_data['min_xp'],
            'required_quests': badge_data['min_quests'],
            'generated_quests': generated_quests,
            'total_estimated_xp': sum(q['estimated_xp'] for q in generated_quests),
            'status': 'success'
        }

    @staticmethod
    def create_curriculum_pathway(
        advisor_id: str,
        pathway_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Create a structured curriculum pathway with badges and quests.

        Args:
            advisor_id: UUID of the advisor
            pathway_data: Pathway configuration including name, description, badge sequence

        Returns:
            Dict containing created pathway information
        """
        supabase = get_supabase_admin_client()

        # Verify advisor role
        advisor = supabase.table('users').select('role').eq('id', advisor_id).single().execute()
        if not advisor.data or advisor.data.get('role') != 'advisor':
            raise ValueError("Only advisors can create curriculum pathways")

        # Create pathway record
        pathway_insert = {
            'name': pathway_data['name'],
            'description': pathway_data['description'],
            'advisor_id': advisor_id,
            'badge_sequence': pathway_data.get('badge_sequence', []),
            'is_active': True,
            'created_at': datetime.utcnow().isoformat()
        }

        created_pathway = supabase.table('curriculum_pathways').insert(pathway_insert).execute()

        if not created_pathway.data:
            raise Exception("Failed to create curriculum pathway")

        pathway_id = created_pathway.data[0]['id']

        # Link badges to pathway
        for idx, badge_id in enumerate(pathway_data.get('badge_sequence', [])):
            supabase.table('pathway_badges').insert({
                'pathway_id': pathway_id,
                'badge_id': badge_id,
                'sequence_order': idx
            }).execute()

        return {
            'status': 'success',
            'pathway_id': pathway_id,
            'pathway': created_pathway.data[0]
        }

    @staticmethod
    def assign_pathway_to_students(
        advisor_id: str,
        pathway_id: str,
        student_ids: List[str]
    ) -> Dict[str, Any]:
        """
        Assign a curriculum pathway to multiple students.

        Args:
            advisor_id: UUID of the advisor
            pathway_id: Pathway to assign
            student_ids: List of student UUIDs

        Returns:
            Dict containing assignment results
        """
        supabase = get_supabase_admin_client()

        # Verify pathway ownership
        pathway = supabase.table('curriculum_pathways')\
            .select('*')\
            .eq('id', pathway_id)\
            .single()\
            .execute()

        if not pathway.data or pathway.data.get('advisor_id') != advisor_id:
            raise ValueError("Advisor can only assign their own pathways")

        # Assign to each student
        assignments = []
        for student_id in student_ids:
            try:
                assignment = supabase.table('student_pathways').insert({
                    'student_id': student_id,
                    'pathway_id': pathway_id,
                    'assigned_by': advisor_id,
                    'assigned_at': datetime.utcnow().isoformat(),
                    'status': 'active'
                }).execute()

                if assignment.data:
                    assignments.append({
                        'student_id': student_id,
                        'status': 'assigned'
                    })
            except Exception as e:
                assignments.append({
                    'student_id': student_id,
                    'status': 'failed',
                    'error': str(e)
                })

        return {
            'pathway_id': pathway_id,
            'total_students': len(student_ids),
            'successful_assignments': len([a for a in assignments if a['status'] == 'assigned']),
            'failed_assignments': len([a for a in assignments if a['status'] == 'failed']),
            'assignments': assignments
        }

    @staticmethod
    def monitor_student_progress(
        advisor_id: str,
        student_ids: Optional[List[str]] = None,
        pathway_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Monitor progress of students on assigned pathways.

        Args:
            advisor_id: UUID of the advisor
            student_ids: Optional list of specific students to monitor
            pathway_id: Optional specific pathway to monitor

        Returns:
            Dict containing student progress data
        """
        supabase = get_supabase_admin_client()

        # Build query for student pathways
        query = supabase.table('student_pathways')\
            .select('*, students:users(display_name, email), pathways:curriculum_pathways(name)')\
            .eq('assigned_by', advisor_id)

        if pathway_id:
            query = query.eq('pathway_id', pathway_id)

        if student_ids:
            query = query.in_('student_id', student_ids)

        pathway_assignments = query.execute()

        if not pathway_assignments.data:
            return {
                'total_students': 0,
                'pathways_monitored': 0,
                'student_progress': []
            }

        # Get detailed progress for each student
        student_progress = []

        for assignment in pathway_assignments.data:
            student_id = assignment['student_id']
            pathway_id = assignment['pathway_id']

            # Get pathway badges
            pathway_badges = supabase.table('pathway_badges')\
                .select('badge_id, sequence_order')\
                .eq('pathway_id', pathway_id)\
                .order('sequence_order')\
                .execute()

            badge_progress = []
            for pb in pathway_badges.data if pathway_badges.data else []:
                # Get student's progress on this badge
                progress = supabase.table('user_badge_progress')\
                    .select('*')\
                    .eq('user_id', student_id)\
                    .eq('badge_id', pb['badge_id'])\
                    .execute()

                if progress.data and len(progress.data) > 0:
                    badge_progress.append({
                        'badge_id': pb['badge_id'],
                        'sequence_order': pb['sequence_order'],
                        'quests_completed': progress.data[0].get('quests_completed', 0),
                        'xp_earned': progress.data[0].get('xp_earned', 0),
                        'status': 'in_progress'
                    })
                else:
                    badge_progress.append({
                        'badge_id': pb['badge_id'],
                        'sequence_order': pb['sequence_order'],
                        'quests_completed': 0,
                        'xp_earned': 0,
                        'status': 'not_started'
                    })

            student_progress.append({
                'student_id': student_id,
                'student_name': assignment.get('students', {}).get('display_name', 'Unknown'),
                'pathway_name': assignment.get('pathways', {}).get('name', 'Unknown'),
                'assigned_at': assignment['assigned_at'],
                'badge_progress': badge_progress,
                'overall_completion': sum(1 for bp in badge_progress if bp['status'] == 'completed') / len(badge_progress) if badge_progress else 0
            })

        return {
            'total_students': len(student_progress),
            'pathways_monitored': len(set(a['pathway_id'] for a in pathway_assignments.data)),
            'student_progress': student_progress
        }

    @staticmethod
    def get_content_analytics(advisor_id: str) -> Dict[str, Any]:
        """
        Get analytics for all advisor-created content.

        Args:
            advisor_id: UUID of the advisor

        Returns:
            Dict containing content performance analytics
        """
        supabase = get_supabase_admin_client()

        # Get all advisor-created badges
        badges = supabase.table('badges')\
            .select('*')\
            .eq('created_by', advisor_id)\
            .execute()

        badge_analytics = []

        if badges.data:
            for badge in badges.data:
                # Get usage statistics
                badge_progress = supabase.table('user_badge_progress')\
                    .select('*')\
                    .eq('badge_id', badge['id'])\
                    .execute()

                total_students = len(badge_progress.data) if badge_progress.data else 0
                total_xp = sum(bp.get('xp_earned', 0) for bp in badge_progress.data) if badge_progress.data else 0
                total_quests = sum(bp.get('quests_completed', 0) for bp in badge_progress.data) if badge_progress.data else 0

                # Count completions
                completions = [bp for bp in badge_progress.data if bp.get('earned_at')] if badge_progress.data else []

                badge_analytics.append({
                    'badge_id': badge['id'],
                    'badge_name': badge['name'],
                    'total_students_working': total_students,
                    'total_completions': len(completions),
                    'completion_rate': len(completions) / total_students if total_students > 0 else 0,
                    'total_xp_awarded': total_xp,
                    'total_quests_completed': total_quests,
                    'avg_quests_per_student': total_quests / total_students if total_students > 0 else 0
                })

        # Get pathway analytics
        pathways = supabase.table('curriculum_pathways')\
            .select('*')\
            .eq('advisor_id', advisor_id)\
            .execute()

        pathway_analytics = []

        if pathways.data:
            for pathway in pathways.data:
                # Get assignments
                assignments = supabase.table('student_pathways')\
                    .select('*')\
                    .eq('pathway_id', pathway['id'])\
                    .execute()

                pathway_analytics.append({
                    'pathway_id': pathway['id'],
                    'pathway_name': pathway['name'],
                    'total_students_assigned': len(assignments.data) if assignments.data else 0,
                    'active_students': len([a for a in assignments.data if a.get('status') == 'active']) if assignments.data else 0
                })

        return {
            'advisor_id': advisor_id,
            'total_badges_created': len(badges.data) if badges.data else 0,
            'total_pathways_created': len(pathways.data) if pathways.data else 0,
            'badge_analytics': badge_analytics,
            'pathway_analytics': pathway_analytics,
            'generated_at': datetime.utcnow().isoformat()
        }

    @staticmethod
    def duplicate_quest_for_students(
        advisor_id: str,
        source_quest_id: str,
        student_ids: List[str],
        customize: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Duplicate an existing quest and assign to specific students.

        Args:
            advisor_id: UUID of the advisor
            source_quest_id: Quest to duplicate
            student_ids: Students to assign duplicated quest to
            customize: Optional customizations (title, description modifications)

        Returns:
            Dict containing duplication results
        """
        supabase = get_supabase_admin_client()

        # Get source quest
        source_quest = supabase.table('quests').select('*').eq('id', source_quest_id).single().execute()
        if not source_quest.data:
            raise ValueError(f"Quest {source_quest_id} not found")

        # Get source tasks
        source_tasks = supabase.table('quest_tasks')\
            .select('*')\
            .eq('quest_id', source_quest_id)\
            .order('order_index')\
            .execute()

        # Create duplicated quest
        quest_data = source_quest.data
        duplicated_quest = {
            'title': customize.get('title', quest_data['title']) if customize else quest_data['title'],
            'description': customize.get('description', quest_data['description']) if customize else quest_data['description'],
            'source': 'advisor_custom',
            'is_active': True,
            'created_by': advisor_id
        }

        created_quest = supabase.table('quests').insert(duplicated_quest).execute()

        if not created_quest.data:
            raise Exception("Failed to duplicate quest")

        new_quest_id = created_quest.data[0]['id']

        # Duplicate tasks
        for task in source_tasks.data if source_tasks.data else []:
            task_insert = {
                'quest_id': new_quest_id,
                'title': task['title'],
                'description': task.get('description', ''),
                'pillar': task['pillar'],
                'xp_value': task['xp_value'],
                'order_index': task['order_index'],
                'is_required': task.get('is_required', True)
            }
            supabase.table('quest_tasks').insert(task_insert).execute()

        # Assign to students
        assignments = []
        for student_id in student_ids:
            try:
                # Start quest for student
                user_quest = supabase.table('user_quests').insert({
                    'user_id': student_id,
                    'quest_id': new_quest_id,
                    'is_active': True,
                    'started_at': datetime.utcnow().isoformat()
                }).execute()

                if user_quest.data:
                    assignments.append({
                        'student_id': student_id,
                        'status': 'assigned'
                    })
            except Exception as e:
                assignments.append({
                    'student_id': student_id,
                    'status': 'failed',
                    'error': str(e)
                })

        return {
            'status': 'success',
            'source_quest_id': source_quest_id,
            'new_quest_id': new_quest_id,
            'total_students': len(student_ids),
            'successful_assignments': len([a for a in assignments if a['status'] == 'assigned']),
            'assignments': assignments
        }
