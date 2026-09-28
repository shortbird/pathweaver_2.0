"""A staff member's held message, and a group message's notification.

d1bb050c: a teacher whose class-chat message was held read only "That was
held by our safety check. Keep it kind and about the work." -- a sentence
written for children, with no reason on purpose -- and a message the sweep
hid later was never mentioned to her at all. An adult now reads the category
in plain words and is sent a notification; a child still reads the one
sentence and is told no reason.

61b762a5: "When I click on 'view details' for the message that Molly just
sent because otherwise, I only see the beginning message ... the message
itself isn't seen." The notification carried a 50-character preview and
nothing else; it carries the whole message in metadata.full_content now.
"""

from unittest.mock import Mock, patch

import pytest

from services import peer_text_screen_service as ts
from services.peer_text_screen_service import ScreenResult


# ---------------------------------------------------------------------------
# What the author reads at send time
# ---------------------------------------------------------------------------

@pytest.mark.parametrize('reasons,words', [
    (['shares a phone number'], 'contact details'),
    (['asks the student to keep a secret from parents'], 'keep something from their parents'),
    (['offers a gift in private'], 'gifts, money'),
    (['something the model made up'], 'matched one of the rules'),
])
def test_an_adult_reads_the_reason_category_in_plain_words(reasons, words):
    msg = ts.held_message_for(ScreenResult('flagged', reasons, 'm'), ts.AUTHOR_ADULT)
    assert msg.startswith('Held for review: ')
    assert words in msg
    assert msg.endswith('An admin will look at it.')
    # Never the model's own words.
    assert reasons[0] not in msg


def test_a_student_still_reads_the_one_sentence_and_no_reason():
    result = ScreenResult('flagged', ['shares a phone number'], 'regex')
    assert ts.held_message_for(result, ts.AUTHOR_STUDENT) == ts.HELD_MESSAGE
    assert 'phone' not in ts.held_message_for(result, ts.AUTHOR_STUDENT)


def _group_service(kind):
    from services.group_message_service import GroupMessageService
    gms = GroupMessageService()
    gms.is_group_member = Mock(return_value=True)  # type: ignore[method-assign]
    gms.is_group_admin = Mock(return_value=True)  # type: ignore[method-assign]
    gms._screen_kind = Mock(return_value=kind)  # type: ignore[method-assign]
    client = Mock()
    grp = client.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value
    grp.data = {'announcement_only': False, 'audience': 'student'}
    gms._get_client = Mock(return_value=client)  # type: ignore[method-assign]
    return gms, client


def test_a_held_adult_class_chat_message_answers_with_the_reason():
    from middleware.error_handler import ValidationError
    gms, client = _group_service(('adult', 'advisor'))
    with patch('utils.client_platform.request_client_platform', return_value='web'), \
         patch.object(ts, 'screen', return_value=ScreenResult('flagged', ['shares a phone number'], 'regex')), \
         patch.object(ts, 'record_hold') as hold:
        with pytest.raises(ValidationError) as err:
            gms.send_message('teacher', 'grp', 'call me 801-555-0199')
    assert 'Held for review' in str(err.value) and 'contact details' in str(err.value)
    assert 'Keep it kind' not in str(err.value)
    assert hold.call_args.kwargs['author_kind'] == 'adult'
    client.table.return_value.insert.assert_not_called()


def test_a_held_student_class_chat_message_still_gives_no_reason():
    from middleware.error_handler import ValidationError
    gms, client = _group_service(('student', 'student'))
    with patch('utils.client_platform.request_client_platform', return_value='web'), \
         patch.object(ts, 'screen', return_value=ScreenResult('flagged', ['shares a phone number'], 'regex')), \
         patch.object(ts, 'record_hold'):
        with pytest.raises(ValidationError) as err:
            gms.send_message('kid', 'grp', 'call me 801-555-0199')
    assert ts.HELD_MESSAGE in str(err.value)
    assert 'phone' not in str(err.value) and 'contact' not in str(err.value)
    client.table.return_value.insert.assert_not_called()


# ---------------------------------------------------------------------------
# The notification to the author
# ---------------------------------------------------------------------------

def _adult_hold_patches(repo, notify):
    people = Mock()
    people.user_row.side_effect = lambda uid, cols: {
        'teacher': {'id': 'teacher', 'display_name': 'Kirsten', 'organization_id': 'org1'},
    }.get(uid)
    users = Mock()
    users.find_by_role.return_value = [{'id': 'sa1'}]
    return [
        patch('repositories.peer_text_screen_repository.PeerTextScreenRepository', return_value=repo),
        patch('repositories.peer_policy_repository.PeerPolicyRepository', return_value=people),
        patch('repositories.user_repository.UserRepository', return_value=users),
        patch('services.sis_service.org_admin_ids', return_value=['admin1']),
        patch('services.notification_service.NotificationService', return_value=notify),
    ]


def _fresh_repo():
    repo = Mock()
    repo.matching_hold.return_value = None
    repo.record_hold.return_value = 'h1'
    return repo


@pytest.mark.parametrize('stage,said', [
    ('refused', 'was held for review and was not sent'),
    # The sweep's stage: posted while the model was down, hidden later.
    ('hidden_later', 'was hidden by our safety check after it posted'),
])
def test_an_adult_author_is_told_their_message_was_held_and_why(stage, said):
    notify = Mock()
    p = _adult_hold_patches(_fresh_repo(), notify)
    with p[0], p[1], p[2], p[3], p[4]:
        ts.record_hold(author_id='teacher', group_id='grp', surface=ts.SURFACE_GROUP,
                       text='text me at 801-555-0199', stage=stage,
                       result=ScreenResult('flagged', ['shares a phone number'], 'regex'),
                       author_kind=ts.AUTHOR_ADULT, author_role='advisor')
    mine = [c.kwargs for c in notify.create_notification.call_args_list
            if c.kwargs['user_id'] == 'teacher']
    assert len(mine) == 1
    kw = mine[0]
    assert kw['notification_type'] == 'peer_text_held'
    assert said in kw['message'] and 'contact details' in kw['message']
    assert kw['link'] == '/communication?group=grp'
    meta = kw['metadata']
    # The whole text comes back so it can be rewritten. No hold id: the
    # hold view is the admins' and the parents', not the author's.
    assert 'text me at 801-555-0199' in meta['full_content']
    assert 'hold_id' not in meta and meta['own_hold'] is True
    # The admins are still told, as before.
    assert {c.kwargs['user_id'] for c in notify.create_notification.call_args_list} == {
        'teacher', 'admin1', 'sa1'}


def test_a_student_author_is_never_told_why():
    notify = Mock()
    with patch('repositories.peer_text_screen_repository.PeerTextScreenRepository', return_value=_fresh_repo()), \
         patch('services.notification_service.NotificationService', return_value=notify), \
         patch('utils.class_membership.guardians_by_student', return_value={'kid': {'mum'}}), \
         patch.object(ts, '_first_name', return_value='Sam'), \
         patch.object(ts, '_tell_author') as author:
        ts.record_hold(author_id='kid', group_id='grp', surface=ts.SURFACE_GROUP,
                       text='call 801-555-0199', stage='hidden_later',
                       result=ScreenResult('flagged', ['shares a phone number'], 'regex'))
    author.assert_not_called()
    assert {c.kwargs['user_id'] for c in notify.create_notification.call_args_list} == {'mum'}


def test_the_sweep_tells_an_adult_author_and_not_a_student():
    """rescreen_pending -> the real record_hold: the teacher's hidden message
    reaches the teacher; the student's hidden message reaches the parent,
    and the student hears nothing."""
    repo = _fresh_repo()
    repo.pending_comments.return_value = []
    repo.pending_messages.return_value = []
    repo.pending_group_messages.return_value = [
        {'id': 'g1', 'sender_id': 'teacher', 'group_id': 'grp',
         'message_content': 'our secret, ok?', 'attachments': []},
        {'id': 'g2', 'sender_id': 'kid', 'group_id': 'grp',
         'message_content': 'you are dumb', 'attachments': []},
    ]
    verdicts = {'our secret, ok?': ScreenResult('flagged', ['asks for secrecy'], 'm'),
                'you are dumb': ScreenResult('flagged', ['insult'], 'm')}
    notify = Mock()
    p = _adult_hold_patches(repo, notify)
    with p[0], p[1], p[2], p[3], p[4], \
         patch('utils.class_membership.guardians_by_student', return_value={'kid': {'mum'}}), \
         patch.object(ts, '_first_name', return_value='Sam'), \
         patch.object(ts, '_author_roles', return_value={'teacher': 'advisor', 'kid': 'student'}), \
         patch.object(ts, 'screen', side_effect=lambda text, surface, **kw: verdicts[text]):
        ts.rescreen_pending(50)
    calls = [c.kwargs for c in notify.create_notification.call_args_list]
    mine = [c for c in calls if c['user_id'] == 'teacher']
    assert len(mine) == 1
    assert 'hidden by our safety check' in mine[0]['message']
    assert 'keep something from their parents' in mine[0]['message']
    assert not [c for c in calls if c['user_id'] == 'kid']
    assert [c for c in calls if c['user_id'] == 'mum']


def test_org_admins_get_the_hold_id_to_open_it_in_place():
    """The SIS console has no holds page and /admin/moderation is the
    superadmins'. The link is left as it was; the org admin's notification
    carries hold_id, and the notification modal opens the hold itself
    (HeldMessageDetail, GET /api/connections/holds/<id>) instead of
    following the link."""
    notify = Mock()
    p = _adult_hold_patches(_fresh_repo(), notify)
    with p[0], p[1], p[2], p[3], p[4]:
        ts.record_hold(author_id='teacher', group_id='grp', surface=ts.SURFACE_GROUP,
                       text='x', result=ScreenResult('flagged', ['secrecy'], 'm'),
                       author_kind=ts.AUTHOR_ADULT, author_role='advisor')
    admin = [c.kwargs for c in notify.create_notification.call_args_list if c.kwargs['user_id'] == 'admin1']
    assert len(admin) == 1
    assert admin[0]['metadata']['hold_id'] == 'h1'
    assert admin[0]['link'] == '/admin/moderation?tab=holds'


# ---------------------------------------------------------------------------
# 61b762a5: the group message's notification carries the whole message
# ---------------------------------------------------------------------------

def test_a_group_message_notification_carries_the_full_text():
    from services.group_message_service import GroupMessageService
    gms = GroupMessageService()
    client = Mock()
    group_q = client.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value
    group_q.data = {'name': 'Art class', 'organization_id': 'org1', 'created_by': 'molly'}
    members_q = client.table.return_value.select.return_value.eq.return_value.neq.return_value.execute.return_value
    members_q.data = [{'user_id': 'kirsten'}]
    gms._get_client = Mock(return_value=client)  # type: ignore[method-assign]
    gms._get_user_info = Mock(return_value={'id': 'molly', 'display_name': 'Molly'})  # type: ignore[method-assign]
    notify = Mock()
    long_text = ('Reminder for Friday: the field trip bus leaves at 8:15 sharp, please have '
                 'every student bring a sack lunch and a signed permission slip.')
    with patch('services.group_message_service.NotificationService', return_value=notify), \
         patch('services.school_inbox_service.org_for_inbox_user', return_value=None):
        gms._notify_group_members('molly', 'grp', long_text)
    kw = notify.create_notification.call_args.kwargs
    assert kw['user_id'] == 'kirsten'
    # The bell's line is still the preview; the detail view has it all.
    assert kw['message'].endswith('...')
    assert kw['metadata']['full_content'] == long_text
    assert kw['link'] == '/communication?group=grp'


def test_a_school_group_notification_to_the_office_carries_the_full_text():
    from services.group_message_service import GroupMessageService
    gms = GroupMessageService()
    client = Mock()
    group_q = client.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value
    group_q.data = {'name': 'Tuesday cover', 'organization_id': 'org1', 'created_by': 'inbox-1'}
    members_q = client.table.return_value.select.return_value.eq.return_value.neq.return_value.execute.return_value
    members_q.data = [{'user_id': 'inbox-1'}]
    gms._get_client = Mock(return_value=client)  # type: ignore[method-assign]
    gms._get_user_info = Mock(return_value={'id': 'u9', 'display_name': 'Ada'})  # type: ignore[method-assign]
    notify = Mock()
    text = 'x' * 120
    with patch('services.group_message_service.NotificationService', return_value=notify), \
         patch('services.school_inbox_service.org_for_inbox_user',
               return_value={'id': 'org1', 'name': 'iCreate', 'inbox_user_id': 'inbox-1'}), \
         patch('services.school_inbox_service.admin_recipient_ids', return_value=['office1']), \
         patch('services.school_inbox_service.school_inbox_link', return_value='/inbox?tab=school&group=grp'):
        gms._notify_group_members('u9', 'grp', text)
    calls = [c.kwargs for c in notify.create_notification.call_args_list]
    assert [c['user_id'] for c in calls] == ['office1']
    assert calls[0]['metadata']['full_content'] == text


# ---------------------------------------------------------------------------
# Direct messages: the same wording at send time
# ---------------------------------------------------------------------------

def _dm_service(kind):
    from services.direct_message_service import DirectMessageService
    dms = DirectMessageService()
    dms.can_message_user = Mock(return_value=True)  # type: ignore[method-assign]
    dms._screen_kind = Mock(return_value=kind)  # type: ignore[method-assign]
    dms.get_or_create_conversation = Mock(side_effect=RuntimeError('stop here'))  # type: ignore[method-assign]
    return dms


def test_a_held_adult_direct_message_answers_with_the_reason():
    from middleware.error_handler import ValidationError
    dms = _dm_service(('adult', 'advisor'))
    with patch('utils.client_platform.request_client_platform', return_value='web'), \
         patch.object(ts, 'screen', return_value=ScreenResult('flagged', ['shares a phone number'], 'regex')), \
         patch.object(ts, 'record_hold'):
        with pytest.raises(ValidationError) as err:
            dms.send_message('teacher', 'kid', 'call me 801-555-0199')
    assert str(err.value).startswith('Held for review: ')
    assert 'contact details' in str(err.value) and 'Keep it kind' not in str(err.value)
    dms.get_or_create_conversation.assert_not_called()


def test_a_held_student_direct_message_still_gives_no_reason():
    from middleware.error_handler import ValidationError
    dms = _dm_service(('student', 'student'))
    with patch('utils.client_platform.request_client_platform', return_value='web'), \
         patch.object(ts, 'screen', return_value=ScreenResult('flagged', ['shares a phone number'], 'regex')), \
         patch.object(ts, 'record_hold'):
        with pytest.raises(ValidationError) as err:
            dms.send_message('kid', 'pal', 'call me 801-555-0199')
    assert ts.HELD_MESSAGE in str(err.value)
    assert 'phone' not in str(err.value) and 'contact' not in str(err.value)


# ---------------------------------------------------------------------------
# Who may open a staff member's hold (GET /api/connections/holds/<id>)
# ---------------------------------------------------------------------------

def _staff_hold(recipient_id=None):
    return {'id': 'h1', 'author_id': 'teacher', 'recipient_id': recipient_id, 'group_id': 'grp',
            'surface': 'group_message', 'stage': 'refused', 'text': 'text me', 'reasons': ['r'],
            'model': 'm', 'attachments': [], 'author_role': 'advisor', 'created_at': 't'}


_USERS = {
    'teacher': {'id': 'teacher', 'role': 'org_managed', 'org_role': 'advisor',
                'org_roles': ['advisor'], 'organization_id': 'icreate', 'display_name': 'Kirsten'},
    # An org admin who is also a parent at the school, as Marika is.
    'marika': {'id': 'marika', 'role': 'org_managed', 'org_role': 'org_admin',
               'org_roles': ['org_admin', 'parent'], 'organization_id': 'icreate'},
    'other_admin': {'id': 'other_admin', 'role': 'org_managed', 'org_role': 'org_admin',
                    'org_roles': ['org_admin'], 'organization_id': 'elsewhere'},
    'colleague': {'id': 'colleague', 'role': 'org_managed', 'org_role': 'advisor',
                  'org_roles': ['advisor'], 'organization_id': 'icreate'},
    'sa': {'id': 'sa', 'role': 'superadmin', 'organization_id': None},
    'kid': {'id': 'kid', 'role': 'org_managed', 'org_role': 'student',
            'org_roles': ['student'], 'organization_id': 'elsewhere'},
}


def _open_hold(caller, hold):
    from services import peer_connection_service as svc
    repo = Mock()
    repo.hold.return_value = hold
    repo.group_names.return_value = {'grp': 'Art class'}
    people = Mock()
    people.users_by_ids.side_effect = lambda ids, cols: {i: _USERS[i] for i in ids if i in _USERS}
    with patch('repositories.peer_text_screen_repository.PeerTextScreenRepository', return_value=repo), \
         patch('repositories.peer_policy_repository.PeerPolicyRepository', return_value=people), \
         patch('services.messaging_extras_service.sign_attachments'), \
         patch('utils.storage_urls.sign_in_place'), \
         patch.object(svc.pa, 'is_parent_of', return_value=False), \
         patch.object(svc.policy_svc, 'setter_kind') as setter:
        try:
            return svc.hold_for_guardian(caller, 'h1')
        finally:
            # The Friends-policy rule is for a child's hold, not a teacher's.
            setter.assert_not_called()


def test_an_org_admin_of_the_teachers_school_opens_a_staff_hold():
    out = _open_hold('marika', _staff_hold())
    assert out['text'] == 'text me'
    assert out['group'] == {'id': 'grp', 'name': 'Art class'}


def test_a_superadmin_opens_a_staff_hold():
    assert _open_hold('sa', _staff_hold())['id'] == 'h1'


@pytest.mark.parametrize('caller', ['other_admin', 'colleague', 'nobody'])
def test_another_schools_admin_or_a_colleague_cannot_open_a_staff_hold(caller):
    from services import peer_connection_service as svc
    with pytest.raises(svc.PeerConnectionError, match='Not found'):
        _open_hold(caller, _staff_hold())


def test_the_students_school_admin_opens_a_staff_hold_on_a_message_to_that_student():
    """A DM hold names the student; _tell_staff notifies the student's
    school, so that school's admin can open it too."""
    out = _open_hold('other_admin', _staff_hold(recipient_id='kid'))
    assert out['peer']['id'] == 'kid'
