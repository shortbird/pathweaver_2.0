"""
Unit tests for TranscriptionService.

Tests Google Cloud STT integration and pillar suggestion from text.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock


@pytest.mark.unit
class TestTranscriptionService:

    @patch('services.transcription_service.BaseService.__init__', return_value=None)
    def test_transcribe_audio_success(self, mock_init):
        from services.transcription_service import TranscriptionService
        service = TranscriptionService()
        service._client = Mock()

        # Mock Google Cloud STT response
        mock_alternative = Mock()
        mock_alternative.transcript = 'I learned about photosynthesis today'
        mock_alternative.confidence = 0.95

        mock_result = Mock()
        mock_result.alternatives = [mock_alternative]

        mock_response = Mock()
        mock_response.results = [mock_result]

        service._client.recognize.return_value = mock_response

        with patch('services.transcription_service.speech_v1', create=True):
            result = service.transcribe_audio(b'fake_audio')

            assert result['transcription'] == 'I learned about photosynthesis today'
            assert result['confidence'] == 0.95

    @patch('services.transcription_service.BaseService.__init__', return_value=None)
    def test_transcribe_audio_empty_result(self, mock_init):
        from services.transcription_service import TranscriptionService
        service = TranscriptionService()
        service._client = Mock()

        mock_response = Mock()
        mock_response.results = []
        service._client.recognize.return_value = mock_response

        with patch('services.transcription_service.speech_v1', create=True):
            result = service.transcribe_audio(b'silence')

            assert result['transcription'] == ''
            assert result['confidence'] == 0.0

    @patch('services.transcription_service.BaseService.__init__', return_value=None)
    def test_transcribe_audio_multiple_segments(self, mock_init):
        from services.transcription_service import TranscriptionService
        service = TranscriptionService()
        service._client = Mock()

        alt1 = Mock(transcript='First sentence.', confidence=0.9)
        alt2 = Mock(transcript='Second sentence.', confidence=0.8)
        r1 = Mock(alternatives=[alt1])
        r2 = Mock(alternatives=[alt2])
        mock_response = Mock(results=[r1, r2])

        service._client.recognize.return_value = mock_response

        with patch('services.transcription_service.speech_v1', create=True):
            result = service.transcribe_audio(b'audio')

            assert 'First sentence.' in result['transcription']
            assert 'Second sentence.' in result['transcription']
            assert result['confidence'] == pytest.approx(0.85, abs=0.01)

    def test_suggest_pillar_from_text_fallback(self):
        from services.transcription_service import TranscriptionService
        service = TranscriptionService()

        with patch('services.transcription_service.SnapToLearnAIService') as mock_ai:
            mock_ai.return_value.generate_json.side_effect = Exception("AI error")

            result = service.suggest_pillar_from_text("some text")
            assert result == 'stem'  # fallback
