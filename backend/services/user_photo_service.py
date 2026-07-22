"""
Shared user photo upload: stores the image in the public `user-photos` bucket
and stamps users.avatar_url. Used by the iCreate registration funnel (required
family photos) and the SIS parent self-service photo endpoints.

The caller is responsible for authorization and file validation (type/size);
this helper only does storage + the avatar_url update.
"""

import uuid

from utils.logger import get_logger

logger = get_logger(__name__)

BUCKET = 'user-photos'


def _ensure_bucket(admin):
    try:
        if not admin.storage.get_bucket(BUCKET):
            admin.storage.create_bucket(BUCKET, options={'public': True})
    except Exception:  # noqa: BLE001
        try:
            admin.storage.create_bucket(BUCKET, options={'public': True})
        except Exception:  # noqa: BLE001
            pass


def upload_staged_photo(admin, reg_id, file, ext):
    """Upload a funnel photo for a family member whose account doesn't exist
    yet (kid accounts are only created when the family step submits). Stored
    under the registration so the family submit can attach it; returns the
    public URL. No user row is touched."""
    _ensure_bucket(admin)
    path = f'staged/{reg_id}/{uuid.uuid4().hex}.{ext}'
    admin.storage.from_(BUCKET).upload(
        path=path, file=file.read(),
        file_options={'content-type': file.content_type or f'image/{ext}'},
    )
    return admin.storage.from_(BUCKET).get_public_url(path)


def upload_user_photo(admin, user_id, file, ext):
    """Upload (or replace) a user's photo; returns the new public avatar_url."""
    _ensure_bucket(admin)

    row = (admin.table('users').select('avatar_url')
           .eq('id', user_id).limit(1).execute()).data or []
    old = row[0].get('avatar_url') if row else None
    if old and f'{BUCKET}/' in old:
        try:
            admin.storage.from_(BUCKET).remove([old.split(f'{BUCKET}/')[-1]])
        except Exception as e:  # noqa: BLE001
            logger.warning(f'user photo: could not remove old photo for {user_id[:8]}: {e}')

    path = f'{user_id}/{uuid.uuid4().hex}.{ext}'
    admin.storage.from_(BUCKET).upload(
        path=path, file=file.read(),
        file_options={'content-type': file.content_type or f'image/{ext}'},
    )
    avatar_url = admin.storage.from_(BUCKET).get_public_url(path)
    admin.table('users').update({'avatar_url': avatar_url}).eq('id', user_id).execute()
    return avatar_url
