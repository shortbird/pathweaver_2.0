"""
Group Message Service - Manages group chat functionality
Handles group creation, membership, and messaging for advisors, org admins, and superadmins
"""

from datetime import datetime
from typing import Dict, List, Optional, Any
import uuid
from services.base_service import BaseService
from database import get_supabase_admin_client
from services.notification_service import NotificationService

from utils.logger import get_logger

logger = get_logger(__name__)


class GroupMessageService(BaseService):
    """Service for group messaging operations"""

    #: Who may start a group chat. Staff only, across both tiers: platform
    #: advisors and superadmins, and org staff resolved through org_roles.
    #: Deliberately the STAFF tier and not ADMIN_ROLES -- a teacher starting a
    #: group for her own class is the original use case.
    GROUP_CREATOR_ROLES = frozenset({
        'advisor', 'org_admin', 'campus_coordinator', 'superadmin',
    })

    def __init__(self):
        pass

    def _get_client(self):
        """Get a fresh Supabase client for each operation"""
        # admin client justified: messaging spans both sides of a conversation, and
        #   a sender cannot read the recipient's rows under RLS; membership is checked
        #   before every use
        return get_supabase_admin_client()

    # ==================== Permission Checking ====================

    def can_create_group(self, user_id: str) -> bool:
        """Whether this person may start a group chat: staff only.

        Reads EVERY role the person holds, not `org_role` alone. Two bugs came
        out of the old single-column check:

        1. `campus_coordinator` was missing from the list, so a coordinator got
           "You do not have permission to create groups" from a console where
           ADMIN_ROLES (utils/sis_roles.py:36) lets her do everything else the
           front office does. Group chat is not financial and not HR.
        2. `org_role` is one column but staff hold several roles. At iCreate the
           teachers are parents too: org_roles ['parent', 'advisor'] with
           org_role 'parent' failed this check while the same person's
           @require_role(*STAFF_ROLES) routes all passed (the same shape as
           Sentry OPTIO-BACKEND-6P, 2026-08-18, in verify_parent_role).

        get_effective_roles resolves org_managed through org_roles/org_role and
        narrows under an active role view, so viewing as a parent correctly
        stops you creating staff groups.
        """
        try:
            supabase = self._get_client()
            user = (supabase.table('users').select('role, org_role, org_roles')
                    .eq('id', user_id).single().execute())

            if not user.data:
                return False

            from utils.roles import get_effective_roles
            return bool(set(get_effective_roles(user.data)) & self.GROUP_CREATOR_ROLES)

        except Exception as e:
            logger.error(f"Error checking create group permission: {str(e)}")
            return False

    def is_group_member(self, user_id: str, group_id: str) -> bool:
        """Check if user is a member of the group"""
        try:
            supabase = self._get_client()
            member = supabase.table('group_members').select('id').eq(
                'group_id', group_id
            ).eq('user_id', user_id).execute()

            return bool(member.data and len(member.data) > 0)

        except Exception as e:
            logger.error(f"Error checking group membership: {str(e)}")
            return False

    def is_group_admin(self, user_id: str, group_id: str) -> bool:
        """Check if user is an admin of the group"""
        try:
            supabase = self._get_client()
            member = supabase.table('group_members').select('role').eq(
                'group_id', group_id
            ).eq('user_id', user_id).single().execute()

            return member.data and member.data.get('role') == 'admin'

        except Exception as e:
            logger.error(f"Error checking group admin status: {str(e)}")
            return False

    def can_add_member(self, user_id: str, group_id: str, target_user_id: str) -> bool:
        """
        Check if user can add target user to group
        Enforces organization isolation

        Args:
            user_id: UUID of the user trying to add
            group_id: UUID of the group
            target_user_id: UUID of the user being added

        Returns:
            Boolean indicating if add is allowed
        """
        try:
            supabase = self._get_client()

            # User must be group admin
            if not self.is_group_admin(user_id, group_id):
                return False

            # Get group info
            group = supabase.table('group_conversations').select('organization_id').eq(
                'id', group_id
            ).single().execute()

            if not group.data:
                return False

            group_org_id = group.data.get('organization_id')

            # Get target user's organization
            target_user = supabase.table('users').select('organization_id').eq(
                'id', target_user_id
            ).single().execute()

            if not target_user.data:
                return False

            target_org_id = target_user.data.get('organization_id')

            # Organization isolation check.
            if group_org_id is not None:
                # Org group: target must be a member of the same org.
                if target_org_id != group_org_id:
                    logger.warning(
                        f"Organization isolation: Cannot add user {target_user_id} "
                        f"(org: {target_org_id}) to group in org {group_org_id}"
                    )
                    return False
                return True

            # IDOR-H3 fix: platform (null-org) group has no org boundary. Allow
            # adding a user the adder has an explicit relationship with
            # (self / dependent / approved parent link / active advisor
            # assignment), so a platform advisor can't add an arbitrary minor —
            # OR someone who already shares a group with the adder (they were
            # vetted into a common group by someone with a direct link, so
            # co-membership is not new exposure). Without the second clause an
            # organizer couldn't add a co-advisor or another advisor's student,
            # which gutted platform groups entirely.
            if self._has_explicit_relationship(supabase, user_id, target_user_id):
                return True
            if self._shares_group_with(supabase, user_id, target_user_id):
                return True
            logger.warning(
                f"Platform group: no relationship or shared group allowing "
                f"{user_id} to add {target_user_id}"
            )
            return False

        except Exception as e:
            logger.error(f"Error checking add member permission: {str(e)}")
            return False

    def _has_explicit_relationship(self, supabase, actor_id: str, target_id: str) -> bool:
        """Whether `actor_id` has a direct relationship with `target_id`:
        self, a dependent (users.managed_by_parent_id, either direction), an
        approved parent_student_links row (either direction), or an active
        advisor_student_assignments row (either direction). Uses .eq() filters
        (no string interpolation) so a body-supplied target id can't inject."""
        if not actor_id or not target_id:
            return False
        if actor_id == target_id:
            return True
        checks = [
            ('users', [('id', target_id), ('managed_by_parent_id', actor_id)]),
            ('users', [('id', actor_id), ('managed_by_parent_id', target_id)]),
            ('parent_student_links', [('parent_user_id', actor_id), ('student_user_id', target_id), ('status', 'approved')]),
            ('parent_student_links', [('parent_user_id', target_id), ('student_user_id', actor_id), ('status', 'approved')]),
            ('advisor_student_assignments', [('advisor_id', actor_id), ('student_id', target_id), ('is_active', True)]),
            ('advisor_student_assignments', [('advisor_id', target_id), ('student_id', actor_id), ('is_active', True)]),
        ]
        for table, filters in checks:
            try:
                q = supabase.table(table).select('id')
                for col, val in filters:
                    q = q.eq(col, val)
                if q.limit(1).execute().data:
                    return True
            except Exception as _exc:
                logger.debug("group membership probe failed: %s", _exc, exc_info=True)
                continue
        return False

    def _shares_group_with(self, supabase, actor_id: str, target_id: str) -> bool:
        """Whether the two users are already members of any common group."""
        try:
            my_groups = [g['group_id'] for g in (
                supabase.table('group_members').select('group_id')
                .eq('user_id', actor_id).execute().data or [])]
            if not my_groups:
                return False
            hit = (supabase.table('group_members').select('id')
                   .eq('user_id', target_id).in_('group_id', my_groups)
                   .limit(1).execute().data)
            return bool(hit)
        except Exception:
            return False

    def _addable_platform_user_ids(self, supabase, actor_id: str) -> set:
        """User ids the actor may add to a platform (null-org) group — exactly
        the set can_add_member admits: explicit relationships (dependents /
        guardians, approved parent links, active advisor assignments) plus
        co-members of the actor's existing groups. Never the whole platform."""
        related = set()
        try:
            for r in (supabase.table('users').select('id')
                      .eq('managed_by_parent_id', actor_id).execute().data or []):
                related.add(r['id'])
            me = (supabase.table('users').select('managed_by_parent_id')
                  .eq('id', actor_id).limit(1).execute().data)
            if me and me[0].get('managed_by_parent_id'):
                related.add(me[0]['managed_by_parent_id'])
            for r in (supabase.table('parent_student_links').select('student_user_id')
                      .eq('parent_user_id', actor_id).eq('status', 'approved')
                      .execute().data or []):
                related.add(r['student_user_id'])
            for r in (supabase.table('parent_student_links').select('parent_user_id')
                      .eq('student_user_id', actor_id).eq('status', 'approved')
                      .execute().data or []):
                related.add(r['parent_user_id'])
            for r in (supabase.table('advisor_student_assignments').select('student_id')
                      .eq('advisor_id', actor_id).eq('is_active', True)
                      .execute().data or []):
                related.add(r['student_id'])
            for r in (supabase.table('advisor_student_assignments').select('advisor_id')
                      .eq('student_id', actor_id).eq('is_active', True)
                      .execute().data or []):
                related.add(r['advisor_id'])
            my_groups = [g['group_id'] for g in (
                supabase.table('group_members').select('group_id')
                .eq('user_id', actor_id).execute().data or [])]
            if my_groups:
                for r in (supabase.table('group_members').select('user_id')
                          .in_('group_id', my_groups).execute().data or []):
                    related.add(r['user_id'])
        except Exception as e:
            logger.error(f"Error collecting addable users for {actor_id}: {e}")
        related.discard(actor_id)
        return related

    # ==================== Group Management ====================

    def create_group(
        self,
        user_id: str,
        name: str,
        description: Optional[str] = None,
        member_ids: Optional[List[str]] = None,
        organization_id: Optional[str] = None,
        audience: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a new group chat

        Args:
            user_id: UUID of the creator
            name: Group name
            description: Optional group description
            member_ids: Optional list of member UUIDs to add
            organization_id: Org the group belongs to. Defaults to the creator's.
                Pass it explicitly for a superadmin, who has no organization of
                their own: a group minted with organization_id NULL then fails
                can_add_member for every teacher in it (no shared org, no
                explicit relationship), so the superadmin ends up alone in a
                group they created for a school.
            audience: 'family' | 'student' | 'staff'. Class chats set the first
                two; a staff group sets 'staff'. Left unset, the column default
                ('family') would quietly file a staff group with the parents.

        Returns:
            Created group record
        """
        try:
            if not self.can_create_group(user_id):
                raise ValueError("You don't have permission to create groups")

            supabase = self._get_client()

            creator = supabase.table('users').select('organization_id, role').eq(
                'id', user_id
            ).single().execute()
            creator_org = creator.data.get('organization_id') if creator.data else None

            if organization_id and organization_id != creator_org:
                # Only a superadmin may name an org that is not their own.
                if not creator.data or creator.data.get('role') != 'superadmin':
                    raise ValueError("You cannot create a group in another organization")
            organization_id = organization_id or creator_org

            # Create group
            group_id = str(uuid.uuid4())
            group = {
                'id': group_id,
                'name': name,
                'description': description,
                'created_by': user_id,
                'organization_id': organization_id,
                'is_active': True,
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }
            if audience:
                group['audience'] = audience

            # Add creator as admin
            created = self._insert_group(supabase, group, [
                self._member_row(group_id, user_id, 'admin', added_by=user_id),
            ])

            # Add initial members if provided
            if member_ids:
                for member_id in member_ids:
                    if member_id != user_id:  # Don't duplicate creator
                        try:
                            self.add_member(user_id, group_id, member_id)
                        except Exception as e:
                            logger.warning(f"Failed to add initial member {member_id}: {str(e)}")

            return created

        except Exception as e:
            logger.error(f"Error creating group: {str(e)}")
            raise

    @staticmethod
    def _member_row(group_id: str, user_id: str, role: str, *, added_by: str) -> Dict[str, Any]:
        return {
            'id': str(uuid.uuid4()),
            'group_id': group_id,
            'user_id': user_id,
            'role': role,
            'joined_at': datetime.utcnow().isoformat(),
            'added_by': added_by,
        }

    @staticmethod
    def _insert_group(supabase, group: Dict[str, Any],
                      members: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Insert the group row, then its first members in one write."""
        result = supabase.table('group_conversations').insert(group).execute()
        if not result.data:
            raise Exception("Failed to create group")
        if members:
            supabase.table('group_members').insert(members).execute()
        return result.data[0]

    def create_school_group(
        self,
        organization_id: str,
        inbox_user_id: str,
        actor_id: str,
        name: str,
        member_ids: List[str],
        audience: str = 'staff',
    ) -> Dict[str, Any]:
        """A group the SCHOOL owns, started by a staff member from the School tab.

        "When I sent a group message from icreate's inbox, the thread popped
        into my PERSONAL inbox" (iCreate, ac84b6cd): create_group makes the
        sender the owner and a member, so the thread was theirs alone, listed
        under My messages and nowhere the rest of the office could see it.

        Here the school-inbox account is the creator and the group's admin,
        the way send_as_school makes it the sender of a DM. The staff member
        who started it is recorded as `added_by` on every membership and as
        the `sender_id` of what they write -- the actor, not the school, so a
        teacher replying knows who asked. They are NOT a member: the office
        reads the thread through the school inbox (school_inbox_service.
        school_group_access), exactly as it reads the school's DMs.

        The caller has already checked the actor is front-office staff of this
        org and that every member belongs to it -- staff
        (sis_messaging_service.resolve_recipients), or, from the console's one
        Compose, staff, current students and their guardians
        (message_compose_service._universe) -- which is why this does not run
        can_add_member: that
        rule asks whether the CREATOR shares an org with the target, and the
        inbox account deliberately has no organization_id.
        """
        if not self.can_create_group(actor_id):
            raise ValueError("You don't have permission to create groups")
        supabase = self._get_client()
        group_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        group = {
            'id': group_id,
            'name': name,
            'description': None,
            'created_by': inbox_user_id,
            'organization_id': organization_id,
            'is_active': True,
            'audience': audience,
            'created_at': now,
            'updated_at': now,
        }
        members = [self._member_row(group_id, inbox_user_id, 'admin', added_by=actor_id)]
        members += [self._member_row(group_id, m, 'member', added_by=actor_id)
                    for m in dict.fromkeys(member_ids) if m and m != inbox_user_id]
        return self._insert_group(supabase, group, members)

    def get_school_groups(self, inbox_user_id: str) -> List[Dict[str, Any]]:
        """The groups a school owns, shaped like get_user_groups, with the
        unread count read from the school's own membership (one colleague
        reading a thread reads it for the office, as with school DMs)."""
        return [g for g in self.get_user_groups(inbox_user_id)
                if g.get('created_by') == inbox_user_id]

    def get_group(self, user_id: str, group_id: str) -> Dict[str, Any]:
        """
        Get group details with member info

        Args:
            user_id: UUID of the requesting user
            group_id: UUID of the group

        Returns:
            Group record with members
        """
        try:
            if not self.is_group_member(user_id, group_id):
                raise ValueError("You are not a member of this group")

            supabase = self._get_client()

            # Get group info
            group = supabase.table('group_conversations').select('*').eq(
                'id', group_id
            ).single().execute()

            if not group.data:
                raise ValueError("Group not found")

            # Get members with user info
            # last_read_at is the group's read receipt: "Seen by 3" on a
            # message is the members whose marker is at or past it (9b46c748).
            members = supabase.table('group_members').select(
                'id, user_id, role, joined_at, added_by, last_read_at'
            ).eq('group_id', group_id).execute()

            member_list = []
            if members.data:
                for member in members.data:
                    user_info = self._get_user_info(member['user_id'])
                    member_list.append({
                        **member,
                        'user': user_info
                    })

            # Hydrate the pinned message (if any) for the pin banner.
            pinned = None
            if group.data.get('pinned_message_id'):
                pin_row = supabase.table('group_messages').select(
                    'id, sender_id, message_content, created_at, is_deleted'
                ).eq('id', group.data['pinned_message_id']).limit(1).execute()
                if pin_row.data and not pin_row.data[0].get('is_deleted'):
                    pinned = {
                        **pin_row.data[0],
                        'sender': self._get_user_info(pin_row.data[0]['sender_id']),
                    }

            # Private-bucket avatars: one batch for the whole member list plus
            # the pinned sender, not a signing round trip per member.
            from utils.storage_urls import sign_in_place
            sign_in_place(
                [m['user'] for m in member_list if isinstance(m.get('user'), dict)]
                + ([pinned['sender']] if isinstance((pinned or {}).get('sender'), dict) else []),
                ['avatar_url'],
            )

            # Same guardian context as the list. A parent reaching this thread
            # from a push notification sees only the class name in the header,
            # and the whole point of the report was that the class name alone
            # does not say which child: "I would have to look it up before I
            # can even respond."
            context = self._guardian_class_context(user_id, [group.data])

            return {
                **group.data,
                'members': member_list,
                'member_count': len(member_list),
                'pinned_message': pinned,
                **context.get(group_id, {}),
            }

        except Exception as e:
            logger.error(f"Error getting group: {str(e)}")
            raise

    def _guardian_class_context(
        self, user_id: str, groups: List[Dict[str, Any]]
    ) -> Dict[str, Dict[str, Any]]:
        """{group_id: {'for_students': [...], 'class_meeting': {...}}} for a
        guardian's class chats.

        A class chat is one group per class per audience, named after the class
        and nothing else. A parent of three sits in one "<Class> Parent Chat"
        for every class every child takes -- 37 of them in the iCreate family
        that reported this on 2026-09-09 -- in a single flat list, and several
        of those rows carry the SAME name because two children take the same
        course in different sections ("Elementary Microschool (Wednesday) Parent
        Chat" appeared three times, once per child). There was no way to tell
        from the list which child, or which section, a chat belonged to: "I do
        not know which message applies to which one of my children/which
        classes, so I would have to look it up before I can even respond."

        So stamp each class-sourced group with the caller's children in that
        class, and with when the class meets. The client groups the list by
        child and shows the meeting time, which is what separates two chats
        that share a name.

        Costs nothing for a caller with no children: children_in_classes short
        circuits and this returns {}. Best-effort throughout -- the messaging
        list must still render if any of it fails.
        """
        class_by_group = {
            g['id']: g['source_class_id']
            for g in groups if g.get('source_class_id')
        }
        if not class_by_group:
            return {}

        try:
            from utils.class_membership import children_in_classes
            children_by_class = children_in_classes(
                user_id, set(class_by_group.values())
            )
            if not children_by_class:
                return {}

            supabase = self._get_client()

            # Both reads go through their repositories rather than another
            # direct .table() call in this service (REPOSITORY_PATTERN.md; the
            # layer guard in tests/unit/test_direct_db_calls_do_not_grow.py).
            from repositories.user_repository import UserRepository
            from repositories.sis_class_repository import SisClassRepository

            child_ids = sorted({cid for s in children_by_class.values() for cid in s})
            children = UserRepository(client=supabase).find_by_ids(
                child_ids, select_fields='id, first_name, last_name, display_name')

            # When the class meets, so two same-named chats are tellable apart.
            # One meeting per class is enough for a list row; the client formats
            # it (dayName/formatTime in useClassSchedule) so both surfaces agree.
            class_ids = sorted({cid for cid in children_by_class})
            meeting_rows = SisClassRepository(client=supabase).meetings_for_classes(class_ids)
            meetings: Dict[str, Dict[str, Any]] = {}
            for m in sorted(
                meeting_rows,
                key=lambda r: (r.get('day_of_week') if r.get('day_of_week') is not None else 99,
                               r.get('start_time') or ''),
            ):
                meetings.setdefault(m['class_id'], m)

            out: Dict[str, Dict[str, Any]] = {}
            for group_id, class_id in class_by_group.items():
                kids = children_by_class.get(class_id)
                if not kids:
                    continue
                roster = [children[k] for k in sorted(kids) if k in children]
                roster.sort(key=lambda r: (r.get('first_name') or r.get('display_name') or ''))
                meeting = meetings.get(class_id)
                out[group_id] = {
                    'for_students': [{
                        'id': r['id'],
                        'first_name': r.get('first_name'),
                        'last_name': r.get('last_name'),
                        'display_name': r.get('display_name'),
                    } for r in roster],
                    # Narrowed deliberately: meetings_for_classes selects '*',
                    # and a list row has no use for the rest of the SIS meeting
                    # record (room ids, internal notes).
                    'class_meeting': {
                        'day_of_week': meeting.get('day_of_week'),
                        'start_time': meeting.get('start_time'),
                        'end_time': meeting.get('end_time'),
                    } if meeting else None,
                }
            return out

        except Exception as e:  # noqa: BLE001
            logger.warning(f"Could not attach guardian class context for {user_id}: {e}")
            return {}

    def get_unread_total(self, user_id: str) -> int:
        """Unread GROUP messages across every group this user belongs to.

        The Messages badge counted direct_messages and nothing else, so every
        class chat was invisible to it: a parent with a dozen unread class-chat
        messages and one unread DM saw "Messages (1)" in the sidebar and could
        not tell there was anything else waiting. Class chats are where a school
        family gets most of its mail, so the badge was wrong for exactly the
        people who rely on it most.

        Same counting rule as get_user_groups so the badge and the list agree:
        messages from other people, not deleted, newer than this member's
        last_read_at. Groups with nothing newer than that read marker skip the
        count query outright, which in a normal inbox is nearly all of them.

        Best-effort: a failure here returns 0 rather than 500ing the badge.
        """
        try:
            # Through the repository rather than another direct .table() call in
            # this service (REPOSITORY_PATTERN.md; the layer guard in
            # tests/unit/test_direct_db_calls_do_not_grow.py).
            from repositories.group_repository import GroupRepository
            repo = GroupRepository(client=self._get_client())

            memberships = repo.memberships_for_user(user_id)
            if not memberships:
                return 0

            last_read_by_group = {
                m['group_id']: m.get('last_read_at') for m in memberships
            }

            total = 0
            for group in repo.active_groups(list(last_read_by_group)):
                last_read_at = last_read_by_group.get(group['id'])
                last_message_at = group.get('last_message_at')
                if last_read_at and (not last_message_at or last_message_at <= last_read_at):
                    continue
                total += repo.count_unread_messages(
                    group['id'], user_id, since=last_read_at)

            return total

        except Exception as e:  # noqa: BLE001
            logger.warning(f"Could not count unread group messages for {user_id}: {e}")
            return 0

    def get_user_groups(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Get all groups for a user

        Args:
            user_id: UUID of the user

        Returns:
            List of group records
        """
        try:
            supabase = self._get_client()

            # Memberships carry last_read_at, so reading it here saves a
            # per-group lookup further down.
            memberships = supabase.table('group_members').select(
                'group_id, last_read_at'
            ).eq('user_id', user_id).execute()

            if not memberships.data:
                return []

            last_read_by_group = {
                m['group_id']: m.get('last_read_at') for m in memberships.data
            }
            group_ids = list(last_read_by_group)

            # Get group details
            groups = supabase.table('group_conversations').select('*').in_(
                'id', group_ids
            ).eq('is_active', True).order('last_message_at', desc=True).execute()

            rows = groups.data or []
            if not rows:
                return []

            # Member counts for every group at once. Paged, because this is one
            # row per person per group and a teacher's class chats add up past
            # the 1000-row response cap -- where the tail would silently read as
            # empty groups (see utils/db_fetch).
            from utils.db_fetch import fetch_all_rows
            active_ids = [g['id'] for g in rows]
            member_rows = fetch_all_rows(lambda: (
                supabase.table('group_members').select('id, group_id')
                .in_('group_id', active_ids)
            ))
            member_counts: Dict[str, int] = {}
            for m in member_rows:
                gid = m.get('group_id')
                if gid:
                    member_counts[gid] = member_counts.get(gid, 0) + 1

            child_context = self._guardian_class_context(user_id, rows)

            result = []
            for group in rows:
                last_read_at = last_read_by_group.get(group['id'])
                last_message_at = group.get('last_message_at')

                # A group whose newest message predates this member's last read
                # cannot have anything unread, so skip the count query outright.
                # In a normal inbox that is nearly all of them -- this used to
                # be an unconditional round trip per group.
                if last_read_at and (not last_message_at or last_message_at <= last_read_at):
                    unread_count = 0
                else:
                    unread = supabase.table('group_messages').select(
                        'id', count='exact'
                    ).eq('group_id', group['id']).neq(
                        'sender_id', user_id
                    ).eq('is_deleted', False)
                    if last_read_at:
                        unread = unread.gt('created_at', last_read_at)
                    unread_count = unread.execute().count or 0

                result.append({
                    **group,
                    'member_count': member_counts.get(group['id'], 0),
                    'unread_count': unread_count,
                    **child_context.get(group['id'], {}),
                })

            return result

        except Exception as e:
            logger.error(f"Error getting user groups: {str(e)}")
            raise

    def update_group(
        self,
        user_id: str,
        group_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Update group details (admin only)

        Args:
            user_id: UUID of the user
            group_id: UUID of the group
            name: New group name (optional)
            description: New description (optional)

        Returns:
            Updated group record
        """
        try:
            if not self.is_group_admin(user_id, group_id):
                raise ValueError("Only group admins can update the group")

            supabase = self._get_client()

            update_data = {'updated_at': datetime.utcnow().isoformat()}
            if name is not None:
                update_data['name'] = name
            if description is not None:
                update_data['description'] = description

            result = supabase.table('group_conversations').update(update_data).eq(
                'id', group_id
            ).execute()

            return result.data[0] if result.data else {}

        except Exception as e:
            logger.error(f"Error updating group: {str(e)}")
            raise

    def _is_superadmin(self, user_id: str) -> bool:
        """Check if the user is a platform superadmin."""
        try:
            supabase = self._get_client()
            user = supabase.table('users').select('role').eq('id', user_id).single().execute()
            return bool(user.data and user.data.get('role') == 'superadmin')
        except Exception as e:
            logger.error(f"Error checking superadmin status: {str(e)}")
            return False

    def delete_group(self, user_id: str, group_id: str) -> bool:
        """
        Delete a group (group admin or superadmin only).

        Soft-deletes by setting is_active=False so the group disappears from every
        member's list (get_user_groups filters on is_active) while preserving the
        message history. Memberships and messages are left intact.

        Args:
            user_id: UUID of the requesting user
            group_id: UUID of the group

        Returns:
            True if the group was deleted
        """
        try:
            if not (self.is_group_admin(user_id, group_id) or self._is_superadmin(user_id)):
                raise ValueError("Only group admins can delete the group")

            supabase = self._get_client()
            result = supabase.table('group_conversations').update({
                'is_active': False,
                'updated_at': datetime.utcnow().isoformat()
            }).eq('id', group_id).execute()

            return bool(result.data)

        except Exception as e:
            logger.error(f"Error deleting group: {str(e)}")
            raise

    # ==================== Member Management ====================

    def add_member(self, user_id: str, group_id: str, target_user_id: str) -> Dict[str, Any]:
        """
        Add a member to the group

        Args:
            user_id: UUID of the admin adding the member
            group_id: UUID of the group
            target_user_id: UUID of the user to add

        Returns:
            New membership record
        """
        try:
            if not self.can_add_member(user_id, group_id, target_user_id):
                raise ValueError("Cannot add this user to the group")

            # Check if already a member
            if self.is_group_member(target_user_id, group_id):
                raise ValueError("User is already a member of this group")

            supabase = self._get_client()

            membership = {
                'id': str(uuid.uuid4()),
                'group_id': group_id,
                'user_id': target_user_id,
                'role': 'member',
                'joined_at': datetime.utcnow().isoformat(),
                'added_by': user_id
            }

            result = supabase.table('group_members').insert(membership).execute()

            return result.data[0] if result.data else {}

        except Exception as e:
            logger.error(f"Error adding member: {str(e)}")
            raise

    def remove_member(self, user_id: str, group_id: str, target_user_id: str) -> bool:
        """
        Remove a member from the group

        Args:
            user_id: UUID of the admin removing the member
            group_id: UUID of the group
            target_user_id: UUID of the user to remove

        Returns:
            Success boolean
        """
        try:
            # User can remove themselves, or admin can remove others
            if user_id != target_user_id and not self.is_group_admin(user_id, group_id):
                raise ValueError("Only group admins can remove other members")

            supabase = self._get_client()

            # Check if target is the last admin
            if user_id == target_user_id:
                admins = supabase.table('group_members').select('id').eq(
                    'group_id', group_id
                ).eq('role', 'admin').execute()

                if len(admins.data or []) <= 1:
                    raise ValueError("Cannot leave group - you are the only admin")

            supabase.table('group_members').delete().eq(
                'group_id', group_id
            ).eq('user_id', target_user_id).execute()

            return True

        except ValueError:
            # The two rules above. The route answers 403 and logs them once.
            raise
        except Exception as e:
            logger.error(f"Error removing member: {str(e)}")
            raise

    def leave_group(self, user_id: str, group_id: str) -> bool:
        """
        Leave a group

        Args:
            user_id: UUID of the user leaving
            group_id: UUID of the group

        Returns:
            Success boolean
        """
        return self.remove_member(user_id, group_id, user_id)

    # ==================== Message Operations ====================

    def send_message(self, user_id: str, group_id: str, content: str,
                     reply_to_message_id: Optional[str] = None,
                     attachments: Optional[list] = None,
                     sent_from: Optional[str] = None,
                     on_behalf_of: Optional[str] = None,
                     push: bool = True) -> Dict[str, Any]:
        """
        Send a message to a group. Supports replying to a message and attachments.
        Announcement-only groups accept messages from group admins only.

        `on_behalf_of` is the school-inbox account, for a staff member writing
        in a group the school owns (create_school_group). Membership and admin
        rights are the school's; the message's sender stays the staff member,
        so everyone in the room sees who wrote it (ac84b6cd). Only the school
        inbox routes pass it, after school_inbox_service.school_group_access.

        Args:
            user_id: UUID of the sender
            group_id: UUID of the group
            content: Message content
            reply_to_message_id: Optional id of the message being replied to
            attachments: Optional [{url, type, name, size}] (pre-uploaded)
            sent_from: the surface the message came from; None means read it
                off the request (utils/client_platform.py), which is what
                every client-facing caller wants

        Returns:
            Created message record (enriched with sender + reply preview)
        """
        from middleware.error_handler import ValidationError
        from services import messaging_extras_service as extras
        from utils.client_platform import request_client_platform
        if sent_from is None:
            sent_from = request_client_platform()
        try:
            member_id = on_behalf_of or user_id
            if not self.is_group_member(member_id, group_id):
                raise ValueError("You are not a member of this group")

            supabase = self._get_client()

            grp = supabase.table('group_conversations').select('announcement_only, audience').eq(
                'id', group_id).single().execute()
            if grp.data and grp.data.get('announcement_only') and not self.is_group_admin(member_id, group_id):
                raise ValueError("Only teachers can post in this group")

            clean_atts = extras.clean_attachments(attachments)

            # A student's message is screened, text and images, the same way
            # a friend message is (peer_text_screen_service): held and never
            # stored when flagged, posted as 'pending' for the sweep when the
            # model could not run. The teacher in the group is not the
            # reason to skip it -- the other children read the chat before
            # the teacher does. An adult's message in a student room goes
            # through the adult rules (2026-09-15); adults' rooms are not
            # screened.
            verdict = None
            kind = self._screen_kind(user_id, (grp.data or {}).get('audience'))
            if kind:
                author_kind, author_role = kind
                from services import peer_text_screen_service as screen_svc
                verdict = screen_svc.screen(content or '', surface=screen_svc.SURFACE_GROUP,
                                            attachments=clean_atts, author_kind=author_kind)
                if verdict.flagged:
                    screen_svc.record_hold(
                        author_id=user_id, group_id=group_id,
                        surface=screen_svc.SURFACE_GROUP, text=content or '',
                        result=verdict, attachments=clean_atts,
                        author_kind=author_kind, author_role=author_role)
                    raise ValidationError(screen_svc.HELD_MESSAGE)
            if reply_to_message_id:
                target = supabase.table('group_messages').select('id, group_id').eq(
                    'id', reply_to_message_id).limit(1).execute()
                if not target.data or target.data[0]['group_id'] != group_id:
                    reply_to_message_id = None

            message = {
                'id': str(uuid.uuid4()),
                'group_id': group_id,
                'sender_id': user_id,
                'message_content': content,
                'reply_to_message_id': reply_to_message_id,
                'attachments': clean_atts,
                'sent_from': sent_from,
                'created_at': datetime.utcnow().isoformat(),
                'is_deleted': False
            }
            if verdict is not None:
                message['screen_status'] = verdict.status
                message['screened_at'] = None if verdict.failed else message['created_at']

            result = supabase.table('group_messages').insert(message).execute()

            # Update last_read_at for sender (the school, when writing for it)
            supabase.table('group_members').update({
                'last_read_at': datetime.utcnow().isoformat()
            }).eq('group_id', group_id).eq('user_id', member_id).execute()

            # Notify other group members
            # push=False: the members' bells still ring, their phones do not
            # (the console Compose's per-send toggle, bf8b754d).
            self._notify_group_members(user_id, group_id, content or 'Sent an attachment',
                                       **({} if push else {'push': False}))

            row = result.data[0] if result.data else {}
            enriched = extras.enrich_messages('group', [row], user_id)[0] if row else {}
            enriched['sender'] = self._get_user_info(user_id)
            from utils.storage_urls import sign_in_place
            sign_in_place([enriched['sender']], ['avatar_url'])
            # Instant delivery to members with the group open. The broadcast
            # reaches every member, so it carries only what a non-superadmin
            # may see; the sender's own response keeps it all.
            extras.broadcast_group(group_id, 'message',
                                   extras.broadcast_payload(enriched))
            return enriched

        except ValidationError:
            # A held message: expected, already recorded, the route answers 400.
            raise
        except Exception as e:
            logger.error(f"Error sending group message: {str(e)}")
            raise

    def _screen_kind(self, user_id: str, audience):
        """Whose rules screen this message, or None.

        ('student', role) for a student's words anywhere; ('adult', role) for
        an adult's words in a student room (audience 'student'), except the
        superadmin's; None for an adult in a family or staff room.
        """
        try:
            from repositories.peer_policy_repository import PeerPolicyRepository
            from utils.roles import get_effective_role
            row = PeerPolicyRepository().user_row(user_id, 'id, role, org_role')
            role = get_effective_role(row) if row else None
            if role == 'student' or role is None:
                return ('student', role)
            if audience == 'student' and role != 'superadmin':
                return ('adult', role)
            return None
        except Exception as e:  # noqa: BLE001
            # Unknown is treated as a student: screening an adult by mistake
            # costs a model call; skipping a child costs the promise.
            logger.warning(f"[send_message] screen-kind check failed (screening): {e}")
            return ('student', None)

    def get_messages(
        self,
        user_id: str,
        group_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Get one page of a group chat, oldest-to-newest within the page.

        `offset` counts back from the NEWEST message: offset 0 is the most
        recent `limit` messages.

        Args:
            user_id: UUID of the requesting user
            group_id: UUID of the group
            limit: Number of messages to return
            offset: Offset for pagination, from the newest message backwards

        Returns:
            List of message records
        """
        try:
            if not self.is_group_member(user_id, group_id):
                raise ValueError("You are not a member of this group")

            supabase = self._get_client()

            # Deleted messages stay in the stream as tombstones (content blanked
            # by enrich_messages) so reply previews keep working.
            #
            # Newest page first, flipped back to chronological below. Ordering
            # ascending and taking range(0, 49) returned the OLDEST 50, and no
            # client paginates — a class chat would have gone quiet on its 51st
            # message with no error anywhere. Same fix as the DM path in
            # direct_message_service.get_conversation_messages.
            messages = supabase.table('group_messages').select('*').eq(
                'group_id', group_id
            ).order(
                'created_at', desc=True
            ).range(offset, offset + limit - 1).execute()

            from services import messaging_extras_service as extras
            enriched = extras.enrich_messages(
                'group', list(reversed(messages.data or [])), user_id
            )

            # Enrich with sender info
            result = []
            for msg in enriched:
                sender_info = self._get_user_info(msg['sender_id'])
                result.append({
                    **msg,
                    'sender': sender_info
                })

            from utils.storage_urls import sign_in_place
            sign_in_place(
                [m['sender'] for m in result if isinstance(m.get('sender'), dict)],
                ['avatar_url'],
            )

            # Update last_read_at for user
            supabase.table('group_members').update({
                'last_read_at': datetime.utcnow().isoformat()
            }).eq('group_id', group_id).eq('user_id', user_id).execute()

            return result

        except Exception as e:
            logger.error(f"Error getting group messages: {str(e)}")
            raise

    def mark_as_read(self, user_id: str, group_id: str) -> bool:
        """
        Mark all messages in a group as read

        Args:
            user_id: UUID of the user
            group_id: UUID of the group

        Returns:
            Success boolean
        """
        try:
            if not self.is_group_member(user_id, group_id):
                raise ValueError("You are not a member of this group")

            supabase = self._get_client()

            supabase.table('group_members').update({
                'last_read_at': datetime.utcnow().isoformat()
            }).eq('group_id', group_id).eq('user_id', user_id).execute()

            # Keep the notification bell in sync with the thread, same as DMs do.
            # Without this, opening a class chat cleared the unread dot but left
            # one bell notification per message sitting there unread.
            try:
                NotificationService().mark_group_message_notifications_read(
                    user_id=user_id,
                    group_id=group_id,
                )
            except Exception as notif_err:
                logger.warning(f"Failed to clear group message notifications on read: {notif_err}")

            return True

        except Exception as e:
            logger.error(f"Error marking group as read: {str(e)}")
            return False

    # ==================== Helper Methods ====================

    def _get_user_info(self, user_id: str) -> Dict[str, Any]:
        """Get basic user info for display"""
        try:
            supabase = self._get_client()
            user = supabase.table('users').select(
                'id, display_name, first_name, last_name, avatar_url, role'
            ).eq('id', user_id).single().execute()

            return user.data if user.data else {'id': user_id, 'display_name': 'Unknown User'}
        except:
            return {'id': user_id, 'display_name': 'Unknown User'}

    def _notify_group_members(self, sender_id: str, group_id: str, content: str,
                              push: bool = True) -> None:
        """
        Send notifications to all group members except the sender.

        Args:
            sender_id: UUID of the message sender
            group_id: UUID of the group
            content: Message content (for preview)
        """
        try:
            supabase = self._get_client()

            # Get group info
            group = supabase.table('group_conversations').select(
                'name, organization_id, created_by'
            ).eq('id', group_id).single().execute()

            if not group.data:
                return

            group_name = group.data.get('name', 'Group')
            organization_id = group.data.get('organization_id')

            # A school-owned group (create_school_group): the inbox account is
            # a member nobody logs in as, so the front office is told instead,
            # pointing at the thread in the console's School tab (ac84b6cd).
            from services import school_inbox_service
            school_org = school_inbox_service.org_for_inbox_user(group.data.get('created_by'))
            school_inbox_id = school_org.get('inbox_user_id') if school_org else None

            # Get sender info
            sender = self._get_user_info(sender_id)
            sender_name = sender.get('display_name') or sender.get('first_name') or 'Someone'

            # Get all group members except sender
            members = supabase.table('group_members').select('user_id').eq(
                'group_id', group_id
            ).neq('user_id', sender_id).execute()

            member_ids = {m['user_id'] for m in (members.data or [])}

            # Create notification for each member
            notification_service = NotificationService()
            message_preview = content[:50] + '...' if len(content) > 50 else content

            if school_org:
                link = school_inbox_service.school_inbox_link(group_id=group_id)
                for admin_id in school_inbox_service.admin_recipient_ids(school_org['id']):
                    # A colleague who is also in the room hears about it as a
                    # member, below; the sender needs no bell for their own words.
                    if admin_id == sender_id or admin_id in member_ids:
                        continue
                    try:
                        notification_service.create_notification(
                            user_id=admin_id,
                            notification_type='message_received',
                            title=f"{school_org.get('name') or 'School'} inbox: {group_name}",
                            message=f'{sender_name}: {message_preview}',
                            link=link,
                            metadata={'group_id': group_id, 'sender_id': sender_id,
                                      'sender_name': sender_name, 'school_inbox': True,
                                      'organization_id': school_org['id']},
                            organization_id=organization_id,
                        )
                    except Exception as e:  # noqa: BLE001
                        logger.warning(f"Failed to notify office user {admin_id}: {str(e)}")

            for member in (members.data or []):
                if member['user_id'] == school_inbox_id:
                    continue
                try:
                    notification_service.create_notification(
                        user_id=member['user_id'],
                        notification_type='message_received',
                        title=f'New message in {group_name}',
                        message=f'{sender_name}: {message_preview}',
                        link=f'/communication?group={group_id}',
                        metadata={
                            'group_id': group_id,
                            'sender_id': sender_id,
                            'sender_name': sender_name
                        },
                        organization_id=organization_id,
                        **({} if push else {'push': False})
                    )
                except Exception as e:
                    logger.warning(f"Failed to notify user {member['user_id']}: {str(e)}")
                    continue

        except Exception as e:
            # Don't fail the message send if notifications fail
            logger.warning(f"Failed to send group message notifications: {str(e)}")

    def get_available_members(self, user_id: str, group_id: str) -> List[Dict[str, Any]]:
        """
        Get users that can be added to the group
        Respects organization isolation

        Args:
            user_id: UUID of the requesting user (must be admin)
            group_id: UUID of the group

        Returns:
            List of user records that can be added
        """
        try:
            if not self.is_group_admin(user_id, group_id):
                raise ValueError("Only group admins can view available members")

            supabase = self._get_client()

            # Get group org
            group = supabase.table('group_conversations').select('organization_id').eq(
                'id', group_id
            ).single().execute()

            if not group.data:
                raise ValueError("Group not found")

            org_id = group.data.get('organization_id')

            # Get current members
            current_members = supabase.table('group_members').select('user_id').eq(
                'group_id', group_id
            ).execute()

            current_member_ids = [m['user_id'] for m in (current_members.data or [])]

            # IDOR-H3 fix: a platform (null-org) group has no org boundary, so
            # returning every platform user leaked all-platform PII. Offer the
            # actor's OWN addable circle instead (explicit relationships +
            # co-members of their existing groups — the same set can_add_member
            # admits). Previously this returned [] outright, which left the
            # member picker empty and gutted platform-group management.
            if org_id is None:
                addable = self._addable_platform_user_ids(supabase, user_id)
                addable -= set(current_member_ids)
                if not addable:
                    return []
                ids = list(addable)[:200]
                rows = []
                for i in range(0, len(ids), 100):
                    rows.extend(supabase.table('users').select(
                        'id, display_name, first_name, last_name, avatar_url, role'
                    ).in_('id', ids[i:i + 100]).execute().data or [])
                from utils.storage_urls import sign_in_place
                sign_in_place(rows, ['avatar_url'])
                return rows

            # Get available users from same org
            query = supabase.table('users').select(
                'id, display_name, first_name, last_name, avatar_url, role'
            ).eq('organization_id', org_id)

            users = query.execute()

            # Filter out current members
            available = [
                u for u in (users.data or [])
                if u['id'] not in current_member_ids
            ]

            from utils.storage_urls import sign_in_place
            sign_in_place(available, ['avatar_url'])
            return available

        except Exception as e:
            logger.error(f"Error getting available members: {str(e)}")
            raise
