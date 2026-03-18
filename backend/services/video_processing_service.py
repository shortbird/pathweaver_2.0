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

    def ensure_h264(self, file_content: bytes) -> bytes:
        """
        Transcode video to H.264 if needed and compress large files.

        - Non-H.264 codecs (HEVC, VP9, etc.) are transcoded to H.264.
        - Files over 50MB are compressed (capped at 720p, higher CRF).
        - Already-H.264 files under 50MB pass through unchanged.
        """
        if not self._ffmpeg_available:
            return file_content

        tmp_input = None
        tmp_output = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as tmp:
                tmp.write(file_content)
                tmp_input = tmp.name

            probe = self._probe_video(tmp_input)
            codec = self._get_video_codec(probe)
            needs_transcode = self._needs_transcoding(codec)
            needs_compression = len(file_content) > MAX_VIDEO_COMPRESSION_THRESHOLD

            if not needs_transcode and not needs_compression:
                logger.info(f"[VideoProcessing] Video is {codec or 'unknown'}, {len(file_content) / (1024*1024):.1f}MB -- no processing needed")
                return file_content

            reason = []
            if needs_transcode:
                reason.append(f"codec {codec} -> H.264")
            if needs_compression:
                reason.append(f"compress {len(file_content) / (1024*1024):.1f}MB -> <=50MB")
            logger.info(f"[VideoProcessing] Processing video: {', '.join(reason)}")

            tmp_output = tmp_input + '_h264.mp4'

            args = [
                self._ffmpeg_path, '-y',
                '-i', tmp_input,
                '-c:v', 'libx264',
                '-pix_fmt', 'yuv420p',  # Force 8-bit (10-bit H.264 not supported by Firefox/WMF)
                '-c:a', 'aac',
                '-movflags', '+faststart',
            ]

            if needs_compression:
                # Compress: cap resolution at 720p and use higher CRF
                args.extend(['-preset', 'fast', '-crf', '28'])
                args.extend(['-vf', 'scale=-2:min(ih\\,720)'])
            else:
                # Just transcode codec, preserve quality
                args.extend(['-preset', 'veryfast', '-crf', '23'])

            args.append(tmp_output)

            result = subprocess.run(
                args,
                capture_output=True,
                timeout=300,
            )

            if result.returncode == 0 and os.path.exists(tmp_output):
                with open(tmp_output, 'rb') as f:
                    transcoded = f.read()
                original_size = len(file_content) / (1024 * 1024)
                new_size = len(transcoded) / (1024 * 1024)
                logger.info(
                    f"[VideoProcessing] Done: "
                    f"({original_size:.1f}MB -> {new_size:.1f}MB)"
                )
                return transcoded
            else:
                logger.warning(f"[VideoProcessing] Processing failed: {result.stderr[-500:]}")
                return file_content

        except subprocess.TimeoutExpired:
            logger.warning("[VideoProcessing] Processing timed out, using original file")
            return file_content
        except Exception as e:
            logger.error(f"[VideoProcessing] Processing error: {e}")
            return file_content
        finally:
            if tmp_input and os.path.exists(tmp_input):
                os.unlink(tmp_input)
            if tmp_output and os.path.exists(tmp_output):
                os.unlink(tmp_output)

    def process_video_background(self, public_url, storage_path, bucket_name, user_id):
        """
        Process a video in a background thread after it has already been uploaded.

        Downloads the raw video from Supabase, transcodes/compresses as needed,
        then re-uploads the processed version to the same path.
        Sends a notification to the user if processing fails.
        """
        if not self._ffmpeg_available:
            return

        def _process():
            try:
                logger.info(f"[VideoProcessing:BG] Starting background processing for {storage_path}")

                # Download the raw video from Supabase
                response = requests.get(public_url, timeout=120)
                if response.status_code != 200:
                    logger.error(f"[VideoProcessing:BG] Failed to download video: HTTP {response.status_code}")
                    self._notify_failure(user_id, "Could not download video for processing")
                    return

                file_content = response.content
                original_size = len(file_content)

                # Process (transcode + compress if needed)
                processed = self.ensure_h264(file_content)

                # If nothing changed, no need to re-upload
                if processed is file_content:
                    logger.info(f"[VideoProcessing:BG] No processing needed for {storage_path}")
                    return

                # Re-upload the processed version (overwrite original)
                # Create client directly (background thread has no Flask app context)
                from supabase import create_client
                from app_config import Config
                supabase = create_client(Config.SUPABASE_URL, Config.SUPABASE_SERVICE_ROLE_KEY)

                # Delete old file first, then upload new one (Supabase doesn't support overwrite)
                try:
                    supabase.storage.from_(bucket_name).remove([storage_path])
                except Exception:
                    pass  # File may already be gone

                supabase.storage.from_(bucket_name).upload(
                    path=storage_path,
                    file=processed,
                    file_options={"content-type": "video/mp4"}
                )

                new_size = len(processed)
                logger.info(
                    f"[VideoProcessing:BG] Done: {storage_path} "
                    f"({original_size / (1024*1024):.1f}MB -> {new_size / (1024*1024):.1f}MB)"
                )

            except Exception as e:
                logger.error(f"[VideoProcessing:BG] Failed for {storage_path}: {e}", exc_info=True)
                self._notify_failure(user_id, f"Video processing failed. The original video was kept.")

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

            probe = self._probe_video(tmp_path)
            if not probe:
                return True, None

            duration = float(probe.get('format', {}).get('duration', 0))
            if duration > MAX_VIDEO_DURATION_SECONDS:
                return False, duration
            return True, duration
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)

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
        metadata = VideoMetadata()

        if not self._ffmpeg_available:
            logger.info("[VideoProcessing] FFmpeg unavailable, skipping processing")
            return metadata

        tmp_video_path = None
        tmp_thumb_path = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as tmp:
                tmp.write(file_content)
                tmp_video_path = tmp.name

            # Extract metadata via ffprobe
            probe = self._probe_video(tmp_video_path)
            if probe:
                metadata.duration_seconds = float(probe.get('format', {}).get('duration', 0))

                # Find video stream for dimensions
                for stream in probe.get('streams', []):
                    if stream.get('codec_type') == 'video':
                        metadata.width = stream.get('width')
                        metadata.height = stream.get('height')
                        break

            # Generate thumbnail
            tmp_thumb_path = tmp_video_path + '_thumb.jpg'
            thumb_result = subprocess.run(
                [
                    self._ffmpeg_path, '-y',
                    '-i', tmp_video_path,
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
            if tmp_video_path and os.path.exists(tmp_video_path):
                os.unlink(tmp_video_path)
            if tmp_thumb_path and os.path.exists(tmp_thumb_path):
                os.unlink(tmp_thumb_path)

        return metadata


# Global instance
video_processing_service = VideoProcessingService()
