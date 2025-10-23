import os
import json
import google.generativeai as genai
from typing import Dict, Any, Optional

from utils.logger import get_logger

logger = get_logger(__name__)

class QuestCompletionService:
    def __init__(self):
        api_key = os.getenv('GEMINI_API_KEY')
        if not api_key:
            raise ValueError("GEMINI_API_KEY not found in environment variables")
        
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-1.5-flash')
        
    def complete_quest(self, partial_quest: Dict[str, Any]) -> Dict[str, Any]:
        """Complete a partially filled quest form using AI"""
        
        system_prompt = """You are an educational quest designer creating engaging learning experiences for teens (13-18).
Your task is to complete a quest creation form using the Visual Quest Framework with Diploma Pillars.

DIPLOMA PILLARS (primary_pillar must be one of these exact values):
- creativity: Artistic Expression, Design Thinking, Innovation, Problem-Solving
- critical_thinking: Analysis & Research, Logic & Reasoning, Systems Thinking, Evidence-Based Decision Making  
- practical_skills: Life Skills, Technical Skills, Financial Literacy, Health & Wellness
- communication: Writing & Storytelling, Public Speaking, Digital Communication, Active Listening
- cultural_literacy: Global Awareness, History & Context, Empathy & Perspective-Taking, Community Engagement

PILLAR ICONS (use these emojis for primary_pillar_icon):
- creativity: 🎨
- critical_thinking: 🧠
- practical_skills: 🔧
- communication: 💬
- cultural_literacy: 🌍

INTENSITY LEVELS:
- light: 1-2 hours total, minimal preparation
- moderate: 3-5 hours total, some planning needed
- intensive: 6+ hours total, significant commitment

IMPORTANT RULES:
1. Keep existing field values unchanged - only fill in missing fields
2. Focus on the learning journey and process, not just outcomes
3. Create clear, actionable mission steps (3-5 steps)
4. Deliverables should be tangible things learners create
5. Evidence should document the learning process

Return a valid JSON object with EXACTLY this structure:
{
  "title": "string",
  "big_idea": "string - main description of the quest",
  "what_youll_create": ["array of tangible deliverables"],
  "primary_pillar": "creativity|critical_thinking|practical_skills|communication|cultural_literacy",
  "primary_pillar_icon": "emoji matching the pillar",
  "intensity": "light|moderate|intensive",
  "estimated_time": "string like '2-3 hours' or '1 week'",
  "your_mission": ["array of mission steps"],
  "showcase_your_journey": "string - how to document/evidence the journey",
  "helpful_resources": {
    "tools": ["array of tools needed"],
    "materials": ["array of materials needed"],
    "links": ["array of helpful links"]
  },
  "core_competencies": ["array of skills practiced"],
  "collaboration_spark": "string - ideas for working with others",
  "real_world_bonus": [
    {"description": "bonus challenge", "xp_amount": 50}
  ],
  "heads_up": "string - safety or important considerations",
  "location": "string - where to do this quest",
  "skill_xp_awards": [
    {"skill_category": "pillar_name", "xp_amount": number}
  ],
  "total_xp": number,
  "collaboration_bonus": "2x XP when working with others",
  "quest_banner_image": null
}"""

        user_prompt = f"""Complete this partially filled quest form. Keep all existing values unchanged and intelligently fill in missing fields:

EXISTING DATA:
{json.dumps(partial_quest, indent=2)}

Create a cohesive quest that:
1. Builds on the existing information
2. Has 3-5 clear mission steps in "your_mission" array
3. Lists 2-4 tangible things to create in "what_youll_create"
4. Includes process-focused evidence requirements in "showcase_your_journey"
5. Assigns primary XP (50-200) to the primary pillar
6. May include secondary XP awards to related pillars
7. Suggests helpful resources (tools, materials, links)
8. Adds collaboration ideas and optional real-world bonuses

IMPORTANT: For "your_mission" array, write each step as a direct action statement WITHOUT numbering or "Step X:" prefix.
Good example: ["Research different birdhouse designs", "Create a construction plan", "Build the birdhouse"]
Bad example: ["Step 1: Research designs", "Step 2: Create plan", "Step 3: Build"]

Return ONLY a valid JSON object with all quest fields completed. Ensure all arrays are properly formatted and all values are appropriate types."""

        try:
            response = self.model.generate_content(
                system_prompt + "\n\n" + user_prompt,
                generation_config={
                    'temperature': 0.7,
                    'top_p': 0.9,
                    'max_output_tokens': 2048,
                }
            )
            
            # Parse the response
            response_text = response.text.strip()
            
            # Clean up the response if needed (remove markdown code blocks)
            if response_text.startswith('```'):
                response_text = response_text.split('```')[1]
                if response_text.startswith('json'):
                    response_text = response_text[4:]
                response_text = response_text.strip()
            if response_text.endswith('```'):
                response_text = response_text[:-3].strip()
            
            completed_quest = json.loads(response_text)
            
            # Merge with original data (preserve existing values)
            for key, value in partial_quest.items():
                if value is not None and value != "" and value != [] and value != {}:
                    completed_quest[key] = value
            
            # Ensure required fields exist
            if 'title' not in completed_quest or not completed_quest['title']:
                completed_quest['title'] = partial_quest.get('title', 'Untitled Quest')
            
            if 'big_idea' not in completed_quest or not completed_quest['big_idea']:
                completed_quest['big_idea'] = f"Explore and learn through: {completed_quest['title']}"
            
            if 'showcase_your_journey' not in completed_quest or not completed_quest['showcase_your_journey']:
                completed_quest['showcase_your_journey'] = "Document your learning process with photos, written reflections, or videos showing your work and discoveries."
            
            # Ensure arrays are properly initialized
            if 'what_youll_create' not in completed_quest or not completed_quest['what_youll_create']:
                completed_quest['what_youll_create'] = ["Your completed project", "Documentation of your learning journey"]
            
            if 'your_mission' not in completed_quest or not completed_quest['your_mission']:
                completed_quest['your_mission'] = ["Research and plan your approach", "Create your project", "Document and reflect on your learning"]
            else:
                # Clean up mission steps - remove "Step X:" prefix if present
                cleaned_mission = []
                for step in completed_quest['your_mission']:
                    if isinstance(step, str):
                        # Remove "Step 1:", "Step 2:", etc. from the beginning
                        import re
                        cleaned_step = re.sub(r'^Step\s*\d+\s*:\s*', '', step)
                        cleaned_mission.append(cleaned_step)
                    else:
                        cleaned_mission.append(step)
                completed_quest['your_mission'] = cleaned_mission
            
            # Set pillar icon based on primary pillar
            pillar_icons = {
                'creativity': '🎨',
                'critical_thinking': '🧠', 
                'practical_skills': '🔧',
                'communication': '💬',
                'cultural_literacy': '🌍'
            }
            if 'primary_pillar' in completed_quest:
                completed_quest['primary_pillar_icon'] = pillar_icons.get(completed_quest['primary_pillar'], '⭐')
            
            # Ensure skill_xp_awards has the primary pillar
            if 'skill_xp_awards' in completed_quest and 'primary_pillar' in completed_quest:
                has_primary = any(award['skill_category'] == completed_quest['primary_pillar'] 
                                 for award in completed_quest['skill_xp_awards'])
                if not has_primary:
                    # Add primary pillar XP
                    base_xp = {'light': 50, 'moderate': 100, 'intensive': 200}
                    xp_amount = base_xp.get(completed_quest.get('intensity', 'moderate'), 100)
                    completed_quest['skill_xp_awards'].insert(0, {
                        'skill_category': completed_quest['primary_pillar'],
                        'xp_amount': xp_amount
                    })
            
            # Calculate total XP
            if 'skill_xp_awards' in completed_quest:
                completed_quest['total_xp'] = sum(award['xp_amount'] for award in completed_quest['skill_xp_awards'])
            
            # Ensure helpful_resources has the right structure
            if 'helpful_resources' not in completed_quest:
                completed_quest['helpful_resources'] = {'tools': [], 'materials': [], 'links': []}
            elif not isinstance(completed_quest['helpful_resources'], dict):
                completed_quest['helpful_resources'] = {'tools': [], 'materials': [], 'links': []}
            
            # Set default values for optional fields
            if 'collaboration_bonus' not in completed_quest:
                completed_quest['collaboration_bonus'] = '2x XP when working with others'
            
            
            return completed_quest
            
        except Exception as e:
            logger.error(f"Error in AI quest completion: {str(e)}")
            # Return the original data with minimal required fields
            result = partial_quest.copy()
            if 'title' not in result:
                result['title'] = 'New Quest'
            if 'big_idea' not in result:
                result['big_idea'] = 'Quest description needed'
            if 'showcase_your_journey' not in result:
                result['showcase_your_journey'] = 'Evidence requirements needed'
            if 'what_youll_create' not in result:
                result['what_youll_create'] = []
            if 'your_mission' not in result:
                result['your_mission'] = []
            if 'primary_pillar' not in result:
                result['primary_pillar'] = 'creativity'
            if 'intensity' not in result:
                result['intensity'] = 'moderate'
            return result