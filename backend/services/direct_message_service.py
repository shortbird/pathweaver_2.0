"""
Direct Message Service - Manages direct messaging between users
Handles advisor-student and friend-to-friend messaging
"""

import sys
from datetime import datetime
from typing import Dict, List, Optional, Any
import uuid
from services.base_service import BaseService
from services.notification_service import NotificationService
from database import get_supabase_admin_client

from utils.logger import get_logger
from utils.validation.sanitizers import pgrst_uuid

logger = get_logger(__name__)


class DirectMessageService(BaseService):
    """Service for direct messaging operations"""

    def __init__(self):
        # Don't store the client - get fresh one for each operation
        pass

    def _get_client(self):
        """Get a fresh Supabase client for each operation"""
        # admin client justified: messaging spans both sides of a conversation, and
        #   a sender cannot read the recipient's rows under RLS; membership is checked
        #   before every use
        return get_supabase_admin_client()

    # ==================== Permission Checking ====================

    def can_message_user(self, user_id: str, target_id: str) -> bool:
        """
        Check if user has permission to message target user

        Args:
            user_id: UUID of the sender
            target_id: UUID of the recipient

        Returns:
            Boolean indicating if messaging is allowed
        """
        try:
            supabase = self._get_client()
            print(f"[can_message_user] Checking permission: {user_id} -> {target_id}", file=sys.stderr, flush=True)

            # Block check (bidirectional): either party blocking the other blocks messaging.
            try:
                block_check = supabase.table('user_blocks') \
                    .select('id') \
                    .or_(
                        f'and(blocker_id.eq.{pgrst_uuid(user_id, "user_id")},'
                        f'blocked_id.eq.{pgrst_uuid(target_id, "target_id")}),'
                        f'and(blocker_id.eq.{pgrst_uuid(target_id, "target_id")},'
                        f'blocked_id.eq.{pgrst_uuid(user_id, "user_id")})'
                    ) \
                    .limit(1) \
                    .execute()
                if block_check.data:
                    print(f"[can_message_user] DENIED: user_blocks row between {user_id} and {target_id}", file=sys.stderr, flush=True)
                    return False
            except Exception as block_err:
                print(f"[can_message_user] block check failed (allowing): {block_err}", file=sys.stderr, flush=True)

            # SUPERADMIN: Can message anyone, and anyone can reply to superadmin
            from utils.roles import get_effective_role
            sender = supabase.table('users').select('role, org_role, organization_id').eq('id', user_id).single().execute()
            if sender.data and sender.data.get('role') == 'superadmin':
                print("[can_message_user] ALLOWED: Superadmin can message anyone", file=sys.stderr, flush=True)
                return True

            # Check if target is superadmin - anyone can message superadmin
            target = supabase.table('users').select('role, org_role, organization_id').eq('id', target_id).single().execute()
            if target.data and target.data.get('role') == 'superadmin':
                print("[can_message_user] ALLOWED: Anyone can message superadmin", file=sys.stderr, flush=True)
                return True

            # School inbox (2026-08-24): a member may DM their own org's
            # "{School Name}" account, and that account (staff replying from the
            # shared inbox) may DM the org's members. Checked early because the
            # inbox account is a platform user (organization_id NULL), so none
            # of the org/relationship rules below would ever match it.
            from services import school_inbox_service
            if school_inbox_service.can_message_school(user_id, target_id):
                print("[can_message_user] ALLOWED: School inbox <-> org member", file=sys.stderr, flush=True)
                return True

            # ORG_ADMIN: Can message anyone in the same organization
            sender_effective_role = get_effective_role(sender.data) if sender.data else None
            sender_org_id = sender.data.get('organization_id') if sender.data else None
            target_org_id = target.data.get('organization_id') if target.data else None
            # campus_coordinator included: the front office runs the campus, and
            # messaging is operational, not financial (the one thing the
            # coordinator tier withholds).
            ORG_OFFICE_ROLES = ('org_admin', 'campus_coordinator')
            if sender_effective_role in ORG_OFFICE_ROLES and sender_org_id and sender_org_id == target_org_id:
                print("[can_message_user] ALLOWED: Org office role can message anyone in their org", file=sys.stderr, flush=True)
                return True
            # Anyone in the same org can reply to their org_admin
            target_effective_role = get_effective_role(target.data) if target.data else None
            if target_effective_role in ORG_OFFICE_ROLES and target_org_id and sender_org_id == target_org_id:
                print("[can_message_user] ALLOWED: Anyone can message their org admin", file=sys.stderr, flush=True)
                return True

            # Check for advisor-student relationship via advisor_student_assignments table
            # Check if user_id is advisor for target_id
            advisor_assignment1 = supabase.table('advisor_student_assignments').select('id').eq(
                'advisor_id', user_id
            ).eq('student_id', target_id).eq('is_active', True).execute()

            # Check if target_id is advisor for user_id
            advisor_assignment2 = supabase.table('advisor_student_assignments').select('id').eq(
                'advisor_id', target_id
            ).eq('student_id', user_id).eq('is_active', True).execute()

            print(f"[can_message_user] Advisor assignment check: a1={advisor_assignment1.data}, a2={advisor_assignment2.data}", file=sys.stderr, flush=True)

            if (advisor_assignment1.data and len(advisor_assignment1.data) > 0) or \
               (advisor_assignment2.data and len(advisor_assignment2.data) > 0):
                print("[can_message_user] ALLOWED: Advisor-student assignment exists", file=sys.stderr, flush=True)
                return True

            # SIS class roster (bidirectional): a class's teacher and the students
            # enrolled in it can message each other. SIS teachers are assigned on
            # the class (primary/assistant instructor or class_advisors), not
            # through advisor_student_assignments, so this is the check that makes
            # teacher-student DMs work from the class Messages tab.
            from utils import class_membership
            if class_membership.shares_class(user_id, target_id) or \
               class_membership.shares_class(target_id, user_id):
                print("[can_message_user] ALLOWED: Shared class roster (teacher-student)", file=sys.stderr, flush=True)
                return True

            # Class families (2026-08-22): the class chat holds guardians and
            # teachers, so the 1:1 surface matches — a teacher and the guardian
            # of a student they teach can DM each other.
            if class_membership.teaches_child_of(user_id, target_id) or \
               class_membership.teaches_child_of(target_id, user_id):
                print("[can_message_user] ALLOWED: Teacher-guardian via class roster", file=sys.stderr, flush=True)
                return True

            # Friendship check removed (March 2026 - Feature pruning)
            # Students can no longer DM each other directly

            # Check if they have a parent-student link (bidirectional)
            parent_link1 = supabase.table('parent_student_links').select('id').eq(
                'parent_user_id', user_id
            ).eq('student_user_id', target_id).execute()

            parent_link2 = supabase.table('parent_student_links').select('id').eq(
                'parent_user_id', target_id
            ).eq('student_user_id', user_id).execute()

            print(f"[can_message_user] Parent link check: pl1={parent_link1.data}, pl2={parent_link2.data}", file=sys.stderr, flush=True)

            if (parent_link1.data and len(parent_link1.data) > 0) or \
               (parent_link2.data and len(parent_link2.data) > 0):
                print("[can_message_user] ALLOWED: Parent-student link exists", file=sys.stderr, flush=True)
                return True

            # Check for observer-student link (bidirectional)
            observer_link1 = supabase.table('observer_student_links').select('id').eq(
                'observer_id', user_id
            ).eq('student_id', target_id).execute()

            observer_link2 = supabase.table('observer_student_links').select('id').eq(
                'observer_id', target_id
            ).eq('student_id', user_id).execute()

            print(f"[can_message_user] Observer link check: ol1={observer_link1.data}, ol2={observer_link2.data}", file=sys.stderr, flush=True)

            if (observer_link1.data and len(observer_link1.data) > 0) or \
               (observer_link2.data and len(observer_link2.data) > 0):
                print("[can_message_user] ALLOWED: Observer-student link exists", file=sys.stderr, flush=True)
                return True

            # A school's adults are contacts of each other (2026-08-27): every
            # guardian and staff member of one organization can open a thread
            # with any other. It replaces the narrower carpool rule this started
            # as -- an active ride post connected exactly two accounts, so
            # parents could only reach the families already advertising, and
            # never each other for anything else. Students never qualify in
            # either direction.
            if self._org_adult_connection(user_id, target_id,
                                          sender_role=sender_effective_role,
                                          target_role=target_effective_role):
                print("[can_message_user] ALLOWED: Adults of the same school", file=sys.stderr, flush=True)
                return True

            print("[can_message_user] DENIED: No valid relationship found", file=sys.stderr, flush=True)
            return False

        except Exception as e:
            print(f"[can_message_user] ERROR: {str(e)}", file=sys.stderr, flush=True)
            return False

    def _org_adult_connection(self, user_id: str, target_id: str,
                              sender_role: str = None, target_role: str = None) -> bool:
        """True when both parties are adults on the same school's roster.

        Membership resolves the way the community board does
        (sis_service.member_org_id), so a platform parent -- no organization_id
        of their own -- is a member through their child. Students are excluded
        by role, and so are observers: they are linked to one student, not to
        the parent body, and keep their own narrower rule above.
        """
        try:
            # Imported here, not at module scope: sis_service reaches back into
            # the services package and the pair import-cycles at module load.
            from services import sis_service
            if sender_role not in sis_service.ADULT_ORG_ROLES or \
               target_role not in sis_service.ADULT_ORG_ROLES:
                return False
            org = sis_service.member_org_id(user_id)
            return bool(org) and sis_service.member_org_id(target_id) == org
        except Exception as e:
            print(f"[can_message_user] org adult check failed (denying): {e}", file=sys.stderr, flush=True)
            return False

    # ==================== Conversation Management ====================

    def get_or_create_conversation(self, user_id: str, target_id: str) -> Dict[str, Any]:
        """
        Get existing conversation between two users or create a new one

        Args:
            user_id: UUID of first participant
            target_id: UUID of second participant

        Returns:
            Conversation record
        """
        try:
            supabase = self._get_client()

            # Always store IDs in consistent order (smaller UUID first)
            p1_id, p2_id = (user_id, target_id) if user_id < target_id else (target_id, user_id)

            # Try to find existing conversation
            conversation = supabase.table('message_conversations').select('*').eq(
                'participant_1_id', p1_id
            ).eq('participant_2_id', p2_id).execute()

            if conversation.data and len(conversation.data) > 0:
                return conversation.data[0]

            # Create new conversation.
            #
            # `last_message_at` stays NULL until a message actually lands
            # (_update_conversation_metadata sets it on send). Stamping it with
            # now() at creation is what every client reads as "this thread has
            # traffic": the web list treats any row with a last_message_at as an
            # active conversation and sorts by it, so a thread nobody had written
            # in appeared at the TOP of Messages with a fresh timestamp. On
            # 2026-09-03, 137 of 230 rows in production were these — one of them
            # read as a brand-new message from a parent who had only opened the
            # Optio Support contact and never sent anything.
            new_conversation = {
                'id': str(uuid.uuid4()),
                'participant_1_id': p1_id,
                'participant_2_id': p2_id,
                'last_message_at': None,
                'last_message_preview': '',
                'unread_count_p1': 0,
                'unread_count_p2': 0,
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }

            result = supabase.table('message_conversations').insert(new_conversation).execute()
            return result.data[0]

        except Exception as e:
            print(f"Error getting or creating conversation: {str(e)}", file=sys.stderr, flush=True)
            raise

    def get_user_conversations(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Get all conversations for a user with metadata

        Args:
            user_id: UUID of the user

        Returns:
            List of conversation records with participant info
        """
        try:
            supabase = self._get_client()

            # Both sides of every thread in one request. Two `.eq()` reads were
            # two round trips for a filter Postgres can OR in one.
            #
            # `.or_()` takes a raw filter STRING, where a comma ends one clause
            # and starts the next -- so the id is proven to be a UUID before it
            # goes in. See utils/validation/sanitizers and
            # tests/test_postgrest_filter_injection.py.
            from utils.validation.sanitizers import pgrst_uuid
            convos = supabase.table('message_conversations').select('''
                id, participant_1_id, participant_2_id, last_message_at,
                last_message_preview, unread_count_p1, unread_count_p2,
                created_at, updated_at
            ''').or_(
                f'participant_1_id.eq.{pgrst_uuid(user_id, "user_id")},'
                f'participant_2_id.eq.{pgrst_uuid(user_id, "user_id")}'
            ).execute()

            rows = convos.data or []

            # Resolve every counterpart in one query. This used to be a
            # `_get_user_info` call per conversation -- ~110 ms each against
            # Supabase, so a 20-thread inbox spent two seconds doing nothing but
            # sequential single-row lookups.
            others = {
                (c['participant_2_id'] if c['participant_1_id'] == user_id
                 else c['participant_1_id'])
                for c in rows
            }
            users_by_id = self._get_users_info(others)

            all_conversations = []
            for convo in rows:
                is_p1 = convo['participant_1_id'] == user_id
                other_user_id = convo['participant_2_id'] if is_p1 else convo['participant_1_id']
                all_conversations.append({
                    **convo,
                    'other_user': users_by_id.get(
                        other_user_id, {'id': other_user_id, 'display_name': 'Unknown User'}
                    ),
                    'unread_count': convo['unread_count_p1'] if is_p1 else convo['unread_count_p2'],
                })

            # Recompute unread from the ACTUAL unread messages rather than trusting
            # the cached unread_count_p1/p2 counters, which drift out of sync (a
            # missed decrement left a "ghost" unread badge after the user had
            # already opened and read the conversation).
            try:
                # Paged: this is every unread message addressed to one account,
                # and a school inbox answering a whole parent body can hold more
                # than the 1000-row cap. Truncated, the tail of the list would
                # silently read as "no unread" -- the same failure mode as the
                # iCreate enrollment counts (see utils/db_fetch).
                from utils.db_fetch import fetch_all_rows
                unread_rows = fetch_all_rows(lambda: (
                    supabase.table('direct_messages')
                    .select('id, conversation_id')
                    .eq('recipient_id', user_id)
                    .is_('read_at', 'null')
                ))
                unread_by_convo: Dict[str, int] = {}
                for row in unread_rows:
                    cid = row.get('conversation_id')
                    if cid:
                        unread_by_convo[cid] = unread_by_convo.get(cid, 0) + 1
                for convo in all_conversations:
                    convo['unread_count'] = unread_by_convo.get(convo['id'], 0)
            except Exception as recount_err:
                # Non-fatal: fall back to the cached counters already set above.
                print(f"Unread recount failed (using cached counters): {recount_err}", file=sys.stderr, flush=True)

            # Threads with a school inbox render as the school, not as the
            # observer account that backs it (other_user.is_school).
            try:
                from services import school_inbox_service
                school_inbox_service.mark_school_conversations(all_conversations)
            except Exception as school_err:  # noqa: BLE001
                print(f"School conversation flagging failed: {school_err}", file=sys.stderr, flush=True)

            # Sort by last_message_at descending. A thread that has never been
            # written in carries NULL there (see get_or_create_conversation), and
            # None is not comparable to a string — so it sorts as the empty
            # string, landing at the bottom where an empty thread belongs.
            all_conversations.sort(key=lambda x: x['last_message_at'] or '', reverse=True)

            # Avatars live in private buckets, and the list draws them at 40px.
            # Serve thumbnails: the originals average 1.3 MB apiece and the
            # browser cannot reuse either one between loads (see storage_urls).
            from utils.storage_urls import sign_thumbs_in_place
            sign_thumbs_in_place(
                [c['other_user'] for c in all_conversations
                 if isinstance(c.get('other_user'), dict)],
                ['avatar_url'],
            )

            return all_conversations

        except Exception as e:
            print(f"Error getting user conversations: {str(e)}", file=sys.stderr, flush=True)
            raise

    def _get_user_info(self, user_id: str) -> Dict[str, Any]:
        """Get basic user info for conversation list"""
        try:
            supabase = self._get_client()
            user = supabase.table('users').select(
                'id, display_name, first_name, last_name, avatar_url, role'
            ).eq('id', user_id).single().execute()

            return user.data if user.data else {}
        except:
            return {'id': user_id, 'display_name': 'Unknown User'}

    # PostgREST `in_` filters ride in the query string, so long id lists are
    # chunked rather than sent as one enormous URL.
    _USER_INFO_CHUNK = 100

    def _get_users_info(self, user_ids) -> Dict[str, Dict[str, Any]]:
        """The batch form of :meth:`_get_user_info`, keyed by id.

        Anything that enriches a *list* should use this. Resolving names one
        row at a time is the difference between one round trip and one per
        conversation.
        """
        ids = [uid for uid in dict.fromkeys(user_ids) if uid]
        if not ids:
            return {}
        out: Dict[str, Dict[str, Any]] = {}
        try:
            supabase = self._get_client()
            for i in range(0, len(ids), self._USER_INFO_CHUNK):
                rows = supabase.table('users').select(
                    'id, display_name, first_name, last_name, avatar_url, role'
                ).in_('id', ids[i:i + self._USER_INFO_CHUNK]).execute().data or []
                for row in rows:
                    out[row['id']] = row
        except Exception as e:  # noqa: BLE001
            print(f"Batch user lookup failed: {e}", file=sys.stderr, flush=True)
        return out

    # ==================== Message Operations ====================

    def send_message(self, sender_id: str, recipient_id: str, content: str,
                     reply_to_message_id: str = None, attachments: list = None,
                     sent_by_user_id: str = None) -> Dict[str, Any]:
        """
        Send a message from one user to another. Supports replying to a message
        and attachments ([{url, type, name, size}], pre-uploaded).

        sent_by_user_id: set only by the school-inbox route — the staff member
        who wrote a message the school account is sending.

        Returns:
            Created message record (enriched with reply preview)
        """
        from services import messaging_extras_service as extras
        try:
            # Verify permission
            if not self.can_message_user(sender_id, recipient_id):
                raise ValueError("You don't have permission to message this user")

            # Get or create conversation
            conversation = self.get_or_create_conversation(sender_id, recipient_id)

            supabase = self._get_client()

            clean_atts = extras.clean_attachments(attachments)
            if reply_to_message_id:
                target = supabase.table('direct_messages').select('id, conversation_id').eq(
                    'id', reply_to_message_id).limit(1).execute()
                if not target.data or target.data[0]['conversation_id'] != conversation['id']:
                    reply_to_message_id = None

            # Create message
            message = {
                'id': str(uuid.uuid4()),
                'conversation_id': conversation['id'],
                'sender_id': sender_id,
                'recipient_id': recipient_id,
                'message_content': content,
                'reply_to_message_id': reply_to_message_id,
                'attachments': clean_atts,
                'sent_by_user_id': sent_by_user_id,
                'read_at': None,
                'created_at': datetime.utcnow().isoformat()
            }

            result = supabase.table('direct_messages').insert(message).execute()

            # Update conversation metadata
            self._update_conversation_metadata(
                conversation['id'],
                sender_id,
                recipient_id,
                (content or 'Sent an attachment')[:100]
            )

            # Send notification to recipient
            self._notify_recipient(sender_id, recipient_id, content or 'Sent an attachment')

            row = result.data[0]
            enriched = extras.enrich_messages('dm', [row], sender_id)[0]
            # Instant delivery to whoever has this conversation open.
            extras.broadcast_dm(conversation['id'], 'message', enriched)
            return enriched

        except Exception as e:
            print(f"Error sending message: {str(e)}", file=sys.stderr, flush=True)
            raise

    def _notify_recipient(self, sender_id: str, recipient_id: str, content: str) -> None:
        """
        Send a notification to the message recipient.

        Args:
            sender_id: UUID of the message sender
            recipient_id: UUID of the message recipient
            content: Message content (for preview)
        """
        try:
            # Get sender info for notification
            sender_info = self._get_user_info(sender_id)
            sender_name = (
                sender_info.get('display_name') or
                f"{sender_info.get('first_name', '')} {sender_info.get('last_name', '')}".strip() or
                'Someone'
            )

            # A message TO the school inbox has no human behind the recipient
            # account — notify the front office (admins + campus coordinators)
            # instead, pointing at the shared inbox in the SIS console.
            from services import school_inbox_service
            inbox_org = school_inbox_service.org_for_inbox_user(recipient_id)
            if inbox_org:
                preview = content[:50] + '...' if len(content) > 50 else content
                school_inbox_service.notify_admins_of_member_message(
                    inbox_org, sender_id, sender_name, preview
                )
                return

            # Get recipient's organization for notification
            supabase = self._get_client()
            recipient = supabase.table('users').select('organization_id').eq(
                'id', recipient_id
            ).single().execute()
            organization_id = recipient.data.get('organization_id') if recipient.data else None

            # Create notification
            message_preview = content[:50] + '...' if len(content) > 50 else content
            notification_service = NotificationService()
            notification_service.create_notification(
                user_id=recipient_id,
                notification_type='message_received',
                title=f'New message from {sender_name}',
                message=message_preview,
                link=f'/communication?user={sender_id}',
                metadata={
                    'sender_id': sender_id,
                    'sender_name': sender_name
                },
                organization_id=organization_id
            )

        except Exception as e:
            # Don't fail message send if notification fails
            logger.warning(f"Failed to send message notification: {str(e)}")

    def get_conversation_messages(
        self,
        conversation_id: str,
        user_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Get one page of a conversation, oldest-to-newest within the page.

        Accepts either a conversation id or the other participant's user id (the
        web client sends the latter — see mark_conversation_read). Two people
        with no thread yet get an empty list, not a new conversation row.

        `offset` counts back from the NEWEST message: offset 0 is the most
        recent `limit` messages.

        Args:
            conversation_id: UUID of the conversation OR target user ID
            user_id: UUID of the requesting user (for permission check)
            limit: Number of messages to return
            offset: Offset for pagination, from the newest message backwards

        Returns:
            List of message records
        """
        try:
            supabase = self._get_client()

            # Reading a thread must never CREATE one. This used to call
            # get_or_create_conversation, so merely opening someone's contact
            # card wrote a message_conversations row — and that row then read as
            # a live thread everywhere (see get_or_create_conversation). Opening
            # a contact you have never written to now costs nothing; the row is
            # created by the first send.
            conversation = self._find_conversation(conversation_id, user_id)
            if conversation is None:
                return []
            actual_conversation_id = conversation['id']

            # Newest page first, flipped back to chronological for the client.
            # Ordering ascending and taking range(0, 49) returned the OLDEST 50,
            # and no client paginates — so past 50 messages a thread stopped
            # showing new ones at all, with no error anywhere. No thread had
            # reached 50 yet, which is the only reason this never shipped as
            # "my messages stopped arriving".
            messages = supabase.table('direct_messages').select('*').eq(
                'conversation_id', actual_conversation_id
            ).order('created_at', desc=True).range(offset, offset + limit - 1).execute()

            from services import messaging_extras_service as extras
            return extras.enrich_messages('dm', list(reversed(messages.data or [])), user_id)

        except Exception as e:
            print(f"Error getting conversation messages: {str(e)}", file=sys.stderr, flush=True)
            raise

    def mark_as_read(self, message_id: str, user_id: str) -> bool:
        """
        Mark a message as read

        Args:
            message_id: UUID of the message
            user_id: UUID of the user marking as read

        Returns:
            Success boolean
        """
        try:
            supabase = self._get_client()

            # Get message
            message = supabase.table('direct_messages').select('*').eq(
                'id', message_id
            ).single().execute()

            if not message.data:
                raise ValueError("Message not found")

            # Only recipient can mark as read
            if message.data['recipient_id'] != user_id:
                raise ValueError("You can only mark your own messages as read")

            # Update message
            supabase.table('direct_messages').update({
                'read_at': datetime.utcnow().isoformat()
            }).eq('id', message_id).execute()

            # Decrement unread count
            self._decrement_unread_count(
                message.data['conversation_id'],
                message.data['sender_id'],
                message.data['recipient_id']
            )

            # Keep the notification bell in sync with the thread: clear the
            # 'message_received' notifications this reader has from this sender,
            # otherwise a viewed message keeps showing in the notification
            # center even though the thread is read.
            try:
                NotificationService().mark_message_notifications_read(
                    user_id=message.data['recipient_id'],
                    sender_id=message.data['sender_id'],
                )
            except Exception as notif_err:
                logger.warning(f"Failed to clear message notifications on read: {notif_err}")

            return True

        except Exception as e:
            print(f"Error marking message as read: {str(e)}", file=sys.stderr, flush=True)
            raise

    def _find_conversation(self, conversation_or_user_id: str,
                           user_id: str) -> Optional[Dict[str, Any]]:
        """The conversation behind an id from the URL, or None if there is none.

        `/conversations/<id>` accepts either a conversation id or the other
        participant's user id. Unlike get_conversation_messages this never
        creates one: a thread that does not exist has nothing unread in it.

        Raises ValueError if the caller is not a participant.
        """
        try:
            uuid.UUID(str(conversation_or_user_id))
        except (ValueError, AttributeError, TypeError) as _exc:
            raise ValueError("Conversation not found") from _exc

        supabase = self._get_client()
        rows = (supabase.table('message_conversations')
                .select('id, participant_1_id, participant_2_id')
                .eq('id', conversation_or_user_id).limit(1).execute()).data or []
        if rows:
            convo = rows[0]
            if user_id not in (convo['participant_1_id'], convo['participant_2_id']):
                raise ValueError("You are not a participant in this conversation")
            return convo

        # Participants are stored smallest-uuid-first; see
        # get_or_create_conversation, which is the only writer of these rows.
        p1_id, p2_id = sorted([user_id, conversation_or_user_id])
        rows = (supabase.table('message_conversations')
                .select('id, participant_1_id, participant_2_id')
                .eq('participant_1_id', p1_id).eq('participant_2_id', p2_id)
                .limit(1).execute()).data or []
        return rows[0] if rows else None

    def mark_conversation_read(self, conversation_id: str, user_id: str) -> int:
        """Mark every message this user has received in a thread as read.

        Returns the number of messages that changed.

        Opening a thread reads all of it at once, so this is one request. The
        client used to send a PUT per unread message and invalidate the
        conversation list on each response -- a thread with twenty unread
        messages fired twenty writes and twenty refetches of the most expensive
        endpoint on the page, all while the user was reading.
        """
        try:
            supabase = self._get_client()

            # The id in the URL is a conversation id OR the other person's user
            # id. Every other endpoint on this thread has taken both since the
            # first one was opened from a contact rather than an existing thread
            # (see get_conversation_messages), and a user id is what the web
            # client actually sends: ChatWindow's `conversation.id` comes from
            # contactToConversation, which carries the contact's id. Reading it
            # as a conversation id and nothing else made every mark-read a 500,
            # so unread badges never cleared (OPTIO-BACKEND-7H).
            convo = self._find_conversation(conversation_id, user_id)
            if convo is None:
                # These two have no thread yet -- nothing to mark read.
                return 0

            conversation_id = convo['id']
            is_p1 = convo['participant_1_id'] == user_id

            # One UPDATE ... WHERE, not a read-then-write per row. Scoped to the
            # caller as recipient, so it can only ever clear their own unread.
            updated = supabase.table('direct_messages').update({
                'read_at': datetime.utcnow().isoformat()
            }).eq('conversation_id', conversation_id) \
              .eq('recipient_id', user_id) \
              .is_('read_at', 'null').execute()

            rows = updated.data or []
            if not rows:
                return 0

            # The whole thread is read, so the counter is zero -- no decrement
            # arithmetic to drift out of step with the messages themselves.
            supabase.table('message_conversations').update(
                {'unread_count_p1' if is_p1 else 'unread_count_p2': 0}
            ).eq('id', conversation_id).execute()

            # Clear the bell for each sender whose message we just read, for the
            # reason mark_as_read does it: a read thread must not keep showing
            # in the notification center.
            senders = {r.get('sender_id') for r in rows if r.get('sender_id')}
            for sender_id in senders:
                try:
                    NotificationService().mark_message_notifications_read(
                        user_id=user_id, sender_id=sender_id,
                    )
                except Exception as notif_err:  # noqa: BLE001
                    logger.warning(f"Failed to clear message notifications on read: {notif_err}")

            return len(rows)

        except Exception as e:
            print(f"Error marking conversation as read: {str(e)}", file=sys.stderr, flush=True)
            raise

    def get_unread_count(self, user_id: str) -> int:
        """
        Get total unread message count for a user (drives the Messages tab badge).

        Counts the ACTUAL unread messages (direct_messages.read_at IS NULL) rather
        than summing the cached unread_count_p1/p2 counters on message_conversations.
        Those counters drift out of sync — _decrement_unread_count is a racy
        read-modify-write and a missed decrement leaves a "ghost" count, so the
        badge would stick at e.g. 1 forever even after every message was read.
        get_user_conversations() already recounts from direct_messages for the same
        reason; this makes the badge agree with the conversation list.

        Args:
            user_id: UUID of the user

        Returns:
            Total unread count
        """
        try:
            supabase = self._get_client()
            resp = supabase.table('direct_messages').select(
                'id', count='exact'
            ).eq('recipient_id', user_id).is_('read_at', 'null').execute()

            if resp.count is not None:
                return resp.count
            return len(resp.data or [])

        except Exception as e:
            print(f"Error getting unread count: {str(e)}", file=sys.stderr, flush=True)
            return 0

    # ==================== Parent / Guardian Read Access ====================

    def is_parent_of_child(self, parent_id: str, child_id: str) -> bool:
        """
        Check whether parent_id is a parent/guardian of child_id via either
        the dependents mechanism (users.managed_by_parent_id) or an approved
        parent_student_links row.
        """
        try:
            supabase = self._get_client()

            child = supabase.table('users').select('managed_by_parent_id').eq(
                'id', child_id
            ).single().execute()
            if child.data and child.data.get('managed_by_parent_id') == parent_id:
                return True

            link = supabase.table('parent_student_links').select('id').eq(
                'parent_user_id', parent_id
            ).eq('student_user_id', child_id).eq('status', 'approved').execute()
            return bool(link.data)

        except Exception as e:
            print(f"Error checking parent-child link: {str(e)}", file=sys.stderr, flush=True)
            return False

    def get_child_conversation_messages(
        self,
        conversation_id: str,
        child_id: str
    ) -> List[Dict[str, Any]]:
        """
        Read-only fetch of a child's conversation messages (for parent viewing).

        Unlike get_conversation_messages, this never creates a conversation and
        verifies the CHILD (not the requester) is a participant. Authorization
        that the requester may view this child is enforced by the route.

        Args:
            conversation_id: UUID of the conversation
            child_id: UUID of the child whose history is being viewed

        Returns:
            List of message records
        """
        try:
            supabase = self._get_client()

            conversation_result = supabase.table('message_conversations').select('*').eq(
                'id', conversation_id
            ).execute()

            if not conversation_result.data or len(conversation_result.data) == 0:
                raise ValueError("Conversation not found")

            conversation = conversation_result.data[0]
            if child_id not in [conversation['participant_1_id'], conversation['participant_2_id']]:
                raise ValueError("This conversation does not belong to the specified child")

            messages = supabase.table('direct_messages').select('*').eq(
                'conversation_id', conversation_id
            ).order('created_at', desc=False).execute()

            rows = messages.data if messages.data else []
            # The parent's access to this child's thread was verified above.
            # Attachments sit in a private bucket, so mint their short-lived
            # URLs here — one batched call for the whole thread.
            from services import messaging_extras_service as extras
            extras.sign_attachments(rows)
            return rows

        except Exception as e:
            print(f"Error getting child conversation messages: {str(e)}", file=sys.stderr, flush=True)
            raise

    # ==================== Helper Methods ====================

    def _update_conversation_metadata(
        self,
        conversation_id: str,
        sender_id: str,
        recipient_id: str,
        preview: str
    ):
        """Update conversation last_message_at, preview, and unread count"""
        try:
            supabase = self._get_client()
            conversation = supabase.table('message_conversations').select('*').eq(
                'id', conversation_id
            ).single().execute()

            if not conversation.data:
                return

            # Determine which participant is which
            is_sender_p1 = conversation.data['participant_1_id'] == sender_id

            # Increment unread count for recipient
            update_data = {
                'last_message_at': datetime.utcnow().isoformat(),
                'last_message_preview': preview,
                'updated_at': datetime.utcnow().isoformat()
            }

            if is_sender_p1:
                update_data['unread_count_p2'] = conversation.data['unread_count_p2'] + 1
            else:
                update_data['unread_count_p1'] = conversation.data['unread_count_p1'] + 1

            supabase.table('message_conversations').update(update_data).eq(
                'id', conversation_id
            ).execute()

        except Exception as e:
            print(f"Error updating conversation metadata: {str(e)}", file=sys.stderr, flush=True)

    def _decrement_unread_count(
        self,
        conversation_id: str,
        sender_id: str,
        recipient_id: str
    ):
        """Decrement unread count when message is marked as read"""
        try:
            supabase = self._get_client()
            conversation = supabase.table('message_conversations').select('*').eq(
                'id', conversation_id
            ).single().execute()

            if not conversation.data:
                return

            # Determine which participant is the recipient
            is_recipient_p1 = conversation.data['participant_1_id'] == recipient_id

            # Decrement unread count (don't go below 0)
            if is_recipient_p1:
                new_count = max(0, conversation.data['unread_count_p1'] - 1)
                supabase.table('message_conversations').update({
                    'unread_count_p1': new_count
                }).eq('id', conversation_id).execute()
            else:
                new_count = max(0, conversation.data['unread_count_p2'] - 1)
                supabase.table('message_conversations').update({
                    'unread_count_p2': new_count
                }).eq('id', conversation_id).execute()

        except Exception as e:
            print(f"Error decrementing unread count: {str(e)}", file=sys.stderr, flush=True)
