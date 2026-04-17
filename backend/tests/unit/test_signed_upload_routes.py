"""Route-level tests for signed-upload endpoints on learning_events, parent,
advisor, and generic /uploads routes.

Only the happy path + the most critical auth/ownership checks are covered
here — exhaustive init/finalize behaviour is tested in
test_evidence_documents_signed_upload.py (same MediaUploadService under
each endpoint).
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


def _ok_session():
    from services.media_upload_service import UploadSession

    return UploadSession(
        success=True,
        signed_url="https://example.invalid/upload?token=tkn",
        token="tkn",
        storage_path="learning-events/test-user-123/abc_photo.png",
        bucket="quest-evidence",
        final_url="https://example.invalid/final",
        media_type="image",
        max_size=10 * 1024 * 1024,
    )


def _ok_result(media_type="image", filename="photo.png"):
    from services.media_upload_service import MediaUploadResult

    return MediaUploadResult(
        success=True,
        file_url="https://example.invalid/final",
        filename=filename,
        file_size=2048,
        content_type=f"{media_type}/png" if media_type == "image" else "video/mp4",
        media_type=media_type,
    )


@pytest.fixture
def mock_media_service():
    service_instance = MagicMock()
    with patch(
        "services.media_upload_service.MediaUploadService",
        return_value=service_instance,
    ):
        yield service_instance


# ── learning_events ───────────────────────────────────────────────────


@pytest.fixture
def mock_events_admin():
    # learning_events/evidence.py imports get_supabase_admin_client inside each
    # function, so patch at the source module instead of the route module.
    admin = MagicMock()
    with patch("database.get_supabase_admin_client", return_value=admin):
        yield admin


def _event_owned_by(admin, user_id: str):
    single = admin.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute
    single.return_value = MagicMock(data={"id": "event-1"})


def _no_event(admin):
    single = admin.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute
    single.return_value = MagicMock(data=None)


def test_event_upload_init_happy_path(client, mock_verify_token, mock_events_admin, mock_media_service):
    _event_owned_by(mock_events_admin, "test-user-123")
    mock_media_service.create_upload_session.return_value = _ok_session()
    resp = client.post(
        "/api/learning-events/event-1/upload-init",
        json={"filename": "photo.png", "file_size": 2048},
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 200
    assert resp.get_json()["upload"]["token"] == "tkn"


def test_event_upload_init_404_when_event_missing(client, mock_verify_token, mock_events_admin, mock_media_service):
    _no_event(mock_events_admin)
    resp = client.post(
        "/api/learning-events/event-1/upload-init",
        json={"filename": "x.png", "file_size": 100},
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 404
    mock_media_service.create_upload_session.assert_not_called()


def test_event_upload_finalize_happy_path(client, mock_verify_token, mock_events_admin, mock_media_service):
    _event_owned_by(mock_events_admin, "test-user-123")
    mock_media_service.finalize_upload.return_value = _ok_result()
    resp = client.post(
        "/api/learning-events/event-1/upload-finalize",
        json={"storage_path": "p", "bucket": "quest-evidence"},
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 200
    assert resp.get_json()["file_url"].startswith("https://")


# ── parent learning moments ───────────────────────────────────────────


@pytest.fixture
def mock_parent_admin():
    admin = MagicMock()
    with patch(
        "routes.parent.learning_moments.get_supabase_admin_client",
        return_value=admin,
    ), patch(
        "routes.parent.learning_moments.verify_parent_access",
        return_value=None,
    ):
        yield admin


def test_parent_moment_upload_init_happy_path(client, mock_verify_token, mock_parent_admin, mock_media_service):
    mock_media_service.create_upload_session.return_value = _ok_session()
    resp = client.post(
        "/api/parent/children/child-1/learning-moments/upload-init",
        json={"filename": "clip.mp4", "file_size": 100_000_000, "block_type": "video"},
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 200
    call = mock_media_service.create_upload_session.call_args
    assert call.kwargs["context_type"] == "moment"
    assert call.kwargs["context_id"] == "child-1"


def test_parent_moment_upload_finalize_notifies_child(client, mock_verify_token, mock_parent_admin, mock_media_service):
    """notify_user_id must default to child_id so video-processing failures notify the student."""
    mock_media_service.finalize_upload.return_value = _ok_result("video", "clip.mp4")
    resp = client.post(
        "/api/parent/children/child-1/learning-moments/upload-finalize",
        json={"storage_path": "p", "bucket": "user-uploads"},
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 200
    call = mock_media_service.finalize_upload.call_args
    assert call.kwargs["notify_user_id"] == "child-1"


def test_parent_moment_block_upload_init_requires_captured_by_user(client, mock_verify_token, mock_parent_admin, mock_media_service):
    """A parent can only upload to moments they captured themselves."""
    # Moment exists but captured by a DIFFERENT parent.
    mock_parent_admin.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
        data={"id": "moment-1", "captured_by_user_id": "different-parent"}
    )
    resp = client.post(
        "/api/parent/children/child-1/learning-moments/moment-1/upload-init",
        json={"filename": "x.png", "file_size": 100},
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 403
    mock_media_service.create_upload_session.assert_not_called()


def test_parent_moment_block_upload_init_happy_path(client, mock_verify_token, mock_parent_admin, mock_media_service):
    mock_parent_admin.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
        data={"id": "moment-1", "captured_by_user_id": "test-user-123"}
    )
    mock_media_service.create_upload_session.return_value = _ok_session()
    resp = client.post(
        "/api/parent/children/child-1/learning-moments/moment-1/upload-init",
        json={"filename": "x.png", "file_size": 100},
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 200
    call = mock_media_service.create_upload_session.call_args
    assert call.kwargs["context_type"] == "moment_block"
    assert call.kwargs["sub_id"] == "moment-1"


# ── advisor learning moments ──────────────────────────────────────────


@pytest.fixture
def mock_advisor_admin():
    admin = MagicMock()
    with patch(
        "routes.advisor.learning_moments.get_supabase_admin_client",
        return_value=admin,
    ), patch(
        "routes.advisor.learning_moments.verify_advisor_access",
        return_value=None,
    ):
        yield admin


def test_advisor_moment_upload_init_happy_path(client, mock_verify_token, mock_advisor_admin, mock_media_service):
    mock_media_service.create_upload_session.return_value = _ok_session()
    resp = client.post(
        "/api/advisor/students/student-1/learning-moments/upload-init",
        json={"filename": "photo.png", "file_size": 1024},
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 200
    call = mock_media_service.create_upload_session.call_args
    assert call.kwargs["context_type"] == "moment"
    assert call.kwargs["context_id"] == "student-1"


def test_advisor_moment_upload_finalize_happy_path(client, mock_verify_token, mock_advisor_admin, mock_media_service):
    mock_media_service.finalize_upload.return_value = _ok_result()
    resp = client.post(
        "/api/advisor/students/student-1/learning-moments/upload-finalize",
        json={"storage_path": "p", "bucket": "user-uploads"},
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 200
    call = mock_media_service.finalize_upload.call_args
    assert call.kwargs["notify_user_id"] == "student-1"


# ── generic /api/uploads/sign + /finalize ─────────────────────────────


@pytest.fixture
def mock_uploads_admin():
    admin = MagicMock()
    with patch(
        "routes.uploads.get_supabase_admin_client",
        return_value=admin,
    ):
        yield admin


def test_uploads_sign_default_context(client, mock_verify_token, mock_uploads_admin, mock_media_service):
    mock_media_service.create_upload_session.return_value = _ok_session()
    resp = client.post(
        "/api/uploads/sign",
        json={"filename": "photo.png", "file_size": 1024},
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 200
    call = mock_media_service.create_upload_session.call_args
    # Default context when not specified.
    assert call.kwargs["context_type"] == "task_evidence"
    assert call.kwargs["context_id"] == "generic"


def test_uploads_sign_explicit_context(client, mock_verify_token, mock_uploads_admin, mock_media_service):
    mock_media_service.create_upload_session.return_value = _ok_session()
    resp = client.post(
        "/api/uploads/sign",
        json={
            "filename": "photo.png",
            "file_size": 1024,
            "context_type": "moment",
            "context_id": "child-9",
        },
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 200
    call = mock_media_service.create_upload_session.call_args
    assert call.kwargs["context_type"] == "moment"
    assert call.kwargs["context_id"] == "child-9"


def test_uploads_sign_400_when_missing_fields(client, mock_verify_token, mock_uploads_admin, mock_media_service):
    resp = client.post(
        "/api/uploads/sign",
        json={"filename": "photo.png"},  # missing file_size
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 400
    mock_media_service.create_upload_session.assert_not_called()


def test_uploads_finalize_happy_path(client, mock_verify_token, mock_uploads_admin, mock_media_service):
    mock_media_service.finalize_upload.return_value = _ok_result()
    resp = client.post(
        "/api/uploads/finalize",
        json={"storage_path": "p", "bucket": "quest-evidence"},
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 200
    body = resp.get_json()
    # Both `url` and `file_url` are surfaced for compatibility.
    assert body["url"].startswith("https://")
    assert body["file_url"] == body["url"]
