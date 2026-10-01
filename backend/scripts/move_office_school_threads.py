"""
One-time repair: the notes a school "sent" to its own front office go back to
the people who wrote them.

Until c2347490 (2026-09-30) Compose wrote to an office member who was also a
guardian as the school. The office reads that inbox as the school, so the note
landed in a thread between the member and their own office: left out of My
messages on every surface (routes/direct_messages.get_conversations), still
counted by the unread badge, and readable only on the School tab under the
reader's own name. c2347490 sends new notes from the author instead and left
the old ones where they were -- 65 messages in 7 iCreate threads, 12 of them
unread behind a badge nobody could clear (docs/messaging/MESSAGING_AUDIT_2026-10-01.md).

This moves each message to where it would land today:

  note    school -> member, written by a colleague: becomes that colleague's
          personal message to the member.
  reply   member -> school, after a note: becomes the member's personal message
          to whoever wrote the note they were answering (the last colleague to
          write before it). A reply the member typed "as the school" into their
          own thread is the same thing.
  left    a member's message before any colleague wrote (mail to the office
          itself), or a school message with no recorded author. Not moved.

Ids, timestamps, read state and attachments are kept, so nothing new rings and
an unread note is still unread -- in a thread its reader can open. A thread
left empty is deleted, and its "opened by" rows go with it. Every original
value is written to a backup file before the first write. Safe to re-run:
replies move before the notes they are matched against, so a run that stops
halfway plans the rest the same way.

Usage:
    cd backend && ../venv/bin/python scripts/move_office_school_threads.py            # dry run
    cd backend && ../venv/bin/python scripts/move_office_school_threads.py --apply
"""

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Tuple

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

#: The bell row for a note is written right after the message it announces.
BELL_WINDOW = timedelta(seconds=30)
#: tmp/ is gitignored; the backup holds ids and no message text.
BACKUP_DIR = BACKEND.parent / 'tmp'

MESSAGE_COLUMNS = ('id, conversation_id, sender_id, recipient_id, sent_by_user_id, '
                   'show_sender_name, created_at, read_at, is_deleted, message_content')


def plan_moves(messages: List[Dict[str, Any]], inbox_id: str,
               member_id: str) -> List[Dict[str, Any]]:
    """Where each message of one office member's thread with their own school
    belongs. `messages` is oldest first. Pure, so the mapping is tested without
    a database.

    Returns one dict per message that moves: its id, 'kind' ('note' | 'reply'),
    and the sender and recipient it should carry. `clear_author` is set where
    the row's sent_by_user_id described a school message and no longer applies.
    """
    moves: List[Dict[str, Any]] = []
    last_author: Optional[str] = None
    for m in messages:
        author = m.get('sent_by_user_id')
        from_school = m.get('sender_id') == inbox_id
        if from_school and author and author != member_id:
            last_author = author
            moves.append({'id': m['id'], 'kind': 'note', 'sender_id': author,
                          'recipient_id': member_id, 'clear_author': True})
        elif from_school and author == member_id and last_author:
            moves.append({'id': m['id'], 'kind': 'reply', 'sender_id': member_id,
                          'recipient_id': last_author, 'clear_author': True})
        elif m.get('sender_id') == member_id and last_author:
            # sent_by_user_id here is a forwarder (routes/direct_messages
            # forward-to-school), which is still true of the moved message.
            moves.append({'id': m['id'], 'kind': 'reply', 'sender_id': member_id,
                          'recipient_id': last_author, 'clear_author': False})
    return moves


def _office_threads(admin) -> Iterator[Tuple[Dict[str, Any], Dict[str, Any], str]]:
    """(org, conversation, member id) for every thread between a school inbox
    and somebody who reads that inbox as the school."""
    from services import school_inbox_service
    from utils.validation.sanitizers import pgrst_uuid
    orgs = (admin.table('organizations').select('id, name, inbox_user_id')
            .not_.is_('inbox_user_id', 'null').execute()).data or []
    for org in orgs:
        inbox = org['inbox_user_id']
        # .or_() takes a raw filter string: the id is proven a UUID first.
        convos = (admin.table('message_conversations').select('*')
                  .or_(f'participant_1_id.eq.{pgrst_uuid(inbox, "inbox_user_id")},'
                       f'participant_2_id.eq.{pgrst_uuid(inbox, "inbox_user_id")}')
                  .execute()).data or []
        for convo in convos:
            member = (convo['participant_2_id'] if convo['participant_1_id'] == inbox
                      else convo['participant_1_id'])
            if school_inbox_service.office_inbox_id(member) == inbox:
                yield org, convo, member


def _messages(admin, conversation_id: str) -> List[Dict[str, Any]]:
    return (admin.table('direct_messages').select(MESSAGE_COLUMNS)
            .eq('conversation_id', conversation_id).order('created_at')
            .execute()).data or []


def _names(admin, user_ids) -> Dict[str, str]:
    ids = sorted({u for u in user_ids if u})
    if not ids:
        return {}
    rows = (admin.table('users').select('id, first_name, last_name, display_name')
            .in_('id', ids).execute()).data or []
    return {r['id']: (f"{r.get('first_name') or ''} {r.get('last_name') or ''}".strip()
                      or r.get('display_name') or 'Someone') for r in rows}


def _refresh_summary(admin, conversation_id: str) -> int:
    """Re-derive a thread's list row from its messages. Returns how many
    messages it holds."""
    rows = _messages(admin, conversation_id)
    if not rows:
        return 0
    convo = (admin.table('message_conversations').select('participant_1_id, participant_2_id')
             .eq('id', conversation_id).limit(1).execute()).data[0]
    live = [r for r in rows if not r.get('is_deleted')] or rows
    last = live[-1]
    unread = lambda uid: sum(1 for r in rows if r['recipient_id'] == uid and not r.get('read_at'))  # noqa: E731
    admin.table('message_conversations').update({
        'last_message_at': last['created_at'],
        'last_message_sender_id': last['sender_id'],
        'last_message_preview': (last.get('message_content') or 'Sent an attachment')[:100],
        'unread_count_p1': unread(convo['participant_1_id']),
        'unread_count_p2': unread(convo['participant_2_id']),
    }).eq('id', conversation_id).execute()
    return len(rows)


def _bell_rows(admin, member_id: str, inbox_id: str) -> List[Dict[str, Any]]:
    """The member's "New message from <school>" bell rows."""
    return (admin.table('notifications').select('id, link, title, metadata, created_at, is_read')
            .eq('user_id', member_id).eq('type', 'message_received')
            .eq('metadata->>sender_id', inbox_id).order('created_at').execute()).data or []


def _match_bell(bells: List[Dict[str, Any]], sent_at: str, used: set) -> Optional[Dict[str, Any]]:
    at = datetime.fromisoformat(sent_at)
    for bell in bells:
        if bell['id'] in used:
            continue
        gap = datetime.fromisoformat(bell['created_at']) - at
        if timedelta(seconds=-2) <= gap <= BELL_WINDOW:
            used.add(bell['id'])
            return bell
    return None


def main(apply: bool) -> None:
    # admin client justified: a one-time repair across every school's inbox
    #   threads, run by hand from a shell; no caller, so no RLS identity.
    import utils  # noqa: F401 -- first: database imports utils, which imports database
    from database import get_supabase_admin_client
    from services.direct_message_service import DirectMessageService

    admin = get_supabase_admin_client()
    threads = list(_office_threads(admin))
    print(f'{len(threads)} office threads with their own school inbox')
    backup: Dict[str, Any] = {'ran_at': datetime.utcnow().isoformat(), 'threads': []}
    work = []

    for org, convo, member in threads:
        inbox = org['inbox_user_id']
        messages = _messages(admin, convo['id'])
        moves = plan_moves(messages, inbox, member)
        by_id = {m['id']: m for m in messages}
        names = _names(admin, [member] + [x for mv in moves
                                          for x in (mv['sender_id'], mv['recipient_id'])])
        notes = [mv for mv in moves if mv['kind'] == 'note']
        replies = [mv for mv in moves if mv['kind'] == 'reply']
        unread = sum(1 for mv in notes if not by_id[mv['id']].get('read_at'))
        tasks = (admin.table('sis_onboarding_assignments').select('id', count='exact')
                 .eq('source_conversation_id', convo['id']).execute()).count or 0
        relays = (admin.table('message_email_relays').select('id', count='exact')
                  .eq('conversation_id', convo['id']).execute()).count or 0
        print(f"\n{org['name']} / {names.get(member, member[:8])}: {len(messages)} messages, "
              f"{len(notes)} notes ({unread} unread), {len(replies)} replies, "
              f"{len(messages) - len(moves)} left in place"
              + (f", {tasks} tasks and {relays} relays point here" if tasks or relays else ''))
        for mv in moves:
            src = by_id[mv['id']]
            print(f"    {src['created_at'][:16]} {mv['kind']:5} "
                  f"{names.get(mv['sender_id'], '?')} -> {names.get(mv['recipient_id'], '?')}"
                  f"{'' if src.get('read_at') else '  (unread)'}")

        bells = _bell_rows(admin, member, inbox)
        used: set = set()
        bell_for = {mv['id']: _match_bell(bells, by_id[mv['id']]['created_at'], used)
                    for mv in notes}
        reads = (admin.table('school_thread_reads').select('*')
                 .eq('conversation_id', convo['id']).execute()).data or []
        moved_ids = [mv['id'] for mv in moves]
        recipients = []
        if moved_ids:
            recipients = (admin.table('message_send_recipients')
                          .select('send_id, user_id, conversation_id, message_id')
                          .in_('message_id', moved_ids).execute()).data or []
        backup['threads'].append({
            'organization_id': org['id'], 'member_id': member, 'conversation': convo,
            'messages': [{k: by_id[i][k] for k in ('id', 'conversation_id', 'sender_id',
                                                   'recipient_id', 'sent_by_user_id',
                                                   'show_sender_name')} for i in moved_ids],
            'thread_reads': reads, 'send_recipients': recipients,
            'notifications': [b for b in bell_for.values() if b],
        })
        work.append((convo, member, moves, names, bell_for, bool(tasks or relays)))

    if not apply:
        print('\ndry run: nothing written. Re-run with --apply.')
        return
    if not any(w[2] for w in work):
        print('\nnothing to move.')
        return

    BACKUP_DIR.mkdir(exist_ok=True)
    path = BACKUP_DIR / f"office_thread_move_backup_{datetime.utcnow():%Y%m%dT%H%M%S}.json"
    path.write_text(json.dumps(backup, indent=2, default=str))
    print(f'\nbackup written: {path}')

    dms = DirectMessageService()
    for convo, member, moves, names, bell_for, pinned in work:
        touched = set()
        # Replies first: they are matched against notes still in the thread.
        for mv in sorted(moves, key=lambda x: x['kind'] != 'reply'):
            other = mv['recipient_id'] if mv['sender_id'] == member else mv['sender_id']
            target = dms.get_or_create_conversation(member, other)['id']
            touched.add(target)
            change = {'conversation_id': target, 'sender_id': mv['sender_id'],
                      'recipient_id': mv['recipient_id']}
            if mv['clear_author']:
                change.update({'sent_by_user_id': None, 'show_sender_name': None})
            admin.table('direct_messages').update(change).eq('id', mv['id']).execute()
            if mv['kind'] != 'note':
                continue
            admin.table('message_send_recipients').update(
                {'conversation_id': target}).eq('message_id', mv['id']).execute()
            bell = bell_for.get(mv['id'])
            if bell:
                author = names.get(mv['sender_id'], 'Someone')
                admin.table('notifications').update({
                    'link': f"/communication?user={mv['sender_id']}",
                    'title': f'New message from {author}',
                    'metadata': {**(bell.get('metadata') or {}),
                                 'sender_id': mv['sender_id'], 'sender_name': author},
                }).eq('id', bell['id']).execute()
        for target in touched:
            _refresh_summary(admin, target)
        if _refresh_summary(admin, convo['id']) or pinned:
            print(f"  {names.get(member, member[:8])}: moved {len(moves)}, thread kept")
            continue
        # The office's bell rows for this thread point at a page that is gone.
        admin.table('notifications').update({'is_read': True}).eq(
            'type', 'message_received').eq('is_read', False).eq(
            'metadata->>conversation_id', convo['id']).execute()
        admin.table('message_conversations').delete().eq('id', convo['id']).execute()
        print(f"  {names.get(member, member[:8])}: moved {len(moves)}, empty thread deleted")
    print('done')


if __name__ == '__main__':
    main(apply='--apply' in sys.argv)
