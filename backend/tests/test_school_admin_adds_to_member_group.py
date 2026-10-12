"""The school's admin can add people to any group thread in the school.

Ticket 6da3f51f (iCreate, org admin, 2026-10-12): "I am not sure who started
the Sub Pool group chat, but we need to be able to add people to that group. I
think you fixed the adding people to group threads if it is coming from
"iCreate" and that you can add people to those groups, but not if it was
created by an individual?"

She was right. 0b85c3f1 gave the office Add people on threads the SCHOOL
started. "Sub Pool" was started by a parent, who was its only group admin, so
can_add_member refused every one of the school's admins on it. The door is now
a group admin OR the school's own admin (is_org_admin in the group's org) or a
superadmin. Organization isolation for the person being added is unchanged.
"""

from unittest.mock import Mock, patch

from services.group_message_service import GroupMessageService

ORG = 'org-icreate'
OTHER_ORG = 'org-other'
GROUP = 'grp-sub-pool'
SCHOOL_ADMIN = 'admin-1'
TEACHER = 'teacher-1'
TARGET = 'new-sub'


class _Q:
    def __init__(self, data):
        self._data = data

    def __getattr__(self, _attr):
        return lambda *a, **k: self

    def execute(self):
        return Mock(data=self._data)


class _Db:
    def __init__(self, reads):
        self.reads = reads

    def table(self, name):
        return _Q(self.reads.get(name))


def _svc(group_org=ORG, target_org=ORG):
    svc = GroupMessageService()
    db = _Db({'group_conversations': {'organization_id': group_org},
              'users': {'organization_id': target_org}})
    svc._get_client = lambda: db
    return svc


USERS = {
    SCHOOL_ADMIN: {'id': SCHOOL_ADMIN, 'role': 'org_managed', 'org_role': 'org_admin',
                   'is_org_admin': True, 'organization_id': ORG},
    TEACHER: {'id': TEACHER, 'role': 'org_managed', 'org_role': 'advisor',
              'is_org_admin': False, 'organization_id': ORG},
    'super': {'id': 'super', 'role': 'superadmin', 'organization_id': None},
}


def _find(_self, user_id, *a, **k):
    return USERS.get(user_id)


@patch('repositories.user_repository.UserRepository.find_by_id', _find)
@patch.object(GroupMessageService, 'is_group_admin', return_value=False)
def test_the_school_admin_may_add_to_a_thread_a_parent_started(_admin):
    assert _svc().can_add_member(SCHOOL_ADMIN, GROUP, TARGET) is True


@patch('repositories.user_repository.UserRepository.find_by_id', _find)
@patch.object(GroupMessageService, 'is_group_admin', return_value=False)
def test_a_teacher_who_is_only_a_member_still_may_not(_admin):
    assert _svc().can_add_member(TEACHER, GROUP, TARGET) is False


@patch('repositories.user_repository.UserRepository.find_by_id', _find)
@patch.object(GroupMessageService, 'is_group_admin', return_value=False)
def test_another_schools_admin_may_not(_admin):
    assert _svc(group_org=OTHER_ORG, target_org=OTHER_ORG).can_add_member(
        SCHOOL_ADMIN, GROUP, TARGET) is False


@patch('repositories.user_repository.UserRepository.find_by_id', _find)
@patch.object(GroupMessageService, 'is_group_admin', return_value=False)
def test_the_school_admin_still_cannot_add_someone_from_another_school(_admin):
    assert _svc(target_org=OTHER_ORG).can_add_member(SCHOOL_ADMIN, GROUP, TARGET) is False


@patch('repositories.user_repository.UserRepository.find_by_id', _find)
@patch.object(GroupMessageService, 'is_group_admin', return_value=False)
def test_a_platform_group_has_no_school_admin(_admin):
    svc = _svc(group_org=None)
    assert svc.is_school_admin_of_group(SCHOOL_ADMIN, None) is False
    assert svc.is_school_admin_of_group('super', None) is False


@patch('repositories.user_repository.UserRepository.find_by_id', _find)
def test_superadmin_counts_as_the_school_admin():
    assert _svc().is_school_admin_of_group('super', ORG) is True


@patch('repositories.user_repository.UserRepository.find_by_id', _find)
@patch.object(GroupMessageService, 'is_group_admin', return_value=True)
def test_a_group_admin_still_may_add(_admin):
    assert _svc().can_add_member(TEACHER, GROUP, TARGET) is True


@patch('repositories.user_repository.UserRepository.find_by_id', _find)
@patch.object(GroupMessageService, 'is_group_admin', return_value=False)
def test_available_members_opens_to_the_school_admin_and_not_a_member(_admin):
    import pytest
    svc = _svc()
    with pytest.raises(ValueError):
        svc.get_available_members(TEACHER, GROUP)
    # The school admin gets past the door (what follows reads the roster).
    try:
        svc.get_available_members(SCHOOL_ADMIN, GROUP)
    except ValueError as e:
        assert 'Only group admins' not in str(e)
    except Exception:
        pass  # the fake db cannot answer the roster read; the door is what is tested


@patch('repositories.user_repository.UserRepository.find_by_id', _find)
@patch.object(GroupMessageService, 'is_group_member', return_value=True)
@patch.object(GroupMessageService, 'refuse_closed_student_chat', return_value=None)
@patch.object(GroupMessageService, '_guardian_class_context', return_value={})
@patch.object(GroupMessageService, '_muted_group_ids', return_value=set())
@patch.object(GroupMessageService, '_get_user_info', return_value={'id': 'x'})
def test_the_group_read_says_whether_the_caller_may_add(*_):
    def svc_with(members):
        svc = GroupMessageService()
        db = _Db({'group_conversations': {'id': GROUP, 'organization_id': ORG},
                  'group_members': members})
        svc._get_client = lambda: db
        return svc

    members = [{'user_id': 'parent-1', 'role': 'admin'},
               {'user_id': SCHOOL_ADMIN, 'role': 'member'},
               {'user_id': TEACHER, 'role': 'member'}]
    assert svc_with(members).get_group(SCHOOL_ADMIN, GROUP)['can_add_members'] is True
    assert svc_with(members).get_group(TEACHER, GROUP)['can_add_members'] is False
    assert svc_with(members).get_group('parent-1', GROUP)['can_add_members'] is True
