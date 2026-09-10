"""Turning a student's submitted evidence into something a model can read.

The hard part is not the reading. It is that a block's declared ``block_type``
records which picker the student opened, not what the file is. A photo pasted
into the Link picker is a ``link`` block holding a .jpg; a PDF renamed to .docx is
still a PDF. The web app learned this on 2026-09-02, when a teacher was shown a
URL where a picture belonged (web/src/utils/evidenceItems.js). Trusting the
declared type here is worse than cosmetic: it decides whether a model is handed
an image, a document, or nothing at all.

So every branch below is chosen by what the BYTES are -- sniffed with
python-magic -- and the declared type is only ever a hint of last resort.

Three other rules, each with a reason:

  **Bytes are downloaded, never linked.** `quest-evidence` is a private bucket,
  so a URL handed to the model resolves to nothing. That is the same "Bucket not
  found" the review queue used to show.

  **Every skip is named.** A reviewer needs to know the AI read four of five
  blocks and which one it missed. Silently reading less produces a confident
  verdict over evidence nobody knows was absent.

  **The budget is spent in order.** Blocks are numbered before anything is
  fetched, so [E4] is the fourth block whether or not [E2] was too big to read.
  The model cites those numbers and the reviewer clicks them.
"""

from __future__ import annotations

import hashlib
import io
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from utils.evidence_labels import block_items, describable_ref, truncate
from utils.logger import get_logger
from utils.storage_urls import parse_object_ref

from services.credit_ai_review import fetchers

logger = get_logger(__name__)


@dataclass
class Budget:
    """What one review is allowed to spend.

    The inline ceiling is the load-bearing one: Gemini's inline request limit is
    about 20MB including the prompt, and going over does not degrade, it fails
    the whole call.
    """
    max_items: int = 30
    max_attachments: int = 12
    max_inline_bytes: int = 18 * 1024 * 1024
    max_text_chars: int = 150_000
    max_seconds: float = 90.0

    # Per-item ceilings.
    max_download_bytes: int = 100 * 1024 * 1024
    max_image_inline_bytes: int = 6 * 1024 * 1024
    max_pdf_inline_bytes: int = 10 * 1024 * 1024
    max_pdf_inline_pages: int = 100
    max_media_inline_bytes: int = 15 * 1024 * 1024
    max_file_api_bytes: int = 100 * 1024 * 1024
    max_file_api_uploads: int = 2
    max_youtube_parts: int = 1
    max_web_bytes: int = 2 * 1024 * 1024
    max_export_bytes: int = 10 * 1024 * 1024

    # Text caps, per source.
    text_block_chars: int = 8_000
    document_chars: int = 40_000
    web_chars: int = 15_000
    csv_rows: int = 500

    @classmethod
    def from_config(cls) -> 'Budget':
        from app_config import Config
        return cls(max_inline_bytes=int(Config.CREDIT_AI_REVIEW_INLINE_BUDGET_MB) * 1024 * 1024)


@dataclass
class EvidencePart:
    """One item of evidence, and how (or whether) the model got to see it."""
    block_index: int          # 1-based, stable: the [E<n>] the model cites
    item_index: int           # position within the block
    block_id: Optional[str]
    block_type: str           # as declared -- untrusted
    label: str                # filename or title, NEVER a storage URL
    source: str               # typed | upload | google_doc | ... | youtube | web
    kind: str = 'skipped'     # text | inline | file_api | file_uri | skipped
    mime_type: Optional[str] = None
    text: Optional[str] = None
    data: Optional[bytes] = None
    file_ref: Any = None
    byte_size: int = 0
    uploaded_by_role: str = 'student'
    skip_reason: Optional[str] = None
    note: Optional[str] = None       # e.g. "read as text, the PDF was too large"

    @property
    def was_read(self) -> bool:
        return self.kind != 'skipped'

    def manifest_entry(self) -> Dict[str, Any]:
        """What the stored review records about this item.

        No bytes, no URL. A reviewer needs to know what the AI looked at and
        what it could not open; the payload is not the place for either.
        """
        return {
            'index': self.block_index,
            'item': self.item_index,
            'block_id': self.block_id,
            'block_type': self.block_type,
            'label': self.label,
            'source': self.source,
            'status': 'read' if self.was_read else 'skipped',
            'how': self.kind,
            'skip_reason': self.skip_reason,
            'note': self.note,
            'uploaded_by_role': self.uploaded_by_role,
        }


@dataclass
class LoadResult:
    parts: List[EvidencePart] = field(default_factory=list)
    flags: List[str] = field(default_factory=list)
    inline_bytes: int = 0
    text_chars: int = 0
    file_handles: List[Any] = field(default_factory=list)
    block_count: int = 0
    load_ms: int = 0
    fingerprint: Optional[str] = None

    @property
    def read_parts(self) -> List[EvidencePart]:
        return [p for p in self.parts if p.was_read]

    @property
    def anything_readable(self) -> bool:
        return bool(self.read_parts)

    def stats(self) -> Dict[str, Any]:
        return {
            'blocks': self.block_count,
            'items': len(self.parts),
            'read': len(self.read_parts),
            'skipped': len(self.parts) - len(self.read_parts),
            'inline_bytes': self.inline_bytes,
            'text_chars': self.text_chars,
            'file_api_files': len(self.file_handles),
            'load_ms': self.load_ms,
        }

    def manifest(self) -> List[Dict[str, Any]]:
        return [p.manifest_entry() for p in self.parts]


# ── MIME sniffing ────────────────────────────────────────────────────────────

_EXT_MIME = {
    'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'jfif': 'image/jpeg',
    'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp',
    'heic': 'image/heic', 'heif': 'image/heif', 'avif': 'image/avif',
    'tiff': 'image/tiff', 'tif': 'image/tiff', 'bmp': 'image/bmp',
    'pdf': 'application/pdf', 'txt': 'text/plain', 'csv': 'text/csv',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'mp4': 'video/mp4', 'mov': 'video/quicktime', 'webm': 'video/webm',
    'm4v': 'video/x-m4v', 'avi': 'video/x-msvideo', 'mkv': 'video/x-matroska',
    'mpg': 'video/mpeg', 'mpeg': 'video/mpeg', '3gp': 'video/3gpp',
    'wmv': 'video/x-ms-wmv', 'ogv': 'video/ogg',
    'm4a': 'audio/mp4', 'mp3': 'audio/mpeg', 'wav': 'audio/wav',
    'aac': 'audio/aac', 'ogg': 'audio/ogg',
}

#: python-magic answers 'application/zip' for a .docx (it is a zip) and
#: 'application/octet-stream' for plenty of ordinary files. In those cases the
#: declared type or the extension is better information than the sniff.
_UNHELPFUL_SNIFFS = ('application/zip', 'application/octet-stream',
                     'application/x-empty', 'inode/x-empty', '')

#: Sniffs that are true but not specific enough to route by. A spreadsheet
#: export is 'text/plain' to libmagic, and reading it as prose sends 900 rows of
#: comma-separated numbers into the prompt instead of the first 500 rows of a
#: table. The extension is the more useful fact here, so it wins -- but only
#: among these, and only when it agrees the bytes are text.
_REFINABLE_TEXT_SNIFFS = ('text/plain', 'text/x-csv', 'application/csv')


def sniff_mime(blob: bytes, *, declared: Optional[str] = None,
               filename: Optional[str] = None) -> str:
    """What these bytes actually are.

    The sniff wins, except where libmagic is known to be less specific than the
    metadata we already hold -- a .docx is a zip, and saying so would send a
    Word document down the "unknown format" path.
    """
    sniffed = ''
    try:
        import magic  # python-magic; present in requirements, used by file_validator
        if hasattr(magic, 'from_buffer'):
            sniffed = (magic.from_buffer(blob[:8192], mime=True) or '').lower()
    except Exception as e:  # noqa: BLE001
        logger.debug(f'MIME sniff unavailable: {e}')

    ext = ''
    if filename and '.' in filename:
        ext = filename.rsplit('.', 1)[-1].lower().split('?')[0]
    by_ext = _EXT_MIME.get(ext)

    if sniffed and sniffed not in _UNHELPFUL_SNIFFS:
        if sniffed in _REFINABLE_TEXT_SNIFFS and by_ext and by_ext.startswith('text/'):
            return by_ext
        return sniffed

    if by_ext:
        return by_ext
    if declared:
        return declared.split(';')[0].strip().lower()
    return sniffed or 'application/octet-stream'


def _family(mime: str) -> str:
    if mime.startswith('image/'):
        return 'image'
    if mime.startswith('video/'):
        return 'video'
    if mime.startswith('audio/'):
        return 'audio'
    if mime == 'application/pdf':
        return 'pdf'
    if mime in ('application/vnd.openxmlformats-officedocument.wordprocessingml.document',):
        return 'docx'
    if mime == 'application/msword':
        return 'doc'
    if mime.startswith('text/') or mime in ('application/json', 'application/csv'):
        return 'text'
    return 'other'


# ── the loader ───────────────────────────────────────────────────────────────

class EvidenceLoader:
    """One review's worth of evidence loading. Not reusable across reviews."""

    def __init__(self, budget: Optional[Budget] = None, *, admin=None,
                 file_api_enabled: Optional[bool] = None):
        self.budget = budget or Budget.from_config()
        self._admin = admin
        self.result = LoadResult()
        self._started = time.monotonic()
        self._attachments = 0
        self._youtube_parts = 0
        self._file_api_uploads = 0
        if file_api_enabled is None:
            from app_config import Config
            file_api_enabled = bool(Config.CREDIT_AI_REVIEW_FILE_API_ENABLED)
        self._file_api_enabled = file_api_enabled

    # -- admin client is lazy so tests can load evidence with no database ----
    @property
    def admin(self):
        if self._admin is None:
            # admin client justified: quest-evidence is a private, service-role
            # bucket; this runs for a superadmin-owned review of one submission.
            from database import get_supabase_admin_client
            self._admin = get_supabase_admin_client()
        return self._admin

    def load(self, snapshot: List[Dict[str, Any]]) -> LoadResult:
        blocks = [b for b in (snapshot or []) if isinstance(b, dict)]
        self.result.block_count = len(blocks)
        self.result.fingerprint = fingerprint_snapshot(blocks)

        for block_index, block in enumerate(blocks, start=1):
            items = block_items(block.get('content'))
            if not items:
                continue
            for item_index, item in enumerate(items, start=1):
                if len(self.result.parts) >= self.budget.max_items:
                    self._budget_skip(block_index, item_index, block,
                                      'there were more pieces of evidence than one review reads')
                    continue
                if time.monotonic() - self._started > self.budget.max_seconds:
                    self._budget_skip(block_index, item_index, block,
                                      'reading the evidence took too long')
                    continue
                part = self._load_item(block_index, item_index, block, item)
                self.result.parts.append(part)
                if part.skip_reason:
                    self.result.flags.append(
                        f'[E{part.block_index}] {part.label or "an attachment"}: {part.skip_reason}')

        self.result.load_ms = int((time.monotonic() - self._started) * 1000)
        return self.result

    # -- per item ------------------------------------------------------------

    def _budget_skip(self, block_index: int, item_index: int,
                     block: Dict[str, Any], reason: str) -> None:
        part = EvidencePart(
            block_index=block_index, item_index=item_index,
            block_id=block.get('id'), block_type=block.get('block_type') or 'unknown',
            label='(not read)', source='budget', skip_reason=reason,
            uploaded_by_role=block.get('uploaded_by_role') or 'student',
        )
        self.result.parts.append(part)

    def _new_part(self, block_index, item_index, block, item, source) -> EvidencePart:
        return EvidencePart(
            block_index=block_index,
            item_index=item_index,
            block_id=block.get('id'),
            block_type=block.get('block_type') or 'unknown',
            label=_label_for(item),
            source=source,
            uploaded_by_role=block.get('uploaded_by_role') or 'student',
        )

    def _load_item(self, block_index: int, item_index: int,
                   block: Dict[str, Any], item: Any) -> EvidencePart:
        # Typed text: the student wrote it here, there is nothing to fetch.
        text = _plain_text_of(item)
        if text is not None:
            part = self._new_part(block_index, item_index, block, item, 'typed')
            part.label = part.label or 'a written note'
            return self._as_text(part, text, self.budget.text_block_chars)

        url = item.get('url') if isinstance(item, dict) else None
        if not url or not isinstance(url, str):
            part = self._new_part(block_index, item_index, block, item, 'unknown')
            part.skip_reason = 'there was nothing in this block to read'
            return part

        ref = parse_object_ref(url)
        if ref:
            part = self._new_part(block_index, item_index, block, item, 'upload')
            return self._load_upload(part, ref, item)

        source, extracted = fetchers.classify_url(url)
        part = self._new_part(block_index, item_index, block, item, source)
        if source in ('google_doc', 'google_slides', 'google_sheet', 'google_drive'):
            return self._load_google(part, source, extracted)
        if source in ('youtube', 'vimeo'):
            return self._load_video_link(part, source, extracted)
        return self._load_web(part, url)

    # -- sources -------------------------------------------------------------

    def _load_upload(self, part: EvidencePart, ref: Tuple[str, str],
                     item: Dict[str, Any]) -> EvidencePart:
        bucket, path = ref
        declared_size = item.get('file_size')
        if isinstance(declared_size, int) and declared_size > self.budget.max_download_bytes:
            part.skip_reason = 'the file is too large to review'
            return part

        try:
            blob = self.admin.storage.from_(bucket).download(path)
        except Exception as e:  # noqa: BLE001
            logger.warning(f'AI credit review could not read {bucket}/{path}: {e}')
            part.skip_reason = 'the file could not be opened'
            return part

        if not blob:
            part.skip_reason = 'the file was empty'
            return part
        if len(blob) > self.budget.max_download_bytes:
            part.skip_reason = 'the file is too large to review'
            return part

        mime = sniff_mime(blob, declared=item.get('content_type'),
                          filename=item.get('filename') or item.get('file_name') or path)
        return self._from_bytes(part, blob, mime)

    def _load_google(self, part: EvidencePart, source: str,
                     extracted: Dict[str, str]) -> EvidencePart:
        fetched = fetchers.fetch_google_export(
            source, extracted, max_bytes=self.budget.max_export_bytes)
        if not fetched.ok:
            part.skip_reason = fetched.reason or 'the file could not be read'
            return part

        body = fetched.body or b''
        if source == 'google_slides':
            return self._from_bytes(part, body, 'application/pdf')
        if source == 'google_sheet':
            return self._as_csv(part, body)
        if source == 'google_drive':
            mime = sniff_mime(body, declared=fetched.content_type)
            return self._from_bytes(part, body, mime)
        text = body.decode('utf-8', errors='replace')
        if fetched.truncated:
            part.note = 'only the first part of the document was read'
        return self._as_text(part, text, self.budget.document_chars)

    def _load_video_link(self, part: EvidencePart, source: str,
                         extracted: Dict[str, str]) -> EvidencePart:
        video_id = extracted.get('video_id')
        if not video_id:
            part.skip_reason = 'the video link could not be read'
            return part

        # A YouTube URL can be watched directly by the model, once per request.
        if (source == 'youtube'
                and self._youtube_parts < self.budget.max_youtube_parts):
            handle = fetchers.youtube_part(video_id)
            if handle is not None:
                self._youtube_parts += 1
                part.kind = 'file_uri'
                part.file_ref = handle
                part.mime_type = 'video/*'
                part.label = part.label or 'a YouTube video'
                return part

        # Otherwise say what the video is, which beats saying nothing.
        summary = fetchers.fetch_oembed(source, video_id)
        if summary:
            part.note = 'the video itself was not watched; only its title was read'
            return self._as_text(part, summary, 2000)
        part.skip_reason = 'the video could not be opened'
        return part

    def _load_web(self, part: EvidencePart, url: str) -> EvidencePart:
        fetched = fetchers.fetch_bytes(url, max_bytes=self.budget.max_web_bytes)
        if not fetched.ok:
            part.skip_reason = fetched.reason or 'the link could not be opened'
            return part

        ctype = fetched.content_type or ''
        body = fetched.body or b''
        if ctype.startswith('text/html') or not ctype:
            text = fetchers.readable_page_text(body, max_chars=self.budget.web_chars)
            if not text:
                part.skip_reason = 'the page had no readable text'
                return part
            if len(text) < 200:
                part.note = 'the page had very little readable text'
            return self._as_text(part, text, self.budget.web_chars)

        # A link straight to an image or a PDF is that file, not a page.
        mime = sniff_mime(body, declared=ctype, filename=url)
        return self._from_bytes(part, body, mime)

    # -- byte dispatch -------------------------------------------------------

    def _from_bytes(self, part: EvidencePart, blob: bytes, mime: str) -> EvidencePart:
        part.mime_type = mime
        family = _family(mime)

        if family == 'image':
            return self._as_image(part, blob, mime)
        if family == 'pdf':
            return self._as_pdf(part, blob)
        if family == 'docx':
            return self._as_docx(part, blob)
        if family == 'doc':
            return self._as_legacy_doc(part, blob)
        if family == 'text':
            if mime == 'text/csv':
                return self._as_csv(part, blob)
            return self._as_text(part, blob.decode('utf-8', errors='replace'),
                                 self.budget.document_chars)
        if family in ('video', 'audio'):
            return self._as_media(part, blob, mime)

        part.skip_reason = f'this kind of file cannot be reviewed ({mime})'
        return part

    def _as_image(self, part: EvidencePart, blob: bytes, mime: str) -> EvidencePart:
        # HEIC is the iPhone default and Gemini does not read it, so convert.
        # Anything oversized or in an awkward format is re-encoded to JPEG --
        # the model is looking at a photo of a bridge, not doing forensics.
        needs_convert = (
            mime not in ('image/jpeg', 'image/png', 'image/webp')
            or len(blob) > self.budget.max_image_inline_bytes
        )
        if needs_convert:
            converted = _to_jpeg(blob, part.label, mime)
            if converted is None:
                part.skip_reason = 'the image could not be opened'
                return part
            blob, mime = converted, 'image/jpeg'

        if len(blob) > self.budget.max_image_inline_bytes:
            part.skip_reason = 'the image is too large to review'
            return part
        return self._as_inline(part, blob, mime)

    def _as_pdf(self, part: EvidencePart, blob: bytes) -> EvidencePart:
        from utils.pdf_tools import is_encrypted_pdf, pdf_page_count, unlock_pdf

        if is_encrypted_pdf(blob):
            unlocked = unlock_pdf(blob)
            if unlocked is None:
                # A user-password PDF. Student evidence has no way to supply
                # one, so this is a genuine dead end -- name it so the reviewer
                # opens the file themselves rather than trusting a verdict
                # formed without it.
                part.skip_reason = 'the PDF is password-protected'
                return part
            blob = unlocked

        pages = pdf_page_count(blob)
        small_enough = (
            len(blob) <= self.budget.max_pdf_inline_bytes
            and (pages is None or pages <= self.budget.max_pdf_inline_pages)
        )
        if small_enough and self._inline_room(len(blob)):
            return self._as_inline(part, blob, 'application/pdf')

        # Too big to hand over whole: read the words out of it instead. Loses
        # the diagrams, which is why it is a note and not silent.
        text = _pdf_text(blob)
        if not text:
            part.skip_reason = 'the PDF could not be read'
            return part
        part.note = 'the document was long, so only its text was read (no images)'
        return self._as_text(part, text, self.budget.document_chars)

    def _as_docx(self, part: EvidencePart, blob: bytes) -> EvidencePart:
        try:
            from services.document_parser_service import DocumentParserService
            parsed = DocumentParserService().parse_docx(blob, filename=part.label)
        except Exception as e:  # noqa: BLE001
            logger.warning(f'Could not parse a .docx for the AI credit review: {e}')
            part.skip_reason = 'the Word document could not be read'
            return part
        text = (parsed or {}).get('raw_text') if isinstance(parsed, dict) else None
        if not text:
            part.skip_reason = 'the Word document had no readable text'
            return part
        return self._as_text(part, text, self.budget.document_chars)

    def _as_legacy_doc(self, part: EvidencePart, blob: bytes) -> EvidencePart:
        """.doc, the pre-2007 binary format. Nothing in the stack parses it.

        Pulling the printable runs out of the container gets the prose and loses
        everything else. Flagged as low-fidelity, because a reviewer should not
        read "the reflection is thin" from a mangled extraction.
        """
        text = _printable_runs(blob)
        if not text:
            part.skip_reason = 'this old Word format could not be read'
            return part
        part.note = 'an old Word format, so the text may be incomplete'
        return self._as_text(part, text, self.budget.document_chars)

    def _as_csv(self, part: EvidencePart, blob: bytes) -> EvidencePart:
        text = blob.decode('utf-8', errors='replace')
        rows = text.splitlines()
        if len(rows) > self.budget.csv_rows:
            rows = rows[:self.budget.csv_rows]
            part.note = f'only the first {self.budget.csv_rows} rows were read'
        joined = '\n'.join(rows)
        if not joined.strip():
            part.skip_reason = 'the file was empty'
            return part
        return self._as_text(part, joined, self.budget.document_chars)

    def _as_media(self, part: EvidencePart, blob: bytes, mime: str) -> EvidencePart:
        if len(blob) <= self.budget.max_media_inline_bytes and self._inline_room(len(blob)):
            return self._as_inline(part, blob, mime)

        if not self._file_api_enabled:
            part.skip_reason = 'the video is too large to review'
            return part
        if self._file_api_uploads >= self.budget.max_file_api_uploads:
            part.skip_reason = 'only the first videos in a submission are watched'
            return part
        if len(blob) > self.budget.max_file_api_bytes:
            part.skip_reason = 'the video is too large to review'
            return part

        handle, error = fetchers.upload_to_file_api(
            blob, mime_type=mime, display_name=part.label or 'evidence')
        if handle is None:
            part.skip_reason = error or 'the video could not be reviewed'
            return part

        self._file_api_uploads += 1
        self.result.file_handles.append(handle)
        part.kind = 'file_api'
        part.file_ref = handle
        part.mime_type = mime
        part.byte_size = len(blob)
        return part

    # -- accumulation --------------------------------------------------------

    def _inline_room(self, size: int) -> bool:
        return (self.result.inline_bytes + size) <= self.budget.max_inline_bytes

    def _as_inline(self, part: EvidencePart, blob: bytes, mime: str) -> EvidencePart:
        if self._attachments >= self.budget.max_attachments:
            part.skip_reason = 'there were more files than one review reads'
            return part
        if not self._inline_room(len(blob)):
            part.skip_reason = 'there was no room left to read this file'
            return part
        part.kind = 'inline'
        part.data = blob
        part.mime_type = mime
        part.byte_size = len(blob)
        self.result.inline_bytes += len(blob)
        self._attachments += 1
        return part

    def _as_text(self, part: EvidencePart, text: str, limit: int) -> EvidencePart:
        cleaned = (text or '').strip()
        if not cleaned:
            part.skip_reason = 'there was no readable text'
            return part
        room = self.budget.max_text_chars - self.result.text_chars
        if room <= 0:
            part.skip_reason = 'there was no room left to read this text'
            return part
        body = truncate(cleaned, min(limit, room))
        part.kind = 'text'
        part.text = body
        self.result.text_chars += len(body)
        return part


# ── helpers ──────────────────────────────────────────────────────────────────

def _label_for(item: Any) -> str:
    """A name for this item that is never a link to our storage."""
    if isinstance(item, str):
        return 'a written note'
    if not isinstance(item, dict):
        return 'an attachment'
    title = item.get('title') or item.get('caption') or item.get('alt')
    ref = describable_ref(item)
    if title and str(title).strip():
        return truncate(str(title).strip(), 120)
    if ref:
        return truncate(str(ref), 120)
    return 'an attachment'


def _plain_text_of(item: Any) -> Optional[str]:
    """The student's own words, if this item is words rather than a file."""
    if isinstance(item, str):
        return item if item.strip() else None
    if isinstance(item, dict) and not item.get('url'):
        text = item.get('text')
        if isinstance(text, str) and text.strip():
            return text
    return None


def _to_jpeg(blob: bytes, filename: str, mime: str) -> Optional[bytes]:
    """Re-encode any image to a JPEG small enough to send."""
    try:
        from utils.image_utils import convert_heif_if_needed
        blob, _, _ = convert_heif_if_needed(blob, filename or 'image.heic', mime)
    except Exception as e:  # noqa: BLE001
        logger.debug(f'HEIF conversion skipped: {e}')

    try:
        from PIL import Image, ImageOps
        img = Image.open(io.BytesIO(blob))
        img = ImageOps.exif_transpose(img)
        if img.mode not in ('RGB', 'L'):
            img = img.convert('RGB')
        img.thumbnail((2048, 2048))
        out = io.BytesIO()
        img.save(out, format='JPEG', quality=85, optimize=True)
        return out.getvalue()
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Could not re-encode an image for the AI credit review: {e}')
        return None


def _pdf_text(blob: bytes) -> Optional[str]:
    try:
        from services.document_parser_service import DocumentParserService
        parsed = DocumentParserService().parse_pdf(blob)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Could not extract PDF text for the AI credit review: {e}')
        return None
    if isinstance(parsed, dict):
        return parsed.get('raw_text') or None
    return None


def _printable_runs(blob: bytes, min_run: int = 20) -> Optional[str]:
    """Readable prose pulled out of a binary container."""
    text = blob.decode('latin-1', errors='replace')
    runs: List[str] = []
    current: List[str] = []
    for ch in text:
        if ch.isprintable() or ch in ' \t':
            current.append(ch)
        else:
            if len(current) >= min_run:
                runs.append(''.join(current).strip())
            current = []
    if len(current) >= min_run:
        runs.append(''.join(current).strip())
    joined = '\n'.join(r for r in runs if r)
    return joined or None


def fingerprint_snapshot(blocks: List[Dict[str, Any]]) -> str:
    """A stable hash of what was submitted, for comparing rounds.

    Storage paths and text, not ids: a resubmission rewrites block rows, so ids
    change even when the student changed nothing.
    """
    pieces: List[str] = []
    for block in blocks or []:
        if not isinstance(block, dict):
            continue
        for item in block_items(block.get('content')):
            pieces.append(item_fingerprint(item))
    digest = hashlib.sha256('|'.join(pieces).encode('utf-8')).hexdigest()
    return f'sha256:{digest}'


def item_fingerprint(item: Any) -> str:
    """One item's identity: its storage path, its URL, or a hash of its text."""
    if isinstance(item, str):
        return hashlib.sha1(item.strip().encode('utf-8')).hexdigest()[:16]
    if not isinstance(item, dict):
        return hashlib.sha1(repr(item).encode('utf-8')).hexdigest()[:16]
    url = item.get('url')
    if url:
        ref = parse_object_ref(url)
        return ref[1] if ref else str(url)
    text = item.get('text') or ''
    return hashlib.sha1(str(text).strip().encode('utf-8')).hexdigest()[:16]


def load_evidence(snapshot: List[Dict[str, Any]], *, budget: Optional[Budget] = None,
                  admin=None, file_api_enabled: Optional[bool] = None) -> LoadResult:
    """Read everything a student attached, within one review's budget."""
    return EvidenceLoader(budget, admin=admin,
                          file_api_enabled=file_api_enabled).load(snapshot)


def release(result: LoadResult) -> None:
    """Delete anything uploaded to the model's file store. Never raises.

    Called from a `finally`. The API expires uploads after 48 hours by itself,
    but leaving a child's video on a third party's file store for two days
    because we did not clean up is not a defensible default.
    """
    for handle in (result.file_handles or []):
        fetchers.delete_file(handle)
    result.file_handles = []
