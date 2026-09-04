"""
SIS staff prior-learning review — the office's queue of prior-learning records,
and where credit is awarded.

Two ways a record gets here: a guardian files it (parent_prior_learning.py), or
the office files it themselves for a transcript that arrived straight from the
student's previous school. Both end up in the same queue, with the same review,
analyzer and transcript conversion; `source` says which.

NEW, additive (/api/sis/prior-learning), ADMIN_ROLES: this is front-office
paperwork, not money, so a campus coordinator runs it alongside registration and
attendance. Org-scoped through sis_service.resolve_org_id like the rest of the
console.

Gated per-org on feature_flags.sis_settings.prior_learning_enabled — the same
flag the family side checks, so a school can't end up with a queue nobody can
file into, or vice versa.
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.auth.relationships import require_relationship_to
from utils.logger import get_logger
from utils.sis_roles import ADMIN_ROLES
from utils.school_subjects import SCHOOL_SUBJECTS, SCHOOL_SUBJECT_DISPLAY_NAMES
from services import sis_service
from services import sis_prior_learning_service as prior

logger = get_logger(__name__)

bp = Blueprint('sis_prior_learning', __name__, url_prefix='/api/sis/prior-learning')


def _org_or_error(user_id):
    body = request.get_json(silent=True) or {}
    # request.form too: a file upload is multipart, so its organization_id (the
    # one a superadmin has to pass) is not in a JSON body.
    requested = (request.args.get('organization_id') or body.get('organization_id')
                 or request.form.get('organization_id'))
    org_id = sis_service.resolve_org_id(user_id, requested)
    if not org_id:
        return None, (jsonify({
            'success': False,
            'error': 'No organization in context. Superadmins must pass ?organization_id.'
        }), 400)
    if not prior.enabled_for_org(org_id):
        return None, (jsonify({
            'success': False,
            'error': 'Prior learning records are not enabled for this school'
        }), 403)
    return org_id, None


@bp.route('', methods=['GET'])
@require_role(*ADMIN_ROLES)
def list_records(user_id):
    """The review queue. ?status= filters; drafts are never listed."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    status = request.args.get('status') or None
    if status and status not in ('submitted', 'under_review', 'accepted', 'rejected'):
        return jsonify({'success': False, 'error': 'Unknown status'}), 400
    records = prior.list_for_org(org_id, status=status,
                                 student_id=request.args.get('student_id'))
    # Which of these are already on a transcript, in one query for the page.
    from services import transfer_credit_service as credit
    converted = credit.conversions_for_records([r['id'] for r in records])
    for record in records:
        record['transfer_credit'] = converted.get(record['id'])
    return jsonify({
        'success': True,
        'records': records,
        'counts': prior.queue_counts(org_id),
        # The award vocabulary, so the reviewer's boxes and the analyzer's
        # suggestions can never drift apart.
        'subjects': [{'key': key, 'name': SCHOOL_SUBJECT_DISPLAY_NAMES.get(key, key)}
                     for key in SCHOOL_SUBJECTS],
    })


@bp.route('/students', methods=['GET'])
@require_role(*ADMIN_ROLES)
def list_students(user_id):
    """The student picker for a record the office files itself.

    Its own endpoint rather than a field on the queue: the queue is loaded on
    every tab change, and the roster it would carry is only ever read when
    somebody opens the upload form.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'students': prior.student_options(org_id)})


@bp.route('', methods=['POST'])
@require_role(*ADMIN_ROLES)
def create_record(user_id):
    """File a record for a transcript the office received directly.

    Schools mail, email and hand over transcripts for a student who has just
    enrolled, and none of that passes through the family. Before this, an admin
    holding such a PDF either sat on it or asked the parent to upload a document
    the school already had.

    Opens at under_review — the office is already looking at it — so it lands in
    the queue immediately and runs through the same analyze/accept/transcribe
    steps as anything a family sent.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    result = prior.staff_create_record(org_id, user_id, data.get('student_user_id'), data)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), result.get('status', 400)
    logger.info(f'[PRIOR LEARNING] {user_id[:8]} filed a staff record for student '
                f'{(data.get("student_user_id") or "")[:8]}')
    return jsonify({'success': True, **result}), 201


@bp.route('/<record_id>/evidence', methods=['POST'])
@require_role(*ADMIN_ROLES)
def add_evidence(user_id, record_id):
    """Attach one document to a record in this org.

    The same pipeline, bucket and evidence kinds as a family upload
    (prior.build_evidence), so a transcript the office scanned and a transcript
    a parent photographed are the same artifact to the reviewer, the analyzer
    and the portfolio.

    Works on a record at any status, unlike the family's own upload: the office
    adds paperwork during review, which is exactly when the family side locks.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err

    body = request.form if request.files or request.form else (request.json or {})
    # Establish the record is in this org BEFORE a blob is written, or a bad
    # record id turns into an orphaned upload.
    if not prior.get_record(record_id, org_id):
        return jsonify({'success': False, 'error': 'Record not found'}), 404

    evidence, bad = prior.build_evidence(body, request.files.get('file'),
                                         uploader_id=user_id, record_id=record_id)
    if bad:
        return jsonify({'success': False, 'error': bad['error']}), bad['status']

    saved = prior.staff_add_evidence(record_id, org_id, user_id, evidence)
    if saved.get('error'):
        return jsonify({'success': False, 'error': saved['error']}), saved.get('status', 400)
    return jsonify({'success': True, **saved}), 201


@bp.route('/<record_id>', methods=['GET'])
@require_role(*ADMIN_ROLES)
def get_record(user_id, record_id):
    """One record, with its evidence and what this student has already been
    granted — a reviewer awarding 1.0 math needs to know about the 1.0 math
    another record already carried."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    record = prior.get_record(record_id, org_id)
    if not record:
        return jsonify({'success': False, 'error': 'Record not found'}), 404
    from services import transfer_credit_service as credit
    return jsonify({
        'success': True,
        'record': record,
        'accepted_totals': prior.accepted_credit_totals(record['student_user_id']),
        # Non-null once this record is on the transcript. The UI needs it to
        # show "already added" rather than offering a button that 409s.
        'transfer_credit': credit.already_converted(record_id),
    })


@bp.route('/<record_id>/review', methods=['POST'])
@require_role(*ADMIN_ROLES)
def review_record(user_id, record_id):
    """Move a record through review. Accepting carries the credit award with it:
    {status: 'accepted', awarded_credits: {math: 1.0}, review_notes: '...'}"""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    result = prior.review(
        record_id, org_id, user_id,
        status=(data.get('status') or '').strip(),
        notes=data.get('review_notes'),
        awarded_credits=data.get('awarded_credits'),
    )
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), result.get('status', 400)
    return jsonify({'success': True, **result})


@bp.route('/<record_id>/evidence/<evidence_id>', methods=['DELETE'])
@require_role(*ADMIN_ROLES)
def delete_evidence(user_id, record_id, evidence_id):
    """Remove one uploaded document from a record under review.

    The file goes with the row — see staff_delete_evidence. Unlike the family's
    own delete this is not gated on the record still being editable, because
    the documents worth removing are the ones found during review.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = prior.staff_delete_evidence(evidence_id, record_id, org_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), result.get('status', 400)
    logger.info(f'[PRIOR LEARNING] {user_id[:8]} deleted evidence {evidence_id} '
                f'from record {record_id}')
    return jsonify({'success': True, **result})


@bp.route('/<record_id>/analyze', methods=['POST'])
@require_role(*ADMIN_ROLES)
def analyze_record(user_id, record_id):
    """Ask the analyzer to read this record's evidence and propose a split.

    Synchronous on purpose: a reviewer clicks this while looking at the record
    and waits a few seconds for the answer. Backgrounding it would need a queue,
    a poll and a stale-suggestion story for a call that takes about as long as
    reading the first page of the scan yourself.

    The result is only ever a suggestion — it lands in ai_suggestion, and
    /credit is what puts anything on a transcript.

    Optional `passwords`: candidates for encrypted PDFs on this record, tried
    against every locked file. They are used for this one call — never written
    to the record, never logged, and not echoed back in the response.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    record = prior.get_record(record_id, org_id)
    if not record:
        return jsonify({'success': False, 'error': 'Record not found'}), 404

    data = request.json or {}
    raw_passwords = data.get('passwords') or data.get('password') or []
    if isinstance(raw_passwords, str):
        raw_passwords = [raw_passwords]
    passwords = [p for p in (str(x).strip() for x in raw_passwords[:10]) if p]

    from services.sis_prior_learning_analyzer import analyze_record as run_analysis
    result = run_analysis(record, org_id, passwords)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 502
    return jsonify({'success': True, **result})


@bp.route('/<record_id>/credit', methods=['POST'])
@require_role(*ADMIN_ROLES)
def credit_record(user_id, record_id):
    """Put an accepted record's credit on the student's transcript.

    Body is what the reviewer approved on screen — school_name, subject_credits,
    course_names, notes — NOT the AI's suggestion. The suggestion reaches this
    endpoint only through a human who looked at it and pressed the button.

    Separate from /review because accepting and transcribing are different
    decisions: the office accepts a record when it believes the evidence, and
    transcribes it when the credit is settled. Keeping them apart is also what
    makes the double-credit guard meaningful.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    record = prior.get_record(record_id, org_id)
    if not record:
        return jsonify({'success': False, 'error': 'Record not found'}), 404
    if record.get('status') != 'accepted':
        return jsonify({'success': False,
                        'error': 'Accept this record before adding it to the transcript'}), 400

    from services import transfer_credit_service as credit
    result = credit.convert_prior_learning(record, request.json or {}, user_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error'],
                        'transfer_credit_id': result.get('transfer_credit_id')}), \
            result.get('status', 400)
    return jsonify({'success': True, **result})


@bp.route('/students/<student_id>/accepted', methods=['GET'])
@require_role(*ADMIN_ROLES)
@require_relationship_to('student_id', allow=('org_staff',), discloses='prior_learning')
def student_accepted(user_id, student_id):
    """Everything accepted for one student — the transcript-side view of this
    queue, and what the credit-application step will read when it's built."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    records = [r for r in prior.accepted_for_student(student_id)
               if r.get('organization_id') == org_id]
    return jsonify({
        'success': True,
        'records': records,
        'totals': prior.accepted_credit_totals(student_id),
    })
