"""
Two repairs to who a message thread belongs to, for the rules of 2026-10-01
(docs/messaging/MESSAGING_AUDIT_2026-10-01.md). Each moves stored messages to
the thread they would land in today, and each is safe to re-run.

1. Notes the school "sent" to its own front office go back to the people who
   wrote them.

   Until c2347490 (2026-09-30) Compose wrote to an office member who was also
   a guardian as the school. The office reads that inbox as the school, so the
   note landed in a thread between the member and their own office: left out
   of My messages on every surface, still counted by the unread badge, and
   readable only on the School tab under the reader's own name -- 65 messages
   in 7 iCreate threads, 12 of them unread behind a badge nobody could clear.

     note    school -> member, written by a colleague: becomes that
             colleague's personal message to the member.
     reply   member -> school, after a note: becomes the member's personal
             message to whoever wrote the note they were answering (the last
             colleague to write before it). A reply the member typed "as the
             school" into their own thread is the same thing.
     left    a member's message before any colleague wrote (mail to the office
             itself), or a school message with no recorded author. Not moved.

2. Personal threads between the front office and a family or student become
   the school's thread with that family.

   The office and a family have one thread now, the school's
   (school_inbox_service.office_family_route). A parent used to hold two with
   one person, "iCreate" and "Marika Connole". What the office member wrote
   becomes the school's message with their name recorded; what the family
   wrote becomes mail to the school inbox, where the whole office reads it.
   Which pairs count is asked of the same function the send route uses, so a
   thread moves exactly when a new message between the two would.

3. A chat's unread bell rows become one row with a count.

   A group chat used to write one bell row per message. It writes one per
   chat now and rings again only once that row is read
   (group_message_service._deliver_group_notifications), so a member holding
   a week of old unread rows for a chat would get no alert for it until they
   opened it, and the bell would still show the pile. The newest row of each
   (member, chat) keeps the count; the older ones are marked read.

Ids, timestamps, read state and attachments are kept, so nothing new rings and
an unread message is still unread -- in a thread its reader can open. A thread
left empty is deleted. Every original value is written to a backup file before
the first write. In repair 1 replies move before the notes they are matched
against, so a run that stops halfway plans the rest the same way.

Usage:
    cd backend && ../venv/bin/python scripts/move_office_school_threads.py            # dry run
    cd backend && ../venv/bin/python scripts/move_office_school_threads.py --apply
"""

import json
import re
import sys
from datetime import datetime, timedelta, timezone
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


def plan_family_moves(messages: List[Dict[str, Any]], office_id: str, member_id: str,
                      inbox_id: str) -> List[Dict[str, Any]]:
    """Where each message of an office member's personal thread with a family
    or student belongs: in the school's thread with that family. Pure.

    What the office member wrote becomes the school's, with them as its
    author; what the family wrote becomes mail to the school.
    """
    moves: List[Dict[str, Any]] = []
    for m in messages:
        if m.get('sender_id') == office_id:
            moves.append({'id': m['id'], 'sender_id': inbox_id, 'recipient_id': member_id,
                          'sent_by_user_id': m.get('sent_by_user_id') or office_id})
        elif m.get('sender_id') == member_id:
            moves.append({'id': m['id'], 'sender_id': member_id, 'recipient_id': inbox_id,
                          'sent_by_user_id': m.get('sent_by_user_id')})
    return moves


def collapsed_title(title: str, count: int) -> str:
    """The one-row wording for `count` unread messages, from the title it
    replaces: a per-message title, or one this already rewrote. Matches
    group_message_service's two shapes (a member's row, the office's row)."""
    title = title or ''
    school = ''
    if ' inbox: ' in title:
        school, _, title = title.partition(' inbox: ')
        school += ' inbox: '
    title = re.sub(r'^(New message in |\d+ new messages in )', '', title)
    return f'{school}{count} new messages in {title}'


def plan_bell_collapse(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """For unread group-message bell rows, one entry per (member, chat, kind
    of row) that holds more than one: the row to keep, its new title and
    count, and the ids to mark read. Pure. A member's own row and the office's
    row for a school group open different pages, so they never merge."""
    piles: Dict[Tuple[str, str, bool], List[Dict[str, Any]]] = {}
    for r in rows:
        group_id = (r.get('metadata') or {}).get('group_id')
        if not group_id:
            continue
        key = (r['user_id'], group_id, (r.get('link') or '').startswith('/inbox'))
        piles.setdefault(key, []).append(r)
    out = []
    for pile in piles.values():
        if len(pile) < 2:
            continue
        pile.sort(key=lambda r: r['created_at'], reverse=True)
        keep = pile[0]
        # A row already collapsed carries its own count.
        count = sum(int((r.get('metadata') or {}).get('count') or 1) for r in pile)
        out.append({'keep': keep['id'], 'count': count,
                    'title': collapsed_title(keep.get('title') or '', count),
                    'metadata': {**(keep.get('metadata') or {}), 'count': count},
                    'read': [r['id'] for r in pile[1:]]})
    return out


def _office_family_threads(admin) -> Iterator[Tuple[Dict[str, Any], Dict[str, Any], str, str]]:
    """(org, conversation, office member id, family member id) for every
    personal thread that is school mail under office_family_route."""
    from services import school_inbox_service
    from utils.validation.sanitizers import pgrst_uuid
    orgs = (admin.table('organizations').select('id, name, inbox_user_id, is_active')
            .not_.is_('inbox_user_id', 'null').execute()).data or []
    for org in orgs:
        if not org.get('is_active') or not school_inbox_service.org_uses_school_inbox(org):
            continue
        for office_id in school_inbox_service.admin_recipient_ids(org['id']):
            convos = (admin.table('message_conversations').select('*')
                      .or_(f'participant_1_id.eq.{pgrst_uuid(office_id, "office_id")},'
                           f'participant_2_id.eq.{pgrst_uuid(office_id, "office_id")}')
                      .execute()).data or []
            for convo in convos:
                other = (convo['participant_2_id'] if convo['participant_1_id'] == office_id
                         else convo['participant_1_id'])
                if other == org['inbox_user_id']:
                    continue
                route = school_inbox_service.office_family_route(office_id, other)
                if route and route['direction'] == 'to_family' and route['org']['id'] == org['id']:
                    yield org, convo, office_id, other


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


def move_office_notes(admin, apply: bool) -> None:
    """Repair 1 (module docstring)."""
    from services.direct_message_service import DirectMessageService

    threads = list(_office_threads(admin))
    print(f'{len(threads)} office threads with their own school inbox')
    backup: Dict[str, Any] = {'ran_at': datetime.now(timezone.utc).isoformat(), 'threads': []}
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
        recipients: List[Dict[str, Any]] = []
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
        return
    if not any(w[2] for w in work):
        print('nothing to move.')
        return

    BACKUP_DIR.mkdir(exist_ok=True)
    path = BACKUP_DIR / f"office_thread_move_backup_{datetime.now(timezone.utc):%Y%m%dT%H%M%S}.json"
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


def move_family_threads(admin, apply: bool) -> None:
    """Repair 2 (module docstring)."""
    from services import school_inbox_service
    from services.direct_message_service import DirectMessageService

    threads = list(_office_family_threads(admin))
    print(f'\n{len(threads)} personal threads between the front office and a family or student')
    backup: Dict[str, Any] = {'ran_at': datetime.now(timezone.utc).isoformat(), 'threads': []}
    work = []
    for org, convo, office_id, member_id in threads:
        inbox = org['inbox_user_id']
        messages = _messages(admin, convo['id'])
        moves = plan_family_moves(messages, office_id, member_id, inbox)
        by_id = {m['id']: m for m in messages}
        names = _names(admin, [office_id, member_id])
        unread = sum(1 for m in messages if not m.get('read_at'))
        print(f"  {org['name']}: {names.get(office_id, office_id[:8])} <-> "
              f"{names.get(member_id, member_id[:8])}: {len(messages)} messages "
              f"({sum(1 for m in messages if m['sender_id'] == office_id)} from the office, "
              f"{unread} unread)")
        moved_ids = [mv['id'] for mv in moves]
        recipients: List[Dict[str, Any]] = []
        if moved_ids:
            recipients = (admin.table('message_send_recipients')
                          .select('send_id, user_id, conversation_id, message_id')
                          .in_('message_id', moved_ids).execute()).data or []
        bells = (
            (admin.table('notifications').select('id, user_id, link, title, metadata, is_read')
             .eq('user_id', member_id).eq('type', 'message_received')
             .eq('metadata->>sender_id', office_id).execute()).data or [])
        office_bells = (
            (admin.table('notifications').select('id, user_id, link, title, metadata, is_read')
             .eq('user_id', office_id).eq('type', 'message_received')
             .eq('metadata->>sender_id', member_id).execute()).data or [])
        backup['threads'].append({
            'organization_id': org['id'], 'office_id': office_id, 'member_id': member_id,
            'conversation': convo,
            'messages': [{k: by_id[i][k] for k in ('id', 'conversation_id', 'sender_id',
                                                   'recipient_id', 'sent_by_user_id',
                                                   'show_sender_name')} for i in moved_ids],
            'send_recipients': recipients, 'notifications': bells + office_bells,
        })
        work.append((org, convo, office_id, member_id, moves, names, bells, office_bells))

    if not apply:
        return
    if not work:
        print('nothing to move.')
        return

    BACKUP_DIR.mkdir(exist_ok=True)
    path = BACKUP_DIR / f"office_family_move_backup_{datetime.now(timezone.utc):%Y%m%dT%H%M%S}.json"
    path.write_text(json.dumps(backup, indent=2, default=str))
    print(f'backup written: {path}')

    dms = DirectMessageService()
    for org, convo, office_id, member_id, moves, names, bells, office_bells in work:
        inbox = org['inbox_user_id']
        school = org.get('name') or 'School'
        if not moves:
            # A row somebody opened and never wrote in. Nothing to move, and
            # making an empty school thread for it would only add one to the
            # inbox's All view.
            if not _refresh_summary(admin, convo['id']):
                admin.table('message_conversations').delete().eq('id', convo['id']).execute()
            continue
        target = dms.get_or_create_conversation(inbox, member_id)
        for mv in moves:
            admin.table('direct_messages').update({
                'conversation_id': target['id'], 'sender_id': mv['sender_id'],
                'recipient_id': mv['recipient_id'], 'sent_by_user_id': mv['sent_by_user_id'],
            }).eq('id', mv['id']).execute()
            admin.table('message_send_recipients').update(
                {'conversation_id': target['id']}).eq('message_id', mv['id']).execute()
        # The family's bell rows said the office member's name and opened the
        # personal thread; the office member's opened it from the other side.
        for bell in bells:
            admin.table('notifications').update({
                'link': f'/communication?user={inbox}',
                'title': f'New message from {school}',
                'metadata': {**(bell.get('metadata') or {}), 'sender_id': inbox,
                             'sender_name': school},
            }).eq('id', bell['id']).execute()
        link = school_inbox_service.school_inbox_link(conversation_id=target['id'])
        for bell in office_bells:
            admin.table('notifications').update({
                'link': link,
                'title': f"{school} inbox: message from {names.get(member_id, 'a member')}",
                'metadata': {**(bell.get('metadata') or {}), 'school_inbox': True,
                             'organization_id': org['id'], 'conversation_id': target['id']},
            }).eq('id', bell['id']).execute()
        _refresh_summary(admin, target['id'])
        # A thread the office member had marked handled stays handled, when
        # its last word is still the school thread's last word.
        office_is_p1 = convo['participant_1_id'] == office_id
        handled = convo.get('resolved_at_p1' if office_is_p1 else 'resolved_at_p2')
        if handled and convo.get('last_message_at') and handled >= convo['last_message_at']:
            fresh = (admin.table('message_conversations')
                     .select('participant_1_id, last_message_at, resolved_at_p1, resolved_at_p2')
                     .eq('id', target['id']).limit(1).execute()).data[0]
            if fresh.get('last_message_at') == convo['last_message_at']:
                side = 'resolved_at_p1' if fresh['participant_1_id'] == inbox else 'resolved_at_p2'
                if not fresh.get(side) or fresh[side] < handled:
                    admin.table('message_conversations').update(
                        {side: handled}).eq('id', target['id']).execute()
        if _refresh_summary(admin, convo['id']):
            print(f"    {names.get(office_id)} <-> {names.get(member_id)}: moved {len(moves)}, thread kept")
            continue
        admin.table('message_conversations').delete().eq('id', convo['id']).execute()
        print(f"    {names.get(office_id)} <-> {names.get(member_id)}: moved {len(moves)}")
    print('done')


def collapse_chat_bells(admin, apply: bool) -> None:
    """Repair 3 (module docstring)."""
    from utils.db_fetch import fetch_all_rows
    rows = fetch_all_rows(lambda: (
        admin.table('notifications')
        .select('id, user_id, title, link, metadata, created_at')
        .eq('type', 'message_received').eq('is_read', False)
        .not_.is_('metadata->>group_id', 'null')))
    plan = plan_bell_collapse(rows)
    stale = sum(len(p['read']) for p in plan)
    print(f'\n{len(rows)} unread chat bell rows; {len(plan)} piles to collapse, '
          f'{stale} older rows to mark read')
    if not apply or not plan:
        return
    for p in plan:
        admin.table('notifications').update(
            {'title': p['title'], 'metadata': p['metadata']}).eq('id', p['keep']).execute()
    ids = [i for p in plan for i in p['read']]
    for start in range(0, len(ids), 100):
        admin.table('notifications').update({'is_read': True}).in_(
            'id', ids[start:start + 100]).execute()
    print('done')


def main(apply: bool) -> None:
    # admin client justified: a one-time repair across every school's inbox
    #   threads, run by hand from a shell; no caller, so no RLS identity.
    import utils  # noqa: F401 -- first: database imports utils, which imports database
    from database import get_supabase_admin_client

    admin = get_supabase_admin_client()
    move_office_notes(admin, apply)
    move_family_threads(admin, apply)
    collapse_chat_bells(admin, apply)
    if not apply:
        print('\ndry run: nothing written. Re-run with --apply.')


if __name__ == '__main__':
    main(apply='--apply' in sys.argv)
