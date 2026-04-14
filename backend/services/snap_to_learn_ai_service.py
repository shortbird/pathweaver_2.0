"""
Snap-to-Learn AI Service - Image analysis for learning moment capture.

Analyzes photos to suggest learning pillars and reflection prompts.
Extends BaseAIService for Gemini integration.
"""

from typing import Dict, Any
from services.base_ai_service import BaseAIService
from utils.logger import get_logger

logger = get_logger(__name__)

SNAP_TO_LEARN_PROMPT = """Analyze this image from a student's perspective. The student is capturing a learning moment.

Suggest which of these learning pillars it most relates to: STEM, Art, Communication, Civics, Wellness.

Respond in JSON format:
{
    "suggested_pillar": "one of: stem, art, communication, civics, wellness",
    "description": "Brief 1-sentence description of the learning moment",
    "reflection_prompts": ["Question 1?", "Question 2?"]
}

Keep language encouraging and age-appropriate (ages 5-17). Provide exactly 2 reflection questions."""


class SnapToLearnAIService(BaseAIService):
    """AI service for analyzing photos and suggesting learning pillars."""

    def analyze_image(self, image_data: bytes, optional_text: str = '') -> Dict[str, Any]:
        """
        Analyze an image and suggest pillar + reflection prompts.

        Args:
            image_data: Raw image bytes
            optional_text: Optional context text from the student

        Returns:
            Dict with suggested_pillar, description, and reflection_prompts
        """
        try:
            prompt = SNAP_TO_LEARN_PROMPT
            if optional_text:
                prompt += f"\n\nThe student also provided this context: {optional_text}"

            # Use Gemini multimodal (image + text)
            import google.generativeai as genai
            image_part = {
                'mime_type': 'image/jpeg',
                'data': image_data,
            }

            from services.ai_gen import generate_with_timeout
            response = generate_with_timeout(
                self.model,
                [prompt, image_part],
                generation_config=self.GENERATION_CONFIGS['structured_output'],
            )

            result = self.extract_json(response.text)

            # Normalize pillar name
            if result and 'suggested_pillar' in result:
                result['suggested_pillar'] = result['suggested_pillar'].lower().strip()

            return result or {
                'suggested_pillar': 'stem',
                'description': 'A learning moment captured!',
                'reflection_prompts': ['What did you learn?', 'What would you explore next?'],
            }

        except Exception as e:
            logger.error(f"Snap-to-Learn analysis failed: {e}")
            return {
                'suggested_pillar': 'stem',
                'description': 'A learning moment captured!',
                'reflection_prompts': ['What did you learn?', 'What would you explore next?'],
            }
