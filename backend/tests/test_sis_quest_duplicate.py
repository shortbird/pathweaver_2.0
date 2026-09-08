"""
Duplicating a quest, and duplicating one preset task.

iCreate asked for both on 2026-09-07, on the same screen, half an hour apart:
  - 45c7ced1 "Can I please duplicate quests so I don't have to start over
    every time?"
  - 4da3680d "I'd also like to be able to duplicate tasks."

Their material is variations on itself, and the only way to make the second
version of anything was to retype the first.

The line this file exists to hold: a duplicate is ALWAYS owned by the school
doing the duplicating, whatever it was copied from. That is what makes copying
an Optio-library quest both safe and the point -- the school gets an editable
quest of its own and the shared original is untouched. It is also why the copy
cannot be a plain row copy: is_public and organization_id must be forced, and a
row copy that inherited them would quietly publish a school's quest to every
other school.
"""

from unittest.mock import Mock, patch

import pytest

import routes.sis.curriculum as curriculum
from services.sis_quest_authoring import (
    copy_title,
    duplicate_org_quest,
    duplicate_template_task,
)


ORG = '11111111-1111-4111-8111-111111111111'
OTHER_ORG = '99999999-9999-4999-8999-999999999999'
CURR = '22222222-2222-4222-8222-222222222222'
QUEST = '33333333-3333-4333-8333-333333333333'
NEW_QUEST = '77777777-7777-4777-8777-777777777777'
TASK = '44444444-4444-4444-8444-444444444444'
USER = '55555555-5555-4555-8555-555555555555'


class _FakeTable:
    """Records writes; reads come from `rows`, per table name."""

    def __init__(self, name, rows, log, inserted):
        self.name = name
        self._rows = rows
        self._log = log
        self._inserted = inserted
        self._did_insert = False

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def in_(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def delete(self):
        self._log.append(('delete', self.name))
        return self

    def insert(self, payload):
        self._log.append(('insert', self.name, payload))
        self._inserted.append((self.name, payload))
        self._did_insert = True
        return self

    def update(self, payload):
        self._log.append(('update', self.name, payload))
        return self

    def execute(self):
        # An insert into `quests` must hand back an id the caller can attach
        # things to; everything else replays the table's configured rows.
        # Keyed off THIS builder, not the shared log -- a later select on
        # another table would otherwise inherit the inserted row.
        if self._did_insert and self.name == 'quests':
            return Mock(data=[{'id': NEW_QUEST}])
        return Mock(data=self._rows)


def _client(tables):
    log, inserted = [], []
    c = Mock()
    c.table.side_effect = lambda name: _FakeTable(name, tables.get(name, []), log, inserted)
    c._log, c._inserted = log, inserted
    return c


def _source_quest(org=ORG, **extra):
    row = {
        'id': QUEST,
        'title': 'Watercolor Basics',
        'description': 'Paint.',
        'big_idea': 'Paint.',
        'organization_id': org,
        'is_public': org is None,
        'is_active': True,
        'is_v3': True,
        'quest_type': 'optio',
        'xp_threshold': 200,
        'image_url': 'https://img/wc.png',
        # Never copied: identity, and anything tied to one delivery of the quest.
        'created_by': 'someone-else',
        'lms_course_id': 'CANVAS-1',
        'lti_ags_lineitem_url': 'https://lms/line/1',
        'archived_at': '2026-01-01T00:00:00Z',
        'class_review_status': 'approved',
    }
    row.update(extra)
    return row


def _inserted(client, table):
    return [p for (name, p) in client._inserted if name == table]


@pytest.mark.unit
class TestTheCopyBelongsToTheSchool:
    def test_a_library_quest_copies_into_the_school_as_its_own(self):
        # The whole reason duplicating a library quest is allowed where editing
        # one is refused: the school ends up with an editable quest, and the
        # shared original is not written to at all.
        client = _client({'quests': [_source_quest(org=None)]})
        out = duplicate_org_quest(client, org_id=ORG, user_id=USER, source_quest_id=QUEST)

        payload = _inserted(client, 'quests')[0]
        assert payload['organization_id'] == ORG
        assert payload['is_public'] is False
        assert payload['created_by'] == USER
        assert out['quest_id'] == NEW_QUEST
        # Nothing is written to the shared original -- only new rows.
        assert not [e for e in client._log if e[0] in ('update', 'delete')]

    def test_the_source_orgs_ownership_is_never_inherited(self):
        # A plain row copy would carry OTHER_ORG across and hand this school a
        # quest it cannot see in its own library.
        client = _client({'quests': [_source_quest(org=OTHER_ORG)]})
        duplicate_org_quest(client, org_id=ORG, user_id=USER, source_quest_id=QUEST)
        assert _inserted(client, 'quests')[0]['organization_id'] == ORG

    def test_content_is_carried_but_delivery_and_identity_are_not(self):
        client = _client({'quests': [_source_quest()]})
        duplicate_org_quest(client, org_id=ORG, user_id=USER, source_quest_id=QUEST)
        payload = _inserted(client, 'quests')[0]

        assert payload['description'] == 'Paint.'
        assert payload['xp_threshold'] == 200
        assert payload['image_url'] == 'https://img/wc.png'
        for gone in ('id', 'lms_course_id', 'lti_ags_lineitem_url',
                     'archived_at', 'class_review_status'):
            assert gone not in payload, f'{gone} must not ride along on a copy'

    def test_a_missing_source_is_a_404_not_a_blank_quest(self):
        from services.sis_quest_authoring import QuestAuthoringError
        client = _client({'quests': []})
        with pytest.raises(QuestAuthoringError) as e:
            duplicate_org_quest(client, org_id=ORG, user_id=USER, source_quest_id=QUEST)
        assert e.value.status == 404
        assert not _inserted(client, 'quests')


@pytest.mark.unit
class TestTasksComeWithIt:
    def test_every_preset_task_is_copied_and_renumbered_from_zero(self):
        # order_index gaps are normal on the source after deletes; the copy has
        # no reason to inherit them.
        tasks = [
            {'id': 't1', 'title': 'Mix a color wheel', 'pillar': 'art',
             'xp_value': 100, 'is_required': True, 'order_index': 0},
            {'id': 't2', 'title': 'Paint a wash', 'pillar': 'art',
             'xp_value': 50, 'is_required': False, 'order_index': 7},
        ]
        client = _client({'quests': [_source_quest()], 'quest_template_tasks': tasks})
        out = duplicate_org_quest(client, org_id=ORG, user_id=USER, source_quest_id=QUEST)

        copies = _inserted(client, 'quest_template_tasks')[0]
        assert out['task_count'] == 2
        assert [c['title'] for c in copies] == ['Mix a color wheel', 'Paint a wash']
        assert [c['order_index'] for c in copies] == [0, 1]
        assert all(c['quest_id'] == NEW_QUEST for c in copies)
        # The source task's own id must not ride along, or the insert collides.
        assert all('id' not in c for c in copies)

    def test_a_quest_with_no_tasks_writes_no_task_rows(self):
        client = _client({'quests': [_source_quest()], 'quest_template_tasks': []})
        out = duplicate_org_quest(client, org_id=ORG, user_id=USER, source_quest_id=QUEST)
        assert out['task_count'] == 0
        assert not _inserted(client, 'quest_template_tasks')


@pytest.mark.unit
class TestTheCopyGetsAName:
    def test_the_first_copy_is_named_copy(self):
        assert copy_title([], 'Watercolor Basics') == 'Watercolor Basics (copy)'

    def test_a_second_copy_counts_up_rather_than_colliding(self):
        # Two rows with the same name in the library is the thing that makes a
        # duplicate button useless.
        existing = ['Watercolor Basics', 'Watercolor Basics (copy)']
        assert copy_title(existing, 'Watercolor Basics') == 'Watercolor Basics (copy 2)'
        assert copy_title(existing + ['Watercolor Basics (copy 2)'],
                          'Watercolor Basics') == 'Watercolor Basics (copy 3)'

    def test_the_name_check_ignores_case_and_padding(self):
        assert copy_title(['  watercolor basics (COPY) '],
                          'Watercolor Basics') == 'Watercolor Basics (copy 2)'

    def test_an_explicit_title_wins_over_the_generated_one(self):
        client = _client({'quests': [_source_quest()]})
        out = duplicate_org_quest(client, org_id=ORG, user_id=USER,
                                  source_quest_id=QUEST, title='  Watercolor III  ')
        assert out['title'] == 'Watercolor III'


@pytest.mark.unit
class TestDuplicatingOneTask:
    def test_the_copy_lands_at_the_end_of_the_list(self):
        client = _client({'quest_template_tasks': [{'order_index': 4}]})
        source = {'id': TASK, 'title': 'Sketch your design', 'pillar': 'art',
                  'xp_value': 75, 'is_required': True, 'order_index': 0}
        duplicate_template_task(client, source, QUEST)
        copy = _inserted(client, 'quest_template_tasks')[0]
        assert copy['order_index'] == 5
        assert copy['quest_id'] == QUEST

    def test_the_copy_keeps_the_title_verbatim(self):
        # Unlike a quest, a task is read inside the one quest it belongs to,
        # directly below its source -- "(copy)" would be noise to delete on the
        # way to editing it.
        client = _client({'quest_template_tasks': []})
        source = {'id': TASK, 'title': 'Sketch your design', 'pillar': 'art',
                  'xp_value': 75, 'is_required': False, 'order_index': 0}
        duplicate_template_task(client, source, QUEST)
        copy = _inserted(client, 'quest_template_tasks')[0]
        assert copy['title'] == 'Sketch your design'
        assert copy['xp_value'] == 75
        assert copy['is_required'] is False
        assert 'id' not in copy


# ── The routes ────────────────────────────────────────────────────────────────

def _run(route, args, body, tables):
    client = _client(tables)
    with patch.object(curriculum, '_admin', return_value=client), \
         patch.object(curriculum, '_org_or_error', return_value=(ORG, None)), \
         patch.object(curriculum, '_owned', return_value={'id': CURR, 'organization_id': ORG}), \
         patch.object(curriculum, '_resync_template', Mock()), \
         patch.object(curriculum, 'request', Mock(get_json=lambda silent=True: body, args={})):
        from flask import Flask
        app = Flask(__name__)
        with app.app_context():
            fn = route.__wrapped__ if hasattr(route, '__wrapped__') else route
            resp = fn(USER, *args)
    out = resp[0].get_json() if isinstance(resp, tuple) else resp.get_json()
    status = resp[1] if isinstance(resp, tuple) else 200
    return out, status, client


def _tables(quest_org=ORG, linked=True, extra=None):
    t = {
        'sis_curriculum_quests': [{'quest_id': QUEST, 'sequence_order': 3}] if linked else [],
        'quests': [_source_quest(org=quest_org)],
    }
    t.update(extra or {})
    return t


@pytest.mark.unit
class TestTheCurriculumRoutes:
    def test_duplicating_attaches_the_copy_to_the_same_curriculum(self):
        out, status, client = _run(curriculum.duplicate_curriculum_quest,
                                   (CURR, QUEST), {}, _tables())
        assert status == 200
        links = _inserted(client, 'sis_curriculum_quests')
        assert links and links[0]['quest_id'] == NEW_QUEST
        assert links[0]['curriculum_id'] == CURR

    def test_a_library_quest_can_be_duplicated_even_though_it_cannot_be_edited(self):
        # The one place the library rule deliberately does NOT apply. Copying is
        # how a school gets a version it may edit.
        out, status, client = _run(curriculum.duplicate_curriculum_quest,
                                   (CURR, QUEST), {}, _tables(quest_org=None))
        assert status == 200
        assert _inserted(client, 'quests')[0]['organization_id'] == ORG

    def test_a_quest_on_another_curriculum_is_not_reachable(self):
        out, status, client = _run(curriculum.duplicate_curriculum_quest,
                                   (CURR, QUEST), {}, _tables(linked=False))
        assert status == 404
        assert not _inserted(client, 'quests')

    def test_the_copy_is_not_pushed_to_the_curriculums_classes(self):
        # A duplicate is a draft the admin is about to edit. Pushing it would
        # put a quest named "... (copy)" in front of students before anyone had
        # touched it.
        with patch.object(curriculum, 'push_curriculum_quests_safe') as push:
            _run(curriculum.duplicate_curriculum_quest, (CURR, QUEST), {}, _tables())
        push.assert_not_called()

    def test_duplicating_a_task_on_a_library_quest_is_refused(self):
        # Unlike the quest copy, this one writes INTO the shared quest, so the
        # library rule holds exactly as it does for add and edit.
        out, status, client = _run(curriculum.duplicate_curriculum_quest_task,
                                   (CURR, QUEST, TASK), {}, _tables(quest_org=None))
        assert status == 403
        assert not _inserted(client, 'quest_template_tasks')

    def test_duplicating_a_task_that_is_not_on_this_quest_is_a_404(self):
        out, status, client = _run(
            curriculum.duplicate_curriculum_quest_task, (CURR, QUEST, TASK), {},
            _tables(extra={'quest_template_tasks': []}))
        assert status == 404
        assert not _inserted(client, 'quest_template_tasks')
