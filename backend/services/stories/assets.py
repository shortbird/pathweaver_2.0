"""Moving a story's images between the private bucket and the public one.

`copy_to_public` is the only path by which a byte of a student's evidence
reaches the public `story-assets` bucket, and it runs only for assets marked
`included` -- which means: the safety pass said safe, the drafter chose it, and
nobody excluded it since. Every copy goes through `prepare_public_image`, so
what lands in the bucket is a fresh JPEG with no EXIF, at most 1600 px.

`delete_public` is the other direction, for unpublish, revocation and erasure.
Both are idempotent: a copy that already exists is re-made (cheap, and it
picks up a changed crop rule), and a delete of something already gone is
success.

The public path is `stories/<story_id>/<asset_id>.jpg`. The asset id is a
uuid, so the URL says nothing about the student or the original file.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from utils.logger import get_logger
from utils.storage_urls import parse_object_ref, public_object_url

from services.stories.anonymize import prepare_public_image

PUBLIC_BUCKET = 'story-assets'


def public_path_for(story_id: str, asset_id: str) -> str:
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


def copy_to_public(story: Dict[str, Any], assets: List[Dict[str, Any]], *,
                   admin=None, repo=None) -> List[Dict[str, Any]]:
    """Copy every included asset to the public bucket. Returns the updated rows.

    An asset that cannot be copied (missing original, unreadable image) is
    marked not included with a reason in `safety.reason`, so the page simply
    does not show it. It is not a publish failure: the story is the words.
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
        try:
            jpeg, width, height = prepare_public_image(blob)
        except Exception as e:  # noqa: BLE001
            logger.warning(f'Story asset could not be prepared for publication: {e}')
            updated.append(_drop(repo, asset, 'not_an_image'))
            continue

        path = public_path_for(story_id, asset['id'])
        try:
            admin.storage.from_(PUBLIC_BUCKET).upload(
                path, jpeg, {'content-type': 'image/jpeg', 'upsert': 'true'})
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
    """Remove every public copy of this story's images. Returns how many.

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
