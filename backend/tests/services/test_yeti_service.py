"""
Unit tests for YetiService.

Tests business logic: stat decay, feeding flow, purchase flow, play rewards,
and Spendable XP integration. Written BEFORE implementation (TDD).
"""

import pytest
import uuid
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timezone, timedelta

from services.base_service import ValidationError


def _make_service():
    """Create YetiService with mocked repository."""
    from services.yeti_service import YetiService
    service = YetiService()
    service.repository = Mock()
    return service


@pytest.mark.unit
class TestYetiServiceInitialization:

    def test_initialization(self):
        from services.yeti_service import YetiService
        service = YetiService()
        assert service is not None


@pytest.mark.unit
@pytest.mark.critical
class TestCreatePet:

    def test_create_pet_success(self):
        """Student creates their first Yeti pet"""
        service = _make_service()
        user_id = str(uuid.uuid4())

        service.repository.get_pet_by_user_id.return_value = None
        service.repository.create_pet.return_value = {
            'id': str(uuid.uuid4()),
            'user_id': user_id,
            'name': 'Frosty',
            'hunger': 80,
            'happiness': 80,
            'energy': 80,
            'spendable_xp': 0,
        }

        pet = service.create_pet(user_id, 'Frosty')

        assert pet['name'] == 'Frosty'
        service.repository.create_pet.assert_called_once_with(user_id, 'Frosty')

    def test_create_pet_already_exists(self):
        """Cannot create a second pet"""
        service = _make_service()
        user_id = str(uuid.uuid4())

        service.repository.get_pet_by_user_id.return_value = {'id': str(uuid.uuid4())}

        with pytest.raises(ValidationError, match="already has a Yeti"):
            service.create_pet(user_id, 'Frosty')

    def test_create_pet_empty_name(self):
        """Pet name cannot be empty"""
        service = _make_service()

        with pytest.raises(ValidationError, match="name"):
            service.create_pet(str(uuid.uuid4()), '')

    def test_create_pet_name_too_long(self):
        """Pet name has max length"""
        service = _make_service()
        service.repository.get_pet_by_user_id.return_value = None

        with pytest.raises(ValidationError, match="name"):
            service.create_pet(str(uuid.uuid4()), 'A' * 51)


@pytest.mark.unit
@pytest.mark.critical
class TestGetPetWithDecay:

    def test_get_pet_applies_decay(self):
        """Stats decay by ~5 per day of inactivity"""
        service = _make_service()
        user_id = str(uuid.uuid4())
        pet_id = str(uuid.uuid4())
        two_days_ago = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()

        service.repository.get_pet_by_user_id.return_value = {
            'id': pet_id,
            'user_id': user_id,
            'hunger': 80,
            'happiness': 80,
            'energy': 80,
            'last_interaction_at': two_days_ago,
        }
        service.repository.update_pet_stats.return_value = {
            'id': pet_id,
            'hunger': 70,
            'happiness': 70,
            'energy': 70,
        }

        pet = service.get_pet(user_id)

        assert pet is not None
        # Should have called update_pet_stats with decayed values
        service.repository.update_pet_stats.assert_called_once()

    def test_get_pet_no_decay_recent_interaction(self):
        """No decay if interacted recently"""
        service = _make_service()
        user_id = str(uuid.uuid4())
        just_now = datetime.now(timezone.utc).isoformat()

        service.repository.get_pet_by_user_id.return_value = {
            'id': str(uuid.uuid4()),
            'user_id': user_id,
            'hunger': 80,
            'happiness': 80,
            'energy': 80,
            'last_interaction_at': just_now,
        }

        pet = service.get_pet(user_id)

        assert pet is not None
        # Should NOT call update since no decay needed
        service.repository.update_pet_stats.assert_not_called()

    def test_get_pet_decay_floor_at_20(self):
        """Stats never decay below 20 (Yeti never dies)"""
        service = _make_service()
        user_id = str(uuid.uuid4())
        pet_id = str(uuid.uuid4())
        ten_days_ago = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()

        service.repository.get_pet_by_user_id.return_value = {
            'id': pet_id,
            'user_id': user_id,
            'hunger': 30,
            'happiness': 25,
            'energy': 40,
            'last_interaction_at': ten_days_ago,
        }
        service.repository.update_pet_stats.return_value = {
            'id': pet_id,
            'hunger': 20,
            'happiness': 20,
            'energy': 20,
        }

        pet = service.get_pet(user_id)

        # Verify the stats passed to update are floored at 20
        call_args = service.repository.update_pet_stats.call_args
        stats = call_args[0][1]  # second positional arg
        assert stats.get('hunger', 0) >= 20
        assert stats.get('happiness', 0) >= 20
        assert stats.get('energy', 0) >= 20

    def test_get_pet_not_found(self):
        """Returns None if no pet exists"""
        service = _make_service()
        service.repository.get_pet_by_user_id.return_value = None

        pet = service.get_pet(str(uuid.uuid4()))

        assert pet is None

    def test_get_pet_no_interaction_timestamp(self):
        """New pet with no interaction history - no decay"""
        service = _make_service()

        service.repository.get_pet_by_user_id.return_value = {
            'id': str(uuid.uuid4()),
            'hunger': 80,
            'happiness': 80,
            'energy': 80,
            'last_interaction_at': None,
        }

        pet = service.get_pet(str(uuid.uuid4()))

        assert pet is not None
        service.repository.update_pet_stats.assert_not_called()


@pytest.mark.unit
@pytest.mark.critical
class TestFeedPet:

    def test_feed_pet_success(self):
        """Feed pet with item from inventory"""
        service = _make_service()
        user_id = str(uuid.uuid4())
        pet_id = str(uuid.uuid4())
        item_id = str(uuid.uuid4())

        service.repository.get_pet_by_user_id.return_value = {
            'id': pet_id,
            'user_id': user_id,
            'hunger': 50,
            'happiness': 60,
            'energy': 70,
        }
        service.repository.get_shop_item_by_id.return_value = {
            'id': item_id,
            'name': 'Meal',
            'category': 'food',
            'effect': {'hunger': 40, 'happiness': 10},
        }
        service.repository.decrement_inventory_item.return_value = {'quantity': 2}
        service.repository.update_pet_stats.return_value = {
            'id': pet_id,
            'hunger': 90,
            'happiness': 70,
            'energy': 70,
        }
        service.repository.record_interaction.return_value = {'id': str(uuid.uuid4())}

        result = service.feed_pet(user_id, item_id)

        assert result is not None
        service.repository.decrement_inventory_item.assert_called_once_with(user_id, item_id)
        service.repository.update_pet_stats.assert_called_once()
        service.repository.record_interaction.assert_called_once()

    def test_feed_pet_not_food_item(self):
        """Cannot feed with non-food item"""
        service = _make_service()
        user_id = str(uuid.uuid4())

        service.repository.get_pet_by_user_id.return_value = {'id': str(uuid.uuid4())}
        service.repository.get_shop_item_by_id.return_value = {
            'id': str(uuid.uuid4()),
            'category': 'accessory',
        }

        with pytest.raises(ValidationError, match="food"):
            service.feed_pet(user_id, str(uuid.uuid4()))

    def test_feed_pet_no_pet(self):
        """Cannot feed without a pet"""
        service = _make_service()
        service.repository.get_pet_by_user_id.return_value = None

        from repositories.base_repository import NotFoundError
        with pytest.raises(NotFoundError):
            service.feed_pet(str(uuid.uuid4()), str(uuid.uuid4()))


@pytest.mark.unit
@pytest.mark.critical
class TestPurchaseItem:

    def test_purchase_item_success(self):
        """Buy item with Spendable XP"""
        service = _make_service()
        user_id = str(uuid.uuid4())
        item_id = str(uuid.uuid4())

        service.repository.get_shop_item_by_id.return_value = {
            'id': item_id,
            'name': 'Cozy Hat',
            'category': 'accessory',
            'xp_cost': 50,
            'is_active': True,
        }
        service.repository.spend_xp.return_value = {'spendable_xp': 150}
        service.repository.add_item_to_inventory.return_value = {'quantity': 1}
        service.repository.get_pet_by_user_id.return_value = {'id': str(uuid.uuid4())}
        service.repository.record_interaction.return_value = {'id': str(uuid.uuid4())}

        result = service.purchase_item(user_id, item_id)

        assert result is not None
        service.repository.spend_xp.assert_called_once_with(user_id, 50)
        service.repository.add_item_to_inventory.assert_called_once_with(user_id, item_id)

    def test_purchase_inactive_item(self):
        """Cannot buy inactive item"""
        service = _make_service()

        service.repository.get_shop_item_by_id.return_value = {
            'id': str(uuid.uuid4()),
            'is_active': False,
        }

        with pytest.raises(ValidationError, match="not available"):
            service.purchase_item(str(uuid.uuid4()), str(uuid.uuid4()))

    def test_purchase_item_not_found(self):
        """Cannot buy non-existent item"""
        service = _make_service()
        service.repository.get_shop_item_by_id.return_value = None

        from repositories.base_repository import NotFoundError
        with pytest.raises(NotFoundError):
            service.purchase_item(str(uuid.uuid4()), str(uuid.uuid4()))


@pytest.mark.unit
class TestPlayInteraction:

    def test_play_boosts_happiness(self):
        """Play interaction boosts happiness"""
        service = _make_service()
        user_id = str(uuid.uuid4())
        pet_id = str(uuid.uuid4())

        service.repository.get_pet_by_user_id.return_value = {
            'id': pet_id,
            'user_id': user_id,
            'happiness': 60,
        }
        service.repository.update_pet_stats.return_value = {
            'id': pet_id,
            'happiness': 70,
        }
        service.repository.record_interaction.return_value = {'id': str(uuid.uuid4())}

        result = service.play_with_pet(user_id)

        assert result is not None
        service.repository.update_pet_stats.assert_called_once()
        service.repository.record_interaction.assert_called_once()


@pytest.mark.unit
class TestEquipAccessory:

    def test_equip_accessory_success(self):
        """Equip an owned accessory"""
        service = _make_service()
        user_id = str(uuid.uuid4())
        pet_id = str(uuid.uuid4())
        item_id = str(uuid.uuid4())

        service.repository.get_pet_by_user_id.return_value = {'id': pet_id}
        service.repository.get_shop_item_by_id.return_value = {
            'id': item_id,
            'category': 'accessory',
        }
        # Mock inventory check - user owns the item
        service.repository.get_user_inventory.return_value = [
            {'item_id': item_id, 'quantity': 1}
        ]
        service.repository.equip_accessory.return_value = {
            'id': pet_id,
            'accessories': [item_id],
        }
        service.repository.record_interaction.return_value = {'id': str(uuid.uuid4())}

        result = service.equip_accessory(user_id, item_id)

        assert result is not None
        assert item_id in result['accessories']

    def test_equip_non_accessory_item(self):
        """Cannot equip a food item"""
        service = _make_service()
        user_id = str(uuid.uuid4())

        service.repository.get_pet_by_user_id.return_value = {'id': str(uuid.uuid4())}
        service.repository.get_shop_item_by_id.return_value = {
            'id': str(uuid.uuid4()),
            'category': 'food',
        }

        with pytest.raises(ValidationError, match="accessory"):
            service.equip_accessory(user_id, str(uuid.uuid4()))

    def test_equip_unowned_accessory(self):
        """Cannot equip item not in inventory"""
        service = _make_service()
        user_id = str(uuid.uuid4())
        item_id = str(uuid.uuid4())

        service.repository.get_pet_by_user_id.return_value = {'id': str(uuid.uuid4())}
        service.repository.get_shop_item_by_id.return_value = {
            'id': item_id,
            'category': 'accessory',
        }
        service.repository.get_user_inventory.return_value = []  # empty inventory

        with pytest.raises(ValidationError, match="not in inventory"):
            service.equip_accessory(user_id, item_id)
