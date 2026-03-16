"""
Yeti Service - Business logic for Yeti virtual companion system.

Handles stat decay, feeding, purchasing, play interactions, and accessory management.
Uses YetiRepository for all database access (P1-ARCH-4).
"""

from typing import Dict, Optional, Any
from datetime import datetime, timezone, timedelta

from services.base_service import BaseService, ValidationError
from repositories.base_repository import NotFoundError
from repositories.yeti_repository import YetiRepository
from utils.logger import get_logger

logger = get_logger(__name__)

DECAY_PER_DAY = 5
STAT_FLOOR = 20
MAX_PET_NAME_LENGTH = 50
PLAY_HAPPINESS_BOOST = 10


class YetiService(BaseService):
    """Service for Yeti pet management and XP economy."""

    def __init__(self):
        super().__init__()
        self.repository = YetiRepository()

    # ──────────────────────────────────────────
    # Pet Lifecycle
    # ──────────────────────────────────────────

    def create_pet(self, user_id: str, name: str) -> Dict[str, Any]:
        """Create a new Yeti pet. One per student."""
        self.validate_required(user_id=user_id, name=name)

        if len(name) > MAX_PET_NAME_LENGTH:
            raise ValidationError(f"Pet name must be {MAX_PET_NAME_LENGTH} characters or less")

        existing = self.repository.get_pet_by_user_id(user_id)
        if existing:
            raise ValidationError("User already has a Yeti pet")

        pet = self.repository.create_pet(user_id, name.strip())
        logger.info(f"Yeti '{name}' created for user {user_id[:8]}")
        return pet

    def get_pet(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get pet with stat decay applied based on time since last interaction."""
        pet = self.repository.get_pet_by_user_id(user_id)
        if not pet:
            return None

        last_interaction = pet.get('last_interaction_at')
        if not last_interaction:
            return pet

        # Calculate decay
        if isinstance(last_interaction, str):
            last_dt = datetime.fromisoformat(last_interaction.replace('Z', '+00:00'))
        else:
            last_dt = last_interaction

        now = datetime.now(timezone.utc)
        days_inactive = (now - last_dt).total_seconds() / 86400

        if days_inactive < 0.5:
            return pet

        decay_amount = int(days_inactive * DECAY_PER_DAY)
        if decay_amount <= 0:
            return pet

        decayed_stats = {
            'hunger': max(STAT_FLOOR, pet['hunger'] - decay_amount),
            'happiness': max(STAT_FLOOR, pet['happiness'] - decay_amount),
            'energy': max(STAT_FLOOR, pet['energy'] - decay_amount),
        }

        updated = self.repository.update_pet_stats(pet['id'], decayed_stats)
        return updated

    def rename_pet(self, user_id: str, new_name: str) -> Dict[str, Any]:
        """Rename a Yeti pet."""
        self.validate_required(name=new_name)
        if len(new_name) > MAX_PET_NAME_LENGTH:
            raise ValidationError(f"Pet name must be {MAX_PET_NAME_LENGTH} characters or less")

        pet = self.repository.get_pet_by_user_id(user_id)
        if not pet:
            raise NotFoundError("No Yeti pet found")

        return self.repository.update_pet_name(pet['id'], new_name.strip())

    # ──────────────────────────────────────────
    # Feeding
    # ──────────────────────────────────────────

    def feed_pet(self, user_id: str, item_id: str) -> Dict[str, Any]:
        """Feed pet with a food item from inventory."""
        pet = self.repository.get_pet_by_user_id(user_id)
        if not pet:
            raise NotFoundError("No Yeti pet found")

        item = self.repository.get_shop_item_by_id(item_id)
        if not item:
            raise NotFoundError(f"Item {item_id} not found")

        if item['category'] != 'food':
            raise ValidationError("Only food items can be used to feed your Yeti")

        # Decrement from inventory (raises NotFoundError/ValidationError if can't)
        self.repository.decrement_inventory_item(user_id, item_id)

        # Apply effects
        effect = item.get('effect', {})
        now = datetime.now(timezone.utc).isoformat()
        stat_updates = {
            'hunger': pet['hunger'] + effect.get('hunger', 0),
            'happiness': pet['happiness'] + effect.get('happiness', 0),
            'energy': pet['energy'] + effect.get('energy', 0),
            'last_fed_at': now,
            'last_interaction_at': now,
        }

        updated_pet = self.repository.update_pet_stats(pet['id'], stat_updates)

        self.repository.record_interaction(
            user_id=user_id,
            pet_id=pet['id'],
            action_type='feed',
            item_id=item_id,
            stat_changes=effect,
        )

        return updated_pet

    # ──────────────────────────────────────────
    # Shop & Purchases
    # ──────────────────────────────────────────

    def get_shop(self, category: Optional[str] = None):
        """Get active shop items."""
        return self.repository.get_active_shop_items(category=category)

    def purchase_item(self, user_id: str, item_id: str) -> Dict[str, Any]:
        """Purchase an item from the shop with Spendable XP."""
        item = self.repository.get_shop_item_by_id(item_id)
        if not item:
            raise NotFoundError(f"Item {item_id} not found")

        if not item.get('is_active', False):
            raise ValidationError("This item is not available for purchase")

        # Deduct Spendable XP (raises ValidationError if insufficient)
        self.repository.spend_xp(user_id, item['xp_cost'])

        # Add to inventory
        entry = self.repository.add_item_to_inventory(user_id, item_id)

        # Log the purchase
        pet = self.repository.get_pet_by_user_id(user_id)
        if pet:
            self.repository.record_interaction(
                user_id=user_id,
                pet_id=pet['id'],
                action_type='purchase',
                item_id=item_id,
                stat_changes={},
                xp_spent=item['xp_cost'],
            )

        logger.info(f"User {user_id[:8]} purchased '{item['name']}' for {item['xp_cost']} XP")
        return entry

    # ──────────────────────────────────────────
    # Play
    # ──────────────────────────────────────────

    def play_with_pet(self, user_id: str) -> Dict[str, Any]:
        """Play with pet to boost happiness."""
        pet = self.repository.get_pet_by_user_id(user_id)
        if not pet:
            raise NotFoundError("No Yeti pet found")

        now = datetime.now(timezone.utc).isoformat()
        stat_updates = {
            'happiness': pet.get('happiness', 0) + PLAY_HAPPINESS_BOOST,
            'last_interaction_at': now,
        }

        updated_pet = self.repository.update_pet_stats(pet['id'], stat_updates)

        self.repository.record_interaction(
            user_id=user_id,
            pet_id=pet['id'],
            action_type='play',
            stat_changes={'happiness': PLAY_HAPPINESS_BOOST},
        )

        return updated_pet

    # ──────────────────────────────────────────
    # Accessories
    # ──────────────────────────────────────────

    def equip_accessory(self, user_id: str, item_id: str) -> Dict[str, Any]:
        """Equip an owned accessory on the Yeti."""
        pet = self.repository.get_pet_by_user_id(user_id)
        if not pet:
            raise NotFoundError("No Yeti pet found")

        item = self.repository.get_shop_item_by_id(item_id)
        if not item:
            raise NotFoundError(f"Item {item_id} not found")

        if item['category'] != 'accessory':
            raise ValidationError("Only accessory items can be equipped")

        # Verify ownership
        inventory = self.repository.get_user_inventory(user_id)
        owned_ids = [entry['item_id'] for entry in inventory if entry.get('quantity', 0) > 0]
        if item_id not in owned_ids:
            raise ValidationError("Item not in inventory - purchase it first")

        result = self.repository.equip_accessory(pet['id'], item_id)

        self.repository.record_interaction(
            user_id=user_id,
            pet_id=pet['id'],
            action_type='equip_accessory',
            item_id=item_id,
            stat_changes={},
        )

        return result

    def unequip_accessory(self, user_id: str, item_id: str) -> Dict[str, Any]:
        """Remove an accessory from the Yeti."""
        pet = self.repository.get_pet_by_user_id(user_id)
        if not pet:
            raise NotFoundError("No Yeti pet found")

        result = self.repository.unequip_accessory(pet['id'], item_id)

        self.repository.record_interaction(
            user_id=user_id,
            pet_id=pet['id'],
            action_type='unequip_accessory',
            item_id=item_id,
            stat_changes={},
        )

        return result

    # ──────────────────────────────────────────
    # Balance & Inventory
    # ──────────────────────────────────────────

    def get_balance(self, user_id: str) -> int:
        """Get Spendable XP balance."""
        return self.repository.get_spendable_xp_balance(user_id)

    def get_inventory(self, user_id: str):
        """Get student's inventory."""
        return self.repository.get_user_inventory(user_id)
