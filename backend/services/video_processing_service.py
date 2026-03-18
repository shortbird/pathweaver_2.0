"""
Video Processing Service

Handles video validation, thumbnail generation, and metadata extraction.
Uses FFmpeg/FFprobe for processing with graceful degradation when unavailable.
"""

import subprocess
import tempfile
import os
import json
from dataclasses import dataclass
from typing import Optional

from utils.logger import get_logger
from config.constants import (
    MAX_VIDEO_DURATION_SECONDS,
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
        self._ffmpeg_available = self._check_ffmpeg()

    def _check_ffmpeg(self) -> bool:
        try:
            result = subprocess.run(
                ['ffprobe', '-version'],
                capture_output=True,
                timeout=5,
            )
            available = result.returncode == 0
            if available:
                logger.info("[VideoProcessing] FFmpeg/FFprobe available")
            else:
                logger.warning("[VideoProcessing] FFprobe not available")
            return available
        except (subprocess.TimeoutExpired, FileNotFoundError):
            logger.warning("[VideoProcessing] FFmpeg not installed, video processing will be skipped")
            return False

    def _probe_video(self, file_path: str) -> Optional[dict]:
        """Use ffprobe to get video metadata."""
        if not self._ffmpeg_available:
            return None
        try:
            result = subprocess.run(
                [
                    'ffprobe', '-v', 'quiet',
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
        Transcode video to H.264 if needed for universal browser playback.

        Returns the original bytes if already H.264 or if FFmpeg is unavailable.
        Returns transcoded bytes if the video was HEVC or another non-H.264 codec.
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

            if not self._needs_transcoding(codec):
                logger.info(f"[VideoProcessing] Video is already {codec or 'unknown'}, no transcoding needed")
                return file_content

            logger.info(f"[VideoProcessing] Transcoding from {codec} to H.264...")
            tmp_output = tmp_input + '_h264.mp4'

            result = subprocess.run(
                [
                    'ffmpeg', '-y',
                    '-i', tmp_input,
                    '-c:v', 'libx264',
                    '-preset', 'veryfast',
                    '-crf', '23',
                    '-c:a', 'aac',
                    '-movflags', '+faststart',
                    tmp_output,
                ],
                capture_output=True,
                timeout=300,  # 5 minute timeout for transcoding
            )

            if result.returncode == 0 and os.path.exists(tmp_output):
                with open(tmp_output, 'rb') as f:
                    transcoded = f.read()
                original_size = len(file_content) / (1024 * 1024)
                new_size = len(transcoded) / (1024 * 1024)
                logger.info(
                    f"[VideoProcessing] Transcoded {codec} -> H.264 "
                    f"({original_size:.1f}MB -> {new_size:.1f}MB)"
                )
                return transcoded
            else:
                logger.warning(f"[VideoProcessing] Transcoding failed: {result.stderr[-500:]}")
                return file_content

        except subprocess.TimeoutExpired:
            logger.warning("[VideoProcessing] Transcoding timed out, using original file")
            return file_content
        except Exception as e:
            logger.error(f"[VideoProcessing] Transcoding error: {e}")
            return file_content
        finally:
            if tmp_input and os.path.exists(tmp_input):
                os.unlink(tmp_input)
            if tmp_output and os.path.exists(tmp_output):
                os.unlink(tmp_output)

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
                    'ffmpeg', '-y',
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
