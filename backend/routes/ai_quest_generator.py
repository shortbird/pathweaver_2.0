from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth_utils import require_admin
import os
import json
import httpx
from datetime import datetime
import google.generativeai as genai

bp = Blueprint('ai_quest_generator', __name__)

# Skill categories and their associated skills
SKILL_CATEGORIES = {
    'reading_writing': ['reading', 'writing', 'speaking', 'digital_media', 'math_data'],
    'thinking_skills': ['critical_thinking', 'creative_thinking', 'research', 'information_literacy', 'systems_thinking', 'decision_making'],
    'personal_growth': ['learning_reflection', 'emotional_skills', 'grit', 'time_management'],
    'life_skills': ['money_skills', 'health_fitness', 'home_skills', 'tech_skills', 'citizenship'],
    'making_creating': ['building', 'art', 'scientific_method', 'coding', 'business_thinking'],
    'world_understanding': ['cultural_awareness', 'history', 'environment', 'teamwork', 'ethics_philosophy']
}

def generate_quest_prompt(existing_titles, theme=None):
    """Generate a prompt for AI to create quests"""
    
    existing_titles_str = '\n'.join([f"- {title}" for title in existing_titles]) if existing_titles else "None"
    
    prompt = f"""You are a creative educational quest designer for high school students using a self-directed learning platform.

Create exactly 5 unique, engaging quests that help students develop real-world skills.

EXISTING QUESTS TO AVOID (don't create similar titles):
{existing_titles_str}

{"THEME: " + theme if theme else ""}

For each quest, provide the following in valid JSON format:
{{
  "title": "Engaging title (max 100 chars)",
  "description": "Detailed description of what the student will do and learn (200-300 chars)",
  "difficulty_level": "beginner" | "intermediate" | "advanced",
  "effort_level": "light" | "moderate" | "intensive",
  "estimated_hours": number between 1-50,
  "evidence_requirements": "Clear description of what students must submit as proof of completion",
  "accepted_evidence_types": ["photo", "video", "written", "project_link", "presentation", "artifact", "certificate"],
  "example_submissions": "Examples of good evidence submissions",
  "core_skills": [list of 3-5 skills from: reading, writing, speaking, digital_media, math_data, critical_thinking, creative_thinking, research, information_literacy, systems_thinking, decision_making, learning_reflection, emotional_skills, grit, time_management, money_skills, health_fitness, home_skills, tech_skills, citizenship, building, art, scientific_method, coding, business_thinking, cultural_awareness, history, environment, teamwork, ethics_philosophy],
  "skill_xp_awards": [
    {{
      "skill_category": "category_name",
      "xp_amount": number between 25-300
    }}
  ],
  "resources_needed": "Materials or tools needed (optional, can be empty string)",
  "location_requirements": "Where this can be done (optional, can be empty string)",
  "safety_considerations": "Any safety notes (optional, can be empty string)",
  "requires_adult_supervision": boolean,
  "optional_challenges": [
    {{
      "description": "Bonus challenge description",
      "skill_category": "category_name",
      "xp_amount": number between 10-50
    }}
  ]
}}

Guidelines:
- Make quests practical and achievable for teenagers
- Focus on real-world application of skills
- Vary the difficulty and effort levels across the 5 quests
- Include at least 2-3 skill categories per quest
- Total XP should be proportional to effort and hours
- Make them engaging and relevant to modern students
- Include diverse types of activities (physical, creative, intellectual, social)
- Ensure titles are unique and don't overlap with existing quests

Return a JSON array with exactly 5 quest objects."""
    
    return prompt

@bp.route('/generate', methods=['POST'])
@require_admin
def generate_quests(user_id):
    """Generate 5 quest suggestions using AI"""
    data = request.json
    theme = data.get('theme', '')
    existing_titles = data.get('existing_titles', [])
    
    # Get API key from environment - prioritize Gemini
    gemini_key = os.getenv('GEMINI_API_KEY')
    openai_key = os.getenv('OPENAI_API_KEY')
    anthropic_key = os.getenv('ANTHROPIC_API_KEY')
    
    try:
        # Try Gemini first
        if gemini_key:
            quests = call_gemini_api(existing_titles, theme)
        # Try OpenAI
        elif openai_key:
            quests = call_openai_api(existing_titles, theme)
        # Try Anthropic
        elif anthropic_key:
            quests = call_anthropic_api(existing_titles, theme)
        else:
            # Fallback to generating sample quests without AI
            return jsonify({
                'quests': generate_sample_quests(existing_titles),
                'source': 'sample'
            }), 200
            
        return jsonify({
            'quests': quests,
            'source': 'ai'
        }), 200
        
    except Exception as e:
        print(f"AI generation error: {str(e)}")
        # Fallback to sample quests
        return jsonify({
            'quests': generate_sample_quests(existing_titles),
            'source': 'sample',
            'error': str(e)
        }), 200

def call_gemini_api(existing_titles, theme):
    """Call Gemini API to generate quests"""
    api_key = os.getenv('GEMINI_API_KEY')
    
    if not api_key:
        print("ERROR: GEMINI_API_KEY not found in environment variables")
        raise ValueError("GEMINI_API_KEY not configured")
    
    print(f"Using Gemini API with key: {api_key[:10]}...")
    genai.configure(api_key=api_key)
    
    # Use Gemini 1.5 Flash model (faster and more cost-effective)
    model = genai.GenerativeModel('gemini-1.5-flash')
    
    prompt = generate_quest_prompt(existing_titles, theme)
    
    # Add instruction to return only JSON
    prompt += "\n\nIMPORTANT: Return ONLY the JSON array with no additional text, markdown formatting, or explanation."
    
    try:
        print(f"Sending prompt to Gemini API...")
        response = model.generate_content(prompt)
        content = response.text
        print(f"Gemini API response received, length: {len(content)}")
        
        # Clean up the response - remove markdown code blocks if present
        if '```json' in content:
            content = content.split('```json')[1].split('```')[0]
        elif '```' in content:
            content = content.split('```')[1].split('```')[0]
        
        # Parse JSON
        quests = json.loads(content.strip())
        
        # Ensure it's a list
        if isinstance(quests, dict) and 'quests' in quests:
            quests = quests['quests']
        
        print(f"Successfully parsed {len(quests)} quests from Gemini API")
        return quests[:5]  # Ensure we only return 5 quests
        
    except Exception as e:
        print(f"Gemini API error: {str(e)}")
        print(f"Error type: {type(e).__name__}")
        # If Gemini fails, fall back to sample quests
        return generate_sample_quests(existing_titles)

def call_openai_api(existing_titles, theme):
    """Call OpenAI API to generate quests"""
    import openai
    
    openai.api_key = os.getenv('OPENAI_API_KEY')
    
    prompt = generate_quest_prompt(existing_titles, theme)
    
    response = openai.ChatCompletion.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": "You are a helpful assistant that generates educational quests in JSON format."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.8,
        max_tokens=3000
    )
    
    content = response.choices[0].message.content
    quests = json.loads(content)
    
    return quests

def call_anthropic_api(existing_titles, theme):
    """Call Anthropic API to generate quests"""
    api_key = os.getenv('ANTHROPIC_API_KEY')
    
    prompt = generate_quest_prompt(existing_titles, theme)
    
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
    }
    
    data = {
        "model": "claude-3-haiku-20240307",
        "max_tokens": 3000,
        "messages": [
            {"role": "user", "content": prompt}
        ]
    }
    
    with httpx.Client() as client:
        response = client.post(
            "https://api.anthropic.com/v1/messages",
            headers=headers,
            json=data,
            timeout=30.0
        )
        response.raise_for_status()
        
    content = response.json()['content'][0]['text']
    quests = json.loads(content)
    
    return quests

def generate_sample_quests(existing_titles):
    """Generate sample quests without AI"""
    sample_quests = [
        {
            "title": "Build a Personal Budget Tracker",
            "description": "Create and maintain a personal budget for one month, tracking income, expenses, and savings goals. Learn financial literacy through hands-on money management.",
            "difficulty_level": "intermediate",
            "effort_level": "moderate",
            "estimated_hours": 10,
            "evidence_requirements": "Submit your completed budget spreadsheet or app screenshots showing income, expenses, savings, and a reflection on what you learned",
            "accepted_evidence_types": ["written", "project_link", "photo"],
            "example_submissions": "Excel spreadsheet with categorized expenses, budget app screenshots, written reflection on spending habits",
            "core_skills": ["money_skills", "math_data", "critical_thinking", "decision_making"],
            "skill_xp_awards": [
                {"skill_category": "life_skills", "xp_amount": 150},
                {"skill_category": "thinking_skills", "xp_amount": 75}
            ],
            "resources_needed": "Spreadsheet software or budgeting app",
            "location_requirements": "",
            "safety_considerations": "",
            "requires_adult_supervision": False,
            "optional_challenges": [
                {
                    "description": "Research and compare 3 different investment options for teenagers",
                    "skill_category": "life_skills",
                    "xp_amount": 30
                }
            ]
        },
        {
            "title": "Local History Documentary",
            "description": "Research and create a 5-minute documentary about an interesting historical event or figure from your local area. Interview residents and explore archives.",
            "difficulty_level": "advanced",
            "effort_level": "intensive",
            "estimated_hours": 20,
            "evidence_requirements": "Submit your completed documentary video along with research notes and interview transcripts",
            "accepted_evidence_types": ["video", "written", "project_link"],
            "example_submissions": "YouTube or Vimeo link to documentary, PDF of research notes, interview recordings or transcripts",
            "core_skills": ["research", "history", "digital_media", "speaking", "critical_thinking"],
            "skill_xp_awards": [
                {"skill_category": "world_understanding", "xp_amount": 200},
                {"skill_category": "reading_writing", "xp_amount": 100},
                {"skill_category": "thinking_skills", "xp_amount": 100}
            ],
            "resources_needed": "Video recording device, editing software",
            "location_requirements": "Local library, historical sites, community",
            "safety_considerations": "Get permission before filming people or private property",
            "requires_adult_supervision": False,
            "optional_challenges": [
                {
                    "description": "Submit your documentary to a local history organization or museum",
                    "skill_category": "world_understanding",
                    "xp_amount": 40
                }
            ]
        },
        {
            "title": "Teach a Skill to Others",
            "description": "Choose a skill you're good at and teach it to at least 3 people. Create lesson plans and document the teaching process.",
            "difficulty_level": "intermediate",
            "effort_level": "moderate",
            "estimated_hours": 8,
            "evidence_requirements": "Submit lesson plans, photos/video of teaching sessions, and feedback from your students",
            "accepted_evidence_types": ["photo", "video", "written"],
            "example_submissions": "Written lesson plans, video clips of teaching, student testimonials or feedback forms",
            "core_skills": ["speaking", "learning_reflection", "teamwork", "creative_thinking"],
            "skill_xp_awards": [
                {"skill_category": "personal_growth", "xp_amount": 100},
                {"skill_category": "reading_writing", "xp_amount": 75}
            ],
            "resources_needed": "Materials related to your chosen skill",
            "location_requirements": "Any suitable teaching space",
            "safety_considerations": "",
            "requires_adult_supervision": False,
            "optional_challenges": [
                {
                    "description": "Create a YouTube tutorial based on your teaching experience",
                    "skill_category": "making_creating",
                    "xp_amount": 25
                }
            ]
        },
        {
            "title": "30-Day Fitness Challenge",
            "description": "Design and complete a personalized 30-day fitness challenge. Track your progress, nutrition, and how you feel throughout the journey.",
            "difficulty_level": "beginner",
            "effort_level": "moderate",
            "estimated_hours": 15,
            "evidence_requirements": "Submit your fitness plan, daily log entries, before/after photos (optional), and a final reflection",
            "accepted_evidence_types": ["written", "photo", "video"],
            "example_submissions": "Fitness journal or app data, progress photos, video of exercises, written reflection on the experience",
            "core_skills": ["health_fitness", "grit", "time_management", "learning_reflection"],
            "skill_xp_awards": [
                {"skill_category": "life_skills", "xp_amount": 125},
                {"skill_category": "personal_growth", "xp_amount": 75}
            ],
            "resources_needed": "Basic exercise equipment (optional), fitness tracking app or journal",
            "location_requirements": "Home, gym, or outdoor space",
            "safety_considerations": "Start slowly and listen to your body. Consult a doctor if you have health concerns.",
            "requires_adult_supervision": False,
            "optional_challenges": [
                {
                    "description": "Get a friend or family member to join your challenge",
                    "skill_category": "life_skills",
                    "xp_amount": 20
                }
            ]
        },
        {
            "title": "Code Your First Web App",
            "description": "Learn basic web development and create a simple but functional web application that solves a real problem in your life.",
            "difficulty_level": "intermediate",
            "effort_level": "intensive",
            "estimated_hours": 25,
            "evidence_requirements": "Submit your code repository, live app link, and documentation explaining what it does and how you built it",
            "accepted_evidence_types": ["project_link", "written", "video"],
            "example_submissions": "GitHub repository, deployed app on Netlify/Vercel, README documentation, optional demo video",
            "core_skills": ["coding", "systems_thinking", "creative_thinking", "research", "tech_skills"],
            "skill_xp_awards": [
                {"skill_category": "making_creating", "xp_amount": 250},
                {"skill_category": "thinking_skills", "xp_amount": 150}
            ],
            "resources_needed": "Computer, internet connection, code editor",
            "location_requirements": "",
            "safety_considerations": "",
            "requires_adult_supervision": False,
            "optional_challenges": [
                {
                    "description": "Add user authentication to your app",
                    "skill_category": "making_creating",
                    "xp_amount": 50
                }
            ]
        }
    ]
    
    # Filter out quests with titles that already exist
    filtered_quests = []
    for quest in sample_quests:
        if quest['title'] not in existing_titles:
            filtered_quests.append(quest)
    
    # If we filtered out too many, generate variations
    while len(filtered_quests) < 5 and len(filtered_quests) < len(sample_quests):
        for quest in sample_quests:
            if len(filtered_quests) >= 5:
                break
            # Create a variation
            varied_quest = quest.copy()
            varied_quest['title'] = f"Advanced {quest['title']}"
            if f"Advanced {quest['title']}" not in existing_titles:
                filtered_quests.append(varied_quest)
    
    return filtered_quests[:5]

@bp.route('/existing-titles', methods=['GET'])
@require_admin
def get_existing_titles(user_id):
    """Get all existing quest titles"""
    supabase = get_supabase_admin_client()
    
    try:
        response = supabase.table('quests').select('title').execute()
        titles = [quest['title'] for quest in response.data]
        return jsonify({'titles': titles}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400