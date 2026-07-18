"""
Messaging overhaul extras shared by DMs and groups: emoji reactions,
edit/delete, pinned messages, announcement-only groups, attachment metadata,
reply previews, and instant delivery via Supabase Realtime broadcast.

Authorization model mirrors the existing messaging services: participants may
react/reply; senders may edit/delete their own messages; group admins may
additionally delete any message in their group, pin messages, and toggle
announcement-only. All access via the service-role client with checks in code.
"""

import requests
from datetime import datetime
from typing import Any, Dict, List, Optional

from app_config import Config
from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

# Small curated set keeps the reaction bar clean; superset accepted for future UI.
ALLOWED_REACTIONS = ['👍', '❤️', '😂', '🎉', '😮', '😢']

MAX_ATTACHMENTS = 5
MAX_ATTACHMENT_MB = 25


def _admin():
    return get_supabase_admin_client()


def _now():
    return datetime.utcnow().isoformat()


# ── Realtime: instant delivery (frontends subscribe per open conversation) ────
def broadcast(topic: str, event: str, payload: Dict[str, Any]) -> bool:
    """Fire-and-forget Supabase Realtime broadcast (same mechanism as
    NotificationService). Never raises."""
    try:
        resp = requests.post(
            f"{Config.SUPABASE_URL}/realtime/v1/api/broadcast",
            json={'messages': [{'topic': topic, 'event': event, 'payload': payload}]},
            headers={
                'apikey': Config.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': f'Bearer {Config.SUPABASE_SERVICE_ROLE_KEY}',
                'Content-Type': 'application/json',
            },
            timeout=5,
        )
        return resp.status_code == 202
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Realtime message broadcast failed ({topic}/{event}): {e}')
        return False


def broadcast_dm(conversation_id: str, event: str, payload: Dict[str, Any]) -> None:
    broadcast(f'dm:{conversation_id}', event, payload)


def broadcast_group(group_id: str, event: str, payload: Dict[str, Any]) -> None:
    broadcast(f'group:{group_id}', event, payload)


# ── Attachments (metadata validation; upload handled by MediaUploadService) ───
def clean_attachments(raw) -> List[Dict[str, Any]]:
    """Sanitize a client-provided attachments array down to known fields."""
    out = []
    for a in (raw or [])[:MAX_ATTACHMENTS]:
        if not isinstance(a, dict) or not a.get('url'):
            continue
        out.append({
            'url': str(a['url'])[:2048],
            'type': str(a.get('type') or 'file')[:100],
            'name': str(a.get('name') or 'attachment')[:255],
            'size': int(a.get('size') or 0),
        })
    return out


# ── Access helpers ─────────────────────────────────────────────────────────────
def _dm_row(message_id: str) -> Optional[Dict[str, Any]]:
    r = _admin().table('direct_messages').select('*').eq('id', message_id).limit(1).execute()
    return r.data[0] if r.data else None


def _group_row(message_id: str) -> Optional[Dict[str, Any]]:
    r = _admin().table('group_messages').select('*').eq('id', message_id).limit(1).execute()
    return r.data[0] if r.data else None


def _is_dm_participant(user_id: str, msg: Dict[str, Any]) -> bool:
    return user_id in (msg.get('sender_id'), msg.get('recipient_id'))


def _is_group_member(user_id: str, group_id: str) -> bool:
    r = (_admin().table('group_members').select('id')
         .eq('group_id', group_id).eq('user_id', user_id).limit(1).execute())
    return bool(r.data)


def is_group_admin(user_id: str, group_id: str) -> bool:
    r = (_admin().table('group_members').select('id')
         .eq('group_id', group_id).eq('user_id', user_id).eq('role', 'admin').limit(1).execute())
    return bool(r.data)


def _can_touch(user_id: str, message_type: str, message_id: str) -> Optional[Dict[str, Any]]:
    """The message row if the user may see/react to it, else None."""
    if message_type == 'dm':
        msg = _dm_row(message_id)
        return msg if msg and _is_dm_participant(user_id, msg) else None
    msg = _group_row(message_id)
    return msg if msg and _is_group_member(user_id, msg['group_id']) else None


# ── Reactions ──────────────────────────────────────────────────────────────────
def toggle_reaction(user_id: str, message_type: str, message_id: str, emoji: str) -> Dict[str, Any]:
    if emoji not in ALLOWED_REACTIONS:
        return {'error': 'Unsupported reaction'}
    msg = _can_touch(user_id, message_type, message_id)
    if not msg:
        return {'error': 'Message not found'}
    admin = _admin()
    existing = (admin.table('message_reactions').select('id')
                .eq('message_type', message_type).eq('message_id', message_id)
                .eq('user_id', user_id).eq('emoji', emoji).limit(1).execute()).data
    if existing:
        admin.table('message_reactions').delete().eq('id', existing[0]['id']).execute()
        added = False
    else:
        admin.table('message_reactions').insert({
            'message_type': message_type, 'message_id': message_id,
            'user_id': user_id, 'emoji': emoji,
        }).execute()
        added = True

    reactions = reactions_for_messages(message_type, [message_id], user_id).get(message_id, [])
    event = {'message_id': message_id, 'reactions': reactions}
    if message_type == 'dm':
        broadcast_dm(msg['conversation_id'], 'reactions', event)
    else:
        broadcast_group(msg['group_id'], 'reactions', event)
    return {'added': added, 'reactions': reactions}


def reactions_for_messages(message_type: str, message_ids: List[str],
                           viewer_id: str) -> Dict[str, List[Dict[str, Any]]]:
    """message_id -> [{emoji, count, reacted}] aggregated for the viewer."""
    if not message_ids:
        return {}
    rows = (_admin().table('message_reactions').select('message_id, user_id, emoji')
            .eq('message_type', message_type).in_('message_id', message_ids).execute()).data or []
    agg: Dict[str, Dict[str, Dict[str, Any]]] = {}
    for r in rows:
        slot = agg.setdefault(r['message_id'], {}).setdefault(
            r['emoji'], {'emoji': r['emoji'], 'count': 0, 'reacted': False})
        slot['count'] += 1
        if r['user_id'] == viewer_id:
            slot['reacted'] = True
    return {mid: list(per.values()) for mid, per in agg.items()}


# ── Conversation preview (kept in sync on edit/delete) ─────────────────────────
def _preview_text(row: Optional[Dict[str, Any]]) -> str:
    """Conversation-list preview for a message row, mirroring the send path
    (which uses `(content or 'Sent an attachment')[:100]`)."""
    if not row:
        return ''
    content = (row.get('message_content') or '').strip()
    if content:
        return content[:100]
    if row.get('attachments'):
        return 'Sent an attachment'
    return ''


def _recompute_conversation_preview(message_type: str, msg: Dict[str, Any]) -> None:
    """Recompute a conversation's cached last_message_preview / last_message_at
    from its most recent non-deleted message.

    Deleting (or editing) the latest message otherwise leaves a stale preview in
    the conversation list — e.g. the list keeps showing the text of a message the
    user just deleted. Groups only refresh the preview via an AFTER INSERT trigger,
    and DMs set it inline on send, so neither path covers edit/delete. This
    reconciles both from the source of truth after the fact.
    """
    admin = _admin()
    if message_type == 'dm':
        conv_id = msg.get('conversation_id')
        if not conv_id:
            return
        msg_table, conv_table = 'direct_messages', 'message_conversations'
        scope_col = 'conversation_id'
    else:
        conv_id = msg.get('group_id')
        if not conv_id:
            return
        msg_table, conv_table = 'group_messages', 'group_conversations'
        scope_col = 'group_id'

    try:
        latest = (admin.table(msg_table)
                  .select('message_content, attachments, created_at')
                  .eq(scope_col, conv_id).eq('is_deleted', False)
                  .order('created_at', desc=True).limit(1).execute()).data
        if latest:
            update = {
                'last_message_preview': _preview_text(latest[0]),
                'last_message_at': latest[0]['created_at'],
            }
        else:
            # Every message removed — clear the preview but keep last_message_at
            # so the (now empty) conversation keeps its position in the list.
            update = {'last_message_preview': ''}
        admin.table(conv_table).update(update).eq('id', conv_id).execute()
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Failed to recompute {message_type} preview for {conv_id}: {e}')


# ── Edit / delete ──────────────────────────────────────────────────────────────
def edit_message(user_id: str, message_type: str, message_id: str, content: str) -> Dict[str, Any]:
    content = (content or '').strip()
    if not content or len(content) > 2000:
        return {'error': 'Message must be 1-2000 characters'}
    table = 'direct_messages' if message_type == 'dm' else 'group_messages'
    msg = _dm_row(message_id) if message_type == 'dm' else _group_row(message_id)
    if not msg or msg.get('is_deleted'):
        return {'error': 'Message not found'}
    if msg['sender_id'] != user_id:
        return {'error': 'You can only edit your own messages'}
    _admin().table(table).update({
        'message_content': content, 'edited_at': _now(),
    }).eq('id', message_id).execute()
    # Keep the conversation-list preview in sync if the edited message is the latest.
    _recompute_conversation_preview(message_type, msg)
    event = {'message_id': message_id, 'content': content, 'edited_at': _now()}
    if message_type == 'dm':
        broadcast_dm(msg['conversation_id'], 'edited', event)
    else:
        broadcast_group(msg['group_id'], 'edited', event)
    return {'ok': True}


def delete_message(user_id: str, message_type: str, message_id: str) -> Dict[str, Any]:
    table = 'direct_messages' if message_type == 'dm' else 'group_messages'
    msg = _dm_row(message_id) if message_type == 'dm' else _group_row(message_id)
    if not msg:
        return {'error': 'Message not found'}
    is_sender = msg['sender_id'] == user_id
    is_moderator = message_type == 'group' and is_group_admin(user_id, msg['group_id'])
    if not (is_sender or is_moderator):
        return {'error': 'You can only delete your own messages'}
    _admin().table(table).update({'is_deleted': True}).eq('id', message_id).execute()
    # Refresh the conversation-list preview so a deleted last message doesn't
    # keep showing its content in the conversation list.
    _recompute_conversation_preview(message_type, msg)
    # Unpin if this was the pinned message.
    if message_type == 'group':
        _admin().table('group_conversations').update({'pinned_message_id': None}) \
            .eq('id', msg['group_id']).eq('pinned_message_id', message_id).execute()
    event = {'message_id': message_id}
    if message_type == 'dm':
        broadcast_dm(msg['conversation_id'], 'deleted', event)
    else:
        broadcast_group(msg['group_id'], 'deleted', event)
    return {'ok': True}


# ── Pins + announcement-only (group admin controls) ────────────────────────────
def set_pinned(user_id: str, group_id: str, message_id: Optional[str]) -> Dict[str, Any]:
    if not is_group_admin(user_id, group_id):
        return {'error': 'Only group admins can pin messages'}
    if message_id:
        msg = _group_row(message_id)
        if not msg or msg['group_id'] != group_id or msg.get('is_deleted'):
            return {'error': 'Message not found in this group'}
    _admin().table('group_conversations').update({'pinned_message_id': message_id}) \
        .eq('id', group_id).execute()
    broadcast_group(group_id, 'pinned', {'pinned_message_id': message_id})
    return {'ok': True, 'pinned_message_id': message_id}


def set_announcement_only(user_id: str, group_id: str, enabled: bool) -> Dict[str, Any]:
    if not is_group_admin(user_id, group_id):
        return {'error': 'Only group admins can change this setting'}
    _admin().table('group_conversations').update({'announcement_only': bool(enabled)}) \
        .eq('id', group_id).execute()
    broadcast_group(group_id, 'settings', {'announcement_only': bool(enabled)})
    return {'ok': True, 'announcement_only': bool(enabled)}


# ── Viewer role (superadmin moderation visibility) ─────────────────────────────
def _viewer_is_superadmin(user_id: str) -> bool:
    """Superadmins retain visibility into deleted messages for moderation/audit;
    everyone else sees only a 'Message deleted' tombstone."""
    if not user_id:
        return False
    try:
        rows = (_admin().table('users').select('role')
                .eq('id', user_id).limit(1).execute()).data
        return bool(rows) and rows[0].get('role') == 'superadmin'
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Superadmin check failed for {user_id}: {e}')
        return False


# ── Reply previews ─────────────────────────────────────────────────────────────
def reply_previews(message_type: str, messages: List[Dict[str, Any]],
                   reveal_deleted: bool = False) -> Dict[str, Dict[str, Any]]:
    """id -> {id, sender_id, sender_name, content, is_deleted} for every reply
    target in `messages`. Deleted targets read as 'Message deleted' unless
    `reveal_deleted` (superadmin), which keeps the original content."""
    target_ids = list({m['reply_to_message_id'] for m in messages if m.get('reply_to_message_id')})
    if not target_ids:
        return {}
    table = 'direct_messages' if message_type == 'dm' else 'group_messages'
    rows = (_admin().table(table)
            .select('id, sender_id, message_content, is_deleted')
            .in_('id', target_ids).execute()).data or []
    sender_ids = list({r['sender_id'] for r in rows})
    users = {u['id']: u for u in (_admin().table('users')
             .select('id, display_name, first_name, last_name')
             .in_('id', sender_ids).execute()).data or []} if sender_ids else {}

    def name_of(uid):
        u = users.get(uid) or {}
        return (u.get('display_name') or f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip() or 'Someone')

    def content_of(r):
        if r.get('is_deleted') and not reveal_deleted:
            return 'Message deleted'
        return (r.get('message_content') or '')[:140]

    return {r['id']: {
        'id': r['id'],
        'sender_id': r['sender_id'],
        'sender_name': name_of(r['sender_id']),
        'content': content_of(r),
        'is_deleted': bool(r.get('is_deleted')),
    } for r in rows}


def enrich_messages(message_type: str, messages: List[Dict[str, Any]],
                    viewer_id: str) -> List[Dict[str, Any]]:
    """Attach reactions + reply previews, and blank deleted message content.

    Superadmin viewers keep the original content of deleted messages (flagged
    with `deleted_visible_to_admin`) so they can moderate; all other viewers get
    the content/attachments stripped down to a tombstone.
    """
    ids = [m['id'] for m in messages]
    reactions = reactions_for_messages(message_type, ids, viewer_id)
    # Only pay for the role lookup when a deleted message (or a reply target that
    # might be deleted) is actually in this batch.
    needs_role = any(m.get('is_deleted') for m in messages) or \
        any(m.get('reply_to_message_id') for m in messages)
    reveal_deleted = _viewer_is_superadmin(viewer_id) if needs_role else False
    replies = reply_previews(message_type, messages, reveal_deleted=reveal_deleted)
    out = []
    for m in messages:
        row = {**m}
        if row.get('is_deleted'):
            if reveal_deleted:
                # Keep original content/attachments; the client renders a
                # "Deleted" indicator alongside them.
                row['deleted_visible_to_admin'] = True
            else:
                row['message_content'] = ''
                row['attachments'] = []
        row['reactions'] = reactions.get(m['id'], [])
        if m.get('reply_to_message_id'):
            row['reply_to'] = replies.get(m['reply_to_message_id'])
        out.append(row)
    return out
