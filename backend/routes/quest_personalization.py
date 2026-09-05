"""
Quest Personalization API Routes
=================================

Handles the personalized quest creation workflow where students work with AI
to generate custom learning paths aligned with their interests.

REPOSITORY MIGRATION: NO MIGRATION NEEDED
- Uses personalization_service for AI-driven quest generation (service layer pattern)
- Uses TaskQualityService for task validation
- Uses DependentRepository for parent/dependent workflow
- Service layer is the preferred pattern for complex AI personalization logic
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from services.personalization_service import personalization_service
from services.task_quality_service import TaskQualityService
from datetime import datetime

from utils.logger import get_logger
from utils.ai_access import require_ai_access
from routes.personalization_validators import (
    validate_generate_tasks_request,
    validate_edit_task_request,
    validate_manual_task,
    validate_finalize_tasks_request,
    validate_accept_task_request,
    validate_skip_task_request,
    validate_manual_tasks_batch,
    validate_adjust_task_request,
    VALID_CHALLENGE_LEVELS
)
from utils.guardian_scope import GuardianAccessError, resolve_student_scope
from utils.personalization_helpers import (
    get_effective_user_id,
    check_and_complete_personalization,
    normalize_diploma_subjects,
    get_or_create_enrollment,
    get_next_order_index,
    sanitize_success_criteria
)

logger = get_logger(__name__)

bp = Blueprint('quest_personalization', __name__, url_prefix='/api/quests')

# CORS headers are set globally in app.py - do not duplicate here


def _personalization_subject(caller_id: str, data: dict) -> str:
    """Whose learning is being personalized: the caller, or a child of theirs.

    A parent generating tasks on a kid's quest sends `student_id`, the same way
    the delegated quest READ does, and everything downstream has to follow it —
    the AI consent toggle, the vision statement the prompt is built from, the
    remembered challenge level, the age band. Reading those off the caller
    tailored a 16-year-old's tasks to his mother's profile and wrote her
    challenge preference over his.

    `resolve_student_scope` is deliberately the same gate: it admits a managed
    dependent AND an approved parent_student_link, which is exactly the set the
    write endpoints under /api/family accept. `get_effective_user_id`'s
    `acting_as_dependent_id` is NOT — it is managed-dependents only, so it 403s
    for a linked student who keeps their own login.
    """
    return resolve_student_scope(caller_id, (data or {}).get('student_id'))


def _first_subject(diploma_subjects):
    """The credit a task mostly counts toward, or None.

    `diploma_subjects` is {subject_display_name: xp}; the heaviest share is the
    one that best describes the work. Used to derive a pillar for schools that
    hide the pillar picker.
    """
    if not isinstance(diploma_subjects, dict) or not diploma_subjects:
        return None
    return max(diploma_subjects.items(), key=lambda kv: kv[1] or 0)[0]


def _custom_tasks_blocked(supabase, quest_id: str):
    """403 payload when this quest's author un-ticked "Let people add their own
    tasks", or None when they did not.

    THIS is the gate. The button is hidden in the UI as well, but hiding a
    button stops nobody holding a URL, a stale tab, or the mobile app — an
    iCreate orientation quest was built with the box deliberately unchecked and
    people were adding tasks to it anyway, because no layer had ever read the
    flag.

    Defaults to allowed: the column defaults to true and older quests predate
    the checkbox, so only a deliberate un-tick blocks anything. A quest that
    cannot be read is not treated as blocked either — failing closed here would
    take the wizard down for every quest on a transient error.
    """
    try:
        row = supabase.table('quests').select('allow_custom_tasks') \
            .eq('id', quest_id).single().execute()
    except Exception:
        logger.warning(f"allow_custom_tasks unreadable for quest {quest_id[:8]}; allowing")
        return None
    if row.data and row.data.get('allow_custom_tasks') is False:
        return jsonify({
            'success': False,
            'error': "This quest doesn't allow adding your own tasks."
        }), 403
    return None


def _class_subject_override(supabase, quest_id: str, xp_value: int):
    """When the parent quest is a class, force 100% of a new task's XP into
    the class's transcript_subject. Returns (diploma_subjects, subject_xp_distribution)
    or (None, None) when the quest isn't a class.

    Why this is class-specific: AI/library tasks routinely split XP across 2-3
    diploma subjects, but a class needs ALL the work to count toward its single
    transcript subject. Without this override, a Fine Arts class's tasks would
    only deposit ~50% of their XP toward the Fine Arts credit bar.
    """
    try:
        q = supabase.table('quests') \
            .select('quest_type, transcript_subject') \
            .eq('id', quest_id).single().execute()
        if q.data and q.data.get('quest_type') == 'class' and q.data.get('transcript_subject'):
            ts = q.data['transcript_subject']
            xp = int(xp_value or 100)
            return {ts: xp}, {ts: xp}
    except Exception:
        logger.debug('intentional swallow', exc_info=True)
    return None, None


def _session_task_xp(supabase, session_id: str, title: str):
    """The XP the AI itself proposed for `title`, read back off the session.

    Only consulted when an org has locked XP editing to guides: the value the
    client posts is then untrusted, but the generated tasks stored on
    quest_personalization_sessions.ai_generated_tasks were produced server-side,
    so they are a safe source of a per-task XP that still reflects task size.

    Returns None when there's no session, no match (the student renamed the task
    via edit-task), or the row can't be read -- callers fall back to the default.
    """
    if not session_id or not title:
        return None

    try:
        result = supabase.table('quest_personalization_sessions')\
            .select('ai_generated_tasks')\
            .eq('id', session_id)\
            .maybe_single()\
            .execute()

        generated = (getattr(result, 'data', None) or {}).get('ai_generated_tasks') or {}
        tasks = generated.get('tasks') if isinstance(generated, dict) else None
        if not isinstance(tasks, list):
            return None

        wanted = title.strip().lower()
        for candidate in tasks:
            if not isinstance(candidate, dict):
                continue
            if (candidate.get('title') or '').strip().lower() == wanted:
                xp = candidate.get('xp_value')
                return int(xp) if isinstance(xp, (int, float)) and xp > 0 else None
    except Exception:
        logger.debug('session XP lookup failed', exc_info=True)

    return None


def persist_accepted_task(supabase, subject_service, target_user_id: str, quest_id: str,
                          task: dict, *, save_to_library: bool = True,
                          caller_role: str = None, server_xp: int = None):
    """Shared persistence for an accepted/created quest task.

    Single source of truth for turning a task dict (AI-suggested or hand-built)
    into a user_quest_tasks row, so the student self-accept path
    (accept_task_immediate) and the parent on-behalf-of-child path
    (family_quests.create_task_for_dependent) store IDENTICAL data — including
    success_criteria (the Definition of Done), AI subject classification, diploma
    subjects, and the class-XP override. `target_user_id` is whose enrollment the
    task is written to (self, or the managed child); callers own authorization.

    `caller_role` is the acting user's effective role and `server_xp` the
    platform-generated XP for this task (the AI's suggestion), both used to apply
    the org's XP policy: when a school has locked XP editing to guides, a
    non-guide's `xp_value` is discarded in favour of `server_xp`.

    Returns the inserted row dict, or None if the insert returned no data.
    """
    from services.task_library_service import TaskLibraryService
    from utils.pillar_utils import normalize_pillar_name
    from utils.school_subjects import pillar_for_subject
    from utils.xp_permissions import resolve_learner_task_xp
    from routes.tasks.xp_helpers import get_subject_xp_distribution

    # Resolve the (client-controlled) xp_value before it's persisted and copied
    # into the shared task library: clamped to 1..200 for non-guides always, and
    # replaced outright when the learner's org locked XP editing.
    resolved_xp, overridden = resolve_learner_task_xp(
        task.get('xp_value', 100),
        caller_role=caller_role,
        learner_id=target_user_id,
        server_xp=server_xp,
    )
    if overridden:
        logger.info(
            f"Task XP for user {target_user_id} adjusted from "
            f"{task.get('xp_value')} to {resolved_xp} by org XP policy"
        )
    task['xp_value'] = resolved_xp

    user_quest_id = get_or_create_enrollment(target_user_id, quest_id)

    raw_diploma_subjects = task.get('diploma_subjects')
    diploma_subjects = normalize_diploma_subjects(
        raw_diploma_subjects or {},
        task.get('xp_value', 100)
    )

    # Every caller of this helper serves surfaces where a school may have
    # switched the pillars off (feature_flags.hide_pillars) and sent no pillar.
    # The column is NOT NULL, so derive one from the credit that WAS chosen
    # rather than requiring the field — requiring it strands the family behind a
    # validation error naming a control they cannot see (Hearthwood, 2026-08-25:
    # a parent's IEW writing task refused to finalize over the missing pillar).
    raw_pillar = task.get('pillar')
    if raw_pillar:
        try:
            pillar_key = normalize_pillar_name(raw_pillar)
        except ValueError:
            pillar_key = 'stem'
    else:
        pillar_key = pillar_for_subject(_first_subject(diploma_subjects))
    next_order = get_next_order_index(target_user_id, quest_id)

    # The credit shown to the learner is the credit they get. The
    # personalization wizard renders diploma_subjects ("Diploma Credits: Social
    # Studies (200 XP)") on the card they accept, so that split is a promise.
    # Re-classifying here with a SECOND, independent Gemini call answered the
    # same question from scratch and silently won at credit time, because
    # get_subject_xp_distribution reads subject_xp_distribution first: a task
    # accepted as 200 Social Studies paid out 140 Social Studies + 60 Language
    # Arts. Only classify when the task arrived with no subject of its own.
    # (The manual-task path below has always worked this way.)
    subject_xp_distribution = {}
    if raw_diploma_subjects:
        subject_xp_distribution = get_subject_xp_distribution(
            {'diploma_subjects': diploma_subjects},
            task.get('xp_value', 100)
        )
    else:
        try:
            subject_xp_distribution = subject_service.classify_task_subjects(
                title=task['title'],
                description=task.get('description', ''),
                pillar=pillar_key,
                xp_value=task.get('xp_value', 100)
            )
        except Exception as e:
            logger.error(f"Failed to generate subject distribution for task '{task.get('title')}': {e}")

    # Class override: dump 100% of XP into the class's transcript_subject.
    class_ds, class_sxd = _class_subject_override(supabase, quest_id, task.get('xp_value', 100))
    if class_ds is not None:
        diploma_subjects = class_ds
        subject_xp_distribution = class_sxd

    user_task = {
        'user_id': target_user_id,
        'quest_id': quest_id,
        'user_quest_id': user_quest_id,
        'title': task['title'],
        'description': task.get('description', ''),
        'success_criteria': sanitize_success_criteria(task.get('success_criteria')) or None,
        'pillar': pillar_key,
        'diploma_subjects': diploma_subjects,
        'subject_xp_distribution': subject_xp_distribution if subject_xp_distribution else None,
        'xp_value': task.get('xp_value', 100),
        'order_index': next_order,
        'is_required': False,
        'is_manual': False,
        'approval_status': 'approved',
        'created_at': datetime.utcnow().isoformat()
    }

    result = supabase.table('user_quest_tasks').insert(user_task).execute()
    if not result.data:
        return None

    if save_to_library:
        try:
            library_service = TaskLibraryService()
            library_service.add_library_task(quest_id, {
                'title': task['title'],
                'description': task.get('description', ''),
                'success_criteria': sanitize_success_criteria(task.get('success_criteria')) or None,
                'pillar': pillar_key,
                'xp_value': task.get('xp_value', 100),
                'diploma_subjects': diploma_subjects,
                'ai_generated': True
            })
        except Exception as e:
            logger.error(f"Failed to save task to library: {e}")

    return result.data[0]


@bp.route('/<quest_id>/start-personalization', methods=['POST'])
@require_auth
def start_personalization(user_id: str, quest_id: str):
    """
    Begin the personalization flow for a quest.
    Creates or resumes a personalization session.

    Optional body parameter:
        acting_as_dependent_id: UUID of dependent (if parent is acting on behalf of child)
    """
    try:
        # admin client justified: reads one quests row's allow_custom_tasks flag to
        # authorize the caller's own request under @require_auth; no user data touched
        blocked = _custom_tasks_blocked(get_supabase_admin_client(), quest_id)
        if blocked:
            return blocked

        # Get optional acting_as_dependent_id from request body
        data = request.get_json() or {}
        acting_as_dependent_id = data.get('acting_as_dependent_id')

        # Determine effective user ID (handles parent -> dependent delegation).
        # `student_id` is the newer, wider form used by the mobile parent quest
        # view: it also covers a student with their own login whom the caller is
        # linked to, whereas acting_as_dependent_id is managed-dependents only.
        if data.get('student_id'):
            effective_user_id = _personalization_subject(user_id, data)
        else:
            effective_user_id = get_effective_user_id(user_id, acting_as_dependent_id)

        result = personalization_service.start_personalization_session(
            user_id=effective_user_id,
            quest_id=quest_id
        )

        if not result['success']:
            return jsonify(result), 400

        return jsonify({
            'success': True,
            'session_id': result['session']['id'],
            'session': result['session'],
            'resumed': result.get('resumed', False),
            'acting_as_dependent': acting_as_dependent_id is not None,
            'message': 'Personalization session started' if not result.get('resumed') else 'Resuming personalization session'
        })

    except GuardianAccessError as e:
        logger.warning(f"Guardian access denied in start_personalization: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 403
    except PermissionError as e:
        logger.warning(f"Permission denied in start_personalization: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 403
    except Exception as e:
        logger.error(f"Error starting personalization: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to start personalization'
        }), 500


@bp.route('/<quest_id>/generate-tasks', methods=['POST'])
@require_auth
def generate_tasks(user_id: str, quest_id: str):
    """
    Generate AI task suggestions based on student inputs.
    Always generates 10 tasks per request.

    Request body:
    {
        "session_id": "uuid",
        "approach": "real_world_project|traditional_class|hybrid" (optional, defaults to 'hybrid'),
        "interests": ["basketball", "piano", "..."],
        "cross_curricular_subjects": ["math", "science", "..."],
        "student_id": "uuid" (optional) - a child of the caller's, when a parent
            is generating tasks on that child's quest. Everything personal to
            the learner is then read off the CHILD: the AI consent toggle, the
            vision statement, the challenge level, the age band.
    }
    """
    try:
        # admin client justified: reads one quests row's allow_custom_tasks flag to
        # authorize the caller's own request under @require_auth; no user data touched
        blocked = _custom_tasks_blocked(get_supabase_admin_client(), quest_id)
        if blocked:
            return blocked

        data = request.get_json()

        # Validate request
        is_valid, error = validate_generate_tasks_request(data)
        if not is_valid:
            return jsonify({'success': False, 'error': error}), 400

        # Whose learning this is. A parent generating on a kid's quest sends
        # student_id; everyone else is personalizing for themselves.
        subject_id = _personalization_subject(user_id, data)

        # Check AI access before proceeding. Against the STUDENT, not the
        # caller: the toggle being honored is the parent's answer to "may my
        # child's work be sent to an AI vendor" (see utils/ai_access), and it is
        # the child's content that goes into the prompt.
        ai_access_error = require_ai_access(subject_id)
        if ai_access_error:
            return ai_access_error

        session_id = data.get('session_id')
        approach = data.get('approach', 'hybrid')
        interests = data.get('interests', [])
        cross_curricular_subjects = data.get('cross_curricular_subjects', [])
        exclude_tasks = data.get('exclude_tasks', [])
        additional_feedback = data.get('additional_feedback', '')

        # The Treehouse: tailor task difficulty/reading-level to the learner's age.
        # Explicit body value wins; otherwise derive from the student's cohort
        # ('Littles (5-7)' / 'Bigs (8-13)'). No-op for non-Treehouse users.
        age_band = data.get('age_band')
        if not age_band:
            try:
                from utils.treehouse import is_treehouse_member
                # admin client justified: derives the student's Treehouse age band from org tables (organizations / class_enrollments / org_classes) that have no student RLS read path
                _admin = get_supabase_admin_client()
                if is_treehouse_member(_admin, subject_id):
                    enr = _admin.table('class_enrollments').select('class_id') \
                        .eq('student_id', subject_id).eq('status', 'active').limit(1).execute()
                    if enr.data:
                        cls = _admin.table('org_classes').select('name') \
                            .eq('id', enr.data[0]['class_id']).limit(1).execute()
                        name = (cls.data[0]['name'] if cls.data else '') or ''
                        if '5-7' in name:
                            age_band = '5-7'
                        elif '8-13' in name:
                            age_band = '8-13'
            except Exception as e:
                logger.warning(f"Treehouse age_band derivation failed: {e}")

        # Challenge level: explicit body value wins; otherwise the user's stored
        # preference; otherwise 'standard'. Fetched alongside the vision (bio)
        # so no extra round trip.
        challenge_level = data.get('challenge_level')

        # Fetch user's learning vision (bio field) for AI context
        vision_statement = ''
        try:
            # admin client justified: AI-personalized quest creation writes user_quests + user_quest_tasks scoped to caller (self) under @require_auth
            supabase = get_supabase_admin_client()
            user_result = supabase.table('users').select('bio, preferred_challenge_level').eq('id', subject_id).single().execute()
            if user_result.data:
                if user_result.data.get('bio'):
                    vision_statement = user_result.data['bio']
                stored_level = user_result.data.get('preferred_challenge_level')
                if not challenge_level and stored_level in VALID_CHALLENGE_LEVELS:
                    challenge_level = stored_level
                # Remember an explicit choice for next time (fire-and-forget).
                if data.get('challenge_level') and data['challenge_level'] != stored_level:
                    try:
                        supabase.table('users')\
                            .update({'preferred_challenge_level': data['challenge_level']})\
                            .eq('id', subject_id).execute()
                    except Exception as e:
                        logger.warning(f"Could not persist preferred_challenge_level: {e}")
        except Exception as e:
            logger.warning(f"Could not fetch user vision statement: {e}")
        challenge_level = challenge_level or 'standard'

        # Class quests carry a transcript_subject — auto-inject it into the
        # cross_curricular list so generated tasks naturally pay XP toward
        # the class subject. Student-supplied subjects still come along.
        try:
            # admin client justified: reads quest_type/transcript_subject of the quest being personalized regardless of catalog visibility (candidate for user-client scoping)
            supabase_admin = get_supabase_admin_client()
            quest_row = supabase_admin.table('quests')\
                .select('quest_type, transcript_subject')\
                .eq('id', quest_id).single().execute()
            if quest_row.data and quest_row.data.get('quest_type') == 'class':
                ts = quest_row.data.get('transcript_subject')
                if ts and ts not in cross_curricular_subjects:
                    cross_curricular_subjects = [ts, *cross_curricular_subjects]
        except Exception as e:
            logger.warning(f"Could not check class context for quest {quest_id}: {e}")

        # Generate tasks
        result = personalization_service.generate_task_suggestions(
            session_id=session_id,
            quest_id=quest_id,
            approach=approach,
            interests=interests,
            cross_curricular_subjects=cross_curricular_subjects,
            exclude_tasks=exclude_tasks,
            additional_feedback=additional_feedback,
            vision_statement=vision_statement,
            age_band=age_band,
            challenge_level=challenge_level
        )

        if not result['success']:
            return jsonify(result), 500

        return jsonify({
            'success': True,
            'tasks': result['tasks'],
            'cached': result.get('cached', False),
            'message': 'Tasks generated successfully' + (' (from cache)' if result.get('cached') else '')
        })

    except GuardianAccessError as e:
        logger.warning(f"Guardian access denied in generate_tasks: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error generating tasks: {str(e)}")
        error_str = str(e).lower()

        # Check for rate limiting errors from Gemini API
        if '429' in error_str or 'too many requests' in error_str or 'quota' in error_str or 'rate limit' in error_str:
            return jsonify({
                'success': False,
                'error': 'AI service rate limit reached. Please wait 30 seconds and try again.'
            }), 429
        elif '403' in error_str or 'api key' in error_str or 'leaked' in error_str:
            return jsonify({
                'success': False,
                'error': 'AI service configuration error. Please contact support.'
            }), 500
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to generate tasks. Please try again.'
            }), 500


@bp.route('/<quest_id>/refine-tasks', methods=['POST'])
@require_auth
def refine_tasks(user_id: str, quest_id: str):
    """
    Regenerate tasks with different interests/subjects.
    """
    try:
        data = request.get_json()

        session_id = data.get('session_id')
        approach = data.get('approach')
        interests = data.get('interests', [])
        cross_curricular_subjects = data.get('cross_curricular_subjects', [])

        if not session_id:
            return jsonify({
                'success': False,
                'error': 'session_id is required'
            }), 400

        # This is essentially the same as generate_tasks, but allows re-generation
        challenge_level = data.get('challenge_level')
        if challenge_level not in VALID_CHALLENGE_LEVELS:
            challenge_level = None

        result = personalization_service.generate_task_suggestions(
            session_id=session_id,
            quest_id=quest_id,
            approach=approach or 'real_world_project',
            interests=interests,
            cross_curricular_subjects=cross_curricular_subjects,
            challenge_level=challenge_level
        )

        if not result['success']:
            return jsonify(result), 500

        return jsonify({
            'success': True,
            'tasks': result['tasks'],
            'message': 'Tasks refined successfully'
        })

    except Exception as e:
        logger.error(f"Error refining tasks: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to refine tasks'
        }), 500


@bp.route('/<quest_id>/edit-task', methods=['POST'])
@require_auth
def edit_task(user_id: str, quest_id: str):
    """
    Student edits a task description. AI reformats and enhances it.

    Request body:
    {
        "session_id": "uuid",
        "task_index": 0,
        "student_edits": "I want to build a basketball stats tracker..."
    }
    """
    try:
        data = request.get_json()

        # Validate request
        is_valid, error = validate_edit_task_request(data)
        if not is_valid:
            return jsonify({'success': False, 'error': error}), 400

        result = personalization_service.refine_task(
            session_id=data['session_id'],
            task_index=data['task_index'],
            student_edits=data['student_edits']
        )

        if not result['success']:
            return jsonify(result), 400

        return jsonify({
            'success': True,
            'task': result['task'],
            'message': 'Task refined based on your input'
        })

    except Exception as e:
        logger.error(f"Error editing task: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to edit task'
        }), 500


@bp.route('/<quest_id>/adjust-task-difficulty', methods=['POST'])
@require_auth
def adjust_task_difficulty(user_id: str, quest_id: str):
    """
    Rewrite a suggested task one step easier or harder (the per-task
    "complexity dial" during personalization review).

    Stateless: the client sends the task object and swaps the adjusted result
    into its local list. The task only becomes real via accept-task /
    finalize-tasks, which clamp XP server-side.

    Request body:
    {
        "task": { "title", "description", "pillar", "xp_value", "diploma_subjects"? },
        "direction": "easier" | "harder",
        "age_band": "5-7" | "8-13" (optional)
    }
    """
    try:
        # Check AI access before proceeding (same gate as generate-tasks)
        ai_access_error = require_ai_access(user_id)
        if ai_access_error:
            return ai_access_error

        data = request.get_json() or {}

        is_valid, error = validate_adjust_task_request(data)
        if not is_valid:
            return jsonify({'success': False, 'error': error}), 400

        result = personalization_service.adjust_task_complexity(
            task=data['task'],
            direction=data['direction'],
            age_band=data.get('age_band')
        )

        if not result['success']:
            return jsonify(result), 500

        return jsonify({
            'success': True,
            'task': result['task'],
            'message': 'Task adjusted'
        })

    except Exception as e:
        logger.error(f"Error adjusting task difficulty: {str(e)}")
        error_str = str(e).lower()
        if '429' in error_str or 'too many requests' in error_str or 'quota' in error_str or 'rate limit' in error_str:
            return jsonify({
                'success': False,
                'error': 'AI service rate limit reached. Please wait 30 seconds and try again.'
            }), 429
        return jsonify({
            'success': False,
            'error': 'Failed to adjust task. Please try again.'
        }), 500


@bp.route('/<quest_id>/analyze-manual-task', methods=['POST'])
@require_auth
def analyze_manual_task(user_id: str, quest_id: str):
    """
    Generate helpful suggestions for a student-created task using AI.
    Returns suggestions, suggested XP, and pillar values.
    """
    try:
        # admin client justified: reads one quests row's allow_custom_tasks flag to
        # authorize the caller's own request under @require_auth; no user data touched
        blocked = _custom_tasks_blocked(get_supabase_admin_client(), quest_id)
        if blocked:
            return blocked

        data = request.get_json()

        title = data.get('title', '').strip()
        description = data.get('description', '').strip()
        pillar = data.get('pillar', '').strip()

        # Validate inputs
        is_valid, error = validate_manual_task(title, description)
        if not is_valid:
            return jsonify({'success': False, 'error': error}), 400

        # Generate suggestions using AI
        quality_service = TaskQualityService()
        analysis = quality_service.analyze_task_quality(
            title=title,
            description=description,
            pillar=pillar if pillar else None
        )

        logger.info(
            f"Task suggestions generated for user {user_id}: "
            f"{len(analysis.get('suggestions', []))} suggestions"
        )

        return jsonify({
            'success': True,
            **analysis
        })

    except ValueError as e:
        logger.error(f"Validation error in analyze_manual_task: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except Exception as e:
        logger.error(f"Error analyzing manual task: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Failed to analyze task. Please try again.'
        }), 500


@bp.route('/<quest_id>/add-manual-tasks', methods=['POST'])
@require_auth
def add_manual_tasks_batch(user_id: str, quest_id: str):
    """
    Add multiple student-created tasks at once.
    All tasks are approved immediately - students have full control of their learning.
    """
    try:
        from utils.pillar_utils import normalize_pillar_name
        from utils.school_subjects import pillar_for_subject
        from services.subject_classification_service import SubjectClassificationService
        from routes.tasks.xp_helpers import get_subject_xp_distribution

        # admin client justified: AI-personalized quest creation writes user_quests + user_quest_tasks scoped to caller (self) under @require_auth
        supabase = get_supabase_admin_client()
        blocked = _custom_tasks_blocked(supabase, quest_id)
        if blocked:
            return blocked

        subject_service = SubjectClassificationService()
        data = request.get_json()

        tasks = data.get('tasks', [])

        # Validate request
        is_valid, error = validate_manual_tasks_batch(tasks)
        if not is_valid:
            return jsonify({'success': False, 'error': error}), 400

        # Get or create enrollment
        user_quest_id = get_or_create_enrollment(user_id, quest_id)

        # Get next order_index
        next_order = get_next_order_index(user_id, quest_id)

        # Create user_quest_tasks entries
        created_tasks = []

        # Resolve the org XP policy once for the whole batch rather than per task.
        from utils.xp_permissions import (
            get_effective_role_for,
            resolve_learner_task_xp,
            xp_locked_for_learner,
        )
        caller_role = get_effective_role_for(user_id)
        xp_locked = xp_locked_for_learner(user_id)

        for idx, task in enumerate(tasks):
            # QP-1 fix: xp_value is student-controlled and these tasks are
            # auto-approved (approval_status='approved'), so an uncapped value
            # would let a student self-award arbitrary XP and corrupt
            # leaderboards + badge thresholds. Coerce to int and clamp to the
            # allowed range BEFORE it flows into distribution/credit below.
            # min_xp=1 matches the UI's validated floor (ManualTaskCreator
            # offers a 25 XP quick task; the default floor of 50 silently
            # rewrote it). QP-1's security concern was only the upper cap.
            #
            # These are hand-written tasks, so there is no AI suggestion to fall
            # back on: under an org XP lock they all take the platform default
            # and a guide sizes them afterward.
            task['xp_value'], _ = resolve_learner_task_xp(
                task.get('xp_value', 100),
                caller_role=caller_role,
                locked=xp_locked,
            )

            # Ensure diploma_subjects is a dict
            raw_diploma_subjects = task.get('diploma_subjects')
            diploma_subjects = normalize_diploma_subjects(
                raw_diploma_subjects or {},
                task.get('xp_value', 100)
            )

            # Normalize pillar name. A school that hides the pillars
            # (feature_flags.hide_pillars) shows no picker, so the client sends
            # none — but the column is NOT NULL. Derive it from the credit the
            # family DID choose rather than filing every task under 'stem'.
            raw_pillar = task.get('pillar')
            if raw_pillar:
                try:
                    pillar_key = normalize_pillar_name(raw_pillar)
                except ValueError:
                    pillar_key = 'stem'
            else:
                pillar_key = pillar_for_subject(_first_subject(diploma_subjects))

            # Determine the subject XP distribution. When the student explicitly
            # chose the credit (diploma_subjects sent from the task creator), that
            # choice is authoritative — convert it straight to normalized subject
            # keys so it wins at credit-request time (get_subject_xp_distribution
            # reads subject_xp_distribution first). Only fall back to AI
            # classification when no explicit subject was provided.
            subject_xp_distribution = {}
            if raw_diploma_subjects:
                subject_xp_distribution = get_subject_xp_distribution(
                    {'diploma_subjects': diploma_subjects},
                    task.get('xp_value', 100)
                )
            else:
                try:
                    subject_xp_distribution = subject_service.classify_task_subjects(
                        title=task['title'],
                        description=task.get('description', ''),
                        pillar=pillar_key,
                        xp_value=task.get('xp_value', 100)
                    )
                    logger.info(f"Generated subject distribution for manual task '{task['title']}': {subject_xp_distribution}")
                except Exception as e:
                    logger.error(f"Failed to generate subject distribution for manual task '{task['title']}': {e}")

            # Class override: dump 100% of XP into the class's transcript_subject.
            class_ds, class_sxd = _class_subject_override(supabase, quest_id, task.get('xp_value', 100))
            if class_ds is not None:
                diploma_subjects = class_ds
                subject_xp_distribution = class_sxd

            user_task = {
                'user_id': user_id,
                'quest_id': quest_id,
                'user_quest_id': user_quest_id,
                'title': task['title'],
                'description': task.get('description', ''),
                'success_criteria': sanitize_success_criteria(task.get('success_criteria')) or None,
                'pillar': pillar_key,
                'diploma_subjects': diploma_subjects,
                'subject_xp_distribution': subject_xp_distribution if subject_xp_distribution else None,
                'xp_value': task.get('xp_value', 100),
                'order_index': next_order + idx,
                'is_required': False,
                'is_manual': True,
                'approval_status': 'approved',
                'created_at': datetime.utcnow().isoformat()
            }

            result = supabase.table('user_quest_tasks')\
                .insert(user_task)\
                .execute()

            if result.data:
                created_tasks.append(result.data[0])

        logger.info(
            f"User {user_id} added {len(created_tasks)} manual tasks to quest {quest_id}"
        )

        return jsonify({
            'success': True,
            'tasks': created_tasks,
            'message': f'Added {len(created_tasks)} task(s) to your quest!'
        })

    except Exception as e:
        logger.error(f"Error adding manual tasks: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Failed to add tasks. Please try again.'
        }), 500


@bp.route('/<quest_id>/add-path-tasks', methods=['POST'])
@require_auth
def add_path_tasks(user_id: str, quest_id: str):
    """
    Create the tasks for a pre-authored "path" (a quests.approach_examples entry).

    The student picks one of the quest's curated paths in the personalization
    wizard; we materialize that path's tasks into user_quest_tasks. Rows are
    written to mirror the AI-generated ("accept-task") path exactly —
    approval_status='approved', is_manual=False — so downstream XP accrual,
    the quest-complete trigger, and LTI AGS grade passback behave identically.

    Tasks are loaded SERVER-SIDE from the quest's approach_examples by index;
    the client only sends approach_index, so it cannot inject arbitrary tasks.

    Request body:
    {
        "approach_index": <int>   # index into quests.approach_examples
    }
    """
    try:
        from utils.pillar_utils import normalize_pillar_name, PILLAR_KEYS
        from utils.school_subjects import PILLAR_TO_SUBJECTS
        from app_config import Config

        # admin client justified: AI-personalized quest creation writes user_quests + user_quest_tasks scoped to caller (self) under @require_auth
        supabase = get_supabase_admin_client()
        blocked = _custom_tasks_blocked(supabase, quest_id)
        if blocked:
            return blocked

        data = request.get_json() or {}

        approach_index = data.get('approach_index')
        if not isinstance(approach_index, int) or isinstance(approach_index, bool) or approach_index < 0:
            return jsonify({
                'success': False,
                'error': 'approach_index (a non-negative integer) is required'
            }), 400

        # Load the quest's curated paths (+ class fields for the credit override)
        quest_result = supabase.table('quests')\
            .select('approach_examples, quest_type, transcript_subject')\
            .eq('id', quest_id)\
            .single()\
            .execute()

        if not quest_result.data:
            return jsonify({'success': False, 'error': 'Quest not found'}), 404

        quest = quest_result.data
        raw = quest.get('approach_examples')
        # Stored either as a bare list or wrapped as {"approaches": [...]}.
        approaches = raw if isinstance(raw, list) else (raw.get('approaches', []) if isinstance(raw, dict) else [])

        if not approaches or approach_index >= len(approaches):
            return jsonify({'success': False, 'error': 'Invalid path selection'}), 400

        selected = approaches[approach_index] or {}
        path_tasks = selected.get('tasks') or []
        if not path_tasks:
            return jsonify({'success': False, 'error': 'Selected path has no tasks'}), 400

        # Validate pillars against the five allowed values. Fail loud in dev so
        # bad authored data is caught; in prod, coerce to 'stem' (below) so a
        # single typo never crashes a student mid-quest.
        for task in path_tasks:
            raw_pillar = (task.get('pillar') or '').strip().lower()
            if raw_pillar not in PILLAR_KEYS:
                msg = (f"Invalid pillar '{task.get('pillar')}' in approach_examples for "
                       f"quest {quest_id} (task '{task.get('title')}')")
                logger.error(msg)
                if Config.DEBUG:
                    return jsonify({'success': False, 'error': msg}), 422

        # Class credit override: a class dumps 100% of each task's XP into its
        # single transcript_subject so the credit bar moves by the full amount.
        is_class = quest.get('quest_type') == 'class' and quest.get('transcript_subject')

        def _subjects_for(pillar_key, xp):
            if is_class:
                ts = quest['transcript_subject']
                return {ts: xp}, {ts: xp}
            subj = (PILLAR_TO_SUBJECTS.get(pillar_key) or ['electives'])[0]
            return {subj: xp}, {subj: xp}

        user_quest_id = get_or_create_enrollment(user_id, quest_id)
        next_order = get_next_order_index(user_id, quest_id)

        rows = []
        for idx, task in enumerate(path_tasks):
            title = (task.get('title') or '').strip()
            if not title:
                continue

            try:
                pillar_key = normalize_pillar_name(task.get('pillar', 'stem'))
            except ValueError:
                pillar_key = 'stem'

            xp_value = int(task.get('xp_value', 100) or 100)
            diploma_subjects, subject_xp_distribution = _subjects_for(pillar_key, xp_value)

            rows.append({
                'user_id': user_id,
                'quest_id': quest_id,
                'user_quest_id': user_quest_id,
                'title': title,
                'description': task.get('description', ''),
                'success_criteria': sanitize_success_criteria(task.get('success_criteria')) or None,
                'pillar': pillar_key,
                'diploma_subjects': diploma_subjects,
                'subject_xp_distribution': subject_xp_distribution,
                'xp_value': xp_value,
                'order_index': next_order + idx,
                'is_required': False,
                'is_manual': False,
                'approval_status': 'approved',
                'created_at': datetime.utcnow().isoformat()
            })

        if not rows:
            return jsonify({'success': False, 'error': 'Selected path has no valid tasks'}), 400

        result = supabase.table('user_quest_tasks').insert(rows).execute()
        created_tasks = result.data or []

        # Mark personalization complete — the student has chosen their tasks.
        # Mirrors accept-approach; also stops the LTI wizard from auto-reopening.
        try:
            supabase.table('user_quests')\
                .update({'personalization_completed': True})\
                .eq('id', user_quest_id)\
                .execute()
        except Exception:
            logger.debug('Failed to set personalization_completed', exc_info=True)

        logger.info(
            f"User {user_id[:8]} created {len(created_tasks)} task(s) from path "
            f"'{selected.get('label')}' for quest {quest_id[:8]}"
        )

        return jsonify({
            'success': True,
            'tasks': created_tasks,
            'approach_label': selected.get('label'),
            'tasks_created': len(created_tasks),
            'message': f"Added {len(created_tasks)} task(s) from \"{selected.get('label')}\""
        })

    except Exception as e:
        logger.error(f"Error adding path tasks: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Failed to add path tasks. Please try again.'
        }), 500


@bp.route('/<quest_id>/finalize-tasks', methods=['POST'])
@require_auth
def finalize_tasks(user_id: str, quest_id: str):
    """
    Finalize personalization and create user-specific tasks.
    This enrolls the user in the quest with their personalized tasks.

    Request body:
    {
        "session_id": "uuid"
    }
    """
    try:
        # admin client justified: reads one quests row's allow_custom_tasks flag to
        # authorize the caller's own request under @require_auth; no user data touched
        blocked = _custom_tasks_blocked(get_supabase_admin_client(), quest_id)
        if blocked:
            return blocked

        data = request.get_json()

        # Validate request
        is_valid, error = validate_finalize_tasks_request(data)
        if not is_valid:
            return jsonify({'success': False, 'error': error}), 400

        session_id = data['session_id']
        selected_tasks = data['tasks']

        # Get or create enrollment
        user_quest_id = get_or_create_enrollment(user_id, quest_id)

        # Finalize personalization with selected tasks only
        result = personalization_service.finalize_personalization(
            session_id=session_id,
            user_id=user_id,
            quest_id=quest_id,
            user_quest_id=user_quest_id,
            selected_tasks=selected_tasks
        )

        if not result['success']:
            return jsonify(result), 500

        return jsonify({
            'success': True,
            'tasks': result['tasks'],
            'user_quest_id': user_quest_id,
            'message': result['message']
        })

    except Exception as e:
        logger.error(f"Error finalizing tasks: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to finalize tasks'
        }), 500


@bp.route('/<quest_id>/personalization/accept-task', methods=['POST'])
@require_auth
def accept_task_immediate(user_id: str, quest_id: str):
    """
    Immediately accept and add a single task during one-at-a-time review.
    Creates user_quest_tasks entry and saves task to library.

    Request body:
    {
        "session_id": "uuid",
        "task": { task object }
    }
    """
    try:
        from services.subject_classification_service import SubjectClassificationService

        # admin client justified: AI-personalized quest creation writes user_quests + user_quest_tasks scoped to caller (self) under @require_auth
        supabase = get_supabase_admin_client()
        blocked = _custom_tasks_blocked(supabase, quest_id)
        if blocked:
            return blocked

        subject_service = SubjectClassificationService()
        data = request.get_json()

        # Validate request
        is_valid, error = validate_accept_task_request(data)
        if not is_valid:
            return jsonify({'success': False, 'error': error}), 400

        session_id = data['session_id']
        task = data['task']

        # Under an org XP lock the client's xp_value is not trusted, but the AI's
        # own suggestion is -- it was generated server-side and stored on the
        # session. Recover it by title so a locked org keeps calibrated XP instead
        # of flattening every task to the default.
        from utils.xp_permissions import get_effective_role_for
        server_xp = _session_task_xp(supabase, session_id, task.get('title'))

        # Shared persistence: writes success_criteria, AI subject classification,
        # diploma subjects, class override, and the task library entry. Same helper
        # the parent on-behalf-of-child path uses, so both stay identical.
        inserted = persist_accepted_task(
            supabase, subject_service, user_id, quest_id, task,
            caller_role=get_effective_role_for(user_id),
            server_xp=server_xp,
        )
        if inserted is None:
            return jsonify({
                'success': False,
                'error': 'Failed to create task'
            }), 500

        logger.info(f"User {user_id} accepted task '{task['title']}' for quest {quest_id}")

        # Check if user has completed personalization (processed all AI tasks)
        check_and_complete_personalization(user_id, quest_id, session_id)

        return jsonify({
            'success': True,
            'task': inserted,
            'message': 'Task added to your quest'
        })

    except Exception as e:
        logger.error(f"Error accepting task: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to add task'
        }), 500


@bp.route('/<quest_id>/personalization/skip-task', methods=['POST'])
@require_auth
def skip_task_save_to_library(user_id: str, quest_id: str):
    """
    Save a skipped task to the library so other users can find it.
    This ensures AI-generated tasks aren't lost when users skip them.

    Request body:
    {
        "session_id": "uuid",
        "task": { task object }
    }
    """
    try:
        from services.task_library_service import TaskLibraryService
        from utils.pillar_utils import normalize_pillar_name

        data = request.get_json()

        # Validate request
        is_valid, error = validate_skip_task_request(data)
        if not is_valid:
            return jsonify({'success': False, 'error': error}), 400

        session_id = data['session_id']
        task = data['task']

        # Normalize pillar name
        try:
            pillar_key = normalize_pillar_name(task.get('pillar', 'stem'))
        except ValueError:
            pillar_key = 'stem'

        # Handle diploma_subjects format
        diploma_subjects = normalize_diploma_subjects(
            task.get('diploma_subjects', {}),
            task.get('xp_value', 100)
        )

        # Save task to library for future users
        library_service = TaskLibraryService()
        library_task_data = {
            'title': task['title'],
            'description': task.get('description', ''),
            'success_criteria': sanitize_success_criteria(task.get('success_criteria')) or None,
            'pillar': pillar_key,
            'xp_value': task.get('xp_value', 100),
            'diploma_subjects': diploma_subjects,
            'ai_generated': True
        }
        library_service.add_library_task(quest_id, library_task_data)

        logger.info(f"User {user_id} skipped task '{task['title']}' - saved to library for quest {quest_id}")

        # Check if user has completed personalization (processed all AI tasks)
        check_and_complete_personalization(user_id, quest_id, session_id)

        return jsonify({
            'success': True,
            'message': 'Task saved to library for other students'
        })

    except Exception as e:
        logger.error(f"Error saving skipped task to library: {str(e)}")
        # Don't fail the skip operation - just log the error
        return jsonify({
            'success': True,
            'message': 'Task skipped (library save failed)'
        })


@bp.route('/<quest_id>/personalization-status', methods=['GET'])
@require_auth
def get_personalization_status(user_id: str, quest_id: str):
    """
    Check if user has completed personalization for a quest.
    """
    try:
        # admin client justified: AI-personalized quest creation writes user_quests + user_quest_tasks scoped to caller (self) under @require_auth
        supabase = get_supabase_admin_client()

        enrollment = supabase.table('user_quests')\
            .select('*, quest_personalization_sessions(*)')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .eq('is_active', True)\
            .execute()

        if not enrollment.data:
            return jsonify({
                'enrolled': False,
                'personalization_completed': False
            })

        enrollment_data = enrollment.data[0]

        return jsonify({
            'enrolled': True,
            'personalization_completed': enrollment_data.get('personalization_completed', False),
            'session': enrollment_data.get('quest_personalization_sessions')
        })

    except Exception as e:
        logger.error(f"Error checking personalization status: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to check status'
        }), 500
