"""
Route tests for the curriculum API.

Covers GET curriculum, lesson CRUD, reorder, and progress.

These routes moved: what used to be a single ``routes/curriculum_routes.py``
with a module-level ``curriculum_service`` singleton is now the
``routes/curriculum/`` package (core / lessons / progress / tasks /
attachments / catalog), and each handler constructs its service per request. So
the service is patched by CLASS in the module that uses it, and the URLs carry a
``/curriculum`` segment they did not before -- ``/api/quests/<id>/curriculum/lessons``,
not ``/api/quests/<id>/lessons``. Reorder is a PUT.

Every handler sits behind @require_auth, so authenticated cases take the
``mock_verify_token`` fixture; without it the client gets a 401 and the
assertion under test never runs.
"""

import json
from unittest.mock import Mock, patch

import pytest


QUEST_ID = 'quest-123'
LESSON_ID = 'lesson-123'

# _check_edit_permission returns the quest row plus the caller's org and role,
# which the handlers read to decide what may be edited.
EDIT_PERMISSION_OK = {
    'id': QUEST_ID,
    'organization_id': 'org-1',
    '_user_org': 'org-1',
    '_user_role': 'advisor',
}


@pytest.fixture
def allow_edit():
    """Grant curriculum edit permission for the quest under test.

    Both the quest-level and lesson-level checks are patched: they query the
    database through CurriculumPermissionService, so without this every handler
    fails its permission check before the code under test runs.
    """
    with patch('routes.curriculum.lessons._check_edit_permission',
               return_value=EDIT_PERMISSION_OK) as m, \
         patch('routes.curriculum.lessons._check_lesson_edit_permission',
               return_value=EDIT_PERMISSION_OK):
        yield m


@pytest.fixture
def allow_read():
    """Grant curriculum read permission (core + progress + lessons list)."""
    with patch('routes.curriculum.core._check_read_permission', return_value=True), \
         patch('routes.curriculum.progress._check_read_permission', return_value=True), \
         patch('routes.curriculum.lessons._check_read_permission', return_value=True):
        yield


@pytest.mark.unit
class TestGetCurriculum:
    """GET /api/quests/<id>/curriculum"""

    def test_get_curriculum_success(self, client, auth_headers, mock_verify_token, allow_read):
        with patch('routes.curriculum.core.CurriculumService') as mock_cls:
            mock_cls.return_value.get_curriculum.return_value = {
                'quest': {'id': QUEST_ID, 'title': 'Test Quest'},
                'curriculum_content': '<p>Lesson body</p>',
            }
            mock_cls.return_value.get_attachments.return_value = []

            response = client.get(
                f'/api/quests/{QUEST_ID}/curriculum',
                headers=auth_headers,
            )

            assert response.status_code == 200
            data = json.loads(response.data)
            assert data['success'] is True
            assert data['curriculum_content'] == '<p>Lesson body</p>'

    def test_get_curriculum_unauthorized(self, client):
        response = client.get(f'/api/quests/{QUEST_ID}/curriculum')

        assert response.status_code == 401

    def test_get_curriculum_error_does_not_leak_detail(self, client, auth_headers, mock_verify_token, allow_read):
        """An unexpected failure returns a generic 500, not the exception text."""
        with patch('routes.curriculum.core.CurriculumService') as mock_cls:
            mock_cls.return_value.get_curriculum.side_effect = Exception('boom')

            response = client.get(
                '/api/quests/quest-999/curriculum',
                headers=auth_headers,
            )

            assert response.status_code == 500
            assert 'boom' not in response.get_data(as_text=True)


@pytest.mark.unit
class TestCreateLesson:
    """POST /api/quests/<id>/curriculum/lessons"""

    def test_create_lesson_success(self, client, auth_headers, mock_verify_token, allow_edit):
        with patch('routes.curriculum.lessons.CurriculumLessonService') as mock_cls:
            mock_cls.return_value.create_lesson.return_value = {
                'id': LESSON_ID,
                'title': 'New Lesson',
                'lesson_type': 'text',
                'order_index': 0,
            }

            response = client.post(
                f'/api/quests/{QUEST_ID}/curriculum/lessons',
                headers=auth_headers,
                json={'title': 'New Lesson', 'content': '<p>Body</p>', 'lesson_type': 'text'},
            )

            assert response.status_code == 201
            data = json.loads(response.data)
            assert data['lesson']['title'] == 'New Lesson'

    def test_create_lesson_requires_title(self, client, auth_headers, mock_verify_token, allow_edit):
        with patch('routes.curriculum.lessons.CurriculumLessonService'):
            response = client.post(
                f'/api/quests/{QUEST_ID}/curriculum/lessons',
                headers=auth_headers,
                json={'content': '<p>No title</p>'},
            )

            assert response.status_code == 400
            assert 'Title is required' in response.get_data(as_text=True)

    def test_create_lesson_requires_body(self, client, auth_headers, mock_verify_token, allow_edit):
        with patch('routes.curriculum.lessons.CurriculumLessonService'):
            response = client.post(
                f'/api/quests/{QUEST_ID}/curriculum/lessons',
                headers=auth_headers,
                json={},
            )

            assert response.status_code == 400

    def test_create_lesson_rejects_disallowed_iframe(self, client, auth_headers,
                                                     mock_verify_token, allow_edit):
        """Iframe validation failures surface as a 400, not a 500."""
        from middleware.error_handler import ValidationError

        with patch('routes.curriculum.lessons.CurriculumLessonService') as mock_cls:
            mock_cls.return_value.create_lesson.side_effect = ValidationError(
                'Iframe URL domain not allowed: https://evil.com/x'
            )

            response = client.post(
                f'/api/quests/{QUEST_ID}/curriculum/lessons',
                headers=auth_headers,
                json={'title': 'Bad embed',
                      'content': '<iframe src="https://evil.com/x"></iframe>'},
            )

            assert response.status_code == 400
            assert 'not allowed' in response.get_data(as_text=True)

    def test_create_lesson_unauthorized(self, client):
        response = client.post(
            f'/api/quests/{QUEST_ID}/curriculum/lessons',
            json={'title': 'New Lesson'},
        )

        assert response.status_code == 401


@pytest.mark.unit
class TestUpdateLesson:
    """PUT /api/quests/<id>/curriculum/lessons/<lesson_id>"""

    def test_update_lesson_success(self, client, auth_headers, mock_verify_token, allow_edit):
        with patch('routes.curriculum.lessons.CurriculumLessonService') as mock_cls:
            mock_cls.return_value.update_lesson.return_value = {
                'id': LESSON_ID,
                'title': 'Updated Title',
            }

            response = client.put(
                f'/api/quests/{QUEST_ID}/curriculum/lessons/{LESSON_ID}',
                headers=auth_headers,
                json={'title': 'Updated Title'},
            )

            assert response.status_code == 200
            data = json.loads(response.data)
            assert data['lesson']['title'] == 'Updated Title'

    def test_update_lesson_requires_body(self, client, auth_headers, mock_verify_token, allow_edit):
        with patch('routes.curriculum.lessons.CurriculumLessonService'):
            response = client.put(
                f'/api/quests/{QUEST_ID}/curriculum/lessons/{LESSON_ID}',
                headers=auth_headers,
                json={},
            )

            assert response.status_code == 400


@pytest.mark.unit
class TestDeleteLesson:
    """DELETE /api/quests/<id>/curriculum/lessons/<lesson_id>"""

    def test_delete_lesson_success(self, client, auth_headers, mock_verify_token, allow_edit):
        with patch('routes.curriculum.lessons.CurriculumLessonService') as mock_cls:
            mock_cls.return_value.delete_lesson.return_value = True

            response = client.delete(
                f'/api/quests/{QUEST_ID}/curriculum/lessons/{LESSON_ID}',
                headers=auth_headers,
            )

            assert response.status_code == 200
            mock_cls.return_value.delete_lesson.assert_called_once_with(LESSON_ID, QUEST_ID)

    def test_delete_lesson_not_found(self, client, auth_headers, mock_verify_token, allow_edit):
        from middleware.error_handler import NotFoundError

        with patch('routes.curriculum.lessons.CurriculumLessonService') as mock_cls:
            mock_cls.return_value.delete_lesson.side_effect = NotFoundError('Lesson not found')

            response = client.delete(
                f'/api/quests/{QUEST_ID}/curriculum/lessons/missing',
                headers=auth_headers,
            )

            assert response.status_code in (400, 404)


@pytest.mark.unit
class TestReorderLessons:
    """PUT /api/quests/<id>/curriculum/lessons/reorder"""

    def test_reorder_lessons_success(self, client, auth_headers, mock_verify_token):
        # Superadmin skips the per-lesson organization check, keeping this test
        # about ordering rather than about org ownership.
        superadmin_quest = dict(EDIT_PERMISSION_OK, _user_role='superadmin')

        with patch('routes.curriculum.lessons._check_edit_permission',
                   return_value=superadmin_quest), \
             patch('routes.curriculum.lessons.CurriculumLessonService') as mock_cls:
            mock_cls.return_value.reorder_lessons.return_value = [
                {'id': 'lesson-2', 'order_index': 0},
                {'id': 'lesson-1', 'order_index': 1},
            ]

            response = client.put(
                f'/api/quests/{QUEST_ID}/curriculum/lessons/reorder',
                headers=auth_headers,
                json={'lesson_order': ['lesson-2', 'lesson-1']},
            )

            assert response.status_code == 200
            data = json.loads(response.data)
            assert data['lessons'][0]['id'] == 'lesson-2'

    def test_reorder_requires_lesson_order(self, client, auth_headers, mock_verify_token, allow_edit):
        with patch('routes.curriculum.lessons.CurriculumLessonService'):
            response = client.put(
                f'/api/quests/{QUEST_ID}/curriculum/lessons/reorder',
                headers=auth_headers,
                json={},
            )

            assert response.status_code == 400
            assert 'lesson_order' in response.get_data(as_text=True)

    def test_reorder_rejects_non_array(self, client, auth_headers, mock_verify_token, allow_edit):
        with patch('routes.curriculum.lessons.CurriculumLessonService'):
            response = client.put(
                f'/api/quests/{QUEST_ID}/curriculum/lessons/reorder',
                headers=auth_headers,
                json={'lesson_order': 'lesson-1'},
            )

            assert response.status_code == 400


@pytest.mark.unit
class TestLessonProgress:
    """GET/POST /api/quests/<id>/curriculum/progress"""

    def test_mark_progress_success(self, client, auth_headers, mock_verify_token, allow_read):
        user_row = Mock()
        user_row.data = {'organization_id': 'org-1'}
        admin = Mock()
        admin.table.return_value.select.return_value.eq.return_value \
            .single.return_value.execute.return_value = user_row

        with patch('routes.curriculum.progress.get_supabase_admin_client', return_value=admin), \
             patch('routes.curriculum.progress.CurriculumLessonService') as mock_cls:
            mock_cls.return_value.update_lesson_progress.return_value = {
                'lesson_id': LESSON_ID,
                'status': 'completed',
            }

            response = client.post(
                f'/api/quests/{QUEST_ID}/curriculum/progress/{LESSON_ID}',
                headers=auth_headers,
                json={'status': 'completed'},
            )

            assert response.status_code == 200
            data = json.loads(response.data)
            assert data['progress']['status'] == 'completed'

    def test_mark_progress_unauthorized(self, client):
        response = client.post(
            f'/api/quests/{QUEST_ID}/curriculum/progress/{LESSON_ID}',
            json={'status': 'completed'},
        )

        assert response.status_code == 401

    def test_get_progress_success(self, client, auth_headers, mock_verify_token, allow_read):
        with patch('routes.curriculum.progress.CurriculumLessonService') as mock_cls:
            mock_cls.return_value.get_lesson_progress.return_value = [
                {'lesson_id': LESSON_ID, 'status': 'completed'},
            ]

            response = client.get(
                f'/api/quests/{QUEST_ID}/curriculum/progress',
                headers=auth_headers,
            )

            assert response.status_code == 200
            data = json.loads(response.data)
            assert data['progress'][0]['lesson_id'] == LESSON_ID
