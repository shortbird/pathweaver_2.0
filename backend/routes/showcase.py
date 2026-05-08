"""Marketing showcase routes.

Gated by @require_showcase_access (superadmin OR users.can_view_showcase=true).
Surface owned by the marketing@optioeducation.com mailbox + superadmin.
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_showcase_access, require_auth, validate_uuid_param
from middleware.error_handler import ValidationError
from repositories.showcase_repository import ShowcaseRepository, QUEUE_STATUSES, POST_PLATFORMS
from utils.logger import get_logger

logger = get_logger(__name__)
bp = Blueprint('showcase', __name__)


def _apply_consent_redaction(detail: dict) -> dict:
    """Strip consent-restricted fields from an evidence detail payload before returning to the marketer.

    Honors:
      - consent_first_name=false: remove first/last/display_name
      - consent_age=false: remove date_of_birth
    consent_face is honored by display only (marketer self-honors per CLAUDE.md).
    """
    consent = detail.get('consent') or {}
    user = detail.get('users') or {}

    if not consent.get('consent_first_name'):
        for k in ('first_name', 'last_name', 'display_name'):
            user.pop(k, None)
    if not consent.get('consent_age'):
        user.pop('date_of_birth', None)

    detail['users'] = user
    return detail


@bp.route('/api/showcase/queue', methods=['GET'])
@require_showcase_access
def list_queue(user_id: str):
    """Paginated queue of approved evidence from consenting students.

    Query params:
        page (default 1), limit (default 30, max 100)
        status: filter by 'new'|'saved'|'scheduled'|'dismissed'|'posted'
        pillar: filter by pillar (creativity|critical_thinking|practical_skills|community|stem)
        has_image: '1' / '0' to filter by presence of an evidence image
    """
    try:
        page = max(1, int(request.args.get('page', 1)))
        limit = min(100, max(1, int(request.args.get('limit', 30))))
        offset = (page - 1) * limit

        status = request.args.get('status')
        if status and status not in QUEUE_STATUSES:
            raise ValidationError(f"Invalid status: {status}")

        pillar = request.args.get('pillar')
        has_image = request.args.get('has_image')
        has_image_bool = None
        if has_image == '1':
            has_image_bool = True
        elif has_image == '0':
            has_image_bool = False

        repo = ShowcaseRepository()
        result = repo.list_queue(status=status, pillar=pillar, has_image=has_image_bool,
                                 limit=limit, offset=offset)
        return jsonify({
            'items': result['items'],
            'pagination': {
                'page': page,
                'limit': limit,
                'total': result['total'],
                'pages': (result['total'] + limit - 1) // limit if result['total'] else 1,
            }
        }), 200
    except (ValueError, ValidationError) as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"showcase queue failed: {e}", exc_info=True)
        return jsonify({'error': 'Failed to load queue'}), 500


@bp.route('/api/showcase/evidence/<evidence_id>', methods=['GET'])
@require_showcase_access
@validate_uuid_param('evidence_id')
def get_evidence(user_id: str, evidence_id: str):
    """Detail view for the composer pane."""
    try:
        repo = ShowcaseRepository()
        detail = repo.get_evidence_detail(evidence_id)
        if not detail:
            return jsonify({'error': 'Not found'}), 404
        return jsonify(_apply_consent_redaction(detail)), 200
    except Exception as e:
        logger.error(f"showcase evidence detail failed: {e}", exc_info=True)
        return jsonify({'error': 'Failed to load evidence'}), 500


@bp.route('/api/showcase/evidence/<evidence_id>/status', methods=['PATCH'])
@require_showcase_access
@validate_uuid_param('evidence_id')
def patch_status(user_id: str, evidence_id: str):
    """Update queue state: status, scheduled_for, notes, caption_final."""
    try:
        body = request.get_json() or {}
        if not body:
            return jsonify({'error': 'Empty body'}), 400
        repo = ShowcaseRepository()
        out = repo.update_status(evidence_id, body, user_id)
        return jsonify(out), 200
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"showcase status patch failed: {e}", exc_info=True)
        return jsonify({'error': 'Failed to update status'}), 500


@bp.route('/api/showcase/evidence/<evidence_id>/post', methods=['POST'])
@require_showcase_access
@validate_uuid_param('evidence_id')
def record_post(user_id: str, evidence_id: str):
    """Record a published post: platform + URL + caption used."""
    try:
        body = request.get_json() or {}
        platform = body.get('platform')
        post_url = body.get('post_url')
        caption_used = body.get('caption_used')
        notes = body.get('notes')

        if not platform or platform not in POST_PLATFORMS:
            raise ValidationError(f"platform must be one of {POST_PLATFORMS}")
        if not post_url or not post_url.startswith(('http://', 'https://')):
            raise ValidationError("post_url is required and must be a URL")

        repo = ShowcaseRepository()
        post = repo.record_post(evidence_id, platform, post_url, caption_used, user_id, notes=notes)
        return jsonify(post), 201
    except (ValueError, ValidationError) as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"showcase record post failed: {e}", exc_info=True)
        return jsonify({'error': 'Failed to record post'}), 500


@bp.route('/api/showcase/posts/<post_id>', methods=['PATCH'])
@require_showcase_access
@validate_uuid_param('post_id')
def patch_post(user_id: str, post_id: str):
    """Edit a post record (URL, caption, notes) or mark take-down complete."""
    try:
        body = request.get_json() or {}
        repo = ShowcaseRepository()
        out = repo.update_post(post_id, body, user_id)
        return jsonify(out), 200
    except Exception as e:
        logger.error(f"showcase post patch failed: {e}", exc_info=True)
        return jsonify({'error': 'Failed to update post'}), 500


@bp.route('/api/showcase/takedowns', methods=['GET'])
@require_showcase_access
def list_takedowns(user_id: str):
    """Posts pending take-down (consent was revoked after posting)."""
    try:
        repo = ShowcaseRepository()
        return jsonify({'items': repo.list_pending_takedowns()}), 200
    except Exception as e:
        logger.error(f"showcase takedowns failed: {e}", exc_info=True)
        return jsonify({'error': 'Failed to load takedowns'}), 500


# ─── AI assist ────────────────────────────────────────────────────────────────

@bp.route('/api/showcase/evidence/<evidence_id>/ai/captions', methods=['POST'])
@require_showcase_access
@validate_uuid_param('evidence_id')
def ai_captions(user_id: str, evidence_id: str):
    try:
        from services.showcase_ai_service import ShowcaseAIService
        repo = ShowcaseRepository()
        detail = repo.get_evidence_detail(evidence_id)
        if not detail:
            return jsonify({'error': 'Not found'}), 404
        svc = ShowcaseAIService()
        variants = svc.generate_captions(detail, consent=detail.get('consent'))
        return jsonify({'variants': variants}), 200
    except Exception as e:
        logger.error(f"ai captions failed: {e}", exc_info=True)
        return jsonify({'error': 'Caption generation failed'}), 500


@bp.route('/api/showcase/evidence/<evidence_id>/ai/alt-text', methods=['POST'])
@require_showcase_access
@validate_uuid_param('evidence_id')
def ai_alt_text(user_id: str, evidence_id: str):
    try:
        from services.showcase_ai_service import ShowcaseAIService
        repo = ShowcaseRepository()
        detail = repo.get_evidence_detail(evidence_id)
        if not detail:
            return jsonify({'error': 'Not found'}), 404
        svc = ShowcaseAIService()
        text = svc.generate_alt_text(detail)
        return jsonify({'alt_text': text}), 200
    except Exception as e:
        logger.error(f"ai alt-text failed: {e}", exc_info=True)
        return jsonify({'error': 'Alt-text generation failed'}), 500


@bp.route('/api/showcase/evidence/<evidence_id>/ai/quote-pull', methods=['POST'])
@require_showcase_access
@validate_uuid_param('evidence_id')
def ai_quote_pull(user_id: str, evidence_id: str):
    try:
        from services.showcase_ai_service import ShowcaseAIService
        repo = ShowcaseRepository()
        detail = repo.get_evidence_detail(evidence_id)
        if not detail:
            return jsonify({'error': 'Not found'}), 404
        svc = ShowcaseAIService()
        out = svc.generate_quote_pull(detail)
        return jsonify(out), 200
    except Exception as e:
        logger.error(f"ai quote-pull failed: {e}", exc_info=True)
        return jsonify({'error': 'Quote-pull generation failed'}), 500


# ─── Family dashboard surface ─────────────────────────────────────────────────

@bp.route('/api/showcase/student/<student_id>/posts', methods=['GET'])
@require_auth
@validate_uuid_param('student_id')
def list_student_posts(user_id: str, student_id: str):
    """List posts featuring a specific student.

    Authorization: caller must be the student themselves, or the parent of the student
    (managed_by_parent_id, or active parent_student_links). Otherwise 403.
    """
    try:
        from database import get_supabase_admin_client
        admin = get_supabase_admin_client()

        if user_id != student_id:
            # Verify parent linkage
            mp = admin.table('users').select('managed_by_parent_id').eq('id', student_id).execute()
            is_managed = bool(mp.data and mp.data[0].get('managed_by_parent_id') == user_id)

            is_linked = False
            if not is_managed:
                psl = admin.table('parent_student_links') \
                    .select('id') \
                    .eq('parent_user_id', user_id) \
                    .eq('student_user_id', student_id) \
                    .eq('status', 'active') \
                    .execute()
                is_linked = bool(psl.data)

            if not (is_managed or is_linked):
                # Allow superadmin/showcase-access too
                me = admin.table('users').select('role, can_view_showcase').eq('id', user_id).execute()
                if not me.data or (me.data[0].get('role') != 'superadmin' and not me.data[0].get('can_view_showcase')):
                    return jsonify({'error': 'Not authorized'}), 403

        repo = ShowcaseRepository()
        consent = repo.get_consent(student_id)
        posts = repo.list_posts_for_user(student_id)

        return jsonify({
            'consent_active': bool(consent and consent.get('consent_active')),
            'consent': consent,
            'posts': posts,
        }), 200
    except Exception as e:
        logger.error(f"list_student_posts failed: {e}", exc_info=True)
        return jsonify({'error': 'Failed to load posts'}), 500


@bp.route('/api/showcase/student/<student_id>/revoke', methods=['POST'])
@require_auth
@validate_uuid_param('student_id')
def parent_self_revoke(user_id: str, student_id: str):
    """Asymmetric self-revoke: parent of the student can revoke instantly. Re-enabling requires admin."""
    try:
        from database import get_supabase_admin_client
        admin = get_supabase_admin_client()

        # Authorization: must be parent of student
        mp = admin.table('users').select('managed_by_parent_id').eq('id', student_id).execute()
        is_managed = bool(mp.data and mp.data[0].get('managed_by_parent_id') == user_id)
        is_linked = False
        if not is_managed:
            psl = admin.table('parent_student_links') \
                .select('id') \
                .eq('parent_user_id', user_id) \
                .eq('student_user_id', student_id) \
                .eq('status', 'active') \
                .execute()
            is_linked = bool(psl.data)
        if not (is_managed or is_linked):
            return jsonify({'error': 'Not authorized'}), 403

        body = request.get_json() or {}
        reason = body.get('reason') or 'parent self-revoke'

        repo = ShowcaseRepository()
        result = repo.revoke_consent(student_id, user_id, reason=reason, source='parent_self_revoke')
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"parent_self_revoke failed: {e}", exc_info=True)
        return jsonify({'error': 'Failed to revoke consent'}), 500
