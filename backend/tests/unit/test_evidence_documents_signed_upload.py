"""Route-level tests for the signed-upload endpoints on evidence_documents.py.

Covers:
- /api/evidence/documents/<task_id>/upload-init + upload-finalize
- /api/evidence/blocks/<block_id>/upload-init + upload-finalize

The flow is: client POSTs init -> backend returns a signed Supabase URL ->
client PUTs file directly to Supabase -> client POSTs finalize -> backend
verifies and runs post-processing. These tests exercise the backend's two
endpoints; the PUT-to-Supabase leg is outside the backend's surface area.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


# ── helpers ───────────────────────────────────────────────────────────


def _upload_session(**overrides):
    from services.media_upload_service import UploadSession

    defaults = {
        "success": True,
        "signed_url": "https://example.invalid/storage/v1/object/upload/sign/quest-evidence/p?token=tkn",
        "token": "tkn",
        "storage_path": "evidence-tasks/test-user-123/task-1_ts_photo.png",
        "bucket": "quest-evidence",
        "final_url": "https://example.invalid/storage/v1/object/public/quest-evidence/p",
        "media_type": "image",
        "max_size": 10 * 1024 * 1024,
    }
    defaults.update(overrides)
    return UploadSession(**defaults)


def _rejected_session(error_code: str = "FILE_TOO_LARGE", message: str = "too big"):
    from services.media_upload_service import UploadSession

    return UploadSession(success=False, error_message=message, error_code=error_code)


def _upload_result(**overrides):
    from services.media_upload_service import MediaUploadResult

    defaults = {
        "success": True,
        "file_url": "https://example.invalid/storage/v1/object/public/quest-evidence/p",
        "filename": "photo.png",
        "file_size": 2048,
        "content_type": "image/png",
        "media_type": "image",
    }
    defaults.update(overrides)
    return MediaUploadResult(**defaults)


def _rejected_result(error_code: str = "FILE_NOT_FOUND", message: str = "not found"):
    from services.media_upload_service import MediaUploadResult

    return MediaUploadResult(success=False, error_message=message, error_code=error_code)


@pytest.fixture
def mock_media_service():
    """Patch MediaUploadService() so each test controls the returned session/result."""
    service_instance = MagicMock()
    with patch(
        "services.media_upload_service.MediaUploadService",
        return_value=service_instance,
    ):
        yield service_instance


@pytest.fixture
def mock_admin_supabase():
    """Mock the admin Supabase client to control ownership lookups."""
    admin = MagicMock()
    with patch(
        "routes.evidence_documents.get_supabase_admin_client",
        return_value=admin,
    ):
        yield admin


def _task_owned_by(admin, user_id: str, task_id: str = "task-1"):
    admin.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": task_id, "user_id": user_id}]
    )


def _no_task(admin):
    admin.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])


def _block_owned_by(admin, user_id: str, block_type: str = "image"):
    single_chain = admin.table.return_value.select.return_value.eq.return_value.single.return_value.execute
    single_chain.return_value = MagicMock(
        data={
            "id": "block-1",
            "block_type": block_type,
            "content": {},
            "user_task_evidence_documents": {"user_id": user_id},
        }
    )


def _no_block(admin):
    single_chain = admin.table.return_value.select.return_value.eq.return_value.single.return_value.execute
    single_chain.return_value = MagicMock(data=None)


# ── task upload-init ─────────────────────────────────────────────────


def test_task_upload_init_returns_signed_url(client, mock_verify_token, mock_admin_supabase, mock_media_service):
    _task_owned_by(mock_admin_supabase, "test-user-123")
    mock_media_service.create_upload_session.return_value = _upload_session()

    resp = client.post(
        "/api/evidence/documents/task-1/upload-init",
        json={"filename": "photo.png", "file_size": 2048, "content_type": "image/png"},
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["success"] is True
    assert body["upload"]["signed_url"].startswith("https://")
    assert body["upload"]["token"] == "tkn"
    assert body["upload"]["bucket"] == "quest-evidence"
    call = mock_media_service.create_upload_session.call_args
    assert call.kwargs["context_type"] == "task"
    assert call.kwargs["context_id"] == "task-1"
    assert call.kwargs["user_id"] == "test-user-123"


def test_task_upload_init_404_when_task_missing(client, mock_verify_token, mock_admin_supabase, mock_media_service):
    _no_task(mock_admin_supabase)
    resp = client.post(
        "/api/evidence/documents/task-1/upload-init",
        json={"filename": "x.png", "file_size": 100},
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 404
    mock_media_service.create_upload_session.assert_not_called()


def test_task_upload_init_403_when_task_not_owned(client, mock_verify_token, mock_admin_supabase, mock_media_service):
    _task_owned_by(mock_admin_supabase, "someone-else")
    resp = client.post(
        "/api/evidence/documents/task-1/upload-init",
        json={"filename": "x.png", "file_size": 100},
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 403
    mock_media_service.create_upload_session.assert_not_called()


def test_task_upload_init_400_when_body_incomplete(client, mock_verify_token, mock_admin_supabase, mock_media_service):
    _task_owned_by(mock_admin_supabase, "test-user-123")
    resp = client.post(
        "/api/evidence/documents/task-1/upload-init",
        json={"filename": "x.png"},  # missing file_size
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 400
    mock_media_service.create_upload_session.assert_not_called()


def test_task_upload_init_maps_file_too_large_to_413(client, mock_verify_token, mock_admin_supabase, mock_media_service):
    _task_owned_by(mock_admin_supabase, "test-user-123")
    mock_media_service.create_upload_session.return_value = _rejected_session(
        "FILE_TOO_LARGE", "File is too large (600MB). Maximum for videos is 500MB."
    )
    resp = client.post(
        "/api/evidence/documents/task-1/upload-init",
        json={"filename": "big.mp4", "file_size": 600 * 1024 * 1024, "block_type": "video"},
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 413


# ── task upload-finalize ─────────────────────────────────────────────


def test_task_upload_finalize_happy_path(client, mock_verify_token, mock_admin_supabase, mock_media_service):
    _task_owned_by(mock_admin_supabase, "test-user-123")
    mock_media_service.finalize_upload.return_value = _upload_result()

    resp = client.post(
        "/api/evidence/documents/task-1/upload-finalize",
        json={
            "storage_path": "evidence-tasks/test-user-123/task-1_ts_photo.png",
            "bucket": "quest-evidence",
        },
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["success"] is True
    assert body["url"].startswith("https://")
    assert body["file_size"] == 2048
    call = mock_media_service.finalize_upload.call_args
    assert call.kwargs["user_id"] == "test-user-123"
    assert call.kwargs["context_type"] == "task"
    assert call.kwargs["context_id"] == "task-1"


def test_task_upload_finalize_returns_video_metadata(client, mock_verify_token, mock_admin_supabase, mock_media_service):
    _task_owned_by(mock_admin_supabase, "test-user-123")
    mock_media_service.finalize_upload.return_value = _upload_result(
        media_type="video",
        filename="clip.mp4",
        content_type="video/mp4",
        thumbnail_url="https://example.invalid/thumb.jpg",
        duration_seconds=42.0,
        width=1920,
        height=1080,
    )

    resp = client.post(
        "/api/evidence/documents/task-1/upload-finalize",
        json={"storage_path": "evidence-tasks/test-user-123/clip.mp4", "bucket": "quest-evidence"},
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["thumbnail_url"] == "https://example.invalid/thumb.jpg"
    assert body["duration_seconds"] == 42.0
    assert body["width"] == 1920


def test_task_upload_finalize_400_when_missing_storage_path(client, mock_verify_token, mock_admin_supabase, mock_media_service):
    _task_owned_by(mock_admin_supabase, "test-user-123")
    resp = client.post(
        "/api/evidence/documents/task-1/upload-finalize",
        json={"bucket": "quest-evidence"},
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 400
    mock_media_service.finalize_upload.assert_not_called()


def test_task_upload_finalize_403_when_not_owner(client, mock_verify_token, mock_admin_supabase, mock_media_service):
    _task_owned_by(mock_admin_supabase, "someone-else")
    resp = client.post(
        "/api/evidence/documents/task-1/upload-finalize",
        json={"storage_path": "p", "bucket": "quest-evidence"},
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 403


def test_task_upload_finalize_maps_video_too_long_to_400(client, mock_verify_token, mock_admin_supabase, mock_media_service):
    _task_owned_by(mock_admin_supabase, "test-user-123")
    mock_media_service.finalize_upload.return_value = _rejected_result(
        "VIDEO_TOO_LONG", "Video is too long (300s)."
    )
    resp = client.post(
        "/api/evidence/documents/task-1/upload-finalize",
        json={"storage_path": "p", "bucket": "quest-evidence"},
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 400
    assert resp.get_json()["error_code"] == "VIDEO_TOO_LONG"


# ── block upload-init ────────────────────────────────────────────────


def test_block_upload_init_uses_block_type_from_db(client, mock_verify_token, mock_admin_supabase, mock_media_service):
    _block_owned_by(mock_admin_supabase, "test-user-123", block_type="video")
    mock_media_service.create_upload_session.return_value = _upload_session(media_type="video")

    resp = client.post(
        "/api/evidence/blocks/block-1/upload-init",
        json={"filename": "clip.mp4", "file_size": 50_000_000},
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 200
    call = mock_media_service.create_upload_session.call_args
    # Block type comes from the DB record, never the client body.
    assert call.kwargs["block_type"] == "video"
    assert call.kwargs["context_type"] == "block"


def test_block_upload_init_404_when_block_missing(client, mock_verify_token, mock_admin_supabase, mock_media_service):
    _no_block(mock_admin_supabase)
    resp = client.post(
        "/api/evidence/blocks/block-1/upload-init",
        json={"filename": "x.png", "file_size": 100},
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 404


def test_block_upload_init_403_when_block_not_owned(client, mock_verify_token, mock_admin_supabase, mock_media_service):
    _block_owned_by(mock_admin_supabase, "someone-else")
    resp = client.post(
        "/api/evidence/blocks/block-1/upload-init",
        json={"filename": "x.png", "file_size": 100},
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 403


def test_block_upload_init_400_when_block_type_is_text(client, mock_verify_token, mock_admin_supabase, mock_media_service):
    _block_owned_by(mock_admin_supabase, "test-user-123", block_type="text")
    resp = client.post(
        "/api/evidence/blocks/block-1/upload-init",
        json={"filename": "x.png", "file_size": 100},
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 400
    mock_media_service.create_upload_session.assert_not_called()


# ── block upload-finalize ────────────────────────────────────────────


def test_block_upload_finalize_writes_url_to_block_content(client, mock_verify_token, mock_admin_supabase, mock_media_service):
    _block_owned_by(mock_admin_supabase, "test-user-123", block_type="image")
    mock_media_service.finalize_upload.return_value = _upload_result(
        media_type="image",
        filename="photo.png",
        content_type="image/png",
    )

    resp = client.post(
        "/api/evidence/blocks/block-1/upload-finalize",
        json={"storage_path": "evidence-blocks/test-user-123/photo.png", "bucket": "quest-evidence"},
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["file_url"].startswith("https://")

    # The block's content should have been updated with the URL + filename.
    update_chain = mock_admin_supabase.table.return_value.update
    update_chain.assert_called()
    update_payload = update_chain.call_args.args[0]
    content = update_payload.get("content") or {}
    assert content.get("url", "").startswith("https://")
    assert content.get("filename") == "photo.png"


def test_block_upload_finalize_reclassifies_image_document(client, mock_verify_token, mock_admin_supabase, mock_media_service):
    """When a user uploads an image as a document block, the block should flip to type 'image'."""
    _block_owned_by(mock_admin_supabase, "test-user-123", block_type="document")
    mock_media_service.finalize_upload.return_value = _upload_result(
        media_type="image",  # HEIC got converted to JPEG
        filename="photo.jpg",
        content_type="image/jpeg",
    )

    resp = client.post(
        "/api/evidence/blocks/block-1/upload-finalize",
        json={"storage_path": "p", "bucket": "quest-evidence"},
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 200
    update_payload = mock_admin_supabase.table.return_value.update.call_args.args[0]
    assert update_payload.get("block_type") == "image"
