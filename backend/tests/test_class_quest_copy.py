"""
A teacher's own copy of a quest on their class.

iCreate, 2026-10-01. Marika (org_admin, ticket 167ba6df): "Teachers can't
attach videos or links any more. And can't edit the quests. I know we didn't
want master library quests edited, but we talked about allowing them to edit
it and save it as their own Teacher created ones?" Karin (teacher, ticket
60ffe195): "How can I copy a current quest, so I can repeat the assignment for
the next week/weeks?"

POST /api/sis/classes/<class_id>/quests/<quest_id>/duplicate did not exist (a
404 before this change); the only duplicate was the admin-only library route.
These pin the rules that make the copy safe:

  - the class's teacher (primary or assistant) or the office may copy; another
    teacher is refused with nothing written;
  - only a quest that is ON this class, and only the school's own or the
    public library -- never a student's private quest;
  - the copy is authored by the caller (so quest_edit_rules lets them edit it),
    and the original stays where it was;
  - the copy starts as a DRAFT for this class (owner, 2026-10-02): no student
    gets it until the teacher publishes it from the editor.

The first version put the copy on the class and enrolled its students at once.
The owner changed that on 2026-10-02: a copy is made to be changed, so it must
not reach a student before the teacher has changed it. The tests that pinned
"on the class at once" now pin the draft, and say so where they changed.
"""

import copy as _copy
import uuid as _uuid
from unittest.mock import Mock, patch

import pytest

import app as _real_app  # noqa: F401 — import graph ordering
from routes.sis import class_quest_students as cqs
from routes.sis import class_quests as cq
from services import class_quest_copy
from services.quest_edit_rules import can_edit_quest
from services.sis_quest_authoring import QuestAuthoringError, is_draft
from services.sis_quest_editor import draft_info
from tests.test_class_quest_audience import _Table

ORG = 'org-icreate'
CLASS = str(_uuid.uuid4())
QUEST = str(_uuid.uuid4())
OTHER_QUEST = str(_uuid.uuid4())
STUDENT_QUEST = str(_uuid.uuid4())
TEACHER = str(_uuid.uuid4())
ASSISTANT = str(_uuid.uuid4())
OTHER_TEACHER = str(_uuid.uuid4())
OFFICE = str(_uuid.uuid4())
S1 = str(_uuid.uuid4())
S2 = str(_uuid.uuid4())


class _UpsertTable(_Table):
    """The audience fake plus upsert, which the class attach step uses."""

    def upsert(self, payload, on_conflict=None):
        self.op, self.payload, self.conflict = 'upsert', payload, on_conflict
        return self

    def execute(self):
        if self.op != 'upsert':
            return super().execute()
        rows = self.db.setdefault(self.name, [])
        keys = [k.strip() for k in (self.conflict or '').split(',') if k.strip()]
        payload = self.payload if isinstance(self.payload, list) else [self.payload]
        out = []
        for p in payload:
            hit = next((r for r in rows if keys and all(r.get(k) == p.get(k) for k in keys)), None)
            if hit:
                hit.update(p)
                out.append(hit)
            else:
                r = {'id': f'{self.name}-{len(rows) + 1}', **p}
                rows.append(r)
                out.append(r)
        self.log.append(('upsert', self.name, out))
        return Mock(data=out)


def _client(db, log):
    c = Mock()
    c.table.side_effect = lambda name: _UpsertTable(db, name, log)
    return c


def _db():
    return {
        'org_classes': [{'id': CLASS, 'organization_id': ORG, 'name': 'Reading Workshop',
                         'primary_instructor_id': TEACHER,
                         'assistant_instructor_ids': [ASSISTANT], 'status': 'active'}],
        'class_advisors': [],
        'class_enrollments': [
            {'class_id': CLASS, 'student_id': S1, 'status': 'active'},
            {'class_id': CLASS, 'student_id': S2, 'status': 'active'},
        ],
        'quests': [
            # The office's quest: a teacher cannot edit it (P6, 2026-09-23).
            {'id': QUEST, 'title': 'Vocab Week 1', 'organization_id': ORG,
             'created_by': OFFICE, 'is_active': True, 'is_public': False,
             'description': 'Ten words', 'xp_threshold': 100},
            {'id': OTHER_QUEST, 'title': 'Not on this class', 'organization_id': ORG,
             'created_by': OFFICE, 'is_active': True, 'is_public': False},
            # A student's own quest made for the class: no school, not public.
            {'id': STUDENT_QUEST, 'title': 'My comic', 'organization_id': None,
             'created_by': S1, 'is_active': True, 'is_public': False},
        ],
        'quest_template_tasks': [
            {'id': 'tt-1', 'quest_id': QUEST, 'title': 'Define the words', 'pillar': 'communication',
             'xp_value': 50, 'order_index': 0, 'is_required': True,
             'diploma_subjects': ['language_arts'], 'subject_xp_distribution': {'language_arts': 50}},
        ],
        'class_quests': [
            {'id': 'cq-1', 'class_id': CLASS, 'quest_id': QUEST, 'sequence_order': 0,
             'publish_at': None, 'due_date': '2026-10-09T23:59:59Z', 'student_ids': [S1]},
            {'id': 'cq-2', 'class_id': CLASS, 'quest_id': STUDENT_QUEST, 'sequence_order': 1,
             'publish_at': None, 'due_date': None, 'student_ids': [S1]},
        ],
        'sis_curriculum_classes': [],
        'user_quests': [],
        'user_quest_tasks': [],
    }


def _call(caller, quest_id=QUEST, body=None, db=None, is_admin=False):
    db = db if db is not None else _db()
    log = []
    admin = _client(db, log)
    view = cqs.copy_class_quest
    while hasattr(view, '__wrapped__'):
        view = view.__wrapped__
    from flask import Flask
    flask_app = Flask(__name__)
    with flask_app.test_request_context('/dup', method='POST', json=body or {}), \
         patch.object(cq, 'get_supabase_admin_client', return_value=admin), \
         patch.object(cq.sis_service, 'caller_is_admin', return_value=is_admin), \
         patch.object(cq.sis_service, 'resolve_org_id', return_value=ORG), \
         patch('services.quest_resource_service.copy_for_quest', return_value=0), \
         patch('routes.quest_types.get_template_tasks', return_value=[]), \
         patch('utils.template_tasks.get_valid_source_template_ids', return_value=set()), \
         patch('utils.class_membership.guardians_by_student', return_value={}):
        resp = view(caller, CLASS, quest_id)
    body, status = (resp if isinstance(resp, tuple) else (resp, 200))
    return body.get_json(), status, db, log


def _publish(caller, quest_id, db, body, is_admin=False):
    """POST .../quests/<quest_id>/publish, the editor's "Publish to class".
    The fake store's ids are not uuids, so the id check is waved through."""
    admin = _client(db, [])
    view = cq.publish_class_quest
    while hasattr(view, '__wrapped__'):
        view = view.__wrapped__
    from flask import Flask
    with Flask(__name__).test_request_context('/publish', method='POST', json=body), \
         patch.object(cq, 'get_supabase_admin_client', return_value=admin), \
         patch.object(cq, '_bad_uuid', return_value=False), \
         patch.object(cq.sis_service, 'caller_is_admin', return_value=is_admin), \
         patch.object(cq.sis_service, 'resolve_org_id', return_value=ORG), \
         patch('services.quest_edit_rules.sis_service.caller_is_admin', return_value=is_admin), \
         patch('services.quest_edit_rules.sis_service.resolve_org_id', return_value=ORG), \
         patch('services.sis_quest_authoring.fallback_header', return_value=(None, None)), \
         patch('routes.quest_types.get_template_tasks', return_value=[]), \
         patch('utils.template_tasks.get_valid_source_template_ids', return_value=set()), \
         patch('utils.class_membership.guardians_by_student', return_value={}):
        resp = view(caller, CLASS, quest_id)
    out, status = (resp if isinstance(resp, tuple) else (resp, 200))
    return out.get_json(), status


def _writes(log):
    return [e for e in log if e[0] in ('insert', 'update', 'delete', 'upsert')]


@pytest.mark.unit
class TestWhoMayCopy:

    def test_the_class_teacher_gets_a_draft_copy_they_wrote_for_the_class(self):
        """Karin (60ffe195): copy a current quest to repeat it next week.

        Changed 2026-10-02 (owner): this pinned the copy ON the class with its
        student enrolled at once. The copy now starts as the editor's class
        draft and reaches nobody until it is published.
        """
        out, status, db, _ = _call(TEACHER)
        assert status == 201, out
        new_id = out['quest_id']
        assert new_id != QUEST
        new = next(q for q in db['quests'] if q['id'] == new_id)
        assert new['created_by'] == TEACHER
        assert new['organization_id'] == ORG
        assert new['title'] == 'Vocab Week 1 (copy)'
        assert new['xp_threshold'] == 100
        # The tasks came with it, credit and all.
        copied = [t for t in db['quest_template_tasks'] if t['quest_id'] == new_id]
        assert [t['title'] for t in copied] == ['Define the words']
        assert copied[0]['diploma_subjects'] == ['language_arts']
        # A draft: inactive, marked for this class, so it lists in the class's
        # Drafts and goes through "Publish to class".
        assert new['is_active'] is False
        assert is_draft(new)
        marker = new['metadata']['draft']
        assert marker['context'] == 'class' and marker['target_id'] == CLASS
        assert marker['started_by'] == TEACHER and marker['copied_from'] == QUEST
        # Same audience as the original on this class, none of its dates --
        # kept for the publish form, not applied yet.
        assert marker['class_settings'] == {'student_ids': [S1]}
        # Not on the class and in nobody's account; the original is untouched.
        links = {r['quest_id']: r for r in db['class_quests'] if r['class_id'] == CLASS}
        assert QUEST in links and new_id not in links
        assert links[QUEST]['due_date'] == '2026-10-09T23:59:59Z'
        assert db['user_quests'] == []
        # Every response field, including the nullable ones.
        assert out['source_quest_id'] == QUEST
        assert out['is_draft'] is True
        assert 'students_enrolled' not in out
        assert out['task_count'] == 1
        assert out['resource_count'] == 0
        assert out['publish_at'] is None
        assert out['due_date'] is None
        assert out['student_ids'] == [S1]
        assert out['title'] == 'Vocab Week 1 (copy)'

    def test_publishing_the_draft_puts_it_on_the_class_for_the_same_students(self):
        """The way out of the draft is the editor's "Publish to class", the
        same route a class draft started with "Create new" uses."""
        out, _, db, _ = _call(TEACHER)
        new_id = out['quest_id']
        body, status = _publish(TEACHER, new_id, db, {'student_ids': [S1]})
        assert status == 200, body
        new = next(q for q in db['quests'] if q['id'] == new_id)
        assert new['is_active'] is True
        assert not is_draft(new)
        link = next(r for r in db['class_quests'] if r['quest_id'] == new_id)
        assert link['class_id'] == CLASS and link['student_ids'] == [S1]
        assert [r['user_id'] for r in db['user_quests'] if r['quest_id'] == new_id] == [S1]
        assert body['students_enrolled'] == 1

    def test_the_editor_payload_hands_the_publish_form_its_audience(self):
        out, _, db, _ = _call(TEACHER)
        new = next(q for q in db['quests'] if q['id'] == out['quest_id'])
        assert draft_info(new) == {'context': 'class', 'target_id': CLASS,
                                   'class_settings': {'student_ids': [S1]}}

    def test_the_copy_is_editable_by_the_teacher_who_made_it(self):
        """Marika (167ba6df): "save it as their own Teacher created ones"."""
        out, _, db, _ = _call(TEACHER)
        new = next(q for q in db['quests'] if q['id'] == out['quest_id'])
        original = next(q for q in db['quests'] if q['id'] == QUEST)
        with patch('services.quest_edit_rules.sis_service.caller_is_admin', return_value=False), \
             patch('services.quest_edit_rules.sis_service.resolve_org_id', return_value=ORG):
            assert can_edit_quest(TEACHER, new) is True
            assert can_edit_quest(TEACHER, original) is False

    def test_an_assistant_may_copy(self):
        out, status, _, _ = _call(ASSISTANT)
        assert status == 201, out

    def test_the_office_may_copy(self):
        out, status, _, _ = _call(OFFICE, is_admin=True)
        assert status == 201, out

    def test_the_request_may_set_the_new_dates(self):
        """Changed 2026-10-02 (owner): the dates used to land on a class link
        at once; the draft now keeps them for the publish form."""
        out, status, db, _ = _call(TEACHER, body={'due_date': '2026-10-16T23:59:59Z'})
        assert status == 201, out
        new = next(q for q in db['quests'] if q['id'] == out['quest_id'])
        assert new['metadata']['draft']['class_settings']['due_date'] == '2026-10-16T23:59:59Z'
        assert out['due_date'] == '2026-10-16T23:59:59Z'
        assert not any(r['quest_id'] == out['quest_id'] for r in db['class_quests'])

    def test_another_teacher_is_refused_and_nothing_is_written(self):
        before = _copy.deepcopy(_db())
        out, status, db, log = _call(OTHER_TEACHER)
        assert status == 403
        assert out['success'] is False
        assert _writes(log) == []
        assert db == before


@pytest.mark.unit
class TestWhatMayBeCopied:

    def test_a_quest_not_on_the_class_is_404_and_nothing_is_written(self):
        out, status, db, log = _call(TEACHER, quest_id=OTHER_QUEST)
        assert status == 404
        assert out['error'] == 'That quest is not on this class.'
        assert _writes(log) == []
        assert len(db['quests']) == 3

    def test_a_students_own_quest_is_never_copied(self):
        out, status, db, log = _call(TEACHER, quest_id=STUDENT_QUEST)
        assert status == 403
        assert _writes(log) == []
        assert len(db['quests']) == 3

    def test_a_bad_date_is_refused_before_anything_is_written(self):
        out, status, _, log = _call(TEACHER, body={'due_date': 'next tuesday'})
        assert status == 400
        assert _writes(log) == []


@pytest.mark.unit
class TestTheServiceDirectly:

    def test_copyable_both_ways(self):
        assert class_quest_copy.copyable({'organization_id': ORG}, ORG)
        assert class_quest_copy.copyable({'organization_id': None, 'is_public': True}, ORG)
        assert not class_quest_copy.copyable({'organization_id': None, 'is_public': False}, ORG)
        assert not class_quest_copy.copyable({'organization_id': 'another-school'}, ORG)
        assert not class_quest_copy.copyable(None, ORG)

    def test_refused_before_anything_is_written(self):
        db, log = _db(), []
        with pytest.raises(QuestAuthoringError) as e:
            class_quest_copy.copy_class_quest(
                _client(db, log), class_row=db['org_classes'][0], quest_id=OTHER_QUEST,
                user_id=TEACHER)
        assert e.value.status == 404
        assert _writes(log) == []

    def test_the_draft_keeps_the_original_audience_and_enrolls_nobody(self):
        """Changed 2026-10-02 (owner): this pinned the attach step being called
        with the original's audience. Nothing is attached now; the audience
        waits on the draft for the publish form."""
        db, log = _db(), []
        with patch('services.quest_resource_service.copy_for_quest', return_value=0):
            out = class_quest_copy.copy_class_quest(
                _client(db, log), class_row=db['org_classes'][0], quest_id=QUEST,
                user_id=TEACHER, row={})
        new = next(q for q in db['quests'] if q['id'] == out['quest_id'])
        assert new['metadata']['draft']['class_settings'] == {'student_ids': [S1]}
        assert not [e for e in _writes(log) if e[1] in ('class_quests', 'user_quests')]

    def test_a_whole_class_quest_stays_whole_class(self):
        db, log = _db(), []
        db['class_quests'][0]['student_ids'] = None
        with patch('services.quest_resource_service.copy_for_quest', return_value=0):
            out = class_quest_copy.copy_class_quest(
                _client(db, log), class_row=db['org_classes'][0], quest_id=QUEST,
                user_id=TEACHER)
        new = next(q for q in db['quests'] if q['id'] == out['quest_id'])
        assert new['metadata']['draft']['class_settings'] == {}
        assert out['student_ids'] is None


@pytest.mark.unit
def test_one_route_one_owner():
    """The new rule resolves to this handler and nothing else claims it."""
    m = _real_app.app.url_map.bind('localhost')
    endpoint, _ = m.match(f'/api/sis/classes/{CLASS}/quests/{QUEST}/duplicate', method='POST')
    assert endpoint == 'sis_class_quest_students.copy_class_quest'
    rules = [r for r in _real_app.app.url_map.iter_rules()
             if r.rule == '/api/sis/classes/<class_id>/quests/<quest_id>/duplicate']
    assert len(rules) == 1
