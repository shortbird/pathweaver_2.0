"""Delete a quest the family made and never worked on (ticket bd1be541).

Karen Boyd, parent, Optio Academy: "I created a couple of quests that I ended
up not wanting to use... I can't see how to delete old quests." The quest page
had a "Delete Enrollment?" dialog that no button opened. DELETE
/api/quests/<id>/own-quest now removes the enrollment, and the quest row when
nobody else has it, but only for a private quest the student or a guardian
made, and only while it has no finished task and no evidence.
"""

import inspect
from unittest.mock import patch

import pytest
from flask import Flask

from tests.crm_fakes import FakeSupabase


KID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
PARENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
STRANGER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
QUEST = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
ORG = '99999999-9999-4999-8999-999999999999'


def _world(*, quest=None, completions=(), blocks=(), others=()):
    q = {'id': QUEST, 'title': 'Volcano model', 'created_by': KID,
         'is_public': False, 'organization_id': None, 'quest_type': 'optio',
         'lms_platform': None, 'metadata': {}}
    q.update(quest or {})
    enrollments = [{'id': 'uq-1', 'user_id': KID, 'quest_id': QUEST}]
    enrollments += [{'id': f'uq-{u}', 'user_id': u, 'quest_id': QUEST} for u in others]
    return FakeSupabase({
        'quests': [q],
        'user_quests': enrollments,
        'user_quest_tasks': [{'id': 't-1', 'user_quest_id': 'uq-1', 'quest_id': QUEST}],
        'quest_task_completions': [{'id': f'c-{i}', 'user_quest_task_id': t}
                                   for i, t in enumerate(completions)],
        'user_task_evidence_documents': [{'id': 'd-1', 'user_id': KID, 'quest_id': QUEST,
                                          'task_id': 't-1'}],
        'evidence_document_blocks': [{'id': f'b-{i}', 'document_id': d}
                                     for i, d in enumerate(blocks)],
        'course_quests': [], 'class_quests': [],
    })


def _delete(db, acting_as=KID):
    from routes import quest_lifecycle
    view = inspect.unwrap(quest_lifecycle.delete_own_quest_route)
    app = Flask(__name__)
    with app.test_request_context(f'/api/quests/{QUEST}/own-quest', method='DELETE'), \
            patch.object(quest_lifecycle, 'get_supabase_admin_client', return_value=db), \
            patch('utils.class_membership.guardians_by_student',
                  return_value={KID: {PARENT}}):
        response = view(acting_as, QUEST)
    body, status = response
    return body.get_json(), status


@pytest.mark.unit
class TestDeletingAnOwnQuest:
    def test_an_unused_quest_the_student_made_is_deleted(self):
        db = _world()
        payload, status = _delete(db)

        assert status == 200, payload
        assert payload['quest_deleted'] is True
        assert db.data['user_quests'] == []
        assert db.data['quests'] == []

    def test_a_quest_the_parent_made_for_the_child_is_deleted(self):
        """Guardian allowed: family_quests.create_family_quest stores the
        parent as created_by; POST /quests/create in family scope stores the
        parent in metadata.created_by_user_id."""
        for quest in ({'created_by': PARENT},
                      {'metadata': {'created_by_user_id': PARENT}}):
            db = _world(quest=quest)
            payload, status = _delete(db)
            assert status == 200, (quest, payload)
            assert db.data['quests'] == []

    def test_a_quest_another_learner_also_has_keeps_its_row(self):
        db = _world(others=[PARENT])
        payload, status = _delete(db)

        assert status == 200, payload
        assert payload['quest_deleted'] is False
        assert [e['user_id'] for e in db.data['user_quests']] == [PARENT]
        assert len(db.data['quests']) == 1

    def test_a_quest_with_a_finished_task_is_refused(self):
        db = _world(completions=['t-1'])
        payload, status = _delete(db)

        assert status == 409
        assert payload['reason'] == 'has_work'
        assert len(db.data['user_quests']) == 1
        assert len(db.data['quests']) == 1

    def test_a_quest_with_evidence_is_refused(self):
        db = _world(blocks=['d-1'])
        payload, status = _delete(db)

        assert status == 409
        assert payload['reason'] == 'has_work'
        assert len(db.data['quests']) == 1

    def test_an_empty_evidence_draft_is_not_work(self):
        db = _world()  # a document with no blocks
        payload, status = _delete(db)
        assert status == 200, payload

    @pytest.mark.parametrize('quest', [
        {'organization_id': ORG},          # a school quest
        {'is_public': True},               # a library quest
        {'quest_type': 'course'},          # a course project
        {'lms_platform': 'canvas'},        # a Canvas quest
        {'created_by': STRANGER},          # somebody else's quest
    ])
    def test_a_quest_the_family_did_not_make_is_refused(self, quest):
        db = _world(quest=quest)
        payload, status = _delete(db)

        assert status == 409
        assert payload['reason'] == 'not_family_made'
        assert len(db.data['user_quests']) == 1
        assert len(db.data['quests']) == 1

    def test_a_quest_on_a_course_is_refused(self):
        db = _world()
        db.data['course_quests'] = [{'id': 'cq-1', 'quest_id': QUEST}]
        payload, status = _delete(db)

        assert status == 409
        assert payload['reason'] == 'not_family_made'

    def test_another_user_cannot_delete_it(self):
        """A stranger has no enrollment on the family's quest, so there is
        nothing of theirs to delete, and the family's rows stay."""
        db = _world()
        payload, status = _delete(db, acting_as=STRANGER)

        assert status == 404
        assert len(db.data['user_quests']) == 1
        assert len(db.data['quests']) == 1


@pytest.mark.unit
def test_the_quest_page_asks_before_offering_the_button():
    from routes import quest_lifecycle
    view = inspect.unwrap(quest_lifecycle.own_quest_deletable)
    app = Flask(__name__)
    for db, expected in ((_world(), True), (_world(completions=['t-1']), False)):
        with app.test_request_context(f'/api/quests/{QUEST}/own-quest'), \
                patch.object(quest_lifecycle, 'get_supabase_admin_client', return_value=db), \
                patch('utils.class_membership.guardians_by_student',
                      return_value={KID: {PARENT}}):
            assert view(KID, QUEST).get_json()['can_delete'] is expected
