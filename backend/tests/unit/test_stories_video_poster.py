"""The poster frame: optional, never raising, and a real frame when ffmpeg is there.

The first two classes stub the binary out so the suite does not depend on the
wheel. The last one generates a two-frame clip with the bundled ffmpeg and
extracts from it, and is skipped where the wheel is not installed.
"""

from __future__ import annotations

import subprocess

import pytest

from services.stories import video_poster

pytestmark = pytest.mark.unit


class TestWithoutFfmpeg:
    def test_missing_wheel_means_no_poster_and_no_error(self, monkeypatch):
        monkeypatch.setattr(video_poster, 'ffmpeg_path', lambda: None)
        assert video_poster.extract(b'\x00\x00\x00\x18ftypmp42') is None

    def test_empty_bytes_mean_no_poster(self):
        assert video_poster.extract(b'') is None

    def test_a_failing_binary_means_no_poster(self, monkeypatch):
        monkeypatch.setattr(video_poster, 'ffmpeg_path', lambda: '/usr/bin/ffmpeg')

        def broken(exe, args, timeout):
            return subprocess.CompletedProcess(args, 1, b'', b'Invalid data found when processing input')
        monkeypatch.setattr(video_poster, '_run', broken)
        assert video_poster.extract(b'not a video') is None

    def test_a_timeout_means_no_poster(self, monkeypatch):
        monkeypatch.setattr(video_poster, 'ffmpeg_path', lambda: '/usr/bin/ffmpeg')

        def slow(exe, args, timeout):
            raise subprocess.TimeoutExpired(cmd=exe, timeout=timeout)
        monkeypatch.setattr(video_poster, '_run', slow)
        assert video_poster.extract(b'\x00' * 64, timeout=1) is None

    def test_retries_at_zero_when_the_clip_is_shorter_than_the_offset(self, monkeypatch, tmp_path):
        monkeypatch.setattr(video_poster, 'ffmpeg_path', lambda: '/usr/bin/ffmpeg')
        seen = []

        def short_clip(exe, args, timeout):
            at = float(args[args.index('-ss') + 1])
            seen.append(at)
            out = args[-1]
            if at == 0.0:
                with open(out, 'wb') as fh:
                    fh.write(b'\xff\xd8frame')
                return subprocess.CompletedProcess(args, 0, b'', b'  Duration: 00:00:00.50, start: 0')
            return subprocess.CompletedProcess(args, 0, b'', b'  Duration: 00:00:00.50, start: 0')
        monkeypatch.setattr(video_poster, '_run', short_clip)
        poster = video_poster.extract(b'\x00' * 64)
        assert seen == [1.0, 0.0]
        assert poster.jpeg == b'\xff\xd8frame'
        assert poster.duration_seconds == 0.5


class TestDuration:
    def test_parses_the_probe_line(self):
        assert video_poster.parse_duration('  Duration: 00:01:02.34, start: 0.000000') == 62.34
        assert video_poster.parse_duration('Duration: 01:00:00.00') == 3600.0

    def test_no_line_means_none(self):
        assert video_poster.parse_duration('') is None
        assert video_poster.parse_duration('Invalid data') is None


@pytest.mark.skipif(video_poster.ffmpeg_path() is None, reason='imageio-ffmpeg is not installed')
class TestWithTheBundledFfmpeg:
    def test_a_real_clip_yields_a_jpeg_and_its_duration(self, tmp_path):
        exe = video_poster.ffmpeg_path()
        clip = tmp_path / 'clip.mp4'
        subprocess.run([exe, '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi',
                        '-i', 'color=c=blue:s=64x48:d=2', '-pix_fmt', 'yuv420p', str(clip)],
                       check=True, capture_output=True, timeout=60)
        poster = video_poster.extract(clip.read_bytes())
        assert poster is not None
        assert poster.jpeg[:2] == b'\xff\xd8'                    # a JPEG
        assert poster.duration_seconds == pytest.approx(2.0, abs=0.2)

    def test_garbage_bytes_yield_nothing(self):
        assert video_poster.extract(b'\x00\x00\x00\x18ftypmp42' + b'\x00' * 40) is None
