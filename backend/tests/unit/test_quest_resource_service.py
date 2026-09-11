"""Files, links and videos attached to a quest and to its individual tasks.

There was nowhere to put them. A quest carried `material_link` -- one free-text
URL rendered as a single anchor -- and a task carried nothing, so a teacher with
a worksheet for step 3 and a demo video for step 5 pasted both into a task
description or put them on the class, where they land in one undifferentiated
list with no way to say which task they are for.

Two rules here are security, not preference, and both are pinned below: only
http(s) URLs are stored, and an uploaded file's row holds the canonical pointer
rather than a signed URL that expires.
"""

from unittest.mock import Mock, patch

import pytest

from services import quest_resource_service as svc

QUEST = {'id': 'quest-1', 'organization_id': 'org-1'}
LIBRARY_QUEST = {'id': 'quest-2', 'organization_id': None}
TEACHER = 'ada'
TASK = 'task-1'


class _Repo:
    """A stand-in for QuestResourceRepository that records what it was asked."""

    def __init__(self, rows=None, tasks=(QUEST['id'], TASK), next_order=0):
        self.rows = list(rows or [])
        self._tasks = tasks
        self._next_order = next_order
        self.created = []
        self.created_many = []
        self.deleted = []
        self.reordered = []

    def list_for_quest(self, _quest_id):
        return list(self.rows)

    def list_for_copy(self, _quest_id):
        return list(self.rows)

    def next_sort_order(self, _quest_id, _task_id):
        return self._next_order

    def ids_in_scope(self, _quest_id, _task_id):
        return {r['id'] for r in self.rows}

    def task_belongs_to_quest(self, quest_id, task_id):
        return (quest_id, task_id) == self._tasks

    def create(self, row):
        self.created.append(row)
        return {'id': 'new-1', **row}

    def create_many(self, rows):
        self.created_many.extend(rows)
        return len(rows)

    def find_in_quest(self, _quest_id, resource_id):
        return next((r for r in self.rows if r['id'] == resource_id), None)

    def delete_by_id(self, resource_id):
        self.deleted.append(resource_id)

    def set_sort_order(self, resource_id, position):
        self.reordered.append((resource_id, position))


def _with(repo, admin=None):
    return patch.object(svc, '_repo', return_value=repo)


@pytest.mark.unit
class TestOnlySafeUrlsAreStored:
    """javascript: and data: URLs would be handed straight to a student's
    browser as an href."""

    @pytest.mark.parametrize('url', [
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'file:///etc/passwd',
        'not a url at all',
        '',
    ])
    def test_a_dangerous_or_malformed_url_is_refused(self, url):
        repo = _Repo()
        with _with(repo):
            with pytest.raises(ValueError):
                svc.add_link(QUEST, task_id=None, kind='link', title='x',
                             url=url, user_id=TEACHER)
        assert repo.created == []

    @pytest.mark.parametrize('url', ['http://example.com/a.pdf',
                                     'https://example.com/a.pdf'])
    def test_an_http_url_is_kept(self, url):
        repo = _Repo()
        with _with(repo):
            svc.add_link(QUEST, task_id=None, kind='link', title='Worksheet',
                         url=url, user_id=TEACHER)
        assert repo.created[0]['url'] == url

    def test_there_is_no_embed_html_field(self):
        """Storing markup a school pastes in and rendering it back to students
        is a stored-XSS hole in a page children open. A video is a URL."""
        repo = _Repo()
        with _with(repo):
            svc.add_link(QUEST, task_id=None, kind='video', title='Demo',
                         url='https://youtube.com/watch?v=x', user_id=TEACHER)
        assert 'embed_html' not in repo.created[0]


@pytest.mark.unit
class TestAttaching:
    def test_a_resource_can_belong_to_the_quest_itself(self):
        repo = _Repo()
        with _with(repo):
            svc.add_link(QUEST, task_id=None, kind='link', title='Syllabus',
                         url='https://example.com', user_id=TEACHER)
        assert repo.created[0]['task_id'] is None

    def test_a_resource_can_belong_to_one_task(self):
        repo = _Repo()
        with _with(repo):
            svc.add_link(QUEST, task_id=TASK, kind='link', title='Step 3',
                         url='https://example.com', user_id=TEACHER)
        assert repo.created[0]['task_id'] == TASK

    def test_a_task_from_another_quest_is_refused(self):
        repo = _Repo(tasks=('some-other-quest', TASK))
        with _with(repo):
            with pytest.raises(ValueError, match='not part of this quest'):
                svc.add_link(QUEST, task_id=TASK, kind='link', title='x',
                             url='https://example.com', user_id=TEACHER)

    def test_an_unknown_kind_is_refused(self):
        repo = _Repo()
        with _with(repo):
            with pytest.raises(ValueError, match='link'):
                svc.add_link(QUEST, task_id=None, kind='embed', title='x',
                             url='https://example.com', user_id=TEACHER)

    def test_a_missing_title_falls_back_to_the_host(self):
        repo = _Repo()
        with _with(repo):
            svc.add_link(QUEST, task_id=None, kind='link', title='  ',
                         url='https://khanacademy.org/x', user_id=TEACHER)
        assert repo.created[0]['title'] == 'khanacademy.org'

    def test_a_long_title_is_truncated(self):
        repo = _Repo()
        with _with(repo):
            svc.add_link(QUEST, task_id=None, kind='link', title='x' * 500,
                         url='https://example.com', user_id=TEACHER)
        assert len(repo.created[0]['title']) <= 300

    def test_it_goes_on_the_end(self):
        repo = _Repo(next_order=7)
        with _with(repo):
            svc.add_link(QUEST, task_id=None, kind='link', title='x',
                         url='https://example.com', user_id=TEACHER)
        assert repo.created[0]['sort_order'] == 7


@pytest.mark.unit
class TestReading:
    def test_it_groups_by_task(self):
        repo = _Repo(rows=[
            {'id': 'r1', 'task_id': None, 'url': 'https://a'},
            {'id': 'r2', 'task_id': TASK, 'url': 'https://b'},
            {'id': 'r3', 'task_id': TASK, 'url': 'https://c'},
        ])
        with _with(repo), patch.object(svc, 'sign_in_place'):
            out = svc.list_for_quest(QUEST['id'])
        assert [r['id'] for r in out['quest']] == ['r1']
        assert [r['id'] for r in out['by_task'][TASK]] == ['r2', 'r3']

    def test_every_file_is_signed_in_one_call(self):
        """A quest with a resource on each of twelve tasks would otherwise be
        twelve storage round trips on a page load."""
        repo = _Repo(rows=[{'id': f'r{i}', 'task_id': TASK, 'url': 'x'}
                           for i in range(12)])
        with _with(repo), patch.object(svc, 'sign_in_place') as sign:
            svc.list_for_quest(QUEST['id'])
        assert sign.call_count == 1
        assert len(sign.call_args[0][0]) == 12

    def test_nothing_attached_is_an_empty_answer_not_an_error(self):
        with _with(_Repo()), patch.object(svc, 'sign_in_place'):
            assert svc.list_for_quest(QUEST['id']) == {'quest': [], 'by_task': {}}


@pytest.mark.unit
class TestRemoving:
    def test_a_link_is_just_deleted(self):
        repo = _Repo(rows=[{'id': 'r1', 'file_path': None}])
        admin = Mock()
        with _with(repo), patch.object(svc, '_admin', return_value=admin):
            assert svc.remove(QUEST['id'], 'r1') is True
        assert repo.deleted == ['r1']
        admin.storage.from_.assert_not_called()

    def test_a_file_is_deleted_from_storage_too(self):
        repo = _Repo(rows=[{'id': 'r1', 'file_path': 'org-1/quest-resources/x.pdf'}])
        admin = Mock()
        with _with(repo), patch.object(svc, '_admin', return_value=admin):
            svc.remove(QUEST['id'], 'r1')
        admin.storage.from_.return_value.remove.assert_called_once_with(
            ['org-1/quest-resources/x.pdf'])

    def test_a_storage_failure_still_removes_the_row(self):
        """The row is gone either way. An orphaned object costs storage; a
        rollback would leave the teacher staring at a resource they removed."""
        repo = _Repo(rows=[{'id': 'r1', 'file_path': 'x.pdf'}])
        admin = Mock()
        admin.storage.from_.return_value.remove.side_effect = RuntimeError('boom')
        with _with(repo), patch.object(svc, '_admin', return_value=admin):
            assert svc.remove(QUEST['id'], 'r1') is True
        assert repo.deleted == ['r1']

    def test_a_resource_from_another_quest_is_not_found(self):
        with _with(_Repo(rows=[])), patch.object(svc, '_admin'):
            assert svc.remove(QUEST['id'], 'somebody-elses') is False


@pytest.mark.unit
class TestReordering:
    def test_it_writes_the_new_positions(self):
        repo = _Repo(rows=[{'id': 'r1'}, {'id': 'r2'}])
        with _with(repo):
            assert svc.reorder(QUEST['id'], None, ['r2', 'r1']) == 2
        assert repo.reordered == [('r2', 0), ('r1', 1)]

    def test_an_id_outside_the_scope_is_ignored(self):
        """A posted id from another quest or another task must not be movable
        by naming it."""
        repo = _Repo(rows=[{'id': 'r1'}])
        with _with(repo):
            assert svc.reorder(QUEST['id'], None, ['r1', 'someone-elses']) == 1
        assert repo.reordered == [('r1', 0)]


@pytest.mark.unit
class TestCopyingToADuplicate:
    def test_a_task_resource_follows_its_task(self):
        repo = _Repo(rows=[{'task_id': 'old-task', 'kind': 'link',
                            'title': 'Worksheet', 'url': 'https://a', 'sort_order': 0}])
        with _with(repo):
            svc.copy_for_quest('quest-1', 'quest-copy', {'old-task': 'new-task'},
                               'org-1', TEACHER)
        assert repo.created_many[0]['task_id'] == 'new-task'
        assert repo.created_many[0]['quest_id'] == 'quest-copy'

    def test_a_quest_resource_stays_on_the_quest(self):
        repo = _Repo(rows=[{'task_id': None, 'kind': 'link', 'title': 'x',
                            'url': 'https://a', 'sort_order': 0}])
        with _with(repo):
            svc.copy_for_quest('quest-1', 'quest-copy', {}, 'org-1', TEACHER)
        assert repo.created_many[0]['task_id'] is None

    def test_a_resource_whose_task_did_not_copy_is_dropped(self):
        """Landing a step-3 worksheet in the quest intro is worse than losing
        it -- nobody would notice it had moved."""
        repo = _Repo(rows=[{'task_id': 'vanished', 'kind': 'link', 'title': 'x',
                            'url': 'https://a', 'sort_order': 0}])
        with _with(repo):
            assert svc.copy_for_quest('quest-1', 'quest-copy', {}, 'org-1', TEACHER) == 0
        assert repo.created_many == []

    def test_a_copied_file_shares_the_object_rather_than_owning_it(self):
        """file_path NULL on the copy, so deleting the copy's resource can never
        remove the original's file."""
        repo = _Repo(rows=[{'task_id': None, 'kind': 'file', 'title': 'x',
                            'url': 'https://storage/a.pdf', 'sort_order': 0}])
        with _with(repo):
            svc.copy_for_quest('quest-1', 'quest-copy', {}, 'org-1', TEACHER)
        assert repo.created_many[0]['file_path'] is None
        assert repo.created_many[0]['url'] == 'https://storage/a.pdf'


@pytest.mark.unit
class TestWhoMayEdit:
    def _admin_seeing(self, class_rows):
        admin = Mock()
        table = Mock()
        admin.table.return_value = table
        for chained in ('select', 'eq', 'limit'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=class_rows)
        return admin

    def test_an_org_admin_of_this_org_may(self):
        with patch('services.sis_service.caller_is_admin', return_value=True), \
                patch('services.sis_service.resolve_org_id', return_value='org-1'):
            assert svc.can_edit_quest('kate', QUEST, admin=Mock()) is True

    def test_an_admin_of_another_org_may_not(self):
        with patch('services.sis_service.caller_is_admin', return_value=True), \
                patch('services.sis_service.resolve_org_id', return_value='org-2'):
            assert svc.can_edit_quest('kate', QUEST, admin=Mock()) is False

    def test_a_teacher_of_a_class_using_the_quest_may(self):
        """Attaching a worksheet to a task is the same act as writing the task,
        so it is the same gate class_quests.py applies."""
        admin = self._admin_seeing([{'class_id': 'c1'}])
        with patch('services.sis_service.caller_is_admin', return_value=False), \
                patch('utils.class_membership.class_teacher_ids', return_value={TEACHER}):
            assert svc.can_edit_quest(TEACHER, QUEST, admin=admin) is True

    def test_an_unrelated_teacher_may_not(self):
        admin = self._admin_seeing([{'class_id': 'c1'}])
        with patch('services.sis_service.caller_is_admin', return_value=False), \
                patch('utils.class_membership.class_teacher_ids', return_value={'someone'}):
            assert svc.can_edit_quest(TEACHER, QUEST, admin=admin) is False

    def test_a_quest_on_no_class_is_not_editable_by_a_teacher(self):
        admin = self._admin_seeing([])
        with patch('services.sis_service.caller_is_admin', return_value=False):
            assert svc.can_edit_quest(TEACHER, QUEST, admin=admin) is False

    def test_nobody_may_attach_to_a_library_quest(self):
        """Library quests are shared across every school. One school's teacher
        attaching their handout would put it in front of all of them."""
        with patch('services.sis_service.caller_is_admin', return_value=True):
            assert svc.can_edit_quest('kate', LIBRARY_QUEST, admin=Mock()) is False
