"""
Credit Mapping Service
Handles conversion of XP to academic credits and transcript generation.
1000 XP = 1 accredited high school credit
"""

from typing import Dict, List, Optional
from datetime import datetime
from database import get_supabase_admin_client, get_user_client

from utils.logger import get_logger

logger = get_logger(__name__)


class CreditMappingService:
    """Service for tracking academic credits derived from XP."""

    # Standard diploma requirements (20 credits total)
    DIPLOMA_REQUIREMENTS = {
        'math': 4.0,
        'science': 4.0,
        'english': 4.0,
        'history': 3.0,
        'foreign_language': 2.0,
        'arts': 1.0,
        'electives': 2.0
    }

    # XP to credit conversion rate
    XP_PER_CREDIT = 1000

    @staticmethod
    def calculate_user_credits(user_id: str) -> Dict:
        """
        Calculate total academic credits earned by user.

        Args:
            user_id: User ID

        Returns:
            Dictionary with credits by subject and totals
        """
        supabase = get_supabase_admin_client()

        # Use the view we created in migration
        result = supabase.from_('user_credit_summary')\
            .select('*')\
            .eq('user_id', user_id)\
            .execute()

        # Aggregate by credit_type
        credits_by_subject = {}
        total_credits = 0.0

        for record in result.data:
            credit_type = record['credit_type']
            credits = float(record['total_credits'])

            if credit_type in credits_by_subject:
                credits_by_subject[credit_type] += credits
            else:
                credits_by_subject[credit_type] = credits

            total_credits += credits

        return {
            'user_id': user_id,
            'total_credits': round(total_credits, 2),
            'credits_by_subject': {k: round(v, 2) for k, v in credits_by_subject.items()},
            'diploma_progress': round(total_credits / sum(CreditMappingService.DIPLOMA_REQUIREMENTS.values()), 3)
        }

    @staticmethod
    def map_task_to_credits(user_id: str, task_id: str, quest_id: str) -> Dict:
        """
        Convert task XP to academic credits and record in ledger.
        Called when a task is completed.

        Args:
            user_id: User ID
            task_id: Task ID
            quest_id: Quest ID

        Returns:
            Dictionary with credit breakdown
        """
        supabase = get_supabase_admin_client()

        # Get task details
        task = supabase.table('quest_tasks')\
            .select('xp_amount, subject_xp_distribution')\
            .eq('id', task_id)\
            .single()\
            .execute()

        if not task.data:
            raise ValueError(f"Task {task_id} not found")

        subject_xp_distribution = task.data.get('subject_xp_distribution', {})
        if not subject_xp_distribution:
            # No credit mapping for this task
            return {'credits_awarded': {}}

        # Calculate current academic year
        current_year = datetime.utcnow().year

        # Create credit ledger entries for each subject
        credits_awarded = {}
        ledger_entries = []

        for subject, xp_amount in subject_xp_distribution.items():
            # Calculate credits: XP / 1000
            credits_earned = round(xp_amount / CreditMappingService.XP_PER_CREDIT, 2)

            credits_awarded[subject] = credits_earned

            # Create ledger entry
            ledger_entry = {
                'user_id': user_id,
                'quest_id': quest_id,
                'task_id': task_id,
                'credit_type': subject,
                'xp_amount': xp_amount,
                'credits_earned': credits_earned,
                'academic_year': current_year,
                'date_earned': datetime.utcnow().isoformat()
            }

            ledger_entries.append(ledger_entry)

        # Batch insert to credit_ledger
        if ledger_entries:
            supabase.table('credit_ledger').insert(ledger_entries).execute()

        return {
            'credits_awarded': credits_awarded,
            'total_credits': round(sum(credits_awarded.values()), 2)
        }

    @staticmethod
    def generate_transcript(user_id: str, format: str = 'json') -> Dict:
        """
        Generate academic transcript view.

        Args:
            user_id: User ID
            format: Output format ('json', 'html', 'pdf')

        Returns:
            Transcript data
        """
        supabase = get_supabase_admin_client()

        # Get user info
        user = supabase.table('users')\
            .select('display_name, first_name, last_name, email')\
            .eq('id', user_id)\
            .single()\
            .execute()

        if not user.data:
            raise ValueError(f"User {user_id} not found")

        # Get credits by subject
        credits_summary = CreditMappingService.calculate_user_credits(user_id)

        # Get credits by year
        year_result = supabase.from_('user_credit_summary')\
            .select('academic_year, total_credits')\
            .eq('user_id', user_id)\
            .execute()

        credits_by_year = {}
        for record in year_result.data:
            year = record['academic_year']
            credits = float(record['total_credits'])

            if year in credits_by_year:
                credits_by_year[year] += credits
            else:
                credits_by_year[year] = credits

        # Calculate diploma progress per subject
        subject_progress = {}
        for subject, required in CreditMappingService.DIPLOMA_REQUIREMENTS.items():
            earned = credits_summary['credits_by_subject'].get(subject, 0.0)
            subject_progress[subject] = {
                'earned': earned,
                'required': required,
                'progress': round(earned / required, 3) if required > 0 else 0,
                'remaining': max(0, required - earned)
            }

        # Estimate completion date based on current pace
        total_required = sum(CreditMappingService.DIPLOMA_REQUIREMENTS.values())
        total_earned = credits_summary['total_credits']

        if total_earned > 0 and len(credits_by_year) > 0:
            years_active = len(credits_by_year)
            credits_per_year = total_earned / years_active
            remaining_credits = total_required - total_earned

            if credits_per_year > 0:
                years_remaining = remaining_credits / credits_per_year
                estimated_completion_year = datetime.utcnow().year + int(years_remaining) + 1
            else:
                estimated_completion_year = None
        else:
            estimated_completion_year = None

        transcript = {
            'user': {
                'name': user.data.get('display_name') or f"{user.data.get('first_name', '')} {user.data.get('last_name', '')}".strip(),
                'email': user.data.get('email')
            },
            'total_credits': credits_summary['total_credits'],
            'credits_by_subject': credits_summary['credits_by_subject'],
            'credits_by_year': {k: round(v, 2) for k, v in credits_by_year.items()},
            'subject_progress': subject_progress,
            'diploma_progress': credits_summary['diploma_progress'],
            'diploma_requirements': CreditMappingService.DIPLOMA_REQUIREMENTS,
            'estimated_completion': f"{estimated_completion_year}-06" if estimated_completion_year else None,
            'generated_at': datetime.utcnow().isoformat()
        }

        # Format conversion (for future HTML/PDF support)
        if format == 'json':
            return transcript
        elif format == 'html':
            # TODO: Implement HTML template
            return transcript
        elif format == 'pdf':
            # TODO: Implement PDF generation
            return transcript
        else:
            return transcript

    @staticmethod
    def get_diploma_requirements() -> Dict:
        """
        Get standard diploma credit requirements.

        Returns:
            Dictionary of subject requirements
        """
        total = sum(CreditMappingService.DIPLOMA_REQUIREMENTS.values())

        return {
            'requirements': CreditMappingService.DIPLOMA_REQUIREMENTS,
            'total_credits_required': total,
            'xp_per_credit': CreditMappingService.XP_PER_CREDIT,
            'total_xp_required': int(total * CreditMappingService.XP_PER_CREDIT)
        }

    @staticmethod
    def get_credit_ledger_entries(user_id: str, academic_year: Optional[int] = None, credit_type: Optional[str] = None) -> List[Dict]:
        """
        Get detailed credit ledger entries for a user.

        Args:
            user_id: User ID
            academic_year: Optional year filter
            credit_type: Optional subject filter

        Returns:
            List of credit ledger entries with quest/task details
        """
        supabase = get_supabase_admin_client()

        query = supabase.table('credit_ledger')\
            .select('*, quests(title), quest_tasks(title)')\
            .eq('user_id', user_id)\
            .order('date_earned', desc=True)

        if academic_year:
            query = query.eq('academic_year', academic_year)

        if credit_type:
            query = query.eq('credit_type', credit_type)

        result = query.execute()

        # Flatten the nested data
        entries = []
        for record in result.data:
            entry = {
                'id': record['id'],
                'credit_type': record['credit_type'],
                'xp_amount': record['xp_amount'],
                'credits_earned': float(record['credits_earned']),
                'date_earned': record['date_earned'],
                'academic_year': record['academic_year'],
                'quest_title': record['quests']['title'] if record.get('quests') else 'Unknown',
                'task_title': record['quest_tasks']['title'] if record.get('quest_tasks') else 'Unknown'
            }
            entries.append(entry)

        return entries

    @staticmethod
    def calculate_quest_credits(quest_id: str) -> Dict:
        """
        Calculate total credits available from a quest.

        Args:
            quest_id: Quest ID

        Returns:
            Dictionary with credit breakdown by subject
        """
        supabase = get_supabase_admin_client()

        # Get all tasks for this quest
        tasks = supabase.table('quest_tasks')\
            .select('xp_amount, subject_xp_distribution')\
            .eq('quest_id', quest_id)\
            .execute()

        total_credits_by_subject = {}
        total_credits = 0.0

        for task in tasks.data:
            subject_xp = task.get('subject_xp_distribution', {})

            for subject, xp in subject_xp.items():
                credits = xp / CreditMappingService.XP_PER_CREDIT

                if subject in total_credits_by_subject:
                    total_credits_by_subject[subject] += credits
                else:
                    total_credits_by_subject[subject] = credits

                total_credits += credits

        return {
            'quest_id': quest_id,
            'total_credits': round(total_credits, 2),
            'credits_by_subject': {k: round(v, 2) for k, v in total_credits_by_subject.items()}
        }
