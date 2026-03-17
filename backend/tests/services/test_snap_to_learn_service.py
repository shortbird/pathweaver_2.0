"""
Unit tests for SnapToLearnAIService.

Tests image analysis, pillar suggestion, and fallback behavior.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock


@pytest.mark.unit
class TestSnapToLearnAIService:

    @patch('services.snap_to_learn_ai_service.BaseAIService._ensure_model_initialized')
    def test_analyze_image_success(self, mock_init):
        from services.snap_to_learn_ai_service import SnapToLearnAIService
        service = SnapToLearnAIService()

        mock_model = Mock()
        mock_response = Mock()
        mock_response.text = '{"suggested_pillar": "stem", "description": "A science experiment", "reflection_prompts": ["What did you observe?", "What would you change?"]}'
        mock_model.generate_content.return_value = mock_response
        service._model = mock_model

        with patch.object(service, 'extract_json') as mock_parse:
            mock_parse.return_value = {
                'suggested_pillar': 'stem',
                'description': 'A science experiment',
                'reflection_prompts': ['What did you observe?', 'What would you change?'],
            }

            result = service.analyze_image(b'fake_image_data')

            assert result['suggested_pillar'] == 'stem'
            assert len(result['reflection_prompts']) == 2

    @patch('services.snap_to_learn_ai_service.BaseAIService._ensure_model_initialized')
    def test_analyze_image_with_context_returns_fallback_gracefully(self, mock_init):
        """When AI fails with context text, fallback still returns valid result."""
        from services.snap_to_learn_ai_service import SnapToLearnAIService
        service = SnapToLearnAIService()

        mock_model = Mock()
        mock_model.generate_content.side_effect = Exception("API unavailable")
        service._model = mock_model

        result = service.analyze_image(b'image', optional_text='I was painting')

        # Should return fallback, not raise
        assert result['suggested_pillar'] == 'stem'
        assert len(result['reflection_prompts']) == 2

    @patch('services.snap_to_learn_ai_service.BaseAIService._ensure_model_initialized')
    def test_analyze_image_fallback_on_error(self, mock_init):
        from services.snap_to_learn_ai_service import SnapToLearnAIService
        service = SnapToLearnAIService()

        mock_model = Mock()
        mock_model.generate_content.side_effect = Exception("API error")
        service._model = mock_model

        result = service.analyze_image(b'image')

        # Should return fallback, not raise
        assert result['suggested_pillar'] == 'stem'
        assert 'reflection_prompts' in result

    @patch('services.snap_to_learn_ai_service.BaseAIService._ensure_model_initialized')
    def test_pillar_normalized_to_lowercase(self, mock_init):
        from services.snap_to_learn_ai_service import SnapToLearnAIService
        service = SnapToLearnAIService()

        mock_model = Mock()
        mock_response = Mock()
        mock_response.text = '{}'
        mock_model.generate_content.return_value = mock_response
        service._model = mock_model

        with patch.object(service, 'extract_json') as mock_parse:
            mock_parse.return_value = {
                'suggested_pillar': '  STEM  ',
                'description': 'Test',
                'reflection_prompts': [],
            }

            result = service.analyze_image(b'image')
            assert result['suggested_pillar'] == 'stem'
