"""
Daily Summary Service

Generates daily activity summaries for advisors showing their students' progress.
Used by the daily_advisor_summary scheduled job.

V2 Enhancement: Includes rhythm states, streaks, check-in data, milestones,
and pillar balance metrics from existing platform engagement services.
"""

from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta, date
from collections import defaultdict
from services.base_service import BaseService
from database import get_supabase_admin_client

from utils.logger import get_logger

logger = get_logger(__name__)


# Rhythm state calculation (reused from routes/users/engagement.py)
def calculate_rhythm_state(activity_dates: list, today: date) -> dict:
    """
    Determine rhythm state based on activity patterns.
    All states are framed positively.
    """
    if not activity_dates:
        return {
            "state": "ready_to_begin",
            "state_display": "Ready to Begin",
            "emoji": "",
            "color": "gray"
        }

    # Convert to date objects if needed
    converted_dates = []
    for d in activity_dates:
        if isinstance(d, date):
            converted_dates.append(d)
        elif isinstance(d, str):
            converted_dates.append(datetime.fromisoformat(d.replace('Z', '+00:00')).date())
        elif hasattr(d, 'date'):
            converted_dates.append(d.date())
        else:
            converted_dates.append(d)
    activity_dates = sorted(converted_dates)

    most_recent = max(activity_dates)
    days_since_last = (today - most_recent).days

    # Get activity in different time windows
    last_14_days = [d for d in activity_dates if (today - d).days <= 14]
    previous_14_days = [d for d in activity_dates if 14 < (today - d).days <= 28]

    # Fresh return: Activity in last 3 days after 7+ day gap
    if len(activity_dates) >= 2 and days_since_last <= 3:
        sorted_dates = sorted(activity_dates, reverse=True)
        if len(sorted_dates) >= 2:
            gap_before_return = (sorted_dates[0] - sorted_dates[1]).days
            if gap_before_return >= 7:
                return {
                    "state": "fresh_return",
                    "state_display": "Welcome Back",
                    "emoji": "",
                    "color": "blue"
                }

    # In flow: Consistent engagement
    if len(last_14_days) >= 3 and days_since_last <= 5:
        if len(last_14_days) >= 2:
            sorted_recent = sorted(last_14_days)
            gaps = [(sorted_recent[i+1] - sorted_recent[i]).days for i in range(len(sorted_recent)-1)]
            avg_gap = sum(gaps) / len(gaps) if gaps else 0
            if avg_gap <= 5:
                return {
                    "state": "in_flow",
                    "state_display": "In Flow",
                    "emoji": "",
                    "color": "green"
                }

    # Building momentum: Increasing frequency
    if len(last_14_days) > len(previous_14_days) and days_since_last <= 7:
        return {
            "state": "building",
            "state_display": "Building",
            "emoji": "",
            "color": "yellow"
        }

    # Resting: 4-14 days since last activity
    if 4 <= days_since_last <= 14:
        return {
            "state": "resting",
            "state_display": "Resting",
            "emoji": "",
            "color": "yellow"
        }

    # Long gap - at risk
    if days_since_last > 14:
        return {
            "state": "at_risk",
            "state_display": "Needs Attention",
            "emoji": "",
            "color": "red"
        }

    # Default
    return {
        "state": "finding_rhythm",
        "state_display": "Finding Rhythm",
        "emoji": "",
        "color": "gray"
    }


class DailySummaryService(BaseService):
    """Service for generating daily advisor summary data."""

    # Thresholds for categorizing inactive students
    REACH_OUT_DAYS_THRESHOLD = 3  # Students inactive for 3+ days go in "Reach Out Suggested"

    def __init__(self):
        super().__init__()
        self.client = get_supabase_admin_client()

    def get_advisor_daily_summary(
        self,
        advisor_id: str,
        summary_date: Optional[date] = None
    ) -> Dict[str, Any]:
        """
        Generate daily activity summary for an advisor's students.

        V2 Enhancement: Now includes rhythm states, streaks, check-in data,
        milestones, and pillar balance for each student.

        Args:
            advisor_id: UUID of the advisor
            summary_date: Date to summarize (defaults to yesterday)

        Returns:
            Summary dictionary containing:
            - advisor: advisor info
            - date: summary date
            - cohort_summary: counts by engagement state
            - checkins_overdue: students needing check-in (7+ days)
            - milestones: recent achievements to celebrate
            - students_with_activity: students who completed tasks (with V2 metrics)
            - reach_out_suggested: students inactive 3+ days (with V2 metrics)
            - no_activity_yesterday: students who just missed a day
            - totals: aggregate statistics
        """
        try:
            # Default to yesterday
            if summary_date is None:
                summary_date = (datetime.utcnow() - timedelta(days=1)).date()

            # Get advisor info
            advisor = self._get_advisor_info(advisor_id)
            if not advisor:
                raise ValueError(f"Advisor {advisor_id} not found")

            # Get all students assigned to this advisor
            students = self._get_advisor_students(advisor_id)
            if not students:
                return {
                    'advisor': advisor,
                    'date': summary_date.isoformat(),
                    'cohort_summary': {'in_flow': 0, 'building_or_resting': 0, 'at_risk': 0},
                    'checkins_overdue': [],
                    'milestones': [],
                    'students_with_activity': [],
                    'reach_out_suggested': [],
                    'no_activity_yesterday': [],
                    'totals': {
                        'total_tasks': 0,
                        'total_xp': 0,
                        'active_students': 0,
                        'needs_outreach': 0,
                        'total_students': 0
                    }
                }

            student_ids = [s['id'] for s in students]

            # Get task completions for the summary date
            start_of_day = datetime.combine(summary_date, datetime.min.time())
            end_of_day = datetime.combine(summary_date, datetime.max.time())

            completions = self._get_task_completions_for_date(
                student_ids,
                start_of_day.isoformat(),
                end_of_day.isoformat()
            )

            # Group completions by student
            completions_by_student = {}
            for completion in completions:
                student_id = completion['user_id']
                if student_id not in completions_by_student:
                    completions_by_student[student_id] = []
                completions_by_student[student_id].append(completion)

            # Get active quests for all students
            active_quests_by_student = self._get_active_quests_for_students(student_ids)

            # V2: Bulk fetch engagement data for all students
            rhythm_states = self._get_rhythm_states_bulk(student_ids, summary_date)
            streak_data = self._get_streak_days_bulk(student_ids, summary_date)
            pillar_balances = self._get_pillar_balance_bulk(student_ids)
            checkin_data = self._get_checkin_data_bulk(advisor_id, student_ids)

            # V2: Detect milestones from yesterday's activity
            milestones = self._detect_milestones(student_ids, summary_date, students)

            # Categorize students and build cohort summary
            students_with_activity = []
            reach_out_suggested = []
            no_activity_yesterday = []

            cohort_summary = {'in_flow': 0, 'building_or_resting': 0, 'at_risk': 0}
            checkins_overdue = []

            total_tasks = 0
            total_xp = 0

            for student in students:
                student_id = student['id']
                student_completions = completions_by_student.get(student_id, [])
                student_quests = active_quests_by_student.get(student_id, [])

                # V2: Get engagement metrics for this student
                rhythm = rhythm_states.get(student_id, {
                    'state': 'ready_to_begin',
                    'state_display': 'Ready to Begin',
                    'color': 'gray'
                })
                streak = streak_data.get(student_id, 0)
                pillar_balance = pillar_balances.get(student_id, {})
                days_since_checkin = checkin_data.get(student_id)

                # Update cohort summary
                if rhythm['state'] == 'in_flow':
                    cohort_summary['in_flow'] += 1
                elif rhythm['state'] in ['building', 'resting', 'fresh_return', 'finding_rhythm']:
                    cohort_summary['building_or_resting'] += 1
                else:
                    cohort_summary['at_risk'] += 1

                # Check for overdue check-ins (7+ days)
                if days_since_checkin is not None and days_since_checkin >= 7:
                    checkins_overdue.append({
                        'user': {
                            'id': student_id,
                            'display_name': student.get('display_name')
                        },
                        'days_since_checkin': days_since_checkin
                    })

                # V2: Calculate pillar imbalance warning
                pillar_warning = self._check_pillar_imbalance(pillar_balance)

                if student_completions:
                    # Student had activity yesterday
                    tasks_completed = len(student_completions)
                    xp_earned = sum(c.get('xp_awarded', 0) or 0 for c in student_completions)

                    total_tasks += tasks_completed
                    total_xp += xp_earned

                    # Calculate dominant pillar for today
                    pillar_counts = defaultdict(int)
                    for c in student_completions:
                        pillar = c.get('task_pillar')
                        if pillar:
                            pillar_counts[pillar] += 1
                    dominant_pillar = max(pillar_counts.items(), key=lambda x: x[1])[0] if pillar_counts else None
                    dominant_pct = round((pillar_counts[dominant_pillar] / tasks_completed) * 100) if dominant_pillar else 0

                    students_with_activity.append({
                        'user': {
                            'id': student_id,
                            'display_name': student.get('display_name'),
                            'email': student.get('email')
                        },
                        'tasks_completed': [
                            {
                                'title': c.get('task_title', 'Untitled Task'),
                                'pillar': c.get('task_pillar'),
                                'xp': c.get('xp_awarded', 0) or 0
                            }
                            for c in student_completions
                        ],
                        'xp_earned_today': xp_earned,
                        'active_quests': student_quests,
                        # V2 metrics
                        'rhythm_state': rhythm,
                        'streak_days': streak,
                        'dominant_pillar': dominant_pillar,
                        'dominant_pillar_pct': dominant_pct,
                        'pillar_warning': pillar_warning
                    })
                else:
                    # Student had no activity yesterday - check how long inactive
                    days_inactive = self._calculate_days_inactive(student_id, summary_date)
                    last_active = student.get('last_active')

                    if days_inactive >= self.REACH_OUT_DAYS_THRESHOLD:
                        # Needs outreach
                        reach_out_suggested.append({
                            'user': {
                                'id': student_id,
                                'display_name': student.get('display_name'),
                                'email': student.get('email')
                            },
                            'days_inactive': days_inactive,
                            'last_active': last_active,
                            'current_quest': student_quests[0] if student_quests else None,
                            # V2 metrics
                            'rhythm_state': rhythm,
                            'streak_days': streak
                        })
                    else:
                        # Just missed a day
                        no_activity_yesterday.append({
                            'user': {
                                'id': student_id,
                                'display_name': student.get('display_name')
                            },
                            'last_active': last_active,
                            # V2 metrics
                            'rhythm_state': rhythm
                        })

            # Sort results
            students_with_activity.sort(
                key=lambda x: x['xp_earned_today'],
                reverse=True
            )
            reach_out_suggested.sort(
                key=lambda x: x['days_inactive'],
                reverse=True
            )
            checkins_overdue.sort(
                key=lambda x: x['days_since_checkin'],
                reverse=True
            )

            return {
                'advisor': advisor,
                'date': summary_date.isoformat(),
                # V2: New top-level sections
                'cohort_summary': cohort_summary,
                'checkins_overdue': checkins_overdue,
                'milestones': milestones,
                # Original sections (now with V2 metrics per student)
                'students_with_activity': students_with_activity,
                'reach_out_suggested': reach_out_suggested,
                'no_activity_yesterday': no_activity_yesterday,
                'totals': {
                    'total_tasks': total_tasks,
                    'total_xp': total_xp,
                    'active_students': len(students_with_activity),
                    'needs_outreach': len(reach_out_suggested),
                    'total_students': len(students)
                }
            }

        except Exception as e:
            logger.error(f"Error generating daily summary for advisor {advisor_id}: {e}")
            raise

    def _get_advisor_info(self, advisor_id: str) -> Optional[Dict[str, Any]]:
        """Get advisor user info."""
        try:
            result = self.client.table('users')\
                .select('id, display_name, first_name, last_name, email')\
                .eq('id', advisor_id)\
                .single()\
                .execute()

            if result.data:
                advisor = result.data
                # Provide fallback for display_name
                if not advisor.get('display_name'):
                    advisor['display_name'] = f"{advisor.get('first_name', '')} {advisor.get('last_name', '')}".strip() or 'Advisor'
                return advisor
            return None
        except Exception as e:
            logger.error(f"Error fetching advisor info: {e}")
            return None

    def _get_advisor_students(self, advisor_id: str) -> List[Dict[str, Any]]:
        """Get all students assigned to an advisor."""
        try:
            response = self.client.table('advisor_student_assignments')\
                .select('student_id, users!advisor_student_assignments_student_id_fkey(id, display_name, first_name, last_name, email, last_active)')\
                .eq('advisor_id', advisor_id)\
                .eq('is_active', True)\
                .execute()

            students = []
            if response.data:
                for assignment in response.data:
                    if assignment.get('users'):
                        student = assignment['users']
                        # Provide fallback for display_name
                        if not student.get('display_name'):
                            student['display_name'] = f"{student.get('first_name', '')} {student.get('last_name', '')}".strip() or 'Student'
                        students.append(student)

            return students
        except Exception as e:
            logger.error(f"Error fetching advisor students: {e}")
            return []

    def _get_task_completions_for_date(
        self,
        student_ids: List[str],
        start_date: str,
        end_date: str
    ) -> List[Dict[str, Any]]:
        """Get all task completions for students in date range."""
        try:
            if not student_ids:
                return []

            # Get completions with task info
            response = self.client.table('quest_task_completions')\
                .select('id, user_id, xp_awarded, completed_at, user_quest_tasks(title, pillar, xp_value)')\
                .in_('user_id', student_ids)\
                .gte('completed_at', start_date)\
                .lte('completed_at', end_date)\
                .order('completed_at', desc=True)\
                .execute()

            completions = []
            for c in (response.data or []):
                task = c.get('user_quest_tasks') or {}
                completions.append({
                    'id': c['id'],
                    'user_id': c['user_id'],
                    'xp_awarded': c.get('xp_awarded') or task.get('xp_value', 0),
                    'completed_at': c['completed_at'],
                    'task_title': task.get('title', 'Untitled Task'),
                    'task_pillar': task.get('pillar')
                })

            return completions
        except Exception as e:
            logger.error(f"Error fetching task completions: {e}")
            return []

    def _get_active_quests_for_students(
        self,
        student_ids: List[str]
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Get active quests for all students, grouped by student ID."""
        try:
            if not student_ids:
                return {}

            response = self.client.table('user_quests')\
                .select('user_id, quest_id, started_at, quests(id, title)')\
                .in_('user_id', student_ids)\
                .eq('is_active', True)\
                .is_('completed_at', 'null')\
                .execute()

            quests_by_student = {}
            for uq in (response.data or []):
                student_id = uq['user_id']
                quest = uq.get('quests') or {}

                if student_id not in quests_by_student:
                    quests_by_student[student_id] = []

                # Calculate progress percentage
                progress = self._calculate_quest_progress(uq.get('quest_id'), student_id)

                quests_by_student[student_id].append({
                    'quest_id': uq['quest_id'],
                    'title': quest.get('title', 'Untitled Quest'),
                    'started_at': uq['started_at'],
                    'progress_percentage': progress
                })

            return quests_by_student
        except Exception as e:
            logger.error(f"Error fetching active quests: {e}")
            return {}

    def _calculate_quest_progress(self, quest_id: str, user_id: str) -> int:
        """Calculate completion percentage for a quest."""
        try:
            # Get user_quest_id
            uq_result = self.client.table('user_quests')\
                .select('id')\
                .eq('quest_id', quest_id)\
                .eq('user_id', user_id)\
                .single()\
                .execute()

            if not uq_result.data:
                return 0

            user_quest_id = uq_result.data['id']

            # Get total tasks
            tasks_result = self.client.table('user_quest_tasks')\
                .select('id')\
                .eq('user_quest_id', user_quest_id)\
                .execute()

            total_tasks = len(tasks_result.data) if tasks_result.data else 0
            if total_tasks == 0:
                return 0

            task_ids = [t['id'] for t in tasks_result.data]

            # Get completed tasks
            completions_result = self.client.table('quest_task_completions')\
                .select('id')\
                .in_('task_id', task_ids)\
                .execute()

            completed_tasks = len(completions_result.data) if completions_result.data else 0

            return round((completed_tasks / total_tasks) * 100)
        except Exception as e:
            logger.error(f"Error calculating quest progress: {e}")
            return 0

    def _calculate_days_inactive(self, student_id: str, reference_date: date) -> int:
        """Calculate how many days a student has been inactive."""
        try:
            # Get most recent task completion
            result = self.client.table('quest_task_completions')\
                .select('completed_at')\
                .eq('user_id', student_id)\
                .order('completed_at', desc=True)\
                .limit(1)\
                .execute()

            if result.data and result.data[0].get('completed_at'):
                last_completion = datetime.fromisoformat(
                    result.data[0]['completed_at'].replace('Z', '+00:00')
                ).date()
                days_inactive = (reference_date - last_completion).days
                return max(0, days_inactive)

            # No completions found - check when they started their first quest
            quest_result = self.client.table('user_quests')\
                .select('started_at')\
                .eq('user_id', student_id)\
                .order('started_at')\
                .limit(1)\
                .execute()

            if quest_result.data and quest_result.data[0].get('started_at'):
                first_quest = datetime.fromisoformat(
                    quest_result.data[0]['started_at'].replace('Z', '+00:00')
                ).date()
                days_inactive = (reference_date - first_quest).days
                return max(0, days_inactive)

            # No activity at all - return high number
            return 30
        except Exception as e:
            logger.error(f"Error calculating days inactive: {e}")
            return 0

    # =========================================================================
    # V2 Enhancement Methods - Engagement Metrics
    # =========================================================================

    def _get_rhythm_states_bulk(
        self,
        student_ids: List[str],
        reference_date: date
    ) -> Dict[str, Dict[str, Any]]:
        """
        Get rhythm states for multiple students efficiently.
        Uses activity data from the last 28 days.
        """
        try:
            if not student_ids:
                return {}

            # Get completions for last 28 days for all students
            start_date = reference_date - timedelta(days=28)

            response = self.client.table('quest_task_completions')\
                .select('user_id, completed_at')\
                .in_('user_id', student_ids)\
                .gte('completed_at', start_date.isoformat())\
                .execute()

            # Group activity dates by student
            activity_by_student = defaultdict(list)
            for record in (response.data or []):
                student_id = record['user_id']
                completed_at = record.get('completed_at')
                if completed_at:
                    activity_date = datetime.fromisoformat(
                        completed_at.replace('Z', '+00:00')
                    ).date()
                    activity_by_student[student_id].append(activity_date)

            # Calculate rhythm state for each student
            rhythm_states = {}
            for student_id in student_ids:
                activity_dates = activity_by_student.get(student_id, [])
                rhythm_states[student_id] = calculate_rhythm_state(activity_dates, reference_date)

            return rhythm_states

        except Exception as e:
            logger.error(f"Error getting rhythm states bulk: {e}")
            return {}

    def _get_streak_days_bulk(
        self,
        student_ids: List[str],
        reference_date: date
    ) -> Dict[str, int]:
        """
        Calculate streak days for multiple students efficiently.
        A streak is consecutive days with at least one task completion.
        """
        try:
            if not student_ids:
                return {}

            # Get completions for last 60 days (max streak we care about)
            start_date = reference_date - timedelta(days=60)

            response = self.client.table('quest_task_completions')\
                .select('user_id, completed_at')\
                .in_('user_id', student_ids)\
                .gte('completed_at', start_date.isoformat())\
                .execute()

            # Group activity dates by student (unique dates only)
            activity_by_student = defaultdict(set)
            for record in (response.data or []):
                student_id = record['user_id']
                completed_at = record.get('completed_at')
                if completed_at:
                    activity_date = datetime.fromisoformat(
                        completed_at.replace('Z', '+00:00')
                    ).date()
                    activity_by_student[student_id].add(activity_date)

            # Calculate streak for each student
            streak_days = {}
            for student_id in student_ids:
                dates = sorted(activity_by_student.get(student_id, set()), reverse=True)
                if not dates:
                    streak_days[student_id] = 0
                    continue

                # Count consecutive days from reference_date backwards
                streak = 0
                check_date = reference_date
                for activity_date in dates:
                    if activity_date == check_date:
                        streak += 1
                        check_date -= timedelta(days=1)
                    elif activity_date < check_date:
                        # Gap found - check if we already counted today
                        break

                streak_days[student_id] = streak

            return streak_days

        except Exception as e:
            logger.error(f"Error getting streak days bulk: {e}")
            return {}

    def _get_pillar_balance_bulk(
        self,
        student_ids: List[str]
    ) -> Dict[str, Dict[str, int]]:
        """
        Get XP distribution by pillar for multiple students.
        Returns percentages for each pillar.
        """
        try:
            if not student_ids:
                return {}

            response = self.client.table('user_skill_xp')\
                .select('user_id, pillar, xp_amount')\
                .in_('user_id', student_ids)\
                .execute()

            # Group by student
            xp_by_student = defaultdict(lambda: defaultdict(int))
            for record in (response.data or []):
                student_id = record['user_id']
                pillar = record.get('pillar')
                xp = record.get('xp_amount', 0) or 0
                if pillar:
                    xp_by_student[student_id][pillar] = xp

            # Calculate percentages
            pillar_balances = {}
            for student_id in student_ids:
                student_xp = xp_by_student.get(student_id, {})
                total_xp = sum(student_xp.values())
                if total_xp > 0:
                    pillar_balances[student_id] = {
                        pillar: round((xp / total_xp) * 100)
                        for pillar, xp in student_xp.items()
                    }
                else:
                    pillar_balances[student_id] = {}

            return pillar_balances

        except Exception as e:
            logger.error(f"Error getting pillar balance bulk: {e}")
            return {}

    def _get_checkin_data_bulk(
        self,
        advisor_id: str,
        student_ids: List[str]
    ) -> Dict[str, Optional[int]]:
        """
        Get days since last check-in for multiple students.
        Only counts check-ins by this specific advisor.
        """
        try:
            if not student_ids:
                return {}

            # Get most recent check-in for each student by this advisor
            response = self.client.table('advisor_checkins')\
                .select('student_id, checkin_date')\
                .eq('advisor_id', advisor_id)\
                .in_('student_id', student_ids)\
                .order('checkin_date', desc=True)\
                .execute()

            # Build lookup - only keep most recent per student
            last_checkin_map = {}
            for record in (response.data or []):
                student_id = record['student_id']
                if student_id not in last_checkin_map:
                    checkin_date = datetime.fromisoformat(
                        record['checkin_date'].replace('Z', '+00:00')
                    ).date()
                    last_checkin_map[student_id] = checkin_date

            # Calculate days since check-in
            today = datetime.utcnow().date()
            checkin_data = {}
            for student_id in student_ids:
                last_date = last_checkin_map.get(student_id)
                if last_date:
                    checkin_data[student_id] = (today - last_date).days
                else:
                    checkin_data[student_id] = None  # No check-in ever

            return checkin_data

        except Exception as e:
            logger.error(f"Error getting checkin data bulk: {e}")
            return {}

    def _check_pillar_imbalance(
        self,
        pillar_balance: Dict[str, int]
    ) -> Optional[str]:
        """
        Check if there's a significant pillar imbalance.
        Returns a warning message if one pillar dominates (>80%).
        """
        if not pillar_balance:
            return None

        max_pillar = max(pillar_balance.items(), key=lambda x: x[1], default=(None, 0))
        if max_pillar[1] >= 80:
            return f"{max_pillar[1]}% {max_pillar[0]} - consider suggesting variety"

        return None

    def _detect_milestones(
        self,
        student_ids: List[str],
        summary_date: date,
        students: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Detect milestones achieved on the summary date.
        - Quest completions
        - XP milestones (100, 500, 1000, 5000, 10000)
        - Streak milestones (7, 14, 30 days)
        """
        milestones = []

        try:
            if not student_ids:
                return milestones

            # Create student lookup
            student_lookup = {s['id']: s.get('display_name', 'Student') for s in students}

            # 1. Check for quest completions on summary date
            start_of_day = datetime.combine(summary_date, datetime.min.time())
            end_of_day = datetime.combine(summary_date, datetime.max.time())

            quest_completions = self.client.table('user_quests')\
                .select('user_id, quest_id, completed_at, quests(title)')\
                .in_('user_id', student_ids)\
                .gte('completed_at', start_of_day.isoformat())\
                .lte('completed_at', end_of_day.isoformat())\
                .execute()

            for qc in (quest_completions.data or []):
                student_name = student_lookup.get(qc['user_id'], 'Student')
                quest_title = qc.get('quests', {}).get('title', 'a quest')

                # Check if this is their first quest ever
                count_result = self.client.table('user_quests')\
                    .select('id', count='exact')\
                    .eq('user_id', qc['user_id'])\
                    .not_.is_('completed_at', 'null')\
                    .execute()

                completed_count = count_result.count if hasattr(count_result, 'count') else 1

                if completed_count == 1:
                    milestones.append({
                        'type': 'first_quest',
                        'student_name': student_name,
                        'message': f"{student_name} completed their first quest!",
                        'detail': quest_title
                    })
                else:
                    milestones.append({
                        'type': 'quest_completion',
                        'student_name': student_name,
                        'message': f"{student_name} completed '{quest_title}'",
                        'detail': f"Quest #{completed_count}"
                    })

            # 2. Check for XP milestones
            xp_thresholds = [100, 500, 1000, 5000, 10000]

            # Get current total XP for all students
            users_response = self.client.table('users')\
                .select('id, total_xp')\
                .in_('id', student_ids)\
                .execute()

            # Get XP earned yesterday
            xp_earned_yesterday = self.client.table('quest_task_completions')\
                .select('user_id, xp_awarded')\
                .in_('user_id', student_ids)\
                .gte('completed_at', start_of_day.isoformat())\
                .lte('completed_at', end_of_day.isoformat())\
                .execute()

            xp_earned_by_student = defaultdict(int)
            for record in (xp_earned_yesterday.data or []):
                xp_earned_by_student[record['user_id']] += record.get('xp_awarded', 0) or 0

            for user in (users_response.data or []):
                student_id = user['id']
                current_xp = user.get('total_xp', 0) or 0
                earned = xp_earned_by_student.get(student_id, 0)
                previous_xp = current_xp - earned

                # Check if any threshold was crossed
                for threshold in xp_thresholds:
                    if previous_xp < threshold <= current_xp:
                        student_name = student_lookup.get(student_id, 'Student')
                        milestones.append({
                            'type': 'xp_milestone',
                            'student_name': student_name,
                            'message': f"{student_name} reached {threshold:,} total XP!",
                            'detail': f"Now at {current_xp:,} XP"
                        })
                        break  # Only report highest milestone crossed

            # 3. Check for streak milestones (7, 14, 30 days)
            streak_thresholds = [7, 14, 30]
            streak_data = self._get_streak_days_bulk(student_ids, summary_date)

            for student_id, streak in streak_data.items():
                if streak in streak_thresholds:
                    student_name = student_lookup.get(student_id, 'Student')
                    milestones.append({
                        'type': 'streak_milestone',
                        'student_name': student_name,
                        'message': f"{student_name} is on a {streak}-day streak!",
                        'detail': f"{streak} consecutive days"
                    })

            return milestones

        except Exception as e:
            logger.error(f"Error detecting milestones: {e}")
            return milestones

    def get_all_advisors_with_students(self) -> List[Dict[str, Any]]:
        """
        Get all advisors who have at least one assigned student.

        Returns:
            List of advisor records with student counts
        """
        try:
            # Get all active advisor-student assignments grouped by advisor
            response = self.client.table('advisor_student_assignments')\
                .select('advisor_id, users!advisor_student_assignments_advisor_id_fkey(id, display_name, email, role, org_role)')\
                .eq('is_active', True)\
                .execute()

            # Group by advisor and count students
            advisors_map = {}
            for assignment in (response.data or []):
                advisor_id = assignment['advisor_id']
                advisor = assignment.get('users')

                if advisor and advisor_id not in advisors_map:
                    advisors_map[advisor_id] = {
                        'id': advisor_id,
                        'display_name': advisor.get('display_name'),
                        'email': advisor.get('email'),
                        'role': advisor.get('role'),
                        'org_role': advisor.get('org_role'),
                        'student_count': 0
                    }

                if advisor_id in advisors_map:
                    advisors_map[advisor_id]['student_count'] += 1

            # Filter to only include advisors with at least one student
            advisors = [a for a in advisors_map.values() if a['student_count'] > 0]

            return advisors
        except Exception as e:
            logger.error(f"Error fetching advisors with students: {e}")
            return []


# Note: Do not create singleton instance at module level
# This service uses Supabase client which requires Flask app context
# Instantiate within request handlers instead: DailySummaryService()
