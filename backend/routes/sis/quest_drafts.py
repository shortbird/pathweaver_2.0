"""
Quest drafting from material a school already has (2026-08-12).

POST /api/sis/quest-drafts/generate
  JSON      {context, notes?, task_count?}
  multipart file=<pdf|docx|txt|md|csv> (+ notes, task_count)
  -> {success, quest: {title, description, tasks: [...]}}

Propose only. Nothing is written to the database here; the draft fills the same
quest form staff would otherwise type into, and creating the quest is a separate,
explicit call (curriculum: POST /curriculum/<id>/quests/create, class: POST
/classes/<id>/quests/create). That split is deliberate — the same two-step shape
as the schedule AI — because a generated quest that saved itself would put text
in front of students that no adult had read.

iCreate's ask: "paste context (such as a list of tasks or document text) to
automatically generate Quest structures and tasks." Files are accepted because
the context usually starts life as a document rather than as something to paste.

STAFF_ROLES, not ADMIN_ROLES: teachers author quests for their own classes
already, and this is the same job with less typing.
"""

from flask import Blueprint, request, jsonify

from app_config import Config
from utils.auth.decorators import require_role
from utils.logger import get_logger
from middleware.rate_limiter import rate_limit
from utils.sis_roles import STAFF_ROLES

logger = get_logger(__name__)

bp = Blueprint('sis_quest_drafts', __name__, url_prefix='/api/sis/quest-drafts')

# One source of truth, shared with the two prompt builders that also trim
# source material (services/quest_ai_service, services/personalization_service).
_MAX_CONTEXT_CHARS = Config.AI_SOURCE_MATERIAL_MAX_CHARS
# Well under the 25MB class-materials limit on purpose: this file is parsed in
# the web process rather than handed to storage, and PDF text extraction is the
# kind of transient allocation that has taken the prod backend down before.
_MAX_FILE_BYTES = 5 * 1024 * 1024
_PARSEABLE = {'pdf': 'pdf', 'docx': 'docx', 'txt': 'text', 'md': 'text', 'csv': 'text'}


def _context_from_file(file):
    """(text, error). Extract what the model should read out of an upload."""
    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in (file.filename or '') else ''
    source_type = _PARSEABLE.get(ext)
    if not source_type:
        return None, 'Upload a PDF, Word document, or text file.'
    file.seek(0, 2)
    if file.tell() > _MAX_FILE_BYTES:
        return None, 'That file is larger than 5MB. Paste the relevant part instead.'
    file.seek(0)

    from services.document_parser_service import DocumentParserService
    try:
        parsed = DocumentParserService().parse_document(
            file.read(), source_type, filename=file.filename)
    except Exception as e:
        logger.error(f'Quest-draft document parse failed: {e}')
        return None, 'Could not read that file. Try pasting the text instead.'

    text = (parsed or {}).get('raw_text') or ''
    if not text.strip():
        return None, ('No text could be read from that file — a scanned PDF is an '
                      'image, so its words have to be pasted in.')
    return text, None


@bp.route('/generate', methods=['POST'])
@require_role(*STAFF_ROLES)
@rate_limit(max_requests=20, window_seconds=300)
def generate(user_id):
    if request.files.get('file'):
        context, err = _context_from_file(request.files['file'])
        if err:
            return jsonify({'success': False, 'error': err}), 400
        notes = (request.form.get('notes') or '').strip()
        raw_count = request.form.get('task_count')
    else:
        data = request.get_json(silent=True) or {}
        context = (data.get('context') or '').strip()
        notes = (data.get('notes') or '').strip()
        raw_count = data.get('task_count')
        if not context:
            return jsonify({'success': False,
                            'error': 'Paste some context or upload a document first.'}), 400

    try:
        task_count = int(raw_count or 4)
    except (TypeError, ValueError):
        task_count = 4

    from services.quest_ai_service import QuestAIService
    from services.base_ai_service import AIServiceOverloadedError, AIServiceError
    try:
        result = QuestAIService().draft_quest_from_context(
            context[:_MAX_CONTEXT_CHARS], notes=notes[:1000], target_task_count=task_count)
    except AIServiceOverloadedError:
        return jsonify({'success': False,
                        'error': 'The AI is busy right now — try again in a moment.'}), 503
    except AIServiceError as e:
        logger.error(f'Quest draft generation failed: {e}')
        return jsonify({'success': False,
                        'error': 'Could not build a quest from that — try trimming the text.'}), 502

    if not result.get('success'):
        return jsonify({'success': False,
                        'error': result.get('error') or 'Could not build a quest from that.'}), 502
    # The source text goes back with the draft so the caller can keep it on the
    # quest (quests.source_material). A training quest can let its learners
    # generate their own tasks, and "the handbook" is what those tasks have to
    # be about — the quest's own title and description are a line and a
    # paragraph. Still nothing is written here; storing it is the caller's
    # separate, explicit create call.
    return jsonify({'success': True, 'quest': result['quest'],
                    'source_material': context[:_MAX_CONTEXT_CHARS],
                    'truncated': len(context) > _MAX_CONTEXT_CHARS})
