"""
Yeti Repository - Data access for Yeti virtual companion system.

Handles Yeti pet CRUD, shop catalog, inventory management,
Spendable XP transactions, interaction logging, and accessory management.
"""

from typing import Optional, Dict, List, Any
from datetime import datetime, timezone
from postgrest.exceptions import APIError

from repositories.base_repository import BaseRepository, NotFoundError, DatabaseError, ValidationError
from utils.logger import get_logger

logger = get_logger(__name__)

VALID_ACTION_TYPES = ('feed', 'play', 'equip_accessory', 'unequip_accessory', 'purchase')
STAT_FIELDS = ('hunger', 'happiness', 'energy')


class YetiRepository(BaseRepository):
    """Repository for Yeti pet operations across multiple tables."""

    table_name = 'yeti_pets'

    # ──────────────────────────────────────────
    # Pet CRUD
    # ──────────────────────────────────────────

    def create_pet(self, user_id: str, name: str) -> Dict[str, Any]:
        """Create a new Yeti pet for a student. One per user."""
        try:
            response = (
                self.client.table('yeti_pets')
                .insert({
                    'user_id': user_id,
                    'name': name,
                })
                .execute()
            )
            if not response.data:
                raise DatabaseError("Failed to create Yeti pet")
            logger.info(f"Created Yeti pet '{name}' for user {user_id[:8]}")
            return response.data[0]
        except APIError as e:
            logger.error(f"Error creating Yeti pet for user {user_id[:8]}: {e}")
            raise DatabaseError(f"Failed to create Yeti pet: {e}") from e

    def get_pet_by_user_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get a student's Yeti pet. Returns None if no pet exists."""
        try:
            response = (
                self.client.table('yeti_pets')
                .select('*')
                .eq('user_id', user_id)
                .execute()
            )
            if not response.data:
                return None
            return response.data[0]
        except APIError as e:
            logger.error(f"Error fetching pet for user {user_id[:8]}: {e}")
            raise DatabaseError(f"Failed to fetch Yeti pet") from e

    def update_pet_name(self, pet_id: str, name: str) -> Dict[str, Any]:
        """Rename a Yeti pet."""
        try:
            response = (
                self.client.table('yeti_pets')
                .update({'name': name})
                .eq('id', pet_id)
                .execute()
            )
            if not response.data:
                raise NotFoundError(f"Yeti pet {pet_id} not found")
            return response.data[0]
        except APIError as e:
            logger.error(f"Error renaming pet {pet_id}: {e}")
            raise DatabaseError(f"Failed to rename Yeti pet") from e

    # ──────────────────────────────────────────
    # Stat Management
    # ──────────────────────────────────────────

    def update_pet_stats(self, pet_id: str, stats: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update pet stats with clamping (0-100 for stat fields).

        Args:
            pet_id: Yeti pet ID
            stats: Dict of field->value pairs. Stat fields (hunger, happiness, energy)
                   are clamped to 0-100. Other fields (last_fed_at, etc.) pass through.
        """
        clamped = {}
        for key, value in stats.items():
            if key in STAT_FIELDS:
                clamped[key] = max(0, min(100, value))
            else:
                clamped[key] = value

        try:
            response = (
                self.client.table('yeti_pets')
                .update(clamped)
                .eq('id', pet_id)
                .execute()
            )
            if not response.data:
                raise NotFoundError(f"Yeti pet {pet_id} not found")
            return response.data[0]
        except APIError as e:
            logger.error(f"Error updating stats for pet {pet_id}: {e}")
            raise DatabaseError(f"Failed to update Yeti stats") from e

    # ──────────────────────────────────────────
    # Shop Catalog
    # ──────────────────────────────────────────

    def get_active_shop_items(self, category: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get all active shop items, optionally filtered by category."""
        try:
            query = (
                self.client.table('yeti_items')
                .select('*')
                .eq('is_active', True)
            )
            if category:
                query = query.eq('category', category)
            query = query.order('xp_cost')
            response = query.execute()
            return response.data or []
        except APIError as e:
            logger.error(f"Error fetching shop items: {e}")
            raise DatabaseError("Failed to fetch shop items") from e

    def get_shop_item_by_id(self, item_id: str) -> Optional[Dict[str, Any]]:
        """Get a single shop item by ID."""
        try:
            response = (
                self.client.table('yeti_items')
                .select('*')
                .eq('id', item_id)
                .execute()
            )
            if not response.data:
                return None
            return response.data[0]
        except APIError as e:
            logger.error(f"Error fetching shop item {item_id}: {e}")
            raise DatabaseError("Failed to fetch shop item") from e

    # ──────────────────────────────────────────
    # Inventory
    # ──────────────────────────────────────────

    def get_user_inventory(self, user_id: str) -> List[Dict[str, Any]]:
        """Get a student's inventory with item details."""
        try:
            response = (
                self.client.table('yeti_inventory')
                .select('*, yeti_items(*)')
                .eq('user_id', user_id)
                .execute()
            )
            return response.data or []
        except APIError as e:
            logger.error(f"Error fetching inventory for user {user_id[:8]}: {e}")
            raise DatabaseError("Failed to fetch inventory") from e

    def add_item_to_inventory(self, user_id: str, item_id: str, quantity: int = 1) -> Dict[str, Any]:
        """Add item to inventory. Increments quantity if already owned."""
        try:
            # Check for existing entry
            existing = (
                self.client.table('yeti_inventory')
                .select('*')
                .eq('user_id', user_id)
                .eq('item_id', item_id)
                .execute()
            )

            if existing.data:
                # Increment existing quantity
                entry = existing.data[0]
                new_qty = entry['quantity'] + quantity
                response = (
                    self.client.table('yeti_inventory')
                    .update({'quantity': new_qty})
                    .eq('id', entry['id'])
                    .execute()
                )
                return response.data[0]
            else:
                # Insert new entry
                response = (
                    self.client.table('yeti_inventory')
                    .insert({
                        'user_id': user_id,
                        'item_id': item_id,
                        'quantity': quantity,
                    })
                    .execute()
                )
                if not response.data:
                    raise DatabaseError("Failed to add item to inventory")
                return response.data[0]
        except APIError as e:
            logger.error(f"Error adding item {item_id} to inventory for user {user_id[:8]}: {e}")
            raise DatabaseError("Failed to add item to inventory") from e

    def decrement_inventory_item(self, user_id: str, item_id: str) -> Dict[str, Any]:
        """Use a consumable item (decrement quantity by 1)."""
        try:
            existing = (
                self.client.table('yeti_inventory')
                .select('*')
                .eq('user_id', user_id)
                .eq('item_id', item_id)
                .execute()
            )

            if not existing.data:
                raise NotFoundError(f"Item {item_id} not in inventory for user {user_id[:8]}")

            entry = existing.data[0]
            if entry['quantity'] <= 0:
                raise ValidationError(f"Item {item_id} has zero quantity")

            new_qty = entry['quantity'] - 1
            response = (
                self.client.table('yeti_inventory')
                .update({'quantity': new_qty})
                .eq('id', entry['id'])
                .execute()
            )
            return response.data[0]
        except (NotFoundError, ValidationError):
            raise
        except APIError as e:
            logger.error(f"Error decrementing item {item_id} for user {user_id[:8]}: {e}")
            raise DatabaseError("Failed to decrement inventory item") from e

    # ──────────────────────────────────────────
    # Spendable XP
    # ──────────────────────────────────────────

    def get_spendable_xp_balance(self, user_id: str) -> int:
        """Get a student's current Spendable XP balance. Returns 0 if no pet."""
        pet = self.get_pet_by_user_id(user_id)
        if not pet:
            return 0
        return pet['spendable_xp']

    def add_spendable_xp(self, user_id: str, amount: int) -> Optional[Dict[str, Any]]:
        """Increment Spendable XP when student earns XP. No-op if no pet."""
        pet = self.get_pet_by_user_id(user_id)
        if not pet:
            return None

        new_balance = pet['spendable_xp'] + amount
        try:
            response = (
                self.client.table('yeti_pets')
                .update({'spendable_xp': new_balance})
                .eq('id', pet['id'])
                .execute()
            )
            return response.data[0] if response.data else None
        except APIError as e:
            logger.error(f"Error adding {amount} spendable XP for user {user_id[:8]}: {e}")
            raise DatabaseError("Failed to add spendable XP") from e

    def spend_xp(self, user_id: str, amount: int) -> Dict[str, Any]:
        """Spend Spendable XP on a shop purchase."""
        pet = self.get_pet_by_user_id(user_id)
        if not pet:
            raise NotFoundError(f"No Yeti pet found for user {user_id[:8]}")

        if pet['spendable_xp'] < amount:
            raise ValidationError(
                f"Insufficient Spendable XP: have {pet['spendable_xp']}, need {amount}"
            )

        new_balance = pet['spendable_xp'] - amount
        new_total_spent = pet['total_xp_spent'] + amount
        try:
            response = (
                self.client.table('yeti_pets')
                .update({
                    'spendable_xp': new_balance,
                    'total_xp_spent': new_total_spent,
                })
                .eq('id', pet['id'])
                .execute()
            )
            if not response.data:
                raise DatabaseError("Failed to update Spendable XP balance")
            return response.data[0]
        except (NotFoundError, ValidationError):
            raise
        except APIError as e:
            logger.error(f"Error spending {amount} XP for user {user_id[:8]}: {e}")
            raise DatabaseError("Failed to spend XP") from e

    # ──────────────────────────────────────────
    # Interactions
    # ──────────────────────────────────────────

    def record_interaction(
        self,
        user_id: str,
        pet_id: str,
        action_type: str,
        stat_changes: Dict[str, Any],
        item_id: Optional[str] = None,
        xp_spent: int = 0,
    ) -> Dict[str, Any]:
        """Record a Yeti interaction (feed, play, equip, etc.)."""
        if action_type not in VALID_ACTION_TYPES:
            raise ValidationError(
                f"Invalid action type '{action_type}'. Must be one of: {VALID_ACTION_TYPES}"
            )

        try:
            data = {
                'user_id': user_id,
                'pet_id': pet_id,
                'action_type': action_type,
                'stat_changes': stat_changes,
                'xp_spent': xp_spent,
            }
            if item_id:
                data['item_id'] = item_id

            response = (
                self.client.table('yeti_interactions')
                .insert(data)
                .execute()
            )
            if not response.data:
                raise DatabaseError("Failed to record interaction")
            return response.data[0]
        except ValidationError:
            raise
        except APIError as e:
            logger.error(f"Error recording {action_type} interaction for user {user_id[:8]}: {e}")
            raise DatabaseError("Failed to record interaction") from e

    def get_recent_interactions(self, user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        """Get recent interactions for a user, newest first."""
        try:
            response = (
                self.client.table('yeti_interactions')
                .select('*')
                .eq('user_id', user_id)
                .order('created_at', desc=True)
                .limit(limit)
                .execute()
            )
            return response.data or []
        except APIError as e:
            logger.error(f"Error fetching interactions for user {user_id[:8]}: {e}")
            raise DatabaseError("Failed to fetch interactions") from e

    # ──────────────────────────────────────────
    # Accessories
    # ──────────────────────────────────────────

    def equip_accessory(self, pet_id: str, item_id: str) -> Dict[str, Any]:
        """Equip an accessory on the Yeti. No-op if already equipped."""
        try:
            response = (
                self.client.table('yeti_pets')
                .select('id, accessories')
                .eq('id', pet_id)
                .execute()
            )
            if not response.data:
                raise NotFoundError(f"Yeti pet {pet_id} not found")

            pet = response.data[0]
            accessories = pet.get('accessories', [])

            if item_id in accessories:
                return pet

            accessories.append(item_id)
            update_response = (
                self.client.table('yeti_pets')
                .update({'accessories': accessories})
                .eq('id', pet_id)
                .execute()
            )
            if not update_response.data:
                raise DatabaseError("Failed to equip accessory")
            return update_response.data[0]
        except NotFoundError:
            raise
        except APIError as e:
            logger.error(f"Error equipping accessory {item_id} on pet {pet_id}: {e}")
            raise DatabaseError("Failed to equip accessory") from e

    def unequip_accessory(self, pet_id: str, item_id: str) -> Dict[str, Any]:
        """Remove an accessory from the Yeti."""
        try:
            response = (
                self.client.table('yeti_pets')
                .select('id, accessories')
                .eq('id', pet_id)
                .execute()
            )
            if not response.data:
                raise NotFoundError(f"Yeti pet {pet_id} not found")

            pet = response.data[0]
            accessories = pet.get('accessories', [])

            if item_id in accessories:
                accessories.remove(item_id)

            update_response = (
                self.client.table('yeti_pets')
                .update({'accessories': accessories})
                .eq('id', pet_id)
                .execute()
            )
            if not update_response.data:
                raise DatabaseError("Failed to unequip accessory")
            return update_response.data[0]
        except NotFoundError:
            raise
        except APIError as e:
            logger.error(f"Error unequipping accessory {item_id} from pet {pet_id}: {e}")
            raise DatabaseError("Failed to unequip accessory") from e
