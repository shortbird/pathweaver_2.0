"""
Quest Detail API endpoints.
Handles quest detail views and enrollment status checking.

Part of the quests.py refactoring (P2-ARCH-1).
"""

from flask import Blueprint, jsonify, request
from database import get_supabase_admin_client, get_supabase_client
from utils.auth.decorators import require_auth
from utils.pillar_utils import normalize_pillar_name
from utils.logger import get_logger
from utils.storage_urls import sign_in_place

logger = get_logger(__name__)

bp = Blueprint('quest_detail', __name__, url_prefix='/api/quests')

# Long enough for a descriptive title, short enough to stay a title.
MAX_QUEST_TITLE_LEN = 200


def _may_rename(supabase, user_id, quest):
    """None if `user_id` may rename `quest`, else (code, message, status).

    Deliberately narrow. A personal quest is the creator's to name; once it is
    public, or once anyone else has enrolled in it, the title is shared and an
    admin owns it.
    """
    if quest.get('created_by') != user_id:
        return ('FORBIDDEN', 'Only the person who created this quest can rename it', 403)
    if quest.get('is_public'):
        return ('QUEST_IS_PUBLIC',
                'This quest is in the shared library. Ask an admin to rename it.', 409)
    # count='exact' -- never fetch rows to tally them (PostgREST truncates at 1000).
    others = (supabase.table('user_quests')
              .select('id', count='exact')
              .eq('quest_id', quest['id'])
              .neq('user_id', user_id)
              .execute().count or 0)
    if others:
        return ('QUEST_SHARED',
                'Someone else is working on this quest, so its title is shared. '
                'Ask an admin to rename it.', 409)
    return None


@bp.route('/<quest_id>', methods=['GET'])
@require_auth
def get_quest_detail(user_id: str, quest_id: str):
    """
    Get detailed information about a specific quest.
    Includes user's progress if enrolled.
    Uses user-specific tasks if enrolled, otherwise shows quest template.
    """
    try:
        # Use admin client for all queries since we're accessing user-specific data
        # User authentication is already enforced by @require_auth decorator
        # admin client justified: quest detail view with org-aware visibility check + enrollment status read for current user
        supabase = get_supabase_admin_client()

        # Get quest with course association in single query (consolidation optimization)
        # Select only needed columns instead of '*' for better performance
        quest = supabase.table('quests')\
            .select('''
                id, title, description, big_idea, header_image_url, image_url,
                material_link, quest_type, transcript_subject,
                class_review_status, class_review_submitted_at, class_review_notes,
                approach_examples, is_active, metadata, allow_custom_tasks,
                organization_id, lms_course_id, lms_platform, xp_threshold,
                created_at, created_by, is_public,
                course_quests(course_id, courses(id, cover_image_url))
            ''')\
            .eq('id', quest_id)\
            .single()\
            .execute()

        if not quest.data:
            return jsonify({
                'success': False,
                'error': 'Quest not found'
            }), 404

        quest_data = quest.data

        # Badge: creator is a student, or manually flagged in metadata.
        # (This needs created_by, which the select above used to omit -- so the
        # badge fell back to the metadata-only signal on this endpoint.)
        from utils.student_created import annotate_student_created
        annotate_student_created([quest_data])

        # Whether to offer the rename control. The PATCH below is the authority;
        # this only decides if the UI draws a pencil.
        quest_data['can_rename'] = _may_rename(supabase, user_id, quest_data) is None

        # Get all enrollments for this user and quest (select only needed columns)
        all_enrollments = supabase.table('user_quests')\
            .select('id, user_id, quest_id, is_active, completed_at, personalization_completed, created_at')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        enrollments_data = all_enrollments.data or []

        # Find active or completed enrollment
        active_enrollment = None
        completed_enrollment = None

        for enrollment in enrollments_data:
            # IMPORTANT: Check is_active FIRST before completed_at
            # A quest can have both is_active=True AND completed_at set when restarted
            # In this case, it should be treated as ACTIVE, not completed
            is_active = enrollment.get('is_active')
            has_completed_at = enrollment.get('completed_at')

            if is_active:
                # Active enrollment (even if it has a completed_at from previous completion)
                active_enrollment = enrollment
            elif has_completed_at and not is_active:
                # Truly completed (has completed_at AND is_active=False)
                completed_enrollment = enrollment

        # Template tasks are needed for the response payload further down.
        from routes.quest_types import get_template_tasks
        all_template_tasks = get_template_tasks(quest_id, filter_type='all')

        # Get user-specific tasks if enrolled (regardless of personalization_completed status)
        if active_enrollment or completed_enrollment:
            # Prioritize active enrollment over completed (fixes restart bug)
            enrollment_to_use = active_enrollment or completed_enrollment

            def _fetch_user_tasks():
                return supabase.table('user_quest_tasks')\
                    .select('id, title, description, success_criteria, pillar, xp_value, diploma_subjects, order_index, approval_status, user_quest_id, is_required, source_task_id, source_moment_id')\
                    .eq('user_quest_id', enrollment_to_use['id'])\
                    .eq('approval_status', 'approved')\
                    .order('order_index')\
                    .execute()

            # NOTE: this endpoint deliberately does NOT materialize template
            # tasks for a task-less enrollment. It used to: a read that found
            # zero tasks would copy the quest's template tasks back in, which
            # made a student's deletion of their *last* task silently undo
            # itself on the very next page load. Enrollment-creation paths own
            # the copy now (see utils/template_tasks.copy_template_tasks_to_enrollment,
            # called from routes/advisor/main.py and services/quest_invitation_service.py),
            # and the pre-existing task-less enrollments were repaired once by
            # migration 20260815000000_backfill_taskless_enrollments.sql.
            user_tasks = _fetch_user_tasks()

            # Get task completions with evidence (only columns that exist in table)
            task_completions = supabase.table('quest_task_completions')\
                .select('user_quest_task_id, evidence_text, evidence_url, completed_at')\
                .eq('user_id', user_id)\
                .eq('quest_id', quest_id)\
                .execute()

            completed_task_ids = {t['user_quest_task_id'] for t in task_completions.data} if task_completions.data else set()

            # Create a mapping of task_id to completion data for easy lookup
            completion_data_map = {t['user_quest_task_id']: t for t in task_completions.data} if task_completions.data else {}

            # Mark tasks as completed and map field names for frontend compatibility
            quest_tasks = user_tasks.data or []
            for task in quest_tasks:
                task_is_completed = task['id'] in completed_task_ids
                task['is_completed'] = task_is_completed

                # Add evidence data if task is completed
                if task['id'] in completion_data_map:
                    completion = completion_data_map[task['id']]
                    task['evidence_text'] = completion.get('evidence_text')
                    task['evidence_url'] = completion.get('evidence_url')
                    task['completed_at'] = completion.get('completed_at')
                    # Note: evidence_type and evidence_blocks are not in quest_task_completions table
                    # They may be stored in evidence_document_blocks table separately

                # Map xp_value to xp_amount for frontend compatibility
                if 'xp_value' in task:
                    task['xp_amount'] = task['xp_value']
                # Map diploma_subjects to school_subjects for frontend compatibility
                if 'diploma_subjects' in task:
                    task['school_subjects'] = task['diploma_subjects']
                # Normalize pillar to new key format for frontend
                # Frontend expects lowercase keys like 'stem', 'art', etc.
                if 'pillar' in task:
                    # Normalize pillar to new single-word key (handles legacy values)
                    try:
                        pillar_key = normalize_pillar_name(task['pillar'])
                    except ValueError:
                        pillar_key = 'art'  # Default fallback
                    task['pillar'] = pillar_key  # Send key, not display name

            # Q2: legacy response key — frontend v1 reads `quest.quest_tasks`.
            # The DB table is `user_quest_tasks`; the `quest_tasks` table was
            # archived. Keep the response key alive until the v1→v2 migration
            # retires v1 and v2 can switch to `user_quest_tasks`.
            # See AUDIT_IMPLEMENTATION_PLAN.md Q2 for the retirement plan.
            quest_data['quest_tasks'] = quest_tasks

            # Calculate progress
            total_tasks = len(quest_tasks)
            completed_count = len(completed_task_ids)

            # Prioritize active enrollment over completed (fixes restart bug)
            if active_enrollment:
                logger.info("[QUEST DETAIL] Using active enrollment")
                quest_data['user_enrollment'] = active_enrollment
                quest_data['completed_enrollment'] = None
                quest_data['progress'] = {
                    'completed_tasks': completed_count,
                    'total_tasks': total_tasks,
                    'percentage': (completed_count / total_tasks * 100) if total_tasks > 0 else 0
                }
            elif completed_enrollment:
                logger.info("[QUEST DETAIL] Using completed enrollment")
                quest_data['completed_enrollment'] = completed_enrollment
                quest_data['user_enrollment'] = completed_enrollment
                quest_data['progress'] = {
                    'completed_tasks': completed_count,
                    'total_tasks': total_tasks,
                    'percentage': 100
                }
        else:
            # Not enrolled - show empty quest (personalization required)
            logger.info("[QUEST DETAIL] User not enrolled or personalization not completed")
            quest_data['quest_tasks'] = []
            quest_data['user_enrollment'] = None
            quest_data['completed_enrollment'] = None
            quest_data['progress'] = None

        # Add template tasks for users who can enroll (not actively enrolled)
        # This allows frontend to determine whether to show "Choose Your Path" or template tasks
        from routes.quest_types import get_sample_tasks_for_quest, get_course_tasks_for_quest

        quest_type = quest_data.get('quest_type', 'optio')

        # Check if quest has template tasks (persists regardless of enrollment)
        quest_data['has_template_tasks'] = len(all_template_tasks) > 0

        # Always include template_tasks when user is not actively enrolled
        # (includes never enrolled OR completed enrollment - both can re-enroll)
        if not active_enrollment:
            # Reuse already-fetched template tasks
            quest_data['template_tasks'] = all_template_tasks
            logger.info(f"[QUEST DETAIL] Added {len(all_template_tasks)} template tasks (user not actively enrolled)")

            # Also populate legacy fields for backward compatibility
            if quest_type == 'optio':
                sample_tasks = get_sample_tasks_for_quest(quest_id, randomize=True)
                quest_data['sample_tasks'] = sample_tasks
                quest_data['preset_tasks'] = []
            elif quest_type == 'course':
                preset_tasks = get_course_tasks_for_quest(quest_id)
                quest_data['preset_tasks'] = preset_tasks
                quest_data['sample_tasks'] = []
            else:
                quest_data['sample_tasks'] = []
                quest_data['preset_tasks'] = []
        else:
            # User is actively enrolled - still include template_tasks so course pages
            # can show suggested tasks alongside the user's own tasks
            quest_data['sample_tasks'] = []
            quest_data['preset_tasks'] = []
            quest_data['template_tasks'] = all_template_tasks

        # Check if this quest is part of an active course enrollment
        # This is used to disable the "End Quest" button for course quests
        # Course data was pre-fetched in the initial query (consolidation optimization)
        active_course_enrollment = None
        course_cover_image_url = None
        try:
            # Use pre-fetched course_quests data from initial query
            course_quests_data = quest_data.pop('course_quests', []) or []

            if course_quests_data:
                course_ids = [cq['course_id'] for cq in course_quests_data]

                # Get cover image from pre-fetched data
                first_course_data = course_quests_data[0].get('courses')
                if first_course_data and first_course_data.get('cover_image_url'):
                    course_cover_image_url = first_course_data['cover_image_url']
                    # Add as fallback if quest has no header image
                    if not quest_data.get('header_image_url') and not quest_data.get('image_url'):
                        quest_data['header_image_url'] = course_cover_image_url

                # Only query needed: check user's course enrollment (single query)
                course_enrollments = supabase.table('course_enrollments')\
                    .select('id, course_id, status')\
                    .eq('user_id', user_id)\
                    .in_('course_id', course_ids)\
                    .eq('status', 'active')\
                    .execute()

                if course_enrollments.data:
                    active_course_enrollment = course_enrollments.data[0]
        except Exception as course_err:
            logger.warning(f"[QUEST DETAIL] Error checking course enrollment: {course_err}")

        quest_data['active_course_enrollment'] = active_course_enrollment
        quest_data['course_cover_image_url'] = course_cover_image_url

        # ── Include linked learning moments as virtual completed tasks ──
        # Moments attached to this quest appear as pre-completed tasks with is_moment=True
        try:
            from services.interest_tracks_service import InterestTracksService
            moment_result = InterestTracksService.get_quest_moments(
                user_id=user_id,
                quest_id=quest_id,
                limit=100,
                offset=0
            )
            quest_moments = moment_result.get('moments', []) if moment_result.get('success') else []

            # Get existing task IDs to avoid counting moments in progress twice
            existing_task_ids = {t['id'] for t in quest_data.get('quest_tasks', [])}

            # Moments that have already been promoted to a real task (via
            # convert-to-task) carry source_moment_id on that task. Skip injecting
            # them as virtual moment-tasks or the quest shows the moment AND the
            # task side by side (bug #12: "adds the moment to the quest and also
            # creates a redundant task"). get_quest_moments only flags COMPLETED
            # conversions; a just-converted task is still incomplete, so we dedupe
            # against every real task here, complete or not.
            converted_moment_ids = {
                t['source_moment_id']
                for t in quest_data.get('quest_tasks', [])
                if t.get('source_moment_id')
            }

            moment_tasks = []
            for m in quest_moments:
                if m.get('id') in converted_moment_ids:
                    continue
                # Evidence-for-a-task moments (auto-created when a student adds
                # evidence to a task — description "Evidence for: <task>") are
                # already represented by the task they're attached to. Injecting
                # them as their own virtual task showed the real task AND an
                # "Evidence for: <task>" row side by side (bug: "Reharmonize a
                # hymn" + "Evidence for: Reharmonize a hymn"). Skip when the
                # attached task is already in this quest's task list.
                attached_task_id = m.get('attached_task_id')
                if attached_task_id and attached_task_id in existing_task_ids:
                    continue
                # get_quest_moments() returns a combined list of raw moments
                # AND completed-task rows (item_type='completed_task'). Only
                # the raw moments should be injected as virtual tasks here —
                # the completed tasks are already in quest_data['quest_tasks']
                # via the user_quest_tasks + quest_task_completions join above.
                # Without this filter, every completed task would appear twice.
                if m.get('item_type') != 'moment':
                    continue
                moment_id = f"moment-{m['id']}"
                if moment_id in existing_task_ids:
                    continue
                pillars = m.get('pillars', [])
                pillar = pillars[0] if pillars else 'art'
                try:
                    pillar = normalize_pillar_name(pillar)
                except (ValueError, Exception):
                    pillar = 'art'

                # Title fallback: many captured moments have a NULL title, and
                # m.get('title', default) returns None (not the default) for an
                # explicit null — which rendered as a blank task title. Fall back
                # to the first line of the description, else a generic label.
                moment_title = (m.get('title') or '').strip()
                if not moment_title:
                    desc_line = (m.get('description') or '').strip().splitlines()[0:1]
                    desc_line = desc_line[0].strip() if desc_line else ''
                    moment_title = (desc_line[:60] + ('…' if len(desc_line) > 60 else '')) or 'Learning Moment'

                moment_tasks.append({
                    'id': moment_id,
                    'title': moment_title,
                    'description': m.get('description', ''),
                    'pillar': pillar,
                    'xp_value': 50,
                    'xp_amount': 50,
                    'is_completed': True,
                    'is_moment': True,
                    'completed_at': m.get('event_date') or m.get('created_at'),
                    'evidence_blocks': m.get('evidence_blocks', []),
                    'order_index': 9999,  # Sort after real tasks
                })

            if moment_tasks:
                quest_data['quest_tasks'] = quest_data.get('quest_tasks', []) + moment_tasks
                # Update progress to include moment-tasks
                progress = quest_data.get('progress')
                if progress:
                    progress['total_tasks'] = progress['total_tasks'] + len(moment_tasks)
                    progress['completed_tasks'] = progress['completed_tasks'] + len(moment_tasks)
                    total = progress['total_tasks']
                    progress['percentage'] = (progress['completed_tasks'] / total * 100) if total > 0 else 0

        except Exception as moment_err:
            logger.warning(f"[QUEST DETAIL] Error fetching quest moments as tasks: {moment_err}")

        # ── serve signed, never public ──────────────────────────────────────
        # This is the student's own quest page, and `quest-evidence` /
        # `user-uploads` are private buckets: what the rows hold is a durable
        # pointer, not something a browser can fetch. Sign at render time, in
        # ONE batched call per bucket — a 40-task quest must not cost 40
        # storage round trips inside a single request.
        # The virtual moment-tasks carry `evidence_blocks`, and those arrive
        # already signed from InterestTracksService.get_quest_moments — signing
        # them again here would be a second storage round trip per page load for
        # no gain.
        sign_in_place(quest_data.get('quest_tasks') or [], ['evidence_url'])

        # Training a school set for its staff or families (sis_staff_training).
        # The page uses this to drop the pillar dimension: whether onboarding
        # grew your "Art" pillar is noise, and for a guardian doing back to
        # school night it is meaningless. The pillar is still stored — it is
        # NOT NULL and the XP award path requires it — just not shown.
        try:
            training = supabase.table('sis_staff_training').select('id')\
                .eq('quest_id', quest_id).limit(1).execute()
            quest_data['is_training'] = bool(training.data)
        except Exception as training_err:  # noqa: BLE001 — a badge is not worth a 500
            logger.warning(f"[QUEST DETAIL] Could not resolve training flag: {training_err}")
            quest_data['is_training'] = False

        return jsonify({
            'success': True,
            'quest': quest_data
        })

    except Exception as e:
        logger.error(f"Error getting quest detail: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch quest details'
        }), 500


@bp.route('/<quest_id>/enrollment-status', methods=['GET'])
@require_auth
def check_enrollment_status(user_id: str, quest_id: str):
    """
    Check if user is enrolled in a specific quest.
    Returns enrollment details if enrolled.
    """
    try:
        supabase = get_supabase_client()

        # Check for any enrollment (select only needed columns)
        enrollment = supabase.table('user_quests')\
            .select('id, user_id, quest_id, is_active, completed_at, personalization_completed')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        if not enrollment.data:
            return jsonify({
                'enrolled': False,
                'status': 'not_enrolled'
            })

        # Check for active enrollment
        for enr in enrollment.data:
            if enr.get('is_active') and not enr.get('completed_at'):
                return jsonify({
                    'enrolled': True,
                    'status': 'active',
                    'enrollment': enr
                })
            elif enr.get('completed_at'):
                return jsonify({
                    'enrolled': True,
                    'status': 'completed',
                    'enrollment': enr
                })

        # Has enrollment but it's inactive
        return jsonify({
            'enrolled': True,
            'status': 'inactive',
            'enrollment': enrollment.data[0]
        })

    except Exception as e:
        logger.error(f"Error checking enrollment status: {str(e)}")
        return jsonify({
            'error': 'Failed to check enrollment status'
        }), 500
@bp.route('/<quest_id>', methods=['PATCH'])
@require_auth
def rename_quest(user_id: str, quest_id: str):
    """Rename a quest you created.

    Gryffin, 2026-08-31: a quest for replacing a van's brake light was titled
    "Change van battery life" by a typo, and there was no way to correct it --
    every quest UPDATE path in the app is admin- or SIS-gated, so the person who
    created the quest could not fix their own title. The tasks underneath were
    right; only the name was wrong, and the name is what everyone reads.

    Title only, creator only, and only while the quest is still theirs alone
    (see _may_rename). Anything broader belongs in the admin quest editor.
    """
    try:
        # admin client justified: reads quests.created_by/is_public for the ownership
        # check in _may_rename, then writes the title on a quest the caller owns
        # (students have no RLS write path on quests).
        supabase = get_supabase_admin_client()

        data = request.get_json(silent=True) or {}
        if 'title' not in data:
            return jsonify({'success': False, 'error': 'Title is required'}), 400
        title = (data.get('title') or '').strip()
        if not title:
            return jsonify({'success': False, 'error': 'Title cannot be empty'}), 400
        if len(title) > MAX_QUEST_TITLE_LEN:
            return jsonify({
                'success': False,
                'error': f'Title must be {MAX_QUEST_TITLE_LEN} characters or fewer'
            }), 400

        quest = supabase.table('quests') \
            .select('id, title, created_by, is_public') \
            .eq('id', quest_id) \
            .limit(1) \
            .execute()
        if not quest.data:
            return jsonify({'success': False, 'error': 'Quest not found'}), 404

        denied = _may_rename(supabase, user_id, quest.data[0])
        if denied:
            code, message, status = denied
            return jsonify({'success': False, 'code': code, 'error': message}), status

        updated = supabase.table('quests') \
            .update({'title': title}) \
            .eq('id', quest_id) \
            .execute()
        if not updated.data:
            return jsonify({'success': False, 'error': 'Failed to rename quest'}), 500

        logger.info(f"User {user_id[:8]} renamed quest {quest_id[:8]}")
        return jsonify({'success': True, 'quest': {'id': quest_id, 'title': title}})

    except Exception as e:
        logger.error(f"Error renaming quest {quest_id}: {e}", exc_info=True)
        return jsonify({'success': False, 'error': 'Failed to rename quest'}), 500
