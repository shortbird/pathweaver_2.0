import os
import json
import google.generativeai as genai
from typing import Dict, Any, Optional

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
Your task is to complete a quest creation form by filling in missing fields based on provided context.

IMPORTANT RULES:
1. Keep existing field values unchanged - only fill in missing fields
2. Ensure all content is age-appropriate and educational
3. Focus on process over outcomes - the learning journey matters most
4. Evidence requirements should document the learning process, not just final results
5. Create clear, actionable, and achievable tasks

SKILL CATEGORIES for XP (use these exact values):
- reading_writing: Language arts, communication, documentation
- thinking_skills: Logic, problem-solving, critical thinking, analysis
- personal_growth: Self-awareness, emotional intelligence, leadership
- life_skills: Practical abilities, health, finance, cooking, organization
- making_creating: Arts, crafts, building, design, creativity
- world_understanding: Science, history, culture, geography, current events

DIFFICULTY LEVELS:
- beginner: New to the topic, minimal prerequisites
- intermediate: Some experience needed, moderate complexity
- advanced: Significant experience required, complex challenges

EFFORT LEVELS:
- light: 1-2 hours total, minimal preparation
- moderate: 3-5 hours total, some planning needed
- intensive: 6+ hours total, significant commitment

EVIDENCE TYPES (choose appropriate ones):
- photo: Visual documentation of process/results
- video: Recording of activities or explanations
- written: Journal entries, reports, reflections
- audio: Podcasts, interviews, narrations
- link: Online resources, portfolios, projects
- file: Documents, code, designs

Return a valid JSON object with EXACTLY this structure:
{
  "title": "string",
  "description": "string",
  "evidence_requirements": "string",
  "difficulty_level": "beginner|intermediate|advanced",
  "effort_level": "light|moderate|intensive",
  "estimated_hours": number,
  "accepted_evidence_types": ["photo", "video", "written", etc],
  "example_submissions": ["string", ...],
  "core_skills": ["string", ...],
  "resources_needed": "string",
  "location_requirements": "string",
  "optional_challenges": ["string", ...],
  "safety_considerations": "string",
  "requires_adult_supervision": boolean,
  "collaboration_ideas": "string",
  "skill_xp_awards": [
    {"skill_category": "reading_writing|thinking_skills|etc", "xp_amount": number}
  ]
}"""

        user_prompt = f"""Complete this partially filled quest form. Keep all existing values unchanged and intelligently fill in missing fields:

EXISTING DATA:
{json.dumps(partial_quest, indent=2)}

Create a cohesive quest that:
1. Builds on the existing information
2. Has clear learning objectives
3. Includes process-focused evidence requirements
4. Assigns appropriate XP (10-50 per category, total 50-200)
5. Suggests 3-5 core skills relevant to the quest
6. Adds helpful optional fields when relevant

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
                if value is not None and value != "" and value != []:
                    completed_quest[key] = value
            
            # Ensure required fields exist
            if 'title' not in completed_quest or not completed_quest['title']:
                completed_quest['title'] = partial_quest.get('title', 'Untitled Quest')
            
            if 'description' not in completed_quest or not completed_quest['description']:
                completed_quest['description'] = f"Complete the quest: {completed_quest['title']}"
            
            if 'evidence_requirements' not in completed_quest or not completed_quest['evidence_requirements']:
                completed_quest['evidence_requirements'] = "Document your learning process with photos, written reflections, or other evidence showing your work."
            
            # Ensure skill_xp_awards is properly formatted
            if 'skill_xp_awards' in completed_quest:
                valid_categories = ['reading_writing', 'thinking_skills', 'personal_growth', 
                                  'life_skills', 'making_creating', 'world_understanding']
                completed_quest['skill_xp_awards'] = [
                    award for award in completed_quest['skill_xp_awards']
                    if award.get('skill_category') in valid_categories
                ]
            
            return completed_quest
            
        except Exception as e:
            print(f"Error in AI quest completion: {str(e)}")
            # Return the original data with minimal required fields
            result = partial_quest.copy()
            if 'title' not in result:
                result['title'] = 'New Quest'
            if 'description' not in result:
                result['description'] = 'Quest description needed'
            if 'evidence_requirements' not in result:
                result['evidence_requirements'] = 'Evidence requirements needed'
            return result