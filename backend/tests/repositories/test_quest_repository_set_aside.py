"""QuestRepository.set_aside_enrollment: the set-down write, by enrollment id."""

from unittest.mock import Mock

import pytest

from repositories.base_repository import NotFoundError
from repositories.quest_repository import QuestRepository


def _repo(data):
    repo = QuestRepository()
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('update', 'eq'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=data)
    repo._client = client
    return repo, table


@pytest.mark.unit
def test_it_sets_the_enrollment_down_without_finishing_it():
    repo, table = _repo([{'id': 'uq-1'}])
    assert repo.set_aside_enrollment('uq-1') is True
    written = table.update.call_args[0][0]
    assert written['status'] == 'set_down' and written['is_active'] is False
    assert written['last_set_down_at'] and 'completed_at' not in written
    table.eq.assert_called_once_with('id', 'uq-1')


@pytest.mark.unit
def test_a_missing_enrollment_is_not_found():
    repo, _ = _repo([])
    with pytest.raises(NotFoundError):
        repo.set_aside_enrollment('uq-missing')
