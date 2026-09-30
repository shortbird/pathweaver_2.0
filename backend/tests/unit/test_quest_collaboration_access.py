"""Collaborate opens a friend's own quest, and starts the friend on its tasks.

Apogee Odessa, 2026-09-29: a student built a project and wanted a partner on
it; "we can't get that partner to have access to the same project." A quest a
student builds is private to them, and Friends' Collaborate button sent only a
notification, so the partner followed it to "Quest not found".

What must stay true:

  * Collaborate records the invite (quest_collaboration_invites); the notification
    alone grants nothing
  * the invite counts only while the two are still friends (is_peer_of:
    active, no block) and the inviter is still on the quest
  * an invited student may open and start the personal quest; a student with
    no invite still may not, and a failed lookup grants nothing
  * starting it copies the inviter's approved tasks, subjects included, and
    skips the task wizard; a quest with a template keeps its template
"""

import inspect
from unittest.mock import MagicMock, Mock, patch

import pytest
from flask import Flask

from routes.quest import enrollment
from services import peer_connection_service as svc
from services import quest_visibility_service as visibility

CREATOR = '11111111-1111-4111-8111-111111111111'
PARTNER = '22222222-2222-4222-8222-222222222222'
STRANGER = '33333333-3333-4333-8333-333333333333'
QUEST = '99999999-9999-4999-8999-999999999999'

USERS = {
    uid: {'id': uid, 'role': 'org_managed', 'org_role': 'student', 'org_roles': ['student'],
          'organization_id': 'org-1'}
    for uid in (CREATOR, PARTNER, STRANGER)
}


def _personal():
    return {'id': QUEST, 'title': 'Robotics', 'organization_id': None,
            'created_by': CREATOR, 'is_public': False, 'is_active': True,
            'allow_custom_tasks': True}


class FakeQuestRepo:
    """The visibility rule's reads, for a quest only CREATOR is on."""

    def get_visibility_user(self, user_id):
        return USERS.get(user_id)

    def has_any_enrollment(self, user_id, quest_id):
        return user_id == CREATOR

    def is_quest_assigned(self, quest_id):
        return False

    def reachable_through_course(self, user_id, user_org_id, quest_id):
        return False

    def enrolled_user_ids(self, quest_id, limit=25):
        return [CREATOR]


def _peer_repo(inviters=(), on_quest=(), tasks=None):
    repo = Mock()
    repo.collaboration_inviters.return_value = list(inviters)
    repo.is_on_quest.side_effect = lambda uid, qid: uid in set(on_quest)
    repo.active_enrollment_id.return_value = 'creator-enrollment'
    repo.approved_tasks.return_value = tasks or []
    repo.quest_title.return_value = 'Robotics'
    return repo


def _with_peer_repo(repo, peers=()):
    """Patch the repository and the friendship check for one block."""
    peers = {frozenset(p) for p in peers}
    return (patch('repositories.peer_connection_repository.PeerConnectionRepository', return_value=repo),
            patch.object(svc.pa, 'is_peer_of', side_effect=lambda a, b: frozenset((a, b)) in peers))


# -- the invite is recorded ---------------------------------------------------

@pytest.mark.unit
def test_collaborate_records_the_invite():
    repo = _peer_repo(on_quest={CREATOR})
    repo_patch, peer_patch = _with_peer_repo(repo, peers={(CREATOR, PARTNER)})
    with repo_patch, peer_patch, \
            patch.object(svc, '_display_name', return_value='Amelia'), \
            patch.object(svc, '_notify'):
        svc.collaborate(CREATOR, PARTNER, QUEST)
    repo.record_collaboration.assert_called_once_with(QUEST, CREATOR, PARTNER)


@pytest.mark.unit
def test_a_refused_invite_records_nothing():
    repo = _peer_repo(on_quest=set())  # the inviter is not on the quest
    repo_patch, peer_patch = _with_peer_repo(repo, peers={(CREATOR, PARTNER)})
    with repo_patch, peer_patch, pytest.raises(svc.PeerConnectionError):
        svc.collaborate(CREATOR, PARTNER, QUEST)
    repo.record_collaboration.assert_not_called()


# -- when an invite still counts ----------------------------------------------

@pytest.mark.unit
@pytest.mark.parametrize('inviters, on_quest, peers, expected', [
    ([CREATOR], {CREATOR}, {(CREATOR, PARTNER)}, CREATOR),
    ([CREATOR], {CREATOR}, set(), None),                       # no longer friends, or blocked
    ([CREATOR], set(), {(CREATOR, PARTNER)}, None),            # inviter left the quest
    ([], {CREATOR}, {(CREATOR, PARTNER)}, None),               # never invited
    ([STRANGER, CREATOR], {CREATOR, STRANGER}, {(CREATOR, PARTNER)}, CREATOR),  # first one that still counts
], ids=['live', 'not-friends', 'inviter-off-quest', 'no-invite', 'skips-a-dead-invite'])
def test_collaboration_inviter(inviters, on_quest, peers, expected):
    repo = _peer_repo(inviters=inviters, on_quest=on_quest)
    repo_patch, peer_patch = _with_peer_repo(repo, peers=peers)
    with repo_patch, peer_patch:
        assert svc.collaboration_inviter(PARTNER, QUEST) == expected


# -- the visibility rule ------------------------------------------------------

@pytest.mark.unit
def test_an_invited_friend_may_open_and_start_the_quest():
    with patch('services.peer_connection_service.collaboration_inviter', return_value=CREATOR):
        assert visibility.may_open_quest(PARTNER, _personal(), repo=FakeQuestRepo())
        # Enrollment asks without the linked-students widening; the invite still counts.
        assert visibility.may_open_quest(PARTNER, _personal(), repo=FakeQuestRepo(),
                                         include_linked_students=False)


@pytest.mark.unit
def test_without_an_invite_the_quest_stays_private():
    with patch('services.peer_connection_service.collaboration_inviter', return_value=None), \
            patch('utils.auth.relationships.relationship_between', return_value=False):
        assert not visibility.may_open_quest(STRANGER, _personal(), repo=FakeQuestRepo())


@pytest.mark.unit
def test_a_failed_invite_lookup_grants_nothing():
    with patch('services.peer_connection_service.collaboration_inviter', side_effect=RuntimeError('db down')), \
            patch('utils.auth.relationships.relationship_between', return_value=False):
        assert not visibility.may_open_quest(PARTNER, _personal(), repo=FakeQuestRepo())


# -- the task copy --------------------------------------------------------------

TASKS = [
    {'title': 'Build the chassis', 'description': 'Frame and wheels', 'pillar': 'stem',
     'xp_value': 150, 'order_index': 0, 'is_required': False,
     'diploma_subjects': ['Science'], 'subject_xp_distribution': {'Science': 150}},
    {'title': 'Write the code', 'description': None, 'pillar': 'stem',
     'xp_value': 100, 'order_index': 1, 'is_required': True,
     'diploma_subjects': ['Computer Science'], 'subject_xp_distribution': {}},
]


@pytest.mark.unit
def test_collaboration_tasks_carry_the_inviters_list_and_subjects():
    repo = _peer_repo(inviters=[CREATOR], on_quest={CREATOR}, tasks=TASKS)
    repo_patch, peer_patch = _with_peer_repo(repo, peers={(CREATOR, PARTNER)})
    with repo_patch, peer_patch:
        rows = svc.collaboration_tasks(PARTNER, QUEST)
    repo.approved_tasks.assert_called_once_with('creator-enrollment')
    assert [r['title'] for r in rows] == ['Build the chassis', 'Write the code']
    assert rows[0]['diploma_subjects'] == ['Science']
    assert rows[1]['diploma_subjects'] == ['Computer Science']
    assert rows[1]['description'] == ''
    assert all(r['approval_status'] == 'approved' for r in rows)


@pytest.mark.unit
def test_no_invite_no_tasks():
    repo = _peer_repo(inviters=[], tasks=TASKS)
    repo_patch, peer_patch = _with_peer_repo(repo)
    with repo_patch, peer_patch:
        assert svc.collaboration_tasks(PARTNER, QUEST) == []
    repo.approved_tasks.assert_not_called()


# -- POST /api/quests/<id>/enroll ----------------------------------------------

class _Query:
    def __init__(self, rows, log=None, table=None):
        self._rows, self._log, self._table = rows, log, table

    def insert(self, rows):
        if self._log is not None:
            self._log.append((self._table, rows))
        return self

    def __getattr__(self, _name):
        return lambda *a, **k: self

    def execute(self):
        return MagicMock(data=self._rows, count=0)


def _enroll(caller, total_template_tasks=0, collab_rows=None):
    from utils.guardian_scope import StudentScope
    scope = StudentScope(caller_id=caller, student_id=caller, via='self')
    quest_repo = MagicMock()
    quest_repo.find_by_id.return_value = _personal()
    quest_repo.client.table.side_effect = lambda name: _Query([])
    quest_repo.enroll_user.return_value = {'id': 'partner-enrollment'}
    fake = FakeQuestRepo()
    for name in ('get_visibility_user', 'has_any_enrollment', 'is_quest_assigned',
                 'reachable_through_course', 'enrolled_user_ids'):
        setattr(quest_repo, name, getattr(fake, name))

    inserts = []
    admin = MagicMock()
    admin.table.side_effect = lambda name: _Query(USERS[caller], inserts, name)

    view = inspect.unwrap(enrollment.enroll_in_quest)
    app = Flask(__name__)
    inviter = CREATOR if collab_rows is not None else None
    with app.test_request_context(f'/api/quests/{QUEST}/enroll', method='POST', json={}), \
            patch.object(enrollment, 'current_student_scope', return_value=scope), \
            patch.object(enrollment, 'get_supabase_admin_client', return_value=admin), \
            patch.object(enrollment, 'QuestRepository', return_value=quest_repo), \
            patch('routes.quest_types.get_quest_task_summary',
                  return_value={'total_tasks': total_template_tasks}), \
            patch('routes.quest_types.get_template_tasks', return_value=[]), \
            patch('services.peer_connection_service.collaboration_inviter', return_value=inviter), \
            patch('services.peer_connection_service.collaboration_tasks',
                  return_value=collab_rows or []) as copy, \
            patch('utils.auth.relationships.relationship_between', return_value=False):
        response = view(caller, QUEST)
    body, status = (response if isinstance(response, tuple) else (response, 200))
    return body.get_json(), status, inserts, copy


@pytest.mark.unit
def test_an_invited_friend_starts_with_the_inviters_tasks():
    rows = svc_rows = [dict(t, is_manual=True, approval_status='approved') for t in TASKS]
    payload, status, inserts, _ = _enroll(PARTNER, collab_rows=svc_rows)
    assert status == 200, payload
    assert payload['skip_wizard'] is True
    assert payload['tasks_loaded'] == 2
    table, inserted = next(i for i in inserts if i[0] == 'user_quest_tasks')
    assert [r['title'] for r in inserted] == [r['title'] for r in rows]
    assert all(r['user_id'] == PARTNER and r['quest_id'] == QUEST
               and r['user_quest_id'] == 'partner-enrollment' for r in inserted)


@pytest.mark.unit
def test_a_student_with_no_invite_is_refused():
    payload, status, inserts, _ = _enroll(STRANGER)
    assert status == 404, payload
    assert not inserts


@pytest.mark.unit
def test_a_quest_with_a_template_keeps_its_template():
    payload, status, _, copy = _enroll(PARTNER, total_template_tasks=3, collab_rows=[])
    assert status == 200, payload
    copy.assert_not_called()
