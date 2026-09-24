"""
Read a Google Doc's title and plain text, for meeting notes attached to a CRM
person's file.

The link is always kept; the text is a copy, taken so the file still reads
when the doc is moved, unshared or deleted. Two ways in, in order:

1. A service account (GOOGLE_DOCS_SA_KEY_B64, falling back to the GA4 reader
   key in the same GCP project) that the doc, or a folder above it, is shared
   with. Drive API must be enabled in that project. This is the normal path:
   share the meeting-notes folder with the account once.
2. The public export URL, which only works for "anyone with the link" docs.

Neither working is not an error for the caller: the note keeps the link and
the UI says who to share the doc with, then offers a refresh.

Only Google URLs this module builds from the extracted doc id are fetched, so
a pasted link can never make the backend request an arbitrary host.
"""
import base64
import json
import re
from dataclasses import dataclass
from typing import Optional

import requests

from app_config import Config
from utils.logger import get_logger

logger = get_logger(__name__)

DRIVE_API = 'https://www.googleapis.com/drive/v3/files'
PUBLIC_EXPORT = 'https://docs.google.com/document/d/{doc_id}/export?format=txt'
SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
REQUEST_TIMEOUT = 15
# A long meeting transcript is ~100k characters; beyond that it is not notes.
MAX_TEXT_CHARS = 200_000

_DOC_ID = re.compile(r'^https://docs\.google\.com/document/(?:u/\d+/)?d/([A-Za-z0-9_-]{20,})(?:[/?#].*)?$')


class DriveApiDisabled(Exception):
    """Drive API is off in the service account's GCP project. Nothing about
    sharing matters until it is on, so this is reported on its own."""


@dataclass
class DocFetch:
    title: Optional[str] = None
    text: Optional[str] = None
    # Why the text could not be read; None when it was.
    error: Optional[str] = None


def doc_id_from_url(url: Optional[str]) -> Optional[str]:
    match = _DOC_ID.match((url or '').strip())
    return match.group(1) if match else None


def _key_info() -> Optional[dict]:
    key_b64 = Config.GOOGLE_DOCS_SA_KEY_B64
    if not key_b64:
        return None
    try:
        return json.loads(base64.b64decode(key_b64))
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Google Docs reader: service-account key unreadable: {e}')
        return None


def reader_email() -> Optional[str]:
    """The address a doc must be shared with for the backend to read it."""
    info = _key_info()
    return info.get('client_email') if info else None


def _access_token() -> Optional[str]:
    info = _key_info()
    if not info:
        return None
    try:
        from google.oauth2 import service_account
        from google.auth.transport.requests import Request as GoogleRequest
        credentials = service_account.Credentials.from_service_account_info(info, scopes=[SCOPE])
        credentials.refresh(GoogleRequest())
        return credentials.token
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Google Docs reader: service-account auth failed: {e}')
        return None


def _clean(text: str) -> str:
    # Google's plain-text export starts with a byte-order mark and uses CRLF.
    text = text.lstrip('\ufeff').replace('\r\n', '\n').strip()
    return text[:MAX_TEXT_CHARS]


def _via_service_account(doc_id: str, token: str) -> Optional[DocFetch]:
    headers = {'Authorization': f'Bearer {token}'}
    params = {'supportsAllDrives': 'true'}
    meta = requests.get(f'{DRIVE_API}/{doc_id}', headers=headers, timeout=REQUEST_TIMEOUT,
                        params={**params, 'fields': 'name,mimeType'})
    if meta.status_code == 403 and ('SERVICE_DISABLED' in meta.text
                                    or 'accessNotConfigured' in meta.text):
        raise DriveApiDisabled()
    if meta.status_code != 200:
        # 404 is what Drive says for "exists but not shared with you" too.
        logger.info(f'Google Docs reader: metadata {meta.status_code} for {doc_id}')
        return None
    export = requests.get(f'{DRIVE_API}/{doc_id}/export', headers=headers,
                          timeout=REQUEST_TIMEOUT,
                          params={**params, 'mimeType': 'text/plain'})
    if export.status_code != 200:
        logger.info(f'Google Docs reader: export {export.status_code} for {doc_id}')
        return None
    export.encoding = 'utf-8'
    return DocFetch(title=meta.json().get('name'), text=_clean(export.text))


def _via_public_link(doc_id: str) -> Optional[DocFetch]:
    # A private doc redirects to a Google sign-in page, so no redirects: only
    # a direct text/plain answer is the doc.
    resp = requests.get(PUBLIC_EXPORT.format(doc_id=doc_id), timeout=REQUEST_TIMEOUT,
                        allow_redirects=False)
    if resp.status_code != 200 or not resp.headers.get('Content-Type', '').startswith('text/plain'):
        return None
    resp.encoding = 'utf-8'
    return DocFetch(text=_clean(resp.text))


def fetch_doc(url: str) -> DocFetch:
    """Title and text of the Google Doc at `url`, or a DocFetch with an error."""
    doc_id = doc_id_from_url(url)
    if not doc_id:
        return DocFetch(error='Not a Google Docs link')
    try:
        token = _access_token()
        result = _via_service_account(doc_id, token) if token else None
        if result is None:
            result = _via_public_link(doc_id)
    except DriveApiDisabled:
        logger.warning('Google Docs reader: Drive API is disabled in the service account project')
        project = (_key_info() or {}).get('project_id') or 'its'
        return DocFetch(error=(
            f'The Google Drive API is turned off in the {project} Google Cloud project. '
            'Turn it on there, wait a few minutes, then Refresh.'))
    except requests.RequestException as e:
        logger.warning(f'Google Docs reader: request failed for {doc_id}: {e}')
        return DocFetch(error='Google Docs did not answer. Try Refresh in a minute.')
    if result is None:
        email = reader_email()
        return DocFetch(error=(
            f'Optio cannot open this doc. Share it (or its folder) with {email}, then Refresh.'
            if email else
            'Optio cannot open this doc. Set it to "Anyone with the link can view", then Refresh.'
        ))
    if not result.text:
        result.error = 'The doc is empty.'
    return result
