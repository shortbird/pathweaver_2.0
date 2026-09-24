"""
The one SIS quest form (P6, owner decision 2026-09-23).

What these hold:

  * Starting a quest writes it at once as an INACTIVE draft, so its files and
    each task's attachments work from the first minute -- and so it is not in
    student discovery, which shows every active school quest to the school.
  * Drafts are listed per screen, never deleted by themselves, and a blank one
    left by closing the form is the only kind that goes quietly.
  * Publish is per screen: title required, the draft goes live, the screen's
    attach step runs.
  * The teacher rule: a teacher changes only quests they wrote. The office
    changes any school quest. Nobody changes an Optio-library quest.
  * Every create path goes through create_org_quest; training no longer drops
    the diploma subjects or reads a missing Required box as optional.
"""

import copy
import itertools
from unittest.mock import patch

import pytest
from flask import Flask

ORG = '11111111-1111-4111-8111-111111111111'
OTHER_ORG = '99999999-9999-4999-8999-999999999999'
CLASS = '22222222-2222-4222-8222-222222222222'
CURR = '55555555-5555-4555-8555-555555555555'
ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
TEACHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
OTHER_TEACHER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

_ids = itertools.count(1)


def _new_id():
    return f'00000000-0000-4000-8000-{next(_ids):012d}'


class _Result:
    def __init__(self, data, count=None):
        self.data = data
        self.count = count


class _Query:
    """Just enough PostgREST to hold these routes honest: eq / is_ / in_ /
    not_.is_ filters (JSON paths included), insert, update, delete, range."""

    def __init__(self, db, name):
        self.db, self.name = db, name
        self.filters = []
        self.op = 'select'
        self.payload = None
        self._negate = False
        self._range = None
        self._count = None

    # -- building --
    def select(self, *_a, count=None, **_k):
        self._count = count
        return self

    @property
    def not_(self):
        self._negate = True
        return self

    def _add(self, fn):
        neg = self._negate
        self._negate = False
        self.filters.append((lambda r: not fn(r)) if neg else fn)
        return self

    def eq(self, col, value):
        return self._add(lambda r: _get(r, col) == value)

    def neq(self, col, value):
        return self._add(lambda r: _get(r, col) != value)

    def is_(self, col, value):
        return self._add(lambda r: _get(r, col) is None if value == 'null' else _get(r, col) == value)

    def in_(self, col, values):
        values = list(values)
        return self._add(lambda r: _get(r, col) in values)

    def contains(self, col, values):
        return self._add(lambda r: set(values) <= set(_get(r, col) or []))

    def ilike(self, *_a):
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def range(self, lo, hi):
        self._range = (lo, hi)
        return self

    def insert(self, payload):
        self.op, self.payload = 'insert', payload
        return self

    def upsert(self, payload, **_k):
        self.op, self.payload = 'insert', payload
        return self

    def update(self, payload):
        self.op, self.payload = 'update', payload
        return self

    def delete(self):
        self.op = 'delete'
        return self

    # -- running --
    def _match(self):
        return [r for r in self.db.tables.setdefault(self.name, [])
                if all(f(r) for f in self.filters)]

    def execute(self):
        table = self.db.tables.setdefault(self.name, [])
        self.db.log.append((self.name, self.op, copy.deepcopy(self.payload)))
        if self.op == 'insert':
            rows = self.payload if isinstance(self.payload, list) else [self.payload]
            out = []
            for row in rows:
                row = {'id': _new_id(), **copy.deepcopy(row)}
                table.append(row)
                out.append(copy.deepcopy(row))
            return _Result(out)
        matched = self._match()
        if self.op == 'update':
            for r in matched:
                r.update(copy.deepcopy(self.payload))
            return _Result(copy.deepcopy(matched))
        if self.op == 'delete':
            self.db.tables[self.name] = [r for r in table if r not in matched]
            return _Result(copy.deepcopy(matched))
        if self._range:
            matched = matched[self._range[0]:self._range[1] + 1]
        return _Result(copy.deepcopy(matched), count=len(matched) if self._count else None)


def _get(row, col):
    """col may be a JSON path: metadata->draft->>context."""
    parts = col.replace('->>', '->').split('->')
    value = row.get(parts[0])
    for p in parts[1:]:
        value = value.get(p) if isinstance(value, dict) else None
    return value


class _Db:
    def __init__(self, **tables):
        self.tables = {k: [dict(r) for r in v] for k, v in tables.items()}
        self.log = []

    def table(self, name):
        return _Query(self, name)

    def rows(self, name):
        return self.tables.get(name, [])


def _roles(admins=(ADMIN,)):
    """Patch the two questions quest_edit_rules asks: is the caller the office,
    and which org are they in."""
    return (
        patch('services.sis_service.caller_is_admin', side_effect=lambda uid: uid in admins),
        patch('services.sis_service.resolve_org_id', side_effect=lambda uid, org: ORG),
        patch('services.sis_service.org_or_error', return_value=(ORG, None)),
    )


def _call(module, fn, user, *args, body=None, query=None, db=None, admins=(ADMIN,)):
    app = Flask(__name__)
    a, b, c = _roles(admins)
    with a, b, c, \
            patch('utils.admin_client.admin_client', return_value=db), \
            patch.object(module, '_admin', return_value=db, create=True), \
            patch('services.image_service.search_quest_image', return_value='https://stock/img.png'), \
            patch('utils.class_membership.class_teacher_ids',
                  side_effect=lambda cid, row=None: {TEACHER, OTHER_TEACHER}), \
            patch.object(module, 'get_supabase_admin_client', return_value=db, create=True), \
            app.test_request_context(json=body or {}, query_string=query or {}):
        target = getattr(fn, '__wrapped__', fn)
        resp = target(user, *args)
    payload = resp[0].get_json() if isinstance(resp, tuple) else resp.get_json()
    status = resp[1] if isinstance(resp, tuple) else 200
    return payload, status


def _editor():
    from routes.sis import quest_editor
    return quest_editor


def _db_with_class(**extra):
    return _Db(org_classes=[{'id': CLASS, 'organization_id': ORG, 'name': 'Maker Lab',
                             'primary_instructor_id': TEACHER, 'assistant_instructor_ids': []}],
               sis_curriculum=[{'id': CURR, 'organization_id': ORG, 'title': 'Maker', 'is_active': True}],
               **extra)


def _quest(**over):
    return {'id': _new_id(), 'title': 'Watercolor', 'description': 'Paint',
            'organization_id': ORG, 'is_active': True, 'is_public': False,
            'created_by': ADMIN, 'metadata': {}, 'header_image_url': 'https://x/h.png',
            'teachers_may_change_xp': True, 'xp_threshold': None, **over}


# ── Starting a draft ──────────────────────────────────────────────────────────

class TestStartingADraft:
    def test_the_quest_exists_at_once_inactive_and_marked_a_draft(self):
        m = _editor()
        db = _db_with_class()
        body, status = _call(m, m.start_draft, ADMIN, body={'context': 'library'}, db=db)
        assert status == 200 and body['success']
        quest = db.rows('quests')[0]
        assert quest['id'] == body['quest_id']
        # Inactive is what keeps it out of student discovery and enrollment.
        assert quest['is_active'] is False
        assert quest['metadata']['draft']['context'] == 'library'
        assert quest['created_by'] == ADMIN
        assert quest['organization_id'] == ORG and quest['is_public'] is False

    def test_a_draft_has_no_stock_picture_until_it_has_a_title(self):
        m = _editor()
        db = _db_with_class()
        _call(m, m.start_draft, ADMIN, body={'context': 'library'}, db=db)
        assert db.rows('quests')[0]['header_image_url'] is None

    def test_a_teacher_may_start_one_on_a_class_they_teach(self):
        m = _editor()
        db = _db_with_class()
        body, status = _call(m, m.start_draft, TEACHER,
                             body={'context': 'class', 'class_id': CLASS}, db=db)
        assert status == 200
        marker = db.rows('quests')[0]['metadata']['draft']
        assert marker == {'context': 'class', 'target_id': CLASS, 'started_by': TEACHER}

    def test_a_teacher_may_not_start_one_on_somebody_elses_class(self):
        m = _editor()
        db = _db_with_class()
        with patch('utils.class_membership.class_teacher_ids', return_value={OTHER_TEACHER}):
            app = Flask(__name__)
            a, b, c = _roles()
            with a, b, c, patch.object(m, '_admin', return_value=db), \
                    app.test_request_context(json={'context': 'class', 'class_id': CLASS}):
                resp = m.start_draft.__wrapped__(TEACHER)
        assert resp[1] == 403
        assert db.rows('quests') == []

    @pytest.mark.parametrize('context', ['library', 'curriculum', 'training'])
    def test_the_office_screens_are_the_offices(self, context):
        m = _editor()
        db = _db_with_class()
        body, status = _call(m, m.start_draft, TEACHER,
                             body={'context': context, 'curriculum_id': CURR}, db=db)
        assert status == 403
        assert db.rows('quests') == []

    def test_a_training_draft_is_filed_in_the_catalog_straight_away(self):
        """The Training page lists drafts as catalog rows, as it always has."""
        m = _editor()
        db = _db_with_class()
        body, status = _call(m, m.start_draft, ADMIN,
                             body={'context': 'training', 'audience': 'family'}, db=db)
        assert status == 200
        row = db.rows('sis_staff_training')[0]
        assert row['quest_id'] == body['quest_id'] and body['training_id'] == row['id']
        assert row['audience'] == 'family' and row['audiences'] == ['family']
        assert db.rows('quests')[0]['allow_custom_tasks'] is False

    def test_a_curriculum_of_another_school_is_not_found(self):
        m = _editor()
        db = _Db(sis_curriculum=[{'id': CURR, 'organization_id': OTHER_ORG, 'title': 'X'}])
        _body, status = _call(m, m.start_draft, ADMIN,
                              body={'context': 'curriculum', 'curriculum_id': CURR}, db=db)
        assert status == 404


# ── Reading and saving ────────────────────────────────────────────────────────

class TestTheTeacherRule:
    def test_a_teacher_reads_the_offices_quest_but_may_not_change_it(self):
        m = _editor()
        q = _quest(created_by=ADMIN)
        db = _Db(quests=[q])
        body, status = _call(m, m.get_quest, TEACHER, q['id'], db=db)
        assert status == 200
        assert body['quest']['editable'] is False
        _body, status = _call(m, m.save_quest, TEACHER, q['id'],
                              body={'title': 'Renamed'}, db=db)
        assert status == 403
        assert db.rows('quests')[0]['title'] == 'Watercolor'

    def test_a_teacher_may_not_change_another_teachers_quest(self):
        m = _editor()
        q = _quest(created_by=OTHER_TEACHER)
        db = _Db(quests=[q])
        _body, status = _call(m, m.save_quest, TEACHER, q['id'], body={'title': 'Mine now'}, db=db)
        assert status == 403

    def test_a_quest_with_no_author_is_the_offices(self):
        m = _editor()
        q = _quest(created_by=None)
        db = _Db(quests=[q])
        _body, status = _call(m, m.save_quest, TEACHER, q['id'], body={'title': 'X'}, db=db)
        assert status == 403

    def test_a_teacher_changes_their_own_quest(self):
        m = _editor()
        q = _quest(created_by=TEACHER)
        db = _Db(quests=[q])
        body, status = _call(m, m.save_quest, TEACHER, q['id'],
                             body={'title': 'Watercolor 2', 'allow_custom_tasks': False}, db=db)
        assert status == 200, body
        assert db.rows('quests')[0]['title'] == 'Watercolor 2'
        assert db.rows('quests')[0]['allow_custom_tasks'] is False

    def test_the_office_changes_any_school_quest(self):
        m = _editor()
        q = _quest(created_by=OTHER_TEACHER)
        db = _Db(quests=[q])
        _body, status = _call(m, m.save_quest, ADMIN, q['id'], body={'title': 'Fixed'}, db=db)
        assert status == 200
        assert db.rows('quests')[0]['title'] == 'Fixed'

    def test_nobody_changes_an_optio_library_quest(self):
        m = _editor()
        q = _quest(organization_id=None, is_public=True)
        db = _Db(quests=[q])
        body, status = _call(m, m.save_quest, ADMIN, q['id'], body={'title': 'Ours'}, db=db)
        assert status == 403
        assert 'Duplicate' in body['error']

    def test_a_teacher_cannot_unlock_the_finish_line(self):
        m = _editor()
        q = _quest(created_by=TEACHER, teachers_may_change_xp=False, xp_threshold=300)
        db = _Db(quests=[q])
        _body, status = _call(m, m.save_quest, TEACHER, q['id'],
                              body={'teachers_may_change_xp': True}, db=db)
        assert status == 403
        _body, status = _call(m, m.save_quest, TEACHER, q['id'],
                              body={'xp_threshold': 100}, db=db)
        assert status == 403
        assert db.rows('quests')[0]['xp_threshold'] == 300
        # Sending the number back unchanged is not a change.
        _body, status = _call(m, m.save_quest, TEACHER, q['id'],
                              body={'xp_threshold': 300, 'title': 'Still mine'}, db=db)
        assert status == 200

    def test_the_office_sets_the_lock(self):
        m = _editor()
        q = _quest()
        db = _Db(quests=[q])
        body, status = _call(m, m.save_quest, ADMIN, q['id'],
                             body={'teachers_may_change_xp': False, 'xp_threshold': 250}, db=db)
        assert status == 200
        assert db.rows('quests')[0]['teachers_may_change_xp'] is False
        assert body['quest']['xp_threshold'] == 250 and body['quest']['can_lock_xp'] is True

    def test_another_teachers_draft_is_not_even_readable(self):
        m = _editor()
        q = _quest(created_by=OTHER_TEACHER, is_active=False,
                   metadata={'draft': {'context': 'class', 'target_id': CLASS}})
        db = _Db(quests=[q])
        _body, status = _call(m, m.get_quest, TEACHER, q['id'], db=db)
        assert status == 404

    def test_another_schools_quest_is_not_found(self):
        m = _editor()
        q = _quest(organization_id=OTHER_ORG)
        db = _Db(quests=[q])
        _body, status = _call(m, m.get_quest, ADMIN, q['id'], db=db)
        assert status == 404


class TestSavingTheForm:
    def test_tasks_keep_their_ids_and_a_new_one_at_the_top_takes_nobodys(self):
        """Pairing by position would let a task typed in at the top claim the id
        of the task below it -- and its attachments and students' copies."""
        m = _editor()
        q = _quest(created_by=ADMIN)
        t1 = {'id': 't-one', 'quest_id': q['id'], 'title': 'Sketch', 'order_index': 0,
              'pillar': 'art', 'xp_value': 100}
        t2 = {'id': 't-two', 'quest_id': q['id'], 'title': 'Paint', 'order_index': 1,
              'pillar': 'art', 'xp_value': 100}
        db = _Db(quests=[q], quest_template_tasks=[t1, t2])
        with patch('services.sis_quest_task_editing.resync'):
            body, status = _call(m, m.save_quest, ADMIN, q['id'], db=db, body={'tasks': [
                {'title': 'Gather brushes', 'pillar': 'art', 'xp_value': 50},
                {'id': 't-one', 'title': 'Sketch', 'pillar': 'art', 'xp_value': 100},
                {'id': 't-two', 'title': 'Paint it', 'pillar': 'art', 'xp_value': 100},
            ]})
        assert status == 200, body
        by_id = {t['id']: t for t in db.rows('quest_template_tasks')}
        assert by_id['t-one']['title'] == 'Sketch' and by_id['t-one']['order_index'] == 1
        assert by_id['t-two']['title'] == 'Paint it'
        new = [t for t in db.rows('quest_template_tasks') if t['id'] not in ('t-one', 't-two')]
        assert len(new) == 1 and new[0]['title'] == 'Gather brushes'
        assert new[0]['order_index'] == 0

    def test_a_saved_task_keeps_its_subjects_and_an_empty_list_means_no_credit(self):
        m = _editor()
        q = _quest(created_by=ADMIN)
        db = _Db(quests=[q])
        _call(m, m.save_quest, ADMIN, q['id'], db=db, body={'tasks': [
            {'title': 'Map the states', 'pillar': 'civics', 'xp_value': 100,
             'diploma_subjects': ['social_studies']},
            {'title': 'Stretch', 'pillar': 'wellness', 'xp_value': 50, 'diploma_subjects': []},
        ]})
        rows = sorted(db.rows('quest_template_tasks'), key=lambda t: t['order_index'])
        assert rows[0]['diploma_subjects'] == ['social_studies']
        assert rows[1]['diploma_subjects'] == []

    def test_a_draft_may_be_saved_without_a_title_but_a_live_quest_may_not(self):
        m = _editor()
        draft = _quest(is_active=False, title='', metadata={'draft': {'context': 'library'}})
        live = _quest(title='Live')
        db = _Db(quests=[draft, live])
        _b, status = _call(m, m.save_quest, ADMIN, draft['id'], body={'title': ''}, db=db)
        assert status == 200
        _b, status = _call(m, m.save_quest, ADMIN, live['id'], body={'title': '  '}, db=db)
        assert status == 400

    def test_a_live_quest_resyncs_its_students(self):
        m = _editor()
        q = _quest()
        db = _Db(quests=[q])
        with patch('services.sis_quest_editor.resync') as resync:
            _call(m, m.save_quest, ADMIN, q['id'], body={'tasks': [
                {'title': 'One', 'pillar': 'art'}]}, db=db)
        resync.assert_called_once()

    def test_a_draft_resyncs_nobody(self):
        m = _editor()
        q = _quest(is_active=False, metadata={'draft': {'context': 'library'}})
        db = _Db(quests=[q])
        with patch('services.sis_quest_editor.resync') as resync:
            _call(m, m.save_quest, ADMIN, q['id'], body={'tasks': [{'title': 'One'}]}, db=db)
        resync.assert_not_called()


# ── Drafts: listed, resumed, discarded ────────────────────────────────────────

class TestDrafts:
    def _drafts(self):
        return [
            _quest(title='Office draft', is_active=False, created_by=ADMIN,
                   metadata={'draft': {'context': 'class', 'target_id': CLASS}}),
            _quest(title='My draft', is_active=False, created_by=TEACHER,
                   metadata={'draft': {'context': 'class', 'target_id': CLASS}}),
            _quest(title='Library draft', is_active=False, created_by=ADMIN,
                   metadata={'draft': {'context': 'library', 'target_id': None}}),
            _quest(title='Training draft', is_active=False, created_by=ADMIN,
                   metadata={'draft': {'context': 'training', 'target_id': None}}),
            # Retired, not a draft: inactive with no marker.
            _quest(title='Retired', is_active=False, metadata={}),
            _quest(title='Live'),
        ]

    def _list(self, user, query):
        m = _editor()
        db = _db_with_class(quests=self._drafts(), users=[])
        with patch('services.sis_quest_editor.full_name', side_effect=lambda u, fallback='': fallback):
            return _call(m, m.list_drafts, user, query=query, db=db)

    def test_a_teacher_sees_their_own_drafts_on_their_class(self):
        body, status = self._list(TEACHER, {'context': 'class', 'class_id': CLASS})
        assert status == 200
        assert [d['title'] for d in body['drafts']] == ['My draft']

    def test_the_office_sees_every_draft_on_the_class(self):
        body, _ = self._list(ADMIN, {'context': 'class', 'class_id': CLASS})
        assert sorted(d['title'] for d in body['drafts']) == ['My draft', 'Office draft']
        assert all(d['target_name'] == 'Maker Lab' for d in body['drafts'])

    def test_the_librarys_view_is_every_draft_outside_training(self):
        body, _ = self._list(ADMIN, {'context': 'all'})
        assert sorted(d['title'] for d in body['drafts']) == [
            'Library draft', 'My draft', 'Office draft']

    def test_a_teacher_cannot_list_the_offices_drafts(self):
        _body, status = self._list(TEACHER, {'context': 'library'})
        assert status == 403

    def test_closing_a_blank_draft_removes_it(self):
        m = _editor()
        q = _quest(is_active=False, title='', description='', header_image_url=None,
                   metadata={'draft': {'context': 'library'}})
        db = _Db(quests=[q])
        body, status = _call(m, m.discard_draft, ADMIN, q['id'], query={'if_empty': '1'}, db=db)
        assert status == 200 and body['discarded'] is True
        assert db.rows('quests') == []

    def test_closing_a_draft_with_anything_in_it_keeps_it(self):
        """Drafts are never deleted automatically (owner, 2026-09-23)."""
        m = _editor()
        q = _quest(is_active=False, title='', description='', header_image_url=None,
                   metadata={'draft': {'context': 'library'}})
        db = _Db(quests=[q], quest_resources=[{'id': 'r1', 'quest_id': q['id']}])
        body, _ = _call(m, m.discard_draft, ADMIN, q['id'], query={'if_empty': '1'}, db=db)
        assert body['discarded'] is False
        assert len(db.rows('quests')) == 1

    def test_discarding_a_draft_takes_its_tasks_and_catalog_row(self):
        m = _editor()
        q = _quest(is_active=False, metadata={'draft': {'context': 'training'}})
        db = _Db(quests=[q], quest_template_tasks=[{'id': 't', 'quest_id': q['id']}],
                 sis_staff_training=[{'id': 's', 'quest_id': q['id']}])
        body, _ = _call(m, m.discard_draft, ADMIN, q['id'], db=db)
        assert body['discarded'] is True
        assert db.rows('quests') == db.rows('quest_template_tasks') == db.rows('sis_staff_training') == []

    def test_a_published_quest_cannot_be_discarded(self):
        m = _editor()
        q = _quest()
        db = _Db(quests=[q])
        _body, status = _call(m, m.discard_draft, ADMIN, q['id'], db=db)
        assert status == 409
        assert len(db.rows('quests')) == 1


# ── Publishing, per screen ────────────────────────────────────────────────────

class TestPublishing:
    def test_publish_needs_a_title(self):
        from services.sis_quest_authoring import QuestAuthoringError, publish_draft
        db = _Db(quests=[_quest(title=' ', is_active=False)])
        with pytest.raises(QuestAuthoringError):
            publish_draft(db, db.rows('quests')[0])
        assert db.rows('quests')[0]['is_active'] is False

    def test_publish_makes_it_live_drops_the_marker_and_finds_a_picture(self):
        from services.sis_quest_authoring import publish_draft
        q = _quest(is_active=False, header_image_url=None,
                   metadata={'draft': {'context': 'library'}, 'keep': 1})
        db = _Db(quests=[q])
        with patch('services.image_service.search_quest_image', return_value='https://stock/p.png'):
            publish_draft(db, db.rows('quests')[0])
        row = db.rows('quests')[0]
        assert row['is_active'] is True
        assert row['metadata'] == {'keep': 1}
        assert row['header_image_url'] == 'https://stock/p.png'

    def test_the_library_files_it_on_a_curriculum_without_pushing(self):
        from routes.sis import quest_library
        q = _quest(is_active=False, metadata={'draft': {'context': 'library'}})
        db = _db_with_class(quests=[q], sis_curriculum_quests=[])
        with patch.object(quest_library, 'attach_quest_to_curriculum',
                          return_value={'added': True, 'pushed_to_classes': 0}) as attach:
            body, status = _call(quest_library, quest_library.publish_library_quest, ADMIN,
                                 q['id'], body={'curriculum_id': CURR}, db=db)
        assert status == 200, body
        assert db.rows('quests')[0]['is_active'] is True
        assert attach.call_args.kwargs['push'] is False

    def test_the_curriculum_appends_it_and_pushes_to_its_classes(self):
        from routes.sis import curriculum
        q = _quest(is_active=False, metadata={'draft': {'context': 'curriculum', 'target_id': CURR}})
        db = _db_with_class(quests=[q])
        with patch.object(curriculum, '_owned', return_value=True), \
                patch.object(curriculum, 'attach_quest_to_curriculum',
                             return_value={'added': True, 'pushed_to_classes': 3}) as attach:
            body, status = _call(curriculum, curriculum.publish_curriculum_quest, ADMIN,
                                 CURR, q['id'], db=db)
        assert status == 200 and body['pushed_to_classes'] == 3
        assert attach.call_args.kwargs['push'] is True

    def test_the_class_puts_it_on_the_class_with_its_dates_and_enrolls(self):
        from routes.sis import class_quests
        q = _quest(is_active=False, created_by=TEACHER,
                   metadata={'draft': {'context': 'class', 'target_id': CLASS}})
        db = _db_with_class(quests=[q], class_quests=[], class_advisors=[])
        with patch.object(class_quests, 'enroll_safe', return_value={'enrolled': 7}) as enroll, \
                patch.object(class_quests, '_attach_quest_to_class_curricula') as attach:
            body, status = _call(class_quests, class_quests.publish_class_quest, TEACHER,
                                 CLASS, q['id'], db=db,
                                 body={'due_date': '2026-10-01T23:59:59Z'})
        assert status == 200, body
        assert body['students_enrolled'] == 7
        link = db.rows('class_quests')[0]
        assert link['quest_id'] == q['id'] and link['due_date'] == '2026-10-01T23:59:59Z'
        attach.assert_called_once()
        enroll.assert_called_once()
        assert db.rows('quests')[0]['is_active'] is True

    def test_a_teacher_cannot_publish_another_teachers_draft_onto_the_class(self):
        from routes.sis import class_quests
        q = _quest(is_active=False, created_by=OTHER_TEACHER,
                   metadata={'draft': {'context': 'class', 'target_id': CLASS}})
        db = _db_with_class(quests=[q], class_quests=[], class_advisors=[])
        _body, status = _call(class_quests, class_quests.publish_class_quest, TEACHER,
                              CLASS, q['id'], db=db)
        assert status == 403
        assert db.rows('class_quests') == []
        assert db.rows('quests')[0]['is_active'] is False

    def test_a_bad_date_leaves_the_draft_a_draft(self):
        from routes.sis import class_quests
        q = _quest(is_active=False, created_by=TEACHER,
                   metadata={'draft': {'context': 'class', 'target_id': CLASS}})
        db = _db_with_class(quests=[q], class_quests=[], class_advisors=[])
        _body, status = _call(class_quests, class_quests.publish_class_quest, TEACHER,
                              CLASS, q['id'], db=db, body={'due_date': 'next tuesday'})
        assert status == 400
        assert db.rows('quests')[0]['is_active'] is False


class TestClassRoutesHoldTheRule:
    def test_assigning_an_inactive_quest_is_refused(self):
        """The picker never offered a draft, but the route did not check."""
        from routes.sis import class_quests
        q = _quest(is_active=False, metadata={'draft': {'context': 'library'}})
        db = _db_with_class(quests=[q], class_quests=[], class_advisors=[])
        _body, status = _call(class_quests, class_quests.assign_quest, TEACHER, CLASS,
                              db=db, body={'quest_id': q['id']})
        assert status == 404
        assert db.rows('class_quests') == []

    def test_a_teacher_cannot_edit_the_offices_quest_from_their_class(self):
        from routes.sis import class_quests
        q = _quest(created_by=ADMIN)
        db = _db_with_class(quests=[q], class_quests=[{'id': 'l', 'class_id': CLASS,
                                                        'quest_id': q['id']}], class_advisors=[])
        _body, status = _call(class_quests, class_quests.update_class_quest_info, TEACHER,
                              CLASS, q['id'], db=db, body={'title': 'Renamed'})
        assert status == 403
        assert db.rows('quests')[0]['title'] == 'Watercolor'

    def test_a_teacher_still_edits_their_own_quest_from_their_class(self):
        from routes.sis import class_quests
        q = _quest(created_by=TEACHER)
        db = _db_with_class(quests=[q], class_quests=[{'id': 'l', 'class_id': CLASS,
                                                        'quest_id': q['id']}], class_advisors=[])
        _body, status = _call(class_quests, class_quests.update_class_quest_info, TEACHER,
                              CLASS, q['id'], db=db, body={'title': 'Renamed'})
        assert status == 200
        assert db.rows('quests')[0]['title'] == 'Renamed'

    def test_a_teacher_cannot_delete_the_offices_quest(self):
        from routes.sis import class_quests
        q = _quest(created_by=ADMIN)
        db = _db_with_class(quests=[q], class_quests=[], class_advisors=[], user_quests=[])
        _body, status = _call(class_quests, class_quests.delete_class_quest, TEACHER,
                              CLASS, q['id'], db=db)
        assert status == 403
        assert len(db.rows('quests')) == 1

    def test_the_class_list_says_which_quests_the_teacher_may_change(self):
        from routes.sis import class_quests
        mine = _quest(title='Mine', created_by=TEACHER)
        office = _quest(title='Office', created_by=ADMIN)
        db = _db_with_class(quests=[mine, office], class_advisors=[], quest_template_tasks=[])
        db.tables['class_quests'] = [
            {'id': 'l1', 'class_id': CLASS, 'quest_id': mine['id'], 'quests': mine},
            {'id': 'l2', 'class_id': CLASS, 'quest_id': office['id'], 'quests': office},
        ]
        with patch.object(class_quests, '_roster', return_value=[]):
            body, _ = _call(class_quests, class_quests.list_class_quests, TEACHER, CLASS, db=db)
        by_title = {q['title']: q for q in body['quests']}
        assert by_title['Mine']['can_edit'] is True
        assert by_title['Office']['can_edit'] is False
        # The office quest's XP to finish is still the class's to set.
        assert by_title['Office']['editable_tasks'] is True


# ── One create path ───────────────────────────────────────────────────────────

class TestTrainingUsesTheOneCreatePath:
    def test_training_tasks_keep_their_subjects_and_are_required_unless_unticked(self):
        from routes.sis import staff_training as training
        db = _Db(organizations=[{'id': ORG, 'branding_config': {}}])
        body, status = _call(training, training.create_training_quest, ADMIN, db=db, body={
            'title': 'Orientation', 'audience': 'family',
            'tasks': [
                {'title': 'Read the handbook', 'pillar': 'communication',
                 'diploma_subjects': ['language_arts']},
                {'title': 'Tour the building', 'pillar': 'wellness'},
            ]})
        assert status == 201, body
        tasks = sorted(db.rows('quest_template_tasks'), key=lambda t: t['order_index'])
        assert tasks[0]['diploma_subjects'] == ['language_arts']
        # Never left to the column default of Electives.
        assert tasks[1]['diploma_subjects'] and tasks[1]['diploma_subjects'] != ['Electives']
        assert tasks[1]['is_required'] is True

    def test_the_training_editor_reads_the_subjects_back(self):
        from routes.sis import staff_training as training
        q = _quest(title='Orientation')
        db = _Db(quests=[q], quest_template_tasks=[
            {'id': 't', 'quest_id': q['id'], 'title': 'Read', 'diploma_subjects': ['language_arts'],
             'subject_xp_distribution': {'language_arts': 100}, 'order_index': 0}],
            sis_staff_training=[{'id': 's', 'organization_id': ORG, 'quest_id': q['id'],
                                 'audience': 'staff', 'quests': {'is_active': True}}])
        with patch.object(training, '_owned_item', return_value=(
                db.rows('sis_staff_training')[0], None)):
            body, _ = _call(training, training.get_training_quest, ADMIN, 's', db=db)
        assert body['quest']['tasks'][0]['diploma_subjects'] == ['language_arts']

    def test_the_training_catalog_row_takes_who_it_is_for_from_the_editor(self):
        from routes.sis import staff_training as training
        row_id = _new_id()
        db = _Db(sis_staff_training=[{'id': row_id, 'organization_id': ORG, 'quest_id': 'q',
                                      'audience': 'staff', 'audiences': ['staff'],
                                      'visible_to_roles': ['advisor']}])
        body, status = _call(training, training.update_training, ADMIN, row_id, db=db, body={
            'audiences': ['family', 'student'], 'student_min_age': 12})
        assert status == 200, body
        row = db.rows('sis_staff_training')[0]
        assert row['audiences'] == ['family', 'student'] and row['audience'] == 'family'
        assert row['student_min_age'] == 12
        # A staff-only narrowing does not outlive staff leaving the list.
        assert row['visible_to_roles'] is None


class TestDuplicating:
    def test_a_copy_never_inherits_the_draft_marker(self):
        from services.sis_quest_authoring import duplicate_org_quest
        q = _quest(is_active=False, metadata={'draft': {'context': 'library'}, 'header_style': 'org_logo'})
        db = _Db(quests=[q], quest_template_tasks=[])
        with patch('services.quest_resource_service.copy_for_quest', return_value=0):
            out = duplicate_org_quest(db, org_id=ORG, user_id=ADMIN, source_quest_id=q['id'])
        copy_row = next(r for r in db.rows('quests') if r['id'] == out['quest_id'])
        assert copy_row['metadata'] == {'header_style': 'org_logo'}
