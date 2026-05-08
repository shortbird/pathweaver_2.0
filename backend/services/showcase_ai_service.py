"""Gemini-powered draft generators for the marketing showcase composer.

All three methods are short, single-shot prompts. Output is treated as a draft —
the marketer always reviews and edits before posting.
"""

from typing import Dict, List, Optional

from services.base_ai_service import BaseAIService, AIGenerationError
from utils.logger import get_logger

logger = get_logger(__name__)


class ShowcaseAIService(BaseAIService):
    """Caption / alt-text / quote-pull drafts."""

    def generate_captions(self, evidence: Dict, consent: Optional[Dict] = None) -> List[Dict[str, str]]:
        """Return three caption variants tagged 'educational', 'inspirational', 'punchy'.

        Honors the consent.consent_first_name flag — if false, the prompt is
        instructed to refer to the student generically.
        """
        consent = consent or {}
        first_name = (evidence.get('users') or {}).get('first_name') or ''
        if not consent.get('consent_first_name'):
            first_name = ''

        quest_title = (evidence.get('quests') or {}).get('title') or ''
        task = evidence.get('user_quest_tasks') or {}
        task_title = task.get('title') or ''
        pillar = task.get('pillar') or ''
        evidence_text = (evidence.get('evidence_text_synthesized') or evidence.get('evidence_text') or '')[:1500]

        student_ref = first_name if first_name else 'a student'

        prompt = f"""You are a social-media copywriter for Optio, a learning platform whose
core philosophy is "the process is the goal" — celebrating present-focused learning
over future outcomes.

Write THREE short Instagram/X captions about the work below. Each caption must be
1–2 sentences, end with 1–3 relevant hashtags, and avoid hyperbole, em dashes, or AI cliches.

Refer to the student as: {student_ref}

Quest: {quest_title}
Task: {task_title}
Pillar: {pillar}
Student's reflection: {evidence_text}

Return STRICT JSON in this shape, no commentary:
{{"variants":[
  {{"tone":"educational","text":"..."}},
  {{"tone":"inspirational","text":"..."}},
  {{"tone":"punchy","text":"..."}}
]}}"""

        try:
            data = self.generate_json(prompt, temperature=0.8)
            variants = data.get('variants') if isinstance(data, dict) else None
            if not isinstance(variants, list) or not variants:
                raise AIGenerationError("Empty variants from model")
            # Normalize
            cleaned = []
            for v in variants[:3]:
                if isinstance(v, dict) and v.get('text'):
                    cleaned.append({'tone': v.get('tone', 'variant'), 'text': v['text'].strip()})
            if not cleaned:
                raise AIGenerationError("No usable variants returned")
            return cleaned
        except AIGenerationError:
            raise
        except Exception as e:
            logger.error(f"generate_captions failed: {e}")
            raise AIGenerationError("Caption generation failed")

    def generate_alt_text(self, evidence: Dict) -> str:
        """One short, accessible alt-text description for the evidence's image."""
        evidence_text = (evidence.get('evidence_text_synthesized') or evidence.get('evidence_text') or '')[:500]
        task_title = ((evidence.get('user_quest_tasks') or {}).get('title') or '')

        prompt = f"""Write one short alt-text description (one sentence, under 120 characters) for
an image that accompanies this learning evidence. Describe what is likely visible, neutrally.

Task: {task_title}
Reflection: {evidence_text}

Return only the alt-text sentence, no quotes."""

        try:
            text = self.generate(prompt, temperature=0.4, max_output_tokens=120)
            return (text or '').strip().strip('"').strip("'")
        except Exception as e:
            logger.error(f"generate_alt_text failed: {e}")
            raise AIGenerationError("Alt-text generation failed")

    def generate_quote_pull(self, evidence: Dict) -> Dict[str, str]:
        """Pull the strongest sentence from the reflection plus a short context line."""
        evidence_text = (evidence.get('evidence_text_synthesized') or evidence.get('evidence_text') or '')
        if not evidence_text or len(evidence_text) < 40:
            raise AIGenerationError("Evidence text too short for quote pull")

        task_title = ((evidence.get('user_quest_tasks') or {}).get('title') or '')

        prompt = f"""From the reflection below, extract the SINGLE strongest sentence that would
work as a pull-quote on social media. Then write a one-line caption-style context that
introduces it.

Task: {task_title}
Reflection: {evidence_text[:2000]}

Return STRICT JSON, no commentary:
{{"quote":"the verbatim sentence...","context":"one-line context..."}}"""

        try:
            data = self.generate_json(prompt, temperature=0.5)
            if not isinstance(data, dict) or not data.get('quote'):
                raise AIGenerationError("Empty quote pull")
            return {'quote': data['quote'].strip(), 'context': (data.get('context') or '').strip()}
        except AIGenerationError:
            raise
        except Exception as e:
            logger.error(f"generate_quote_pull failed: {e}")
            raise AIGenerationError("Quote-pull generation failed")
