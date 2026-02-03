"""
Unit tests for curriculum lesson service.

Tests lesson CRUD operations, iframe URL validation, progress tracking, and reordering.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from services.curriculum_lesson_service import CurriculumLessonService
from services.base_service import ValidationError


class TestIframeURLValidation:
    """Test iframe URL validation logic."""

    def setup_method(self):
        """Set up test fixtures."""
        self.mock_repo = Mock()
        self.service = CurriculumLessonService(curriculum_repo=self.mock_repo)

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


class TestCreateLesson:
    """Test lesson creation."""

    def setup_method(self):
        """Set up test fixtures."""
        self.mock_repo = Mock()
        self.service = CurriculumLessonService(curriculum_repo=self.mock_repo)

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


class TestUpdateLesson:
    """Test lesson updates."""

    def setup_method(self):
        """Set up test fixtures."""
        self.mock_repo = Mock()
        self.service = CurriculumLessonService(curriculum_repo=self.mock_repo)

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


class TestDeleteLesson:
    """Test lesson deletion."""

    def setup_method(self):
        """Set up test fixtures."""
        self.mock_repo = Mock()
        self.service = CurriculumLessonService(curriculum_repo=self.mock_repo)

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


class TestReorderLessons:
    """Test lesson reordering."""

    def setup_method(self):
        """Set up test fixtures."""
        self.mock_repo = Mock()
        self.service = CurriculumLessonService(curriculum_repo=self.mock_repo)

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


class TestMarkProgress:
    """Test lesson progress tracking."""

    def setup_method(self):
        """Set up test fixtures."""
        self.mock_repo = Mock()
        self.service = CurriculumLessonService(curriculum_repo=self.mock_repo)

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


class TestGetQuestCurriculum:
    """Test retrieving quest curriculum."""

    def setup_method(self):
        """Set up test fixtures."""
        self.mock_repo = Mock()
        self.service = CurriculumLessonService(curriculum_repo=self.mock_repo)

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


class TestValidateLessonContent:
    """Test lesson content validation."""

    def setup_method(self):
        """Set up test fixtures."""
        self.mock_repo = Mock()
        self.service = CurriculumLessonService(curriculum_repo=self.mock_repo)

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
