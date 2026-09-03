"""
A named assistant instructor teaches the class, on every tab of it.

sis_service.advisor_class_ids counts assistant_instructor_ids, so the class is
already in the assistant's My Classes, their weekly schedule, and their roster.
Three separate per-class gates then decide what the class PAGE will answer, and
two of them only knew about primary_instructor_id and class_advisors:

    routes/sis/class_quests.py   _is_moderator   knew (fixed 2026-08-04)
    routes/sis/curriculum.py     _class_access   did not
    routes/sis/class_materials.py _access        did not

So the assistant opened a class they teach, the roster loaded, and the
Curriculum tab 403'd on both of its panes — Sentry OPTIO-WEB-3/E, one assistant
reloading the same class four times in forty minutes.

The three gates are pinned together here because that is the bug: the same
question, answered three times, in three files.
"""

from unittest.mock import Mock, patch

import pytest

import routes.sis.class_materials as materials
import routes.sis.class_quests as quests
import routes.sis.curriculum as curriculum


ORG = '11111111-1111-4111-8111-111111111111'
CLASS = '66666666-6666-4666-8666-666666666666'
PRIMARY = '77777777-7777-4777-8777-777777777777'
ASSISTANT = '99999999-9999-4999-8999-999999999999'
OUTSIDER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

CLASS_ROW = {
    'id': CLASS,
    'organization_id': ORG,
    'name': 'Elementary Microschool C',
    'status': 'active',
    'primary_instructor_id': PRIMARY,
    'assistant_instructor_ids': [ASSISTANT],
}


class _FakeTable:
    """Answers whatever `rows` says for this table name; ignores the filters."""

    def __init__(self, rows):
        self._rows = rows

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        return Mock(data=self._rows)


def _client(**tables):
    client = Mock()
    client.table.side_effect = lambda name: _FakeTable(tables.get(name, []))
    return client


@pytest.fixture
def not_admin():
    """Every caller here is a teacher, never an org admin."""
    with patch.object(curriculum.sis_service, 'caller_is_admin', return_value=False), \
         patch.object(materials.sis_service, 'caller_is_admin', return_value=False), \
         patch.object(quests.sis_service, 'caller_is_admin', return_value=False):
        yield


# ── curriculum: the staff-only "Your curriculum" pane ────────────────────────

@pytest.mark.parametrize('user_id, expected', [
    (PRIMARY, True),
    (ASSISTANT, True),
    (OUTSIDER, False),
])
def test_class_access_counts_the_assistant(not_admin, user_id, expected):
    client = _client(org_classes=[CLASS_ROW], class_advisors=[])
    with patch.object(curriculum, '_admin', return_value=client):
        class_row, is_teacher, is_admin = curriculum._class_access(user_id, CLASS)
    assert class_row is not None
    assert is_admin is False
    assert is_teacher is expected


def test_class_access_still_reads_co_teachers(not_admin):
    """The class_advisors path is unchanged by the assistant check."""
    client = _client(org_classes=[CLASS_ROW], class_advisors=[{'id': 'link'}])
    with patch.object(curriculum, '_admin', return_value=client):
        _, is_teacher, _ = curriculum._class_access(OUTSIDER, CLASS)
    assert is_teacher is True


# ── materials: the pane students see, shared with the class ──────────────────

@pytest.mark.parametrize('user_id, allowed, moderator', [
    (PRIMARY, True, True),
    (ASSISTANT, True, True),
    (OUTSIDER, False, False),
])
def test_materials_access_counts_the_assistant(not_admin, user_id, allowed, moderator):
    admin = _client(class_advisors=[], class_enrollments=[])
    assert materials._access(user_id, CLASS_ROW, admin) == (allowed, moderator)


def test_materials_still_reads_enrolled_students(not_admin):
    """An enrolled student reads but does not moderate."""
    admin = _client(class_advisors=[], class_enrollments=[{'id': 'enrollment'}])
    assert materials._access(OUTSIDER, CLASS_ROW, admin) == (True, False)


# ── quests: already correct in 2026-08-04; pinned so it stays that way ───────

@pytest.mark.parametrize('user_id, expected', [
    (PRIMARY, True),
    (ASSISTANT, True),
    (OUTSIDER, False),
])
def test_quests_moderator_counts_the_assistant(not_admin, user_id, expected):
    admin = _client(class_advisors=[])
    assert quests._is_moderator(user_id, CLASS_ROW, admin) is expected


# ── the row each gate loads has to carry the column it now reads ─────────────

def test_class_rows_are_loaded_with_assistant_instructor_ids():
    """A gate that checks a column the SELECT omits is a gate that never fires."""
    for module, loader in (
        (materials, materials._load_org_class),
        (quests, quests._load_org_class),
    ):
        admin = Mock()
        table = Mock()
        table.select.return_value = table
        table.eq.return_value = table
        table.limit.return_value = table
        table.execute.return_value = Mock(data=[CLASS_ROW])
        admin.table.return_value = table
        loader(admin, CLASS)
        assert 'assistant_instructor_ids' in table.select.call_args[0][0], module.__name__

    client = _client(org_classes=[CLASS_ROW], class_advisors=[])
    selects = []
    original = _FakeTable.select

    def record(self, *a, **k):
        selects.append(a[0] if a else '')
        return original(self, *a, **k)

    with patch.object(_FakeTable, 'select', record), \
         patch.object(curriculum.sis_service, 'caller_is_admin', return_value=False), \
         patch.object(curriculum, '_admin', return_value=client):
        curriculum._class_access(ASSISTANT, CLASS)
    assert any('assistant_instructor_ids' in s for s in selects)
