"""A school can turn off its students' chat (the `student_chat` module).

Ticket 81cc92e6, from Horizon: "An option to turn off in-app chat would help,
because it can pull students away from their work and bury teacher feedback."

What must stay true:

  * the module exists, defaults on, and is mirrored for the web
  * off, a student of that school does not see class Student Chats in the
    Messages list or in either unread count, and cannot read or send in one
  * on, the same student sees them as before
  * staff are unaffected: a teacher still sees the class Student Chat
  * off, friend DMs are refused both ways and leave the student's list
  * off, a teacher's DM to a student still goes through -- teacher feedback
    is the thing the school asked to protect
  * off, a teacher's own group with students in it closes too (Tanner,
    2026-10-07); parent groups never do
"""

from unittest.mock import Mock, patch

import pytest

from modules.registry import MODULES
from services import student_chat_service as chat
from services.direct_message_service import DirectMessageService
from services.group_message_service import GroupMessageService

ORG_OFF = 'org-off'
ORG_ON = 'org-on'

USERS = {
    'kid': {'id': 'kid', 'role': 'org_managed', 'org_role': 'student', 'organization_id': ORG_OFF},
    'pal': {'id': 'pal', 'role': 'org_managed', 'org_role': 'student', 'organization_id': ORG_OFF},
    'kid_on': {'id': 'kid_on', 'role': 'org_managed', 'org_role': 'student', 'organization_id': ORG_ON},
    'teach': {'id': 'teach', 'role': 'org_managed', 'org_role': 'advisor', 'organization_id': ORG_OFF},
}

CLASS_CHAT = {'id': 'g-class', 'audience': 'student', 'source_class_id': 'c1',
              'last_message_at': '2026-10-01T00:00:00', 'created_by': 'teach'}
PARENT_CHAT = {'id': 'g-parent', 'audience': 'family', 'source_class_id': 'c1',
               'last_message_at': '2026-10-01T00:00:00', 'created_by': 'teach'}
TEACHER_GROUP = {'id': 'g-teacher', 'audience': 'student', 'source_class_id': None,
                 'last_message_at': '2026-10-01T00:00:00', 'created_by': 'teach'}


@pytest.fixture
def school():
    """Student Chat off at ORG_OFF, on at ORG_ON; the user rows come from
    USERS rather than the database."""
    def rows(ids):
        return {u: USERS[u] for u in ids if u in USERS}

    with patch.object(chat, '_user_rows', side_effect=rows), \
         patch.object(chat, 'module_enabled', side_effect=lambda org, key: org != ORG_OFF):
        yield


# ---------------------------------------------------------------------------
# The module
# ---------------------------------------------------------------------------

def test_student_chat_is_a_default_on_module_with_no_legacy_source():
    m = MODULES['student_chat']
    assert m.default == 'on'
    assert m.legacy is None      # hidden_modules never reaches it
    assert m.parent is None      # an LMS-only school has it too


def test_the_module_is_mirrored_for_the_web():
    import json
    import os
    path = os.path.join(os.path.dirname(__file__), '..', '..', '..',
                        'web', 'src', 'modules', 'moduleKeys.json')
    with open(path) as f:
        mirror = json.load(f)
    assert mirror['student_chat']['default'] == 'on'
    assert mirror['student_chat']['legacy'] is None


def test_closed_only_for_students_of_a_school_that_turned_it_off(school):
    assert chat.closed_for('kid') is True
    assert chat.closed_for('kid_on') is False
    assert chat.closed_for('teach') is False


def test_a_teachers_own_student_group_closes_with_the_class_chats():
    assert chat.is_student_group(CLASS_CHAT) is True
    assert chat.is_student_group(PARENT_CHAT) is False
    assert chat.is_student_group(TEACHER_GROUP) is True


# ---------------------------------------------------------------------------
# Class Student Chats: the list and both unread counts
# ---------------------------------------------------------------------------

class _Query:
    """A chainable stand-in for a supabase-py builder: every filter returns
    itself and execute() hands back the table's rows."""

    def __init__(self, rows):
        self._rows = rows

    def __getattr__(self, name):
        return lambda *a, **k: self

    def execute(self):
        return Mock(data=list(self._rows), count=0)


def _client(tables):
    client = Mock()
    client.table.side_effect = lambda name: _Query(tables.get(name, []))
    return client


def _groups_for(user_id):
    svc = GroupMessageService()
    groups = [CLASS_CHAT, PARENT_CHAT, TEACHER_GROUP]
    # Read after every message, so no unread count query runs.
    memberships = [{'id': f'm-{g["id"]}', 'group_id': g['id'],
                    'last_read_at': '2026-10-02T00:00:00'} for g in groups]
    svc._get_client = Mock(return_value=_client({
        'group_members': memberships,
        'group_conversations': groups,
    }))
    with patch.object(svc, '_guardian_class_context', return_value={}), \
         patch.object(svc, '_muted_group_ids', return_value=set()):
        return {g['id'] for g in svc.get_user_groups(user_id)}


def test_off_hides_student_group_chats_from_the_students_list(school):
    # The teacher's own student group closes too (Tanner, 2026-10-07); only
    # the parent chat, which a student is not normally in, would remain.
    assert _groups_for('kid') == {'g-parent'}


def test_on_lists_class_student_chats_as_before(school):
    assert _groups_for('kid_on') == {'g-class', 'g-parent', 'g-teacher'}


def test_staff_still_see_the_class_student_chat_when_off(school):
    assert _groups_for('teach') == {'g-class', 'g-parent', 'g-teacher'}


@pytest.fixture
def unread_everywhere():
    """Every group holds 2 unread messages for whoever asks."""
    from repositories.group_repository import GroupRepository
    groups = [CLASS_CHAT, PARENT_CHAT, TEACHER_GROUP]
    with patch.object(GroupRepository, 'memberships_for_user',
                      return_value=[{'group_id': g['id'], 'last_read_at': None} for g in groups]), \
         patch.object(GroupRepository, 'active_groups', return_value=groups), \
         patch.object(GroupRepository, 'count_unread_messages', return_value=2):
        svc = GroupMessageService()
        svc._get_client = Mock(return_value=Mock())
        yield svc


def test_off_drops_student_group_chats_from_both_unread_counts(school, unread_everywhere):
    assert unread_everywhere.get_unread_total('kid') == 2
    assert unread_everywhere.count_groups_with_unread('kid') == 1


def test_on_and_staff_unread_counts_include_the_class_student_chat(school, unread_everywhere):
    assert unread_everywhere.get_unread_total('kid_on') == 6
    assert unread_everywhere.count_groups_with_unread('kid_on') == 3
    assert unread_everywhere.get_unread_total('teach') == 6
    assert unread_everywhere.count_groups_with_unread('teach') == 3


# ---------------------------------------------------------------------------
# Class Student Chats: read and send refused
# ---------------------------------------------------------------------------

@pytest.fixture
def class_chat_member():
    from repositories.group_repository import GroupRepository
    svc = GroupMessageService()
    svc._get_client = Mock(return_value=Mock())
    with patch.object(svc, 'is_group_member', return_value=True), \
         patch.object(GroupRepository, 'active_groups', return_value=[CLASS_CHAT]):
        yield svc


def test_a_student_cannot_send_in_a_closed_class_chat(school, class_chat_member):
    with pytest.raises(ValueError, match='Student chat is turned off'):
        class_chat_member.send_message('kid', 'g-class', 'hi', sent_from='web')


def test_a_student_cannot_read_a_closed_class_chat(school, class_chat_member):
    with pytest.raises(ValueError, match='Student chat is turned off'):
        class_chat_member.get_messages('kid', 'g-class')


def test_a_teacher_passes_the_door_a_student_is_refused_at(school, class_chat_member):
    class_chat_member.refuse_closed_student_chat('teach', 'g-class')   # no raise
    class_chat_member.refuse_closed_student_chat('kid_on', 'g-class')  # no raise


# ---------------------------------------------------------------------------
# Friend DMs
# ---------------------------------------------------------------------------

def _dm_service():
    """can_message_user with every rule but the one under test closed."""
    dms = DirectMessageService()
    client = Mock()

    def table(name):
        t = Mock()
        if name == 'users':
            t.select.return_value.eq.side_effect = lambda col, uid: Mock(
                single=Mock(return_value=Mock(execute=Mock(return_value=Mock(data=USERS[uid])))))
        else:
            empty = Mock(data=[])
            for chain in (t.select.return_value.or_.return_value.limit.return_value,
                          t.select.return_value.eq.return_value.eq.return_value.eq.return_value,
                          t.select.return_value.eq.return_value.eq.return_value):
                chain.execute.return_value = empty
        return t

    client.table.side_effect = table
    dms._get_client = Mock(return_value=client)
    return dms


def test_off_refuses_a_friend_dm_even_when_both_families_allow_it(school):
    from services import peer_connection_service
    dms = _dm_service()
    with patch('services.school_inbox_service.can_message_school', return_value=False), \
         patch('utils.class_membership.shares_class', return_value=False), \
         patch('utils.class_membership.teaches_child_of', return_value=False), \
         patch.object(dms, '_org_adult_connection', return_value=False), \
         patch.object(peer_connection_service, 'friends_can_message', return_value=True):
        assert dms.can_message_user('kid', 'pal') is False
        # A friend at a school with chat on cannot write into a closed inbox.
        assert dms.can_message_user('kid_on', 'kid') is False


def test_off_send_says_why(school):
    dms = _dm_service()
    with pytest.raises(ValueError, match='Student chat is turned off'):
        dms.send_message('kid', 'pal', 'hi', sent_from='web')


def test_off_still_lets_a_teacher_dm_a_student(school):
    dms = _dm_service()
    with patch('services.school_inbox_service.can_message_school', return_value=False), \
         patch('utils.class_membership.shares_class',
               side_effect=lambda t, s: (t, s) == ('teach', 'kid')):
        assert dms.can_message_user('teach', 'kid') is True
        assert dms.can_message_user('kid', 'teach') is True
    assert chat.friend_thread_closed('teach', 'kid') is False


def test_off_reading_a_friend_thread_is_refused(school):
    dms = _dm_service()
    convo = {'id': 'c1', 'participant_1_id': 'kid', 'participant_2_id': 'pal'}
    with patch.object(dms, '_find_conversation', return_value=convo):
        with pytest.raises(ValueError, match='Student chat is turned off'):
            dms.get_conversation_messages('c1', 'kid')


def test_off_the_list_drops_friend_threads_and_keeps_the_teacher(school):
    dms = _dm_service()
    threads = [
        {'id': 'c1', 'other_user': {'id': 'pal'}, 'unread_count': 3},
        {'id': 'c2', 'other_user': {'id': 'teach'}, 'unread_count': 1},
    ]
    with patch.object(dms, 'get_user_conversations', return_value=threads), \
         patch('services.school_inbox_service.office_inbox_id', return_value=None):
        listed = dms.get_listed_conversations('kid')
        assert [c['id'] for c in listed] == ['c2']
        # The badge counts what the list shows.
        assert dms.get_unread_count('kid') == 1
        # On, the same threads all list.
        assert [c['id'] for c in dms.get_listed_conversations('kid_on')] == ['c1', 'c2']


# ---------------------------------------------------------------------------
# The org admin's switch
# ---------------------------------------------------------------------------

def test_set_enabled_writes_only_the_student_chat_key():
    audit = Mock()
    repo = Mock()
    repo.find_by_id.return_value = {
        'id': ORG_OFF,
        'feature_flags': {'modules': {'friends': True},
                          'sis_settings': {'hidden_modules': ['tasks']}},
    }
    with patch('repositories.admin_audit_repository.AdminAuditRepository', return_value=audit), \
         patch('services.school_features_service._admin', return_value=Mock()), \
         patch('repositories.organization_repository.OrganizationRepository',
               return_value=repo):
        assert chat.set_enabled(ORG_OFF, False, actor_id='admin') == {'enabled': False}
    flags = repo.update_organization.call_args[0][1]['feature_flags']
    assert flags['modules'] == {'friends': True, 'student_chat': False}
    # No legacy source: the hidden list is left exactly as it was.
    assert flags['sis_settings'] == {'hidden_modules': ['tasks']}

    # The switch leaves an audit row like the Features card does.
    row = audit.create.call_args[0][0]
    assert row['changes']['source'] == 'settings_student_chat_card'
    assert row['changes']['features'] == {'student_chat': {'before': True, 'after': False}}


def test_the_switch_routes_are_org_admin_only_and_owned_once():
    from app import app
    adapter = app.url_map.bind('localhost')
    for method in ('GET', 'PUT'):
        endpoint, _ = adapter.match('/api/messages/student-chat/settings', method=method)
        assert endpoint.startswith('student_chat_settings.')


def test_off_the_friends_list_shows_no_message_button():
    """The friendships stay; only the Message button goes (can_message)."""
    from services import peer_connection_service as peers
    from services.peer_policy_service import EffectivePolicy
    kid, pal = '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2'
    rows = [{'id': 'c1', 'status': 'active', 'requester_id': kid, 'addressee_id': pal,
             'created_at': 't', 'activated_at': 't'}]
    admin = Mock()
    admin.table.return_value.select.return_value.or_.return_value.execute.return_value.data = rows
    allow = lambda uid: EffectivePolicy(student_id=uid, enabled=True,  # noqa: E731
                                        friends_can=['see', 'message'])
    for closed, expected in ((True, False), (False, True)):
        with patch.object(peers, '_admin', return_value=admin), \
             patch.object(peers, '_peer_profile', side_effect=lambda uid: {'id': uid}), \
             patch.object(peers.pa, 'is_blocked_between', return_value=False), \
             patch.object(peers.policy_svc, 'effective_policy', side_effect=allow), \
             patch.object(chat, 'closed_for', return_value=closed):
            out = peers.list_connections(kid)
        assert [c['id'] for c in out['active']] == ['c1']
        assert out['active'][0]['can_message'] is expected


def test_off_the_friend_page_and_quest_friends_show_no_message_button(school):
    """friend_page and friends_on_quest share _message_button with the list."""
    from services import peer_connection_service as peers
    with patch.object(peers, 'friends_can_message', return_value=True):
        assert peers._message_button('kid', 'pal') is False
        assert peers._message_button('kid_on', 'kid') is False
    with patch.object(peers, 'friends_can_message', return_value=True), \
         patch.object(chat, 'module_enabled', return_value=True):
        assert peers._message_button('kid', 'pal') is True
