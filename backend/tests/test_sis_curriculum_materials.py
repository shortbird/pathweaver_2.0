"""
Curriculum resources: saved on the curriculum, shown to students on request.

iCreate/Horizon, 2026-09-02: "youtube links, documents, all the same. it's
things that are saved in curriculum that teachers have the option to have appear
in the student class view so they can access some kind of resource."

The rules with teeth, and the reason each is here:

  - visible_to_students gates the student read. A curriculum is ALSO where
    answer keys and teacher's guides live -- it has been staff-only since it was
    built -- so the flag defaulting closed is what makes it safe to hang a
    student-facing list off it at all.
  - A teacher of a class on the curriculum may manage its resources. They are
    the ones with the handouts; the precedent is class quests, which teachers add
    and which auto-attach to the class's curriculum. The curriculum's own
    definition (title, notes, drive_url) stays admin-only, elsewhere.
  - A resource inherited onto a class is never deletable from that class:
    removing it there would have to mean removing it from every class teaching
    the curriculum.
"""

from unittest.mock import Mock, patch

import pytest

import routes.sis.curriculum_materials as cm
from services.sis_curriculum_sync import curriculum_materials_for_class


ORG = '11111111-1111-4111-8111-111111111111'
OTHER_ORG = '55555555-5555-4555-8555-555555555555'
CURR = '22222222-2222-4222-8222-222222222222'
CLASS = '44444444-4444-4444-8444-444444444444'
TEACHER = '66666666-6666-4666-8666-666666666661'
OTHER_TEACHER = '66666666-6666-4666-8666-666666666662'
ADMIN_USER = '77777777-7777-4777-8777-777777777777'
MAT = '88888888-8888-4888-8888-888888888881'


class _Table:
    def __init__(self, name, rows, log):
        self.name, self._rows, self._log = name, rows, log

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

    def insert(self, payload):
        self._log.append(('insert', self.name, payload))
        self._pending = [{'id': MAT, **payload}]
        return self

    def update(self, payload):
        self._log.append(('update', self.name, payload))
        self._pending = [{'id': MAT, **payload}]
        return self

    def delete(self):
        self._log.append(('delete', self.name))
        self._pending = []
        return self

    def execute(self):
        return Mock(data=getattr(self, '_pending', self._rows))


def _client(tables, log):
    c = Mock()
    c.table.side_effect = lambda name: _Table(name, tables.get(name, []), log)
    c.storage = Mock()
    return c


def _tables(**over):
    base = {
        'sis_curriculum': [{'id': CURR, 'organization_id': ORG, 'title': 'Science'}],
        'sis_curriculum_classes': [{'class_id': CLASS, 'curriculum_id': CURR}],
        'org_classes': [{'id': CLASS, 'primary_instructor_id': TEACHER,
                         'assistant_instructor_ids': []}],
        'class_advisors': [],
        'sis_curriculum_materials': [],
    }
    base.update(over)
    return base


def _call(view, user_id, tables, *, json=None, log=None, **kwargs):
    """Drive one route with a stubbed DB and caller identity.

    @require_auth is unwrapped rather than satisfied: these tests are about the
    curriculum-level gate (admin of the org, or teacher of a class on it), and
    resolving a session would only test the decorator.
    """
    log = log if log is not None else []
    from flask import Flask
    app = Flask(__name__)
    is_admin = user_id == ADMIN_USER
    fn = getattr(view, '__wrapped__', view)
    with app.test_request_context(json=json):
        with patch.object(cm, '_admin', return_value=_client(tables, log)), \
             patch.object(cm.sis_service, 'caller_is_admin', return_value=is_admin), \
             patch.object(cm.sis_service, 'resolve_org_id', return_value=ORG), \
             patch.object(cm, 'sign_in_place', side_effect=lambda rows, fields: rows):
            resp = fn(user_id, CURR, **kwargs)
    body, status = (resp if isinstance(resp, tuple) else (resp, 200))
    return body.get_json(), status, log


class TestWhoMayManageThem:

    def test_the_teacher_of_a_class_on_the_curriculum_can(self):
        """Teachers are the ones with the handouts. Refusing them here would
        leave the feature to admins and change nothing for the people asking."""
        body, status, _ = _call(cm.list_materials, TEACHER, _tables())
        assert status == 200 and body['can_manage'] is True
        assert body['is_admin'] is False

    def test_an_org_admin_can(self):
        body, status, _ = _call(cm.list_materials, ADMIN_USER, _tables())
        assert status == 200 and body['is_admin'] is True

    def test_a_teacher_with_no_class_on_it_cannot(self):
        body, status, _ = _call(cm.list_materials, OTHER_TEACHER, _tables())
        assert status == 403

    def test_an_assistant_instructor_counts(self):
        tables = _tables(org_classes=[{'id': CLASS, 'primary_instructor_id': None,
                                       'assistant_instructor_ids': [OTHER_TEACHER]}])
        _, status, _ = _call(cm.list_materials, OTHER_TEACHER, tables)
        assert status == 200

    def test_an_active_co_teacher_counts(self):
        tables = _tables(org_classes=[{'id': CLASS, 'primary_instructor_id': None,
                                       'assistant_instructor_ids': []}],
                         class_advisors=[{'class_id': CLASS}])
        _, status, _ = _call(cm.list_materials, OTHER_TEACHER, tables)
        assert status == 200

    def test_a_curriculum_on_no_class_is_teachers_to_nobody(self):
        _, status, _ = _call(cm.list_materials, TEACHER,
                             _tables(sis_curriculum_classes=[]))
        assert status == 403


class TestSavingAResource:

    def test_a_youtube_link_and_a_document_are_the_same_row(self):
        """"youtube links, documents, all the same" — a link is a link."""
        body, status, log = _call(cm.add_link, TEACHER, _tables(), json={
            'title': 'Intro to Anatomy', 'url': 'https://www.youtube.com/watch?v=abc'})
        assert status == 200
        written = [e[2] for e in log if e[0] == 'insert'][0]
        assert written['kind'] == 'link'
        assert written['url'] == 'https://www.youtube.com/watch?v=abc'
        assert written['curriculum_id'] == CURR
        assert written['organization_id'] == ORG

    def test_it_is_shown_to_students_by_default_when_added_here(self):
        """Adding a resource is the deliberate act of handing something over;
        the column defaults closed for rows created any other way."""
        _, _, log = _call(cm.add_link, TEACHER, _tables(),
                          json={'title': 'Notes', 'url': 'https://example.com/n'})
        assert [e[2] for e in log if e[0] == 'insert'][0]['visible_to_students'] is True

    def test_a_teacher_can_keep_one_to_themselves(self):
        _, _, log = _call(cm.add_link, TEACHER, _tables(),
                          json={'title': 'Answer key', 'url': 'https://example.com/k',
                                'visible_to_students': False})
        assert [e[2] for e in log if e[0] == 'insert'][0]['visible_to_students'] is False

    @pytest.mark.parametrize('url', [
        'javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'ftp://x/y', 'example.com',
    ])
    def test_only_http_links_are_accepted(self, url):
        """These render as links a student clicks, so anything else is stored XSS."""
        body, status, log = _call(cm.add_link, TEACHER, _tables(),
                                  json={'title': 'x', 'url': url})
        assert status == 400
        assert not [e for e in log if e[0] == 'insert']

    def test_a_title_and_a_link_are_both_required(self):
        _, status, _ = _call(cm.add_link, TEACHER, _tables(),
                             json={'title': '', 'url': 'https://example.com'})
        assert status == 400


class TestTheVisibilityToggle:

    def test_a_teacher_can_show_one_to_students(self):
        tables = _tables(sis_curriculum_materials=[
            {'id': MAT, 'curriculum_id': CURR, 'created_by': TEACHER}])
        body, status, log = _call(cm.set_visibility, TEACHER, tables,
                                  json={'visible_to_students': True},
                                  material_id=MAT)
        assert status == 200
        assert [e[2] for e in log if e[0] == 'update'] == [{'visible_to_students': True}]

    def test_a_resource_on_another_curriculum_is_not_found(self):
        """Scoped to THIS curriculum: the id alone would let a teacher flip a
        resource on a curriculum they have no class on."""
        tables = _tables(sis_curriculum_materials=[
            {'id': MAT, 'curriculum_id': 'other', 'created_by': TEACHER}])
        _, status, log = _call(cm.set_visibility, TEACHER, tables,
                               json={'visible_to_students': True}, material_id=MAT)
        assert status == 404
        assert not [e for e in log if e[0] == 'update']


class TestRemoving:

    def test_a_teacher_removes_only_what_they_added(self):
        tables = _tables(sis_curriculum_materials=[
            {'id': MAT, 'curriculum_id': CURR, 'created_by': OTHER_TEACHER,
             'file_path': None}])
        _, status, log = _call(cm.delete_material, TEACHER, tables, material_id=MAT)
        assert status == 403
        assert not [e for e in log if e[0] == 'delete']

    def test_an_admin_removes_anything(self):
        tables = _tables(sis_curriculum_materials=[
            {'id': MAT, 'curriculum_id': CURR, 'created_by': TEACHER,
             'file_path': None}])
        _, status, log = _call(cm.delete_material, ADMIN_USER, tables, material_id=MAT)
        assert status == 200
        assert ('delete', 'sis_curriculum_materials') in [(e[0], e[1]) for e in log]


class TestWhatTheClassInherits:

    def _tables(self, materials, curriculum_active=True):
        return {
            'sis_curriculum_classes': [{'curriculum_id': CURR}],
            'sis_curriculum': ([{'id': CURR, 'title': 'Science'}]
                               if curriculum_active else []),
            'sis_curriculum_materials': materials,
        }

    def test_a_shown_resource_reaches_the_class(self):
        rows = curriculum_materials_for_class(_client(self._tables([
            {'id': MAT, 'curriculum_id': CURR, 'kind': 'link', 'title': 'Anatomy video',
             'url': 'https://youtu.be/x', 'visible_to_students': True,
             'created_at': '2026-09-02T00:00:00Z'}]), []), CLASS)
        assert [r['title'] for r in rows] == ['Anatomy video']
        assert rows[0]['curriculum_title'] == 'Science'
        assert rows[0]['source'] == 'curriculum'

    def test_the_student_read_asks_only_for_visible_rows(self):
        """The filter is a query predicate, not a Python one — assert the read is
        scoped rather than re-implementing PostgREST in the fake."""
        client = _client(self._tables([]), [])
        table = client.table
        seen = {}

        def spy(name):
            t = table(name)
            if name == 'sis_curriculum_materials':
                original_eq = t.eq
                def eq(*a, **k):
                    seen.setdefault('eq', []).append(a)
                    return original_eq(*a, **k)
                t.eq = eq
            return t
        client.table = spy
        curriculum_materials_for_class(client, CLASS, visible_only=True)
        assert ('visible_to_students', True) in seen.get('eq', [])

    def test_staff_can_ask_for_everything(self):
        client = _client(self._tables([
            {'id': MAT, 'curriculum_id': CURR, 'kind': 'file', 'title': 'Answer key',
             'url': 'https://x/k.pdf', 'visible_to_students': False,
             'created_at': '2026-09-02T00:00:00Z'}]), [])
        rows = curriculum_materials_for_class(client, CLASS, visible_only=False)
        assert [r['title'] for r in rows] == ['Answer key']
        assert rows[0]['visible_to_students'] is False

    def test_an_archived_curriculum_stops_handing_things_out(self):
        rows = curriculum_materials_for_class(_client(self._tables([
            {'id': MAT, 'curriculum_id': CURR, 'kind': 'link', 'title': 'x',
             'url': 'https://x', 'visible_to_students': True,
             'created_at': '2026-09-02T00:00:00Z'}], curriculum_active=False), []), CLASS)
        assert rows == []

    def test_a_class_on_no_curriculum_inherits_nothing(self):
        client = _client({'sis_curriculum_classes': []}, [])
        assert curriculum_materials_for_class(client, CLASS) == []


class TestHidingAClassMaterial:
    """The same switch on the OTHER list a class shows students.

    iCreate/Horizon, 2026-09-02: "teachers/admin need to be able to hide/show
    materials as well." The defaults differ from curriculum resources and the
    difference is deliberate -- see the migration. class_materials have always
    been student-visible, so they default TRUE; hiding is the new, opt-in act.
    """

    def _class_tables(self, materials, **over):
        base = {
            'org_classes': [{'id': CLASS, 'organization_id': ORG, 'name': 'Science',
                             'primary_instructor_id': TEACHER,
                             'assistant_instructor_ids': [], 'status': 'active'}],
            'class_advisors': [],
            'class_enrollments': [],
            'class_materials': materials,
            'sis_curriculum_classes': [],
        }
        base.update(over)
        return base

    def _call(self, view, user_id, tables, *, json=None, **kwargs):
        import routes.sis.class_materials as cmat
        from flask import Flask
        log = []
        app = Flask(__name__)
        is_admin = user_id == ADMIN_USER
        fn = getattr(view, '__wrapped__', view)
        client = _client(tables, log)
        with app.test_request_context(json=json):
            with patch.object(cmat, 'get_supabase_admin_client', return_value=client), \
                 patch.object(cmat.sis_service, 'caller_is_admin', return_value=is_admin), \
                 patch.object(cmat.sis_service, 'resolve_org_id', return_value=ORG), \
                 patch.object(cmat, 'sign_in_place', side_effect=lambda rows, f: rows), \
                 patch.object(cmat, 'curriculum_materials_for_class', return_value=[]):
                resp = fn(user_id, CLASS, **kwargs)
        body, status = (resp if isinstance(resp, tuple) else (resp, 200))
        return body.get_json(), status, log

    def test_a_teacher_can_hide_one(self):
        import routes.sis.class_materials as cmat
        tables = self._class_tables([{'id': MAT, 'class_id': CLASS}])
        body, status, log = self._call(cmat.set_material_visibility, TEACHER, tables,
                                       json={'visible_to_students': False},
                                       material_id=MAT)
        assert status == 200
        assert [e[2] for e in log if e[0] == 'update'] == [{'visible_to_students': False}]

    def test_a_material_on_another_class_is_not_found(self):
        import routes.sis.class_materials as cmat
        tables = self._class_tables([{'id': MAT, 'class_id': 'other-class'}])
        _, status, log = self._call(cmat.set_material_visibility, TEACHER, tables,
                                    json={'visible_to_students': False},
                                    material_id=MAT)
        assert status == 404
        assert not [e for e in log if e[0] == 'update']

    def test_a_student_cannot_flip_it(self):
        """The enrolled-student read gate lets them reach the module; the
        moderator check is what stops them writing."""
        import routes.sis.class_materials as cmat
        tables = self._class_tables([{'id': MAT, 'class_id': CLASS}],
                                    class_enrollments=[{'id': 'e1'}],
                                    org_classes=[{'id': CLASS, 'organization_id': ORG,
                                                  'name': 'Science',
                                                  'primary_instructor_id': None,
                                                  'assistant_instructor_ids': [],
                                                  'status': 'active'}])
        _, status, log = self._call(cmat.set_material_visibility, OTHER_TEACHER, tables,
                                    json={'visible_to_students': True}, material_id=MAT)
        assert status == 403
        assert not [e for e in log if e[0] == 'update']

    def test_a_new_material_is_visible_unless_said_otherwise(self):
        """These have always been handed straight to students; the switch adds a
        way to hold one back, it does not change what adding one means."""
        import routes.sis.class_materials as cmat
        tables = self._class_tables([])
        _, status, log = self._call(cmat.add_link_material, TEACHER, tables,
                                    json={'title': 'Week 1 slides',
                                          'url': 'https://example.com/s'})
        assert status == 200
        assert [e[2] for e in log if e[0] == 'insert'][0]['visible_to_students'] is True
