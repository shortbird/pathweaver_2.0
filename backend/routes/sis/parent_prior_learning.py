"""
SIS Parent prior-learning — a guardian files records of learning their child did
before or outside Optio, so the school can turn it into high-school credit.

NEW, additive. Shares the /api/sis/parent prefix with routes/sis/parent.py and
parent_forms.py (Flask allows several blueprints on one prefix), and follows the
same authorization model as both: @require_auth, then family relationship via
sis_parent_service.registerable_students — which is also what answers "which of
my kids is this record for" when a guardian has several.

Gated per-org on feature_flags.sis_settings.prior_learning_enabled (Optio Academy
only, for now). A guardian in an org without it gets a 404-shaped 403 rather than
an empty page, so the surface simply doesn't exist for them.
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_auth
from utils.logger import get_logger
from services import sis_parent_service as parent
from services import sis_prior_learning_service as prior

logger = get_logger(__name__)

bp = Blueprint('sis_parent_prior_learning', __name__, url_prefix='/api/sis/parent')


def _org(req):
    body = req.get_json(silent=True) or {}
    return req.args.get('organization_id') or body.get('organization_id')


def _guard(user_id, student_id=None):
    """(org_id, students, error_response). One place for the three checks every
    endpoint below shares: an org was named, it has the feature on, and the
    caller is a guardian in it (of this student, when one is named)."""
    org_id = _org(request)
    if not org_id:
        return None, None, (jsonify({'success': False,
                                     'error': 'organization_id is required'}), 400)
    students = [s for s in parent.registerable_students(user_id) if s['org_id'] == org_id]
    if not students:
        return None, None, (jsonify({'success': False,
                                     'error': 'Not authorized for this organization'}), 403)
    if not prior.enabled_for_org(org_id):
        return None, None, (jsonify({'success': False,
                                     'error': 'Prior learning records are not enabled for this school'}), 403)
    if student_id and not any(s['student_id'] == student_id for s in students):
        return None, None, (jsonify({'success': False,
                                     'error': 'Not authorized for this student'}), 403)
    return org_id, students, None


def _fail(result):
    """Service errors carry their own status when it isn't a plain 400."""
    return jsonify({'success': False, 'error': result['error']}), result.get('status', 400)


@bp.route('/prior-learning', methods=['GET'])
@require_auth
def list_records(user_id):
    """This guardian's records in one org, plus the children they may file for."""
    org_id, students, err = _guard(user_id)
    if err:
        return err
    return jsonify({
        'success': True,
        'records': prior.list_for_guardian(org_id, user_id),
        'students': [{'student_id': s['student_id'], 'name': s['name']} for s in students],
        'evidence_types': list(prior.EVIDENCE_TYPES),
    })


@bp.route('/prior-learning', methods=['POST'])
@require_auth
def create_record(user_id):
    """Start a record. It opens as a draft: evidence attaches to a record id, so
    there has to be a record before there can be a file."""
    data = request.json or {}
    student_id = data.get('student_user_id')
    if not student_id:
        return jsonify({'success': False, 'error': 'Choose which child this is for'}), 400
    org_id, _students, err = _guard(user_id, student_id)
    if err:
        return err
    result = prior.create_record(org_id, user_id, student_id, data)
    if result.get('error'):
        return _fail(result)
    return jsonify({'success': True, **result}), 201


@bp.route('/prior-learning/<record_id>', methods=['PUT'])
@require_auth
def update_record(user_id, record_id):
    org_id, _students, err = _guard(user_id)
    if err:
        return err
    result = prior.update_record(record_id, org_id, user_id, request.json or {})
    if result.get('error'):
        return _fail(result)
    return jsonify({'success': True, **result})


@bp.route('/prior-learning/<record_id>/submit', methods=['POST'])
@require_auth
def submit_record(user_id, record_id):
    org_id, _students, err = _guard(user_id)
    if err:
        return err
    result = prior.submit_record(record_id, org_id, user_id)
    if result.get('error'):
        return _fail(result)
    return jsonify({'success': True, **result})


@bp.route('/prior-learning/<record_id>', methods=['DELETE'])
@require_auth
def delete_record(user_id, record_id):
    org_id, _students, err = _guard(user_id)
    if err:
        return err
    result = prior.delete_record(record_id, org_id, user_id)
    if result.get('error'):
        return _fail(result)
    return jsonify({'success': True, **result})


@bp.route('/prior-learning/<record_id>/evidence', methods=['POST'])
@require_auth
def add_evidence(user_id, record_id):
    """Attach one piece of evidence — the same five kinds a student attaches to a
    task, through the same MediaUploadService, into the same quest-evidence
    bucket, so the portfolio renders both identically.

    Files arrive as multipart (evidence_type + file); text/link/video arrive as
    either multipart or JSON, so the frontend can post one way for both.

    A file may carry a `note` — the parent's one-line "what this is", which is
    the single most useful thing a reviewer (and later the analyzer) can have
    about a scan whose contents are otherwise a mystery. It lands in the same
    `content` column that holds text evidence: for a typed note that column IS
    the evidence, and for a file it is the family's words about the evidence.
    """
    org_id, _students, err = _guard(user_id)
    if err:
        return err

    body = request.form if request.files or request.form else (request.json or {})
    evidence_type = (body.get('evidence_type') or '').strip()
    if evidence_type not in prior.EVIDENCE_TYPES:
        return jsonify({'success': False, 'error': 'Unsupported evidence type'}), 400

    evidence = {'evidence_type': evidence_type, 'title': body.get('title')}

    if evidence_type == 'text':
        content = (body.get('content') or body.get('text_content') or '').strip()
        if not content:
            return jsonify({'success': False, 'error': 'Write something first'}), 400
        evidence['content'] = content

    elif evidence_type in ('link', 'video'):
        url = (body.get('url') or body.get('text_content') or '').strip()
        if not url.startswith(('http://', 'https://')):
            return jsonify({'success': False, 'error': 'Enter a full link, starting with https://'}), 400
        evidence['url'] = url

    else:  # image | document
        file = request.files.get('file')
        if not file or not file.filename:
            return jsonify({'success': False, 'error': 'Choose a file to upload'}), 400
        # The record must exist and be the caller's BEFORE a blob is written, or
        # a bad record id turns into an orphaned upload.
        if not prior.get_own_record(record_id, org_id, user_id):
            return jsonify({'success': False, 'error': 'Record not found'}), 404
        from database import get_supabase_admin_client
        from services.media_upload_service import MediaUploadService
        # admin client justified: the upload pipeline writes to storage on behalf
        # of the guardian, who has just been verified as this record's owner.
        result = MediaUploadService(get_supabase_admin_client()).upload_evidence_file(
            file,
            user_id=user_id,
            context_type='prior_learning',
            context_id=record_id,
            block_type=evidence_type,
        )
        if not result.success:
            return jsonify({'success': False,
                            'error': result.error_message or 'Upload failed'}), 400
        evidence.update({
            # Canonical pointer to persist, plus the signed twin for the
            # immediate preview (the bucket is private).
            'url': result.file_url,
            'display_url': result.display_url,
            'title': body.get('title') or result.filename,
            'file_name': result.filename,
            'file_size': result.file_size,
            'content_type': result.content_type,
            'content': (body.get('note') or body.get('content') or '').strip() or None,
        })

    saved = prior.add_evidence(record_id, org_id, user_id, evidence)
    if saved.get('error'):
        return _fail(saved)
    return jsonify({'success': True, **saved}), 201


@bp.route('/prior-learning/<record_id>/evidence/<evidence_id>', methods=['DELETE'])
@require_auth
def remove_evidence(user_id, record_id, evidence_id):
    org_id, _students, err = _guard(user_id)
    if err:
        return err
    result = prior.delete_evidence(evidence_id, record_id, org_id, user_id)
    if result.get('error'):
        return _fail(result)
    return jsonify({'success': True, **result})
