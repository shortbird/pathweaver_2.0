"""
AI bounty drafting for parents (and other bounty posters).

Parents asked for help writing bounties: the create form demands a title,
description, deliverables, a pillar and an XP value, and translating "I want
Leo to practice piano without me nagging" into that structure is the hard part.
This service does the translation and hands back 2-3 complete bounty ideas.

Propose-only, same rule as the SIS quest drafts (quest_ai_service
.draft_quest_from_context): NOTHING is written here. The ideas fill the same
create form the poster would otherwise type into, and POST /api/bounties stays
the single creation path — a human approves every word before it can reach a
student.
"""

from typing import Any, Dict, List, Optional

from app_config import Config
from services.base_ai_service import (
    BaseAIService, AIParsingError, AIServiceOverloadedError,
)
from services.bounty_service import (
    VALID_PILLARS, MIN_XP_REWARD, MAX_XP_REWARD,
)
from prompts.components import CORE_PHILOSOPHY, JSON_OUTPUT_INSTRUCTIONS
from utils.logger import get_logger

logger = get_logger(__name__)

# Same spirit as routes/demo.py's input screen: bounty prompts are written by
# adults but the output is for kids, so obviously inappropriate input never
# reaches the model. Kept local — importing a route module into a service
# inverts the layering.
BLOCKED_WORDS = [
    'porn', 'sex', 'nude', 'naked', 'xxx', 'nsfw',
    'kill', 'murder', 'bomb', 'terrorist', 'weapon',
    'nazi', 'kkk', 'racist',
    'cocaine', 'heroin', 'meth', 'drug dealer',
    'suicide', 'self-harm', 'anorexia',
]

IDEA_COUNT = 3
MAX_DELIVERABLES = 4


def input_appropriate(text: str) -> bool:
    """Whether the poster's free text is safe to send to the model."""
    text_lower = (text or '').lower()
    return not any(word in text_lower for word in BLOCKED_WORDS)


class BountyAIService(BaseAIService):
    """Drafts bounty ideas from a poster's plain-language intent."""

    def draft_bounty_ideas(self, prompt_text: str, reward_hint: str = '',
                           child_context: str = '') -> Dict[str, Any]:
        """Turn a parent's one-sentence intent into complete bounty ideas.

        Returns {'success': bool, 'ideas': [...], 'error': str|None}. Each idea
        is exactly the shape the create form holds (title, description,
        deliverables[{text}], pillar, rewards[]), so a chosen idea round-trips
        through the existing form and BountyService.create_bounty untouched.
        """
        prompt_text = (prompt_text or '').strip()
        if not prompt_text:
            return {'success': False, 'error': 'Tell us what you want to happen first', 'ideas': []}
        if not input_appropriate(prompt_text) or not input_appropriate(child_context):
            # Same posture as the demo generator: decline quietly rather than
            # argue with the input.
            return {'success': False,
                    'error': 'Could not build bounty ideas from that. Try describing the activity differently.',
                    'ideas': []}

        pillars = ', '.join(VALID_PILLARS)
        reward_line = ''
        hint = (reward_hint or '').strip().lower()
        if hint == 'custom':
            reward_line = ("\nREWARDS: the poster prefers a real-world reward over XP. Give each idea "
                           "ONE custom reward — a short, family-realistic treat or privilege "
                           "(e.g. \"Pick the movie for family night\") — in rewards as "
                           "{\"type\": \"custom\", \"text\": str}, plus one modest XP reward.")
        elif hint and hint != 'xp':
            reward_line = (f"\nREWARDS: the poster suggested this reward — use it (tidied up) as a "
                           f"custom reward on each idea, plus one XP reward: \"{hint[:200]}\"")

        child_line = ''
        if (child_context or '').strip():
            child_line = f"\nABOUT THE KID (fit the ideas to them): {child_context.strip()[:500]}"

        prompt = f"""
You are helping a parent turn what they want for their kid into Optio "bounties" —
small real-world challenges a kid completes for rewards.

{CORE_PHILOSOPHY}

WHAT THE PARENT WANTS (authoritative — build from THIS):
\"\"\"
{prompt_text[:Config.AI_SOURCE_MATERIAL_MAX_CHARS]}
\"\"\"
{child_line}
Produce exactly {IDEA_COUNT} DIFFERENT bounty ideas. Vary the angle (a streak, a
project, a challenge) rather than rewording one idea three ways. Each idea:
- title: 3-8 words, concrete, inviting, no colons
- description: 2-3 sentences telling the KID what to do and why it's worth doing.
  Speak to the kid, not about them.
- deliverables: 2-{MAX_DELIVERABLES} items. Each is OBSERVABLE EVIDENCE the kid can capture
  on a phone — a photo of a finished thing, a voice memo, a short video, a note.
  Phrase each as the evidence itself ("Photo of the finished shelf"), not as an
  instruction ("Clean the shelf"). This is how the parent will know it's done.
- pillar: one of [{pillars}] — whichever fits the activity best
- rewards: at least one XP reward: {{"type": "xp", "value": int, "pillar": <same pillar>}}.
  value is {MIN_XP_REWARD}-{MAX_XP_REWARD}, a MULTIPLE OF 25, scaled to real effort
  (a week-long project earns more than an afternoon).{reward_line}

READING LEVEL: 5th-6th grade. The challenge may be hard; the words must be easy.
No grades, no deadlines, no punishments, no comparisons to siblings.

{JSON_OUTPUT_INSTRUCTIONS}
Return a single JSON object: {{"ideas": [{{"title": str, "description": str,
"deliverables": [str], "pillar": str, "rewards": [...]}}]}}
"""

        try:
            data = self.generate_json(
                prompt,
                generation_config_preset='structured_output',
                # Thinking tokens share this budget (see quest_ai_service's note
                # on the Sentry OPTIO-BACKEND-65..6E truncations).
                max_output_tokens=8192,
                strict=True,
            )
        except AIParsingError as e:
            logger.error(f'Bounty draft: model answer unreadable: {e}')
            return {'success': False,
                    'error': "The AI's answer got cut off. Try again, or describe what you want in fewer words.",
                    'ideas': []}
        except AIServiceOverloadedError:
            raise  # the route turns this into a friendly 503
        except Exception as e:
            logger.error(f'Bounty draft generation failed: {e}')
            return {'success': False, 'error': 'Could not build bounty ideas from that.', 'ideas': []}

        raw_ideas = data.get('ideas') if isinstance(data, dict) else data
        ideas = self._normalize_ideas(raw_ideas)
        if not ideas:
            return {'success': False,
                    'error': 'Could not build bounty ideas from that. Try adding a little more detail.',
                    'ideas': []}
        return {'success': True, 'ideas': ideas, 'error': None}

    @classmethod
    def _normalize_ideas(cls, raw_ideas: Any) -> List[Dict[str, Any]]:
        """Coerce model output into exactly what create_bounty accepts.

        The form is the contract: clamp and snap XP so every value is one the
        poster could have picked in the form's own 25-step picker, validate the
        pillar, cap lengths, drop anything unusable. A draft that would trip
        create_bounty's ValidationErrors must not leave this function.
        """
        if not isinstance(raw_ideas, list):
            return []
        ideas = []
        for raw in raw_ideas[:IDEA_COUNT]:
            if not isinstance(raw, dict):
                continue
            title = str(raw.get('title') or '').strip()
            description = str(raw.get('description') or '').strip()
            if not title or not description:
                continue
            if not input_appropriate(f"{title} {description}"):
                continue

            pillar = str(raw.get('pillar') or '').strip().lower()
            if pillar not in VALID_PILLARS:
                pillar = 'wellness'

            deliverables = []
            for d in (raw.get('deliverables') or [])[:MAX_DELIVERABLES]:
                text = str(d.get('text') if isinstance(d, dict) else d or '').strip()
                if text and input_appropriate(text):
                    deliverables.append({'text': text[:300]})
            if not deliverables:
                continue

            rewards = []
            for r in (raw.get('rewards') or []):
                if not isinstance(r, dict):
                    continue
                if r.get('type') == 'xp':
                    try:
                        xp = int(r.get('value') or 0)
                    except (TypeError, ValueError):
                        xp = 50
                    xp = max(MIN_XP_REWARD, min(MAX_XP_REWARD, round(xp / 25) * 25))
                    rewards.append({'type': 'xp', 'value': xp,
                                    'pillar': r.get('pillar') if r.get('pillar') in VALID_PILLARS else pillar})
                elif r.get('type') == 'custom':
                    text = str(r.get('text') or '').strip()
                    if text and input_appropriate(text):
                        rewards.append({'type': 'custom', 'text': text[:300]})
            if not any(r.get('type') == 'xp' for r in rewards):
                rewards.insert(0, {'type': 'xp', 'value': 50, 'pillar': pillar})
            # One XP reward per idea is plenty for a draft; total stays far under
            # the 500 total-XP ceiling create_bounty enforces.
            rewards = rewards[:3]

            ideas.append({
                'title': title[:200],
                'description': description[:1000],
                'deliverables': deliverables,
                'pillar': pillar,
                'rewards': rewards,
            })
        return ideas


def get_bounty_ai_service() -> BountyAIService:
    return BountyAIService()
