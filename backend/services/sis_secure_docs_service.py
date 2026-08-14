"""
The secure-document store, as a service.

The upload half of routes/sis/secure_documents.py used to be the only way a file
got into the private store. Sending a document out for signature needs exactly
the same thing — one blob and one row per recipient — so the storage mechanics
live here and both callers share them, rather than the signature flow growing a
second, slightly-different uploader.

Everything in this store is confidential by default. `sensitivity` records which
kind: 'hr' is employment paperwork (contracts, background checks) that only
HR_ROLES may touch, 'general' is ordinary campus paperwork a campus coordinator
may send and track. The column defaults to 'hr' for the same reason the check is
worth having at all — a document whose sensitivity nobody set must not be the one
that leaks.
"""

import uuid as _uuid
from typing import Any, Dict, List, Optional, Tuple

from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

BUCKET = 'sis-secure-documents'  # PRIVATE bucket
DOC_EXTENSIONS = {'pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'webp'}
MAX_DOC_BYTES = 15 * 1024 * 1024
MAX_TITLE_LEN = 200  # matches routes/sis/class_materials.py

# One upload can be filed against several people at once (a handbook, a policy
# every teacher signs). Each person gets their OWN row and their OWN blob rather
# than sharing one — because everything downstream of a document is per-person:
# shared_with_owner is toggled for one teacher at a time, and DELETE removes the
# blob. Sharing a blob between rows would mean deleting one person's copy blanks
# the file for everyone else still holding it.
MAX_ATTACH_PEOPLE = 50

SENSITIVITIES = ('hr', 'general')


def clean_sensitivity(value: Any, default: str = 'hr') -> str:
    v = (str(value or '').strip().lower())
    return v if v in SENSITIVITIES else default


def clean_title(value: Any, fallback: Any) -> str:
    """A document's display name: trimmed, capped, never empty."""
    title = (value or '').strip() or (fallback or '').strip() or 'Untitled document'
    return title[:MAX_TITLE_LEN]


def _admin():
    # admin client justified: the private sis-secure-documents bucket and its
    # service-role-only table; every caller is role-gated and pins organization_id.
    return get_supabase_admin_client()


# What the bytes are actually allowed to be, per extension. The extension in
# the filename is a claim by the uploader; this is the check.
_EXT_MIMES = {
    'pdf':  {'application/pdf'},
    'doc':  {'application/msword', 'application/vnd.ms-office',
             'application/x-ole-storage', 'application/octet-stream'},
    'docx': {'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
             'application/zip'},  # OOXML is a zip; libmagic often reports the container
    'png':  {'image/png'},
    'jpg':  {'image/jpeg'},
    'jpeg': {'image/jpeg'},
    'webp': {'image/webp'},
}

# Anything not confidently identified as an image or a PDF is handed back as an
# opaque download rather than something the browser will render. Word documents
# included: the store is reached by signed URL from the Supabase storage origin,
# and we would rather serve a file than a page.
_INLINE_SAFE_MIMES = {'application/pdf', 'image/png', 'image/jpeg', 'image/webp'}


def validate_upload(filename: Optional[str], size_bytes: int) -> Tuple[Optional[str], Optional[str]]:
    """Returns (extension, error). One place so both callers refuse the same files.

    Name and size only — see `resolve_content_type` for the check on the bytes.
    """
    if not filename:
        return None, 'No file selected'
    ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
    if ext not in DOC_EXTENSIONS:
        return None, 'Allowed types: pdf, doc, docx, png, jpg, jpeg, webp'
    if size_bytes > MAX_DOC_BYTES:
        return None, 'File size exceeds 15MB limit'
    return ext, None


def resolve_content_type(blob: bytes, ext: str) -> Tuple[Optional[str], Optional[str]]:
    """Returns (content_type, error) from the file's own bytes.

    The uploader's Content-Type header used to be stored verbatim and handed
    straight back by the signed URL, so a file named `policy.pdf` sent as
    `text/html` was served as an executable page from the Supabase storage
    origin — stored XSS, wearing a document's name. The header is now ignored
    entirely; what we serve is derived from what the bytes actually are.

    Falls back to the extension's canonical type when libmagic is unavailable
    (it is an optional dependency), but never to anything renderable that we
    have not positively identified.
    """
    detected = None
    try:
        # utils.file_validator does the same import dance for python-magic vs
        # python-magic-bin; reuse its resolved module rather than repeating it.
        from utils.file_validator import magic as _magic
        if _magic is not None:
            detected = _magic.from_buffer(blob[:8192], mime=True)
    except Exception:  # noqa: BLE001
        logger.debug('libmagic unavailable; falling back to extension mapping', exc_info=True)

    if detected is None:
        # No sniffer. Serve the extension's canonical type, which is at worst a
        # wrong-but-inert label — the point is that it is OUR label, not one the
        # uploader chose.
        canonical = {'pdf': 'application/pdf', 'png': 'image/png',
                     'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
                     'webp': 'image/webp'}.get(ext)
        return (canonical or 'application/octet-stream'), None

    allowed = _EXT_MIMES.get(ext, set())
    if detected not in allowed:
        logger.warning(
            f'Secure document rejected: .{ext} claimed, bytes are {detected}'
        )
        return None, f'That file is not a valid .{ext} document'

    return (detected if detected in _INLINE_SAFE_MIMES
            else 'application/octet-stream'), None


def _ensure_bucket(supabase) -> None:
    try:
        supabase.storage.get_bucket(BUCKET)
    except Exception:
        try:
            supabase.storage.create_bucket(BUCKET, options={'public': False})
        except Exception:
            pass


def remove_blobs(paths: List[str]) -> None:
    """Best-effort cleanup so a failed upload leaves no orphans behind."""
    if not paths:
        return
    try:
        _admin().storage.from_(BUCKET).remove(paths)
    except Exception:
        logger.debug('Secure document blob cleanup failed (non-fatal)', exc_info=True)


def signed_url(storage_path: str, expires_in: int = 3600) -> Optional[str]:
    try:
        signed = _admin().storage.from_(BUCKET).create_signed_url(storage_path, expires_in)
        return signed.get('signedURL') or signed.get('signedUrl')
    except Exception as e:
        logger.error(f'Signed URL failed for {storage_path}: {e}')
        return None


def load_blob(storage_path: str) -> Optional[bytes]:
    """The bytes behind a stored document — used to send an already-uploaded
    document to a new set of people, who each need their own copy."""
    try:
        return _admin().storage.from_(BUCKET).download(storage_path)
    except Exception as e:
        logger.error(f'Secure document download failed for {storage_path}: {e}')
        return None


def get_document(org_id: str, doc_id: str) -> Optional[Dict[str, Any]]:
    """One document row, only if it belongs to this org."""
    rows = (_admin().table('sis_secure_documents').select('*')
            .eq('id', doc_id).limit(1).execute()).data or []
    row = rows[0] if rows else None
    return row if row and row.get('organization_id') == org_id else None


def store_document(org_id: str, uploaded_by: str, blob: bytes, filename: str,
                   ext: str, content_type: Optional[str], size_bytes: int,
                   targets: List[Dict[str, Any]], *, title: Optional[str] = None,
                   category: Optional[str] = None, note: Optional[str] = None,
                   shared_with_owner: bool = False,
                   sensitivity: str = 'hr') -> Dict[str, Any]:
    """Upload one file and record a row per person it is filed against.

    `targets` is a list of {'owner_user_id', 'student_user_id'} — one row each.
    Returns {'documents': [...]} or {'error': ..., 'status': ...}. Blobs are
    removed again if the metadata insert fails, so a half-written upload never
    leaves a file nobody can reach.
    """
    if len(targets) > MAX_ATTACH_PEOPLE:
        return {'error': f'Attach to at most {MAX_ATTACH_PEOPLE} people at a time',
                'status': 400}

    supabase = _admin()
    _ensure_bucket(supabase)

    paths: List[str] = []
    try:
        for _ in targets:
            path = f"{org_id}/{_uuid.uuid4().hex}.{ext}"
            supabase.storage.from_(BUCKET).upload(
                path=path, file=blob,
                file_options={'content-type': content_type or 'application/octet-stream'},
            )
            paths.append(path)
    except Exception as e:
        logger.error(f'Secure document upload failed: {e}')
        remove_blobs(paths)
        return {'error': 'Failed to upload document', 'status': 500}

    common = {
        'organization_id': org_id,
        'uploaded_by': uploaded_by,
        'filename': filename,
        'title': clean_title(title, filename),
        'content_type': content_type,
        'size_bytes': size_bytes,
        'category': category,
        'note': note,
        # Opt-in, and off unless the caller says otherwise. This store holds
        # background checks; a document must never become visible to the person
        # it is about just because it was filed against them. (Sending a
        # document FOR SIGNATURE is the caller that says otherwise — you cannot
        # sign what you cannot open.)
        'shared_with_owner': bool(shared_with_owner),
        'sensitivity': clean_sensitivity(sensitivity),
    }
    rows = [{**common, **t, 'storage_path': p} for t, p in zip(targets, paths)]
    try:
        inserted = (supabase.table('sis_secure_documents').insert(rows).execute()).data
    except Exception as e:
        logger.error(f'Secure document insert failed: {e}')
        remove_blobs(paths)
        return {'error': 'Failed to save document', 'status': 500}

    return {'documents': inserted or rows}
