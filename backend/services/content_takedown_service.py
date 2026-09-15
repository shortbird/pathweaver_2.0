"""What "Action taken" in the moderation queue does to the reported thing.

Until Friends phase 3 (2026-09-17) a report's status was the whole story:
marking it 'actioned' recorded that a human had acted and changed nothing
about the content. The hidden_* columns on peer_comments were read by every
list and written by nobody. Now that kids write to kids, a report needs a
consequence the reporter can see:

    peer_comment -> hidden (hidden_reason='report'), stays for the parent view
    message      -> soft-deleted, the way the sender's own delete works
    anything else -> unchanged; the status is still the record

Hide, never delete. The parent's activity view shows what was said and that
it was taken down; that is the record a parent wants when they decide
whether to remove the friend.
"""

from typing import Any, Dict, List

from repositories.content_report_repository import ContentReportRepository
from repositories.peer_text_screen_repository import (
    PeerTextScreenRepository, HIDDEN_BY_REPORT)
from utils.logger import get_logger

logger = get_logger(__name__)

#: Report targets a takedown knows how to act on.
TAKEDOWN_TARGETS = ('peer_comment', 'message')


def take_down(report: Dict[str, Any], admin_id: str) -> Dict[str, Any]:
    """Apply the consequence for one actioned report. Idempotent."""
    target_type = report.get('target_type')
    target_id = report.get('target_id')
    if target_type not in TAKEDOWN_TARGETS or not target_id:
        return {'taken_down': False, 'reason': 'no takedown for this target type'}

    repo = PeerTextScreenRepository()
    if target_type == 'peer_comment':
        comment = repo.comment(target_id)
        if not comment:
            return {'taken_down': False, 'reason': 'not found'}
        if not comment.get('hidden_at'):
            repo.hide_comment(target_id, hidden_by=admin_id, reason=HIDDEN_BY_REPORT)
        logger.info('[takedown] %s hid peer comment %s on report %s',
                    str(admin_id)[:8], str(target_id)[:8], str(report.get('id'))[:8])
        return {'taken_down': True}

    message = repo.message(target_id)
    if not message:
        return {'taken_down': False, 'reason': 'not found'}
    if not message.get('is_deleted'):
        repo.hide_message(target_id)
        _tell_open_threads(message)
    logger.info('[takedown] %s hid message %s on report %s',
                str(admin_id)[:8], str(target_id)[:8], str(report.get('id'))[:8])
    return {'taken_down': True}


def _tell_open_threads(message: Dict[str, Any]) -> None:
    """The same follow-through as the sender's own delete: refresh the
    conversation preview and tell any open chat window. Best-effort."""
    try:
        from services import messaging_extras_service as extras
        extras._recompute_conversation_preview('dm', message)
        extras.broadcast_dm(message['conversation_id'], 'deleted',
                            {'message_id': message['id']})
    except Exception as e:  # noqa: BLE001
        logger.warning('[takedown] could not refresh thread for %s: %s',
                       str(message.get('id'))[:8], e)


def with_previews(reports: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Attach `preview` {text, author_id, hidden} to the reports whose target
    is a text a moderator has to read to judge. Other targets get none; the
    queue links to them instead."""
    repo = ContentReportRepository()
    comment_ids = [r['target_id'] for r in reports if r.get('target_type') == 'peer_comment']
    message_ids = [r['target_id'] for r in reports if r.get('target_type') == 'message']
    texts = {}
    try:
        texts.update(repo.peer_comment_texts(comment_ids))
        texts.update(repo.message_texts(message_ids))
    except Exception as e:  # noqa: BLE001
        logger.warning('[takedown] previews failed: %s', e)
    out = []
    for r in reports:
        found = texts.get(str(r.get('target_id'))) if r.get('target_type') in TAKEDOWN_TARGETS else None
        item = dict(r)
        if found is not None:
            item['preview'] = {'text': found.get('text'), 'author_id': found.get('author_id'),
                               'hidden': bool(found.get('hidden_at'))}
        elif r.get('target_type') in TAKEDOWN_TARGETS:
            item['preview'] = {'text': None, 'author_id': None, 'hidden': True, 'gone': True}
        out.append(item)
    return out
