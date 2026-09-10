"""Reaching the evidence that does not live in our storage.

A student's evidence is not all files we hold. Half of it is links: a Google Doc
they wrote the reflection in, a YouTube video of the performance, a page they
published. A reviewer opens those by clicking. A model cannot, so this module
turns each into either text, bytes, or an honest "could not read it".

Two rules run through everything here:

**Never fetch the string the student pasted, when a canonical form exists.** For
Google files we extract the file id and REBUILD the export URL, the same shape
services/sis_schedule_sync_service.py uses for timetable sheets. A pasted URL can
carry anything after the id; a rebuilt one carries what we chose.

**Every fetch goes through utils.ssrf.safe_get**, which re-validates each
redirect hop. The URL came from a text box a student typed in, so the request is
attacker-controlled by construction, and `requests`' own redirect following would
walk happily from a public host to the cloud metadata service.
"""

from __future__ import annotations

import io
import re
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from utils.logger import get_logger
from utils.ssrf import SSRFError, safe_get

logger = get_logger(__name__)

# Pretend to be a browser-ish crawler. Some publishers serve an interstitial to
# anything that does not look like one, and the resulting page has no content.
USER_AGENT = 'Mozilla/5.0 (compatible; OptioBot/1.0; +https://www.optioeducation.com)'

CONNECT_TIMEOUT = 5
READ_TIMEOUT = 20

# ── link classification ──────────────────────────────────────────────────────

_GOOGLE_DOC_RE = re.compile(r'docs\.google\.com/document/d/([A-Za-z0-9_-]+)')
_GOOGLE_SLIDES_RE = re.compile(r'docs\.google\.com/presentation/d/([A-Za-z0-9_-]+)')
_GOOGLE_SHEET_RE = re.compile(r'docs\.google\.com/spreadsheets/d/([A-Za-z0-9_-]+)')
_GOOGLE_DRIVE_RE = re.compile(r'drive\.google\.com/file/d/([A-Za-z0-9_-]+)')
_GOOGLE_DRIVE_OPEN_RE = re.compile(r'drive\.google\.com/(?:open|uc)\?[^\s]*id=([A-Za-z0-9_-]+)')
_GID_RE = re.compile(r'[#&?]gid=(\d+)')

# Same expression the web app uses to recognize a YouTube link
# (web/src/utils/videoUtils.js), so what a student sees embedded is what the
# model is told about.
_YOUTUBE_RE = re.compile(
    r'(?:youtube\.com/(?:[^/]+/.+/|(?:v|e(?:mbed)?)/|.*[?&]v=)|youtu\.be/)([^"&?/\s]{11})'
)
_VIMEO_RE = re.compile(r'vimeo\.com/(?:video/)?(\d+)')


def classify_url(url: str) -> Tuple[str, Dict[str, str]]:
    """What kind of link this is, and the ids needed to fetch it.

    Returns ``(source, extracted)`` where source is one of google_doc,
    google_slides, google_sheet, google_drive, youtube, vimeo, web.
    """
    if not url or not isinstance(url, str):
        return 'web', {}
    m = _GOOGLE_DOC_RE.search(url)
    if m:
        return 'google_doc', {'file_id': m.group(1)}
    m = _GOOGLE_SLIDES_RE.search(url)
    if m:
        return 'google_slides', {'file_id': m.group(1)}
    m = _GOOGLE_SHEET_RE.search(url)
    if m:
        gid = _GID_RE.search(url)
        out = {'file_id': m.group(1)}
        if gid:
            out['gid'] = gid.group(1)
        return 'google_sheet', out
    m = _GOOGLE_DRIVE_RE.search(url) or _GOOGLE_DRIVE_OPEN_RE.search(url)
    if m:
        return 'google_drive', {'file_id': m.group(1)}
    m = _YOUTUBE_RE.search(url)
    if m:
        return 'youtube', {'video_id': m.group(1)}
    m = _VIMEO_RE.search(url)
    if m:
        return 'vimeo', {'video_id': m.group(1)}
    return 'web', {}


def export_url(source: str, extracted: Dict[str, str]) -> Optional[str]:
    """The canonical export URL for a Google file, rebuilt from its id."""
    file_id = extracted.get('file_id')
    if not file_id:
        return None
    if source == 'google_doc':
        return f'https://docs.google.com/document/d/{file_id}/export?format=txt'
    if source == 'google_slides':
        return f'https://docs.google.com/presentation/d/{file_id}/export/pdf'
    if source == 'google_sheet':
        gid = extracted.get('gid')
        base = f'https://docs.google.com/spreadsheets/d/{file_id}/export?format=csv'
        return f'{base}&gid={gid}' if gid else base
    if source == 'google_drive':
        return f'https://drive.google.com/uc?export=download&id={file_id}'
    return None


def youtube_watch_url(video_id: str) -> str:
    """The canonical watch URL. Built from the id, never from the pasted string."""
    return f'https://www.youtube.com/watch?v={video_id}'


# ── fetching ─────────────────────────────────────────────────────────────────

@dataclass
class Fetched:
    """What came back from a URL, or why nothing did."""
    ok: bool
    content_type: Optional[str] = None
    body: Optional[bytes] = None
    text: Optional[str] = None
    reason: Optional[str] = None      # set when ok is False, shown to the reviewer
    truncated: bool = False


#: A Google export that answers with HTML is not a document -- it is the sign-in
#: page, which is what "Anyone with the link" being off looks like from here.
_SHARING_OFF_HOSTS = ('accounts.google.com', 'workspace.google.com')


def fetch_bytes(url: str, *, max_bytes: int,
                accept: Optional[str] = None) -> Fetched:
    """GET a URL and return its body, capped at ``max_bytes``.

    Streamed and counted rather than trusting Content-Length: a server can lie
    about it, or omit it, and this process has 512MB.
    """
    headers = {'User-Agent': USER_AGENT}
    if accept:
        headers['Accept'] = accept
    try:
        resp = safe_get(url, timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
                        headers=headers, stream=True)
    except SSRFError as e:
        logger.info(f'AI credit review refused to fetch a link: {e}')
        return Fetched(ok=False, reason='the link points somewhere we do not fetch')
    except Exception as e:  # noqa: BLE001
        logger.info(f'AI credit review could not fetch a link: {e}')
        return Fetched(ok=False, reason='the link could not be opened')

    try:
        if resp.status_code in (401, 403):
            return Fetched(ok=False, reason='the link is not public')
        if resp.status_code >= 400:
            return Fetched(ok=False, reason=f'the link returned {resp.status_code}')

        final_host = ''
        try:
            from urllib.parse import urlparse
            final_host = (urlparse(resp.url).hostname or '').lower()
        except (ValueError, AttributeError) as e:
            # An unparseable final URL only costs us the sign-in detection
            # below, so the fetch still returns its body -- but say so, because
            # the alternative reading is "this Google file IS shared".
            logger.debug(f'Could not read the final host of a fetched link: {e}')
        if any(host in final_host for host in _SHARING_OFF_HOSTS):
            return Fetched(ok=False, reason='the link asks for a sign-in')

        content_type = (resp.headers.get('Content-Type') or '').split(';')[0].strip().lower()

        chunks: List[bytes] = []
        total = 0
        truncated = False
        for chunk in resp.iter_content(chunk_size=64 * 1024):
            if not chunk:
                continue
            chunks.append(chunk)
            total += len(chunk)
            if total >= max_bytes:
                truncated = True
                break
        return Fetched(ok=True, content_type=content_type,
                       body=b''.join(chunks)[:max_bytes], truncated=truncated)
    finally:
        try:
            resp.close()
        except OSError as e:
            # A socket that will not close cleanly leaks one connection, which
            # matters on a 512MB container running two reviews at once.
            logger.debug(f'Could not close a fetched response: {e}')


def fetch_google_export(source: str, extracted: Dict[str, str], *,
                        max_bytes: int) -> Fetched:
    """Export a Google file, and recognize the sharing-off page for what it is.

    A Doc exported as text answers ``text/plain``. When sharing is off it
    answers ``text/html`` -- the sign-in page -- with a 200, so the content type
    is the tell, not the status code. Reported as "not shared" rather than as a
    parse failure, because the fix is one setting the student can change.
    """
    url = export_url(source, extracted)
    if not url:
        return Fetched(ok=False, reason='the link is not a file we can export')

    result = fetch_bytes(url, max_bytes=max_bytes)
    if not result.ok:
        return result

    ctype = result.content_type or ''
    if source in ('google_doc', 'google_sheet') and ctype.startswith('text/html'):
        return Fetched(ok=False, reason=(
            "the Google file is not shared (set it to 'Anyone with the link can view')"))
    if source == 'google_slides' and not ctype.startswith('application/pdf'):
        return Fetched(ok=False, reason=(
            "the Google file is not shared (set it to 'Anyone with the link can view')"))
    if source == 'google_drive' and ctype.startswith('text/html'):
        return Fetched(ok=False, reason=(
            "the Drive file is not shared (set it to 'Anyone with the link can view')"))
    return result


def readable_page_text(html: bytes, *, max_chars: int) -> Optional[str]:
    """The words on a page, without the furniture around them."""
    if not html:
        return None
    try:
        from bs4 import BeautifulSoup
    except ImportError:  # pragma: no cover - beautifulsoup4 is in requirements
        return None

    try:
        soup = BeautifulSoup(html, 'html.parser')
    except Exception as e:  # noqa: BLE001
        logger.debug(f'Could not parse a page for the AI credit reviewer: {e}')
        return None

    for tag in soup(['script', 'style', 'noscript', 'nav', 'header', 'footer',
                     'form', 'iframe', 'svg']):
        tag.decompose()

    title = (soup.title.string or '').strip() if soup.title and soup.title.string else ''
    body = soup.get_text(' ', strip=True)
    text = f'{title}\n\n{body}' if title else body
    text = ' '.join(text.split())
    return text[:max_chars] if text else None


def fetch_oembed(source: str, video_id: str) -> Optional[str]:
    """A video's title and author, when the video itself cannot be watched.

    Not much, but it is the difference between telling the model "there is a
    video here called Bridge Load Test, by this student" and telling it nothing.
    """
    if source == 'youtube':
        url = ('https://www.youtube.com/oembed?format=json&url='
               f'https%3A//www.youtube.com/watch%3Fv%3D{video_id}')
    elif source == 'vimeo':
        url = f'https://vimeo.com/api/oembed.json?url=https%3A//vimeo.com/{video_id}'
    else:
        return None

    result = fetch_bytes(url, max_bytes=64 * 1024, accept='application/json')
    if not result.ok or not result.body:
        return None
    try:
        import json
        data = json.loads(result.body.decode('utf-8', errors='replace'))
    except Exception:  # noqa: BLE001
        return None
    if not isinstance(data, dict):
        return None

    bits = [data.get('title'), data.get('author_name'), data.get('description')]
    parts = [str(b).strip() for b in bits if b]
    return ' — '.join(parts)[:2000] if parts else None


# ── Gemini File API ──────────────────────────────────────────────────────────
#
# Video and audio outgrow the ~20MB inline request limit almost immediately: a
# two-minute phone clip is 40MB. The File API takes the upload separately and
# hands back a handle the request can reference.
#
# Every upload is deleted in the caller's `finally`. The API expires them after
# 48 hours on its own, but a child's video sitting on someone else's file store
# for two days because we did not clean up is not a defensible default.

FILE_API_POLL_SECONDS = 3
FILE_API_MAX_WAIT_SECONDS = 120


def upload_to_file_api(blob: bytes, *, mime_type: str,
                       display_name: str) -> Tuple[Optional[Any], Optional[str]]:
    """Upload bytes and wait for Gemini to finish processing them.

    Returns ``(file_handle, error)``. A file that never reaches ACTIVE is an
    error, not a handle: referencing a still-PROCESSING file fails the whole
    request, which would lose the rest of the evidence along with the video.
    """
    try:
        import google.generativeai as genai
    except ImportError:  # pragma: no cover
        return None, 'the file uploader is unavailable'

    try:
        handle = genai.upload_file(
            io.BytesIO(blob), mime_type=mime_type, display_name=display_name[:120])
    except Exception as e:  # noqa: BLE001
        logger.warning(f'File API upload failed for {display_name!r}: {e}')
        return None, 'the file could not be uploaded for review'

    deadline = time.monotonic() + FILE_API_MAX_WAIT_SECONDS
    while time.monotonic() < deadline:
        state = getattr(getattr(handle, 'state', None), 'name', None)
        if state == 'ACTIVE':
            return handle, None
        if state == 'FAILED':
            delete_file(handle)
            return None, 'the file could not be processed for review'
        time.sleep(FILE_API_POLL_SECONDS)
        try:
            handle = genai.get_file(handle.name)
        except Exception as e:  # noqa: BLE001
            logger.warning(f'File API poll failed for {display_name!r}: {e}')
            return None, 'the file could not be processed for review'

    delete_file(handle)
    return None, 'the file took too long to process'


def delete_file(handle: Any) -> None:
    """Remove an uploaded file. Never raises -- this runs in a `finally`."""
    name = getattr(handle, 'name', None)
    if not name:
        return
    try:
        import google.generativeai as genai
        genai.delete_file(name)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Could not delete uploaded file {name}: {e}')


def youtube_part(video_id: str) -> Optional[Any]:
    """A YouTube URL as a part the model can watch, or None if unsupported."""
    try:
        from google.generativeai import protos
        return protos.Part(file_data=protos.FileData(
            file_uri=youtube_watch_url(video_id), mime_type='video/*'))
    except Exception as e:  # noqa: BLE001
        logger.debug(f'Could not build a YouTube part: {e}')
        return None
