"""Reading PDFs that arrive locked.

Extracted from services/sis_prior_learning_analyzer.py, which learned this on its
first real record: one of five uploaded transcripts was encrypted, and Gemini
refuses an encrypted PDF with a bare "400 Request contains an invalid argument"
that names no file. One locked document therefore failed the whole analysis and
left a reviewer with nothing to go on.

Student evidence has the same shape of problem -- a school-issued certificate, an
exported report, anything printed to PDF by software that sets an owner password
-- so the AI credit reviewer needs the same unlock. The analyzer re-exports these
names, so its call sites are unchanged.
"""

from __future__ import annotations

from typing import List, Optional

from utils.logger import get_logger

logger = get_logger(__name__)


def is_encrypted_pdf(blob: bytes) -> bool:
    """True for a PDF carrying an /Encrypt dictionary."""
    return bool(blob) and blob[:5] == b'%PDF-' and b'/Encrypt' in blob


def unlock_pdf(blob: bytes, passwords: Optional[List[str]] = None) -> Optional[bytes]:
    """A readable copy of an encrypted PDF, or None if it stays locked.

    Two different things get called "locked", and only one of them needs a
    password from a human:

      Permissions-encrypted -- an owner password restricting printing or
      copying, with an EMPTY user password. Every viewer opens these without
      asking, which is why nobody knows theirs is locked at all. The
      empty-password attempt below handles them with nobody typing anything.
      This is the case that matters for student evidence.

      User-password protected -- genuinely sealed. These need a password, which
      is what the ``passwords`` argument carries. Student evidence has no
      mechanism for supplying one, so these are flagged as unreadable instead.

    The decrypted copy is re-serialized without encryption, because stripping the
    /Encrypt dictionary is exactly what makes the file readable to the model. It
    exists in memory for the length of one call. Nothing here persists or logs a
    password, and nothing here writes back to storage -- a caller that wants to
    replace the stored file does that itself, deliberately.
    """
    try:
        import fitz  # PyMuPDF, already a platform dependency
    except ImportError:  # pragma: no cover - PyMuPDF ships in requirements
        logger.warning('PyMuPDF missing; cannot unlock encrypted PDFs')
        return None

    try:
        doc = fitz.open(stream=blob, filetype='pdf')
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Could not open a PDF to unlock it: {e}')
        return None

    with doc:
        if not doc.needs_pass:
            # Permissions-only encryption: already open, just needs re-saving
            # without the /Encrypt dictionary.
            return clean_pdf_bytes(doc)
        for password in (passwords or []):
            if password and doc.authenticate(password):
                return clean_pdf_bytes(doc)
    return None


def clean_pdf_bytes(doc) -> Optional[bytes]:
    """Re-serialize an open PDF without encryption, refusing a lossy round trip.

    Checked here rather than at the call site because this is the only place that
    knows what the document looked like before. The prior-learning path REPLACES
    the family's upload with this copy, so a re-save that quietly dropped pages
    would destroy the original with no way back.
    """
    try:
        import fitz
        pages_before = doc.page_count
        clean = doc.tobytes()
        if not clean:
            return None
        with fitz.open(stream=clean, filetype='pdf') as check:
            if check.needs_pass or check.page_count != pages_before:
                logger.warning('Decrypted PDF failed its round-trip check '
                               f'({pages_before} pages in, {check.page_count} out)')
                return None
        return clean
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Could not re-save a decrypted PDF: {e}')
        return None


def pdf_page_count(blob: bytes) -> Optional[int]:
    """Pages in a PDF, or None if it cannot be opened.

    Used to decide whether a document is small enough to hand to the model whole
    or has to be read as extracted text.
    """
    try:
        import fitz
        with fitz.open(stream=blob, filetype='pdf') as doc:
            return doc.page_count
    except Exception as e:  # noqa: BLE001
        logger.debug(f'Could not count PDF pages: {e}')
        return None


__all__ = ['clean_pdf_bytes', 'is_encrypted_pdf', 'pdf_page_count', 'unlock_pdf']
