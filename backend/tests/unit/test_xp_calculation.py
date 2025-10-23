"""Unit tests for XP calculation functionality"""

import pytest
from backend.routes.users.helpers import (

from utils.logger import get_logger

logger = get_logger(__name__)
    calculate_user_xp,
    get_skill_xp_breakdown,
    calculate_level_from_xp,
    get_xp_for_next_level
)

def test_calculate_user_xp_with_no_quests():
    """Test XP calculation with no completed quests"""
    quests = []
    result = calculate_user_xp(quests)
    
    assert result['total_xp'] == 0
    assert result['creativity'] == 0
    assert result['critical_thinking'] == 0
    assert result['practical_skills'] == 0
    assert result['communication'] == 0
    assert result['cultural_literacy'] == 0

def test_calculate_user_xp_with_single_skill():
    """Test XP calculation with single skill quest"""
    quests = [
        {
            'quest_skill_xp': [
                {'skill_name': 'creativity', 'xp_value': 100}
            ]
        }
    ]
    result = calculate_user_xp(quests)
    
    assert result['total_xp'] == 100
    assert result['creativity'] == 100
    assert result['critical_thinking'] == 0

def test_calculate_user_xp_with_multiple_skills():
    """Test XP calculation with multiple skills"""
    quests = [
        {
            'quest_skill_xp': [
                {'skill_name': 'creativity', 'xp_value': 50},
                {'skill_name': 'critical_thinking', 'xp_value': 30}
            ]
        },
        {
            'quest_skill_xp': [
                {'skill_name': 'creativity', 'xp_value': 25},
                {'skill_name': 'practical_skills', 'xp_value': 45}
            ]
        }
    ]
    result = calculate_user_xp(quests)
    
    assert result['total_xp'] == 150
    assert result['creativity'] == 75
    assert result['critical_thinking'] == 30
    assert result['practical_skills'] == 45
    assert result['communication'] == 0
    assert result['cultural_literacy'] == 0

def test_get_skill_xp_breakdown():
    """Test skill XP breakdown calculation"""
    user_xp = {
        'creativity': 100,
        'critical_thinking': 80,
        'practical_skills': 60,
        'communication': 40,
        'cultural_literacy': 20,
        'total_xp': 300
    }
    
    breakdown = get_skill_xp_breakdown(user_xp)
    
    assert len(breakdown) == 5
    assert breakdown[0]['name'] == 'creativity'
    assert breakdown[0]['xp'] == 100
    assert breakdown[0]['percentage'] == pytest.approx(33.33, 0.01)
    assert breakdown[-1]['name'] == 'cultural_literacy'
    assert breakdown[-1]['xp'] == 20
    assert breakdown[-1]['percentage'] == pytest.approx(6.67, 0.01)

def test_calculate_level_from_xp():
    """Test level calculation from XP"""
    assert calculate_level_from_xp(0) == 1
    assert calculate_level_from_xp(50) == 1
    assert calculate_level_from_xp(100) == 2
    assert calculate_level_from_xp(250) == 3
    assert calculate_level_from_xp(500) == 4
    assert calculate_level_from_xp(1000) == 5
    assert calculate_level_from_xp(5000) == 10

def test_get_xp_for_next_level():
    """Test XP required for next level"""
    assert get_xp_for_next_level(1) == 100
    assert get_xp_for_next_level(2) == 250
    assert get_xp_for_next_level(3) == 500
    assert get_xp_for_next_level(5) == 1500

def test_xp_calculation_handles_missing_data():
    """Test XP calculation handles missing quest_skill_xp"""
    quests = [
        {'quest_skill_xp': None},
        {'quest_skill_xp': []},
        {
            'quest_skill_xp': [
                {'skill_name': 'creativity', 'xp_value': 50}
            ]
        }
    ]
    result = calculate_user_xp(quests)
    
    assert result['total_xp'] == 50
    assert result['creativity'] == 50

def test_xp_calculation_ignores_invalid_skills():
    """Test XP calculation ignores invalid skill names"""
    quests = [
        {
            'quest_skill_xp': [
                {'skill_name': 'creativity', 'xp_value': 100},
                {'skill_name': 'invalid_skill', 'xp_value': 50},
                {'skill_name': 'critical_thinking', 'xp_value': 75}
            ]
        }
    ]
    result = calculate_user_xp(quests)
    
    assert result['total_xp'] == 175  # Should not include invalid_skill
    assert result['creativity'] == 100
    assert result['critical_thinking'] == 75
    assert 'invalid_skill' not in result