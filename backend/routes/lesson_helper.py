"""
Lesson Helper Routes
====================

Backs the in-lesson AI helper modal (LessonHelperModal). Replaces the removed
`/api/tutor/chat` endpoint for the lesson-helper use case.

POST /api/lesson-helper/chat
    body: { message, lesson_id?, block_index?, action_type?, conversation_id?, mode? }
    returns: { response, conversation_id }
"""

import re
import uuid

from flask import Blueprint, request, jsonify

from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('lesson_helper', __name__, url_prefix='/api/lesson-helper')


def _strip_html(html) -> str:
    if not html:
        return ''
    text = re.sub(r'<[^>]+>', ' ', str(html))
    text = text.replace('&nbsp;', ' ')
    return re.sub(r'\s+', ' ', text).strip()


def _extract_lesson_text(content, block_index=None):
    """
    Return (full_text, current_step_text) from lesson content.

    Handles both shapes:
      - v2:     { "steps":  [{ "title", "content" }] }
      - legacy: { "blocks": [{ "type", "content" }] }
      - a raw HTML string
    """
    if not content:
        return '', ''
    if isinstance(content, str):
        t = _strip_html(content)
        return t, t

    items = []
    if isinstance(content, dict):
        items = content.get('steps') or content.get('blocks') or []
    elif isinstance(content, list):
        items = content

    texts = []
    for item in items:
        if not isinstance(item, dict):
            continue
        piece = _strip_html(item.get('content'))
        title = (item.get('title') or '').strip()
        combined = f"{title}: {piece}" if (title and piece) else (title or piece)
        combined = combined.strip()
        if combined:
            texts.append(combined)

    full_text = '\n'.join(texts)
    current_text = ''
    if isinstance(block_index, int) and 0 <= block_index < len(texts):
        current_text = texts[block_index]
    return full_text, current_text


@bp.route('/chat', methods=['POST'])
@require_auth
def lesson_helper_chat(user_id):
    """Answer a student's lesson question using the lesson content as context."""
    try:
        data = request.get_json() or {}
        message = (data.get('message') or '').strip()
        lesson_id = (data.get('lesson_id') or '').strip()
        block_index = data.get('block_index')
        action_type = data.get('action_type')
        conversation_id = data.get('conversation_id') or str(uuid.uuid4())

        if not message:
            return jsonify({'error': 'message is required'}), 400

        lesson_title, full_text, current_text = '', '', ''
        if lesson_id:
            try:
                client = get_supabase_admin_client()
                lesson = client.table('curriculum_lessons')\
                    .select('title, content')\
                    .eq('id', lesson_id)\
                    .single()\
                    .execute()
                if lesson.data:
                    lesson_title = lesson.data.get('title') or ''
                    bi = block_index if isinstance(block_index, int) else None
                    full_text, current_text = _extract_lesson_text(lesson.data.get('content'), bi)
            except Exception as e:
                logger.warning(f"Lesson helper: could not load lesson {lesson_id}: {e}")

        from services.lesson_helper_service import LessonHelperService
        answer = LessonHelperService().answer(
            lesson_title, full_text, current_text, message, action_type
        )

        if not answer:
            return jsonify({'error': 'The helper could not generate a response. Please try again.'}), 502

        return jsonify({'response': answer, 'conversation_id': conversation_id}), 200

    except Exception as e:
        logger.error(f"Lesson helper chat failed: {e}")
        return jsonify({'error': 'Failed to get a response. Please try again.'}), 500
