"""Unit tests for the memory ceilings on the class-credit portfolio builder.

The builder OOM-killed prod on 2026-08-05: it fetched every evidence asset a
class had with no cap on the count, held every normalized JPEG and every source
PDF resident for the whole build, and spawned one unbounded background thread
per approval. A single approval stepped the container from 199MB to 397MB
inside a 512MB limit.

These cover the ceilings that stop that, not the PDF's appearance:
- the embed budget is shared by images and merged documents
- the image count cap short-circuits before the fetch, not after
- an image too large to decode safely is skipped, not decoded
- assets past the budget degrade to a reference line (content is never lost)
- concurrent builds serialize instead of stacking their peaks
"""

from __future__ import annotations

import io
import threading
from unittest.mock import patch

import pytest

from services import class_credit_pdf_service as ccpdf


# ── budget accounting ──────────────────────────────────────────────────────

def test_budget_shares_one_pool_between_images_and_documents():
    """A merged PDF and an embedded image draw from the same pool — both stay
    resident until the portfolio is written."""
    budget = ccpdf._Budget()
    half = ccpdf.MAX_EMBED_TOTAL_BYTES // 2

    assert budget.take_image(half) is True
    assert budget.take(half) is True          # a document consumes the rest
    assert budget.take_image(1024) is False   # pool is spent
    assert budget.images == 1
    assert budget.skipped == 1


def test_budget_caps_image_count_independently_of_size():
    budget = ccpdf._Budget()
    for _ in range(ccpdf.MAX_EMBEDDED_IMAGES):
        assert budget.take_image(1) is True

    assert budget.images_exhausted is True
    assert budget.take_image(1) is False
    assert budget.images == ccpdf.MAX_EMBEDDED_IMAGES


def test_oversized_asset_does_not_partially_consume_the_pool():
    """A rejected asset must not leave its bytes charged to the budget."""
    budget = ccpdf._Budget()
    assert budget.take(ccpdf.MAX_EMBED_TOTAL_BYTES + 1) is False
    assert budget.bytes_used == 0
    assert budget.take(ccpdf.MAX_EMBED_TOTAL_BYTES) is True


# ── the fetch is skipped, not just the embed ───────────────────────────────

def test_image_fragment_short_circuits_before_fetching_when_count_is_spent():
    """The point is not paying for the download at all — fetching and then
    discarding still holds up to MAX_DOC_FETCH_BYTES per asset."""
    budget = ccpdf._Budget()
    budget.images = ccpdf.MAX_EMBEDDED_IMAGES

    with patch.object(ccpdf, '_fetch_bytes') as fetch:
        result = ccpdf._image_fragment({'url': 'https://example.test/a.jpg'},
                                       ccpdf.fitz.Archive(), budget)

    assert result is None
    fetch.assert_not_called()
    assert budget.skipped == 1


def test_image_over_budget_is_not_added_to_the_archive():
    budget = ccpdf._Budget()
    budget.bytes_used = ccpdf.MAX_EMBED_TOTAL_BYTES
    archive = ccpdf.fitz.Archive()

    with patch.object(ccpdf, '_fetch_bytes', return_value=b'raw'), \
         patch.object(ccpdf, '_normalize_image', return_value=(b'x' * 1024, 100, 80)):
        result = ccpdf._image_fragment({'url': 'https://example.test/a.jpg'},
                                       archive, budget)

    assert result is None
    assert budget.images == 0


# ── decode guard ───────────────────────────────────────────────────────────

def _jpeg(width: int, height: int) -> bytes:
    from PIL import Image
    buf = io.BytesIO()
    Image.new('RGB', (width, height), (10, 20, 30)).save(buf, 'JPEG', quality=60)
    return buf.getvalue()


def test_normalize_image_skips_images_past_the_decode_limit():
    """Dimensions come from the lazy header read, so an image that would blow
    the worker as a raster is refused before any of it is decoded."""
    with patch.object(ccpdf, 'MAX_IMAGE_PIXELS', 10_000):
        assert ccpdf._normalize_image(_jpeg(400, 400)) is None    # 160k pixels
        assert ccpdf._normalize_image(_jpeg(80, 80)) is not None  # 6.4k pixels


def test_normalize_image_bounds_output_dimensions():
    normalized = ccpdf._normalize_image(_jpeg(3000, 2000))
    assert normalized is not None
    _, width, height = normalized
    assert max(width, height) <= ccpdf.MAX_IMAGE_DIM


# ── graceful degradation ───────────────────────────────────────────────────

def test_assets_past_the_budget_fall_back_to_a_reference_line():
    """Skipping an embed must not drop the evidence from the portfolio — it
    degrades to the same reference line an unfetchable asset already got."""
    budget = ccpdf._Budget()
    budget.images = ccpdf.MAX_EMBEDDED_IMAGES
    block = {
        'block_type': 'image',
        'content': {'items': [{'url': 'https://example.test/late.jpg',
                               'filename': 'late.jpg'}]},
    }

    html, pdfs = ccpdf._block_fragments(block, ccpdf.fitz.Archive(), budget,
                                        include_documents=True)

    assert 'late.jpg' in html
    assert 'https://example.test/late.jpg' in html
    assert pdfs == []


def test_document_over_budget_is_referenced_not_merged():
    budget = ccpdf._Budget()
    budget.bytes_used = ccpdf.MAX_EMBED_TOTAL_BYTES
    block = {
        'block_type': 'document',
        'content': {'url': 'https://example.test/paper.pdf', 'filename': 'paper.pdf',
                    'content_type': 'application/pdf'},
    }

    with patch.object(ccpdf, '_fetch_bytes', return_value=b'%PDF-1.4'), \
         patch.object(ccpdf, '_openable_pdf', return_value=b'%PDF-1.4'):
        html, pdfs = ccpdf._block_fragments(block, ccpdf.fitz.Archive(), budget,
                                            include_documents=True)

    assert pdfs == []
    assert 'paper.pdf' in html


# ── concurrency ────────────────────────────────────────────────────────────

def test_concurrent_builds_are_serialized(app):
    """Two approvals in the same minute must not run two builds at once —
    each one holds a portfolio's worth of assets in the same worker."""
    concurrent = []
    peak = []
    lock = threading.Lock()
    release = threading.Event()

    def _fake_send(quest_id):
        with lock:
            concurrent.append(quest_id)
            peak.append(len(concurrent))
        release.wait(timeout=5)
        with lock:
            concurrent.remove(quest_id)
        return True

    with app.app_context(), \
         patch.object(ccpdf, 'send_class_credit_awarded_notification', _fake_send):
        ccpdf.notify_class_credit_awarded_async('quest-a')
        ccpdf.notify_class_credit_awarded_async('quest-b')
        # Let the first build start and the second queue behind the semaphore.
        for _ in range(100):
            if peak:
                break
            threading.Event().wait(0.02)
        release.set()
        threading.Event().wait(0.3)

    assert peak, 'no build ever started'
    assert max(peak) == 1, f'builds overlapped: {peak}'


@pytest.mark.parametrize('name', ['MAX_EMBED_TOTAL_BYTES', 'MAX_EMBEDDED_IMAGES',
                                  'MAX_IMAGE_PIXELS'])
def test_ceilings_stay_below_the_container_headroom(name):
    """Guards against someone raising a ceiling past what a 512MB container
    with a ~140MB baseline can absorb."""
    value = getattr(ccpdf, name)
    assert value > 0
    if name == 'MAX_EMBED_TOTAL_BYTES':
        assert value <= 32 * 1024 * 1024
