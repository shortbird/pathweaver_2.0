"""
SIS engagement routes — teacher XP adjustments (with audit trail) + quest
inactivity alerts.

NEW, additive (/api/sis), staff-gated, org-scoped — same patterns as
routes/sis/attendance.py (including the internal cron sweep auth).
"""

from flask import Blueprint, request, jsonify

from app_config import Config
from utils.auth.decorators import require_role
from utils.logger import get_logger
from services import sis_service
from services import sis_engagement_service as engagement
from database import get_supabase_admin_client

logger = get_logger(__name__)

bp = Blueprint('sis_engagement', __name__, url_prefix='/api/sis')

STAFF_ROLES = ('org_admin', 'advisor', 'superadmin')


def _org_or_error(user_id):
    body = request.get_json(silent=True) or {}
    requested = request.args.get('organization_id') or body.get('organization_id')
    org_id = sis_service.resolve_org_id(user_id, requested)
    if not org_id:
        return None, (jsonify({
            'success': False,
            'error': 'No organization in context. Superadmins must pass ?organization_id.'
        }), 400)
    return org_id, None


def _student_in_scope(admin, student_id: str, class_ids) -> bool:
    """Is the student actively enrolled in one of the advisor's classes?"""
    if not class_ids:
        return False
    rows = (
        admin.table('class_enrollments').select('id')
        .eq('student_id', student_id).eq('status', 'active')
        .in_('class_id', class_ids).limit(1).execute()
    ).data
    return bool(rows)


@bp.route('/completions/<completion_id>/xp', methods=['PUT'])
@require_role(*STAFF_ROLES)
def adjust_completion_xp(user_id, completion_id):
    """Adjust the XP of a completed task (teacher override), with an audit row.

    Body: {"xp_value": <int >= 0>, "reason": "<required>"}

    XP model (mirrors task completion / quest deletion):
      - quest_task_completions has NO xp_awarded column; a completion's XP is
        derived from user_quest_tasks.xp_value. So the adjustment writes the new
        xp_value onto the task row.
      - Because the task IS completed, its XP already sits in user_skill_xp for
        (student, task.pillar): apply the delta there (floored at 0, same as
        quest_lifecycle_service reversals), then XPService.update_user_mastery
        recomputes the denormalized users.total_xp from user_skill_xp.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    new_xp = data.get('xp_value')
    reason = (data.get('reason') or '').strip()
    if not isinstance(new_xp, int) or isinstance(new_xp, bool) or new_xp < 0:
        return jsonify({'success': False, 'error': 'xp_value must be an integer >= 0'}), 400
    if not reason:
        return jsonify({'success': False, 'error': 'reason is required'}), 400

    admin = get_supabase_admin_client()
    comp_rows = (
        admin.table('quest_task_completions')
        .select('id, user_id, quest_id, task_id, user_quest_task_id')
        .eq('id', completion_id).limit(1).execute()
    ).data
    if not comp_rows:
        return jsonify({'success': False, 'error': 'Completion not found'}), 404
    completion = comp_rows[0]
    student_id = completion['user_id']
    task_id = completion.get('user_quest_task_id') or completion.get('task_id')
    if not task_id:
        return jsonify({'success': False, 'error': 'Completion has no linked task'}), 404

    task_rows = (
        admin.table('user_quest_tasks').select('id, user_id, quest_id, pillar, xp_value')
        .eq('id', task_id).limit(1).execute()
    ).data
    if not task_rows:
        return jsonify({'success': False, 'error': 'Task not found'}), 404
    task = task_rows[0]

    # Authorization: student must be in the caller's org; advisors additionally
    # must have the student in one of their classes (class_scope).
    if not sis_service.student_in_org(student_id, org_id):
        return jsonify({'success': False, 'error': 'Completion not found'}), 404
    scope = sis_service.class_scope(user_id, org_id)
    if scope is not None and not _student_in_scope(admin, student_id, scope):
        return jsonify({'success': False, 'error': 'Completion not found'}), 404

    xp_before = int(task.get('xp_value') or 0)
    delta = new_xp - xp_before

    admin.table('user_quest_tasks').update({'xp_value': new_xp}).eq('id', task_id).execute()

    if delta != 0:
        pillar = task.get('pillar') or 'stem'
        try:
            from utils.pillar_utils import normalize_pillar_name
            pillar = normalize_pillar_name(pillar)
        except Exception:  # noqa: BLE001 — keep the stored value if unmappable
            pass
        try:
            current = (
                admin.table('user_skill_xp').select('id, xp_amount')
                .eq('user_id', student_id).eq('pillar', pillar).execute()
            ).data
            if current:
                new_amount = max(0, int(current[0].get('xp_amount') or 0) + delta)
                admin.table('user_skill_xp').update({'xp_amount': new_amount})\
                    .eq('id', current[0]['id']).execute()
            elif delta > 0:
                admin.table('user_skill_xp').insert({
                    'user_id': student_id, 'pillar': pillar, 'xp_amount': delta,
                }).execute()
        except Exception as e:  # noqa: BLE001
            logger.error(f"XP adjustment: user_skill_xp update failed for "
                         f"{student_id[:8]}/{pillar}: {e}")
        # Recompute users.total_xp (+ mastery) from user_skill_xp — the same sync
        # task completion runs via XPService.award_xp.
        try:
            from services.xp_service import XPService
            XPService().update_user_mastery(student_id)
        except Exception as e:  # noqa: BLE001
            logger.warning(f"XP adjustment: total_xp sync failed for {student_id[:8]}: {e}")

    try:
        admin.table('sis_xp_adjustments').insert({
            'organization_id': org_id,
            'student_user_id': student_id,
            'task_id': task_id,
            'quest_id': completion.get('quest_id') or task.get('quest_id'),
            'adjusted_by': user_id,
            'xp_before': xp_before,
            'xp_after': new_xp,
            'reason': reason,
        }).execute()
    except Exception as e:  # noqa: BLE001 — the adjustment already happened; log loudly
        logger.error(f"XP adjustment audit insert failed for completion {completion_id}: {e}")

    logger.info(f"XP adjusted by {user_id[:8]}: task {str(task_id)[:8]} "
                f"{xp_before} -> {new_xp} ({reason[:60]})")
    return jsonify({'success': True, 'xp_value': new_xp})


# ── Engagement alerts ────────────────────────────────────────────────────────

@bp.route('/engagement-alerts', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_engagement_alerts(user_id):
    """Open engagement alerts with student/class/quest names. Advisors only see
    alerts for their own classes (class_scope); admins see the whole org."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    scope = sis_service.class_scope(user_id, org_id)
    return jsonify({'success': True, 'alerts': engagement.list_open_alerts(org_id, class_ids=scope)})


@bp.route('/engagement-alerts/<alert_id>/resolve', methods=['POST'])
@require_role(*STAFF_ROLES)
def resolve_engagement_alert(user_id, alert_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    scope = sis_service.class_scope(user_id, org_id)
    if not engagement.resolve_alert(org_id, alert_id, class_ids=scope):
        return jsonify({'success': False, 'error': 'Alert not found'}), 404
    return jsonify({'success': True})


@bp.route('/internal/engagement-sweep', methods=['POST'])
def engagement_sweep():
    """Cron entrypoint: raise quest-inactivity alerts for teachers.
    Auth via X-Cron-Secret, or a signed-in superadmin for manual triggering —
    mirrors /api/sis/internal/attendance-sweep exactly."""
    secret = request.headers.get('X-Cron-Secret')
    is_cron = bool(secret and Config.CRON_SECRET and secret == Config.CRON_SECRET)
    if not is_cron:
        from utils.session_manager import session_manager
        uid = session_manager.get_effective_user_id()
        is_super = False
        if uid:
            row = (
                get_supabase_admin_client().table('users').select('role')
                .eq('id', uid).limit(1).execute()
            ).data
            is_super = bool(row and row[0].get('role') == 'superadmin')
        if not is_super:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    return jsonify({'success': True, **engagement.run_sweep()})
