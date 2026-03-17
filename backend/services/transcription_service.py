"""
Transcription Service - Google Cloud Speech-to-Text integration.

Handles audio transcription for Voice Journaling feature.
Uses Google Cloud STT Enhanced model (best for child speech).
"""

from typing import Dict, Any
from services.base_service import BaseService, ValidationError
from app_config import Config
from utils.logger import get_logger

logger = get_logger(__name__)

MAX_AUDIO_DURATION_SECONDS = 180  # 3 minutes


class TranscriptionService(BaseService):
    """Service for audio-to-text transcription via Google Cloud STT."""

    def __init__(self):
        super().__init__()
        self._client = None

    @property
    def client(self):
        """Lazy-initialize Google Cloud Speech client."""
        if self._client is None:
            from google.cloud import speech_v1
            self._client = speech_v1.SpeechClient()
        return self._client

    def transcribe_audio(self, audio_data: bytes, encoding: str = 'LINEAR16', sample_rate: int = 16000) -> Dict[str, Any]:
        """
        Transcribe audio to text.

        Args:
            audio_data: Raw audio bytes
            encoding: Audio encoding (LINEAR16, FLAC, etc.)
            sample_rate: Sample rate in Hz

        Returns:
            Dict with transcription text and confidence score
        """
        try:
            from google.cloud import speech_v1

            audio = speech_v1.RecognitionAudio(content=audio_data)
            config = speech_v1.RecognitionConfig(
                encoding=getattr(speech_v1.RecognitionConfig.AudioEncoding, encoding, speech_v1.RecognitionConfig.AudioEncoding.LINEAR16),
                sample_rate_hertz=sample_rate,
                language_code='en-US',
                model='latest_long',  # Enhanced model, good for child speech
                use_enhanced=True,
                enable_automatic_punctuation=True,
            )

            response = self.client.recognize(config=config, audio=audio)

            if not response.results:
                return {'transcription': '', 'confidence': 0.0}

            # Combine all result alternatives
            transcription = ' '.join(
                result.alternatives[0].transcript
                for result in response.results
                if result.alternatives
            )

            confidence = sum(
                result.alternatives[0].confidence
                for result in response.results
                if result.alternatives
            ) / len(response.results) if response.results else 0.0

            logger.info(f"Transcription complete: {len(transcription)} chars, {confidence:.2f} confidence")

            return {
                'transcription': transcription,
                'confidence': confidence,
            }

        except Exception as e:
            logger.error(f"Transcription failed: {e}")
            raise

    def suggest_pillar_from_text(self, text: str) -> str:
        """Use AI to suggest a pillar based on transcription text."""
        try:
            from services.snap_to_learn_ai_service import SnapToLearnAIService
            # Reuse the AI service for text-based pillar suggestion
            ai_service = SnapToLearnAIService()
            result = ai_service.generate_json(
                f"Based on this learning journal entry, suggest which pillar it relates to "
                f"(stem, art, communication, civics, or wellness). "
                f"Respond with JSON: {{\"suggested_pillar\": \"pillar_name\"}}\n\n"
                f"Entry: {text}"
            )
            return result.get('suggested_pillar', 'stem') if result else 'stem'
        except Exception as e:
            logger.error(f"Pillar suggestion failed: {e}")
            return 'stem'
