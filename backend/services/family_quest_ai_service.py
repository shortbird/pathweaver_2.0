"""
Family Quest AI Service
=======================

Generates AI-powered family quest ideas by aggregating context from all children
in a family, combining it with parent preferences, and using Gemini to produce
personalized quest ideas with age-appropriate tasks per child.

Extends BaseAIService to inherit Gemini model access, retry logic, and JSON parsing.
"""

import json
from datetime import datetime, date
from typing import Dict, List, Optional, Any

from services.base_ai_service import BaseAIService
from database import get_supabase_admin_client
from prompts.components import (
    CORE_PHILOSOPHY,
    PILLAR_DEFINITIONS_DETAILED,
    FAMILY_QUEST_INSTRUCTIONS,
    JSON_OUTPUT_INSTRUCTIONS_STRICT,
    VALID_PILLARS,
    PILLAR_DISPLAY_NAMES,
)

from utils.logger import get_logger

logger = get_logger(__name__)


# XP ranges by age bracket
AGE_XP_RANGES = {
    'young': {'min': 50, 'max': 100, 'label': '5-7'},
    'middle': {'min': 75, 'max': 150, 'label': '8-10'},
    'tween': {'min': 100, 'max': 200, 'label': '11-13'},
    'teen': {'min': 150, 'max': 300, 'label': '14+'},
}


def _get_age_bracket(age: Optional[int]) -> str:
    """Get age bracket key from age."""
    if age is None or age < 5:
        return 'young'
    elif age <= 7:
        return 'young'
    elif age <= 10:
        return 'middle'
    elif age <= 13:
        return 'tween'
    else:
        return 'teen'


def _calculate_age(dob) -> Optional[int]:
    """Calculate age from date of birth string or date object."""
    if not dob:
        return None
    try:
        if isinstance(dob, str):
            dob = datetime.fromisoformat(dob.replace('Z', '+00:00')).date()
        elif isinstance(dob, datetime):
            dob = dob.date()
        today = date.today()
        age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        return age
    except Exception:
        return None


def _get_current_season() -> str:
    """Get current season based on date."""
    month = date.today().month
    if month in (3, 4, 5):
        return 'spring'
    elif month in (6, 7, 8):
        return 'summer'
    elif month in (9, 10, 11):
        return 'fall'
    else:
        return 'winter'


class FamilyQuestAIService(BaseAIService):
    """AI service for generating family quest ideas."""

    def aggregate_family_context(self, parent_id: str) -> Dict[str, Any]:
        """
        Collect data for ALL children linked to a parent.

        Queries dependents (managed_by_parent_id) and linked students
        (parent_student_links with approved status), then aggregates
        skill XP, interests, quest history, and profile info.

        Returns:
            Dict with 'children' list and 'family_summary'.
        """
        # admin client justified: service layer — called from multiple routes; access control is enforced by each calling route's decorators (@require_auth/@require_admin/etc.)
        supabase = get_supabase_admin_client()

        # Get dependents (under-13 managed accounts)
        dependents_resp = supabase.table('users').select(
            'id, display_name, date_of_birth, total_xp, level'
        ).eq('managed_by_parent_id', parent_id).execute()

        # Get linked students (13+ with approved link)
        links_resp = supabase.table('parent_student_links').select(
            'student_user_id'
        ).eq('parent_user_id', parent_id).eq('status', 'approved').execute()

        linked_ids = [link['student_user_id'] for link in (links_resp.data or [])]
        linked_students = []
        if linked_ids:
            linked_resp = supabase.table('users').select(
                'id, display_name, date_of_birth, total_xp, level'
            ).in_('id', linked_ids).execute()
            linked_students = linked_resp.data or []

        all_child_records = (dependents_resp.data or []) + linked_students
        if not all_child_records:
            return {'children': [], 'family_summary': {'child_count': 0}}

        children = []
        all_interests = []
        all_pillar_xp = {p: 0 for p in VALID_PILLARS}
        ages = []

        for child in all_child_records:
            child_id = child['id']
            age = _calculate_age(child.get('date_of_birth'))
            if age is not None:
                ages.append(age)

            # Pillar XP
            xp_resp = supabase.table('user_skill_xp').select(
                'pillar, xp_amount'
            ).eq('user_id', child_id).execute()
            pillar_xp = {}
            for row in (xp_resp.data or []):
                pillar_xp[row['pillar']] = row['xp_amount']
                all_pillar_xp[row['pillar']] = all_pillar_xp.get(row['pillar'], 0) + row['xp_amount']

            # Interest tracks
            interests_resp = supabase.table('interest_tracks').select(
                'name, description'
            ).eq('user_id', child_id).execute()
            child_interests = [
                {'name': i['name'], 'description': i.get('description', '')}
                for i in (interests_resp.data or [])
            ]
            all_interests.extend([i['name'] for i in child_interests])

            # Active/completed quests (to avoid duplicates)
            quests_resp = supabase.table('user_quests').select(
                'quests(title)'
            ).eq('user_id', child_id).in_(
                'status', ['active', 'completed']
            ).limit(20).execute()
            quest_titles = []
            for uq in (quests_resp.data or []):
                quest_data = uq.get('quests')
                if quest_data and quest_data.get('title'):
                    quest_titles.append(quest_data['title'])

            # Subject XP gaps
            subject_xp_resp = supabase.table('user_subject_xp').select(
                'school_subject, xp_amount'
            ).eq('user_id', child_id).execute()
            subject_xp = {row['school_subject']: row['xp_amount'] for row in (subject_xp_resp.data or [])}

            children.append({
                'id': child_id,
                'name': child.get('display_name', 'Child'),
                'age': age,
                'age_bracket': _get_age_bracket(age),
                'total_xp': child.get('total_xp', 0),
                'level': child.get('level', 1),
                'pillar_xp': pillar_xp,
                'interests': child_interests,
                'recent_quests': quest_titles[:10],
                'subject_xp': subject_xp,
            })

        # Family-level summary
        # Find shared interests (names appearing for multiple children)
        interest_counts = {}
        for name in all_interests:
            interest_counts[name.lower()] = interest_counts.get(name.lower(), 0) + 1
        shared_interests = [name for name, count in interest_counts.items() if count > 1]

        # Find pillar gaps (lowest total XP pillars)
        sorted_pillars = sorted(all_pillar_xp.items(), key=lambda x: x[1])
        pillar_gaps = [p[0] for p in sorted_pillars[:2]] if sorted_pillars else []

        family_summary = {
            'child_count': len(children),
            'age_range': f"{min(ages)}-{max(ages)}" if ages else 'unknown',
            'shared_interests': shared_interests,
            'pillar_gaps': pillar_gaps,
            'season': _get_current_season(),
        }

        return {'children': children, 'family_summary': family_summary}

    def generate_family_quest_ideas(
        self,
        family_context: Dict[str, Any],
        parent_preferences: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate 3 family quest ideas using AI.

        Args:
            family_context: Output from aggregate_family_context()
            parent_preferences: Dict with activity_type, time_commitment,
                theme_preference, focus_areas, constraints

        Returns:
            Dict with 'quest_ideas' list (3 ideas)
        """
        children = family_context.get('children', [])
        summary = family_context.get('family_summary', {})

        # Build children context for prompt
        children_desc = []
        for child in children:
            interests_str = ', '.join([i['name'] for i in child.get('interests', [])]) or 'none recorded'
            quests_str = ', '.join(child.get('recent_quests', [])[:5]) or 'none yet'

            pillar_str = ', '.join([
                f"{PILLAR_DISPLAY_NAMES.get(p, p)}: {xp}xp"
                for p, xp in child.get('pillar_xp', {}).items()
                if xp > 0
            ]) or 'just starting'

            age_str = f"{child['age']} years old" if child.get('age') else 'age unknown'
            bracket = AGE_XP_RANGES.get(child.get('age_bracket', 'middle'), AGE_XP_RANGES['middle'])

            children_desc.append(
                f"- {child['name']} ({age_str}, Level {child.get('level', 1)})\n"
                f"  Interests: {interests_str}\n"
                f"  Pillar XP: {pillar_str}\n"
                f"  Recent quests: {quests_str}\n"
                f"  XP range for tasks: {bracket['min']}-{bracket['max']}"
            )

        children_text = '\n'.join(children_desc)

        # Parent preferences
        activity_types = parent_preferences.get('activity_types', parent_preferences.get('activity_type', ['any']))
        if isinstance(activity_types, str):
            activity_types = [activity_types]
        time_commitment = parent_preferences.get('time_commitment', 'afternoon')
        theme = parent_preferences.get('theme_preference', '')
        focus_areas = parent_preferences.get('focus_areas', [])
        constraints = parent_preferences.get('constraints', '')

        activity_str = ', '.join(activity_types) if activity_types else 'any'
        focus_str = ', '.join(focus_areas) if focus_areas else 'any pillars'

        prompt = f"""{CORE_PHILOSOPHY}

{PILLAR_DEFINITIONS_DETAILED}

{FAMILY_QUEST_INSTRUCTIONS}

--- FAMILY CONTEXT ---
Current season: {summary.get('season', 'unknown')} (for reference only -- do NOT make every idea seasonal)
Number of children: {summary.get('child_count', 0)}
Age range: {summary.get('age_range', 'unknown')}
Shared interests across children: {', '.join(summary.get('shared_interests', [])) or 'none identified'}
Pillar areas needing growth: {', '.join(summary.get('pillar_gaps', [])) or 'balanced'}

CHILDREN:
{children_text}
--- END FAMILY CONTEXT ---

--- PARENT PREFERENCES ---
Activity types: {activity_str}
Time commitment: {time_commitment}
Theme/idea: {theme or 'open to suggestions'}
Focus pillars: {focus_str}
Constraints: {constraints or 'none'}
--- END PARENT PREFERENCES ---

Generate exactly 3 family quest ideas. Each idea should be distinct in theme and approach.
Avoid duplicating any quests the children have already done (listed above).
At most ONE of the three ideas may be season-themed. The others should be year-round activities.

{JSON_OUTPUT_INSTRUCTIONS_STRICT}

Return a JSON object with this exact structure:
{{
  "quest_ideas": [
    {{
      "title": "Quest title (creative, engaging, 3-8 words)",
      "description": "2-3 sentence description of the quest experience",
      "estimated_time": "e.g. 2-3 hours",
      "activity_type": "outdoor|indoor|creative|educational|physical|cooking|community_service",
      "interest_bridge": "1 sentence explaining how this connects children's different interests",
      "pillar_coverage": ["pillar1", "pillar2"],
      "shared_tasks": [
        {{
          "title": "Task title (generic, no child names)",
          "description": "What to do and why it matters (no child names)",
          "pillar": "one of: stem, wellness, communication, civics, art",
          "xp_value": 100
        }}
      ],
      "individual_tasks": {{
        "<child_name>": [
          {{
            "title": "Task title (generic, no child names)",
            "description": "What to do (no child names)",
            "pillar": "one of: stem, wellness, communication, civics, art",
            "xp_value": 100
          }}
        ]
      }}
    }}
  ]
}}

CRITICAL RULES:
- Use exact child names from the context above ONLY as keys in individual_tasks (for grouping)
- NEVER put a child's name inside any task title or task description. Tasks must read naturally
  without names, just like any other task on the platform (e.g. "Draw a map of the neighborhood"
  not "Jane draws a map of the neighborhood")
- Quest titles and descriptions must also NOT reference children by name
- Use only valid pillar values: stem, wellness, communication, civics, art
- XP values must match each child's age-appropriate range listed above
- Each quest must have 1-2 shared tasks AND 1-2 individual tasks per child
- Make tasks specific and actionable, not vague
"""

        result = self.generate_json(
            prompt,
            generation_config_preset='creative_generation',
            strict=False
        )

        if not result or 'quest_ideas' not in result:
            logger.error(f"AI did not return expected quest_ideas structure: {type(result)}")
            return {'quest_ideas': []}

        # Validate and clean up results
        ideas = result['quest_ideas']
        for idea in ideas:
            # Ensure pillar values are valid
            if 'pillar_coverage' in idea:
                idea['pillar_coverage'] = [
                    p for p in idea['pillar_coverage'] if p in VALID_PILLARS
                ]
            for task in idea.get('shared_tasks', []):
                if task.get('pillar') not in VALID_PILLARS:
                    task['pillar'] = 'stem'
            for child_name, tasks in idea.get('individual_tasks', {}).items():
                for task in tasks:
                    if task.get('pillar') not in VALID_PILLARS:
                        task['pillar'] = 'stem'

        return {'quest_ideas': ideas[:3]}

    def refine_quest_idea(
        self,
        quest_idea: Dict[str, Any],
        feedback: str,
        family_context: Dict[str, Any],
        parent_preferences: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Refine a selected quest idea based on parent feedback.

        Args:
            quest_idea: The original quest idea dict
            feedback: Parent's text feedback
            family_context: Output from aggregate_family_context()
            parent_preferences: Original parent preferences

        Returns:
            Dict with single 'refined_idea'
        """
        children = family_context.get('children', [])
        children_names = [c['name'] for c in children]
        children_ages = {
            c['name']: f"{c['age']} years old ({c['age_bracket']})"
            for c in children if c.get('age')
        }

        prompt = f"""{CORE_PHILOSOPHY}

{FAMILY_QUEST_INSTRUCTIONS}

--- ORIGINAL QUEST IDEA ---
{json.dumps(quest_idea, indent=2)}
--- END ORIGINAL IDEA ---

--- CHILDREN ---
{json.dumps(children_ages, indent=2)}
--- END CHILDREN ---

--- PARENT FEEDBACK ---
{feedback}
--- END FEEDBACK ---

Refine the quest idea above based on the parent's feedback.
Keep the same general structure but adjust per the feedback.
Maintain age-appropriate XP values and valid pillar assignments.

{JSON_OUTPUT_INSTRUCTIONS_STRICT}

Return a JSON object with this exact structure:
{{
  "refined_idea": {{
    "title": "...",
    "description": "...",
    "estimated_time": "...",
    "activity_type": "...",
    "interest_bridge": "...",
    "pillar_coverage": ["..."],
    "shared_tasks": [
      {{
        "title": "...",
        "description": "...",
        "pillar": "...",
        "xp_value": 100
      }}
    ],
    "individual_tasks": {{
      "<child_name>": [
        {{
          "title": "...",
          "description": "...",
          "pillar": "...",
          "xp_value": 100
        }}
      ]
    }}
  }}
}}

Use exact child names: {', '.join(children_names)}
Valid pillars: stem, wellness, communication, civics, art
"""

        result = self.generate_json(
            prompt,
            generation_config_preset='creative_generation',
            strict=False
        )

        if not result or 'refined_idea' not in result:
            logger.error(f"AI did not return expected refined_idea structure")
            return {'refined_idea': quest_idea}

        idea = result['refined_idea']

        # Validate pillars
        if 'pillar_coverage' in idea:
            idea['pillar_coverage'] = [
                p for p in idea['pillar_coverage'] if p in VALID_PILLARS
            ]
        for task in idea.get('shared_tasks', []):
            if task.get('pillar') not in VALID_PILLARS:
                task['pillar'] = 'stem'
        for child_name, tasks in idea.get('individual_tasks', {}).items():
            for task in tasks:
                if task.get('pillar') not in VALID_PILLARS:
                    task['pillar'] = 'stem'

        return {'refined_idea': idea}
