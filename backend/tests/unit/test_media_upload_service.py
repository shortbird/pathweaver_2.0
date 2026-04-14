"""Unit tests for MediaUploadService — the single source of truth for
evidence/media uploads across 7+ endpoints.

Covers:
- validate_file (pre-flight checks)
- _detect_media_type (extension -> type)
- _generate_storage_path (per-context templates)
- upload_evidence_file (full pipeline with stubbed Supabase + video service)
- delete_storage_file (URL parsing)
"""

from __future__ import annotations

import io
from unittest.mock import MagicMock, patch

import pytest


# ── Helpers ───────────────────────────────────────────────────────────


class _FakeFile:
    """Minimal werkzeug FileStorage double."""

    def __init__(self, content: bytes, filename: str, content_type: str = "application/octet-stream"):
        self._buf = io.BytesIO(content)
        self.filename = filename
        self.content_type = content_type

    def read(self, n: int = -1) -> bytes:
        return self._buf.read(n) if n != -1 else self._buf.read()

    def seek(self, offset: int, whence: int = 0) -> None:
        self._buf.seek(offset, whence)

    def tell(self) -> int:
        return self._buf.tell()


def _make_service_with_stub_client():
    from services.media_upload_service import MediaUploadService

    client = MagicMock()
    # Configure storage chain: supabase.storage.from_(bucket).upload(...) + get_public_url(...)
    storage_bucket = MagicMock()
    storage_bucket.upload = MagicMock(return_value=None)
    storage_bucket.get_public_url = MagicMock(
        return_value="https://example.invalid/storage/v1/object/public/quest-evidence/some/path"
    )
    storage_bucket.remove = MagicMock(return_value=None)
    client.storage.from_ = MagicMock(return_value=storage_bucket)

    return MediaUploadService(supabase_client=client), client, storage_bucket


# ── validate_file ─────────────────────────────────────────────────────


def test_validate_file_accepts_valid_image():
    svc, *_ = _make_service_with_stub_client()
    result = svc.validate_file("photo.png", 1024, "image")
    assert result.success is True


def test_validate_file_rejects_wrong_extension():
    svc, *_ = _make_service_with_stub_client()
    result = svc.validate_file("doc.pdf", 1024, "image")
    assert result.success is False
    assert result.error_code == "INVALID_TYPE"


def test_validate_file_rejects_oversized_image():
    svc, *_ = _make_service_with_stub_client()
    from config.constants import MAX_IMAGE_SIZE

    result = svc.validate_file("photo.png", MAX_IMAGE_SIZE + 1, "image")
    assert result.success is False
    assert result.error_code == "FILE_TOO_LARGE"


def test_validate_file_rejects_oversized_video():
    svc, *_ = _make_service_with_stub_client()
    from config.constants import MAX_VIDEO_SIZE

    result = svc.validate_file("v.mp4", MAX_VIDEO_SIZE + 1, "video")
    assert result.success is False
    assert result.error_code == "FILE_TOO_LARGE"


def test_validate_file_respects_document_size_cap():
    svc, *_ = _make_service_with_stub_client()
    from config.constants import MAX_DOCUMENT_SIZE

    # Document at cap succeeds, just over fails.
    assert svc.validate_file("a.pdf", MAX_DOCUMENT_SIZE, "document").success is True
    assert svc.validate_file("a.pdf", MAX_DOCUMENT_SIZE + 1, "document").success is False


def test_validate_file_missing_extension_rejected():
    svc, *_ = _make_service_with_stub_client()
    result = svc.validate_file("no_extension", 1024, "image")
    assert result.success is False
    assert result.error_code == "INVALID_TYPE"


# ── _detect_media_type ────────────────────────────────────────────────


@pytest.mark.parametrize(
    "ext, expected",
    [
        ("jpg", "image"),
        ("png", "image"),
        ("heic", "image"),
        ("mp4", "video"),
        ("mov", "video"),
        ("pdf", "document"),
        ("docx", "document"),
        ("txt", "document"),
        ("unknown", "document"),  # fallback
    ],
)
def test_detect_media_type(ext, expected):
    svc, *_ = _make_service_with_stub_client()
    assert svc._detect_media_type(ext) == expected


# ── _generate_storage_path ────────────────────────────────────────────


def test_generate_storage_path_task_context():
    svc, *_ = _make_service_with_stub_client()
    path = svc._generate_storage_path(
        context_type="task",
        context_id="task-123",
        user_id="user-abc",
        filename="photo.png",
        ext="png",
    )
    assert path.startswith("evidence-tasks/user-abc/task-123_")
    assert path.endswith("photo.png")


def test_generate_storage_path_moment_context_uses_uuid():
    svc, *_ = _make_service_with_stub_client()
    path = svc._generate_storage_path(
        context_type="moment",
        context_id="child-xyz",
        user_id="user-abc",
        filename="photo.png",
        ext="png",
    )
    assert path.startswith("learning_moments/child-xyz/")
    assert path.endswith(".png")


def test_generate_storage_path_moment_block_nests_sub_id():
    svc, *_ = _make_service_with_stub_client()
    path = svc._generate_storage_path(
        context_type="moment_block",
        context_id="moment-1",
        user_id="user-abc",
        filename="x.png",
        ext="png",
        sub_id="sub-xyz",
    )
    assert path.startswith("learning_moments/moment-1/sub-xyz/")


def test_generate_storage_path_unknown_context_falls_back():
    svc, *_ = _make_service_with_stub_client()
    path = svc._generate_storage_path(
        context_type="bogus",
        context_id="ignored",
        user_id="user-abc",
        filename="x.png",
        ext="png",
    )
    # Fallback pattern: user_id/<uuid>.ext
    assert path.startswith("user-abc/")
    assert path.endswith(".png")


# ── upload_evidence_file ──────────────────────────────────────────────


def test_upload_rejects_missing_file():
    svc, *_ = _make_service_with_stub_client()
    result = svc.upload_evidence_file(None, user_id="u", context_type="task", context_id="t")
    assert result.success is False
    assert result.error_code == "NO_FILE"


def test_upload_rejects_empty_filename():
    svc, *_ = _make_service_with_stub_client()
    file = _FakeFile(b"content", filename="")
    result = svc.upload_evidence_file(file, user_id="u", context_type="task", context_id="t")
    assert result.success is False
    assert result.error_code == "NO_FILE"


def test_upload_rejects_invalid_extension():
    svc, *_ = _make_service_with_stub_client()
    file = _FakeFile(b"content", filename="script.exe")
    result = svc.upload_evidence_file(
        file, user_id="u", context_type="task", context_id="t", block_type="document"
    )
    assert result.success is False
    assert result.error_code == "INVALID_TYPE"


def test_upload_rejects_oversized_file():
    from config.constants import MAX_IMAGE_SIZE

    svc, *_ = _make_service_with_stub_client()
    # One byte past the image cap.
    file = _FakeFile(b"x" * (MAX_IMAGE_SIZE + 1), filename="big.png", content_type="image/png")
    result = svc.upload_evidence_file(
        file, user_id="u", context_type="task", context_id="t", block_type="image"
    )
    assert result.success is False
    assert result.error_code == "FILE_TOO_LARGE"


def test_upload_happy_path_image():
    svc, client, bucket = _make_service_with_stub_client()
    file = _FakeFile(b"PNGDATA", filename="photo.png", content_type="image/png")
    result = svc.upload_evidence_file(
        file,
        user_id="user-1",
        context_type="task",
        context_id="task-99",
        block_type="image",
    )
    assert result.success is True
    assert result.file_url.startswith("https://example.invalid/")
    assert result.filename == "photo.png"
    assert result.file_size == len(b"PNGDATA")
    assert result.media_type == "image"
    # No video-specific metadata on image paths.
    assert result.thumbnail_url is None
    assert result.duration_seconds is None
    # Verify upload actually called on the right bucket.
    client.storage.from_.assert_any_call("quest-evidence")
    bucket.upload.assert_called()


def test_upload_happy_path_document():
    svc, client, bucket = _make_service_with_stub_client()
    file = _FakeFile(b"%PDF-1.4...", filename="report.pdf", content_type="application/pdf")
    result = svc.upload_evidence_file(
        file,
        user_id="user-1",
        context_type="task",
        context_id="task-99",
        block_type="document",
    )
    assert result.success is True
    assert result.media_type == "document"
    assert result.content_type == "application/pdf"


def test_upload_auto_detects_media_type_from_extension():
    """When block_type is None, the service should infer from the extension."""
    svc, *_ = _make_service_with_stub_client()
    file = _FakeFile(b"PNGDATA", filename="photo.png", content_type="image/png")
    result = svc.upload_evidence_file(
        file, user_id="u", context_type="task", context_id="t"  # no block_type
    )
    assert result.success is True
    assert result.media_type == "image"


def test_upload_moment_context_uses_user_uploads_bucket():
    svc, client, _ = _make_service_with_stub_client()
    file = _FakeFile(b"PNGDATA", filename="x.png", content_type="image/png")
    result = svc.upload_evidence_file(
        file,
        user_id="user-1",
        context_type="moment",
        context_id="child-9",
        block_type="image",
    )
    assert result.success is True
    client.storage.from_.assert_any_call("user-uploads")


def test_upload_custom_bucket_override():
    svc, client, _ = _make_service_with_stub_client()
    file = _FakeFile(b"PNGDATA", filename="x.png", content_type="image/png")
    result = svc.upload_evidence_file(
        file,
        user_id="user-1",
        context_type="task",
        context_id="t",
        block_type="image",
        bucket="custom-bucket",
    )
    assert result.success is True
    client.storage.from_.assert_any_call("custom-bucket")


def test_upload_video_rejects_when_duration_exceeds_limit():
    """Video longer than MAX_VIDEO_DURATION_SECONDS must be rejected."""
    svc, *_ = _make_service_with_stub_client()
    file = _FakeFile(b"MP4HEADER..." + b"x" * 1024, filename="clip.mp4", content_type="video/mp4")

    with patch("services.media_upload_service.video_processing_service", create=True):
        from services import media_upload_service

        with patch.object(
            media_upload_service,
            "video_processing_service",
            create=True,
        ):
            # The service imports video_processing_service inside the function,
            # so patch the import path it actually uses.
            with patch("services.video_processing_service.video_processing_service") as mock_vps:
                mock_vps.validate_duration_from_path.return_value = (False, 300.0)
                # thumbnail + processing not called because we reject first
                result = svc.upload_evidence_file(
                    file,
                    user_id="u",
                    context_type="task",
                    context_id="t",
                    block_type="video",
                )
    assert result.success is False
    assert result.error_code == "VIDEO_TOO_LONG"


def test_upload_video_happy_path_populates_metadata():
    """A valid video should return thumbnail/duration/dimensions."""
    from services.video_processing_service import VideoMetadata

    svc, client, bucket = _make_service_with_stub_client()
    file = _FakeFile(b"MP4HEADER...", filename="clip.mp4", content_type="video/mp4")

    meta = VideoMetadata(
        thumbnail_url="https://example.invalid/thumb.jpg",
        duration_seconds=42.0,
        width=1920,
        height=1080,
    )

    with patch("services.video_processing_service.video_processing_service") as mock_vps:
        mock_vps.validate_duration_from_path.return_value = (True, 42.0)
        mock_vps.process_video_from_path.return_value = meta
        mock_vps.process_video_background = MagicMock()

        result = svc.upload_evidence_file(
            file,
            user_id="u",
            context_type="task",
            context_id="t",
            block_type="video",
        )

    assert result.success is True
    assert result.thumbnail_url == "https://example.invalid/thumb.jpg"
    assert result.duration_seconds == 42.0
    assert result.width == 1920
    assert result.height == 1080
    # Background transcoding must have been kicked off.
    mock_vps.process_video_background.assert_called_once()


def test_upload_storage_error_returns_structured_error():
    svc, client, bucket = _make_service_with_stub_client()
    bucket.upload.side_effect = RuntimeError("supabase down")
    file = _FakeFile(b"PNGDATA", filename="photo.png", content_type="image/png")

    result = svc.upload_evidence_file(
        file,
        user_id="u",
        context_type="task",
        context_id="t",
        block_type="image",
    )
    assert result.success is False
    assert result.error_code == "STORAGE_ERROR"


# ── delete_storage_file ───────────────────────────────────────────────


def test_delete_storage_file_extracts_path_from_public_url():
    svc, client, bucket = _make_service_with_stub_client()
    url = "https://example.invalid/storage/v1/object/public/quest-evidence/users/abc/file.png"
    ok = svc.delete_storage_file(url, bucket="quest-evidence")
    assert ok is True
    bucket.remove.assert_called_once_with(["users/abc/file.png"])


def test_delete_storage_file_handles_unparseable_url():
    svc, *_ = _make_service_with_stub_client()
    assert svc.delete_storage_file("not-a-url", bucket="quest-evidence") is False


def test_delete_storage_file_swallows_storage_errors():
    svc, client, bucket = _make_service_with_stub_client()
    bucket.remove.side_effect = RuntimeError("boom")
    url = "https://example.invalid/storage/v1/object/public/quest-evidence/x.png"
    assert svc.delete_storage_file(url) is False


# ── MediaUploadResult.to_dict ─────────────────────────────────────────


def test_result_to_dict_omits_none_values():
    from services.media_upload_service import MediaUploadResult

    r = MediaUploadResult(
        success=True,
        file_url="https://x",
        filename="a.png",
        file_size=10,
        content_type="image/png",
        media_type="image",
    )
    d = r.to_dict()
    assert "thumbnail_url" not in d
    assert "duration_seconds" not in d
    assert d["file_url"] == "https://x"
    assert d["media_type"] == "image"
