#!/usr/bin/env python3
"""Move parent government-ID documents out of the public quest-evidence bucket.

RUN THIS BY HAND, AGAINST PRODUCTION. It is not wired into CI, not imported by
the app, and not called by any migration. Nothing runs it for you.

    cd ~/pathweaver_2.0 && source venv/bin/activate
    python scripts/migrate_parent_identity_docs.py --dry-run   # look first
    python scripts/migrate_parent_identity_docs.py             # then move

What it does
------------
`routes/parental_consent/documents.py` used to upload a parent's government ID
and their signed consent form into `quest-evidence` — a PUBLIC bucket — under
`parent_identity/<user_id>/...`, and store the permanent public URL on the
users row. As of 2026-08-15 that endpoint writes to the private
`identity-documents` bucket instead, but the objects already up there are still
public. As of the audit there were 2 of them.

For each object under `parent_identity/` in `quest-evidence`, this script:

  1. downloads the bytes,
  2. uploads them to the same path in `identity-documents` (private),
  3. rewrites `users.parental_consent_id_document_url` /
     `users.parental_consent_signed_form_url` to point at the new bucket,
  4. deletes the original object from `quest-evidence`.

Order matters: the copy and the database rewrite both succeed before anything is
deleted. A crash halfway leaves a duplicate, which is recoverable; deleting
first would lose a legal document, which is not.

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env (the same
values the backend uses).
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import Dict, List, Optional

# Run from anywhere: put backend/ on the path so `database` and `app_config`
# resolve exactly as they do in the app.
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(_REPO_ROOT, 'backend'))

# `utils` must be imported before `database`, and the order is load-bearing.
# database imports utils.log_scrubber, which runs utils/__init__, which imports
# utils.auth.decorators, which imports database again -- still half-initialised,
# so the name it wants does not exist yet and the import dies. Letting utils
# finish first breaks the cycle. app.py never hits this because it imports the
# package well before anything reaches for database.
import utils  # noqa: E402,F401

from database import get_supabase_admin_client            # noqa: E402
from utils.storage_urls import public_object_url          # noqa: E402

OLD_BUCKET = 'quest-evidence'
NEW_BUCKET = 'identity-documents'
PREFIX = 'parent_identity'

URL_COLUMNS = (
    'parental_consent_id_document_url',
    'parental_consent_signed_form_url',
)


def list_objects(client) -> List[str]:
    """Every object path under parent_identity/ in the old bucket.

    Storage `list` is one directory at a time, so walk the per-user folders.
    """
    paths: List[str] = []
    store = client.storage.from_(OLD_BUCKET)

    try:
        user_dirs = store.list(PREFIX) or []
    except Exception as e:
        print(f"  ! could not list {OLD_BUCKET}/{PREFIX}: {e}")
        return paths

    for entry in user_dirs:
        name = entry.get('name')
        if not name:
            continue
        # A folder entry has no id/metadata; a file entry does.
        if entry.get('id'):
            paths.append(f"{PREFIX}/{name}")
            continue
        try:
            for f in (store.list(f"{PREFIX}/{name}") or []):
                if f.get('name'):
                    paths.append(f"{PREFIX}/{name}/{f['name']}")
        except Exception as e:
            print(f"  ! could not list {PREFIX}/{name}: {e}")

    return paths


def ensure_private_bucket(client) -> None:
    try:
        client.storage.get_bucket(NEW_BUCKET)
        print(f"  bucket {NEW_BUCKET} already exists")
        return
    except Exception:
        pass
    try:
        client.storage.create_bucket(NEW_BUCKET, options={'public': False})
        print(f"  created PRIVATE bucket {NEW_BUCKET}")
    except Exception as e:
        print(f"  ! could not create {NEW_BUCKET}: {e}")
        raise


def rows_referencing(client, path: str) -> List[Dict]:
    """Users rows whose consent-document URL contains this object path.

    Deliberately not anchored to the end of the string. The URLs actually stored
    by the old upload path carry a trailing '?' -- e.g.
    '.../parent_identity/<uid>/id_...png?' -- so a '%<path>' pattern matches
    nothing. The first run of this script reported both real documents as
    orphans for exactly that reason and declined to delete them, which is the
    safe direction to be wrong in, but it meant two government-ID scans stayed
    world-readable while their copies sat safely in the private bucket.
    """
    matches: List[Dict] = []
    for column in URL_COLUMNS:
        try:
            res = (client.table('users')
                   .select(f'id, {column}')
                   .like(column, f'%{path}%')
                   .execute())
        except Exception as e:
            print(f"  ! lookup on {column} failed: {e}")
            continue
        for row in (res.data or []):
            if row.get(column):
                matches.append({'id': row['id'], 'column': column})
    return matches


def migrate(dry_run: bool) -> int:
    client = get_supabase_admin_client()

    print(f"Scanning {OLD_BUCKET}/{PREFIX}/ ...")
    paths = list_objects(client)
    if not paths:
        print("Nothing to migrate.")
        return 0
    print(f"Found {len(paths)} object(s):")
    for p in paths:
        print(f"  - {p}")

    if dry_run:
        print("\n[dry run] Would move each of the above to "
              f"{NEW_BUCKET}/ and rewrite the matching users rows.")
        for path in paths:
            for match in rows_referencing(client, path):
                print(f"  [dry run] users.{match['column']} on {match['id']}"
                      f" -> {NEW_BUCKET}/{path}")
        return 0

    ensure_private_bucket(client)

    moved = 0
    for path in paths:
        print(f"\n{path}")

        try:
            blob = client.storage.from_(OLD_BUCKET).download(path)
        except Exception as e:
            print(f"  ! download failed, skipping: {e}")
            continue

        content_type = _guess_content_type(path)
        try:
            client.storage.from_(NEW_BUCKET).upload(
                path=path,
                file=blob,
                file_options={'content-type': content_type, 'upsert': 'true'},
            )
            print(f"  copied to {NEW_BUCKET}/{path} ({len(blob)} bytes)")
        except Exception as e:
            print(f"  ! upload failed, leaving original in place: {e}")
            continue

        new_url = public_object_url(NEW_BUCKET, path)
        rewritten = 0
        for match in rows_referencing(client, path):
            try:
                (client.table('users')
                 .update({match['column']: new_url})
                 .eq('id', match['id'])
                 .execute())
                rewritten += 1
                print(f"  users.{match['column']} on {match['id']} -> new bucket")
            except Exception as e:
                print(f"  ! failed to rewrite {match['column']} on {match['id']}: {e}")

        if rewritten == 0:
            print("  ! no users row references this object; NOT deleting the "
                  "original (orphan — investigate before removing by hand)")
            continue

        try:
            client.storage.from_(OLD_BUCKET).remove([path])
            print(f"  removed {OLD_BUCKET}/{path}")
            moved += 1
        except Exception as e:
            print(f"  ! delete from {OLD_BUCKET} failed (copy is safe, delete "
                  f"by hand): {e}")

    print(f"\nDone. {moved}/{len(paths)} object(s) fully migrated.")
    return 0 if moved == len(paths) else 1


def _guess_content_type(path: str) -> str:
    ext = path.rsplit('.', 1)[-1].lower() if '.' in path else ''
    return {
        'pdf': 'application/pdf',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
    }.get(ext, 'application/octet-stream')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true',
                        help='list what would move, change nothing')
    args = parser.parse_args()

    print("=" * 70)
    print("Parent identity document migration")
    print(f"  {OLD_BUCKET}/{PREFIX}/  ->  {NEW_BUCKET}/{PREFIX}/  (private)")
    print("=" * 70)
    return migrate(args.dry_run)


if __name__ == '__main__':
    raise SystemExit(main())
