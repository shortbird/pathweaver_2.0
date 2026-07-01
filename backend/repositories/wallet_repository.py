"""
Wallet Repository - Spendable-XP ("coin") ledger.

Carved out of the former Yeti pet system. The spendable-XP balance is a
program-agnostic reward currency: it is credited alongside Total XP by the core
XP service, awarded on bounty completion, and surfaced as Treehouse's coin /
"School Jobs" economy.

Behavior preserved from the Yeti implementation:
- A wallet exists only for students in programs that opt in (e.g. Treehouse
  creates one when a facilitator first touches a student's balance).
- add() is a no-op when no wallet exists, so ordinary XP awards do not create
  wallets for every student platform-wide.
"""

from typing import Optional, Dict, Any
from datetime import datetime, timezone

from postgrest.exceptions import APIError

from repositories.base_repository import BaseRepository, NotFoundError, DatabaseError, ValidationError
from utils.logger import get_logger

logger = get_logger(__name__)


class WalletRepository(BaseRepository):
    """Data access for the student_wallets spendable-XP ledger."""

    table_name = 'student_wallets'

    def get_wallet(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Return a student's wallet row, or None if they have no wallet."""
        try:
            response = (
                self.client.table('student_wallets')
                .select('*')
                .eq('user_id', user_id)
                .execute()
            )
            return response.data[0] if response.data else None
        except APIError as e:
            logger.error(f"Error fetching wallet for user {user_id[:8]}: {e}")
            raise DatabaseError("Failed to fetch wallet") from e

    def get_balance(self, user_id: str) -> int:
        """Current spendable-XP balance. Returns 0 if the student has no wallet."""
        wallet = self.get_wallet(user_id)
        return wallet['spendable_xp'] if wallet else 0

    def ensure_wallet(self, user_id: str) -> Dict[str, Any]:
        """Return the student's wallet, creating an empty one if it doesn't exist.

        Used to opt a student into the coin economy (e.g. when a Treehouse
        facilitator adjusts a balance) so subsequent credits persist.
        """
        wallet = self.get_wallet(user_id)
        if wallet:
            return wallet
        try:
            response = (
                self.client.table('student_wallets')
                .insert({'user_id': user_id})
                .execute()
            )
            if not response.data:
                raise DatabaseError("Failed to create wallet")
            logger.info(f"Created spendable-XP wallet for user {user_id[:8]}")
            return response.data[0]
        except APIError as e:
            logger.error(f"Error creating wallet for user {user_id[:8]}: {e}")
            raise DatabaseError("Failed to create wallet") from e

    def add(self, user_id: str, amount: int) -> Optional[Dict[str, Any]]:
        """Credit (or debit, if amount is negative) a wallet. No-op without a wallet.

        Returns the updated wallet, or None if the student has no wallet.
        """
        wallet = self.get_wallet(user_id)
        if not wallet:
            return None

        new_balance = wallet['spendable_xp'] + amount
        try:
            response = (
                self.client.table('student_wallets')
                .update({
                    'spendable_xp': new_balance,
                    'updated_at': datetime.now(timezone.utc).isoformat(),
                })
                .eq('id', wallet['id'])
                .execute()
            )
            return response.data[0] if response.data else None
        except APIError as e:
            logger.error(f"Error adding {amount} spendable XP for user {user_id[:8]}: {e}")
            raise DatabaseError("Failed to add spendable XP") from e

    def spend(self, user_id: str, amount: int) -> Dict[str, Any]:
        """Spend from a wallet. Raises if no wallet or insufficient balance."""
        wallet = self.get_wallet(user_id)
        if not wallet:
            raise NotFoundError(f"No wallet found for user {user_id[:8]}")

        if wallet['spendable_xp'] < amount:
            raise ValidationError(
                f"Insufficient spendable XP: have {wallet['spendable_xp']}, need {amount}"
            )

        try:
            response = (
                self.client.table('student_wallets')
                .update({
                    'spendable_xp': wallet['spendable_xp'] - amount,
                    'total_xp_spent': wallet['total_xp_spent'] + amount,
                    'updated_at': datetime.now(timezone.utc).isoformat(),
                })
                .eq('id', wallet['id'])
                .execute()
            )
            if not response.data:
                raise DatabaseError("Failed to update wallet balance")
            return response.data[0]
        except (NotFoundError, ValidationError):
            raise
        except APIError as e:
            logger.error(f"Error spending {amount} XP for user {user_id[:8]}: {e}")
            raise DatabaseError("Failed to spend XP") from e
