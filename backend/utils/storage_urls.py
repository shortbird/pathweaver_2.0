"""Signed URLs for the private media buckets.

Why this exists
---------------
Student evidence, child avatars, family photos and — worst of all — parent
government-ID scans used to be written to PUBLIC Supabase buckets and handed
out as `/storage/v1/object/public/...` links. Those links never expire and
carry no authentication, so anyone who ever saw one (a forwarded email, a proxy
log, a browser history on a shared laptop) could fetch a minor's work forever.
Making a portfolio private did nothing: the object was still public.

Everything in :data:`PRIVATE_MEDIA_BUCKETS` is now a private bucket. Reads go
through :func:`sign_stored_url`, which mints a short-lived signed URL at render
time (TTL from ``Config.STORAGE_SIGNED_URL_TTL``). The pattern is lifted from
``services/sis_secure_docs_service.signed_url``, which has done this correctly
for the SIS document store since day one.

The two URL shapes
------------------
There are two different strings in play and conflating them is the easy bug:

``canonical``  ``https://auth.optioeducation.com/storage/v1/object/public/<bucket>/<path>``
    A durable *identifier*. This is what is written to the database — it is
    stable, it never expires, and (now that the bucket is private) it is not
    fetchable on its own. Thousands of rows already hold exactly this shape,
    which is why we keep writing it: no data migration, no dual-format columns.

``signed``     ``https://auth.optioeducation.com/storage/v1/object/sign/<bucket>/<path>?token=...``
    A *capability*, minted per request, valid for one TTL. Never store one.

So: **store canonical, serve signed.** :func:`sign_stored_url` accepts either
shape — plus a bare object path when you pass ``bucket`` — so a caller never has
to know which era a row came from.

Non-storage URLs (a YouTube link a student pasted, an external portfolio) pass
through untouched.
"""

from __future__ import annotations

from typing import Dict, Iterable, List, Optional, Tuple

from app_config import Config
from utils.logger import get_logger
from utils.storage_url import fix_storage_url

logger = get_logger(__name__)

# Buckets that must NOT be publicly readable. Everything here holds media about
# a minor, a family, or a staff member's identity.
#
# Deliberately absent: `site-assets` (marketing logos, hero images) and
# `quest-images` / `docs-images` (platform artwork). Those are genuinely public
# content with no personal data in them, and they are referenced by hardcoded
# URLs in the frontend bundles and in outbound email, where a signed URL would
# expire before the message is read.
PRIVATE_MEDIA_BUCKETS = frozenset({
    'quest-evidence',      # student evidence: photos, video, documents
    'user-uploads',        # avatars, learning-moment media
    'user-photos',         # SIS student/staff photos
    'family-images',       # household photos
    'staff-photos',        # staff headshots
    'org-documents',       # org paperwork
    'class-images',        # class photos (children in them)
    'community-images',    # SIS lost & found photos, taken inside the school
    'curriculum',          # org-owned curriculum material
    'identity-documents',  # parent government ID + signed consent forms
})

_PUBLIC_MARKER = '/storage/v1/object/public/'
_SIGNED_MARKER = '/storage/v1/object/sign/'
# The SDK has historically emitted /rest/v1/ instead of /storage/v1/; see
# utils.storage_url.fix_storage_url. Parse that shape too so legacy rows written
# before that fix are still resolvable.
_LEGACY_PUBLIC_MARKER = '/rest/v1/object/public/'
# Supabase's server-side image transform endpoint, used for HEIC -> JPEG.
_RENDER_MARKER = '/storage/v1/render/image/public/'


def default_ttl() -> int:
    """Signed-URL lifetime in seconds, from Config (never os.getenv directly)."""
    return int(Config.STORAGE_SIGNED_URL_TTL)


# ── parsing ──────────────────────────────────────────────────────────────────

def parse_object_ref(
    value: Optional[str],
    bucket: Optional[str] = None,
) -> Optional[Tuple[str, str]]:
    """Resolve ``value`` to ``(bucket, object_path)``, or None if it isn't ours.

    Accepts, in order:

    * a full public URL (``.../object/public/<bucket>/<path>``) — the legacy
      shape sitting in most rows today, and the canonical shape we still write;
    * a render/transform URL (``.../render/image/public/<bucket>/<path>``);
    * an already-signed URL (``.../object/sign/<bucket>/<path>?token=``), so
      re-signing something that was already signed is harmless;
    * a bare object path, when ``bucket`` is supplied.

    Returns None for anything else — an external link, an empty string, a data:
    URI — which is the signal to leave the value alone.
    """
    if not value or not isinstance(value, str):
        return None

    candidate = value.strip()
    if not candidate:
        return None

    for marker in (_PUBLIC_MARKER, _LEGACY_PUBLIC_MARKER, _SIGNED_MARKER, _RENDER_MARKER):
        if marker in candidate:
            tail = candidate.split(marker, 1)[1]
            tail = tail.split('?', 1)[0].split('#', 1)[0]
            if '/' not in tail:
                return None
            found_bucket, path = tail.split('/', 1)
            if not found_bucket or not path:
                return None
            return found_bucket, path

    # Some other absolute URL (YouTube, Google Docs, an already-external image).
    # Not ours to sign.
    if '://' in candidate:
        return None

    if not bucket:
        return None
    return bucket, candidate.lstrip('/')


def is_private_bucket(bucket: Optional[str]) -> bool:
    return bool(bucket) and bucket in PRIVATE_MEDIA_BUCKETS


# ── writing: the durable pointer ─────────────────────────────────────────────

def public_object_url(bucket: str, path: str) -> str:
    """The canonical identifier stored in the database.

    Same string ``storage.from_(bucket).get_public_url(path)`` produced (after
    ``fix_storage_url``), built locally so no call site has to reach for
    ``get_public_url`` — a name that now means "publicly readable", which for
    these buckets is exactly what we are trying to stop being true.
    """
    base = (Config.SUPABASE_URL or '').rstrip('/')
    return fix_storage_url(f"{base}{_PUBLIC_MARKER}{bucket}/{path.lstrip('/')}")


def canonical_stored_url(value: Optional[str]) -> Optional[str]:
    """Reduce whatever a client posted back to the durable pointer we persist.

    The other half of "store canonical, serve signed". Reads hand the browser a
    signed, expiring URL; editors and capture forms post the whole tree back on
    save. Without this reduction the row ends up holding a *capability* — it
    renders for one TTL and is a broken image forever after.

    External links and non-storage values pass through untouched, so this is
    safe to run over any client-supplied URL field.
    """
    ref = parse_object_ref(value)
    if not ref:
        return value
    return public_object_url(*ref)


# ── reading: the short-lived capability ──────────────────────────────────────

def _admin():
    # Imported lazily: database imports Config, and utils are imported from
    # inside Config-consuming modules.
    from database import get_supabase_admin_client
    return get_supabase_admin_client()


def signed_url(
    bucket: str,
    path: str,
    expires_in: Optional[int] = None,
    *,
    client=None,
) -> Optional[str]:
    """Mint a signed URL for one object. None if signing fails.

    Failing to None rather than falling back to a public URL is deliberate: a
    broken image is a bug report, a public URL is a disclosure.
    """
    if not bucket or not path:
        return None
    ttl = int(expires_in) if expires_in else default_ttl()
    try:
        store = (client or _admin()).storage.from_(bucket)
        signed = store.create_signed_url(path, ttl)
        raw = None
        if isinstance(signed, dict):
            raw = signed.get('signedURL') or signed.get('signedUrl') or signed.get('signed_url')
        return _normalize(raw)
    except Exception as e:  # noqa: BLE001
        # Lazy %-args, not an f-string: Sentry's logging integration groups by
        # the format TEMPLATE, and `path` carries a UUID, a timestamp and a
        # filename. Interpolated eagerly, every failing object opened its own
        # Sentry issue instead of incrementing one — a burst of uploads read as
        # a burst of unrelated bugs and buried the rate. `bucket` is a closed
        # set so it can stay in the template; the object path goes to `extra`,
        # where it is still on the event but out of the grouping hash.
        logger.error(
            "[storage] Failed to sign object in %s: %s", bucket, e,
            extra={'extra_fields': {'storage_path': path}},
        )
        return None


def _normalize(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    if raw.startswith('/'):
        # storage3 occasionally returns a path relative to the storage API root.
        base = (Config.SUPABASE_URL or '').rstrip('/')
        raw = f"{base}/storage/v1{raw}" if not raw.startswith('/storage/v1') else f"{base}{raw}"
    return fix_storage_url(raw)


def sign_stored_url(
    value: Optional[str],
    bucket: Optional[str] = None,
    expires_in: Optional[int] = None,
    *,
    client=None,
) -> Optional[str]:
    """The read-path helper. Give it whatever the database holds.

    * legacy public URL  -> parsed and re-signed
    * bare object path   -> signed against ``bucket``
    * external URL       -> returned unchanged
    * empty / None       -> None

    Objects in buckets outside :data:`PRIVATE_MEDIA_BUCKETS` come back as a
    plain public URL: `site-assets` and friends are public on purpose, and
    signing them would only add an expiry to a logo.
    """
    ref = parse_object_ref(value, bucket)
    if not ref:
        return value or None
    found_bucket, path = ref
    if not is_private_bucket(found_bucket):
        # A bare path for a public bucket still has to come back as something a
        # browser can load, so resolve it rather than echoing the path.
        return value if '://' in (value or '') else public_object_url(found_bucket, path)
    return signed_url(found_bucket, path, expires_in, client=client)


def sign_stored_urls(
    values: Iterable[Optional[str]],
    bucket: Optional[str] = None,
    expires_in: Optional[int] = None,
    *,
    client=None,
) -> Dict[str, Optional[str]]:
    """Batch version, keyed by the original value.

    A diploma page can carry dozens of evidence blocks; signing them one at a
    time is one HTTP round trip each. Supabase can sign a whole list per bucket
    in one call, so group by bucket and do that.
    """
    ttl = int(expires_in) if expires_in else default_ttl()
    by_bucket: Dict[str, Dict[str, str]] = {}   # bucket -> {path: original}
    out: Dict[str, Optional[str]] = {}

    seen: set = set()
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        ref = parse_object_ref(value, bucket)
        if not ref:
            out[value] = value
            continue
        found_bucket, path = ref
        if not is_private_bucket(found_bucket):
            out[value] = (
                value if '://' in value else public_object_url(found_bucket, path)
            )
            continue
        by_bucket.setdefault(found_bucket, {})[path] = value

    for found_bucket, paths in by_bucket.items():
        try:
            store = (client or _admin()).storage.from_(found_bucket)
            results = store.create_signed_urls(list(paths.keys()), ttl)
        except Exception as e:  # noqa: BLE001
            logger.error(f"[storage] Batch sign failed for {found_bucket}: {e}")
            results = None

        if results:
            for item in results:
                if not isinstance(item, dict):
                    continue
                # storage3 returns the requested path back under 'path'
                # (sometimes leading-slashed) alongside the signed URL.
                item_path = (item.get('path') or '').lstrip('/')
                original = paths.get(item_path)
                if original is None:
                    continue
                out[original] = _normalize(
                    item.get('signedURL') or item.get('signedUrl') or item.get('signed_url')
                )

        # Anything the batch call didn't answer for: fall back to one-at-a-time
        # so a single bad path can't blank an entire page.
        for path, original in paths.items():
            if original not in out:
                out[original] = signed_url(found_bucket, path, ttl, client=client)

    return out


def sign_in_place(
    records: List[dict],
    fields: Iterable[str],
    bucket: Optional[str] = None,
    expires_in: Optional[int] = None,
    *,
    client=None,
) -> None:
    """Rewrite named URL fields on a list of dicts to signed URLs, in one batch.

    Convenience for serializers that hand a list of rows straight to jsonify.
    Mutates ``records``.
    """
    if not isinstance(records, list):
        return
    fields = list(fields)
    originals = [
        r.get(f) for r in records
        if isinstance(r, dict)
        for f in fields
        if isinstance(r.get(f), str) and r.get(f)
    ]
    if not originals:
        return
    mapping = sign_stored_urls(originals, bucket, expires_in, client=client)
    for record in records:
        if not isinstance(record, dict):
            continue
        for field in fields:
            value = record.get(field)
            if isinstance(value, str) and value in mapping:
                record[field] = mapping[value]
