"""Reading a student's evidence: what gets through, and what must not.

Two failures shape these tests.

**A block's declared type is a lie about half the time.** A photo pasted into the
Link picker is a `link` block holding a .jpg (web/src/utils/evidenceItems.js,
2026-09-02). If the loader trusts `block_type`, the model is handed a URL where a
picture belongs -- the same bug a teacher hit on screen, except here it silently
becomes a verdict.

**A storage URL must never leave the platform.** `quest-evidence` is private, so
the URL in the row is a durable pointer to a minor's schoolwork. Putting one in a
prompt hands a third party that pointer forever, and signing it first is worse.
"""

from __future__ import annotations

import io
from unittest.mock import MagicMock, patch

import pytest

from services.credit_ai_review import evidence_loader as loader
from services.credit_ai_review.fetchers import Fetched, classify_url, export_url

STORAGE = 'https://auth.optioeducation.com/storage/v1/object/public/quest-evidence'

PNG = (b'\x89PNG\r\n\x1a\n' + b'\x00' * 64)


def _png_bytes():
    from PIL import Image
    out = io.BytesIO()
    Image.new('RGB', (12, 12), 'blue').save(out, format='PNG')
    return out.getvalue()


def _block(block_type, content, block_id='b1', role='student'):
    return {'id': block_id, 'block_type': block_type, 'content': content,
            'uploaded_by_role': role}


def _storage_client(blob=b'', error=None):
    """An admin client whose storage download returns these bytes."""
    client = MagicMock()
    store = MagicMock()
    if error:
        store.download.side_effect = error
    else:
        store.download.return_value = blob
    client.storage.from_.return_value = store
    return client


def _load(blocks, **kwargs):
    kwargs.setdefault('file_api_enabled', False)
    return loader.load_evidence(blocks, **kwargs)


@pytest.mark.unit
class TestTypedText:
    def test_a_bare_string_block_is_read(self):
        result = _load([_block('text', 'I built a bridge out of spaghetti.')])
        assert result.parts[0].kind == 'text'
        assert 'spaghetti' in result.parts[0].text

    def test_a_text_object_block_is_read(self):
        result = _load([_block('text', {'text': 'Tested with 2kg.'})])
        assert result.parts[0].text == 'Tested with 2kg.'

    def test_an_empty_block_is_skipped_with_a_reason(self):
        result = _load([_block('text', {'text': '   '})])
        assert result.parts == [] or result.parts[0].skip_reason

    def test_long_text_is_truncated_and_says_so(self):
        budget = loader.Budget(text_block_chars=50)
        result = _load([_block('text', 'x' * 500)], budget=budget)
        assert 'truncated' in result.parts[0].text


@pytest.mark.unit
class TestTheDeclaredTypeIsOnlyAHint:
    """block_type records which picker the student opened, nothing more."""

    def test_a_jpg_in_a_link_block_is_read_as_an_image(self):
        client = _storage_client(_png_bytes())
        result = _load(
            [_block('link', {'items': [{'url': f'{STORAGE}/u/photo.jpg',
                                        'filename': 'photo.jpg'}]})],
            admin=client)
        part = result.parts[0]
        assert part.kind == 'inline'
        assert part.mime_type.startswith('image/')

    def test_the_sniffed_type_beats_a_wrong_declared_type(self):
        """A PNG uploaded as application/pdf is still a PNG."""
        client = _storage_client(_png_bytes())
        result = _load(
            [_block('document', {'items': [{'url': f'{STORAGE}/u/report.pdf',
                                            'filename': 'report.pdf',
                                            'content_type': 'application/pdf'}]})],
            admin=client)
        assert result.parts[0].mime_type.startswith('image/')

    def test_sniffing_falls_back_to_the_extension_when_magic_is_unhelpful(self):
        with patch.object(loader, 'sniff_mime', wraps=loader.sniff_mime):
            assert loader.sniff_mime(b'\x00\x01', filename='notes.txt') == 'text/plain'
            assert loader.sniff_mime(b'\x00\x01', filename='a.docx').endswith(
                'wordprocessingml.document')

    def test_sniffing_falls_back_to_the_declared_type_last(self):
        assert loader.sniff_mime(b'\x00\x01', declared='video/mp4') == 'video/mp4'


@pytest.mark.unit
class TestUploads:
    def test_an_unreadable_file_is_skipped_and_named(self):
        client = _storage_client(error=RuntimeError('Bucket not found'))
        result = _load(
            [_block('image', {'items': [{'url': f'{STORAGE}/u/a.jpg', 'filename': 'a.jpg'}]})],
            admin=client)
        assert result.parts[0].skip_reason
        assert any('a.jpg' in f for f in result.flags)

    def test_an_oversized_file_is_refused_before_it_is_downloaded(self):
        client = _storage_client(b'never read')
        budget = loader.Budget(max_download_bytes=10)
        result = _load(
            [_block('document', {'items': [{'url': f'{STORAGE}/u/big.pdf',
                                            'filename': 'big.pdf',
                                            'file_size': 999_999}]})],
            admin=client, budget=budget)
        assert 'too large' in result.parts[0].skip_reason
        assert client.storage.from_.return_value.download.called is False

    def test_an_empty_file_is_skipped(self):
        result = _load(
            [_block('image', {'items': [{'url': f'{STORAGE}/u/a.jpg', 'filename': 'a.jpg'}]})],
            admin=_storage_client(b''))
        assert result.parts[0].skip_reason

    def test_a_text_file_is_read_as_text(self):
        result = _load(
            [_block('document', {'items': [{'url': f'{STORAGE}/u/notes.txt',
                                            'filename': 'notes.txt'}]})],
            admin=_storage_client(b'What I learned building the bridge.'))
        assert result.parts[0].kind == 'text'
        assert 'bridge' in result.parts[0].text

    def test_a_csv_is_capped_by_rows(self):
        csv = ('a,b\n' * 900).encode()
        budget = loader.Budget(csv_rows=10)
        result = _load(
            [_block('document', {'items': [{'url': f'{STORAGE}/u/data.csv',
                                            'filename': 'data.csv'}]})],
            admin=_storage_client(csv), budget=budget)
        assert result.parts[0].text.count('\n') < 15
        assert 'first 10 rows' in (result.parts[0].note or '')


@pytest.mark.unit
class TestPdfs:
    def _pdf(self, pages=1, **encryption):
        import fitz
        doc = fitz.open()
        for n in range(pages):
            doc.new_page().insert_text((72, 72), f'Page {n}: bridge notes')
        return doc.tobytes(**encryption)

    def test_a_small_pdf_is_sent_whole(self):
        result = _load(
            [_block('document', {'items': [{'url': f'{STORAGE}/u/a.pdf', 'filename': 'a.pdf'}]})],
            admin=_storage_client(self._pdf()))
        assert result.parts[0].kind == 'inline'
        assert result.parts[0].mime_type == 'application/pdf'

    def test_a_permissions_locked_pdf_opens_with_no_password(self):
        """The common case: every viewer opens it, so the student has no idea."""
        import fitz
        blob = self._pdf(encryption=fitz.PDF_ENCRYPT_AES_256, owner_pw='o', user_pw='')
        result = _load(
            [_block('document', {'items': [{'url': f'{STORAGE}/u/a.pdf', 'filename': 'a.pdf'}]})],
            admin=_storage_client(blob))
        assert result.parts[0].kind == 'inline'

    def test_a_sealed_pdf_is_skipped_and_named(self):
        import fitz
        blob = self._pdf(encryption=fitz.PDF_ENCRYPT_AES_256, owner_pw='o', user_pw='secret')
        result = _load(
            [_block('document', {'items': [{'url': f'{STORAGE}/u/a.pdf', 'filename': 'a.pdf'}]})],
            admin=_storage_client(blob))
        assert 'password-protected' in result.parts[0].skip_reason

    def test_a_large_pdf_falls_back_to_its_text_and_says_so(self):
        blob = self._pdf(pages=3)
        budget = loader.Budget(max_pdf_inline_bytes=10)
        result = _load(
            [_block('document', {'items': [{'url': f'{STORAGE}/u/a.pdf', 'filename': 'a.pdf'}]})],
            admin=_storage_client(blob), budget=budget)
        part = result.parts[0]
        assert part.kind == 'text'
        assert 'no images' in (part.note or '')


@pytest.mark.unit
class TestGoogleLinks:
    def test_a_doc_export_url_is_rebuilt_from_the_id(self):
        """Never fetch the pasted string: it can carry anything after the id."""
        source, extracted = classify_url(
            'https://docs.google.com/document/d/ABC123_x/edit?usp=sharing&foo=bar')
        assert source == 'google_doc'
        assert export_url(source, extracted) == (
            'https://docs.google.com/document/d/ABC123_x/export?format=txt')

    def test_a_sheet_keeps_its_tab(self):
        source, extracted = classify_url(
            'https://docs.google.com/spreadsheets/d/S1/edit#gid=42')
        assert export_url(source, extracted).endswith('format=csv&gid=42')

    def test_slides_export_as_pdf(self):
        source, extracted = classify_url('https://docs.google.com/presentation/d/P1/edit')
        assert export_url(source, extracted).endswith('/export/pdf')

    def test_a_doc_is_read_as_text(self):
        with patch.object(loader.fetchers, 'fetch_google_export', return_value=Fetched(
                ok=True, content_type='text/plain', body=b'My reflection on the build.')):
            result = _load([_block('link', {'items': [
                {'url': 'https://docs.google.com/document/d/D1/edit', 'title': 'Reflection'}]})])
        assert result.parts[0].kind == 'text'
        assert 'reflection' in result.parts[0].text.lower()

    def test_an_unshared_doc_says_so_rather_than_failing_vaguely(self):
        """The fix is one setting the student can change, so name it."""
        with patch.object(loader.fetchers, 'fetch_google_export', return_value=Fetched(
                ok=False, reason="the Google file is not shared (set it to "
                                 "'Anyone with the link can view')")):
            result = _load([_block('link', {'items': [
                {'url': 'https://docs.google.com/document/d/D1/edit'}]})])
        assert 'not shared' in result.parts[0].skip_reason


@pytest.mark.unit
class TestWebLinks:
    def test_a_page_is_reduced_to_its_words(self):
        html = (b'<html><head><title>My Build</title><script>evil()</script></head>'
                b'<body><nav>menu</nav><p>I used balsa wood.</p></body></html>')
        with patch.object(loader.fetchers, 'fetch_bytes', return_value=Fetched(
                ok=True, content_type='text/html', body=html)):
            result = _load([_block('link', {'items': [{'url': 'https://example.org/build'}]})])
        text = result.parts[0].text
        assert 'balsa' in text
        assert 'evil()' not in text
        assert 'menu' not in text

    def test_a_blocked_url_is_skipped_and_never_raises(self):
        """The URL came from a text box a student typed in."""
        from utils.ssrf import SSRFError
        with patch('utils.ssrf.safe_get', side_effect=SSRFError('resolves to 169.254.169.254')):
            result = _load([_block('link', {'items': [{'url': 'http://169.254.169.254/'}]})])
        assert result.parts[0].skip_reason
        assert result.parts[0].kind == 'skipped'

    def test_a_link_straight_to_an_image_is_read_as_one(self):
        with patch.object(loader.fetchers, 'fetch_bytes', return_value=Fetched(
                ok=True, content_type='image/png', body=_png_bytes())):
            result = _load([_block('link', {'items': [{'url': 'https://example.org/a.png'}]})])
        assert result.parts[0].kind == 'inline'


@pytest.mark.unit
class TestVideoLinks:
    def test_a_youtube_url_is_rebuilt_canonically(self):
        source, extracted = classify_url('https://youtu.be/dQw4w9WgXcQ?t=42')
        assert source == 'youtube'
        assert extracted['video_id'] == 'dQw4w9WgXcQ'

    def test_only_one_youtube_video_is_watched_per_review(self):
        """Each one costs real money, and a reviewer is watching them anyway."""
        with patch.object(loader.fetchers, 'youtube_part', return_value=object()), \
             patch.object(loader.fetchers, 'fetch_oembed', return_value='Second video'):
            result = _load([
                _block('video', {'items': [{'url': 'https://youtu.be/aaaaaaaaaaa'}]}, 'b1'),
                _block('video', {'items': [{'url': 'https://youtu.be/bbbbbbbbbbb'}]}, 'b2'),
            ])
        kinds = [p.kind for p in result.parts]
        assert kinds == ['file_uri', 'text']

    def test_a_video_that_cannot_be_watched_falls_back_to_its_title(self):
        with patch.object(loader.fetchers, 'youtube_part', return_value=None), \
             patch.object(loader.fetchers, 'fetch_oembed', return_value='Bridge Load Test'):
            result = _load([_block('video', {'items': [{'url': 'https://youtu.be/ccccccccccc'}]})])
        assert result.parts[0].kind == 'text'
        assert 'not watched' in (result.parts[0].note or '')


@pytest.mark.unit
class TestUploadedMedia:
    def _mp4(self, size):
        return b'\x00\x00\x00\x18ftypmp42' + b'\x00' * size

    def test_a_small_video_is_sent_inline(self):
        result = _load(
            [_block('video', {'items': [{'url': f'{STORAGE}/u/clip.mp4',
                                         'filename': 'clip.mp4'}]})],
            admin=_storage_client(self._mp4(1000)))
        assert result.parts[0].kind == 'inline'

    def test_a_large_video_is_skipped_when_uploading_is_off(self):
        budget = loader.Budget(max_media_inline_bytes=10)
        result = _load(
            [_block('video', {'items': [{'url': f'{STORAGE}/u/clip.mp4',
                                         'filename': 'clip.mp4'}]})],
            admin=_storage_client(self._mp4(5000)), budget=budget,
            file_api_enabled=False)
        assert 'too large' in result.parts[0].skip_reason

    def test_a_large_video_is_uploaded_when_it_is_on(self):
        budget = loader.Budget(max_media_inline_bytes=10)
        handle = MagicMock(name='file-handle')
        with patch.object(loader.fetchers, 'upload_to_file_api',
                          return_value=(handle, None)) as upload:
            result = _load(
                [_block('video', {'items': [{'url': f'{STORAGE}/u/clip.mp4',
                                             'filename': 'clip.mp4'}]})],
                admin=_storage_client(self._mp4(5000)), budget=budget,
                file_api_enabled=True)
        assert upload.called
        assert result.parts[0].kind == 'file_api'
        assert result.file_handles == [handle]

    def test_a_failed_upload_is_skipped_and_named(self):
        budget = loader.Budget(max_media_inline_bytes=10)
        with patch.object(loader.fetchers, 'upload_to_file_api',
                          return_value=(None, 'the file took too long to process')):
            result = _load(
                [_block('video', {'items': [{'url': f'{STORAGE}/u/clip.mp4',
                                             'filename': 'clip.mp4'}]})],
                admin=_storage_client(self._mp4(5000)), budget=budget,
                file_api_enabled=True)
        assert 'too long' in result.parts[0].skip_reason

    def test_uploads_are_deleted_when_the_review_is_done(self):
        """A child's video must not sit on a third party's file store for two days."""
        handle = MagicMock(name='file-handle')
        result = loader.LoadResult(file_handles=[handle])
        with patch.object(loader.fetchers, 'delete_file') as delete:
            loader.release(result)
        delete.assert_called_once_with(handle)
        assert result.file_handles == []


@pytest.mark.unit
class TestBudgets:
    def test_blocks_keep_their_numbers_when_earlier_ones_are_skipped(self):
        """The model cites [E3] and the reviewer clicks it. It must be block 3."""
        client = _storage_client(error=RuntimeError('gone'))
        result = _load([
            _block('image', {'items': [{'url': f'{STORAGE}/u/a.jpg', 'filename': 'a.jpg'}]}, 'b1'),
            _block('text', 'Second block.', 'b2'),
            _block('text', 'Third block.', 'b3'),
        ], admin=client)
        assert [p.block_index for p in result.parts] == [1, 2, 3]
        assert result.parts[1].text == 'Second block.'

    def test_the_item_cap_stops_reading_but_keeps_numbering(self):
        budget = loader.Budget(max_items=2)
        result = _load([_block('text', f'Note {i}.', f'b{i}') for i in range(1, 6)],
                       budget=budget)
        assert len(result.read_parts) == 2
        assert result.parts[-1].source == 'budget'

    def test_the_inline_budget_stops_further_attachments(self):
        # Smaller than one image, so the second has nowhere to go. The cap is
        # load-bearing: Gemini's inline limit is not a soft degrade, it fails
        # the whole call.
        budget = loader.Budget(max_inline_bytes=90)
        client = _storage_client(_png_bytes())
        result = _load([
            _block('image', {'items': [{'url': f'{STORAGE}/u/a.jpg', 'filename': 'a.jpg'}]}, 'b1'),
            _block('image', {'items': [{'url': f'{STORAGE}/u/b.jpg', 'filename': 'b.jpg'}]}, 'b2'),
        ], admin=client, budget=budget)
        assert result.inline_bytes <= 200
        assert any(p.skip_reason for p in result.parts)

    def test_stats_report_what_was_read_and_what_was_not(self):
        client = _storage_client(error=RuntimeError('gone'))
        result = _load([
            _block('image', {'items': [{'url': f'{STORAGE}/u/a.jpg', 'filename': 'a.jpg'}]}, 'b1'),
            _block('text', 'Readable.', 'b2'),
        ], admin=client)
        stats = result.stats()
        assert stats['read'] == 1
        assert stats['skipped'] == 1


@pytest.mark.unit
class TestNoStorageUrlEverLeaks:
    """The rule the whole module is built around."""

    def test_a_label_is_the_filename_not_the_link(self):
        item = {'url': f'{STORAGE}/u/1234_20260101_120000_bridge.jpg',
                'filename': 'bridge.jpg'}
        assert loader._label_for(item) == 'bridge.jpg'

    def test_an_unnamed_upload_is_labelled_by_its_object_not_its_url(self):
        item = {'url': f'{STORAGE}/user-a/photo-9.jpg'}
        label = loader._label_for(item)
        assert 'storage' not in label
        assert label == 'photo-9.jpg'

    def test_an_external_link_survives_as_itself(self):
        item = {'url': 'https://youtu.be/abc'}
        assert loader._label_for(item) == 'https://youtu.be/abc'

    def test_no_manifest_entry_carries_a_storage_url(self):
        client = _storage_client(_png_bytes())
        result = _load([
            _block('image', {'items': [{'url': f'{STORAGE}/u/a.jpg', 'filename': 'a.jpg'}]}, 'b1'),
            _block('link', {'items': [{'url': f'{STORAGE}/u/b.pdf'}]}, 'b2'),
        ], admin=client)
        assert '/storage/v1/' not in repr(result.manifest())
        assert '/storage/v1/' not in repr(result.flags)


@pytest.mark.unit
class TestFingerprinting:
    def test_the_same_evidence_fingerprints_the_same(self):
        blocks = [_block('text', 'Same words.')]
        assert (loader.fingerprint_snapshot(blocks)
                == loader.fingerprint_snapshot([_block('text', 'Same words.', 'other-id')]))

    def test_different_evidence_fingerprints_differently(self):
        assert (loader.fingerprint_snapshot([_block('text', 'One.')])
                != loader.fingerprint_snapshot([_block('text', 'Two.')]))

    def test_an_upload_is_identified_by_its_object_path_not_its_row(self):
        """A resubmission rewrites block rows, so ids change when nothing did."""
        a = {'url': f'{STORAGE}/u/a.jpg', 'filename': 'a.jpg'}
        b = {'url': f'{STORAGE}/u/a.jpg', 'filename': 'renamed.jpg'}
        assert loader.item_fingerprint(a) == loader.item_fingerprint(b)
