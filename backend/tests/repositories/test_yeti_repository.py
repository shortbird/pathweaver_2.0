"""
Unit tests for YetiRepository.

Tests Yeti pet CRUD, shop operations, inventory management, and Spendable XP transactions.
Written BEFORE implementation (TDD - Red phase).
"""

import pytest
import uuid
from unittest.mock import Mock, patch
from datetime import datetime, timezone

from repositories.base_repository import NotFoundError, DatabaseError, ValidationError


def _make_repo():
    """Create a YetiRepository with a mocked client to avoid Flask context."""
    from repositories.yeti_repository import YetiRepository
    repo = YetiRepository()
    mock_client = Mock()
    repo._client = mock_client
    return repo, mock_client


@pytest.mark.unit
class TestYetiRepositoryInitialization:
    """Tests for YetiRepository setup."""

    def test_initialization(self):
        """Test YetiRepository can be initialized"""
        from repositories.yeti_repository import YetiRepository
        repo = YetiRepository()
        assert repo is not None
        assert repo.table_name == 'yeti_pets'

    def test_initialization_with_user_id(self):
        """Test YetiRepository initializes with user context"""
        from repositories.yeti_repository import YetiRepository
        user_id = str(uuid.uuid4())
        repo = YetiRepository(user_id=user_id)
        assert repo.user_id == user_id


@pytest.mark.unit
class TestYetiPetCRUD:
    """Tests for Yeti pet creation, retrieval, and updates."""

    def test_create_pet(self):
        """Test creating a new Yeti pet for a student"""
        repo, mock_client = _make_repo()
        user_id = str(uuid.uuid4())
        pet_name = 'Frosty'

        pet_id = str(uuid.uuid4())
        mock_response = Mock()
        mock_response.data = [{
            'id': pet_id,
            'user_id': user_id,
            'name': pet_name,
            'hunger': 80,
            'happiness': 80,
            'energy': 80,
            'accessories': [],
            'spendable_xp': 0,
            'total_xp_spent': 0,
            'last_fed_at': None,
            'last_interaction_at': None,
            'created_at': datetime.now(timezone.utc).isoformat(),
        }]
        mock_client.table.return_value.insert.return_value.execute.return_value = mock_response

        pet = repo.create_pet(user_id, pet_name)

        assert pet is not None
        assert pet['user_id'] == user_id
        assert pet['name'] == pet_name
        assert pet['hunger'] == 80
        assert pet['happiness'] == 80
        assert pet['energy'] == 80
        assert pet['spendable_xp'] == 0

    def test_create_pet_duplicate_user_raises_error(self):
        """Test that creating a second pet for the same user raises an error"""
        repo, mock_client = _make_repo()
        user_id = str(uuid.uuid4())

        from postgrest.exceptions import APIError
        mock_client.table.return_value.insert.return_value.execute.side_effect = \
            APIError({'message': 'duplicate key value violates unique constraint "unique_user_pet"'})

        with pytest.raises(DatabaseError):
            repo.create_pet(user_id, 'Frosty')

    def test_get_pet_by_user_id(self):
        """Test retrieving a pet by user ID"""
        repo, mock_client = _make_repo()
        user_id = str(uuid.uuid4())

        mock_response = Mock()
        mock_response.data = [{
            'id': str(uuid.uuid4()),
            'user_id': user_id,
            'name': 'Frosty',
            'hunger': 65,
            'happiness': 70,
            'energy': 80,
            'accessories': [],
            'spendable_xp': 150,
            'total_xp_spent': 50,
            'last_fed_at': '2026-03-15T10:00:00Z',
            'last_interaction_at': '2026-03-15T12:00:00Z',
            'created_at': '2026-03-01T00:00:00Z',
        }]
        mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_response

        pet = repo.get_pet_by_user_id(user_id)

        assert pet is not None
        assert pet['user_id'] == user_id
        assert pet['name'] == 'Frosty'
        assert pet['spendable_xp'] == 150

    def test_get_pet_by_user_id_not_found(self):
        """Test retrieving pet for user with no pet returns None"""
        repo, mock_client = _make_repo()
        user_id = str(uuid.uuid4())

        mock_response = Mock()
        mock_response.data = []
        mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_response

        pet = repo.get_pet_by_user_id(user_id)

        assert pet is None

    def test_update_pet_name(self):
        """Test renaming a Yeti pet"""
        repo, mock_client = _make_repo()
        pet_id = str(uuid.uuid4())

        mock_response = Mock()
        mock_response.data = [{
            'id': pet_id,
            'user_id': str(uuid.uuid4()),
            'name': 'Snowball',
        }]
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_response

        pet = repo.update_pet_name(pet_id, 'Snowball')

        assert pet is not None
        assert pet['name'] == 'Snowball'

    def test_update_pet_name_not_found(self):
        """Test renaming a non-existent pet raises NotFoundError"""
        repo, mock_client = _make_repo()
        pet_id = str(uuid.uuid4())

        mock_response = Mock()
        mock_response.data = []
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_response

        with pytest.raises(NotFoundError):
            repo.update_pet_name(pet_id, 'Snowball')


@pytest.mark.unit
class TestYetiStats:
    """Tests for Yeti stat updates (hunger, happiness, energy)."""

    def test_update_pet_stats(self):
        """Test updating pet stats after feeding"""
        repo, mock_client = _make_repo()
        pet_id = str(uuid.uuid4())

        mock_response = Mock()
        mock_response.data = [{
            'id': pet_id,
            'hunger': 95,
            'happiness': 80,
            'energy': 80,
            'last_fed_at': datetime.now(timezone.utc).isoformat(),
            'last_interaction_at': datetime.now(timezone.utc).isoformat(),
        }]
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_response

        pet = repo.update_pet_stats(pet_id, {
            'hunger': 95,
            'last_fed_at': datetime.now(timezone.utc).isoformat(),
            'last_interaction_at': datetime.now(timezone.utc).isoformat(),
        })

        assert pet is not None
        assert pet['hunger'] == 95

    def test_update_pet_stats_clamped_to_100(self):
        """Test that stat values are clamped to max 100 before saving"""
        repo, mock_client = _make_repo()
        pet_id = str(uuid.uuid4())

        mock_response = Mock()
        mock_response.data = [{
            'id': pet_id,
            'hunger': 100,
            'happiness': 100,
            'energy': 80,
        }]
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_response

        # Pass values that would exceed 100
        repo.update_pet_stats(pet_id, {
            'hunger': 120,
            'happiness': 110,
        })

        # Verify the call clamped values to 100
        call_args = mock_client.table.return_value.update.call_args[0][0]
        assert call_args['hunger'] == 100
        assert call_args['happiness'] == 100

    def test_update_pet_stats_floor_at_zero(self):
        """Test that stat values never go below 0"""
        repo, mock_client = _make_repo()
        pet_id = str(uuid.uuid4())

        mock_response = Mock()
        mock_response.data = [{
            'id': pet_id,
            'hunger': 0,
            'happiness': 0,
            'energy': 80,
        }]
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_response

        repo.update_pet_stats(pet_id, {
            'hunger': -10,
            'happiness': -5,
        })

        call_args = mock_client.table.return_value.update.call_args[0][0]
        assert call_args['hunger'] == 0
        assert call_args['happiness'] == 0


@pytest.mark.unit
class TestYetiShop:
    """Tests for shop item catalog operations."""

    def test_get_active_shop_items(self):
        """Test retrieving all active shop items"""
        repo, mock_client = _make_repo()

        mock_response = Mock()
        mock_response.data = [
            {'id': str(uuid.uuid4()), 'name': 'Snack', 'category': 'food', 'xp_cost': 10, 'is_active': True},
            {'id': str(uuid.uuid4()), 'name': 'Toy Ball', 'category': 'toy', 'xp_cost': 20, 'is_active': True},
            {'id': str(uuid.uuid4()), 'name': 'Cozy Hat', 'category': 'accessory', 'xp_cost': 50, 'is_active': True},
        ]
        mock_client.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = mock_response

        items = repo.get_active_shop_items()

        assert len(items) == 3
        assert items[0]['name'] == 'Snack'

    def test_get_active_shop_items_by_category(self):
        """Test filtering shop items by category"""
        repo, mock_client = _make_repo()

        mock_response = Mock()
        mock_response.data = [
            {'id': str(uuid.uuid4()), 'name': 'Snack', 'category': 'food', 'xp_cost': 10},
            {'id': str(uuid.uuid4()), 'name': 'Meal', 'category': 'food', 'xp_cost': 25},
        ]
        mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.execute.return_value = mock_response

        items = repo.get_active_shop_items(category='food')

        assert len(items) == 2
        assert all(item['category'] == 'food' for item in items)

    def test_get_shop_item_by_id(self):
        """Test retrieving a single shop item"""
        repo, mock_client = _make_repo()
        item_id = str(uuid.uuid4())

        mock_response = Mock()
        mock_response.data = [{
            'id': item_id,
            'name': 'Meal',
            'category': 'food',
            'xp_cost': 25,
            'effect': {'hunger': 40, 'happiness': 10},
            'rarity': 'common',
            'is_active': True,
        }]
        mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_response

        item = repo.get_shop_item_by_id(item_id)

        assert item is not None
        assert item['name'] == 'Meal'
        assert item['effect']['hunger'] == 40

    def test_get_shop_item_not_found(self):
        """Test retrieving non-existent shop item returns None"""
        repo, mock_client = _make_repo()
        item_id = str(uuid.uuid4())

        mock_response = Mock()
        mock_response.data = []
        mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_response

        item = repo.get_shop_item_by_id(item_id)

        assert item is None


@pytest.mark.unit
class TestYetiInventory:
    """Tests for student inventory operations."""

    def test_get_user_inventory(self):
        """Test retrieving a student's inventory with item details"""
        repo, mock_client = _make_repo()
        user_id = str(uuid.uuid4())

        mock_response = Mock()
        mock_response.data = [
            {
                'id': str(uuid.uuid4()),
                'user_id': user_id,
                'item_id': str(uuid.uuid4()),
                'quantity': 3,
                'yeti_items': {'name': 'Snack', 'category': 'food', 'xp_cost': 10},
            },
            {
                'id': str(uuid.uuid4()),
                'user_id': user_id,
                'item_id': str(uuid.uuid4()),
                'quantity': 1,
                'yeti_items': {'name': 'Cozy Hat', 'category': 'accessory', 'xp_cost': 50},
            },
        ]
        mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_response

        inventory = repo.get_user_inventory(user_id)

        assert len(inventory) == 2
        assert inventory[0]['quantity'] == 3
        assert inventory[0]['yeti_items']['name'] == 'Snack'

    def test_get_user_inventory_empty(self):
        """Test retrieving inventory for user with no items"""
        repo, mock_client = _make_repo()
        user_id = str(uuid.uuid4())

        mock_response = Mock()
        mock_response.data = []
        mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_response

        inventory = repo.get_user_inventory(user_id)

        assert inventory == []

    def test_add_item_to_inventory_new(self):
        """Test adding a new item to inventory (first purchase)"""
        repo, mock_client = _make_repo()
        user_id = str(uuid.uuid4())
        item_id = str(uuid.uuid4())

        # Mock: no existing inventory entry
        mock_check = Mock()
        mock_check.data = []
        mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_check

        # Mock: successful insert
        mock_insert = Mock()
        mock_insert.data = [{
            'id': str(uuid.uuid4()),
            'user_id': user_id,
            'item_id': item_id,
            'quantity': 1,
        }]
        mock_client.table.return_value.insert.return_value.execute.return_value = mock_insert

        entry = repo.add_item_to_inventory(user_id, item_id, quantity=1)

        assert entry is not None
        assert entry['quantity'] == 1

    def test_add_item_to_inventory_existing(self):
        """Test adding quantity to an existing inventory item"""
        repo, mock_client = _make_repo()
        user_id = str(uuid.uuid4())
        item_id = str(uuid.uuid4())
        inv_id = str(uuid.uuid4())

        # Mock: existing inventory entry with quantity 2
        mock_check = Mock()
        mock_check.data = [{'id': inv_id, 'user_id': user_id, 'item_id': item_id, 'quantity': 2}]
        mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_check

        # Mock: successful update to quantity 3
        mock_update = Mock()
        mock_update.data = [{'id': inv_id, 'quantity': 3}]
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_update

        entry = repo.add_item_to_inventory(user_id, item_id, quantity=1)

        assert entry is not None
        assert entry['quantity'] == 3

    def test_decrement_inventory_item(self):
        """Test using a consumable item decrements quantity"""
        repo, mock_client = _make_repo()
        user_id = str(uuid.uuid4())
        item_id = str(uuid.uuid4())
        inv_id = str(uuid.uuid4())

        # Mock: existing entry with quantity 3
        mock_check = Mock()
        mock_check.data = [{'id': inv_id, 'user_id': user_id, 'item_id': item_id, 'quantity': 3}]
        mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_check

        # Mock: successful update to quantity 2
        mock_update = Mock()
        mock_update.data = [{'id': inv_id, 'quantity': 2}]
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_update

        entry = repo.decrement_inventory_item(user_id, item_id)

        assert entry is not None
        assert entry['quantity'] == 2

    def test_decrement_inventory_item_not_owned(self):
        """Test using an item not in inventory raises NotFoundError"""
        repo, mock_client = _make_repo()
        user_id = str(uuid.uuid4())
        item_id = str(uuid.uuid4())

        mock_check = Mock()
        mock_check.data = []
        mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_check

        with pytest.raises(NotFoundError):
            repo.decrement_inventory_item(user_id, item_id)

    def test_decrement_inventory_item_zero_quantity(self):
        """Test using an item with zero quantity raises ValidationError"""
        repo, mock_client = _make_repo()
        user_id = str(uuid.uuid4())
        item_id = str(uuid.uuid4())
        inv_id = str(uuid.uuid4())

        mock_check = Mock()
        mock_check.data = [{'id': inv_id, 'user_id': user_id, 'item_id': item_id, 'quantity': 0}]
        mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_check

        with pytest.raises(ValidationError):
            repo.decrement_inventory_item(user_id, item_id)


@pytest.mark.unit
class TestSpendableXP:
    """Tests for Spendable XP balance operations."""

    def test_get_spendable_xp_balance(self):
        """Test getting a student's Spendable XP balance"""
        repo, mock_client = _make_repo()
        user_id = str(uuid.uuid4())

        with patch.object(repo, 'get_pet_by_user_id') as mock_get_pet:
            mock_get_pet.return_value = {
                'id': str(uuid.uuid4()),
                'user_id': user_id,
                'spendable_xp': 250,
                'total_xp_spent': 100,
            }

            balance = repo.get_spendable_xp_balance(user_id)

            assert balance == 250

    def test_get_spendable_xp_balance_no_pet(self):
        """Test getting balance for user without a pet returns 0"""
        repo, mock_client = _make_repo()
        user_id = str(uuid.uuid4())

        with patch.object(repo, 'get_pet_by_user_id') as mock_get_pet:
            mock_get_pet.return_value = None

            balance = repo.get_spendable_xp_balance(user_id)

            assert balance == 0

    def test_add_spendable_xp(self):
        """Test incrementing Spendable XP when student earns XP"""
        repo, mock_client = _make_repo()
        user_id = str(uuid.uuid4())
        pet_id = str(uuid.uuid4())

        with patch.object(repo, 'get_pet_by_user_id') as mock_get_pet:
            mock_get_pet.return_value = {
                'id': pet_id,
                'user_id': user_id,
                'spendable_xp': 100,
            }

            mock_response = Mock()
            mock_response.data = [{'id': pet_id, 'spendable_xp': 150}]
            mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_response

            pet = repo.add_spendable_xp(user_id, 50)

            assert pet is not None
            assert pet['spendable_xp'] == 150

    def test_add_spendable_xp_no_pet(self):
        """Test adding XP for user without a pet does nothing (no error)"""
        repo, mock_client = _make_repo()
        user_id = str(uuid.uuid4())

        with patch.object(repo, 'get_pet_by_user_id') as mock_get_pet:
            mock_get_pet.return_value = None

            result = repo.add_spendable_xp(user_id, 50)

            assert result is None

    def test_spend_xp(self):
        """Test spending Spendable XP on a shop purchase"""
        repo, mock_client = _make_repo()
        user_id = str(uuid.uuid4())
        pet_id = str(uuid.uuid4())

        with patch.object(repo, 'get_pet_by_user_id') as mock_get_pet:
            mock_get_pet.return_value = {
                'id': pet_id,
                'user_id': user_id,
                'spendable_xp': 100,
                'total_xp_spent': 50,
            }

            mock_response = Mock()
            mock_response.data = [{'id': pet_id, 'spendable_xp': 75, 'total_xp_spent': 75}]
            mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_response

            pet = repo.spend_xp(user_id, 25)

            assert pet is not None
            assert pet['spendable_xp'] == 75
            assert pet['total_xp_spent'] == 75

    def test_spend_xp_insufficient_balance(self):
        """Test spending more XP than available raises ValidationError"""
        repo, mock_client = _make_repo()
        user_id = str(uuid.uuid4())
        pet_id = str(uuid.uuid4())

        with patch.object(repo, 'get_pet_by_user_id') as mock_get_pet:
            mock_get_pet.return_value = {
                'id': pet_id,
                'user_id': user_id,
                'spendable_xp': 20,
                'total_xp_spent': 50,
            }

            with pytest.raises(ValidationError):
                repo.spend_xp(user_id, 25)

    def test_spend_xp_no_pet(self):
        """Test spending XP without a pet raises NotFoundError"""
        repo, mock_client = _make_repo()
        user_id = str(uuid.uuid4())

        with patch.object(repo, 'get_pet_by_user_id') as mock_get_pet:
            mock_get_pet.return_value = None

            with pytest.raises(NotFoundError):
                repo.spend_xp(user_id, 25)


@pytest.mark.unit
class TestYetiInteractions:
    """Tests for recording Yeti interaction logs."""

    def test_record_interaction(self):
        """Test recording a feed interaction"""
        repo, mock_client = _make_repo()
        user_id = str(uuid.uuid4())
        pet_id = str(uuid.uuid4())
        item_id = str(uuid.uuid4())

        mock_response = Mock()
        mock_response.data = [{
            'id': str(uuid.uuid4()),
            'user_id': user_id,
            'pet_id': pet_id,
            'action_type': 'feed',
            'item_id': item_id,
            'stat_changes': {'hunger': 15},
            'xp_spent': 10,
            'created_at': datetime.now(timezone.utc).isoformat(),
        }]
        mock_client.table.return_value.insert.return_value.execute.return_value = mock_response

        interaction = repo.record_interaction(
            user_id=user_id,
            pet_id=pet_id,
            action_type='feed',
            item_id=item_id,
            stat_changes={'hunger': 15},
            xp_spent=10,
        )

        assert interaction is not None
        assert interaction['action_type'] == 'feed'
        assert interaction['xp_spent'] == 10

    def test_record_interaction_play_no_item(self):
        """Test recording a play interaction without an item"""
        repo, mock_client = _make_repo()
        user_id = str(uuid.uuid4())
        pet_id = str(uuid.uuid4())

        mock_response = Mock()
        mock_response.data = [{
            'id': str(uuid.uuid4()),
            'user_id': user_id,
            'pet_id': pet_id,
            'action_type': 'play',
            'item_id': None,
            'stat_changes': {'happiness': 10},
            'xp_spent': 0,
            'created_at': datetime.now(timezone.utc).isoformat(),
        }]
        mock_client.table.return_value.insert.return_value.execute.return_value = mock_response

        interaction = repo.record_interaction(
            user_id=user_id,
            pet_id=pet_id,
            action_type='play',
            stat_changes={'happiness': 10},
        )

        assert interaction is not None
        assert interaction['action_type'] == 'play'
        assert interaction['item_id'] is None
        assert interaction['xp_spent'] == 0

    def test_record_interaction_invalid_action_type(self):
        """Test that invalid action types are rejected"""
        repo, mock_client = _make_repo()

        with pytest.raises(ValidationError):
            repo.record_interaction(
                user_id=str(uuid.uuid4()),
                pet_id=str(uuid.uuid4()),
                action_type='invalid_action',
                stat_changes={},
            )

    def test_get_recent_interactions(self):
        """Test retrieving recent interactions for a pet"""
        repo, mock_client = _make_repo()
        user_id = str(uuid.uuid4())

        mock_response = Mock()
        mock_response.data = [
            {'id': str(uuid.uuid4()), 'action_type': 'feed', 'created_at': '2026-03-15T12:00:00Z'},
            {'id': str(uuid.uuid4()), 'action_type': 'play', 'created_at': '2026-03-15T11:00:00Z'},
        ]
        mock_client.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = mock_response

        interactions = repo.get_recent_interactions(user_id, limit=10)

        assert len(interactions) == 2
        assert interactions[0]['action_type'] == 'feed'


@pytest.mark.unit
class TestYetiAccessories:
    """Tests for equipping/unequipping accessories."""

    def test_equip_accessory(self):
        """Test equipping an accessory to the Yeti"""
        repo, mock_client = _make_repo()
        pet_id = str(uuid.uuid4())
        item_id = str(uuid.uuid4())

        # Mock: current pet with no accessories
        mock_get = Mock()
        mock_get.data = [{
            'id': pet_id,
            'accessories': [],
        }]
        mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_get

        # Mock: successful update with accessory
        mock_update = Mock()
        mock_update.data = [{
            'id': pet_id,
            'accessories': [item_id],
        }]
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_update

        pet = repo.equip_accessory(pet_id, item_id)

        assert pet is not None
        assert item_id in pet['accessories']

    def test_unequip_accessory(self):
        """Test removing an accessory from the Yeti"""
        repo, mock_client = _make_repo()
        pet_id = str(uuid.uuid4())
        item_id = str(uuid.uuid4())

        # Mock: current pet with one accessory
        mock_get = Mock()
        mock_get.data = [{
            'id': pet_id,
            'accessories': [item_id],
        }]
        mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_get

        # Mock: successful update without accessory
        mock_update = Mock()
        mock_update.data = [{
            'id': pet_id,
            'accessories': [],
        }]
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_update

        pet = repo.unequip_accessory(pet_id, item_id)

        assert pet is not None
        assert item_id not in pet['accessories']

    def test_equip_accessory_already_equipped(self):
        """Test equipping an already-equipped accessory is a no-op"""
        repo, mock_client = _make_repo()
        pet_id = str(uuid.uuid4())
        item_id = str(uuid.uuid4())

        # Mock: pet already has this accessory
        mock_get = Mock()
        mock_get.data = [{
            'id': pet_id,
            'accessories': [item_id],
        }]
        mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_get

        pet = repo.equip_accessory(pet_id, item_id)

        # Should return current state without calling update
        assert pet is not None
        assert item_id in pet['accessories']
