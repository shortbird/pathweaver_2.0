"""
Curriculum -> class: what an admin attaches in /curriculum reaches the students.

The bug these pin down (found in production 2026-09-02, iCreate and Horizon on
the same code): the SIS /curriculum tab wrote sis_curriculum_quests and stopped
there, while students read class_quests. The class->curriculum direction had
auto-attached since 2026-08-31, so quests a teacher added showed up everywhere
and quests an ADMIN added showed up nowhere -- "The iCreate Launch Challenge"
and "Mastering the Cricut Maker Machine" sat in two curricula with twelve
enrolled students who could not see them.

The push is additive on purpose, and that asymmetry is the thing most likely to
be "tidied up" by someone later, so it is asserted directly: attaching pushes,
detaching does not pull. A class quest carries its own publish_at and due_date
and may have student work behind it; removing a quest from a school's library is
not a statement that a section in progress should lose it.
"""

from unittest.mock import Mock

from services.sis_curriculum_sync import (
    curriculum_courses_for_class,
    push_curriculum_quests_to_classes,
    push_curriculum_quests_safe,
)


ORG = '11111111-1111-4111-8111-111111111111'
OTHER_ORG = '55555555-5555-4555-8555-555555555555'
CURR = '22222222-2222-4222-8222-222222222222'
CURR2 = '22222222-2222-4222-8222-222222222223'
ADMIN = '99999999-9999-4999-8999-999999999999'
Q1 = '33333333-3333-4333-8333-333333333331'
Q2 = '33333333-3333-4333-8333-333333333332'
CLASS_A = '44444444-4444-4444-8444-44444444444a'
CLASS_B = '44444444-4444-4444-8444-44444444444b'
COURSE1 = '66666666-6666-4666-8666-666666666661'
COURSE2 = '66666666-6666-4666-8666-666666666662'


class _Table:
    """Answers selects from a canned row list; records writes."""

    def __init__(self, name, rows, log):
        self.name, self._rows, self._log = name, rows, log

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def in_(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def delete(self):
        self._log.append(('delete', self.name))
        return self

    def insert(self, payload):
        self._log.append(('insert', self.name, payload))
        return self

    def upsert(self, payload, **_k):
        self._log.append(('upsert', self.name, payload))
        return self

    def execute(self):
        return Mock(data=self._rows)


def _client(tables, log):
    c = Mock()
    c.table.side_effect = lambda name: _Table(name, tables.get(name, []), log)
    return c


def _upserted(log, table):
    for entry in log:
        if entry[0] == 'upsert' and entry[1] == table:
            return entry[2]
    return None


def _tables(**over):
    """A curriculum on two active classes, carrying one of this org's quests."""
    base = {
        'sis_curriculum_classes': [{'class_id': CLASS_A}, {'class_id': CLASS_B}],
        'org_classes': [{'id': CLASS_A}, {'id': CLASS_B}],
        'sis_curriculum_quests': [{'quest_id': Q1, 'sequence_order': 0}],
        'quests': [{'id': Q1, 'organization_id': ORG, 'is_active': True, 'is_public': False}],
        'class_quests': [],
    }
    base.update(over)
    return base


class TestTheQuestReachesTheClasses:

    def test_an_attached_quest_lands_on_every_active_class(self):
        log = []
        result = push_curriculum_quests_to_classes(
            _client(_tables(), log), CURR, ORG, ADMIN)
        rows = _upserted(log, 'class_quests')
        assert {(r['class_id'], r['quest_id']) for r in rows} == {
            (CLASS_A, Q1), (CLASS_B, Q1)}
        assert result == {'classes': 2, 'assignments': 2}

    def test_a_quest_already_on_the_class_is_left_alone(self):
        """Idempotent: the second save must not touch a row carrying a section's
        publish_at, its due date, or the work students have done against it."""
        log = []
        tables = _tables(class_quests=[
            {'class_id': CLASS_A, 'quest_id': Q1, 'sequence_order': 4},
            {'class_id': CLASS_B, 'quest_id': Q1, 'sequence_order': 4},
        ])
        result = push_curriculum_quests_to_classes(_client(tables, log), CURR, ORG, ADMIN)
        assert _upserted(log, 'class_quests') is None
        assert result == {'classes': 0, 'assignments': 0}

    def test_a_new_quest_appends_after_what_the_class_already_has(self):
        log = []
        tables = _tables(
            sis_curriculum_quests=[{'quest_id': Q1, 'sequence_order': 0},
                                   {'quest_id': Q2, 'sequence_order': 1}],
            quests=[{'id': Q1, 'organization_id': ORG, 'is_active': True},
                    {'id': Q2, 'organization_id': ORG, 'is_active': True}],
            class_quests=[{'class_id': CLASS_A, 'quest_id': Q1, 'sequence_order': 7},
                          {'class_id': CLASS_B, 'quest_id': Q1, 'sequence_order': 7}],
        )
        push_curriculum_quests_to_classes(_client(tables, log), CURR, ORG, ADMIN)
        rows = _upserted(log, 'class_quests')
        assert [r['quest_id'] for r in rows] == [Q2, Q2]
        assert {r['sequence_order'] for r in rows} == {8}

    def test_an_archived_class_is_skipped(self):
        """org_classes is filtered to status=active, so an archived section
        returns no row and gains nothing."""
        log = []
        result = push_curriculum_quests_to_classes(
            _client(_tables(org_classes=[]), log), CURR, ORG, ADMIN)
        assert result == {'classes': 0, 'assignments': 0}
        assert _upserted(log, 'class_quests') is None

    def test_another_school_s_quest_is_never_pushed(self):
        log = []
        tables = _tables(quests=[{'id': Q1, 'organization_id': OTHER_ORG, 'is_active': True}])
        assert push_curriculum_quests_to_classes(
            _client(tables, log), CURR, ORG, ADMIN)['assignments'] == 0

    def test_an_archived_quest_is_never_pushed(self):
        """A curriculum link outlives the quest it points at; the set is
        re-checked on every push rather than trusted from when it was saved."""
        log = []
        tables = _tables(quests=[{'id': Q1, 'organization_id': ORG, 'is_active': False}])
        assert push_curriculum_quests_to_classes(
            _client(tables, log), CURR, ORG, ADMIN)['assignments'] == 0

    def test_the_shared_optio_library_is_pushed(self):
        log = []
        tables = _tables(quests=[{'id': Q1, 'organization_id': None,
                                  'is_public': True, 'is_active': True}])
        assert push_curriculum_quests_to_classes(
            _client(tables, log), CURR, ORG, ADMIN)['assignments'] == 2

    def test_a_caller_can_narrow_to_one_class(self):
        """Used when a class is newly attached: the classes already on the
        curriculum keep the list their teacher curated."""
        log = []
        push_curriculum_quests_to_classes(_client(_tables(), log), CURR, ORG, ADMIN,
                                          class_ids=[CLASS_B])
        rows = _upserted(log, 'class_quests')
        assert [r['class_id'] for r in rows] == [CLASS_B]

    def test_narrowing_still_cannot_reach_an_inactive_class(self):
        log = []
        result = push_curriculum_quests_to_classes(
            _client(_tables(org_classes=[{'id': CLASS_A}]), log), CURR, ORG, ADMIN,
            class_ids=[CLASS_B])
        assert result == {'classes': 0, 'assignments': 0}

    def test_the_push_never_deletes_from_a_class(self):
        """The whole point of additive-only. Nothing in this path may issue a
        delete against class_quests -- a library edit must not pull a quest out
        from under a section mid-term."""
        log = []
        push_curriculum_quests_to_classes(_client(_tables(), log), CURR, ORG, ADMIN)
        assert not [e for e in log if e[0] == 'delete']

    def test_a_failure_to_reach_the_classes_does_not_raise(self):
        """The curriculum row is already committed when this runs; a 500 here
        would read to the admin as "nothing saved" and send them into a retry
        that no-ops on the half that worked."""
        broken = Mock()
        broken.table.side_effect = RuntimeError('postgrest is having a day')
        assert push_curriculum_quests_safe(broken, CURR, ORG, ADMIN) == {
            'classes': 0, 'assignments': 0}


class TestTheCoursesAClassInherits:
    """Courses are a live link, not a copy: a course carries no per-section
    state, so there is nothing to go stale and fixing the library fixes every
    class at once."""

    def _course_tables(self, **over):
        base = {
            'sis_curriculum_classes': [{'curriculum_id': CURR}],
            'sis_curriculum': [{'id': CURR, 'title': 'Reading Workshop'}],
            'sis_curriculum_courses': [{'curriculum_id': CURR, 'course_id': COURSE1,
                                        'sequence_order': 0}],
            'courses': [{'id': COURSE1, 'title': 'Poetry', 'status': 'published'}],
        }
        base.update(over)
        return base

    def test_a_published_course_reaches_the_student(self):
        out = curriculum_courses_for_class(_client(self._course_tables(), []), CLASS_A)
        assert [c['id'] for c in out] == [COURSE1]
        assert out[0]['curriculum_title'] == 'Reading Workshop'

    def test_a_draft_course_is_hidden_from_students_and_shown_to_staff(self):
        tables = self._course_tables(
            courses=[{'id': COURSE1, 'title': 'Poetry', 'status': 'draft'}])
        assert curriculum_courses_for_class(_client(tables, []), CLASS_A) == []
        staff = curriculum_courses_for_class(_client(tables, []), CLASS_A,
                                             published_only=False)
        assert [c['id'] for c in staff] == [COURSE1]

    def test_a_class_on_no_curriculum_gets_nothing(self):
        tables = self._course_tables(sis_curriculum_classes=[])
        assert curriculum_courses_for_class(_client(tables, []), CLASS_A) == []

    def test_an_archived_curriculum_stops_teaching(self):
        """sis_curriculum is filtered to is_active, so an archived entry returns
        no row and its courses drop out with it."""
        tables = self._course_tables(sis_curriculum=[])
        assert curriculum_courses_for_class(_client(tables, []), CLASS_A) == []

    def test_a_link_that_outlived_its_course_is_dropped_not_rendered_blank(self):
        tables = self._course_tables(courses=[])
        assert curriculum_courses_for_class(_client(tables, []), CLASS_A) == []

    def test_one_course_on_two_curricula_is_listed_once(self):
        """A class can carry two curricula that share a course; a student should
        see it once, not twice."""
        tables = self._course_tables(
            sis_curriculum_classes=[{'curriculum_id': CURR}, {'curriculum_id': CURR2}],
            sis_curriculum=[{'id': CURR, 'title': 'A'}, {'id': CURR2, 'title': 'B'}],
            sis_curriculum_courses=[
                {'curriculum_id': CURR, 'course_id': COURSE1, 'sequence_order': 0},
                {'curriculum_id': CURR2, 'course_id': COURSE1, 'sequence_order': 0},
                {'curriculum_id': CURR2, 'course_id': COURSE2, 'sequence_order': 1},
            ],
            courses=[{'id': COURSE1, 'title': 'Poetry', 'status': 'published'},
                     {'id': COURSE2, 'title': 'Essays', 'status': 'published'}],
        )
        out = curriculum_courses_for_class(_client(tables, []), CLASS_A)
        assert [c['id'] for c in out] == [COURSE1, COURSE2]
