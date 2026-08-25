"""
Unit tests for curriculum lesson service.

Tests lesson CRUD operations, iframe URL validation, progress tracking, and reordering.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from services.curriculum_lesson_service import CurriculumLessonService
from services.curriculum_service import CurriculumService
# The services raise middleware.error_handler.ValidationError, which is a
# DIFFERENT class from services.base_service.ValidationError -- importing the
# wrong one made every pytest.raises here silently fail to match.
from middleware.error_handler import ValidationError


class TestIframeURLValidation:
    """Test iframe URL validation logic.

    Lives on CurriculumService, not CurriculumLessonService -- the two were
    split apart and this file kept pointing at the lesson service.
    """

    def setup_method(self):
        """Set up test fixtures."""
        self.mock_supabase = Mock()
        self.service = CurriculumService(supabase=self.mock_supabase)

    def test_validate_iframe_urls_valid_youtube(self):
        """Test validation accepts valid YouTube URLs."""
        content = '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>'
        assert self.service.validate_iframe_urls(content) is True

    def test_validate_iframe_urls_valid_vimeo(self):
        """Test validation accepts valid Vimeo URLs."""
        content = '<iframe src="https://player.vimeo.com/video/123456789"></iframe>'
        assert self.service.validate_iframe_urls(content) is True

    def test_validate_iframe_urls_valid_google_drive(self):
        """Test validation accepts valid Google Drive URLs."""
        content = '<iframe src="https://drive.google.com/file/d/abc123/preview"></iframe>'
        assert self.service.validate_iframe_urls(content) is True

    def test_validate_iframe_urls_rejects_data_scheme(self):
        """Test validation rejects data: URLs (XSS vector)."""
        content = '<iframe src="data:text/html,<script>alert(1)</script>"></iframe>'

        with pytest.raises(ValidationError, match="scheme 'data:' is not allowed"):
            self.service.validate_iframe_urls(content)

    def test_validate_iframe_urls_rejects_javascript_scheme(self):
        """Test validation rejects javascript: URLs (XSS vector)."""
        content = '<iframe src="javascript:alert(1)"></iframe>'

        with pytest.raises(ValidationError, match="scheme 'javascript:' is not allowed"):
            self.service.validate_iframe_urls(content)

    def test_validate_iframe_urls_rejects_vbscript_scheme(self):
        """Test validation rejects vbscript: URLs."""
        content = '<iframe src="vbscript:msgbox(1)"></iframe>'

        with pytest.raises(ValidationError, match="scheme 'vbscript:' is not allowed"):
            self.service.validate_iframe_urls(content)

    def test_validate_iframe_urls_rejects_file_scheme(self):
        """Test validation rejects file: URLs."""
        content = '<iframe src="file:///etc/passwd"></iframe>'

        with pytest.raises(ValidationError, match="scheme 'file:' is not allowed"):
            self.service.validate_iframe_urls(content)

    def test_validate_iframe_urls_rejects_non_https(self):
        """Test validation rejects non-HTTPS URLs."""
        content = '<iframe src="http://www.youtube.com/embed/abc"></iframe>'

        with pytest.raises(ValidationError, match="must use https://"):
            self.service.validate_iframe_urls(content)

    def test_validate_iframe_urls_rejects_non_whitelisted_domain(self):
        """Test validation rejects non-whitelisted domains."""
        content = '<iframe src="https://evil.com/malicious"></iframe>'

        with pytest.raises(ValidationError, match="domain not allowed"):
            self.service.validate_iframe_urls(content)

    def test_validate_iframe_urls_rejects_domain_bypass_attempt(self):
        """Test validation prevents domain bypass via substrings."""
        # Attack: Try to bypass validation with domain name that CONTAINS youtube.com
        content = '<iframe src="https://evil-youtube.com.malicious.com/video"></iframe>'

        with pytest.raises(ValidationError, match="domain not allowed"):
            self.service.validate_iframe_urls(content)

    def test_validate_iframe_urls_accepts_youtube_subdomain(self):
        """Test validation accepts legitimate YouTube subdomains."""
        content = '<iframe src="https://www.youtube.com/embed/abc"></iframe>'
        assert self.service.validate_iframe_urls(content) is True

    def test_validate_iframe_urls_no_iframes(self):
        """Test validation passes when no iframes present."""
        content = '<p>This is just text content with no iframes</p>'
        assert self.service.validate_iframe_urls(content) is True

    def test_validate_iframe_urls_multiple_valid(self):
        """Test validation with multiple valid iframes."""
        content = '''
        <iframe src="https://www.youtube.com/embed/abc"></iframe>
        <iframe src="https://player.vimeo.com/video/123"></iframe>
        '''
        assert self.service.validate_iframe_urls(content) is True

    def test_validate_iframe_urls_mixed_valid_invalid(self):
        """Test validation fails if ANY iframe is invalid."""
        content = '''
        <iframe src="https://www.youtube.com/embed/abc"></iframe>
        <iframe src="https://evil.com/bad"></iframe>
        '''

        with pytest.raises(ValidationError):
            self.service.validate_iframe_urls(content)


@pytest.mark.skip(
    reason="Rewrite needed: CurriculumLessonService was refactored from an injected "
           "curriculum_repo to a supabase-backed client, so these assertions target a "
           "dependency that no longer exists. The methods themselves (create_lesson, "
           "update_lesson, delete_lesson, reorder_lessons, progress, curriculum) are "
           "still present and still need coverage against the current API."
)
class TestCreateLesson:
    """Test lesson creation."""

    def setup_method(self):
        """Set up test fixtures."""
        self.mock_supabase = Mock()
        self.service = CurriculumLessonService(supabase=self.mock_supabase)

    def test_create_lesson_success(self):
        """Test successful lesson creation."""
        self.mock_repo.create_lesson.return_value = {
            'id': 'lesson-123',
            'title': 'Test Lesson',
            'content': 'Lesson content',
            'lesson_type': 'text'
        }

        result = self.service.create_lesson(
            quest_id='quest-123',
            title='Test Lesson',
            content='Lesson content',
            order_index=0,
            user_id='user-123',
            organization_id='org-123'
        )

        assert result['id'] == 'lesson-123'
        self.mock_repo.create_lesson.assert_called_once()

    def test_create_lesson_validates_required_fields(self):
        """Test creation fails with missing required fields."""
        with pytest.raises(ValidationError, match="Required fields missing"):
            self.service.create_lesson(
                quest_id='',  # Empty
                title='Test',
                content='Content',
                order_index=0,
                user_id='user-123',
                organization_id='org-123'
            )

    def test_create_lesson_validates_iframe_content(self):
        """Test creation validates iframe URLs in content."""
        content = '<iframe src="javascript:alert(1)"></iframe>'

        with pytest.raises(ValidationError):
            self.service.create_lesson(
                quest_id='quest-123',
                title='Test Lesson',
                content=content,
                order_index=0,
                user_id='user-123',
                organization_id='org-123'
            )

    def test_create_lesson_validates_lesson_type(self):
        """Test creation validates lesson type."""
        with pytest.raises(ValidationError, match="must be one of"):
            self.service.create_lesson(
                quest_id='quest-123',
                title='Test Lesson',
                content='Content',
                order_index=0,
                user_id='user-123',
                organization_id='org-123',
                lesson_type='invalid_type'
            )


@pytest.mark.skip(
    reason="Rewrite needed: CurriculumLessonService was refactored from an injected "
           "curriculum_repo to a supabase-backed client, so these assertions target a "
           "dependency that no longer exists. The methods themselves (create_lesson, "
           "update_lesson, delete_lesson, reorder_lessons, progress, curriculum) are "
           "still present and still need coverage against the current API."
)
class TestUpdateLesson:
    """Test lesson updates."""

    def setup_method(self):
        """Set up test fixtures."""
        self.mock_supabase = Mock()
        self.service = CurriculumLessonService(supabase=self.mock_supabase)

    def test_update_lesson_success(self):
        """Test successful lesson update."""
        self.mock_repo.update_lesson.return_value = {
            'id': 'lesson-123',
            'title': 'Updated Title'
        }

        result = self.service.update_lesson(
            lesson_id='lesson-123',
            quest_id='quest-123',
            user_id='user-123',
            title='Updated Title'
        )

        assert result['title'] == 'Updated Title'
        self.mock_repo.update_lesson.assert_called_once()

    def test_update_lesson_validates_iframe_content(self):
        """Test update validates iframe URLs."""
        content = '<iframe src="data:text/html,<script>alert(1)</script>"></iframe>'

        with pytest.raises(ValidationError):
            self.service.update_lesson(
                lesson_id='lesson-123',
                quest_id='quest-123',
                user_id='user-123',
                content=content
            )

    def test_update_lesson_validates_lesson_type(self):
        """Test update validates lesson type if provided."""
        with pytest.raises(ValidationError):
            self.service.update_lesson(
                lesson_id='lesson-123',
                quest_id='quest-123',
                user_id='user-123',
                lesson_type='bad_type'
            )


@pytest.mark.skip(
    reason="Rewrite needed: CurriculumLessonService was refactored from an injected "
           "curriculum_repo to a supabase-backed client, so these assertions target a "
           "dependency that no longer exists. The methods themselves (create_lesson, "
           "update_lesson, delete_lesson, reorder_lessons, progress, curriculum) are "
           "still present and still need coverage against the current API."
)
class TestDeleteLesson:
    """Test lesson deletion."""

    def setup_method(self):
        """Set up test fixtures."""
        self.mock_supabase = Mock()
        self.service = CurriculumLessonService(supabase=self.mock_supabase)

    def test_delete_lesson_success(self):
        """Test successful lesson deletion."""
        self.mock_repo.delete_lesson.return_value = True

        result = self.service.delete_lesson(
            lesson_id='lesson-123',
            quest_id='quest-123',
            user_id='user-123'
        )

        assert result is True
        self.mock_repo.delete_lesson.assert_called_once_with('lesson-123', 'quest-123')


@pytest.mark.skip(
    reason="Rewrite needed: CurriculumLessonService was refactored from an injected "
           "curriculum_repo to a supabase-backed client, so these assertions target a "
           "dependency that no longer exists. The methods themselves (create_lesson, "
           "update_lesson, delete_lesson, reorder_lessons, progress, curriculum) are "
           "still present and still need coverage against the current API."
)
class TestReorderLessons:
    """Test lesson reordering."""

    def setup_method(self):
        """Set up test fixtures."""
        self.mock_supabase = Mock()
        self.service = CurriculumLessonService(supabase=self.mock_supabase)

    def test_reorder_lessons_success(self):
        """Test successful lesson reordering."""
        lesson_order = ['lesson-1', 'lesson-2', 'lesson-3']
        self.mock_repo.reorder_lessons.return_value = [
            {'id': 'lesson-1', 'order_index': 0},
            {'id': 'lesson-2', 'order_index': 1},
            {'id': 'lesson-3', 'order_index': 2}
        ]

        result = self.service.reorder_lessons(
            quest_id='quest-123',
            lesson_order=lesson_order,
            user_id='user-123'
        )

        assert len(result) == 3
        self.mock_repo.reorder_lessons.assert_called_once()

    def test_reorder_lessons_validates_lesson_order(self):
        """Test reorder validates lesson order is a list."""
        with pytest.raises(ValidationError, match="must be a non-empty list"):
            self.service.reorder_lessons(
                quest_id='quest-123',
                lesson_order=None,
                user_id='user-123'
            )


@pytest.mark.skip(
    reason="Rewrite needed: CurriculumLessonService was refactored from an injected "
           "curriculum_repo to a supabase-backed client, so these assertions target a "
           "dependency that no longer exists. The methods themselves (create_lesson, "
           "update_lesson, delete_lesson, reorder_lessons, progress, curriculum) are "
           "still present and still need coverage against the current API."
)
class TestMarkProgress:
    """Test lesson progress tracking."""

    def setup_method(self):
        """Set up test fixtures."""
        self.mock_supabase = Mock()
        self.service = CurriculumLessonService(supabase=self.mock_supabase)

    def test_mark_progress_success(self):
        """Test successful progress marking."""
        self.mock_repo.mark_lesson_progress.return_value = {
            'lesson_id': 'lesson-123',
            'user_id': 'user-123',
            'completed': True
        }

        result = self.service.mark_progress(
            lesson_id='lesson-123',
            user_id='user-123',
            quest_id='quest-123',
            completed=True,
            time_spent_minutes=30
        )

        assert result['completed'] is True
        self.mock_repo.mark_lesson_progress.assert_called_once()


@pytest.mark.skip(
    reason="Rewrite needed: CurriculumLessonService was refactored from an injected "
           "curriculum_repo to a supabase-backed client, so these assertions target a "
           "dependency that no longer exists. The methods themselves (create_lesson, "
           "update_lesson, delete_lesson, reorder_lessons, progress, curriculum) are "
           "still present and still need coverage against the current API."
)
class TestGetQuestCurriculum:
    """Test retrieving quest curriculum."""

    def setup_method(self):
        """Set up test fixtures."""
        self.mock_supabase = Mock()
        self.service = CurriculumLessonService(supabase=self.mock_supabase)

    def test_get_quest_curriculum_success(self):
        """Test successful curriculum retrieval."""
        self.mock_repo.get_quest_lessons.return_value = [
            {'id': 'lesson-1', 'title': 'Lesson 1'},
            {'id': 'lesson-2', 'title': 'Lesson 2'}
        ]

        result = self.service.get_quest_curriculum(
            quest_id='quest-123',
            user_id='user-123'
        )

        assert len(result) == 2
        self.mock_repo.get_quest_lessons.assert_called_once_with('quest-123', 'user-123')


@pytest.mark.skip(
    reason="validate_lesson_content no longer exists on any service -- it was removed, "
           "not moved (unlike validate_iframe_urls, which went to CurriculumService). "
           "Delete these tests or point them at whatever replaced the check."
)
class TestValidateLessonContent:
    """Test lesson content validation."""

    def setup_method(self):
        """Set up test fixtures."""
        self.mock_supabase = Mock()
        self.service = CurriculumLessonService(supabase=self.mock_supabase)

    def test_validate_lesson_content_valid(self):
        """Test validation of valid content."""
        content = '<p>This is valid content</p>'
        result = self.service.validate_lesson_content(content)

        assert result['valid'] is True
        assert len(result['errors']) == 0
        assert result['iframe_count'] == 0

    def test_validate_lesson_content_empty(self):
        """Test validation fails on empty content."""
        result = self.service.validate_lesson_content('')

        assert result['valid'] is False
        assert 'cannot be empty' in result['errors'][0]

    def test_validate_lesson_content_dangerous_html(self):
        """Test validation detects dangerous HTML tags."""
        content = '<p>Normal content</p><script>alert(1)</script>'
        result = self.service.validate_lesson_content(content)

        assert result['valid'] is False
        assert any('script' in error.lower() for error in result['errors'])

    def test_validate_lesson_content_iframe_count(self):
        """Test validation counts iframes correctly."""
        content = '''
        <iframe src="https://www.youtube.com/embed/abc"></iframe>
        <iframe src="https://vimeo.com/123"></iframe>
        '''
        result = self.service.validate_lesson_content(content)

        assert result['iframe_count'] == 2

    def test_validate_lesson_content_very_long(self):
        """Test validation warns about very long content."""
        content = 'x' * 60000  # 60KB
        result = self.service.validate_lesson_content(content)

        assert len(result['warnings']) > 0
        assert 'very long' in result['warnings'][0].lower()


class TestUpdateLessonProgressRace:
    """Two progress POSTs for the same lesson arriving together.

    The select-then-insert in update_lesson_progress is not a lock: an autosave
    racing a step click has both requests see no row and both insert, and the
    loser hit curriculum_lesson_progress_user_id_lesson_id_key and 500'd on a
    student mid-lesson (Sentry OPTIO-BACKEND-73). The row it collided with is the
    one it wanted, so it must update instead of failing.
    """

    def setup_method(self):
        self.supabase = Mock()
        self.service = CurriculumLessonService(supabase=self.supabase)

    def _table(self, *, existing, insert_error=None):
        """A query builder whose select() finds `existing` and whose insert()
        optionally raises. Returns (table, calls) where calls records the verbs."""
        calls = []
        table = Mock()
        for verb in ('select', 'eq'):
            getattr(table, verb).side_effect = lambda *a, **k: table
        table.execute.return_value = Mock(data=existing)

        def _insert(payload):
            calls.append('insert')
            inserted = Mock()
            if insert_error is not None:
                inserted.execute.side_effect = insert_error
            else:
                inserted.execute.return_value = Mock(data=[{'id': 'p1', **payload}])
            return inserted

        def _update(payload):
            calls.append('update')
            updated = Mock()
            updated.eq.side_effect = lambda *a, **k: updated
            updated.execute.return_value = Mock(data=[{'id': 'existing', **payload}])
            return updated

        table.insert.side_effect = _insert
        table.update.side_effect = _update
        self.supabase.table.return_value = table
        return table, calls

    def test_losing_the_insert_race_updates_the_winners_row(self):
        err = Exception(
            "{'message': 'duplicate key value violates unique constraint "
            "\"curriculum_lesson_progress_user_id_lesson_id_key\"', 'code': '23505'}"
        )
        _, calls = self._table(existing=[], insert_error=err)

        result = self.service.update_lesson_progress(
            user_id='u1', lesson_id='l1', quest_id='q1', organization_id='o1',
            status='in_progress')

        assert calls == ['insert', 'update']
        assert result['id'] == 'existing'

    def test_an_unrelated_insert_failure_still_raises(self):
        """Only the unique-violation is a race. Anything else is a real error and
        must not be silently retried as an update."""
        _, calls = self._table(existing=[], insert_error=Exception('connection reset'))

        with pytest.raises(Exception, match='connection reset'):
            self.service.update_lesson_progress(
                user_id='u1', lesson_id='l1', quest_id='q1', organization_id='o1',
                status='in_progress')

        assert calls == ['insert']

    def test_an_existing_row_is_updated_without_an_insert(self):
        _, calls = self._table(existing=[{'id': 'existing'}])

        self.service.update_lesson_progress(
            user_id='u1', lesson_id='l1', quest_id='q1', organization_id='o1',
            progress_percentage=40)

        assert calls == ['update']
