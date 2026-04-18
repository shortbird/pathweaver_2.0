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
    storage_bucket.create_signed_upload_url = MagicMock(
        return_value={
            "signed_url": "https://example.invalid/storage/v1/object/upload/sign/quest-evidence/x?token=tkn",
            "signedUrl": "https://example.invalid/storage/v1/object/upload/sign/quest-evidence/x?token=tkn",
            "token": "tkn",
            "path": "some/path",
        }
    )
    storage_bucket.list = MagicMock(return_value=[])
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


def test_security_scan_rejects_invalid_file():
    """security_scan=True routes through utils.file_validator.validate_file and
    returns a SECURITY_REJECTED result when the scanner fails the file."""
    svc, client, bucket = _make_service_with_stub_client()
    file = _FakeFile(b"PNGDATA", filename="photo.png", content_type="image/png")

    class _Bad:
        is_valid = False
        error_message = "polyglot detected"
        sha256_hash = None
        detected_mime = "image/png"
        file_size = 7
        warnings: list = []

    from unittest.mock import patch
    with patch("utils.file_validator.validate_file", return_value=_Bad()):
        result = svc.upload_evidence_file(
            file,
            user_id="u",
            context_type="task_evidence",
            context_id="c",
            block_type="image",
            security_scan=True,
        )
    assert result.success is False
    assert result.error_code == "SECURITY_REJECTED"
    assert "polyglot" in result.error_message
    # Storage must NOT have been called when the scan rejected the file.
    bucket.upload.assert_not_called()


def test_security_scan_passes_through_valid_file_and_surfaces_sha256():
    svc, client, bucket = _make_service_with_stub_client()
    file = _FakeFile(b"PNGDATA", filename="photo.png", content_type="image/png")

    class _Good:
        is_valid = True
        error_message = None
        sha256_hash = "abc123"
        detected_mime = "image/png"
        file_size = 7
        warnings: list = []

    from unittest.mock import patch
    with patch("utils.file_validator.validate_file", return_value=_Good()):
        result = svc.upload_evidence_file(
            file,
            user_id="u",
            context_type="task_evidence",
            context_id="c",
            block_type="image",
            security_scan=True,
        )
    assert result.success is True
    assert result.sha256_hash == "abc123"
    bucket.upload.assert_called()


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


# ── create_upload_session (signed upload init) ────────────────────────


def test_create_upload_session_happy_path_image():
    svc, client, bucket = _make_service_with_stub_client()
    session = svc.create_upload_session(
        user_id="user-1",
        context_type="task",
        context_id="task-99",
        filename="photo.png",
        file_size=1024,
        content_type="image/png",
        block_type="image",
    )
    assert session.success is True
    assert session.signed_url.startswith("https://example.invalid/")
    assert session.token == "tkn"
    assert session.storage_path.startswith("evidence-tasks/user-1/task-99_")
    assert session.storage_path.endswith("photo.png")
    assert session.bucket == "quest-evidence"
    assert session.media_type == "image"
    assert session.final_url is not None
    bucket.create_signed_upload_url.assert_called_once()


def test_create_upload_session_moment_uses_user_uploads_bucket():
    svc, client, bucket = _make_service_with_stub_client()
    session = svc.create_upload_session(
        user_id="user-1",
        context_type="moment",
        context_id="child-9",
        filename="clip.mp4",
        file_size=1024,
        block_type="video",
    )
    assert session.success is True
    assert session.bucket == "user-uploads"
    client.storage.from_.assert_any_call("user-uploads")


def test_create_upload_session_rejects_invalid_extension():
    svc, *_ = _make_service_with_stub_client()
    session = svc.create_upload_session(
        user_id="u",
        context_type="task",
        context_id="t",
        filename="malware.exe",
        file_size=1024,
        block_type="document",
    )
    assert session.success is False
    assert session.error_code == "INVALID_TYPE"


def test_create_upload_session_rejects_missing_filename():
    svc, *_ = _make_service_with_stub_client()
    session = svc.create_upload_session(
        user_id="u",
        context_type="task",
        context_id="t",
        filename="",
        file_size=1024,
    )
    assert session.success is False
    assert session.error_code == "NO_FILENAME"


def test_create_upload_session_rejects_zero_size():
    svc, *_ = _make_service_with_stub_client()
    session = svc.create_upload_session(
        user_id="u",
        context_type="task",
        context_id="t",
        filename="photo.png",
        file_size=0,
        block_type="image",
    )
    assert session.success is False
    assert session.error_code == "INVALID_SIZE"


def test_create_upload_session_rejects_oversized_video():
    """Signed-upload uses the larger signed-video cap (500MB), not the legacy 50MB."""
    from config.constants import MAX_VIDEO_SIZE, MAX_VIDEO_SIZE_SIGNED

    svc, *_ = _make_service_with_stub_client()

    # File at the legacy-only cap should still succeed on the signed path.
    ok = svc.create_upload_session(
        user_id="u",
        context_type="task",
        context_id="t",
        filename="clip.mp4",
        file_size=MAX_VIDEO_SIZE + 1,
        block_type="video",
    )
    assert ok.success is True

    # Just over the signed cap should fail.
    session = svc.create_upload_session(
        user_id="u",
        context_type="task",
        context_id="t",
        filename="clip.mp4",
        file_size=MAX_VIDEO_SIZE_SIGNED + 1,
        block_type="video",
    )
    assert session.success is False
    assert session.error_code == "FILE_TOO_LARGE"


def test_create_upload_session_auto_detects_block_type():
    svc, *_ = _make_service_with_stub_client()
    session = svc.create_upload_session(
        user_id="u",
        context_type="task",
        context_id="t",
        filename="clip.mp4",
        file_size=1024,
    )
    assert session.success is True
    assert session.media_type == "video"


def test_create_upload_session_handles_supabase_failure():
    svc, client, bucket = _make_service_with_stub_client()
    bucket.create_signed_upload_url.side_effect = RuntimeError("supabase down")
    session = svc.create_upload_session(
        user_id="u",
        context_type="task",
        context_id="t",
        filename="photo.png",
        file_size=1024,
        block_type="image",
    )
    assert session.success is False
    assert session.error_code == "SIGN_FAILED"


# ── finalize_upload (signed upload completion) ────────────────────────


def _make_list_entry(name: str, size: int, mimetype: str = "image/png"):
    return {"name": name, "metadata": {"size": size, "mimetype": mimetype}}


def test_finalize_upload_rejects_path_that_doesnt_match_context():
    """A client must not be able to finalize a storage path from a different context.

    The route handler authorizes the caller for a specific context_id; the
    defense-in-depth check in the service must reject paths that don't match
    that context.
    """
    svc, *_ = _make_service_with_stub_client()
    result = svc.finalize_upload(
        user_id="user-1",
        storage_path="evidence-tasks/user-1/some-other-task_2026_photo.png",
        bucket="quest-evidence",
        context_type="task",
        context_id="task-99",  # path has a different task id
        block_type="image",
    )
    assert result.success is False
    assert result.error_code == "PATH_MISMATCH"


def test_finalize_upload_accepts_parent_moment_path_with_child_context():
    """Parent uploading a learning-moment file for their child: the storage
    path template `learning_moments/{context_id}/...` has the CHILD's id, not
    the parent's. The service's own path check must not reject this — the
    route handler has already verified the parent->child relationship.
    """
    svc, client, bucket = _make_service_with_stub_client()
    bucket.list.return_value = [
        _make_list_entry("uuid.png", 2048, "image/png")
    ]

    result = svc.finalize_upload(
        user_id="parent-user-id",
        storage_path="learning_moments/child-user-id/uuid.png",
        bucket="user-uploads",
        context_type="moment",
        context_id="child-user-id",
        block_type="image",
    )
    assert result.success is True


def test_finalize_upload_accepts_parent_moment_block_path_with_child_context():
    """Same check for moment_block uploads (parent attaching a file to a
    specific moment they captured for their child).
    """
    svc, client, bucket = _make_service_with_stub_client()
    bucket.list.return_value = [_make_list_entry("uuid.mp4", 50_000_000, "video/mp4")]

    fake_response = MagicMock()
    fake_response.__enter__ = MagicMock(return_value=fake_response)
    fake_response.__exit__ = MagicMock(return_value=False)
    fake_response.raise_for_status = MagicMock()
    fake_response.iter_content = MagicMock(return_value=iter([b"MP4DATA"]))

    with patch("requests.get", return_value=fake_response), patch(
        "services.video_processing_service.video_processing_service"
    ) as mock_vps:
        mock_vps.validate_duration_from_path.return_value = (True, 42.0)
        mock_vps.process_video_from_path.return_value = MagicMock(
            thumbnail_url=None, duration_seconds=42.0, width=None, height=None
        )
        mock_vps.process_video_background = MagicMock()

        result = svc.finalize_upload(
            user_id="parent-user-id",
            storage_path="learning_moments/child-user-id/moment-abc/uuid.mp4",
            bucket="user-uploads",
            context_type="moment_block",
            context_id="child-user-id",
            sub_id="moment-abc",
            block_type="video",
        )
    assert result.success is True


def test_finalize_upload_rejects_missing_file():
    svc, client, bucket = _make_service_with_stub_client()
    bucket.list.return_value = []
    result = svc.finalize_upload(
        user_id="user-1",
        storage_path="evidence-tasks/user-1/task-99_2026_photo.png",
        bucket="quest-evidence",
        context_type="task",
        context_id="task-99",
        block_type="image",
    )
    assert result.success is False
    assert result.error_code == "FILE_NOT_FOUND"


def test_finalize_upload_happy_path_image():
    svc, client, bucket = _make_service_with_stub_client()
    bucket.list.return_value = [_make_list_entry("task-99_2026_photo.png", 2048, "image/png")]

    result = svc.finalize_upload(
        user_id="user-1",
        storage_path="evidence-tasks/user-1/task-99_2026_photo.png",
        bucket="quest-evidence",
        context_type="task",
        context_id="task-99",
        block_type="image",
    )
    assert result.success is True
    assert result.file_size == 2048
    assert result.content_type == "image/png"
    assert result.filename == "task-99_2026_photo.png"
    assert result.media_type == "image"
    # Image path should not have video-specific metadata.
    assert result.thumbnail_url is None
    assert result.duration_seconds is None


def test_finalize_upload_rejects_oversized_file_from_supabase_and_deletes():
    """If the client lied about size in init, the actual stored size is still
    checked post-upload. Oversized uploads are deleted from storage."""
    from config.constants import MAX_IMAGE_SIZE

    svc, client, bucket = _make_service_with_stub_client()
    bucket.list.return_value = [
        _make_list_entry("task-99_2026_photo.png", MAX_IMAGE_SIZE + 1, "image/png")
    ]

    result = svc.finalize_upload(
        user_id="user-1",
        storage_path="evidence-tasks/user-1/task-99_2026_photo.png",
        bucket="quest-evidence",
        context_type="task",
        context_id="task-99",
        block_type="image",
    )
    assert result.success is False
    assert result.error_code == "FILE_TOO_LARGE"
    # Uploaded file must be cleaned up.
    bucket.remove.assert_called_once()


def test_finalize_upload_video_runs_post_processing():
    """Videos trigger duration validation, thumbnail generation, and background transcode."""
    from services.video_processing_service import VideoMetadata

    svc, client, bucket = _make_service_with_stub_client()
    bucket.list.return_value = [_make_list_entry("task-99_2026_clip.mp4", 50_000_000, "video/mp4")]

    meta = VideoMetadata(
        thumbnail_url="https://example.invalid/thumb.jpg",
        duration_seconds=42.0,
        width=1920,
        height=1080,
    )

    fake_response = MagicMock()
    fake_response.__enter__ = MagicMock(return_value=fake_response)
    fake_response.__exit__ = MagicMock(return_value=False)
    fake_response.raise_for_status = MagicMock()
    fake_response.iter_content = MagicMock(return_value=iter([b"MP4DATA"]))

    with patch("requests.get", return_value=fake_response), patch(
        "services.video_processing_service.video_processing_service"
    ) as mock_vps:
        mock_vps.validate_duration_from_path.return_value = (True, 42.0)
        mock_vps.process_video_from_path.return_value = meta
        mock_vps.process_video_background = MagicMock()

        result = svc.finalize_upload(
            user_id="user-1",
            storage_path="evidence-tasks/user-1/task-99_2026_clip.mp4",
            bucket="quest-evidence",
            context_type="task",
            context_id="task-99",
            block_type="video",
        )

    assert result.success is True
    assert result.thumbnail_url == "https://example.invalid/thumb.jpg"
    assert result.duration_seconds == 42.0
    assert result.width == 1920
    assert result.height == 1080
    mock_vps.process_video_background.assert_called_once()


def test_finalize_upload_video_rejects_when_too_long_and_deletes():
    svc, client, bucket = _make_service_with_stub_client()
    bucket.list.return_value = [_make_list_entry("task-99_clip.mp4", 50_000_000, "video/mp4")]

    fake_response = MagicMock()
    fake_response.__enter__ = MagicMock(return_value=fake_response)
    fake_response.__exit__ = MagicMock(return_value=False)
    fake_response.raise_for_status = MagicMock()
    fake_response.iter_content = MagicMock(return_value=iter([b"MP4DATA"]))

    with patch("requests.get", return_value=fake_response), patch(
        "services.video_processing_service.video_processing_service"
    ) as mock_vps:
        mock_vps.validate_duration_from_path.return_value = (False, 600.0)

        result = svc.finalize_upload(
            user_id="user-1",
            storage_path="evidence-tasks/user-1/task-99_clip.mp4",
            bucket="quest-evidence",
            context_type="task",
            context_id="task-99",
            block_type="video",
        )

    assert result.success is False
    assert result.error_code == "VIDEO_TOO_LONG"
    # File must be removed after duration rejection.
    bucket.remove.assert_called_once()


def test_upload_session_to_dict_omits_none_values():
    from services.media_upload_service import UploadSession

    s = UploadSession(
        success=True,
        signed_url="https://x",
        token="tkn",
        storage_path="p",
        bucket="b",
        media_type="image",
    )
    d = s.to_dict()
    assert "error_message" not in d
    assert "error_code" not in d
    assert d["signed_url"] == "https://x"
    assert d["token"] == "tkn"
