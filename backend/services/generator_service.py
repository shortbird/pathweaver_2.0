import os
import json
import google.generativeai as genai
from supabase import create_client, Client
from datetime import datetime

class GeneratorService:
    def __init__(self):
        self.supabase: Client = create_client(
            os.environ.get('SUPABASE_URL'),
            os.environ.get('SUPABASE_SERVICE_KEY')
        )
        genai.configure(api_key=os.environ.get('GEMINI_API_KEY'))
        self.model = genai.GenerativeModel('gemini-1.5-flash')
    
    def get_seed_prompt(self):
        """Fetch the current AI seed prompt from database"""
        try:
            response = self.supabase.table('ai_seeds').select('prompt_text').limit(1).execute()
            if response.data and len(response.data) > 0:
                return response.data[0]['prompt_text']
        except Exception as e:
            print(f"Error fetching AI seed: {e}")
        
        # Default prompt if no seed exists
        return "Generate educational quests focused on the five pillars: Physical Wellness, Mental Wellness, Financial Literacy, Life Skills, and Purpose & Contribution."
    
    def get_pillar_balance(self):
        """Analyze quest distribution across pillars"""
        response = self.supabase.table('quests').select('pillar').execute()
        if not response.data:
            return 'Physical Wellness'  # Default to first pillar if no quests exist
        
        pillar_counts = {
            'Physical Wellness': 0,
            'Mental Wellness': 0,
            'Financial Literacy': 0,
            'Life Skills': 0,
            'Purpose & Contribution': 0
        }
        
        for quest in response.data:
            if quest['pillar'] in pillar_counts:
                pillar_counts[quest['pillar']] += 1
        
        # Return the least represented pillar
        return min(pillar_counts, key=pillar_counts.get)
    
    def get_feedback_data(self):
        """Fetch highest and lowest rated quests for learning"""
        # Get top 5 highest rated quests
        top_quests = self.supabase.table('quests').select('*').order('average_rating', desc=True).limit(5).execute()
        
        # Get bottom 5 lowest rated quests
        bottom_quests = self.supabase.table('quests').select('*').order('average_rating', desc=False).limit(5).execute()
        
        return {
            'successful_patterns': top_quests.data if top_quests.data else [],
            'unsuccessful_patterns': bottom_quests.data if bottom_quests.data else []
        }
    
    def check_semantic_duplicates(self, quest_title, quest_description):
        """Check for duplicates using simple text matching for now"""
        # For now, just check for exact title matches
        # TODO: Implement semantic similarity when we have a lightweight solution
        existing_quests = self.supabase.table('quests').select('id, title').execute()
        
        if existing_quests.data:
            for quest in existing_quests.data:
                if quest['title'].lower() == quest_title.lower():
                    return True, quest['title']
        
        return False, None
    
    def calculate_xp_reward(self, difficulty, estimated_time):
        """Calculate balanced XP reward based on difficulty and time"""
        base_xp = {
            'Beginner': 50,
            'Intermediate': 100,
            'Advanced': 200
        }
        
        time_multiplier = min(estimated_time / 30, 2.0)  # Cap at 2x for long tasks
        xp = int(base_xp.get(difficulty, 100) * time_multiplier)
        
        return min(xp, 500)  # Cap maximum XP at 500
    
    def generate_quest(self):
        """Generate a new quest using AI"""
        seed_prompt = self.get_seed_prompt()
        target_pillar = self.get_pillar_balance()
        feedback_data = self.get_feedback_data()
        
        # Build context from feedback
        successful_examples = "\n".join([f"- {q['title']}: {q['description'][:100]}..." for q in feedback_data['successful_patterns'][:3]])
        unsuccessful_examples = "\n".join([f"- {q['title']}: {q['description'][:100]}..." for q in feedback_data['unsuccessful_patterns'][:3]])
        
        prompt = f"""
        {seed_prompt}
        
        Generate a new quest for the "{target_pillar}" pillar.
        
        Successful quest patterns to emulate:
        {successful_examples if successful_examples else "No examples yet"}
        
        Patterns to avoid:
        {unsuccessful_examples if unsuccessful_examples else "No examples yet"}
        
        Create a quest that is:
        - Engaging and actionable
        - Clear in its requirements
        - Appropriately challenging
        - Provides real value to users
        
        Return the quest in this exact JSON format:
        {{
            "title": "Quest title here",
            "description": "Detailed quest description",
            "pillar": "{target_pillar}",
            "difficulty": "Beginner|Intermediate|Advanced",
            "estimated_time": "number in minutes",
            "requirements": ["requirement 1", "requirement 2"],
            "learning_outcomes": ["outcome 1", "outcome 2"],
            "resources": ["resource 1", "resource 2"]
        }}
        """
        
        try:
            response = self.model.generate_content(prompt)
            
            # Extract JSON from the response (handle markdown code blocks)
            response_text = response.text
            
            # Remove markdown code blocks if present
            if '```json' in response_text:
                response_text = response_text.split('```json')[1].split('```')[0]
            elif '```' in response_text:
                response_text = response_text.split('```')[1].split('```')[0]
            
            # Clean up the response
            response_text = response_text.strip()
            
            print(f"AI Response (cleaned): {response_text[:200]}...")
            
            quest_data = json.loads(response_text)
            
            # Check for semantic duplicates
            is_duplicate, duplicate_title = self.check_semantic_duplicates(
                quest_data['title'], 
                quest_data['description']
            )
            
            if is_duplicate:
                print(f"Quest rejected: Too similar to existing quest '{duplicate_title}'")
                return None
            
            # Calculate XP reward
            quest_data['xp_reward'] = self.calculate_xp_reward(
                quest_data['difficulty'],
                int(quest_data['estimated_time'])
            )
            
            # Add metadata
            quest_data['status'] = 'generated'
            quest_data['created_at'] = datetime.utcnow().isoformat()
            quest_data['is_active'] = False  # Will be activated after grading
            
            # Save to database
            result = self.supabase.table('quests').insert(quest_data).execute()
            
            return result.data[0] if result.data else None
            
        except json.JSONDecodeError as e:
            print(f"Error parsing JSON from AI response: {str(e)}")
            print(f"Response was: {response_text if 'response_text' in locals() else 'No response'}")
            return None
        except Exception as e:
            print(f"Error generating quest: {str(e)}")
            import traceback
            traceback.print_exc()
            return None
    
    def run_generation_cycle(self):
        """Run a complete generation cycle"""
        print("Starting quest generation cycle...")
        quest = self.generate_quest()
        if quest:
            print(f"Successfully generated quest: {quest['title']}")
            return quest
        else:
            print("Failed to generate quest")
            return None