"""One still frame from a video, for the card, the og:image and the poster.

The bundled ffmpeg from the `imageio-ffmpeg` wheel, so production needs no
system package; the wheel is optional at runtime and every path through here
returns None instead of raising. A story whose video has no poster still
publishes: the page falls back to the browser's own first frame.

The frame is taken from a video the safety pass already inspected across every
frame (services/stories/safety.py, `_check_video`), so it needs no second
check. The bytes go through `anonymize.prepare_public_image` in assets.py
before they reach the bucket, like every other image.

Why a temp file and not stdin: an mp4's moov atom is usually at the end of the
file, and ffmpeg cannot seek a pipe.
"""

from __future__ import annotations

import os
import re
import subprocess
import tempfile
from dataclasses import dataclass
from typing import List, Optional

from utils.logger import get_logger

logger = get_logger(__name__)

#: Where in the clip to take the frame. Not the first frame: a phone video
#: often opens on a black frame or a hand over the lens.
DEFAULT_AT_SECONDS = 1.0
DEFAULT_TIMEOUT = 30

_DURATION_RE = re.compile(r'Duration:\s*(\d+):(\d\d):(\d\d(?:\.\d+)?)')


@dataclass
class Poster:
    jpeg: bytes
    duration_seconds: Optional[float]


def ffmpeg_path() -> Optional[str]:
    """The bundled binary, or None when the wheel is not installed."""
    try:
        import imageio_ffmpeg
    except ImportError:
        return None
    try:
        return str(imageio_ffmpeg.get_ffmpeg_exe())
    except Exception as e:  # noqa: BLE001
        logger.warning(f'imageio-ffmpeg is installed but has no binary: {e}')
        return None


def parse_duration(stderr: str) -> Optional[float]:
    """ffmpeg prints `Duration: HH:MM:SS.ff` while probing the input."""
    m = _DURATION_RE.search(stderr or '')
    if not m:
        return None
    hours, minutes, seconds = m.groups()
    try:
        return round(int(hours) * 3600 + int(minutes) * 60 + float(seconds), 2)
    except ValueError:
        return None


def _run(exe: str, args: List[str], timeout: int) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run([exe, *args], capture_output=True, timeout=timeout, check=False)


def extract(blob: bytes, *, at_seconds: float = DEFAULT_AT_SECONDS,
            timeout: int = DEFAULT_TIMEOUT) -> Optional[Poster]:
    """One JPEG frame at `at_seconds`, or the first frame when the clip is
    shorter than that, plus the clip's duration. None when anything fails."""
    if not blob:
        return None
    exe = ffmpeg_path()
    if not exe:
        logger.info('No ffmpeg for a story poster; the page will use the first frame')
        return None
    with tempfile.TemporaryDirectory(prefix='story-poster-') as folder:
        src = os.path.join(folder, 'in')
        out = os.path.join(folder, 'out.jpg')
        with open(src, 'wb') as fh:
            fh.write(blob)
        duration: Optional[float] = None
        for at in (at_seconds, 0.0):
            try:
                proc = _run(exe, ['-hide_banner', '-y', '-ss', f'{at:.2f}', '-i', src,
                                  '-frames:v', '1', '-f', 'image2', '-vcodec', 'mjpeg',
                                  '-q:v', '3', out], timeout)
            except subprocess.TimeoutExpired:
                logger.warning(f'ffmpeg timed out after {timeout}s extracting a story poster')
                return None
            except OSError as e:
                logger.warning(f'ffmpeg could not run for a story poster: {e}')
                return None
            duration = duration or parse_duration(proc.stderr.decode('utf-8', 'replace'))
            if proc.returncode == 0 and os.path.exists(out) and os.path.getsize(out) > 0:
                with open(out, 'rb') as fh:
                    return Poster(jpeg=fh.read(), duration_seconds=duration)
            if at == 0.0:
                break
        logger.warning('ffmpeg produced no poster frame for a story video')
        return None
