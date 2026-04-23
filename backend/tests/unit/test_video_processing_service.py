"""Unit tests for VideoProcessingService focused on the path-based flow added
to stop OOM kills on Render.

Covers:
- ``probe_from_path`` returns the full VideoProbe (codec + duration + dims + flags)
- ``ensure_h264_from_path`` returns ``None`` when no processing is needed
  (H.264 under compression threshold), so callers skip the background transcode
- ``process_video_background`` takes ownership of ``local_video_path`` and does
  NOT re-download from the public URL when given a local path
- ``process_video_background`` no-ops the re-upload when transcoding returns
  ``None``, and still deletes the local tmp file
"""

from __future__ import annotations

import os
import threading
from unittest.mock import MagicMock, patch

import pytest


# ── probe_from_path ──────────────────────────────────────────────────


def test_probe_from_path_returns_codec_duration_dims():
    from services.video_processing_service import VideoProcessingService

    svc = VideoProcessingService.__new__(VideoProcessingService)
    svc._ffmpeg_available = True
    svc._ffprobe_path = 'ffprobe'
    svc._ffmpeg_path = 'ffmpeg'

    fake_probe = {
        'format': {'duration': '42.5'},
        'streams': [
            {'codec_type': 'video', 'codec_name': 'h264', 'width': 1920, 'height': 1080},
            {'codec_type': 'audio', 'codec_name': 'aac'},
        ],
    }
    with patch.object(svc, '_probe_video', return_value=fake_probe):
        probe = svc.probe_from_path('/tmp/video.mp4', file_size=10_000_000)

    assert probe.duration_seconds == 42.5
    assert probe.codec == 'h264'
    assert probe.width == 1920
    assert probe.height == 1080
    # H.264 + under 25MB → no processing needed.
    assert probe.needs_transcode is False
    assert probe.needs_compression is False
    assert probe.needs_processing is False


def test_probe_from_path_flags_non_h264_for_transcode():
    from services.video_processing_service import VideoProcessingService

    svc = VideoProcessingService.__new__(VideoProcessingService)
    svc._ffmpeg_available = True
    svc._ffprobe_path = 'ffprobe'
    svc._ffmpeg_path = 'ffmpeg'

    with patch.object(
        svc,
        '_probe_video',
        return_value={
            'format': {'duration': '10'},
            'streams': [{'codec_type': 'video', 'codec_name': 'hevc', 'width': 1280, 'height': 720}],
        },
    ):
        probe = svc.probe_from_path('/tmp/video.mp4', file_size=5_000_000)

    assert probe.codec == 'hevc'
    assert probe.needs_transcode is True
    assert probe.needs_compression is False
    assert probe.needs_processing is True


def test_probe_from_path_flags_oversized_for_compression():
    from services.video_processing_service import VideoProcessingService
    from config.constants import MAX_VIDEO_COMPRESSION_THRESHOLD

    svc = VideoProcessingService.__new__(VideoProcessingService)
    svc._ffmpeg_available = True
    svc._ffprobe_path = 'ffprobe'
    svc._ffmpeg_path = 'ffmpeg'

    with patch.object(
        svc,
        '_probe_video',
        return_value={
            'format': {'duration': '60'},
            'streams': [{'codec_type': 'video', 'codec_name': 'h264', 'width': 1920, 'height': 1080}],
        },
    ):
        probe = svc.probe_from_path('/tmp/video.mp4', file_size=MAX_VIDEO_COMPRESSION_THRESHOLD + 1)

    assert probe.codec == 'h264'
    assert probe.needs_transcode is False
    assert probe.needs_compression is True
    assert probe.needs_processing is True


def test_probe_from_path_no_ffmpeg_returns_no_processing_needed():
    from services.video_processing_service import VideoProcessingService

    svc = VideoProcessingService.__new__(VideoProcessingService)
    svc._ffmpeg_available = False

    probe = svc.probe_from_path('/tmp/video.mp4', file_size=500_000_000)
    # Without ffmpeg we can't do anything, so caller must skip -- regardless of size.
    assert probe.needs_processing is False


# ── ensure_h264_from_path ─────────────────────────────────────────────


def test_ensure_h264_from_path_returns_none_when_no_processing_needed(tmp_path):
    """H.264 under compression threshold → None (caller keeps the original)."""
    from services.video_processing_service import VideoProcessingService

    svc = VideoProcessingService.__new__(VideoProcessingService)
    svc._ffmpeg_available = True
    svc._ffprobe_path = 'ffprobe'
    svc._ffmpeg_path = 'ffmpeg'

    input_path = tmp_path / "video.mp4"
    input_path.write_bytes(b"fake mp4 header bytes")

    with patch.object(
        svc,
        '_probe_video',
        return_value={'streams': [{'codec_type': 'video', 'codec_name': 'h264'}]},
    ):
        result = svc.ensure_h264_from_path(str(input_path), file_size=5_000_000)

    assert result is None
    # Input must not be deleted -- caller owns it.
    assert input_path.exists()


def test_ensure_h264_from_path_returns_none_when_ffmpeg_unavailable(tmp_path):
    from services.video_processing_service import VideoProcessingService

    svc = VideoProcessingService.__new__(VideoProcessingService)
    svc._ffmpeg_available = False

    input_path = tmp_path / "video.mp4"
    input_path.write_bytes(b"fake")

    assert svc.ensure_h264_from_path(str(input_path), file_size=5_000_000) is None
    assert input_path.exists()


def test_ensure_h264_from_path_returns_output_path_on_successful_transcode(tmp_path):
    from services.video_processing_service import VideoProcessingService

    svc = VideoProcessingService.__new__(VideoProcessingService)
    svc._ffmpeg_available = True
    svc._ffprobe_path = 'ffprobe'
    svc._ffmpeg_path = 'ffmpeg'

    input_path = tmp_path / "video.mp4"
    input_path.write_bytes(b"input")

    fake_result = MagicMock(returncode=0, stderr=b"")

    # ffmpeg is faked; we simulate success by writing the expected output file ourselves.
    def fake_run(args, **_kw):
        # Last positional arg in our command list is the output path.
        out = args[-1]
        with open(out, 'wb') as f:
            f.write(b"transcoded output")
        return fake_result

    with patch.object(
        svc,
        '_probe_video',
        return_value={'streams': [{'codec_type': 'video', 'codec_name': 'hevc'}]},
    ), patch('services.video_processing_service.subprocess.run', side_effect=fake_run):
        result = svc.ensure_h264_from_path(str(input_path), file_size=5_000_000)

    assert result is not None
    assert os.path.exists(result)
    # Caller (not ensure_h264_from_path) is responsible for deleting output -- but we'll clean up in the test.
    os.unlink(result)
    # Input must not be deleted.
    assert input_path.exists()


def test_ensure_h264_from_path_cleans_up_on_ffmpeg_failure(tmp_path):
    from services.video_processing_service import VideoProcessingService

    svc = VideoProcessingService.__new__(VideoProcessingService)
    svc._ffmpeg_available = True
    svc._ffprobe_path = 'ffprobe'
    svc._ffmpeg_path = 'ffmpeg'

    input_path = tmp_path / "video.mp4"
    input_path.write_bytes(b"input")

    fake_result = MagicMock(returncode=1, stderr=b"ffmpeg failed")

    with patch.object(
        svc,
        '_probe_video',
        return_value={'streams': [{'codec_type': 'video', 'codec_name': 'hevc'}]},
    ), patch('services.video_processing_service.subprocess.run', return_value=fake_result):
        result = svc.ensure_h264_from_path(str(input_path), file_size=5_000_000)

    assert result is None


# ── process_video_background ──────────────────────────────────────────


def _drain_threads():
    """Wait for any daemon threads kicked off by the test to drain (up to 5s)."""
    for t in list(threading.enumerate()):
        if t is threading.current_thread() or not t.is_alive():
            continue
        if t.name.startswith(('Thread', 'MainThread')):
            t.join(timeout=5)


def test_process_video_background_uses_local_path_and_skips_download(tmp_path):
    """When a local_video_path is supplied, the background thread must NOT
    call requests.get -- the whole point of the memory fix."""
    from services.video_processing_service import VideoProcessingService

    svc = VideoProcessingService.__new__(VideoProcessingService)
    svc._ffmpeg_available = True
    svc._ffprobe_path = 'ffprobe'
    svc._ffmpeg_path = 'ffmpeg'

    local = tmp_path / "local.mp4"
    local.write_bytes(b"some bytes")

    # ensure_h264_from_path returns None → no re-upload path, just cleanup.
    with patch('services.video_processing_service.requests.get') as mock_get, patch.object(
        svc, 'ensure_h264_from_path', return_value=None
    ):
        svc.process_video_background(
            public_url='https://example.invalid/video.mp4',
            storage_path='bucket/path/video.mp4',
            bucket_name='quest-evidence',
            user_id='u',
            local_video_path=str(local),
            file_size=10,
        )
        _drain_threads()

    mock_get.assert_not_called()
    # Thread must have taken ownership and deleted the local tmp file.
    assert not local.exists()


def test_process_video_background_deletes_local_path_when_ffmpeg_unavailable(tmp_path):
    from services.video_processing_service import VideoProcessingService

    svc = VideoProcessingService.__new__(VideoProcessingService)
    svc._ffmpeg_available = False

    local = tmp_path / "local.mp4"
    local.write_bytes(b"x")

    svc.process_video_background(
        public_url='https://example.invalid/x',
        storage_path='bucket/x',
        bucket_name='quest-evidence',
        user_id='u',
        local_video_path=str(local),
    )
    # No thread in the no-ffmpeg path; cleanup is synchronous.
    assert not local.exists()


def test_process_video_background_streams_download_when_no_local_path(tmp_path):
    """Without a local path, the thread streams the download in chunks --
    it must NOT call response.content (which would buffer the whole payload
    as Python bytes)."""
    from services.video_processing_service import VideoProcessingService

    svc = VideoProcessingService.__new__(VideoProcessingService)
    svc._ffmpeg_available = True
    svc._ffprobe_path = 'ffprobe'
    svc._ffmpeg_path = 'ffmpeg'

    fake_response = MagicMock(status_code=200)
    fake_response.__enter__ = MagicMock(return_value=fake_response)
    fake_response.__exit__ = MagicMock(return_value=False)
    fake_response.iter_content = MagicMock(return_value=iter([b"chunk1", b"chunk2"]))
    # Accessing .content on the mock would indicate a regression; make it blow up.
    type(fake_response).content = property(
        lambda self: (_ for _ in ()).throw(AssertionError("must not read .content"))
    )

    with patch('services.video_processing_service.requests.get', return_value=fake_response), patch.object(
        svc, 'ensure_h264_from_path', return_value=None
    ):
        svc.process_video_background(
            public_url='https://example.invalid/x.mp4',
            storage_path='bucket/x.mp4',
            bucket_name='quest-evidence',
            user_id='u',
        )
        _drain_threads()

    fake_response.iter_content.assert_called_once()


def test_process_video_background_uploads_via_file_handle_not_bytes(tmp_path):
    """When transcoding produces an output, the background thread must upload
    it via a file handle (streamed) rather than passing raw bytes."""
    from services.video_processing_service import VideoProcessingService

    svc = VideoProcessingService.__new__(VideoProcessingService)
    svc._ffmpeg_available = True
    svc._ffprobe_path = 'ffprobe'
    svc._ffmpeg_path = 'ffmpeg'

    local = tmp_path / "local.mp4"
    local.write_bytes(b"original")
    # ensure_h264_from_path simulates producing a transcoded file.
    output = tmp_path / "local.mp4_h264.mp4"
    output.write_bytes(b"transcoded")

    fake_supabase = MagicMock()
    fake_storage = MagicMock()
    fake_supabase.storage.from_ = MagicMock(return_value=fake_storage)

    with patch('services.video_processing_service.requests.get') as mock_get, patch.object(
        svc, 'ensure_h264_from_path', return_value=str(output)
    ), patch('supabase.create_client', return_value=fake_supabase), patch(
        'app_config.Config'
    ) as mock_config:
        mock_config.SUPABASE_URL = 'https://x'
        mock_config.SUPABASE_SERVICE_ROLE_KEY = 'k'

        svc.process_video_background(
            public_url='https://example.invalid/x.mp4',
            storage_path='bucket/x.mp4',
            bucket_name='quest-evidence',
            user_id='u',
            local_video_path=str(local),
            file_size=10,
        )
        _drain_threads()

    mock_get.assert_not_called()
    # upload must have been called once, with a file-like object (has .read()) not bytes.
    assert fake_storage.upload.call_count == 1
    upload_kwargs = fake_storage.upload.call_args.kwargs
    file_arg = upload_kwargs.get('file')
    assert hasattr(file_arg, 'read'), f"upload 'file' kwarg must be a file handle, got {type(file_arg)}"
    # Both tmp files must be cleaned up.
    assert not local.exists()
    assert not output.exists()
