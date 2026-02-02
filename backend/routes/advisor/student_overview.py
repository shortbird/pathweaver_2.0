"""
Advisor Student Overview API.
Provides consolidated student overview data for advisors/org_admins viewing students.
Mirrors the parent/child_overview.py pattern.
"""
from flask import Blueprint, jsonify
from datetime import date, timedelta
from collections import defaultdict
from datetime import datetime
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth, validate_uuid_param
from middleware.error_handler import AuthorizationError, NotFoundError
from utils.pillar_utils import get_pillar_name
from utils.roles import get_effective_role
from utils.logger import get_logger
from routes.users.helpers import calculate_subject_xp_from_tasks

logger = get_logger(__name__)

bp = Blueprint('advisor_student_overview', __name__, url_prefix='/api/advisor')

# Pillar definitions for constellation
PILLAR_DEFINITIONS = [
    {'id': 'stem', 'name': 'STEM', 'description': 'Science, technology, engineering, and mathematics'},
    {'id': 'communication', 'name': 'Communication', 'description': 'Writing, speaking, storytelling, and presentation'},
    {'id': 'art', 'name': 'Art', 'description': 'Visual arts, music, design, and creative expression'},
    {'id': 'wellness', 'name': 'Wellness', 'description': 'Health, fitness, mindfulness, and personal growth'},
    {'id': 'civics', 'name': 'Civics', 'description': 'Citizenship, community, social impact, and leadership'}
]


def map_pillar_name_to_id(pillar_name):
    """Map pillar name to ID, handling legacy names."""
    if pillar_name in ['stem', 'wellness', 'communication', 'civics', 'art']:
        return pillar_name
    legacy_mapping = {
        'stem_logic': 'stem',
        'language_communication': 'communication',
        'arts_creativity': 'art',
        'life_wellness': 'wellness',
        'society_culture': 'civics',
        'thinking_skills': 'stem',
        'creativity': 'art',
        'practical_skills': 'wellness',
        'general': 'stem'
    }
    return legacy_mapping.get(pillar_name, 'stem')


def verify_advisor_access(supabase, advisor_user_id, student_user_id):
    """
    Verify advisor/org_admin has access to view this student's data.

    Access is granted if:
    1. User is superadmin (universal access)
    2. User is assigned to the student via advisor_student_assignments
    3. User is org_admin in the same organization as the student
    """
    try:
        # Get user's role info
        user_response = supabase.table('users').select('''
            role, org_role, organization_id
        ''').eq('id', advisor_user_id).single().execute()

        if not user_response.data:
            raise AuthorizationError("User not found")

        user = user_response.data
        effective_role = get_effective_role(user)

        # Superadmin has universal access
        if effective_role == 'superadmin':
            return True

        # Get student's organization
        student_response = supabase.table('users').select('''
            organization_id
        ''').eq('id', student_user_id).single().execute()

        if not student_response.data:
            raise NotFoundError("Student not found")

        student_org_id = student_response.data.get('organization_id')
        advisor_org_id = user.get('organization_id')

        # Org admin in same organization has access
        if effective_role == 'org_admin' and advisor_org_id and advisor_org_id == student_org_id:
            return True

        # Check for advisor assignment
        assignment = supabase.table('advisor_student_assignments').select('id')\
            .eq('advisor_id', advisor_user_id)\
            .eq('student_id', student_user_id)\
            .eq('is_active', True)\
            .execute()

        if assignment.data and len(assignment.data) > 0:
            return True

        raise AuthorizationError("You do not have access to this student's data")

    except AuthorizationError:
        raise
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error in verify_advisor_access: {str(e)}")
        raise AuthorizationError("Failed to verify advisor access")


@bp.route('/student-overview/<student_id>', methods=['GET'])
@require_auth
@validate_uuid_param('student_id')
def get_student_overview(user_id, student_id):
    """
    Get consolidated overview data for a student, matching StudentOverviewPage format.
    For advisors/org_admins viewing their assigned or organization students.
    Returns: student profile, dashboard data, engagement, completed quests, subject XP, visibility.
    """
    try:
        supabase = get_supabase_admin_client()
        verify_advisor_access(supabase, user_id, student_id)

        # 1. Get student profile
        student_response = supabase.table('users').select('''
            id, first_name, last_name, avatar_url, created_at, total_xp
        ''').eq('id', student_id).single().execute()

        if not student_response.data:
            raise NotFoundError("Student not found")

        student = student_response.data

        # 2. Get XP by pillar
        skill_xp_response = supabase.table('user_skill_xp').select('''
            pillar, xp_amount
        ''').eq('user_id', student_id).execute()

        xp_by_pillar = {}
        total_xp = 0
        for row in skill_xp_response.data:
            pillar = row.get('pillar')
            xp = row.get('xp_amount', 0)
            if pillar and xp > 0:
                pillar_id = map_pillar_name_to_id(pillar)
                xp_by_pillar[pillar_id] = xp_by_pillar.get(pillar_id, 0) + xp
                total_xp += xp

        # Fallback to task completions if no XP from user_skill_xp
        if total_xp == 0:
            completed_tasks_xp = supabase.table('quest_task_completions').select('''
                user_quest_task_id,
                user_quest_tasks!quest_task_completions_user_quest_task_id_fkey(pillar, xp_value)
            ''').eq('user_id', student_id).execute()

            for completion in (completed_tasks_xp.data or []):
                task = completion.get('user_quest_tasks') or {}
                pillar = task.get('pillar')
                xp = task.get('xp_value', 0) or 0
                if pillar and xp > 0:
                    pillar_id = map_pillar_name_to_id(pillar)
                    xp_by_pillar[pillar_id] = xp_by_pillar.get(pillar_id, 0) + xp
                    total_xp += xp

        if total_xp == 0:
            total_xp = student.get('total_xp', 0) or 0

        # 3. Get active quests with progress
        active_quests_response = supabase.table('user_quests').select('''
            quest_id, started_at, is_active,
            quests!inner(id, title, image_url, header_image_url)
        ''').eq('user_id', student_id).is_('completed_at', 'null').eq('is_active', True).execute()

        active_quest_ids = [uq['quest_id'] for uq in active_quests_response.data]

        tasks_map = {}
        completions_map = {}

        if active_quest_ids:
            all_tasks_response = supabase.table('user_quest_tasks').select('id, quest_id').eq(
                'user_id', student_id
            ).in_('quest_id', active_quest_ids).execute()

            for task in all_tasks_response.data:
                qid = task['quest_id']
                if qid not in tasks_map:
                    tasks_map[qid] = []
                tasks_map[qid].append(task['id'])

            all_completions_response = supabase.table('quest_task_completions').select('task_id, quest_id, user_quest_task_id').eq(
                'user_id', student_id
            ).in_('quest_id', active_quest_ids).execute()

            for comp in all_completions_response.data:
                qid = comp['quest_id']
                task_id = comp.get('user_quest_task_id') or comp.get('task_id')
                if qid not in completions_map:
                    completions_map[qid] = []
                if task_id:
                    completions_map[qid].append(task_id)

        active_quests = []
        for uq in active_quests_response.data:
            quest = uq['quests']
            quest_id = quest['id']
            total_tasks = len(tasks_map.get(quest_id, []))
            completed_tasks = len(completions_map.get(quest_id, []))

            active_quests.append({
                'quest_id': quest_id,
                'title': quest['title'],
                'image_url': quest.get('image_url') or quest.get('header_image_url'),
                'started_at': uq['started_at'],
                'progress': {
                    'completed_tasks': completed_tasks,
                    'total_tasks': total_tasks,
                    'percentage': round((completed_tasks / total_tasks * 100)) if total_tasks > 0 else 0
                },
                'quests': {
                    'id': quest_id,
                    'title': quest['title']
                }
            })

        # 4. Get recent completions
        recent_completions_response = supabase.table('quest_task_completions').select('''
            id, completed_at, user_quest_task_id, task_id, quest_id
        ''').eq('user_id', student_id).order('completed_at', desc=True).limit(10).execute()

        recent_completions = []
        completed_tasks_count = 0

        if recent_completions_response.data:
            count_response = supabase.table('quest_task_completions').select('id', count='exact').eq('user_id', student_id).execute()
            completed_tasks_count = count_response.count or len(recent_completions_response.data)

            task_ids = list(set(
                c.get('user_quest_task_id') or c.get('task_id')
                for c in recent_completions_response.data
                if c.get('user_quest_task_id') or c.get('task_id')
            ))

            task_details = {}
            if task_ids:
                tasks_response = supabase.table('user_quest_tasks').select('id, title, pillar, xp_value').in_('id', task_ids).execute()
                task_details = {t['id']: t for t in tasks_response.data}

            for comp in recent_completions_response.data:
                task_id = comp.get('user_quest_task_id') or comp.get('task_id')
                task = task_details.get(task_id, {})
                recent_completions.append({
                    'id': comp['id'],
                    'task_title': task.get('title', 'Task'),
                    'title': task.get('title', 'Task'),
                    'pillar': get_pillar_name(task.get('pillar', 0)),
                    'xp_awarded': task.get('xp_value', 0),
                    'completed_at': comp['completed_at']
                })

        # 5. Get engagement data
        today = date.today()
        twelve_weeks_ago = today - timedelta(weeks=12)

        engagement = {
            'calendar': [],
            'rhythm': None,
            'summary': None
        }

        try:
            completions = supabase.table('quest_task_completions')\
                .select('completed_at')\
                .eq('user_id', student_id)\
                .gte('completed_at', twelve_weeks_ago.isoformat())\
                .execute()

            daily_activities = defaultdict(lambda: {'count': 0, 'activities': set()})
            all_activity_dates = set()

            for completion in (completions.data or []):
                completed_at = completion.get('completed_at')
                if completed_at:
                    date_str = completed_at[:10]
                    daily_activities[date_str]['count'] += 1
                    daily_activities[date_str]['activities'].add('task_completed')
                    all_activity_dates.add(datetime.strptime(date_str, '%Y-%m-%d').date())

            if all_activity_dates:
                first_activity = min(all_activity_dates)
            else:
                first_activity = today

            calendar_days = []
            current_date = first_activity
            while current_date <= today:
                date_str = current_date.strftime('%Y-%m-%d')
                day_data = daily_activities.get(date_str, {'count': 0, 'activities': set()})
                intensity = 0 if day_data['count'] == 0 else min(4, day_data['count'])
                calendar_days.append({
                    'date': date_str,
                    'activity_count': day_data['count'],
                    'intensity': intensity,
                    'activities': list(day_data['activities'])
                })
                current_date += timedelta(days=1)

            rhythm_state = 'ready_to_begin'
            if all_activity_dates:
                most_recent = max(all_activity_dates)
                days_since = (today - most_recent).days
                last_14 = [d for d in all_activity_dates if (today - d).days <= 14]
                if len(last_14) >= 3 and days_since <= 5:
                    rhythm_state = 'in_flow'
                elif days_since <= 3:
                    rhythm_state = 'building'
                elif 4 <= days_since <= 14:
                    rhythm_state = 'resting'

            last_week_dates = [d for d in all_activity_dates if (today - d).days <= 7]
            last_month_dates = [d for d in all_activity_dates if (today - d).days <= 30]

            engagement = {
                'calendar': calendar_days,
                'rhythm': {'state': rhythm_state},
                'summary': {
                    'active_days_last_week': len(last_week_dates),
                    'active_days_last_month': len(last_month_dates),
                    'last_activity_date': max(all_activity_dates).isoformat() if all_activity_dates else None,
                    'total_activities': sum(d['count'] for d in daily_activities.values())
                }
            }
        except Exception as e:
            logger.warning(f"Could not fetch engagement data: {str(e)}")

        # 6. Get completed quests with task evidence
        completed_quests_response = supabase.table('user_quests').select('''
            quest_id, completed_at,
            quests!inner(id, title, image_url)
        ''').eq('user_id', student_id).not_.is_('completed_at', 'null').order('completed_at', desc=True).execute()

        completed_quests = []
        completed_quest_ids = [cq['quest_id'] for cq in completed_quests_response.data]

        task_evidence_map = {}
        if completed_quest_ids:
            completions_with_evidence = supabase.table('quest_task_completions').select('''
                quest_id, user_quest_task_id, task_id, completed_at,
                user_quest_tasks!quest_task_completions_user_quest_task_id_fkey(id, title, pillar, xp_value, diploma_subjects)
            ''').eq('user_id', student_id).in_('quest_id', completed_quest_ids).execute()

            all_task_ids = [
                comp.get('user_quest_task_id') or comp.get('task_id')
                for comp in completions_with_evidence.data
                if comp.get('user_quest_task_id') or comp.get('task_id')
            ]

            evidence_docs_map = {}
            if all_task_ids:
                evidence_docs = supabase.table('user_task_evidence_documents').select('''
                    id, task_id, status,
                    evidence_document_blocks:evidence_document_blocks!document_id(id, block_type, content, order_index)
                ''').eq('user_id', student_id).eq('status', 'completed').in_('task_id', all_task_ids).execute()

                for doc in (evidence_docs.data or []):
                    task_id = doc.get('task_id')
                    if task_id:
                        blocks = doc.get('evidence_document_blocks') or []
                        blocks.sort(key=lambda b: b.get('order_index', 0))
                        evidence_docs_map[task_id] = blocks

            for comp in completions_with_evidence.data:
                qid = comp['quest_id']
                if qid not in task_evidence_map:
                    task_evidence_map[qid] = {}

                task = comp.get('user_quest_tasks') or {}
                task_id = comp.get('user_quest_task_id') or comp.get('task_id')
                if task_id:
                    task_title = task.get('title', 'Task')
                    evidence_blocks = evidence_docs_map.get(task_id, [])

                    task_evidence_map[qid][task_title] = {
                        'title': task_title,
                        'pillar': get_pillar_name(task.get('pillar', 0)),
                        'xp_awarded': task.get('xp_value', 0),
                        'completed_at': comp.get('completed_at'),
                        'diploma_subjects': task.get('diploma_subjects', {}),
                        'evidence_blocks': evidence_blocks
                    }

        for cq in completed_quests_response.data:
            quest = cq['quests']
            quest_id = quest['id']
            task_evidence = task_evidence_map.get(quest_id, {})
            total_quest_xp = sum(t.get('xp_awarded', 0) for t in task_evidence.values())

            completed_quests.append({
                'id': quest_id,
                'quest_id': quest_id,
                'title': quest['title'],
                'image_url': quest.get('image_url'),
                'completed_at': cq['completed_at'],
                'task_evidence': task_evidence,
                'total_xp_earned': total_quest_xp,
                'quest': {
                    'id': quest_id,
                    'title': quest['title']
                },
                'status': 'completed'
            })

        # 6b. Get ALL completed evidence (for portfolio)
        all_evidence_docs = supabase.table('user_task_evidence_documents').select('''
            id, task_id, quest_id, status, completed_at
        ''').eq('user_id', student_id).eq('status', 'completed').execute()

        evidence_blocks_map = {}
        if all_evidence_docs.data:
            doc_ids = [doc['id'] for doc in all_evidence_docs.data]
            blocks_response = supabase.table('evidence_document_blocks').select(
                'id, document_id, block_type, content, order_index'
            ).in_('document_id', doc_ids).execute()

            for block in (blocks_response.data or []):
                doc_id = block.get('document_id')
                if doc_id not in evidence_blocks_map:
                    evidence_blocks_map[doc_id] = []
                evidence_blocks_map[doc_id].append(block)

            for doc_id in evidence_blocks_map:
                evidence_blocks_map[doc_id].sort(key=lambda b: b.get('order_index', 0))

        portfolio_achievements = []
        if all_evidence_docs.data:
            evidence_quest_ids = list(set(doc.get('quest_id') for doc in all_evidence_docs.data if doc.get('quest_id')))
            evidence_task_ids = list(set(doc.get('task_id') for doc in all_evidence_docs.data if doc.get('task_id')))

            quest_details = {}
            if evidence_quest_ids:
                quests_response = supabase.table('quests').select('id, title, image_url').in_('id', evidence_quest_ids).execute()
                quest_details = {q['id']: q for q in quests_response.data}

            task_details = {}
            if evidence_task_ids:
                tasks_response = supabase.table('user_quest_tasks').select('id, title, pillar, xp_value, diploma_subjects').in_('id', evidence_task_ids).execute()
                task_details = {t['id']: t for t in tasks_response.data}

            quest_evidence_map = {}
            for doc in all_evidence_docs.data:
                quest_id = doc.get('quest_id')
                task_id = doc.get('task_id')
                doc_id = doc.get('id')
                if not quest_id or not task_id:
                    continue

                if quest_id not in quest_evidence_map:
                    quest_evidence_map[quest_id] = {}

                task = task_details.get(task_id, {})
                task_title = task.get('title', 'Task')
                blocks = evidence_blocks_map.get(doc_id, [])

                quest_evidence_map[quest_id][task_title] = {
                    'title': task_title,
                    'pillar': get_pillar_name(task.get('pillar', 0)),
                    'xp_awarded': task.get('xp_value', 0),
                    'completed_at': doc.get('completed_at'),
                    'diploma_subjects': task.get('diploma_subjects', {}),
                    'evidence_blocks': blocks
                }

            for quest_id, task_evidence in quest_evidence_map.items():
                quest = quest_details.get(quest_id, {})
                total_quest_xp = sum(t.get('xp_awarded', 0) for t in task_evidence.values())

                portfolio_achievements.append({
                    'id': quest_id,
                    'quest_id': quest_id,
                    'title': quest.get('title', 'Quest'),
                    'image_url': quest.get('image_url'),
                    'task_evidence': task_evidence,
                    'total_xp_earned': total_quest_xp,
                    'quest': {
                        'id': quest_id,
                        'title': quest.get('title', 'Quest')
                    },
                    'status': 'in_progress'
                })

        # 7. Get subject XP
        subject_xp_response = supabase.table('user_subject_xp').select('''
            school_subject, xp_amount
        ''').eq('user_id', student_id).execute()

        subject_xp = {}
        pending_subject_xp = {}
        for row in subject_xp_response.data:
            subject = row.get('school_subject')
            if subject:
                subject_xp[subject] = row.get('xp_amount', 0)

        if not subject_xp or all(v == 0 for v in subject_xp.values()):
            completed_tasks_subjects = supabase.table('quest_task_completions').select('''
                user_quest_task_id,
                user_quest_tasks!quest_task_completions_user_quest_task_id_fkey(xp_value, diploma_subjects)
            ''').eq('user_id', student_id).execute()
            subject_xp = calculate_subject_xp_from_tasks(completed_tasks_subjects.data or [])

        # 8. Get visibility status
        visibility_status = {
            'is_public': False,
            'pending_parent_approval': False,
            'parent_approval_denied': False
        }

        try:
            visibility_response = supabase.table('user_portfolio_settings').select('''
                is_public, pending_parent_approval, parent_approval_denied
            ''').eq('user_id', student_id).single().execute()

            if visibility_response.data:
                visibility_status = {
                    'is_public': visibility_response.data.get('is_public', False),
                    'pending_parent_approval': visibility_response.data.get('pending_parent_approval', False),
                    'parent_approval_denied': visibility_response.data.get('parent_approval_denied', False)
                }
        except Exception:
            pass

        # 9. Build pillars data for constellation
        seven_days_ago = (date.today() - timedelta(days=7)).isoformat()
        pillars_data = []
        for pillar_def in PILLAR_DEFINITIONS:
            pillar_id = pillar_def['id']
            is_active = any(
                c.get('pillar') == pillar_id and c.get('completed_at', '') >= seven_days_ago
                for c in recent_completions
            )
            pillars_data.append({
                'id': pillar_id,
                'name': pillar_def['name'],
                'description': pillar_def['description'],
                'xp': xp_by_pillar.get(pillar_id, 0),
                'isActive': is_active,
                'questCount': sum(1 for c in recent_completions if c.get('pillar') == pillar_id)
            })

        return jsonify({
            'student': {
                'id': student['id'],
                'first_name': student.get('first_name'),
                'last_name': student.get('last_name'),
                'avatar_url': student.get('avatar_url'),
                'created_at': student.get('created_at')
            },
            'dashboard': {
                'total_xp': total_xp,
                'xp_by_pillar': xp_by_pillar,
                'active_quests': active_quests,
                'recent_completions': recent_completions,
                'completed_tasks_count': completed_tasks_count
            },
            'engagement': engagement,
            'completed_quests': completed_quests,
            'portfolio_achievements': portfolio_achievements,
            'subject_xp': subject_xp,
            'pending_subject_xp': pending_subject_xp,
            'visibility_status': visibility_status,
            'pillars_data': pillars_data
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error getting student overview: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to get student overview'}), 500
