"""Guards for the private-media-bucket migration (2026-08-15).

What went wrong, so the tests below are legible:

Student evidence, child avatars, family photos and scans of parents'
government ID were all written to PUBLIC Supabase buckets and handed out as
`/storage/v1/object/public/...` links. Those URLs never expire and carry no
authentication at all. Making a portfolio private did not take the files down —
the object stayed world-readable, so a link that leaked once (a forwarded email,
a proxy log) was a permanent hole into a minor's work.

The fix is the pattern `services/sis_secure_docs_service.py` has used correctly
since day one: private bucket, short-lived signed URL minted per render.
`utils/storage_urls.py` is the shared version of that, and the important thing
about it is that it accepts BOTH shapes — a bare object path AND a legacy full
public URL — so the thousands of rows already holding public URLs keep working
with no data migration.

Everything here is pure: no database, no Flask app, no network. The Supabase
client is a stub.
"""

from __future__ import annotations

import re
import warnings
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from utils.storage_urls import (
    PRIVATE_MEDIA_BUCKETS,
    parse_object_ref,
    public_object_url,
    sign_in_place,
    sign_stored_url,
    sign_stored_urls,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND = REPO_ROOT / 'backend'

SIGN_BASE = 'https://auth.optioeducation.com/storage/v1/object/sign'
PUBLIC_BASE = 'https://auth.optioeducation.com/storage/v1/object/public'


@pytest.fixture
def storage_client():
    """A Supabase-shaped stub whose signer echoes back a deterministic URL."""
    client = MagicMock()
    buckets = {}

    def from_(bucket):
        if bucket not in buckets:
            store = MagicMock()
            store.create_signed_url.side_effect = (
                lambda path, ttl, _b=bucket: {
                    'signedURL': f'{SIGN_BASE}/{_b}/{path}?token=tok-{ttl}'
                }
            )
            store.create_signed_urls.side_effect = (
                lambda paths, ttl, _b=bucket: [
                    {'path': p, 'signedURL': f'{SIGN_BASE}/{_b}/{p}?token=tok-{ttl}'}
                    for p in paths
                ]
            )
            buckets[bucket] = store
        return buckets[bucket]

    client.storage.from_.side_effect = from_
    return client


@pytest.fixture
def thumb_client():
    """Like `storage_client`, but its signer honours a transform option — what
    Supabase actually does for `create_signed_url(path, ttl, {'transform': …})`."""
    client = MagicMock()
    buckets = {}

    def from_(bucket):
        if bucket not in buckets:
            store = MagicMock()

            def sign(path, ttl, options=None, _b=bucket):
                t = (options or {}).get('transform')
                if not t:
                    return {'signedURL': f'{SIGN_BASE}/{_b}/{path}?token=tok-{ttl}'}
                base = SIGN_BASE.replace('/object/sign', '/render/image/sign')
                return {'signedURL':
                        f"{base}/{_b}/{path}?token=tok-{ttl}"
                        f"&w={t['width']}&h={t['height']}"}

            store.create_signed_url.side_effect = sign
            buckets[bucket] = store
        return buckets[bucket]

    client.storage.from_.side_effect = from_
    return client


# ── the helper signs a bare object path ──────────────────────────────────────

class TestSignsBarePath:
    def test_bare_path_is_signed_against_the_given_bucket(self, storage_client):
        signed = sign_stored_url(
            'evidence-tasks/user-1/task-1_20260815_photo.jpg',
            'quest-evidence',
            client=storage_client,
        )
        assert signed.startswith(f'{SIGN_BASE}/quest-evidence/')
        assert 'evidence-tasks/user-1/task-1_20260815_photo.jpg' in signed
        assert 'token=' in signed

    def test_bare_path_without_a_bucket_cannot_be_resolved(self, storage_client):
        """No bucket, no signature — and crucially, no fallback to a public URL."""
        assert parse_object_ref('some/loose/path.jpg') is None

    def test_leading_slash_is_tolerated(self, storage_client):
        assert parse_object_ref('/avatars/kid/photo.png', 'user-uploads') == (
            'user-uploads', 'avatars/kid/photo.png'
        )

    def test_ttl_comes_from_config_not_a_hardcoded_number(self, storage_client):
        from app_config import Config
        signed = sign_stored_url('a/b.jpg', 'user-uploads', client=storage_client)
        assert f'tok-{Config.STORAGE_SIGNED_URL_TTL}' in signed

    def test_explicit_ttl_overrides_the_default(self, storage_client):
        signed = sign_stored_url('a/b.jpg', 'user-uploads', 120, client=storage_client)
        assert 'tok-120' in signed


# ── the helper signs a LEGACY full public URL ────────────────────────────────

class TestSignsLegacyPublicUrl:
    """The backward-compatibility case that makes zero data migration possible."""

    def test_legacy_public_url_is_reduced_to_bucket_plus_path_and_signed(self, storage_client):
        legacy = f'{PUBLIC_BASE}/quest-evidence/evidence-tasks/u1/photo.jpg'
        signed = sign_stored_url(legacy, client=storage_client)
        assert signed == (
            f'{SIGN_BASE}/quest-evidence/evidence-tasks/u1/photo.jpg'
            f'?token=tok-3600'
        ) or signed.startswith(f'{SIGN_BASE}/quest-evidence/evidence-tasks/u1/photo.jpg?token=')
        assert '/object/public/' not in signed

    def test_raw_supabase_domain_is_handled_too(self, storage_client):
        legacy = ('https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/'
                  'public/user-uploads/avatars/kid-1/a.png')
        signed = sign_stored_url(legacy, client=storage_client)
        assert '/object/sign/user-uploads/avatars/kid-1/a.png' in signed

    def test_sdk_rest_v1_path_bug_is_handled(self, storage_client):
        """utils.storage_url exists because the SDK emitted /rest/v1/; rows
        written before that fix still hold the broken shape."""
        legacy = ('https://vvfgxcykxjybtvpfzwyx.supabase.co/rest/v1/object/'
                  'public/quest-evidence/e/f.jpg')
        assert parse_object_ref(legacy) == ('quest-evidence', 'e/f.jpg')

    def test_already_signed_url_is_re_signed_not_mangled(self, storage_client):
        already = f'{SIGN_BASE}/quest-evidence/e/f.jpg?token=stale'
        signed = sign_stored_url(already, client=storage_client)
        assert 'token=stale' not in signed
        assert '/object/sign/quest-evidence/e/f.jpg' in signed

    def test_render_transform_url_is_handled(self, storage_client):
        render = ('https://auth.optioeducation.com/storage/v1/render/image/'
                  'public/user-uploads/a/b.heic')
        assert parse_object_ref(render) == ('user-uploads', 'a/b.heic')


# ── things that must be left alone ───────────────────────────────────────────

class TestPassThrough:
    def test_external_links_are_untouched(self, storage_client):
        url = 'https://www.youtube.com/watch?v=abc123'
        assert sign_stored_url(url, client=storage_client) == url

    def test_deliberately_public_buckets_are_untouched(self, storage_client):
        """Marketing logos are referenced from hardcoded URLs and from email,
        where a URL that expires in an hour is worse than useless."""
        logo = f'{PUBLIC_BASE}/site-assets/logos/gradient_fav.svg'
        assert sign_stored_url(logo, client=storage_client) == logo
        assert 'site-assets' not in PRIVATE_MEDIA_BUCKETS

    def test_empty_values_return_none(self, storage_client):
        assert sign_stored_url(None, client=storage_client) is None
        assert sign_stored_url('', client=storage_client) is None

    def test_signing_failure_returns_none_never_a_public_url(self):
        """A broken image is a bug report. A public URL is a disclosure."""
        client = MagicMock()
        client.storage.from_.return_value.create_signed_url.side_effect = RuntimeError('nope')
        assert sign_stored_url('a/b.jpg', 'quest-evidence', client=client) is None


# ── the canonical pointer we persist ─────────────────────────────────────────

class TestCanonicalPointer:
    def test_public_object_url_round_trips_through_the_parser(self):
        url = public_object_url('quest-evidence', 'evidence-tasks/u/f.jpg')
        assert parse_object_ref(url) == ('quest-evidence', 'evidence-tasks/u/f.jpg')

    def test_canonical_pointer_uses_the_custom_domain(self):
        url = public_object_url('user-uploads', 'a/b.png')
        assert url.startswith('https://auth.optioeducation.com/storage/v1/object/public/')


# ── batch signing (a diploma page is dozens of blocks) ───────────────────────

class TestBatchSigning:
    def test_batch_maps_every_original_to_a_signed_url(self, storage_client):
        originals = [
            f'{PUBLIC_BASE}/quest-evidence/a.jpg',
            f'{PUBLIC_BASE}/quest-evidence/b.jpg',
            f'{PUBLIC_BASE}/user-uploads/c.png',
            'https://youtube.com/watch?v=x',
        ]
        out = sign_stored_urls(originals, client=storage_client)
        assert out[originals[0]].startswith(f'{SIGN_BASE}/quest-evidence/a.jpg')
        assert out[originals[1]].startswith(f'{SIGN_BASE}/quest-evidence/b.jpg')
        assert out[originals[2]].startswith(f'{SIGN_BASE}/user-uploads/c.png')
        assert out[originals[3]] == originals[3]

    def test_batch_groups_by_bucket_into_one_call_each(self, storage_client):
        originals = [
            f'{PUBLIC_BASE}/quest-evidence/a.jpg',
            f'{PUBLIC_BASE}/quest-evidence/b.jpg',
        ]
        sign_stored_urls(originals, client=storage_client)
        store = storage_client.storage.from_('quest-evidence')
        assert store.create_signed_urls.call_count == 1

    def test_batch_failure_falls_back_to_signing_one_at_a_time(self):
        """One bad path must not blank an entire portfolio page."""
        client = MagicMock()
        store = MagicMock()
        store.create_signed_urls.side_effect = RuntimeError('batch endpoint down')
        store.create_signed_url.side_effect = lambda p, ttl: {
            'signedURL': f'{SIGN_BASE}/quest-evidence/{p}?token=solo'
        }
        client.storage.from_.return_value = store

        original = f'{PUBLIC_BASE}/quest-evidence/a.jpg'
        out = sign_stored_urls([original], client=client)
        assert out[original].endswith('token=solo')

    def test_sign_in_place_rewrites_named_fields(self, storage_client):
        rows = [
            {'id': '1', 'image_url': f'{PUBLIC_BASE}/family-images/h1/a.jpg'},
            {'id': '2', 'image_url': None},
        ]
        sign_in_place(rows, ['image_url'], 'family-images', client=storage_client)
        assert '/object/sign/family-images/h1/a.jpg' in rows[0]['image_url']
        assert rows[1]['image_url'] is None


# ── lint-style regression guard ──────────────────────────────────────────────
#
# The whole class of bug is "somebody reached for get_public_url on a bucket
# holding a child's photo". A grep is a blunt instrument, but it is the one
# that survives a refactor by an author who has not read this file.

# Files that may call get_public_url forever, because the bucket really is
# public: marketing assets, platform artwork, docs screenshots. No personal
# data, and the URLs are embedded in email and in shipped frontend bundles
# where an expiring link would be worse than useless.
_PUBLIC_ON_PURPOSE = {
    'backend/routes/settings.py',                        # site-assets logos
    'backend/routes/docs.py',                            # docs-images
    'backend/routes/admin/quest_management/images.py',   # quest-images artwork
    'backend/scripts/upload_email_assets.py',            # site-assets, for email
    'backend/scripts/upload_homepage_images.py',         # site-assets marketing
}

# Files that name get_public_url legitimately while ALSO touching a private
# bucket, so they cannot sit on _PUBLIC_ON_PURPOSE (which asserts the opposite).
# Both are structural, not call sites awaiting conversion.
_INFRASTRUCTURE = {
    # The helper itself, which only mentions the name in its own docstring.
    'backend/utils/storage_urls.py':              'helper: docstring only',
    # Enforces PRIVATE_MEDIA_BUCKETS on the buckets it owns; its remaining
    # get_public_url calls are course-covers / quest-headers (public artwork).
    'backend/services/file_upload_service.py':    'course-covers, quest-headers',
}

# NOT yet remediated: a file listed here still writes a permanent public URL for
# an object in a bucket that PRIVATE_MEDIA_BUCKETS says must be private, so it is
# still a live exposure. Entries are listed rather than silently tolerated — the
# tests below fail both when a NEW unaccounted call site appears and when an
# entry here has gone stale, so the set can only shrink.
#
# EMPTY as of 2026-08-15: every writer has been converted to public_object_url()
# for the stored pointer plus sign_stored_url()/sign_stored_urls() on the read
# path, which is what makes
# supabase/migrations/20260815020000_private_storage_buckets.sql safe to apply.
# The mechanism stays even though it is empty: it is what catches the next
# regression, and an empty list is the assertion that there is nothing left.
_PENDING_REMEDIATION: dict = {}

# The files this change converted. These must never regain a get_public_url:
# they are the child-media write paths the 2026-08-15 finding was about.
_REMEDIATED = (
    'backend/services/media_upload_service.py',
    'backend/routes/uploads.py',
    'backend/routes/dependents.py',
    'backend/routes/parental_consent/documents.py',
    'backend/routes/sis/__init__.py',
    # Second wave: the writers left out of the first pass.
    'backend/routes/users/profile.py',
    'backend/routes/parent/child_overview.py',
    'backend/routes/admin/user_management.py',
    'backend/routes/admin/transfer_credits.py',
    'backend/routes/direct_messages.py',
    'backend/services/user_photo_service.py',
    'backend/routes/sis/community.py',
    'backend/routes/sis/resources.py',
    'backend/routes/sis/catalog.py',
    'backend/routes/sis/class_materials.py',
)

_GET_PUBLIC_URL = re.compile(r'\bget_public_url\s*\(')


def _python_sources():
    for path in BACKEND.rglob('*.py'):
        rel = path.relative_to(REPO_ROOT).as_posix()
        if '/tests/' in f'/{rel}' or rel.startswith('backend/tests/'):
            continue
        # Skip vendored code: __pycache__, and any virtualenv in the tree.
        # A developer's `backend/.venv` is gitignored but still walked, and
        # storage3 itself defines get_public_url — which failed this guard
        # locally for a call site nobody wrote.
        parts = set(rel.split('/'))
        if '__pycache__' in parts or parts & {'venv', '.venv', 'site-packages'}:
            continue
        yield rel, path


class TestNoPublicUrlsForPrivateBuckets:
    def test_remediated_child_media_paths_have_no_get_public_url(self):
        """The point of the whole change: no permanent public URL is minted for
        student evidence, a child's avatar, a family photo, or a parent's ID."""
        offenders = []
        for rel in _REMEDIATED:
            path = REPO_ROOT / rel
            assert path.exists(), f'{rel} moved or was deleted — update this test'
            if _GET_PUBLIC_URL.search(path.read_text(encoding='utf-8')):
                offenders.append(rel)
        assert not offenders, (
            'get_public_url() is back in a child-media write path. Use '
            'public_object_url() for the pointer stored in the database and '
            'sign_stored_url() for anything handed to a browser:\n  '
            + '\n  '.join(offenders)
        )

    def test_no_unaccounted_get_public_url_call_sites(self):
        """Every caller is either public-on-purpose or a known pending fix.

        Adding a bucket-agnostic get_public_url back into an upload path is how
        this shipped the first time; being forced onto one of the two lists
        makes "which bucket, and is it public on purpose?" a review question.
        """
        known = _PUBLIC_ON_PURPOSE | set(_PENDING_REMEDIATION) | set(_INFRASTRUCTURE)
        offenders = [
            rel for rel, path in _python_sources()
            if _GET_PUBLIC_URL.search(path.read_text(encoding='utf-8', errors='ignore'))
            and rel not in known
        ]
        assert not offenders, (
            'New get_public_url() call site. If the bucket is in '
            'utils.storage_urls.PRIVATE_MEDIA_BUCKETS, use public_object_url() '
            'for the stored pointer and sign_stored_url() for the browser:\n  '
            + '\n  '.join(sorted(offenders))
        )

    def test_public_on_purpose_files_never_touch_a_private_bucket(self):
        """That allowlist is per-file, so make sure none of those files has
        quietly grown an upload into a bucket holding personal media."""
        for rel in sorted(_PUBLIC_ON_PURPOSE):
            path = REPO_ROOT / rel
            if not path.exists():
                continue
            source = path.read_text(encoding='utf-8', errors='ignore')
            for bucket in PRIVATE_MEDIA_BUCKETS:
                assert f"'{bucket}'" not in source and f'"{bucket}"' not in source, (
                    f'{rel} is allowlisted for get_public_url but references the '
                    f'private bucket {bucket!r}'
                )

    def test_pending_list_stays_honest(self):
        """Flag pending entries that are already fixed, so the list cannot rot
        into a permanent excuse.

        This WARNS rather than fails, deliberately. The one-way property that
        matters — nothing new may be added — is enforced by
        test_no_unaccounted_get_public_url_call_sites above, which does fail.
        Making shrinkage fail too would turn every completed remediation into a
        red build for whoever did the work, and the natural way to make a red
        build green is to delete the guard.
        """
        stale = [
            rel for rel in _PENDING_REMEDIATION
            if (REPO_ROOT / rel).exists()
            and not _GET_PUBLIC_URL.search((REPO_ROOT / rel).read_text(encoding='utf-8'))
        ]
        if stale:
            warnings.warn(
                'These no longer call get_public_url — remove them from '
                '_PENDING_REMEDIATION: ' + ', '.join(sorted(stale)),
                stacklevel=2,
            )

    def test_remediated_files_never_create_a_public_bucket(self):
        """Buckets here are created lazily by application code, so a stray
        `public: True` at one call site decides it for the whole platform,
        permanently and invisibly."""
        pattern = re.compile(r"create_bucket\s*\(([^)]*)\)", re.DOTALL)
        offenders = []
        for rel in _REMEDIATED:
            source = (REPO_ROOT / rel).read_text(encoding='utf-8')
            for match in pattern.finditer(source):
                call = match.group(1)
                if "'public': True" in call or '"public": True' in call:
                    offenders.append(f'{rel}: {call.strip()[:80]}')
        assert not offenders, (
            'create_bucket(..., public=True) in a remediated path:\n  '
            + '\n  '.join(sorted(offenders))
        )

    def test_file_upload_service_forces_private_buckets_private(self):
        """_ensure_bucket_exists takes a `public` flag from its caller. A bucket
        on the private list must override it — one wrong call site is enough."""
        source = (BACKEND / 'services' / 'file_upload_service.py').read_text(encoding='utf-8')
        assert 'PRIVATE_MEDIA_BUCKETS' in source
        assert 'public = False' in source


class TestMigrationExists:
    """The migration was deliberately SPLIT IN TWO on 2026-08-15, and the split
    is now CLOSED.

    ``..._private_storage_buckets.sql`` flipped the nine buckets whose read
    paths were converted first. ``..._private_quest_evidence_bucket.sql`` flips
    `quest-evidence` alone; it was held back under a DO-NOT-APPLY marker while
    ~9 route modules still returned `evidence_url` and evidence-block media
    unsigned, because flipping it then would have blanked the evidence on a
    student's own quest page.

    Those conversions landed (see `_EVIDENCE_READ_PATHS` below, which is the
    guard that keeps them landed), so the marker is gone and the file is
    applyable. The two files are kept SEPARATE rather than merged: the first one
    has already been applied, and rewriting an applied migration is how a
    migration history stops matching the database.

    Between them the two files must still account for EVERY bucket on
    PRIVATE_MEDIA_BUCKETS — that is what the first test below enforces, so a
    bucket cannot go missing through the split.
    """

    MIGRATIONS = REPO_ROOT / 'supabase' / 'migrations'
    MAIN = '20260815020000_private_storage_buckets.sql'
    EVIDENCE = '20260815070000_private_quest_evidence_bucket.sql'

    def _sql(self, name):
        path = self.MIGRATIONS / name
        assert path.exists(), f'{name} is missing'
        return path.read_text(encoding='utf-8')

    def test_between_them_the_migrations_flip_every_private_bucket(self):
        combined = self._sql(self.MAIN) + self._sql(self.EVIDENCE)
        assert 'UPDATE storage.buckets' in combined
        missing = [b for b in PRIVATE_MEDIA_BUCKETS if f"'{b}'" not in combined]
        assert not missing, (
            'These are on PRIVATE_MEDIA_BUCKETS but neither migration flips '
            f'them to public = false: {sorted(missing)}'
        )

    def test_quest_evidence_is_flipped_by_exactly_one_of_the_two(self):
        """`quest-evidence` belongs to the evidence migration and only to it.

        The first file has been applied; adding the bucket to its UPDATE now
        would be a no-op against the real database and a lie in the history.
        The second file is the one that actually flips it."""
        main_update = self._sql(self.MAIN).split('UPDATE storage.buckets', 1)[1].split(';', 1)[0]
        assert "'quest-evidence'" not in main_update, (
            'The already-applied migration now claims to flip quest-evidence. '
            f'That flip belongs in {self.EVIDENCE}, which is the file that '
            'still has to be run.'
        )

        evidence_update = self._sql(self.EVIDENCE).split('UPDATE storage.buckets', 1)[1].split(';', 1)[0]
        assert "'quest-evidence'" in evidence_update
        assert 'public = false' in evidence_update

    def test_the_evidence_migration_no_longer_claims_to_be_blocked(self):
        """The inverse of the guard this replaced.

        While route modules still served unsigned evidence URLs, this file had
        to carry DO-NOT-APPLY and name them, and the guard checked the warning
        was still there — a migration is only safe to hold back while it says
        why. Now that the read paths sign (enforced by
        `TestEvidenceReadPathsSign`), the warning must be GONE: a stale
        DO-NOT-APPLY on a ready migration is how student evidence stays
        world-readable for another month because nobody dared run it."""
        sql = self._sql(self.EVIDENCE)
        assert 'DO NOT APPLY' not in sql, (
            'The evidence migration is still marked DO NOT APPLY. If a read '
            'path really did regress, fix it; if not, clear the marker — '
            'quest-evidence is world-readable until this runs.'
        )
        assert 'Blocked on' not in sql
        # It must still explain what it does and what had to be true first;
        # dropping the marker is not licence to drop the reasoning.
        assert 'quest-evidence' in sql
        assert 'sign' in sql.lower()


# ── the converted call sites, exercised for real ─────────────────────────────
#
# The lint guard above proves `get_public_url` is gone. It cannot prove the
# replacement is correct — that the DATABASE keeps the durable pointer while the
# BROWSER gets an expiring one. These two do, on the paths where getting it
# backwards is worst: a child's photo, and a list that could quietly become one
# signing round trip per row.

class TestChildAvatarWritePath:
    """`POST /api/parent/children/<id>/avatar` — a guardian uploading a photo of
    their own child, the single most sensitive avatar path on the platform."""

    def test_the_row_keeps_the_pointer_and_the_parent_gets_a_signed_url(
        self, storage_client, monkeypatch
    ):
        from routes.parent import child_overview

        filename = 'avatars/child-1/abc.jpg'
        stored = public_object_url('user-uploads', filename)

        # What the route writes to users.avatar_url must be fetchable by nobody.
        assert stored.startswith(f'{PUBLIC_BASE}/user-uploads/')
        assert 'token=' not in stored

        # What it hands back must be fetchable by this parent, for one TTL.
        monkeypatch.setattr(
            child_overview, 'sign_stored_url',
            lambda value, bucket=None, *a, **k: sign_stored_url(
                value, bucket, client=storage_client
            ),
        )
        served = child_overview.sign_stored_url(stored, 'user-uploads')
        assert served.startswith(f'{SIGN_BASE}/user-uploads/{filename}')
        assert 'token=' in served
        assert '/object/public/' not in served

    def test_a_signing_failure_shows_a_broken_image_not_the_child(self):
        """If signing fails there is no fallback. A broken avatar is a bug
        report; a public URL to a minor's face is a disclosure."""
        client = MagicMock()
        client.storage.from_.return_value.create_signed_url.side_effect = RuntimeError('down')
        assert sign_stored_url(
            f'{PUBLIC_BASE}/user-uploads/avatars/child-1/abc.jpg', client=client
        ) is None

    def test_the_child_avatar_route_signs_what_it_returns(self):
        """Read the route: the value returned to the parent is signed, and the
        value written to the row is not."""
        source = (BACKEND / 'routes' / 'parent' / 'child_overview.py').read_text(encoding='utf-8')
        assert "avatar_url = public_object_url('user-uploads', filename)" in source
        assert "'avatar_url': sign_stored_url(avatar_url, 'user-uploads')" in source
        # ...and the GET that renders the child's profile signs it too.
        assert "sign_stored_url(student.get('avatar_url'), 'user-uploads')" in source


class TestListPathsSignInOneBatch:
    """A roster, a catalog or a message thread must cost ONE signing call, not
    one per row. `sign_stored_urls` groups by bucket; `sign_in_place` is the
    serializer-facing wrapper around it."""

    def test_a_whole_list_costs_one_call_per_bucket(self, storage_client):
        rows = [
            {'id': str(i), 'image_url': f'{PUBLIC_BASE}/class-images/c{i}/photo.jpg'}
            for i in range(25)
        ]
        sign_in_place(rows, ['image_url'], 'class-images', client=storage_client)

        store = storage_client.storage.from_('class-images')
        assert store.create_signed_urls.call_count == 1
        assert store.create_signed_url.call_count == 0
        assert all('/object/sign/class-images/' in r['image_url'] for r in rows)

    def test_mixed_buckets_batch_per_bucket_not_per_row(self, storage_client):
        rows = [
            {'avatar_url': f'{PUBLIC_BASE}/user-photos/u{i}/a.jpg',
             'doc_url': f'{PUBLIC_BASE}/org-documents/o/d{i}.pdf'}
            for i in range(10)
        ]
        sign_in_place(rows, ['avatar_url', 'doc_url'], client=storage_client)

        assert storage_client.storage.from_('user-photos').create_signed_urls.call_count == 1
        assert storage_client.storage.from_('org-documents').create_signed_urls.call_count == 1
        assert all('token=' in r['avatar_url'] and 'token=' in r['doc_url'] for r in rows)

    def test_an_external_link_in_the_list_is_left_alone(self, storage_client):
        """The resource library mixes uploaded documents with plain links; a
        Google Doc must not come back rewritten."""
        rows = [
            {'url': f'{PUBLIC_BASE}/org-documents/o/handbook.pdf'},
            {'url': 'https://docs.google.com/document/d/abc/edit'},
            {'url': None},
        ]
        sign_in_place(rows, ['url'], client=storage_client)
        assert '/object/sign/org-documents/o/handbook.pdf' in rows[0]['url']
        assert rows[1]['url'] == 'https://docs.google.com/document/d/abc/edit'
        assert rows[2]['url'] is None


class TestAvatarListPaths:
    """`users.avatar_url` is read out of the database and returned to a client
    from ~60 endpoints — rosters, contact lists, feeds, review queues. Those are
    the paths where "just call sign_stored_url in the loop" is the tempting
    wrong answer: a 300-child roster would become 300 storage round trips inside
    one request. These pin the batched shape instead."""

    def test_a_roster_of_avatars_costs_one_call_not_one_per_child(self, storage_client):
        roster = [
            {'student_id': f'u{i}', 'name': f'Kid {i}',
             'avatar_url': f'{PUBLIC_BASE}/user-photos/u{i}/face.jpg'}
            for i in range(300)
        ]
        sign_in_place(roster, ['avatar_url'], client=storage_client)

        store = storage_client.storage.from_('user-photos')
        assert store.create_signed_urls.call_count == 1
        assert store.create_signed_url.call_count == 0
        assert all('/object/sign/user-photos/' in r['avatar_url'] for r in roster)
        assert not any('/object/public/' in r['avatar_url'] for r in roster)

    def test_avatars_split_across_buckets_still_batch_per_bucket(self, storage_client):
        """An avatar can live in `user-uploads` (platform upload), `user-photos`
        (SIS/iCreate) or `staff-photos`. Callers pass NO bucket so each row is
        resolved from its own stored URL — one batch per bucket, regardless."""
        rows = (
            [{'avatar_url': f'{PUBLIC_BASE}/user-uploads/avatars/a{i}/p.png'} for i in range(8)]
            + [{'avatar_url': f'{PUBLIC_BASE}/user-photos/b{i}/p.jpg'} for i in range(8)]
            + [{'avatar_url': f'{PUBLIC_BASE}/staff-photos/c{i}/p.jpg'} for i in range(8)]
        )
        sign_in_place(rows, ['avatar_url'], client=storage_client)

        for bucket in ('user-uploads', 'user-photos', 'staff-photos'):
            store = storage_client.storage.from_(bucket)
            assert store.create_signed_urls.call_count == 1, bucket
            assert store.create_signed_url.call_count == 0, bucket
        assert all('token=' in r['avatar_url'] for r in rows)

    def test_a_missing_avatar_stays_none_and_costs_nothing(self, storage_client):
        rows = [{'avatar_url': None}, {'avatar_url': ''}, {'name': 'no field'}]
        sign_in_place(rows, ['avatar_url'], client=storage_client)
        assert rows[0]['avatar_url'] is None
        assert rows[1]['avatar_url'] == ''
        assert storage_client.storage.from_.call_count == 0

    def test_a_signing_failure_blanks_the_avatar_rather_than_exposing_the_child(self):
        """The whole point, on the list path this time. If Storage is down the
        roster renders with broken images — it does NOT quietly fall back to the
        world-readable /object/public/ URL that this change exists to retire."""
        client = MagicMock()
        store = MagicMock()
        store.create_signed_urls.side_effect = RuntimeError('storage down')
        store.create_signed_url.side_effect = RuntimeError('storage down')
        client.storage.from_.return_value = store

        rows = [
            {'avatar_url': f'{PUBLIC_BASE}/user-photos/u{i}/face.jpg'}
            for i in range(5)
        ]
        sign_in_place(rows, ['avatar_url'], client=client)

        assert all(r['avatar_url'] is None for r in rows), rows
        assert not any(
            isinstance(r['avatar_url'], str) and '/object/public/' in r['avatar_url']
            for r in rows
        )

    def test_a_partial_batch_response_leaves_no_row_on_a_public_url(self):
        """storage3 answering for only some paths must not leave the rest
        holding their original public URL — the unanswered ones fall back to
        single signing, and if that fails too they go to None."""
        client = MagicMock()
        store = MagicMock()
        answered = f'{PUBLIC_BASE}/user-photos/u0/face.jpg'
        store.create_signed_urls.side_effect = lambda paths, ttl: [
            {'path': paths[0], 'signedURL': f'{SIGN_BASE}/user-photos/{paths[0]}?token=ok'}
        ]
        store.create_signed_url.side_effect = RuntimeError('nope')
        client.storage.from_.return_value = store

        rows = [{'avatar_url': f'{PUBLIC_BASE}/user-photos/u{i}/face.jpg'} for i in range(3)]
        sign_in_place(rows, ['avatar_url'], client=client)

        signed = [r['avatar_url'] for r in rows if r['avatar_url']]
        assert all('/object/sign/' in v for v in signed)
        assert not any(
            isinstance(r['avatar_url'], str) and '/object/public/' in r['avatar_url']
            for r in rows
        )
        assert answered  # named for legibility; the first path is the answered one


# Read paths that hand `users.avatar_url` (or a renamed copy of it) to a
# client. Flipping `user-uploads` / `user-photos` private turns every one of
# these into a broken image unless it signs — which is exactly why the third
# wave existed. Listed by file so deleting the signing call fails here rather
# than in a screenshot three weeks later.
_AVATAR_READ_PATHS = (
    'backend/routes/auth/login/core.py',            # /me and login — every surface
    'backend/routes/auth/google_oauth.py',
    'backend/routes/auth/apple_oauth.py',
    'backend/routes/direct_messages.py',            # contacts + children picker
    'backend/services/direct_message_service.py',   # conversation headers
    'backend/services/group_message_service.py',    # members, senders, pickers
    'backend/routes/observer/feed.py',
    'backend/routes/observer/family.py',
    'backend/routes/observer/social.py',
    'backend/routes/observer/sharing.py',
    'backend/routes/observer/acceptance.py',
    'backend/services/activity_feed_service.py',
    'backend/services/sis_service.py',              # get_roster, staff, households
    'backend/services/sis_staff_service.py',        # class_roster_detail
    'backend/services/sis_catalog_service.py',      # instructors
    'backend/services/sis_parent_service.py',
    'backend/routes/sis/gradebook.py',
    'backend/routes/sis/submissions.py',
    'backend/routes/sis/goals.py',
    'backend/routes/sis/staff_portal.py',
    'backend/routes/sis/student_records.py',
    'backend/routes/kiosk.py',                      # pre-auth device-token roster
    'backend/routes/treehouse.py',                  # pre-auth device-token roster
    'backend/routes/dependents.py',
    'backend/routes/parent/communications.py',
    'backend/routes/parent/dashboard_overview.py',
    'backend/routes/parent_linking/dashboard.py',
    'backend/routes/parent_linking/requests.py',
    'backend/routes/advisor/student_overview.py',
    'backend/routes/credit_dashboard/items.py',
    'backend/routes/admin/class_reviews.py',
    'backend/routes/admin/masquerade.py',
    'backend/routes/account_deletion.py',           # GDPR export links
    'backend/repositories/user_repository.py',
    'backend/repositories/parent_repository.py',
    'backend/repositories/advisor_repository.py',
    'backend/repositories/analytics_repository.py',
    'backend/services/advisor_service.py',
    'backend/services/dependent_progress_service.py',
    'backend/services/peer_connection_service.py',
    'backend/services/xp_service.py',
)

# sign_thumb_urls/sign_thumbs_in_place count too: they sign the same way, and
# additionally bake a render size into the token (see storage_urls).
_SIGNS_SOMETHING = re.compile(
    r'\bsign_(?:in_place|stored_urls?|thumbs_in_place|thumb_urls)\s*\('
)
# The batched helpers — one storage call for a whole list, rather than one per row.
_BATCHED_HELPERS = ('sign_in_place', 'sign_thumbs_in_place')


class TestAvatarReadPathsSign:
    def test_every_avatar_read_path_signs_before_it_serializes(self):
        offenders = []
        for rel in _AVATAR_READ_PATHS:
            path = REPO_ROOT / rel
            assert path.exists(), f'{rel} moved or was deleted — update this test'
            if not _SIGNS_SOMETHING.search(path.read_text(encoding='utf-8')):
                offenders.append(rel)
        assert not offenders, (
            'These return users.avatar_url to a client but no longer sign it. '
            '`user-uploads` and `user-photos` are private buckets: an unsigned '
            'pointer is a broken image, and re-opening the bucket to fix it is '
            "the disclosure this change closed:\n  " + '\n  '.join(offenders)
        )

    def test_list_paths_use_the_batched_helper_not_a_per_row_loop(self):
        """A roster, a feed or a contact list must not sign row by row. These
        specific files serve lists, so they must reach for the batched helper."""
        list_paths = (
            'backend/routes/direct_messages.py',
            'backend/routes/observer/feed.py',
            'backend/services/sis_service.py',
            'backend/services/sis_staff_service.py',
            'backend/routes/sis/gradebook.py',
            'backend/routes/sis/submissions.py',
            'backend/routes/kiosk.py',
            'backend/repositories/user_repository.py',
        )
        offenders = [
            rel for rel in list_paths
            if not any(h in (REPO_ROOT / rel).read_text(encoding='utf-8')
                       for h in _BATCHED_HELPERS)
        ]
        assert not offenders, (
            'These serve LISTS of people. Signing one URL per row is one storage '
            'round trip per row inside a single request; use sign_in_place() or '
            'sign_thumbs_in_place():\n  ' + '\n  '.join(offenders)
        )


class TestSignedUrlsAreNeverPersisted:
    """The other half of the contract. Every converted write path reduces a
    client-supplied URL back to the canonical pointer first, because the client
    only ever holds the signed twin and posts it straight back on save."""

    def test_a_signed_url_round_trips_back_to_the_canonical_pointer(self):
        stored = public_object_url('quest-evidence', 'transcripts/u1/t.pdf')
        signed = f'{SIGN_BASE}/quest-evidence/transcripts/u1/t.pdf?token=abc'
        assert public_object_url(*parse_object_ref(signed)) == stored

    def test_write_paths_canonicalize_before_they_store(self):
        checks = {
            'backend/routes/admin/transfer_credits.py': 'transcript_url = public_object_url(*ref)',
            'backend/routes/users/profile.py': "update_data['avatar_url'] = public_object_url(*ref)",
            'backend/services/messaging_extras_service.py': 'def _stored_attachment_url',
            'backend/services/sis_community_service.py': 'def _stored_image_url',
            'backend/routes/sis/resources.py': 'def _stored_resource_url',
            # Third wave: the two avatar write paths a client can post back to.
            'backend/routes/dependents.py': 'public_object_url(*ref)',
            'backend/routes/registration_funnel.py': 'photo_url = public_object_url(*_ref)',
            # Fourth wave: evidence. Every one of these takes a media URL out of
            # a request body — the editor auto-saves the tree it was rendered,
            # and the capture forms post back whatever the upload endpoint
            # handed them, which is the SIGNED twin.
            'backend/routes/evidence_documents.py': '_canonical_block_content(content)',
            'backend/routes/helper_evidence.py': 'PortfolioService.canonical_block_content',
            'backend/routes/parent/learning_moments.py': 'canonical_stored_url',
            'backend/routes/advisor/learning_moments.py': 'canonical_stored_url',
        }
        for rel, needle in checks.items():
            source = (REPO_ROOT / rel).read_text(encoding='utf-8')
            assert needle in source, (
                f'{rel} no longer reduces a submitted URL to the canonical '
                f'pointer — a signed, expiring URL can now reach the database'
            )


# ── evidence: the last bucket to go private ──────────────────────────────────
#
# `quest-evidence` holds the thing this whole change is named for — photographs,
# video and documents a child made, plus their prior-school transcripts. It went
# private LAST, behind the other nine buckets, because ~9 route modules read
# `quest_task_completions.evidence_url` and the media URLs inside
# `evidence_document_blocks.content` / `learning_event_evidence_blocks` straight
# out of the database and serialized them unsigned. These pin the conversion.


@pytest.fixture
def sign_blocks(storage_client, monkeypatch):
    """`PortfolioService.sign_evidence_blocks`, wired to the stub signer.

    This is the shared helper for evidence-block structures — one batched call
    for a whole page of blocks — so the evidence read paths are tested through
    the same function they call rather than a copy of it.
    """
    from services import portfolio_service as ps

    monkeypatch.setattr(
        ps, 'sign_stored_urls',
        lambda values, bucket=None, expires_in=None, **kwargs: sign_stored_urls(
            values, bucket, expires_in, client=storage_client
        ),
    )
    return ps.PortfolioService(client=MagicMock()).sign_evidence_blocks


class TestEvidenceListPathsSignInOneBatch:
    """A quest page, a parent's 30-day completions feed and a journal are all
    LISTS of evidence. Signing one URL per row is one storage round trip per row
    inside a single request — the same trap the avatar rosters had."""

    def test_a_quest_page_of_evidence_costs_one_call_not_one_per_task(self, storage_client):
        """`GET /api/quests/<id>` for an enrolled student: every completed task
        carries an evidence_url. 40 tasks must cost one signing call."""
        tasks = [
            {'id': f't{i}', 'is_completed': True,
             'evidence_url': f'{PUBLIC_BASE}/quest-evidence/evidence-tasks/u1/t{i}.jpg'}
            for i in range(40)
        ]
        sign_in_place(tasks, ['evidence_url'], client=storage_client)

        store = storage_client.storage.from_('quest-evidence')
        assert store.create_signed_urls.call_count == 1
        assert store.create_signed_url.call_count == 0
        assert all('/object/sign/quest-evidence/' in t['evidence_url'] for t in tasks)
        assert not any('/object/public/' in t['evidence_url'] for t in tasks)

    def test_a_page_of_evidence_blocks_costs_one_call_per_bucket(self, sign_blocks, storage_client):
        """The parent completions feed flattens blocks from many documents into
        one signing call — see quests_view.sign_blocks_for_response."""
        blocks = [
            {'id': f'b{i}', 'block_type': 'image', 'content': {
                'url': f'{PUBLIC_BASE}/quest-evidence/doc{i}/photo.jpg',
                'thumbnail_url': f'{PUBLIC_BASE}/quest-evidence/doc{i}/thumb.jpg',
            }}
            for i in range(30)
        ]
        sign_blocks(blocks)

        store = storage_client.storage.from_('quest-evidence')
        assert store.create_signed_urls.call_count == 1
        assert store.create_signed_url.call_count == 0
        for block in blocks:
            assert '/object/sign/quest-evidence/' in block['content']['url']
            assert '/object/sign/quest-evidence/' in block['content']['thumbnail_url']

    def test_a_block_signs_its_file_url_column_as_well_as_its_content(self, sign_blocks):
        """`learning_event_evidence_blocks` duplicates the media URL into a
        `file_url` COLUMN beside the content JSON, and the journal renders from
        it. Signing only the JSON leaves the column holding a dead pointer."""
        block = {
            'block_type': 'image',
            'file_url': f'{PUBLIC_BASE}/user-uploads/moments/m1/photo.jpg',
            'content': {'url': f'{PUBLIC_BASE}/user-uploads/moments/m1/photo.jpg'},
        }
        sign_blocks([block])

        assert '/object/sign/user-uploads/moments/m1/photo.jpg' in block['file_url']
        assert '/object/sign/user-uploads/moments/m1/photo.jpg' in block['content']['url']
        assert '/object/public/' not in block['file_url']

    def test_a_multi_file_block_signs_every_item(self, sign_blocks):
        """The newer block shape holds an `items` array, not a single url."""
        block = {'block_type': 'document', 'content': {'items': [
            {'url': f'{PUBLIC_BASE}/quest-evidence/e/{i}.pdf', 'filename': f'{i}.pdf'}
            for i in range(5)
        ]}}
        sign_blocks([block])

        assert all(
            '/object/sign/quest-evidence/' in item['url']
            for item in block['content']['items']
        )

    def test_an_external_link_block_is_left_alone(self, sign_blocks):
        """Students paste YouTube links as evidence. Those are not ours."""
        block = {'block_type': 'link', 'content': {
            'url': 'https://www.youtube.com/watch?v=abc123', 'title': 'My recital',
        }}
        sign_blocks([block])
        assert block['content']['url'] == 'https://www.youtube.com/watch?v=abc123'


class TestEvidenceSigningFailureYieldsNone:
    """The rule that makes the whole change safe, on the evidence paths.

    If Storage is down the page renders with broken media. It does NOT fall back
    to the `/object/public/` URL — that URL is the disclosure this migration
    exists to close, and a fallback would quietly reopen it every time signing
    hiccuped."""

    def test_a_failed_batch_blanks_evidence_urls_rather_than_exposing_them(self):
        client = MagicMock()
        store = MagicMock()
        store.create_signed_urls.side_effect = RuntimeError('storage down')
        store.create_signed_url.side_effect = RuntimeError('storage down')
        client.storage.from_.return_value = store

        tasks = [
            {'id': f't{i}',
             'evidence_url': f'{PUBLIC_BASE}/quest-evidence/evidence-tasks/u1/t{i}.jpg'}
            for i in range(5)
        ]
        sign_in_place(tasks, ['evidence_url'], client=client)

        assert all(t['evidence_url'] is None for t in tasks), tasks
        assert not any(
            isinstance(t['evidence_url'], str) and '/object/public/' in t['evidence_url']
            for t in tasks
        )

    def test_a_failed_block_signing_blanks_the_media_rather_than_exposing_it(self, monkeypatch):
        """Same rule one level up, through the evidence-block helper: a child's
        photograph goes to None, never back to a world-readable URL."""
        from services import portfolio_service as ps

        client = MagicMock()
        store = MagicMock()
        store.create_signed_urls.side_effect = RuntimeError('storage down')
        store.create_signed_url.side_effect = RuntimeError('storage down')
        client.storage.from_.return_value = store
        monkeypatch.setattr(
            ps, 'sign_stored_urls',
            lambda values, bucket=None, expires_in=None, **kwargs: sign_stored_urls(
                values, bucket, expires_in, client=client
            ),
        )

        blocks = [
            {'block_type': 'image',
             'file_url': f'{PUBLIC_BASE}/quest-evidence/e/{i}.jpg',
             'content': {'url': f'{PUBLIC_BASE}/quest-evidence/e/{i}.jpg'}}
            for i in range(4)
        ]
        ps.PortfolioService(client=MagicMock()).sign_evidence_blocks(blocks)

        assert all(b['content']['url'] is None for b in blocks), blocks
        assert all(b['file_url'] is None for b in blocks), blocks

    def test_a_single_evidence_url_fails_to_none(self):
        """`GET /api/parent/task/<student>/<task>` signs one URL, not a list."""
        client = MagicMock()
        client.storage.from_.return_value.create_signed_url.side_effect = RuntimeError('down')
        assert sign_stored_url(
            f'{PUBLIC_BASE}/quest-evidence/evidence-tasks/u1/photo.jpg', client=client
        ) is None


# Read paths that hand student evidence to a client: the `evidence_url` column,
# the media inside evidence blocks, or both. Flipping `quest-evidence` private
# turns every one of these into blank evidence unless it signs — which is
# exactly what held the migration back. Listed by file so deleting the signing
# call fails here rather than in a parent's screenshot three weeks later.
_EVIDENCE_READ_PATHS = (
    'backend/routes/quest/detail.py',                    # the student's own quest page
    'backend/routes/parent/evidence_view.py',            # parent opening a child's evidence
    'backend/routes/parent/quests_view.py',
    'backend/routes/parent/learning_moments.py',
    'backend/routes/advisor/learning_moments.py',
    'backend/routes/evidence_documents.py',              # the evidence editor itself
    'backend/routes/admin/student_task_management.py',
    'backend/routes/quest/completion.py',                # completed + in-progress
    'backend/routes/observer/learning_moments.py',
    'backend/routes/learning_events/attach.py',
    'backend/routes/lti/evidence.py',                    # the LMS grader's iframe
    'backend/routes/tasks/credit.py',                    # evidence_snapshot
    'backend/routes/teacher_verification.py',            # the verification queue
    'backend/services/learning_events_service.py',       # journal + public portfolio
    'backend/services/interest_tracks_service.py',
    'backend/services/evidence_report_service.py',       # public share-token report
    'backend/services/bounty_service.py',                # bounty claim evidence
    'backend/services/class_credit_pdf_service.py',      # signs so it can embed
    # Converted in the first wave; listed so they cannot regress.
    'backend/services/portfolio_service.py',
    'backend/routes/observer/feed.py',
    'backend/routes/observer/sharing.py',
    'backend/services/activity_feed_service.py',
    'backend/routes/sis/submissions.py',
    'backend/routes/tasks/completion.py',
)

_SIGNS_EVIDENCE = re.compile(
    r'\bsign_(?:in_place|stored_urls?|evidence_blocks(?:_on)?)\s*\('
)


class TestEvidenceReadPathsSign:
    """The guard the evidence migration was waiting on, mirroring
    TestAvatarReadPathsSign for the tenth bucket."""

    def test_every_evidence_read_path_signs_before_it_serializes(self):
        offenders = []
        for rel in _EVIDENCE_READ_PATHS:
            path = REPO_ROOT / rel
            assert path.exists(), f'{rel} moved or was deleted — update this test'
            if not _SIGNS_EVIDENCE.search(path.read_text(encoding='utf-8')):
                offenders.append(rel)
        assert not offenders, (
            'These return student evidence to a client but no longer sign it. '
            '`quest-evidence` is a private bucket: an unsigned pointer is blank '
            'evidence on a student\'s quest page, and re-opening the bucket to '
            'fix it would republish every minor\'s work:\n  ' + '\n  '.join(offenders)
        )

    def test_evidence_list_paths_use_the_batched_helpers(self):
        """These serve LISTS — a quest's tasks, a month of completions, a
        journal. One signing call per row inside one request is the failure mode
        the batched helpers exist to prevent."""
        list_paths = (
            'backend/routes/quest/detail.py',
            'backend/routes/parent/evidence_view.py',
            'backend/routes/parent/quests_view.py',
            'backend/routes/parent/learning_moments.py',
            'backend/routes/advisor/learning_moments.py',
            'backend/routes/admin/student_task_management.py',
        )
        offenders = [
            rel for rel in list_paths
            if 'sign_in_place' not in (REPO_ROOT / rel).read_text(encoding='utf-8')
            and 'sign_evidence_blocks' not in (REPO_ROOT / rel).read_text(encoding='utf-8')
        ]
        assert not offenders, (
            'These serve lists of evidence. Use sign_in_place() for the '
            'evidence_url column and PortfolioService.sign_evidence_blocks() '
            'for block media — both batch per bucket:\n  ' + '\n  '.join(offenders)
        )

    def test_there_is_one_evidence_block_signer_not_a_copy_per_route(self):
        """`sign_evidence_blocks` knows three places a URL hides in a block (the
        row's file_url column, content, content.items). A second copy would
        learn two of them and ship the third as a broken image."""
        signers = [
            rel for rel, path in _python_sources()
            if 'def sign_evidence_blocks' in path.read_text(encoding='utf-8', errors='ignore')
        ]
        assert signers == ['backend/services/portfolio_service.py'], signers


# ── thumbnails ───────────────────────────────────────────────────────────────

class TestThumbnails:
    """Messages drew 40px avatars from full-resolution originals.

    `user-photos` averages 1.3 MB an object, and a signed URL carries a fresh
    token every request against no Cache-Control header, so nothing was reusable
    between loads: one iCreate parent's contact list pulled ~108 MB to paint 95
    circles, every single time. sign_thumb_urls bakes the size into the token.
    """

    @pytest.fixture(autouse=True)
    def _clear(self):
        from utils.storage_urls import clear_thumb_cache
        clear_thumb_cache()
        yield
        clear_thumb_cache()

    def test_private_object_is_signed_at_thumbnail_size(self, thumb_client):
        from utils.storage_urls import sign_thumb_urls
        url = sign_thumb_urls([f'{PUBLIC_BASE}/user-photos/kid/photo.jpg'],
                              client=thumb_client)[f'{PUBLIC_BASE}/user-photos/kid/photo.jpg']
        assert '/render/image/sign/' in url
        assert 'w=96' in url and 'h=96' in url

    def test_transform_failure_falls_back_to_a_full_size_signed_url(self):
        """A heavy avatar beats a missing one — but never an unsigned one."""
        from utils.storage_urls import sign_thumb_urls
        client = MagicMock()
        store = MagicMock()

        def sign(path, ttl, options=None):
            if options:
                raise RuntimeError('image transformation unavailable')
            return {'signedURL': f'{SIGN_BASE}/user-photos/{path}?token=tok-{ttl}'}

        store.create_signed_url.side_effect = sign
        client.storage.from_.return_value = store

        original = f'{PUBLIC_BASE}/user-photos/kid/photo.jpg'
        url = sign_thumb_urls([original], client=client)[original]
        assert url.startswith(f'{SIGN_BASE}/user-photos/')
        assert 'token=' in url
        assert '/object/public/' not in url

    def test_second_call_does_not_resign(self, thumb_client):
        """The whole reason per-object signing is affordable."""
        from utils.storage_urls import sign_thumb_urls
        values = [f'{PUBLIC_BASE}/user-photos/kid/photo.jpg']
        first = sign_thumb_urls(values, client=thumb_client)
        calls_after_first = thumb_client.storage.from_('user-photos').create_signed_url.call_count
        second = sign_thumb_urls(values, client=thumb_client)
        assert second == first
        assert thumb_client.storage.from_('user-photos').create_signed_url.call_count == calls_after_first

    def test_public_bucket_and_external_urls_are_left_alone(self, thumb_client):
        from utils.storage_urls import sign_thumb_urls
        logo = f'{PUBLIC_BASE}/site-assets/logos/gradient_fav.svg'
        external = 'https://lh3.googleusercontent.com/a/AAA=s96-c'
        out = sign_thumb_urls([logo, external], client=thumb_client)
        assert out[logo] == logo
        assert out[external] == external

    def test_in_place_rewrites_only_the_named_fields(self, thumb_client):
        from utils.storage_urls import sign_thumbs_in_place
        records = [
            {'id': 'a', 'avatar_url': f'{PUBLIC_BASE}/user-photos/a.jpg', 'bio': 'unchanged'},
            {'id': 'b', 'avatar_url': None},
            {'id': 'c'},
        ]
        sign_thumbs_in_place(records, ['avatar_url'], client=thumb_client)
        assert '/render/image/sign/' in records[0]['avatar_url']
        assert records[0]['bio'] == 'unchanged'
        assert records[1]['avatar_url'] is None
        assert 'avatar_url' not in records[2]

    def test_a_missing_object_is_not_retried_at_full_size(self):
        """OPTIO-BACKEND-7G. Signing per object changed how a dangling
        avatar_url surfaces: the batch endpoint returned a usable-looking URL
        for a path that was not there, so the row was silent and merely 404'd
        in the browser. create_signed_url raises, and re-signing at full size
        raised again through signed_url's logger.error -- one Sentry event per
        request per stale row. Full size cannot succeed for an object that does
        not exist, so it must not be attempted."""
        from utils.storage_urls import sign_thumb_urls
        client = MagicMock()
        store = MagicMock()
        store.create_signed_url.side_effect = Exception(
            "{'statusCode': 404, 'error': not_found, 'message': Object not found}"
        )
        client.storage.from_.return_value = store

        original = f'{PUBLIC_BASE}/user-photos/gone/photo.jpg'
        assert sign_thumb_urls([original], client=client)[original] is None
        # One attempt, not two: the second would only re-raise.
        assert store.create_signed_url.call_count == 1

    def test_a_signed_thumbnail_url_still_resolves_to_its_object(self):
        """Re-signing something already signed must resolve, not pass through:
        a stored capability would otherwise be handed straight back out."""
        signed = (
            'https://auth.optioeducation.com/storage/v1/render/image/sign/'
            'user-photos/kid/photo.jpg?token=abc&w=96'
        )
        assert parse_object_ref(signed) == ('user-photos', 'kid/photo.jpg')
