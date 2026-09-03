"""
Integration tests for curriculum builder and custom content creation.

Tests the curriculum builder system including:
- Quest creation with markdown content
- Task creation with iframe embeds
- Iframe URL validation and XSS prevention
- File upload validation (size limits, file types)
- Permission enforcement (only advisors/admins)
- Content auto-save and versioning
"""

import pytest
from datetime import datetime

from utils.logger import get_logger



logger = get_logger(__name__)


# ==================== Iframe URL Validation Tests ====================

@pytest.mark.integration
@pytest.mark.critical
def test_iframe_url_validation_allows_whitelisted_domains():
    """Whitelisted embed hosts are accepted.

    The real API is validate_iframe_urls(content) on CurriculumService: it takes
    the HTML body, not a bare URL, and RAISES ValidationError rather than
    returning a bool.
    """
    from services.curriculum_service import CurriculumService

    service = CurriculumService()

    for url in [
        'https://www.youtube.com/embed/dQw4w9WgXcQ',
        'https://youtu.be/dQw4w9WgXcQ',
        'https://player.vimeo.com/video/123456789',
        'https://drive.google.com/file/d/abc/preview',
        'https://docs.google.com/presentation/d/abc/embed',
    ]:
        assert service.validate_iframe_urls(f'<iframe src="{url}"></iframe>') is True


@pytest.mark.integration
@pytest.mark.security
def test_iframe_url_validation_rejects_malicious_urls():
    """Dangerous schemes, lookalike hosts and allowlist-substring tricks are refused."""
    from services.curriculum_service import CurriculumService
    from middleware.error_handler import ValidationError

    service = CurriculumService()

    malicious_urls = [
        'javascript:alert("XSS")',
        'data:text/html,<script>alert("XSS")</script>',
        'https://evil.com/phishing',
        'file:///etc/passwd',
        'ftp://unsafe.com/file',
        # These four passed the old substring check and are the reason it was
        # replaced with scheme + parsed-host matching.
        'javascript:alert(document.cookie)//youtube.com',
        'https://evil-youtube.com.malicious.com/video',
        'https://attacker.test/?ref=youtube.com',
        'http://www.youtube.com/embed/abc',
    ]

    for url in malicious_urls:
        with pytest.raises(ValidationError):
            service.validate_iframe_urls(f'<iframe src="{url}"></iframe>')


@pytest.mark.integration
@pytest.mark.security
def test_iframe_sanitization_removes_dangerous_attributes():
    """Event-handler attributes are stripped from authored HTML.

    Attribute sanitisation is utils.rich_text.sanitize (a bleach allowlist),
    not a CurriculumService method -- CurriculumService validates the iframe
    URL, rich_text cleans the markup.
    """
    from utils import rich_text

    dangerous = ('<p onload="alert(1)" onerror="alert(1)" onclick="alert(1)">'
                 'Lesson intro</p>')

    sanitized = rich_text.sanitize(dangerous)

    assert 'onload' not in sanitized.lower()
    assert 'onerror' not in sanitized.lower()
    assert 'onclick' not in sanitized.lower()
    assert 'Lesson intro' in sanitized


# ==================== File Upload Validation Tests ====================

@pytest.mark.integration
@pytest.mark.critical
def test_file_upload_size_limit_enforced():
    """Oversized uploads are rejected.

    File validation is utils.file_validator, not CurriculumService.
    """
    from utils.file_validator import validate_file, MAX_FILE_SIZE

    oversized = b'x' * (MAX_FILE_SIZE + 1)
    result = validate_file('notes.txt', oversized, 'text/plain')

    assert not result.is_valid
    assert 'size' in (result.error_message or '').lower() \
        or 'large' in (result.error_message or '').lower()


@pytest.mark.integration
@pytest.mark.critical
def test_file_upload_allows_valid_sizes():
    """A small file of an allowed type passes."""
    from utils.file_validator import validate_file

    result = validate_file('notes.txt', b'hello world', 'text/plain')

    assert result.is_valid, result.error_message


@pytest.mark.integration
@pytest.mark.critical
@pytest.mark.security
def test_file_type_validation_rejects_executables():
    """Executable extensions are refused regardless of content."""
    from utils.file_validator import validate_file

    for filename in ['malware.exe', 'script.sh', 'virus.bat', 'trojan.app', 'backdoor.dmg']:
        result = validate_file(filename, b'MZ\x90\x00', 'application/octet-stream')
        assert not result.is_valid, f"Failed to reject dangerous file: {filename}"


@pytest.mark.integration
@pytest.mark.critical
def test_file_type_validation_allows_safe_types():
    """Everyday document types are accepted."""
    from utils.file_validator import ALLOWED_EXTENSIONS

    # Note: csv/xlsx/pptx are deliberately NOT on the list -- uploads are
    # images, documents, video and audio (config/constants.ALLOWED_FILE_EXTENSIONS).
    for filename in ['document.pdf', 'image.png', 'photo.jpg', 'notes.txt', 'clip.mp4']:
        extension = filename.rsplit('.', 1)[1]
        assert extension in ALLOWED_EXTENSIONS, f"{extension} should be an allowed upload type"


# ==================== Permission Tests ====================

@pytest.mark.integration
@pytest.mark.skip(reason="No draft/autosave implementation exists: CurriculumService has no save_draft and there is no drafts table. This describes a feature, not a regression.")
def test_curriculum_auto_save_creates_draft():
    """Test that auto-save creates a draft version"""
    from services.curriculum_service import CurriculumService

    service = CurriculumService()

    draft_data = {
        'quest_id': 'test-quest-id',
        'title': 'Draft Quest',
        'content': 'Work in progress...',
        'is_draft': True
    }

    # Mock auto-save
    saved_draft = service.save_draft(draft_data)

    # Should save without publishing
    assert saved_draft is not None
    assert saved_draft.get('is_draft') is True


@pytest.mark.integration
@pytest.mark.skip(reason="No curriculum versioning exists; CurriculumService has no version API.")
def test_curriculum_version_tracking():
    """Test that curriculum changes are versioned"""
    from services.curriculum_service import CurriculumService

    service = CurriculumService()

    # Create initial version
    version_1 = {
        'quest_id': 'test-quest-id',
        'content': 'Version 1',
        'version': 1
    }

    # Update to version 2
    version_2 = {
        'quest_id': 'test-quest-id',
        'content': 'Version 2 - updated',
        'version': 2
    }

    # Should track both versions
    # (Implementation would use version control)
    assert version_2['version'] > version_1['version']


# ==================== Markdown Validation Tests ====================

@pytest.mark.integration
@pytest.mark.skip(reason="CurriculumService has no validate_markdown. Body content is sanitised on the way in by utils.rich_text.sanitize (covered by test_markdown_script_injection_prevention) rather than validated separately.")
def test_markdown_content_validation():
    """Test that markdown content is validated and sanitized"""
    from services.curriculum_service import CurriculumService

    service = CurriculumService()

    # Valid markdown
    valid_markdown = "# Heading\n\n- List item\n- Another item\n\n**Bold text**"

    is_valid = service.validate_markdown(valid_markdown)
    assert is_valid


@pytest.mark.integration
@pytest.mark.security
def test_markdown_script_injection_prevention():
    """Script tags are removed whole, content included.

    utils.rich_text.sanitize strips scriptish elements entirely rather than
    unwrapping them -- bleach alone would keep "alert('XSS')" as visible text.
    """
    from utils import rich_text

    malicious = "<h1>Title</h1><script>alert('XSS')</script><p>Content</p>"

    sanitized = rich_text.sanitize(malicious)

    assert '<script>' not in sanitized
    assert 'alert' not in sanitized
    assert 'Content' in sanitized


# ==================== API Endpoint Tests ====================

@pytest.fixture
def test_advisor(test_supabase):
    """Create a test advisor user"""
    advisor = {
        'id': 'test-advisor-id',
        'email': 'advisor@test.com',
        'role': 'advisor',
        'organization_id': 'test-org-id',
        'display_name': 'Test Advisor'
    }

    # In real implementation, would create via Supabase
    return advisor


# ==================== Helper Functions ====================

def create_test_quest(title, organization_id, advisor_id):
    """Helper to create a test quest"""
    return {
        'id': f'quest-{datetime.now().timestamp()}',
        'title': title,
        'organization_id': organization_id,
        'created_by': advisor_id,
        'is_active': True,
        'tasks': []
    }


def create_test_task(quest_id, title, pillar='knowledge', xp_value=50):
    """Helper to create a test task"""
    return {
        'id': f'task-{datetime.now().timestamp()}',
        'quest_id': quest_id,
        'title': title,
        'pillar': pillar,
        'xp_value': xp_value,
        'content_markdown': ''
    }


# Six tests were removed here on 2026-08-13 rather than ported:
# test_advisor_can_create_curriculum, test_advisor_cannot_edit_other_org_curriculum,
# test_curriculum_edit_requires_advisor_role, test_create_quest_endpoint_validates_required_fields,
# test_delete_quest_requires_author_permission, test_upload_attachment_validates_content_type.
#
# They posted to /api/curriculum/quests and /api/curriculum/quests/<id>/attachments,
# neither of which exists any more, and seeded through the `execute_sql` RPC that
# never existed at all. Rewriting them would have meant inventing endpoints.
#
# What remains are genuine unit tests of CurriculumService.validate_iframe_urls
# and utils.rich_text.sanitize -- pure functions that never needed a database.
# They were marked requires_db and so had not run since the marker was added;
# they now run in the ordinary backend suite on every push.
