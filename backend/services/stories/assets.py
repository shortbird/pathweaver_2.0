"""Moving a story's media between the private bucket and the public one.

`copy_to_public` is the only path by which a byte of a student's evidence
reaches the public `story-assets` bucket, and it runs only for assets marked
`included` -- which means: the safety pass said safe, the drafter chose it, and
nobody excluded it since. Every image goes through `prepare_public_image`, so
what lands in the bucket is a fresh JPEG with no EXIF, at most 1600 px.

A video is copied as it was uploaded. There is no ffmpeg in production to
re-encode it or strip its metadata, which is why the safety pass refuses any
video carrying a location atom before it gets this far (safety.py); the only
transformation here is a content type the bucket accepts.

A PDF is copied as it was uploaded too. The safety pass read its text and its
metadata with the scrubber and had the model read its pages before the row
could be marked included; the bucket's MIME list no longer stands between a
PDF and the public, and this module does not pretend to.

`delete_public` is the other direction, for unpublish, revocation and erasure.
Both are idempotent: a copy that already exists is re-made (cheap, and it
picks up a changed crop rule), and a delete of something already gone is
success.

The public path is `stories/<story_id>/<asset_id>.<ext>` -- `.jpg` for an
image, `.mp4` / `.mov` / `.webm` for a video, `.pdf` for a document. The asset
id is a uuid, so the URL says nothing about the student or the original file.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from urllib.parse import unquote

from utils.logger import get_logger
from utils.storage_urls import parse_object_ref, public_object_url

from services.stories.anonymize import prepare_public_image

PUBLIC_BUCKET = 'story-assets'

#: The video types the public bucket accepts, and the extension each gets.
#: Anything else is dropped at copy time with `unsupported_video_type`; the
#: bucket would refuse the upload anyway, and this way the row says why.
VIDEO_EXT_BY_MIME = {
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
}

DOCUMENT_MIME = 'application/pdf'


def public_path_for(story_id: str, asset_id: str, *, kind: str = 'image',
                    mime_type: Optional[str] = None) -> str:
    if kind == 'video':
        ext = VIDEO_EXT_BY_MIME.get((mime_type or '').lower(), 'mp4')
        return f'stories/{story_id}/{asset_id}.{ext}'
    if kind == 'document':
        return f'stories/{story_id}/{asset_id}.pdf'
    return f'stories/{story_id}/{asset_id}.jpg'


def public_url_for(path: Optional[str]) -> Optional[str]:
    return public_object_url(PUBLIC_BUCKET, path) if path else None


logger = get_logger(__name__)


def _admin_client(admin=None):
    if admin is not None:
        return admin
    # admin client justified: the private quest-evidence bucket has no policy
    # for "a story worker"; the read is of one asset a superadmin chose to
    # publish, and the write is to the public story-assets bucket.
    from utils.admin_client import admin_client as _admin
    return _admin()


def _download(admin, source_ref: str) -> Optional[bytes]:
    ref = parse_object_ref(source_ref)
    if not ref:
        return None
    bucket, path = ref
    try:
        return admin.storage.from_(bucket).download(path)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Story asset could not be read from {bucket}: {e}')
        return None


def object_size(admin, source_ref: str) -> Optional[int]:
    """How many bytes the object is, from the bucket listing, or None.

    Best effort, and worth the round trip: a signed upload may be 500MB, and
    the only other way to learn a video's size is to have downloaded it into
    a 512MB container. None means "could not tell", never "small".
    """
    ref = parse_object_ref(source_ref)
    if not ref:
        return None
    bucket, path = ref
    folder, _, name = unquote(path).rpartition('/')
    try:
        rows = admin.storage.from_(bucket).list(folder, {'search': name, 'limit': 10}) or []
    except Exception as e:  # noqa: BLE001
        logger.debug(f'Could not list {bucket} for an object size: {e}')
        return None
    for row in rows:
        if not isinstance(row, dict) or row.get('name') != name:
            continue
        raw_meta = row.get('metadata')
        meta: Dict[str, Any] = raw_meta if isinstance(raw_meta, dict) else {}
        size = meta.get('size', meta.get('contentLength'))
        try:
            return int(size)
        except (TypeError, ValueError):
            return None
    return None


def _video_mime(asset: Dict[str, Any], blob: bytes) -> str:
    """The content type a video is published under.

    The row's `mime_type` was sniffed from these same bytes when the story was
    drafted; a row written before the column existed is sniffed now.
    """
    mime = (asset.get('mime_type') or '').lower()
    if mime:
        return mime
    from services.credit_ai_review.evidence_loader import sniff_mime
    ref = parse_object_ref(asset.get('source_ref') or '')
    return sniff_mime(blob, filename=ref[1] if ref else None)


def copy_to_public(story: Dict[str, Any], assets: List[Dict[str, Any]], *,
                   admin=None, repo=None) -> List[Dict[str, Any]]:
    """Copy every included asset to the public bucket. Returns the updated rows.

    An asset that cannot be copied (missing original, unreadable image, a
    video type the bucket refuses) is marked not included with a reason in
    `safety.copy_error`, so the page simply does not show it. It is not a
    publish failure: the story is the words.
    """
    from repositories.story_asset_repository import StoryAssetRepository

    admin = _admin_client(admin)
    repo = repo or StoryAssetRepository(client=admin)
    story_id = story['id']
    updated: List[Dict[str, Any]] = []

    for asset in assets:
        if not asset.get('included'):
            updated.append(asset)
            continue
        blob = _download(admin, asset.get('source_ref') or '')
        if not blob:
            updated.append(_drop(repo, asset, 'source_unreadable'))
            continue

        if asset.get('kind') == 'video':
            mime = _video_mime(asset, blob)
            if mime not in VIDEO_EXT_BY_MIME:
                logger.warning(f'Story video has a type the public bucket refuses: {mime}')
                updated.append(_drop(repo, asset, 'unsupported_video_type'))
                continue
            payload, width, height = blob, None, None
            path = public_path_for(story_id, asset['id'], kind='video', mime_type=mime)
            content_type = mime
        elif asset.get('kind') == 'document':
            # The safety pass judged these bytes; sniff them again so a row
            # whose original was replaced since cannot publish something else.
            from services.credit_ai_review.evidence_loader import sniff_mime
            if sniff_mime(blob) != DOCUMENT_MIME:
                logger.warning('Story document is no longer a PDF; not publishing it')
                updated.append(_drop(repo, asset, 'unsupported_document_type'))
                continue
            payload, width, height = blob, None, None
            path = public_path_for(story_id, asset['id'], kind='document')
            content_type = DOCUMENT_MIME
        else:
            try:
                payload, width, height = prepare_public_image(blob)
            except Exception as e:  # noqa: BLE001
                logger.warning(f'Story asset could not be prepared for publication: {e}')
                updated.append(_drop(repo, asset, 'not_an_image'))
                continue
            path = public_path_for(story_id, asset['id'])
            content_type = 'image/jpeg'

        try:
            admin.storage.from_(PUBLIC_BUCKET).upload(
                path, payload, {'content-type': content_type, 'upsert': 'true'})
        except Exception as e:  # noqa: BLE001
            logger.warning(f'Story asset upload failed: {e}')
            updated.append(_drop(repo, asset, 'upload_failed'))
            continue

        changes = {'public_path': path, 'width': width, 'height': height}
        repo.patch(asset['id'], changes)
        updated.append({**asset, **changes})

    return updated


def _drop(repo, asset: Dict[str, Any], reason: str) -> Dict[str, Any]:
    safety = dict(asset.get('safety') or {})
    safety['copy_error'] = reason
    changes = {'included': False, 'public_path': None, 'safety': safety}
    repo.patch(asset['id'], changes)
    return {**asset, **changes}


def delete_public(story: Dict[str, Any], assets: List[Dict[str, Any]], *,
                  admin=None, repo=None) -> int:
    """Remove every public copy of this story's media. Returns how many.

    Idempotent, and it does not stop at the first failure: the objects are
    what make a withdrawn story still findable, so each one is attempted.
    Raises only if nothing could be removed at all and something existed.
    """
    from repositories.story_asset_repository import StoryAssetRepository

    admin = _admin_client(admin)
    repo = repo or StoryAssetRepository(client=admin)
    paths = [a['public_path'] for a in assets if a.get('public_path')]
    # Belt and braces: whatever the rows say, the story's whole prefix goes.
    prefix = f'stories/{story["id"]}'
    try:
        listed = admin.storage.from_(PUBLIC_BUCKET).list(prefix) or []
        for obj in listed:
            name = obj.get('name') if isinstance(obj, dict) else None
            if name:
                paths.append(f'{prefix}/{name}')
    except Exception as e:  # noqa: BLE001
        logger.debug(f'Could not list public story assets: {e}')

    unique = list(dict.fromkeys(paths))
    removed = 0
    failures: List[str] = []
    for path in unique:
        try:
            admin.storage.from_(PUBLIC_BUCKET).remove([path])
            removed += 1
        except Exception as e:  # noqa: BLE001
            if 'not found' in str(e).lower():
                removed += 1
                continue
            failures.append(f'{path}: {e}')

    repo.clear_public_paths(story['id'])
    if failures and not removed:
        raise RuntimeError('Could not delete public story assets: ' + '; '.join(failures)[:500])
    if failures:
        logger.warning(f'Some public story assets were not deleted: {failures}')
    return removed
