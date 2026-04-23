"""
Video Processing Service

Handles video validation, thumbnail generation, and metadata extraction.
Uses FFmpeg/FFprobe for processing with graceful degradation when unavailable.
"""

import subprocess
import sys
import tempfile
import os
import json
import threading
import requests
from dataclasses import dataclass
from typing import Optional

from utils.logger import get_logger
from config.constants import (
    MAX_VIDEO_DURATION_SECONDS,
    MAX_VIDEO_COMPRESSION_THRESHOLD,
    VIDEO_THUMBNAIL_WIDTH,
    VIDEO_THUMBNAIL_QUALITY,
)

logger = get_logger(__name__)


@dataclass
class VideoMetadata:
    """Result of video processing"""
    thumbnail_url: Optional[str] = None
    duration_seconds: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None


@dataclass
class VideoProbe:
    """Single-probe result used to decide whether a video needs background processing.

    Built by `probe_from_path`. The `needs_processing` property is the contract
    callers use to skip the download+transcode round-trip entirely when the
    uploaded video is already H.264 under the compression threshold -- which is
    the common case for mobile uploads and is what was driving Render OOMs.
    """
    duration_seconds: Optional[float] = None
    codec: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    needs_transcode: bool = False
    needs_compression: bool = False

    @property
    def needs_processing(self) -> bool:
        return self.needs_transcode or self.needs_compression


class VideoProcessingService:
    """Processes uploaded videos: validates duration, extracts metadata, generates thumbnails."""

    def __init__(self):
        self._ffprobe_path = 'ffprobe'
        self._ffmpeg_path = 'ffmpeg'
        self._ffmpeg_available = self._check_ffmpeg()

    def _check_ffmpeg(self) -> bool:
        # Try system PATH first, then check next to the Python executable
        for ffprobe_candidate in ['ffprobe', os.path.join(os.path.dirname(sys.executable), 'ffprobe')]:
            try:
                result = subprocess.run(
                    [ffprobe_candidate, '-version'],
                    capture_output=True,
                    timeout=5,
                )
                if result.returncode == 0:
                    self._ffprobe_path = ffprobe_candidate
                    # Derive ffmpeg path from the same directory
                    ffmpeg_dir = os.path.dirname(ffprobe_candidate) if os.sep in ffprobe_candidate else ''
                    self._ffmpeg_path = os.path.join(ffmpeg_dir, 'ffmpeg') if ffmpeg_dir else 'ffmpeg'
                    logger.info(f"[VideoProcessing] FFmpeg/FFprobe available at: {ffprobe_candidate}")
                    return True
            except (subprocess.TimeoutExpired, FileNotFoundError):
                continue

        logger.warning("[VideoProcessing] FFmpeg not installed, video processing will be skipped")
        return False

    def _probe_video(self, file_path: str) -> Optional[dict]:
        """Use ffprobe to get video metadata."""
        if not self._ffmpeg_available:
            return None
        try:
            result = subprocess.run(
                [
                    self._ffprobe_path, '-v', 'quiet',
                    '-print_format', 'json',
                    '-show_format', '-show_streams',
                    file_path,
                ],
                capture_output=True,
                text=True,
                timeout=30,
            )
            if result.returncode == 0:
                return json.loads(result.stdout)
            logger.warning(f"[VideoProcessing] ffprobe failed: {result.stderr[:200]}")
            return None
        except (subprocess.TimeoutExpired, json.JSONDecodeError, FileNotFoundError) as e:
            logger.warning(f"[VideoProcessing] ffprobe error: {e}")
            return None

    def _get_video_codec(self, probe_data: dict) -> Optional[str]:
        """Extract the video codec name from ffprobe output."""
        if not probe_data:
            return None
        for stream in probe_data.get('streams', []):
            if stream.get('codec_type') == 'video':
                return stream.get('codec_name', '').lower()
        return None

    def _needs_transcoding(self, codec_name: Optional[str]) -> bool:
        """Check if the video codec needs transcoding to H.264."""
        if not codec_name:
            return False
        # H.264 is universally supported -- everything else may not be
        return codec_name != 'h264'

    def probe_from_path(self, path: str, file_size: int) -> VideoProbe:
        """Probe a video file on disk to decide whether it needs backend processing.

        Combines codec detection (`needs_transcode`) and size check
        (`needs_compression`) into a single ffprobe call so callers can skip
        the background transcode round-trip entirely when neither is required.

        If ffprobe is unavailable or fails, returns a probe with
        `needs_processing == False`: we can't transcode anyway, so the caller
        should skip the background job.
        """
        probe_data = self._probe_video(path) if self._ffmpeg_available else None
        codec = self._get_video_codec(probe_data) if probe_data else None

        duration = None
        width = None
        height = None
        if probe_data:
            try:
                duration = float(probe_data.get('format', {}).get('duration', 0)) or None
            except (TypeError, ValueError):
                duration = None
            for stream in probe_data.get('streams', []) or []:
                if stream.get('codec_type') == 'video':
                    width = stream.get('width')
                    height = stream.get('height')
                    break

        return VideoProbe(
            duration_seconds=duration,
            codec=codec,
            width=width,
            height=height,
            needs_transcode=self._needs_transcoding(codec) if self._ffmpeg_available else False,
            needs_compression=self._ffmpeg_available and file_size > MAX_VIDEO_COMPRESSION_THRESHOLD,
        )

    def ensure_h264_from_path(self, input_path: str, file_size: int) -> Optional[str]:
        """Transcode/compress a video on disk. Returns a new tmp path the caller
        must delete when done, or ``None`` if no processing was needed (or
        failed -- caller should keep the original).

        Unlike the old bytes-based ``ensure_h264``, this never loads the full
        video into Python memory: ffmpeg reads/writes files directly, and the
        caller uploads the output via a streamed file handle. With
        ``MAX_VIDEO_SIZE_SIGNED = 500MB`` a single upload previously allocated
        >1GB of heap (original ``bytes`` + transcoded ``bytes``) and OOM-killed
        the 512Mi Render starter worker.

        Does NOT delete ``input_path`` -- that's the caller's responsibility.
        """
        if not self._ffmpeg_available:
            return None

        probe = self._probe_video(input_path)
        codec = self._get_video_codec(probe)
        needs_transcode = self._needs_transcoding(codec)
        needs_compression = file_size > MAX_VIDEO_COMPRESSION_THRESHOLD

        if not needs_transcode and not needs_compression:
            logger.info(
                f"[VideoProcessing] Video is {codec or 'unknown'}, "
                f"{file_size / (1024 * 1024):.1f}MB -- no processing needed"
            )
            return None

        reason = []
        if needs_transcode:
            reason.append(f"codec {codec} -> H.264")
        if needs_compression:
            reason.append(f"compress {file_size / (1024 * 1024):.1f}MB -> <=50MB")
        logger.info(f"[VideoProcessing] Processing video: {', '.join(reason)}")

        tmp_output = input_path + '_h264.mp4'

        args = [
            self._ffmpeg_path, '-y',
            '-i', input_path,
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',  # Force 8-bit (10-bit H.264 not supported by Firefox/WMF)
            '-c:a', 'aac',
            '-movflags', '+faststart',
        ]

        if needs_compression:
            args.extend(['-preset', 'fast', '-crf', '28'])
            args.extend(['-vf', 'scale=-2:min(ih\\,720)'])
        else:
            args.extend(['-preset', 'veryfast', '-crf', '23'])

        args.append(tmp_output)

        try:
            result = subprocess.run(args, capture_output=True, timeout=300)
        except subprocess.TimeoutExpired:
            logger.warning("[VideoProcessing] Processing timed out, using original file")
            self._safe_unlink(tmp_output)
            return None
        except Exception as e:
            logger.error(f"[VideoProcessing] Processing error: {e}")
            self._safe_unlink(tmp_output)
            return None

        if result.returncode == 0 and os.path.exists(tmp_output):
            original_mb = file_size / (1024 * 1024)
            new_mb = os.path.getsize(tmp_output) / (1024 * 1024)
            logger.info(f"[VideoProcessing] Done: ({original_mb:.1f}MB -> {new_mb:.1f}MB)")
            return tmp_output

        logger.warning(f"[VideoProcessing] Processing failed: {result.stderr[-500:]!r}")
        self._safe_unlink(tmp_output)
        return None

    def _safe_unlink(self, path: Optional[str]) -> None:
        if path and os.path.exists(path):
            try:
                os.unlink(path)
            except Exception:
                logger.debug("failed to unlink tmp file", exc_info=True)

    def process_video_background(
        self,
        public_url,
        storage_path,
        bucket_name,
        user_id,
        local_video_path: Optional[str] = None,
        file_size: Optional[int] = None,
    ):
        """Process a video in a background thread after it has already been uploaded.

        If ``local_video_path`` is provided, the background thread takes
        ownership of that file (unlinks it on completion) and skips the
        download step -- avoiding a second round-trip through Render memory
        when the caller already has the video on disk from duration/thumbnail
        extraction.

        Otherwise the thread streams the video from ``public_url`` to a new
        tmp file in 64 KB chunks. Either way, the full video never sits in
        Python ``bytes`` in the web worker's heap -- only ffmpeg's (small,
        streamed) process memory and supabase-py's upload buffer.

        Sends a notification to the user if processing fails.
        """
        if not self._ffmpeg_available:
            # No ffmpeg means no transcoding is possible anyway. Still need to
            # clean up the caller's tmp file if they handed it over.
            if local_video_path:
                self._safe_unlink(local_video_path)
            return

        def _process():
            tmp_input = local_video_path
            owns_input = local_video_path is not None  # thread is now responsible for cleanup
            tmp_output = None
            try:
                logger.info(f"[VideoProcessing:BG] Starting background processing for {storage_path}")

                if tmp_input is None:
                    # Stream the raw video from Supabase to disk without buffering
                    # the whole payload as Python bytes.
                    with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as tmp:
                        tmp_input = tmp.name
                        with requests.get(public_url, stream=True, timeout=300) as r:
                            if r.status_code != 200:
                                logger.error(f"[VideoProcessing:BG] Failed to download video: HTTP {r.status_code}")
                                self._notify_failure(user_id, "Could not download video for processing")
                                return
                            for chunk in r.iter_content(chunk_size=64 * 1024):
                                if chunk:
                                    tmp.write(chunk)
                    owns_input = True

                size = file_size if file_size is not None else os.path.getsize(tmp_input)

                # Transcode/compress via ffmpeg (path in, path out). Returns
                # None if no processing was needed or ffmpeg failed.
                tmp_output = self.ensure_h264_from_path(tmp_input, size)
                if tmp_output is None:
                    logger.info(f"[VideoProcessing:BG] No processing needed for {storage_path}")
                    return

                # Re-upload the processed version via a streamed file handle.
                # Background thread has no Flask app context, so build a fresh client.
                from supabase import create_client
                from app_config import Config
                supabase = create_client(Config.SUPABASE_URL, Config.SUPABASE_SERVICE_ROLE_KEY)

                # Delete old file first (Supabase doesn't support overwrite).
                try:
                    supabase.storage.from_(bucket_name).remove([storage_path])
                except Exception:
                    logger.debug("intentional swallow", exc_info=True)

                with open(tmp_output, 'rb') as f:
                    supabase.storage.from_(bucket_name).upload(
                        path=storage_path,
                        file=f,
                        file_options={"content-type": "video/mp4"},
                    )

                original_mb = size / (1024 * 1024)
                new_mb = os.path.getsize(tmp_output) / (1024 * 1024)
                logger.info(
                    f"[VideoProcessing:BG] Done: {storage_path} ({original_mb:.1f}MB -> {new_mb:.1f}MB)"
                )

            except Exception as e:
                logger.error(f"[VideoProcessing:BG] Failed for {storage_path}: {e}", exc_info=True)
                self._notify_failure(user_id, "Video processing failed. The original video was kept.")
            finally:
                if owns_input:
                    self._safe_unlink(tmp_input)
                self._safe_unlink(tmp_output)

        thread = threading.Thread(target=_process, daemon=True)
        thread.start()

    def _notify_failure(self, user_id, message):
        """Send a notification to the user about a video processing failure."""
        try:
            from services.notification_service import NotificationService
            svc = NotificationService()
            svc.create_notification(
                user_id=user_id,
                notification_type='video_processing',
                title='Video Processing Issue',
                message=message,
            )
        except Exception as e:
            logger.error(f"[VideoProcessing:BG] Failed to send notification: {e}")

    def validate_duration(self, file_content: bytes) -> tuple[bool, Optional[float]]:
        """
        Validate video duration is within allowed limit.
        Returns (is_valid, duration_seconds).
        If FFmpeg is unavailable, returns (True, None) -- graceful skip.
        """
        if not self._ffmpeg_available:
            return True, None

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as tmp:
                tmp.write(file_content)
                tmp_path = tmp.name

            return self.validate_duration_from_path(tmp_path)
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)

    def validate_duration_from_path(self, file_path: str) -> tuple[bool, Optional[float]]:
        """
        Validate video duration from an existing file on disk.
        Avoids writing bytes to a temp file when caller already has one.
        """
        if not self._ffmpeg_available:
            return True, None

        probe = self._probe_video(file_path)
        if not probe:
            return True, None

        duration = float(probe.get('format', {}).get('duration', 0))
        if duration > MAX_VIDEO_DURATION_SECONDS:
            return False, duration
        return True, duration

    def process_video(self, file_content: bytes, storage_upload_fn=None) -> VideoMetadata:
        """
        Full video processing pipeline: extract metadata and generate thumbnail.

        Args:
            file_content: Raw video bytes
            storage_upload_fn: Optional callable(thumb_bytes, thumb_filename) -> public_url
                              Used to upload thumbnail to Supabase Storage.

        Returns:
            VideoMetadata with whatever could be extracted.
        """
        if not self._ffmpeg_available:
            logger.info("[VideoProcessing] FFmpeg unavailable, skipping processing")
            return VideoMetadata()

        tmp_video_path = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as tmp:
                tmp.write(file_content)
                tmp_video_path = tmp.name

            return self.process_video_from_path(tmp_video_path, storage_upload_fn=storage_upload_fn)
        except Exception as e:
            logger.error(f"[VideoProcessing] Processing error: {e}")
            return VideoMetadata()
        finally:
            if tmp_video_path and os.path.exists(tmp_video_path):
                os.unlink(tmp_video_path)

    def process_video_from_path(self, video_path: str, storage_upload_fn=None) -> VideoMetadata:
        """
        Full video processing from an existing file on disk.
        Avoids writing bytes to a temp file when caller already has one.

        Args:
            video_path: Path to video file on disk
            storage_upload_fn: Optional callable(thumb_bytes, thumb_filename) -> public_url

        Returns:
            VideoMetadata with whatever could be extracted.
        """
        metadata = VideoMetadata()

        if not self._ffmpeg_available:
            logger.info("[VideoProcessing] FFmpeg unavailable, skipping processing")
            return metadata

        tmp_thumb_path = None
        try:
            # Extract metadata via ffprobe
            probe = self._probe_video(video_path)
            if probe:
                metadata.duration_seconds = float(probe.get('format', {}).get('duration', 0))

                # Find video stream for dimensions
                for stream in probe.get('streams', []):
                    if stream.get('codec_type') == 'video':
                        metadata.width = stream.get('width')
                        metadata.height = stream.get('height')
                        break

            # Generate thumbnail
            tmp_thumb_path = video_path + '_thumb.jpg'
            thumb_result = subprocess.run(
                [
                    self._ffmpeg_path, '-y',
                    '-i', video_path,
                    '-ss', '00:00:01',  # 1 second in (avoids black frames)
                    '-vframes', '1',
                    '-vf', f'scale={VIDEO_THUMBNAIL_WIDTH}:-1',
                    '-q:v', str(VIDEO_THUMBNAIL_QUALITY),
                    tmp_thumb_path,
                ],
                capture_output=True,
                timeout=60,
            )

            if thumb_result.returncode == 0 and os.path.exists(tmp_thumb_path):
                if storage_upload_fn:
                    with open(tmp_thumb_path, 'rb') as f:
                        thumb_bytes = f.read()
                    if thumb_bytes:
                        metadata.thumbnail_url = storage_upload_fn(thumb_bytes, 'thumbnail.jpg')
                        logger.info(f"[VideoProcessing] Thumbnail generated and uploaded")
            else:
                logger.warning(f"[VideoProcessing] Thumbnail generation failed: {thumb_result.stderr[:200]}")

        except subprocess.TimeoutExpired:
            logger.warning("[VideoProcessing] Processing timed out")
        except Exception as e:
            logger.error(f"[VideoProcessing] Processing error: {e}")
        finally:
            if tmp_thumb_path and os.path.exists(tmp_thumb_path):
                os.unlink(tmp_thumb_path)

        return metadata


# Global instance
video_processing_service = VideoProcessingService()
