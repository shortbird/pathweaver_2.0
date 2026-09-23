"""A feed card shows ALL of a post's evidence.

Three ways it did not, all reported as "not all the evidence shows in the feed":

1. A block can hold several files (`content.items`); the feed read items[0].
2. Task evidence was paged by block upload time, so a task whose files went
   up over several days got a card with only the blocks in that page's
   window, and the rest came back later as a second, partial card.
3. A learning moment with a photo lost the student's text blocks, because
   the text only travelled in `evidence_preview`, which held the photo URL.
"""

from unittest.mock import MagicMock, patch

import pytest

from routes.observer.feed import block_files, block_to_feed_media


CALLER_ID = 'test-user-123'
STUDENT_ID = 'a1b2c3d4-1111-4111-8111-111111111111'
DOC_ID = 'a1b2c3d4-3333-4333-8333-333333333333'
TASK_ID = 'a1b2c3d4-4444-4444-8444-444444444444'


class _Chain:
    """Every builder method returns the chain; execute() answers with `rows`,
    or with `ranged_rows` once .range() was called (fetch_all_rows pages with
    it, so that is the full-evidence read rather than the page-window read)."""

    def __init__(self, rows, ranged_rows=None):
        self._rows = rows
        self._ranged_rows = ranged_rows
        self._ranged = False

    def __getattr__(self, _name):
        return lambda *a, **k: self

    def range(self, *_a):
        self._ranged = True
        return self

    def execute(self):
        if self._ranged and self._ranged_rows is not None:
            return MagicMock(data=self._ranged_rows)
        return MagicMock(data=self._rows)

    def maybe_single(self):
        return _Chain(self._rows[0] if self._rows else None)


def _block(bid, btype, content, order, created):
    return {
        'id': bid, 'document_id': DOC_ID, 'block_type': btype, 'content': content,
        'order_index': order, 'created_at': created, 'is_private': False,
    }


def _feed(client, *, page_blocks=(), all_blocks=(), events=(), event_blocks=(), query=''):
    rows = {
        'users': [{
            'id': STUDENT_ID, 'role': 'parent', 'org_role': None, 'email': 'p@example.com',
            'display_name': 'Sam', 'first_name': 'Sam', 'last_name': 'H',
            'avatar_url': None, 'portfolio_slug': None, 'organization_id': None,
        }],
        'parent_student_links': [{'student_user_id': STUDENT_ID}],
        'user_task_evidence_documents': [{
            'id': DOC_ID, 'user_id': STUDENT_ID, 'task_id': TASK_ID,
            'quest_id': 'q-1', 'is_confidential': False, 'status': 'completed',
        }],
        'learning_events': list(events),
        'learning_event_evidence_blocks': list(event_blocks),
    }
    supabase = MagicMock()

    def table(name):
        if name == 'evidence_document_blocks':
            return _Chain(list(page_blocks), list(all_blocks))
        return _Chain(rows.get(name, []))

    supabase.table.side_effect = table
    with patch('routes.observer.feed.get_supabase_admin_client', return_value=supabase), \
         patch('utils.storage_urls.sign_in_place'):
        resp = client.get(f'/api/observers/feed{query}', headers={'Authorization': 'Bearer t'})
    assert resp.status_code == 200, resp.get_data(as_text=True)
    return resp.get_json()


TEXT = _block('b-text', 'text', {'text': 'My notes'}, 0, '2026-09-19T10:00:00Z')
PHOTOS = _block('b-img', 'image', {'items': [
    {'url': 'https://x.supabase.co/a.jpg'}, {'url': 'https://x.supabase.co/b.jpg'},
]}, 1, '2026-09-20T10:00:00Z')
PDF = _block('b-pdf', 'document', {'items': [
    {'url': 'https://x.supabase.co/c.pdf', 'filename': 'c.pdf'},
]}, 2, '2026-09-22T10:00:00Z')


@pytest.mark.unit
class TestBlockFiles:
    def test_every_item_of_a_block(self):
        assert [f['url'] for f in block_files(PHOTOS['content'])] == [
            'https://x.supabase.co/a.jpg', 'https://x.supabase.co/b.jpg',
        ]

    def test_legacy_url_and_file_url_fallbacks(self):
        assert block_files({'url': 'u'}) == [{'url': 'u', 'title': None}]
        assert block_files({}, 'f') == [{'url': 'f', 'title': None}]
        assert block_files({}) == []

    def test_document_title_comes_from_the_item(self):
        assert block_to_feed_media(PDF) == [
            {'type': 'document', 'url': 'https://x.supabase.co/c.pdf', 'title': 'c.pdf'},
        ]

    def test_text_is_not_media(self):
        assert block_to_feed_media(TEXT) == []


@pytest.mark.unit
class TestTaskCardHoldsAllItsBlocks:
    def test_card_is_filled_beyond_the_page_window(self, client, mock_verify_token):
        # The page read only reached the newest block; the task has three.
        body = _feed(client, page_blocks=[PDF], all_blocks=[PDF, TEXT, PHOTOS])
        (item,) = body['items']
        assert [(b['type'], b.get('url') or b.get('content')) for b in item['evidence']['blocks']] == [
            ('text', 'My notes'),
            ('image', 'https://x.supabase.co/a.jpg'),
            ('image', 'https://x.supabase.co/b.jpg'),
            ('document', 'https://x.supabase.co/c.pdf'),
        ]
        assert item['timestamp'] == PDF['created_at']

    def test_no_second_card_on_a_later_page(self, client, mock_verify_token):
        # Page two reads the older blocks, but the card already showed on page
        # one, where its newest block sat.
        body = _feed(
            client, page_blocks=[PHOTOS, TEXT], all_blocks=[PDF, TEXT, PHOTOS],
            query='?cursor=2026-09-22T10:00:00Z',
        )
        assert body['items'] == []


@pytest.mark.unit
class TestMomentKeepsItsText:
    def test_text_travels_beside_the_photos(self, client, mock_verify_token):
        event = {
            'id': 'le-1', 'user_id': STUDENT_ID, 'title': 'Bridge', 'description': '',
            'pillars': [], 'created_at': '2026-09-14T10:00:00Z', 'source_type': 'realtime',
            'captured_by_user_id': None, 'attached_task_id': None,
        }
        blocks = [
            {**TEXT, 'learning_event_id': 'le-1', 'file_url': None, 'file_name': None},
            {**PHOTOS, 'learning_event_id': 'le-1', 'file_url': None, 'file_name': None},
        ]
        body = _feed(client, events=[event], event_blocks=blocks)
        (item,) = body['items']
        assert item['evidence']['preview_text'] == 'My notes'
        assert [m['url'] for m in item['media']] == [
            'https://x.supabase.co/a.jpg', 'https://x.supabase.co/b.jpg',
        ]


@pytest.mark.unit
def test_page_stops_where_a_full_source_stops(client, mock_verify_token):
    """21 newer moments fill the moments read. The task card is older than all
    of them, so it waits for the next page instead of being judged now."""
    events = [{
        'id': f'le-{i}', 'user_id': STUDENT_ID, 'title': f'M{i}', 'description': f'd{i}',
        'pillars': [], 'created_at': f'2026-09-23T10:{i:02d}:00Z', 'source_type': 'realtime',
        'captured_by_user_id': None, 'attached_task_id': None,
    } for i in range(21)]
    body = _feed(client, page_blocks=[PDF], all_blocks=[PDF], events=events)
    assert all(i['type'] == 'learning_moment' for i in body['items'])
    assert body['has_more'] is True
    assert body['next_cursor'] is not None
