"""
Daily Advisor Summary Job

Sends daily email summaries to advisors recapping their students' activity.
Scheduled to run at 5 AM daily.
Uses the standard email template system for consistent branding.
"""

from typing import Dict, Any, List
from datetime import datetime, timedelta
from markupsafe import Markup
from database import get_supabase_admin_client

from utils.logger import get_logger

logger = get_logger(__name__)


class DailyAdvisorSummaryJob:
    """Job handler for sending daily advisor summary emails."""

    @staticmethod
    def execute(job_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute the daily advisor summary job.

        Args:
            job_data: Job configuration
                - summary_date: Optional ISO date string (defaults to yesterday)
                - advisor_ids: Optional list of specific advisor IDs (defaults to all)

        Returns:
            Dict containing execution results
        """
        try:
            from services.daily_summary_service import DailySummaryService
            from services.email_service import email_service
            import os

            summary_service = DailySummaryService()

            # Parse summary date (default to yesterday)
            summary_date = None
            if job_data.get('summary_date'):
                summary_date = datetime.fromisoformat(job_data['summary_date']).date()
            else:
                summary_date = (datetime.utcnow() - timedelta(days=1)).date()

            # Get advisors to process
            advisor_ids = job_data.get('advisor_ids')
            if advisor_ids:
                # Process specific advisors
                advisors = []
                for advisor_id in advisor_ids:
                    advisors.append({'id': advisor_id, 'student_count': 1})
            else:
                # Get all advisors with students
                advisors = summary_service.get_all_advisors_with_students()

            if not advisors:
                logger.info("No advisors with students found, skipping daily summary")
                return {
                    'status': 'success',
                    'advisors_processed': 0,
                    'emails_sent': 0,
                    'skipped_no_activity': 0,
                    'errors': 0,
                    'summary_date': summary_date.isoformat()
                }

            # Process each advisor
            results = {
                'advisors_processed': 0,
                'emails_sent': 0,
                'skipped_no_activity': 0,
                'errors': 0,
                'error_details': []
            }

            frontend_url = os.getenv('FRONTEND_URL', 'https://www.optioeducation.com')
            is_test = job_data.get('is_test', False)

            for advisor in advisors:
                advisor_id = advisor['id']

                try:
                    # Generate summary
                    summary = summary_service.get_advisor_daily_summary(
                        advisor_id=advisor_id,
                        summary_date=summary_date
                    )

                    results['advisors_processed'] += 1

                    # Skip if no activity and no students needing outreach
                    if (not summary['students_with_activity'] and
                            not summary['reach_out_suggested']):
                        results['skipped_no_activity'] += 1
                        logger.info(
                            f"Skipping advisor {advisor_id} - no student activity or outreach needed"
                        )
                        continue

                    # Build email context
                    advisor_info = summary['advisor']
                    advisor_name = advisor_info.get('display_name') or 'Advisor'
                    advisor_email = advisor_info.get('email')

                    if not advisor_email:
                        logger.warning(f"Advisor {advisor_id} has no email, skipping")
                        continue

                    # Format date for email
                    formatted_date = summary_date.strftime('%B %d, %Y')

                    # Build the student sections HTML (marked safe for Jinja2)
                    students_html = Markup(DailyAdvisorSummaryJob._build_students_html(summary))

                    # V2: Get cohort summary for highlight box
                    cohort = summary.get('cohort_summary', {})
                    in_flow_count = cohort.get('in_flow', 0)
                    building_count = cohort.get('building_or_resting', 0)
                    at_risk_count = cohort.get('at_risk', 0)

                    # Send using templated email system for consistent branding
                    success = email_service.send_templated_email(
                        to_email=advisor_email,
                        subject=f"Morning Briefing: Your Students' Progress - {formatted_date}",
                        template_name='daily_advisor_summary',
                        context={
                            'advisor_name': advisor_name,
                            'summary_date': formatted_date,
                            'subject_prefix': '[TEST] ' if is_test else '',
                            'active_students': summary['totals']['active_students'],
                            'total_tasks': summary['totals']['total_tasks'],
                            'total_xp': summary['totals']['total_xp'],
                            # V2: Cohort summary data
                            'in_flow_count': in_flow_count,
                            'building_count': building_count,
                            'at_risk_count': at_risk_count,
                            'students_html': students_html,
                            'dashboard_url': f"{frontend_url}/advisor"
                        }
                    )

                    if success:
                        results['emails_sent'] += 1
                        logger.info(f"Sent daily summary to advisor {advisor_id}")
                    else:
                        results['errors'] += 1
                        results['error_details'].append({
                            'advisor_id': advisor_id,
                            'error': 'Email send failed'
                        })

                except Exception as e:
                    results['errors'] += 1
                    results['error_details'].append({
                        'advisor_id': advisor_id,
                        'error': str(e)
                    })
                    logger.error(f"Error processing advisor {advisor_id}: {e}")

            return {
                'status': 'success',
                'summary_date': summary_date.isoformat(),
                **results
            }

        except Exception as e:
            logger.error(f"Daily advisor summary job failed: {e}")
            raise

    @staticmethod
    def _build_students_html(summary: Dict[str, Any]) -> str:
        """
        Build HTML for student sections only.
        This is inserted into the standard email template.

        V2 Enhancement: Now includes cohort summary, check-ins overdue,
        milestones, and per-student engagement metrics.
        """
        html_parts = []

        # V2: Cohort Summary (traffic light overview with names)
        # Group all students by rhythm state
        in_flow_names = []
        building_names = []
        at_risk_names = []

        # Collect from students with activity
        for student_data in summary.get('students_with_activity', []):
            name = student_data['user'].get('display_name', 'Student')
            rhythm = student_data.get('rhythm_state', {})
            state = rhythm.get('state', '')
            if state == 'in_flow':
                in_flow_names.append(name)
            elif state in ['building', 'resting', 'fresh_return', 'finding_rhythm']:
                building_names.append(name)
            else:
                at_risk_names.append(name)

        # Collect from reach out suggested
        for student_data in summary.get('reach_out_suggested', []):
            name = student_data['user'].get('display_name', 'Student')
            rhythm = student_data.get('rhythm_state', {})
            state = rhythm.get('state', '')
            if state == 'in_flow':
                in_flow_names.append(name)
            elif state in ['building', 'resting', 'fresh_return', 'finding_rhythm']:
                building_names.append(name)
            else:
                at_risk_names.append(name)

        # Collect from no activity yesterday
        for student_data in summary.get('no_activity_yesterday', []):
            name = student_data['user'].get('display_name', 'Student')
            rhythm = student_data.get('rhythm_state', {})
            state = rhythm.get('state', '')
            if state == 'in_flow':
                in_flow_names.append(name)
            elif state in ['building', 'resting', 'fresh_return', 'finding_rhythm']:
                building_names.append(name)
            else:
                at_risk_names.append(name)

        # Helper for pluralization
        def student_word(count):
            return "student" if count == 1 else "students"

        html_parts.append(
            '<div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 20px;">'
            '<h3 style="color: #374151; margin: 0 0 12px 0; font-size: 14px; letter-spacing: 0.5px;">YOUR STUDENTS AT A GLANCE</h3>'
            '<table style="width: 100%; font-size: 13px;">'
        )

        # In Flow row
        in_flow_count = len(in_flow_names)
        html_parts.append(
            '<tr>'
            f'<td style="padding: 6px 0; vertical-align: top;"><span style="display: inline-block; width: 12px; height: 12px; background: #10b981; border-radius: 50%; margin-right: 8px;"></span>In Flow: <strong>{in_flow_count}</strong> {student_word(in_flow_count)}</td>'
            '</tr>'
        )
        if in_flow_names:
            html_parts.append(
                f'<tr><td style="padding: 0 0 8px 20px; color: #6b7280; font-size: 12px;">{", ".join(in_flow_names)}</td></tr>'
            )

        # Building/Resting row
        building_count = len(building_names)
        html_parts.append(
            '<tr>'
            f'<td style="padding: 6px 0; vertical-align: top;"><span style="display: inline-block; width: 12px; height: 12px; background: #f59e0b; border-radius: 50%; margin-right: 8px;"></span>Building/Resting: <strong>{building_count}</strong> {student_word(building_count)}</td>'
            '</tr>'
        )
        if building_names:
            html_parts.append(
                f'<tr><td style="padding: 0 0 8px 20px; color: #6b7280; font-size: 12px;">{", ".join(building_names)}</td></tr>'
            )

        # Needs Attention row
        at_risk_count = len(at_risk_names)
        html_parts.append(
            '<tr>'
            f'<td style="padding: 6px 0; vertical-align: top;"><span style="display: inline-block; width: 12px; height: 12px; background: #ef4444; border-radius: 50%; margin-right: 8px;"></span>Needs Attention: <strong>{at_risk_count}</strong> {student_word(at_risk_count)}</td>'
            '</tr>'
        )
        if at_risk_names:
            html_parts.append(
                f'<tr><td style="padding: 0 0 8px 20px; color: #6b7280; font-size: 12px;">{", ".join(at_risk_names)}</td></tr>'
            )

        html_parts.append('</table></div>')

        # V2: Check-ins Overdue section
        checkins_overdue = summary.get('checkins_overdue', [])
        if checkins_overdue:
            html_parts.append(
                '<div style="border-top: 2px solid #ef4444; padding-top: 16px; margin-top: 16px;">'
                '<h3 style="color: #dc2626; margin: 0 0 12px 0; font-size: 14px; letter-spacing: 0.5px;">CHECK-INS OVERDUE</h3>'
            )

            for student_data in checkins_overdue:
                student_name = student_data['user'].get('display_name', 'Student')
                days = student_data['days_since_checkin']
                html_parts.append(
                    f'<p style="color: #374151; margin: 4px 0; font-size: 13px;">'
                    f'&bull; <strong>{student_name}</strong> - {days} days since your last check-in</p>'
                )

            html_parts.append('</div>')

        # V2: Milestones & Celebrations section
        milestones = summary.get('milestones', [])
        if milestones:
            html_parts.append(
                '<div style="border-top: 2px solid #10b981; padding-top: 16px; margin-top: 16px;">'
                '<h3 style="color: #059669; margin: 0 0 12px 0; font-size: 14px; letter-spacing: 0.5px;">MILESTONES &amp; CELEBRATIONS</h3>'
            )

            milestone_icons = {
                'first_quest': '&#127881;',  # party popper
                'quest_completion': '&#9989;',  # check mark
                'xp_milestone': '&#11088;',  # star
                'streak_milestone': '&#128293;',  # fire
            }

            for milestone in milestones:
                icon = milestone_icons.get(milestone['type'], '&#127942;')  # trophy default
                html_parts.append(
                    f'<p style="color: #374151; margin: 4px 0; font-size: 13px;">'
                    f'{icon} {milestone["message"]}</p>'
                )

            html_parts.append('</div>')

        # Yesterday's Activity section (always shown)
        html_parts.append(
            '<div style="border-top: 2px solid #e5e7eb; padding-top: 16px; margin-top: 24px;">'
            '<h3 style="color: #374151; margin: 0 0 16px 0; font-size: 14px; letter-spacing: 0.5px;">YESTERDAY\'S ACTIVITY</h3>'
        )

        if summary['students_with_activity']:
            for student_data in summary['students_with_activity']:
                student = student_data['user']
                student_name = student.get('display_name', 'Student').upper()
                tasks = student_data['tasks_completed']
                xp = student_data['xp_earned_today']
                quests = student_data.get('active_quests', [])

                # V2: Get rhythm state and streak
                rhythm = student_data.get('rhythm_state', {})
                rhythm_display = rhythm.get('state_display', 'Active')
                rhythm_color = rhythm.get('color', 'gray')
                streak = student_data.get('streak_days', 0)
                dominant_pillar = student_data.get('dominant_pillar', '')
                dominant_pct = student_data.get('dominant_pillar_pct', 0)
                pillar_warning = student_data.get('pillar_warning')

                # Color mapping for rhythm state
                color_map = {
                    'green': '#10b981',
                    'yellow': '#f59e0b',
                    'red': '#ef4444',
                    'blue': '#3b82f6',
                    'gray': '#6b7280'
                }
                state_color = color_map.get(rhythm_color, '#6b7280')

                html_parts.append(
                    f'<div style="border-top: 1px solid #e5e7eb; padding-top: 12px; margin-top: 12px;">'
                    f'<h4 style="color: #374151; margin: 0 0 4px 0; font-size: 14px; letter-spacing: 0.5px;">{student_name}</h4>'
                    f'<p style="color: #6b7280; margin: 0 0 8px 0; font-size: 12px;">'
                    f'Status: <span style="color: {state_color}; font-weight: 600;">{rhythm_display}</span>'
                )

                if streak > 0:
                    html_parts.append(f' | Streak: {streak} days')

                html_parts.append('</p>')

                # Task summary line
                if dominant_pillar and dominant_pct > 0:
                    html_parts.append(
                        f'<p style="color: #6b7280; margin: 0 0 8px 0; font-size: 12px;">'
                        f'Tasks: {len(tasks)} | XP: {xp} | Focus: {dominant_pillar} ({dominant_pct}%)</p>'
                    )
                else:
                    html_parts.append(
                        f'<p style="color: #6b7280; margin: 0 0 8px 0; font-size: 12px;">'
                        f'Tasks: {len(tasks)} | XP: {xp}</p>'
                    )

                # Separator line
                html_parts.append(
                    '<hr style="border: none; border-top: 1px dashed #d1d5db; margin: 8px 0;">'
                )

                # List tasks
                for task in tasks:
                    pillar = task.get('pillar', 'General')
                    task_xp = task.get('xp', 0)
                    html_parts.append(
                        f'<p style="color: #374151; margin: 4px 0; font-size: 13px;">'
                        f'<span style="color: #10b981;">&#10003;</span> "{task["title"]}" ({pillar}, {task_xp} XP)</p>'
                    )

                # Show active quests
                if quests:
                    quest_info = quests[0]
                    html_parts.append(
                        f'<p style="color: #6b7280; margin: 8px 0 0 0; font-size: 12px;">'
                        f'Active Quest: {quest_info["title"]} ({quest_info["progress_percentage"]}% complete)</p>'
                    )

                # V2: Pillar imbalance warning
                if pillar_warning:
                    html_parts.append(
                        f'<p style="color: #d97706; margin: 4px 0 0 0; font-size: 12px;">'
                        f'&#9888; Pillar imbalance: {pillar_warning}</p>'
                    )

                html_parts.append('</div>')
        else:
            html_parts.append(
                '<p style="color: #6b7280; margin: 0; font-size: 13px;">'
                'No task completions recorded yesterday.</p>'
            )

        html_parts.append('</div>')

        # Reach out suggested section (V2: now includes rhythm state)
        if summary['reach_out_suggested']:
            html_parts.append(
                '<div style="border-top: 2px solid #fbbf24; padding-top: 16px; margin-top: 24px;">'
                '<h3 style="color: #d97706; margin: 0 0 12px 0; font-size: 14px; letter-spacing: 0.5px;">REACH OUT SUGGESTED</h3>'
                '<p style="color: #6b7280; margin: 0 0 12px 0; font-size: 13px;">These students need your attention:</p>'
            )

            for student_data in summary['reach_out_suggested']:
                student = student_data['user']
                student_name = student.get('display_name', 'Student')
                days = student_data['days_inactive']

                # V2: Get rhythm state
                rhythm = student_data.get('rhythm_state', {})
                rhythm_display = rhythm.get('state_display', '')
                rhythm_color = rhythm.get('color', 'red')

                color_map = {
                    'green': '#10b981',
                    'yellow': '#f59e0b',
                    'red': '#ef4444',
                    'blue': '#3b82f6',
                    'gray': '#6b7280'
                }
                state_color = color_map.get(rhythm_color, '#ef4444')

                html_parts.append(
                    f'<p style="color: #374151; margin: 8px 0 4px 0; font-size: 13px;">'
                    f'&bull; <strong>{student_name}</strong> - '
                    f'<span style="color: {state_color};">{rhythm_display}</span> | '
                    f'Last active {days} days ago</p>'
                )

            html_parts.append('</div>')

        return ''.join(html_parts)
