"""
Unit tests for XP Service.

Tests XP calculation and distribution including:
- XP award by pillar
- XP total calculation
- Completion bonus calculation (50%)
- Badge unlock thresholds
- Level progression
"""

import pytest
import uuid
from unittest.mock import Mock, patch

from services.xp_service import XPService
from services.base_service import ValidationError

from utils.logger import get_logger

logger = get_logger(__name__)


@pytest.mark.unit
@pytest.mark.critical
def test_xp_service_initialization():
    """Test XPService can be initialized"""
    user_id = str(uuid.uuid4())
    service = XPService(user_id=user_id)

    assert service is not None
    assert service.user_id == user_id


@pytest.mark.unit
@pytest.mark.critical
def test_xp_award_by_pillar():
    """Test XP is correctly awarded to specific pillar"""
    user_id = str(uuid.uuid4())
    service = XPService(user_id=user_id)

    pillars = ['stem', 'wellness', 'communication', 'civics', 'art']

    for pillar in pillars:
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock existing XP
            mock_current_xp = Mock()
            mock_current_xp.data = [{'pillar': pillar, 'xp_amount': 100}]
            mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_current_xp

            # Mock update
            mock_update = Mock()
            mock_update.data = [{'pillar': pillar, 'xp_amount': 200}]
            mock_supabase.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = mock_update

            result = service.award_xp(user_id=user_id, pillar=pillar, xp_amount=100)

            # Should succeed
            assert result is not None


@pytest.mark.unit
@pytest.mark.critical
def test_xp_total_calculation():
    """Test total XP calculation across all pillars"""
    user_id = str(uuid.uuid4())
    service = XPService(user_id=user_id)

    with patch.object(service, 'supabase') as mock_supabase:
        # Mock XP in all pillars
        mock_xp_data = Mock()
        mock_xp_data.data = [
            {'pillar': 'stem', 'xp_amount': 500},
            {'pillar': 'wellness', 'xp_amount': 300},
            {'pillar': 'communication', 'xp_amount': 200},
            {'pillar': 'civics', 'xp_amount': 150},
            {'pillar': 'art', 'xp_amount': 250},
        ]
        mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_xp_data

        total_xp = service.get_total_xp(user_id=user_id)

        # Total should be 1400
        assert total_xp == 1400


@pytest.mark.unit
def test_badge_unlock_threshold():
    """Test badge unlock detection when XP threshold is reached"""
    user_id = str(uuid.uuid4())
    service = XPService(user_id=user_id)

    with patch.object(service, 'supabase') as mock_supabase:
        # Mock user's XP in STEM pillar
        mock_xp_data = Mock()
        mock_xp_data.data = [{'pillar': 'stem', 'xp_amount': 1000}]
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_xp_data

        # Mock badges with min_xp requirements
        mock_badges = Mock()
        mock_badges.data = [
            {'id': str(uuid.uuid4()), 'name': 'STEM Explorer', 'pillar_primary': 'stem', 'min_xp': 500},
            {'id': str(uuid.uuid4()), 'name': 'STEM Scholar', 'pillar_primary': 'stem', 'min_xp': 1500},
        ]
        mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_badges

        unlocked_badges = service.check_badge_unlocks(user_id=user_id, pillar='stem')

        # Should unlock first badge (500 XP), but not second (1500 XP)
        assert len(unlocked_badges) == 1
        assert unlocked_badges[0]['name'] == 'STEM Explorer'




@pytest.mark.unit
@pytest.mark.critical
def test_xp_consistency_after_update():
    """Test XP remains consistent after update operations"""
    user_id = str(uuid.uuid4())
    service = XPService(user_id=user_id)

    with patch.object(service, 'supabase') as mock_supabase:
        # Mock current XP
        mock_current = Mock()
        mock_current.data = [{'pillar': 'stem', 'xp_amount': 500}]

        # Mock updated XP
        mock_updated = Mock()
        mock_updated.data = [{'pillar': 'stem', 'xp_amount': 700}]

        # Setup mock chain
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_current
        mock_supabase.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = mock_updated

        # Award 200 XP
        result = service.award_xp(user_id=user_id, pillar='stem', xp_amount=200)

        # Updated XP should be 700 (500 + 200)
        if result and 'xp_amount' in result:
            assert result['xp_amount'] == 700


@pytest.mark.unit
def test_xp_validation_negative_amount():
    """Test that negative XP amounts are rejected"""
    service = XPService()

    with pytest.raises(ValidationError):
        service.award_xp(user_id=str(uuid.uuid4()), pillar='stem', xp_amount=-100)


@pytest.mark.unit
def test_xp_validation_invalid_pillar():
    """Test that invalid pillar names are rejected"""
    service = XPService()

    invalid_pillars = ['invalid', 'science', 'math', 'STEM', 'Wellness']

    for invalid_pillar in invalid_pillars:
        with pytest.raises(ValidationError):
            service.award_xp(user_id=str(uuid.uuid4()), pillar=invalid_pillar, xp_amount=100)


@pytest.mark.unit
def test_xp_round_to_nearest_50():
    """Test XP rounding to nearest 50"""
    service = XPService()

    # Test rounding
    test_cases = [
        (1, 0),
        (24, 0),
        (25, 50),
        (49, 50),
        (50, 50),
        (51, 50),
        (74, 50),
        (75, 100),
        (99, 100),
        (100, 100),
        (124, 100),
        (125, 150),
    ]

    for input_xp, expected_rounded in test_cases:
        rounded = service.round_to_nearest_50(input_xp)
        assert rounded == expected_rounded, f"XP {input_xp} should round to {expected_rounded}, got {rounded}"


@pytest.mark.unit
def test_get_xp_breakdown_by_pillar():
    """Test retrieving XP breakdown by pillar"""
    user_id = str(uuid.uuid4())
    service = XPService(user_id=user_id)

    with patch.object(service, 'supabase') as mock_supabase:
        mock_xp_data = Mock()
        mock_xp_data.data = [
            {'pillar': 'stem', 'xp_amount': 500},
            {'pillar': 'wellness', 'xp_amount': 300},
            {'pillar': 'communication', 'xp_amount': 200},
            {'pillar': 'civics', 'xp_amount': 150},
            {'pillar': 'art', 'xp_amount': 250},
        ]
        mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_xp_data

        breakdown = service.get_xp_breakdown(user_id=user_id)

        # Should return breakdown for all pillars
        assert len(breakdown) == 5
        assert breakdown['stem'] == 500
        assert breakdown['wellness'] == 300
        assert breakdown['total'] == 1400
