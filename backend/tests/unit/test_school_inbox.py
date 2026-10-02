"""
Unit tests for the school inbox — the "{School Name}" messaging contact.

Locks in the rules that make the feature safe:
- The contact appears for org members (resolved via sis_service.member_org_id,
  so platform parents get it too) and never for outsiders.
- can_message_school allows member <-> inbox for the SAME org only, and denies
  when the org is inactive.
- Messages to the inbox notify the front office (org_admin + campus
  coordinator), not the account itself, and never the member who wrote in.
- sent_by attribution resolves staff names for the shared-inbox view.
"""

from unittest.mock import MagicMock, patch

import pytest

from services import school_inbox_service
from routes import direct_messages as dm_routes
from routes.direct_messages import _append_school_contact, _deliver_forward


@pytest.fixture(autouse=True)
def _no_inbox_list():
    """No school here has an inbox list (ticket 19047fd0), so the office is
    every org admin and coordinator, as it was before the list existed. The
    list itself is pinned in tests/test_school_inbox_members.py. Without this
    the list lookup would reach a real database."""
    with patch('services.school_inbox_service.inbox_member_ids', return_value=[]):
        yield


ORG = {'id': 'org-1', 'name': 'iCreate', 'slug': 'icreate',
       'is_active': True, 'inbox_user_id': 'inbox-1'}


# ── The member-facing contact ──

def test_school_contact_shape():
    contact = school_inbox_service.school_contact(ORG, 'inbox-1')
    assert contact['id'] == 'inbox-1'
    assert contact['display_name'] == 'iCreate'
    assert contact['relationship'] == 'school'
    assert contact['is_school'] is True


def test_append_school_contact_for_member():
    with patch.object(school_inbox_service, 'member_org', return_value=ORG), \
         patch.object(school_inbox_service, 'get_or_create_inbox_user', return_value='inbox-1'):
        contacts = [{'id': 'a', 'display_name': 'Alice'}]
        _append_school_contact(contacts, 'member-1')
    assert contacts[-1]['id'] == 'inbox-1'
    assert contacts[-1]['is_school'] is True
    assert contacts[-1]['display_name'] == 'iCreate'


def test_append_school_contact_skipped_for_non_member():
    with patch.object(school_inbox_service, 'member_org', return_value=None):
        contacts = []
        _append_school_contact(contacts, 'platform-user')
    assert contacts == []


def test_append_school_contact_never_raises():
    with patch.object(school_inbox_service, 'member_org', side_effect=RuntimeError('boom')):
        contacts = [{'id': 'a'}]
        _append_school_contact(contacts, 'member-1')
    assert contacts == [{'id': 'a'}]


def test_the_office_does_not_get_its_own_school_as_a_contact():
    """iCreate, 2026-09-25: an admin writing to "iCreate" from My messages was
    writing to the inbox they read on the School tab -- one thread, read from
    both ends, with the author's name on one side only."""
    with patch.object(school_inbox_service, 'member_org', return_value=ORG), \
         patch.object(school_inbox_service, 'get_or_create_inbox_user', return_value='inbox-1'), \
         patch('services.sis_service.caller_is_admin', return_value=True):
        contacts = [{'id': 'a'}, {'id': 'inbox-1', 'display_name': 'iCreate'}]
        _append_school_contact(contacts, 'office-1')
    assert contacts == [{'id': 'a'}]


def test_the_office_does_not_see_its_school_thread_in_my_messages(client, auth_headers, mock_verify_token):
    mock_verify_token.return_value = 'office-1'
    convos = [{'id': 'c1', 'other_user': {'id': 'inbox-1'}},
              {'id': 'c2', 'other_user': {'id': 'teacher-1'}}]
    with patch.object(dm_routes.message_service, 'get_user_conversations', return_value=convos), \
         patch.object(dm_routes, '_label_member_orgs'), \
         patch.object(school_inbox_service, 'office_inbox_id', return_value='inbox-1'):
        r = client.get('/api/messages/conversations', headers=auth_headers)
    assert r.status_code == 200
    assert [c['id'] for c in r.get_json()['data']['conversations']] == ['c2']


def _post_dm(client, auth_headers, route):
    school_msg = {'id': 'm1', 'conversation_id': 'c-school', 'sender_id': 'inbox-1'}
    with patch.object(school_inbox_service, 'office_family_route', return_value=route), \
         patch.object(school_inbox_service, 'send_as_school', return_value=school_msg) as school, \
         patch.object(dm_routes.message_service, 'send_message',
                      return_value={'id': 'm2', 'conversation_id': 'c-x'}) as personal:
        r = client.post('/api/messages/conversations/target-1/send', headers=auth_headers,
                        json={'content': 'hi', 'reply_to_message_id': 'm-0'})
    return r, school, personal


def test_an_office_members_message_to_a_parent_goes_out_as_the_school(client, auth_headers, mock_verify_token):
    mock_verify_token.return_value = 'marika'
    r, school, personal = _post_dm(client, auth_headers, {
        'direction': 'to_family', 'org': ORG, 'inbox_user_id': 'inbox-1'})
    assert r.status_code == 200
    assert r.get_json()['data']['conversation_id'] == 'c-school'
    assert school.call_args.args[:3] == (ORG, 'target-1', 'hi')
    assert school.call_args.kwargs['sent_by'] == 'test-user-123'
    personal.assert_not_called()


def test_a_parents_message_to_an_office_member_lands_in_the_school_inbox(client, auth_headers, mock_verify_token):
    mock_verify_token.return_value = 'mum'
    r, school, personal = _post_dm(client, auth_headers, {
        'direction': 'to_office', 'org': ORG, 'inbox_user_id': 'inbox-1'})
    assert r.status_code == 200
    school.assert_not_called()
    assert personal.call_args.args[:3] == ('test-user-123', 'inbox-1', 'hi')


def test_any_other_message_is_the_personal_one_it_looks_like(client, auth_headers, mock_verify_token):
    mock_verify_token.return_value = 'tam'
    r, school, personal = _post_dm(client, auth_headers, None)
    assert r.status_code == 200
    school.assert_not_called()
    assert personal.call_args.args[:3] == ('test-user-123', 'target-1', 'hi')
    assert personal.call_args.kwargs['reply_to_message_id'] == 'm-0'


def test_contacts_leave_out_the_people_reached_through_the_school():
    contacts = [{'id': 'tam'}, {'id': 'mum'}, {'id': 'inbox-1', 'is_school': True}]
    with patch.object(school_inbox_service, 'school_mail_contact_ids',
                      return_value={'mum'}) as rule:
        dm_routes._drop_school_mail_contacts(contacts, 'marika')
    assert [c['id'] for c in contacts] == ['tam', 'inbox-1']
    assert rule.call_args.args == ('marika', ['tam', 'mum'])


def test_office_inbox_id_is_only_the_offices():
    with patch.object(school_inbox_service, 'member_org', return_value=ORG), \
         patch('services.sis_service.caller_is_admin', side_effect=[True, False]):
        assert school_inbox_service.office_inbox_id('office-1') == 'inbox-1'
        assert school_inbox_service.office_inbox_id('teacher-1') is None


def _send_as_school_to(recipient_is_staff, *, office=None, **kwargs):
    dm = MagicMock()
    with patch.object(school_inbox_service, 'school_account', return_value=(ORG, 'inbox-1')), \
         patch.object(school_inbox_service, 'is_org_staff', return_value=recipient_is_staff) as staff, \
         patch.object(school_inbox_service, 'office_inbox_id', return_value=office), \
         patch('services.direct_message_service.DirectMessageService', return_value=dm):
        school_inbox_service.send_as_school(ORG, 'r-1', 'hi', sent_by='becky', **kwargs)
    return dm.send_message.call_args, staff


def test_somebody_on_staff_hears_from_the_person_not_the_school():
    """iCreate, 2026-09-30: Becky's "Announcements" notes to Marika (office,
    and a parent there) went out as the school. Marika's phone rang with "New
    message from iCreate", and the thread was hidden from her My messages.
    The same holds for a teacher who is a parent here (audit 2026-10-01): a
    new message to a colleague is the author's own."""
    for office in ('inbox-1', None):
        call, staff = _send_as_school_to(True, office=office, reply_to_message_id='m-9')
        assert call.args[:2] == ('becky', 'r-1')
        assert 'sent_by_user_id' not in call.kwargs
        assert 'reply_to_message_id' not in call.kwargs
        staff.assert_called_once_with('org-1', 'r-1')


def test_nobody_on_staff_writes_to_themselves_as_the_school():
    """An office member messaging their own household from the People page
    rang their own phone as the school and sat in a badge nothing could clear
    (audit 2026-10-01)."""
    import pytest
    dm = MagicMock()
    with patch.object(school_inbox_service, 'school_account', return_value=(ORG, 'inbox-1')), \
         patch.object(school_inbox_service, 'is_org_staff', return_value=True), \
         patch.object(school_inbox_service, 'office_inbox_id', return_value='inbox-1'), \
         patch('services.direct_message_service.DirectMessageService', return_value=dm):
        with pytest.raises(ValueError):
            school_inbox_service.send_as_school(ORG, 'becky', 'hi', sent_by='becky')
    dm.send_message.assert_not_called()


def test_a_reply_in_a_teachers_thread_stays_in_it_signed():
    """A teacher wrote to the office; the answer belongs in that thread, and
    says who gave it. "I would like it if you signed your name so it is easy
    for us to tell which CC or admin is sending the messages" (iCreate,
    2026-09-24)."""
    call, _ = _send_as_school_to(True, in_thread=True, reply_to_message_id='m-9')
    assert call.args[:2] == ('inbox-1', 'r-1')
    assert call.kwargs['show_sender_name'] is True
    assert call.kwargs['sent_by_user_id'] == 'becky'
    assert call.kwargs['reply_to_message_id'] == 'm-9'


def test_the_office_has_no_such_thread_so_it_is_always_personal():
    call, _ = _send_as_school_to(True, office='inbox-1', in_thread=True)
    assert call.args[:2] == ('becky', 'r-1')


def test_a_family_hears_from_the_school():
    for in_thread in (False, True):
        call, _ = _send_as_school_to(False, in_thread=in_thread)
        assert call.args[:2] == ('inbox-1', 'r-1')
        assert call.kwargs['sent_by_user_id'] == 'becky'
        assert 'show_sender_name' not in call.kwargs


# ── One thread between the office and a family ──

def _route(sender, target, *, office_of, uses_inbox=True, staff=(), member=True, family=False,
           current=True):
    with patch.object(school_inbox_service, 'office_inbox_id',
                      side_effect=lambda u: 'inbox-1' if u == office_of else None), \
         patch.object(school_inbox_service, 'member_org', return_value=ORG), \
         patch.object(school_inbox_service, 'org_uses_school_inbox', return_value=uses_inbox), \
         patch.object(school_inbox_service, 'admin_recipient_ids',
                      return_value=[office_of] if current and office_of else []), \
         patch('services.sis_service.member_org_id', return_value='org-1' if member else None), \
         patch.object(school_inbox_service, 'is_org_staff', side_effect=lambda o, u: u in staff), \
         patch.object(school_inbox_service, '_own_family', return_value=family):
        return school_inbox_service.office_family_route(sender, target)


def test_the_office_writes_to_a_family_as_the_school():
    """Owner decision, 2026-10-01: a parent held two threads with one person,
    "iCreate" and "Marika Connole", and an answer in the second was read by
    nobody else in the office."""
    route = _route('marika', 'mum', office_of='marika')
    assert route['direction'] == 'to_family' and route['inbox_user_id'] == 'inbox-1'


def test_a_family_writing_to_an_office_member_reaches_the_school_inbox():
    route = _route('mum', 'marika', office_of='marika')
    assert route['direction'] == 'to_office' and route['org'] == ORG


def test_colleagues_keep_their_own_thread():
    assert _route('marika', 'tam', office_of='marika', staff=('tam',)) is None


def test_a_teacher_keeps_their_own_threads_with_families():
    assert _route('tam', 'mum', office_of=None, staff=('tam',)) is None


def test_an_office_member_writing_to_their_own_child_is_a_parent():
    assert _route('marika', 'her-kid', office_of='marika', family=True) is None


def test_a_school_without_the_console_keeps_personal_threads():
    """Nobody there reads a school inbox, so an admin's own messages are how
    a family reaches a person (org_uses_school_inbox)."""
    assert _route('teresa', 'mum', office_of='teresa', uses_inbox=False) is None


def test_a_coordinator_who_left_the_staff_is_a_parent_again():
    """Katrine at iCreate: archived as staff, still holding the role columns,
    still a parent. Her thread with another parent is theirs."""
    assert _route('katrine', 'mum', office_of='katrine', current=False) is None
    assert _route('mum', 'katrine', office_of='katrine', current=False) is None


def test_somebody_outside_the_school_is_not_school_mail():
    assert _route('marika', 'stranger', office_of='marika', member=False) is None


def test_own_family_is_a_child_or_a_co_parent():
    kids = {'marika': {'kid'}, 'dad': {'kid'}, 'mum': {'other-kid'}}
    with patch('utils.class_membership.children_of_parent',
               side_effect=lambda u: kids.get(u, set())), \
         patch('utils.class_membership.guardians_by_student',
               side_effect=lambda ids: {i: {p for p, k in kids.items() if i in k} for i in ids}):
        assert school_inbox_service._own_family('marika', 'kid')
        assert school_inbox_service._own_family('kid', 'marika')
        assert school_inbox_service._own_family('marika', 'dad')
        assert not school_inbox_service._own_family('marika', 'mum')


def test_the_office_is_not_offered_families_by_name_nor_families_the_office():
    """The contact list's half of the rule: nobody is offered a thread their
    message would not land in."""
    with patch.object(school_inbox_service, '_office_of', return_value=ORG), \
         patch('services.message_compose_service.people_kinds',
               return_value={'tam': 'staff', 'mum': 'family', 'ada': 'student', 'kid': 'student'}), \
         patch.object(school_inbox_service, '_family_circle', return_value={'kid'}):
        hidden = school_inbox_service.school_mail_contact_ids(
            'marika', ['tam', 'mum', 'ada', 'kid', 'support'])
    assert hidden == {'mum', 'ada'}

    with patch.object(school_inbox_service, '_office_of', return_value=None), \
         patch.object(school_inbox_service, 'office_inbox_id', return_value=None), \
         patch.object(school_inbox_service, 'member_org', return_value=ORG), \
         patch.object(school_inbox_service, 'org_uses_school_inbox', return_value=True), \
         patch.object(school_inbox_service, 'is_org_staff', return_value=False), \
         patch.object(school_inbox_service, 'admin_recipient_ids', return_value=['marika', 'becky']), \
         patch.object(school_inbox_service, '_own_family', side_effect=lambda a, b: b == 'becky'):
        hidden = school_inbox_service.school_mail_contact_ids('mum', ['marika', 'becky', 'tam'])
    assert hidden == {'marika'}


def test_a_teacher_is_offered_everyone_as_before():
    with patch.object(school_inbox_service, '_office_of', return_value=None), \
         patch.object(school_inbox_service, 'office_inbox_id', return_value=None), \
         patch.object(school_inbox_service, 'member_org', return_value=ORG), \
         patch.object(school_inbox_service, 'org_uses_school_inbox', return_value=True), \
         patch.object(school_inbox_service, 'is_org_staff', return_value=True):
        assert school_inbox_service.school_mail_contact_ids('tam', ['marika', 'mum']) == set()


def test_a_failed_contact_rule_hides_nobody():
    with patch.object(school_inbox_service, '_office_of', side_effect=RuntimeError('db')):
        assert school_inbox_service.school_mail_contact_ids('mum', ['marika']) == set()


def test_is_org_staff_needs_this_org_and_a_staff_role():
    def rows(row):
        admin = MagicMock()
        (admin.table.return_value.select.return_value.eq.return_value
         .limit.return_value.execute.return_value) = MagicMock(data=[row])
        return patch.object(school_inbox_service, '_admin', return_value=admin)
    teacher = {'id': 't', 'role': 'org_managed', 'org_role': 'advisor', 'organization_id': 'org-1'}
    with rows(teacher):
        assert school_inbox_service.is_org_staff('org-1', 't') is True
        assert school_inbox_service.is_org_staff('org-2', 't') is False
    with rows({**teacher, 'org_role': 'parent'}):
        assert school_inbox_service.is_org_staff('org-1', 't') is False
    assert school_inbox_service.is_org_staff(None, 't') is False


# ── The permission rule ──

def _admin_with_org_rows(rows):
    admin = MagicMock()
    admin.table.return_value.select.return_value.in_.return_value.execute.return_value = MagicMock(data=rows)
    return admin


def test_can_message_school_member_of_same_org():
    with patch.object(school_inbox_service, '_admin', return_value=_admin_with_org_rows([ORG])), \
         patch('services.sis_service.member_org_id', return_value='org-1'):
        assert school_inbox_service.can_message_school('member-1', 'inbox-1') is True
        # Symmetric: the inbox (staff replying as the school) may DM the member.
        assert school_inbox_service.can_message_school('inbox-1', 'member-1') is True


def test_can_message_school_denies_other_org_member():
    with patch.object(school_inbox_service, '_admin', return_value=_admin_with_org_rows([ORG])), \
         patch('services.sis_service.member_org_id', return_value='org-OTHER'):
        assert school_inbox_service.can_message_school('outsider', 'inbox-1') is False


def test_can_message_school_denies_inactive_org():
    inactive = {**ORG, 'is_active': False}
    with patch.object(school_inbox_service, '_admin', return_value=_admin_with_org_rows([inactive])), \
         patch('services.sis_service.member_org_id', return_value='org-1'):
        assert school_inbox_service.can_message_school('member-1', 'inbox-1') is False


def test_can_message_school_false_for_two_normal_users():
    with patch.object(school_inbox_service, '_admin', return_value=_admin_with_org_rows([])):
        assert school_inbox_service.can_message_school('user-a', 'user-b') is False


# ── Notification fan-out to the front office ──

def test_member_message_notifies_admins_and_coordinators_not_sender():
    staff = [
        {'id': 'admin-1', 'roles': ['org_admin']},
        {'id': 'coord-1', 'roles': ['campus_coordinator', 'parent']},
        {'id': 'teacher-1', 'roles': ['advisor']},
        {'id': 'sender-admin', 'roles': ['org_admin']},
    ]
    notification_service = MagicMock()
    with patch('services.sis_service.list_org_staff', return_value=staff), \
         patch('services.notification_service.NotificationService', return_value=notification_service):
        school_inbox_service.notify_admins_of_member_message(
            ORG, 'sender-admin', 'Sam', 'hello')

    notified = [c.kwargs['user_id'] for c in notification_service.create_notification.call_args_list]
    assert set(notified) == {'admin-1', 'coord-1'}  # teacher excluded, sender excluded
    for c in notification_service.create_notification.call_args_list:
        # No thread id given: the School tab, not the bare page (11f6ad24).
        assert c.kwargs['link'] == '/inbox?tab=school'
        assert 'iCreate' in c.kwargs['title']


# ── Forward from Optio Support: org admins, by message and by email ──

STAFF = [
    {'id': 'admin-1', 'roles': ['org_admin'], 'email': 'admin@icreate.test',
     'first_name': 'Ada', 'name': 'Ada Admin', 'is_placeholder': False},
    {'id': 'coord-1', 'roles': ['campus_coordinator'], 'email': 'coord@icreate.test',
     'first_name': 'Coby', 'name': 'Coby Coord', 'is_placeholder': False},
    {'id': 'teacher-1', 'roles': ['advisor'], 'email': 'teach@icreate.test',
     'first_name': 'Tam', 'name': 'Tam Teach', 'is_placeholder': False},
    {'id': 'ghost-1', 'roles': ['org_admin'], 'email': 'ghost@placeholder.test',
     'first_name': 'Gus', 'name': 'Gus Ghost', 'is_placeholder': True},
    {'id': 'blank-1', 'roles': ['org_admin'], 'email': None,
     'first_name': 'Bo', 'name': 'Bo Blank', 'is_placeholder': False},
]

ADMINS = [s for s in STAFF if 'org_admin' in s['roles']]


def _email_service(send=True):
    svc = MagicMock()
    svc.send_forwarded_support_message_email.return_value = send
    return svc


def test_forward_targets_org_admins_only():
    # A forward is delivered as a DM FROM the member, and can_message_user only
    # opens that door for org_admin — a coordinator target would 403 the whole
    # forward. Teachers were never the front office.
    with patch('services.sis_service.list_org_staff', return_value=STAFF):
        assert [s['id'] for s in school_inbox_service.org_admin_recipients('org-1')] == [
            'admin-1', 'ghost-1', 'blank-1']


def test_school_that_runs_the_sis_console_keeps_the_shared_inbox():
    # iCreate answers families in the console inbox; a forward belongs there,
    # answered as the school, not in one admin's personal thread.
    sent = MagicMock(return_value={'id': 'm1', 'conversation_id': 'c1'})
    with patch.object(school_inbox_service, 'org_uses_school_inbox', return_value=True), \
         patch.object(school_inbox_service, 'get_or_create_inbox_user', return_value='inbox-1'), \
         patch('services.sis_service.list_org_staff', return_value=STAFF), \
         patch.object(dm_routes.message_service, 'send_message', sent):
        result, err = _deliver_forward(ORG, 'member-1', 'body', [], 'super-1')

    assert err is None
    assert result['via'] == 'school_inbox'
    assert sent.call_args.args[1] == 'inbox-1'
    assert result['reply_url'] == 'https://sis.optioeducation.com/inbox'
    # The whole front office reads that inbox, coordinators included.
    assert [r['id'] for r in result['recipients']] == [
        'admin-1', 'coord-1', 'ghost-1', 'blank-1']


def test_school_without_the_console_gets_admin_dms():
    # Hearthwood never opens the SIS console, so the message goes to the org
    # admins' own Messages, where the web app can open it.
    sent = MagicMock(side_effect=lambda *a, **k: {'id': 'm', 'conversation_id': 'c'})
    with patch.object(school_inbox_service, 'org_uses_school_inbox', return_value=False), \
         patch('services.sis_service.list_org_staff', return_value=STAFF), \
         patch.object(dm_routes.message_service, 'send_message', sent):
        result, err = _deliver_forward(ORG, 'member-1', 'body', [], 'super-1')

    assert err is None
    assert result['via'] == 'org_admins'
    # Org admins only: a member may DM their org admin, never a coordinator.
    assert [c.args[1] for c in sent.call_args_list] == ['admin-1', 'ghost-1', 'blank-1']
    assert result['reply_url'] == 'https://www.optioeducation.com/messages?user=member-1'


def test_one_failed_admin_thread_does_not_lose_the_others():
    def _send(sender, target, *a, **k):
        if target == 'admin-1':
            raise RuntimeError('blocked')
        return {'id': 'm', 'conversation_id': 'c'}

    with patch.object(school_inbox_service, 'org_uses_school_inbox', return_value=False), \
         patch('services.sis_service.list_org_staff', return_value=STAFF), \
         patch.object(dm_routes.message_service, 'send_message', side_effect=_send):
        result, err = _deliver_forward(ORG, 'member-1', 'body', [], 'super-1')

    assert err is None
    # Only the admins actually reached are emailed — no "check your messages"
    # mail pointing at a thread that never got the message.
    assert [r['id'] for r in result['recipients']] == ['ghost-1', 'blank-1']


def test_forward_refused_when_the_school_has_no_org_admin():
    from flask import Flask
    with Flask(__name__).app_context(), \
         patch.object(school_inbox_service, 'org_uses_school_inbox', return_value=False), \
         patch('services.sis_service.list_org_staff', return_value=[]):
        result, err = _deliver_forward(ORG, 'member-1', 'body', [], 'super-1')
        body, status = err
        payload = body.get_json()
    assert result is None
    # A refusal the superadmin can act on, not a silent no-op.
    assert status == 400
    assert 'no org admin' in payload['error']


def test_forward_reply_url_opens_the_thread_in_the_web_app():
    url = school_inbox_service.forward_reply_url('member-9')
    # The web app is the surface every admin has; ?user= opens that thread.
    assert url == 'https://www.optioeducation.com/messages?user=member-9'
    assert 'sis.' not in url


def test_forward_emails_reachable_admins():
    svc = _email_service()
    with patch('services.email_service.EmailService', return_value=svc):
        sent = school_inbox_service.email_admins_of_forwarded_message(
            ORG, ADMINS, 'Sam Student', 'My schedule is wrong',
            'https://www.optioeducation.com/messages?user=member-9')

    addressed = [c.kwargs['to_email']
                 for c in svc.send_forwarded_support_message_email.call_args_list]
    # Placeholder and empty addresses bounce.
    assert addressed == ['admin@icreate.test']
    assert sent == 1
    first = svc.send_forwarded_support_message_email.call_args_list[0].kwargs
    assert first['org_name'] == 'iCreate'
    assert first['member_name'] == 'Sam Student'
    assert first['message_text'] == 'My schedule is wrong'
    assert first['reply_url'].endswith('/messages?user=member-9')
    assert first['school_inbox'] is False


def test_forward_email_counts_only_successful_sends():
    svc = _email_service(send=False)
    with patch('services.email_service.EmailService', return_value=svc):
        assert school_inbox_service.email_admins_of_forwarded_message(
            ORG, ADMINS, 'Sam', 'hi', 'https://x/messages?user=m') == 0


def test_forward_email_failure_never_raises():
    svc = MagicMock()
    svc.send_forwarded_support_message_email.side_effect = RuntimeError('sendgrid down')
    with patch('services.email_service.EmailService', return_value=svc):
        # The message is already in the admin's inbox; a mail outage must not
        # undo it.
        assert school_inbox_service.email_admins_of_forwarded_message(
            ORG, ADMINS, 'Sam', 'hi', 'https://x/messages?user=m') == 0


def test_admin_recipient_ids_still_the_whole_front_office():
    # The shared-inbox bell keeps including campus coordinators; only the
    # forward narrows to org admins.
    with patch('services.sis_service.list_org_staff', return_value=STAFF):
        assert school_inbox_service.admin_recipient_ids('org-1') == [
            'admin-1', 'coord-1', 'ghost-1', 'blank-1']


# ── sent_by attribution ──

def test_attach_sent_by_names():
    admin = MagicMock()
    admin.table.return_value.select.return_value.in_.return_value.execute.return_value = MagicMock(
        data=[{'id': 'staff-1', 'display_name': 'Kate', 'first_name': 'Kate', 'last_name': ''}]
    )
    messages = [
        {'id': 'm1', 'sent_by_user_id': 'staff-1'},
        {'id': 'm2', 'sent_by_user_id': None},
    ]
    with patch.object(school_inbox_service, '_admin', return_value=admin):
        school_inbox_service.attach_sent_by_names(messages)
    assert messages[0]['sent_by_name'] == 'Kate'
    assert 'sent_by_name' not in messages[1]
