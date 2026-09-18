"""
Time blocks as rows (M8b, 2026-09-18).

The school day's blocks were a JSON list in feature_flags.sis_settings with
no ids; every reader matched a meeting to a block by its times and named it
by position, so inserting or retiming a block renumbered every roster. Now
they are sis_time_blocks rows, a meeting that fills exactly one block says
so (class_meetings.block_id), and the reports name that block whatever its
times are today. The Settings card still PATCHes sis_settings.time_blocks;
the route writes the rows and nulls the blob's legacy key in the same call.
"""
from unittest.mock import Mock, patch

import pytest

from services import sis_catalog_service
from services.sis_reports_service import _meeting_slot


def _repo(existing=None):
    repo = Mock()
    repo.list_for_org.return_value = existing or []
    repo.save_blocks.side_effect = lambda org_id, blocks: [
        {'id': b.get('id') or f'new-{i}', 'label': b['label'], 'start': b['start'], 'end': b['end'], 'sort': i}
        for i, b in enumerate(blocks)]
    return repo


@pytest.mark.unit
class TestSaveTimeBlocks:

    def test_cleans_sorts_and_keeps_ids(self):
        repo = _repo()
        with patch.object(sis_catalog_service, '_blocks_repo', return_value=repo):
            out = sis_catalog_service.save_time_blocks('org-1', [
                {'id': 'b2', 'start': '10:30:00', 'end': '11:30', 'label': ' '},
                {'start': '09:30', 'end': '10:30', 'label': 'First'},
                {'start': '', 'end': '', 'label': ''},          # the card's blank row
            ])
        sent = repo.save_blocks.call_args[0][1]
        assert [b['start'] for b in sent] == ['09:30', '10:30']
        assert sent[0] == {'id': None, 'start': '09:30', 'end': '10:30', 'label': 'First'}
        assert sent[1] == {'id': 'b2', 'start': '10:30', 'end': '11:30', 'label': ''}
        assert [b['id'] for b in out['blocks']] == ['new-0', 'b2']

    def test_refuses_a_block_that_ends_before_it_starts(self):
        with patch.object(sis_catalog_service, '_blocks_repo', return_value=_repo()) as repo:
            out = sis_catalog_service.save_time_blocks('org-1', [{'start': '10:30', 'end': '09:30'}])
        assert "can't end before it starts" in out['error']
        repo.return_value.save_blocks.assert_not_called()

    def test_refuses_times_that_are_not_hh_mm(self):
        with patch.object(sis_catalog_service, '_blocks_repo', return_value=_repo()):
            assert 'HH:MM' in sis_catalog_service.save_time_blocks('org-1', [{'start': '9am', 'end': '10am'}])['error']
            assert 'list' in sis_catalog_service.save_time_blocks('org-1', {'start': '09:00'})['error']

    def test_null_clears_every_block(self):
        repo = _repo()
        with patch.object(sis_catalog_service, '_blocks_repo', return_value=repo):
            assert sis_catalog_service.save_time_blocks('org-1', None) == {'blocks': []}
        assert repo.save_blocks.call_args[0][1] == []

    def test_take_time_blocks_lifts_the_key_and_leaves_a_null(self):
        patch_body = {'sis_settings': {'rooms': [], 'time_blocks': [{'start': '09:30', 'end': '10:30'}]}}
        assert sis_catalog_service.take_time_blocks(patch_body) == [{'start': '09:30', 'end': '10:30'}]
        assert patch_body['sis_settings']['time_blocks'] is None
        assert sis_catalog_service.take_time_blocks({'sis_settings': {'rooms': []}}) == ()
        assert sis_catalog_service.take_time_blocks({'hide_pillars': True}) == ()


@pytest.mark.unit
class TestMeetingStamp:
    """A meeting whose times are exactly one block's records that block."""

    def _client(self, block_rows):
        client = Mock()
        blocks = Mock()
        for chained in ('select', 'eq', 'limit'):
            getattr(blocks, chained).return_value = blocks
        blocks.execute.return_value = Mock(data=block_rows)
        meetings = Mock()
        for chained in ('select', 'eq', 'is_', 'limit', 'insert'):
            getattr(meetings, chained).return_value = meetings
        meetings.execute.side_effect = [Mock(data=[]), Mock(data=[{'id': 'm1'}])]
        client.table.side_effect = lambda name: blocks if name == 'sis_time_blocks' else meetings
        return client, meetings

    def test_add_meeting_stamps_the_block_it_fills(self):
        from repositories.sis_class_repository import SisClassRepository
        client, meetings = self._client([{'id': 'blk-2'}])
        SisClassRepository(client=client).add_meeting('c1', 'org-1', {
            'day_of_week': 2, 'start_time': '10:30', 'end_time': '11:30'})
        assert meetings.insert.call_args[0][0]['block_id'] == 'blk-2'

    def test_a_custom_time_has_no_block(self):
        from repositories.sis_class_repository import SisClassRepository
        client, meetings = self._client([])
        SisClassRepository(client=client).add_meeting('c1', 'org-1', {
            'day_of_week': 2, 'start_time': '10:45', 'end_time': '11:15'})
        assert meetings.insert.call_args[0][0]['block_id'] is None


@pytest.mark.unit
class TestReportsNameTheBlockTheMeetingFills:
    BLOCKS = [
        {'id': 'b1', 'start': '09:30', 'end': '10:30', 'label': ''},
        {'id': 'b2', 'start': '10:30', 'end': '11:30', 'label': 'Studio'},
    ]

    def test_block_id_wins_over_the_times(self):
        # The school retimed Studio after this meeting was scheduled; it is
        # still Studio, not "Block 1".
        m = {'start_time': '09:30', 'end_time': '10:30', 'block_id': 'b2'}
        assert _meeting_slot(m, self.BLOCKS) == 'Studio'

    def test_without_a_block_id_the_times_decide(self):
        m = {'start_time': '09:30', 'end_time': '11:30', 'block_id': None}
        assert _meeting_slot(m, self.BLOCKS) == 'Block 1 + Studio'

    def test_an_unknown_block_id_falls_back_to_the_times(self):
        m = {'start_time': '09:30', 'end_time': '10:30', 'block_id': 'gone'}
        assert _meeting_slot(m, self.BLOCKS) == 'Block 1'
