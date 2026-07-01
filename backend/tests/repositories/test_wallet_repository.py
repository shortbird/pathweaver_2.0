"""
Unit tests for WalletRepository — the spendable-XP ("coin") ledger carved out of
the former Yeti pet system (used by Treehouse coins, bounty rewards, xp_service).
Restores the coverage the deleted Yeti tests provided for this logic.
"""

import pytest
import uuid
from unittest.mock import Mock

from repositories.base_repository import NotFoundError, ValidationError


def _make_repo():
    from repositories.wallet_repository import WalletRepository
    repo = WalletRepository()
    mock = Mock()
    repo._client = mock
    return repo, mock


def _select_returns(mock, rows):
    """Stub get_wallet's .select().eq().execute() chain."""
    mock.table.return_value.select.return_value.eq.return_value.execute.return_value = Mock(data=rows)


def _update_returns(mock, rows):
    """Stub the write .update().eq().execute() chain."""
    mock.table.return_value.update.return_value.eq.return_value.execute.return_value = Mock(data=rows)


@pytest.mark.unit
class TestWalletRepository:

    def test_table_name(self):
        repo, _ = _make_repo()
        assert repo.table_name == 'student_wallets'

    def test_get_balance_zero_when_no_wallet(self):
        repo, mock = _make_repo()
        _select_returns(mock, [])
        assert repo.get_balance(str(uuid.uuid4())) == 0

    def test_get_balance_returns_spendable_xp(self):
        repo, mock = _make_repo()
        _select_returns(mock, [{'id': 'w1', 'spendable_xp': 250, 'total_xp_spent': 0}])
        assert repo.get_balance('u1') == 250

    def test_add_is_noop_without_wallet(self):
        # Faithful to the Yeti behavior: no wallet -> no-op, so ordinary XP awards
        # don't create wallets for every student (only opt-in programs get one).
        repo, mock = _make_repo()
        _select_returns(mock, [])
        assert repo.add(str(uuid.uuid4()), 50) is None

    def test_add_increments_existing_wallet(self):
        repo, mock = _make_repo()
        _select_returns(mock, [{'id': 'w1', 'spendable_xp': 100, 'total_xp_spent': 0}])
        _update_returns(mock, [{'id': 'w1', 'spendable_xp': 150}])
        result = repo.add('u1', 50)
        assert result['spendable_xp'] == 150
        payload = mock.table.return_value.update.call_args[0][0]
        assert payload['spendable_xp'] == 150  # 100 + 50

    def test_ensure_wallet_returns_existing(self):
        repo, mock = _make_repo()
        existing = {'id': 'w1', 'spendable_xp': 10, 'total_xp_spent': 0}
        _select_returns(mock, [existing])
        assert repo.ensure_wallet('u1') == existing
        mock.table.return_value.insert.assert_not_called()

    def test_ensure_wallet_creates_when_missing(self):
        repo, mock = _make_repo()
        _select_returns(mock, [])
        mock.table.return_value.insert.return_value.execute.return_value = Mock(data=[{'id': 'w2', 'user_id': 'u1'}])
        assert repo.ensure_wallet('u1')['id'] == 'w2'

    def test_spend_raises_without_wallet(self):
        repo, mock = _make_repo()
        _select_returns(mock, [])
        with pytest.raises(NotFoundError):
            repo.spend('u1', 10)

    def test_spend_raises_when_insufficient(self):
        repo, mock = _make_repo()
        _select_returns(mock, [{'id': 'w1', 'spendable_xp': 5, 'total_xp_spent': 0}])
        with pytest.raises(ValidationError):
            repo.spend('u1', 10)

    def test_spend_deducts_and_tracks_total(self):
        repo, mock = _make_repo()
        _select_returns(mock, [{'id': 'w1', 'spendable_xp': 100, 'total_xp_spent': 20}])
        _update_returns(mock, [{'id': 'w1', 'spendable_xp': 75, 'total_xp_spent': 45}])
        result = repo.spend('u1', 25)
        assert result['spendable_xp'] == 75
        payload = mock.table.return_value.update.call_args[0][0]
        assert payload['spendable_xp'] == 75   # 100 - 25
        assert payload['total_xp_spent'] == 45  # 20 + 25
