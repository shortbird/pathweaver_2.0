"""Route-level tests for /api/uploads/evidence and /evidence/base64.

These endpoints were rewritten in 2026-04-14 to route through
MediaUploadService with security_scan=True. The tests verify the
integration: service is invoked, legacy response shape is preserved,
security rejections map to HTTP 400, and size caps map to 413.
"""

from __future__ import annotations

import base64
import io
from unittest.mock import MagicMock, patch

import pytest
from werkzeug.datastructures import FileStorage


@pytest.fixture
def upload_client(client):
    """A Flask test client with a mocked @require_auth + admin client.

    Patches at the module path where routes/uploads.py resolves the
    decorator at import time. `mock_verify_token` isn't used directly
    because the auth path pulls the user_id from the Flask request
    context helper, which the client-fixture helper already wires up.
    """
    return client


def _ok_upload_result(**overrides):
    """Build a MediaUploadResult-shaped success."""
    from services.media_upload_service import MediaUploadResult

    defaults = {
        "success": True,
        "file_url": "https://cdn.example/storage/v1/object/public/quest-evidence/u/1.png",
        "filename": "1.png",
        "file_size": 12,
        "content_type": "image/png",
        "media_type": "image",
        "sha256_hash": "deadbeef" * 8,
    }
    defaults.update(overrides)
    return MediaUploadResult(**defaults)


def _rejected_upload_result(error_code: str = "SECURITY_REJECTED", message: str = "nope"):
    from services.media_upload_service import MediaUploadResult

    return MediaUploadResult(
        success=False,
        error_message=message,
        error_code=error_code,
    )


@pytest.fixture
def mock_media_service():
    """Patch the MediaUploadService constructor so tests can control upload_evidence_file."""
    service_instance = MagicMock()
    with patch(
        "services.media_upload_service.MediaUploadService",
        return_value=service_instance,
    ):
        yield service_instance


@pytest.fixture
def authed(mock_verify_token):
    """Enable @require_auth to resolve to a stable user_id."""
    # mock_verify_token already patches session_manager + token_utils paths
    # to return 'test-user-123'. Yield for clarity.
    yield "test-user-123"


# ── /evidence (multipart) ─────────────────────────────────────────────


def test_evidence_rejects_when_no_files_field(upload_client, authed):
    resp = upload_client.post(
        "/api/uploads/evidence",
        data={},  # no 'files' key
        content_type="multipart/form-data",
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 400
    assert "No files" in resp.get_json()["error"]


def test_evidence_routes_successful_upload_through_service(upload_client, authed, mock_media_service):
    mock_media_service.upload_evidence_file.return_value = _ok_upload_result()

    resp = upload_client.post(
        "/api/uploads/evidence",
        data={"files": (io.BytesIO(b"PNGDATA"), "shot.png", "image/png")},
        content_type="multipart/form-data",
        headers={"Authorization": "Bearer t"},
    )

    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["count"] == 1
    entry = payload["files"][0]
    # Legacy response shape preserved
    assert entry["original_name"] == "shot.png"
    assert entry["stored_name"] == "1.png"
    assert entry["url"].startswith("https://cdn.example/")
    assert entry["sha256_hash"].startswith("deadbeef")

    # Service was invoked with security_scan=True
    call = mock_media_service.upload_evidence_file.call_args
    assert call.kwargs["security_scan"] is True
    assert call.kwargs["context_type"] == "task_evidence"


def test_evidence_security_rejection_maps_to_400(upload_client, authed, mock_media_service):
    mock_media_service.upload_evidence_file.return_value = _rejected_upload_result(
        "SECURITY_REJECTED", "polyglot detected"
    )

    resp = upload_client.post(
        "/api/uploads/evidence",
        data={"files": (io.BytesIO(b"x"), "bad.png", "image/png")},
        content_type="multipart/form-data",
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 400
    assert "polyglot" in resp.get_json()["error"]


def test_evidence_too_large_maps_to_413(upload_client, authed, mock_media_service):
    mock_media_service.upload_evidence_file.return_value = _rejected_upload_result(
        "FILE_TOO_LARGE", "File is too large"
    )

    resp = upload_client.post(
        "/api/uploads/evidence",
        data={"files": (io.BytesIO(b"x"), "big.png", "image/png")},
        content_type="multipart/form-data",
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 413


# ── /evidence/base64 ──────────────────────────────────────────────────


def test_base64_decodes_and_routes_through_service(upload_client, authed, mock_media_service):
    mock_media_service.upload_evidence_file.return_value = _ok_upload_result(filename="a.png")

    b64 = base64.b64encode(b"PNGDATA").decode()
    resp = upload_client.post(
        "/api/uploads/evidence/base64",
        json={"files": [{"filename": "a.png", "content": b64, "content_type": "image/png"}]},
        headers={"Authorization": "Bearer t"},
    )

    assert resp.status_code == 200
    assert resp.get_json()["count"] == 1

    # Service received a FileStorage-shaped object, not a raw bytes blob
    file_arg = mock_media_service.upload_evidence_file.call_args.args[0]
    assert isinstance(file_arg, FileStorage)
    assert file_arg.filename == "a.png"


def test_base64_rejects_invalid_encoding(upload_client, authed):
    resp = upload_client.post(
        "/api/uploads/evidence/base64",
        json={"files": [{"filename": "a.png", "content": "!!!not-base64!!!", "content_type": "image/png"}]},
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 400
    assert "base64" in resp.get_json()["error"].lower()


def test_base64_rejects_missing_files_field(upload_client, authed):
    resp = upload_client.post(
        "/api/uploads/evidence/base64",
        json={},
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 400
