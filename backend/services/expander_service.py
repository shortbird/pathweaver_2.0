import os
import json
import google.generativeai as genai
from supabase import create_client, Client
from datetime import datetime

class ExpanderService:
    def __init__(self):
        self.supabase: Client = create_client(
            os.environ.get('SUPABASE_URL'),
            os.environ.get('SUPABASE_SERVICE_KEY')
        )
        genai.configure(api_key=os.environ.get('GEMINI_API_KEY'))
        self.model = genai.GenerativeModel('gemini-pro')
    
    def get_seed_prompt(self):
        """Fetch the current AI seed prompt from database"""
        response = self.supabase.table('ai_seeds').select('prompt_text').eq('prompt_name', 'primary_seed').single().execute()
        return response.data['prompt_text'] if response.data else "Expand user ideas into complete, educational quests."
    
    def determine_pillar(self, title, description):
        """Use AI to determine the most appropriate pillar for a quest idea"""
        prompt = f"""
        Based on this quest idea, determine which educational pillar it best fits:
        
        Title: {title}
        Description: {description}
        
        Available pillars:
        1. Physical Wellness - Health, fitness, nutrition, sports
        2. Mental Wellness - Mindfulness, emotional intelligence, stress management
        3. Financial Literacy - Money management, investing, budgeting
        4. Life Skills - Cooking, organization, communication, time management
        5. Purpose & Contribution - Community service, leadership, environmental action
        
        Return only the pillar name exactly as shown above.
        """
        
        try:
            response = self.model.generate_content(prompt)
            pillar = response.text.strip()
            
            # Validate pillar
            valid_pillars = ['Physical Wellness', 'Mental Wellness', 'Financial Literacy', 'Life Skills', 'Purpose & Contribution']
            if pillar in valid_pillars:
                return pillar
            else:
                return 'Life Skills'  # Default fallback
        except:
            return 'Life Skills'  # Default fallback
    
    def expand_idea(self, idea_id, title, description, user_id):
        """Expand a user's quest idea into a full quest"""
        seed_prompt = self.get_seed_prompt()
        pillar = self.determine_pillar(title, description)
        
        prompt = f"""
        {seed_prompt}
        
        A user has submitted the following quest idea. Expand it into a complete, well-structured quest.
        
        User's Idea:
        Title: {title}
        Description: {description}
        
        Determined Pillar: {pillar}
        
        Create a comprehensive quest that:
        - Maintains the spirit of the user's original idea
        - Adds clear, actionable requirements
        - Includes helpful resources
        - Defines learning outcomes
        - Is appropriately challenging
        
        Return the quest in this exact JSON format:
        {{
            "title": "Enhanced quest title (keep it similar to user's title)",
            "description": "Detailed quest description expanding on user's idea",
            "pillar": "{pillar}",
            "difficulty": "Beginner|Intermediate|Advanced",
            "estimated_time": "number in minutes",
            "requirements": ["requirement 1", "requirement 2", "requirement 3"],
            "learning_outcomes": ["outcome 1", "outcome 2"],
            "resources": ["resource 1", "resource 2"],
            "user_submitted": true,
            "original_idea": "{title}"
        }}
        """
        
        try:
            response = self.model.generate_content(prompt)
            quest_data = json.loads(response.text)
            
            # Calculate XP reward based on difficulty and time
            difficulty_xp = {'Beginner': 50, 'Intermediate': 100, 'Advanced': 200}
            base_xp = difficulty_xp.get(quest_data['difficulty'], 100)
            time_multiplier = min(int(quest_data['estimated_time']) / 30, 2.0)
            quest_data['xp_reward'] = min(int(base_xp * time_multiplier), 500)
            
            # Add metadata
            quest_data['status'] = 'generated'  # Will go through grading
            quest_data['created_at'] = datetime.utcnow().isoformat()
            quest_data['created_by'] = user_id
            quest_data['is_active'] = False  # Will be activated after grading
            quest_data['source_idea_id'] = idea_id
            
            # Save to database
            result = self.supabase.table('quests').insert(quest_data).execute()
            
            if result.data:
                # Update the quest_idea status
                self.supabase.table('quest_ideas').update({
                    'status': 'expanded'
                }).eq('id', idea_id).execute()
                
                print(f"Successfully expanded idea '{title}' into quest")
                return result.data[0]
            
            return None
            
        except Exception as e:
            print(f"Error expanding idea: {str(e)}")
            
            # Update idea status to failed
            self.supabase.table('quest_ideas').update({
                'status': 'failed'
            }).eq('id', idea_id).execute()
            
            return None
    
    def process_pending_ideas(self):
        """Process all pending quest ideas"""
        print("Processing pending quest ideas...")
        
        # Fetch all pending ideas
        response = self.supabase.table('quest_ideas').select('*').eq('status', 'pending_expansion').execute()
        
        if not response.data:
            print("No pending ideas to process")
            return []
        
        results = []
        for idea in response.data:
            print(f"Expanding idea: {idea['title']}")
            quest = self.expand_idea(
                idea['id'],
                idea['title'],
                idea['description'],
                idea['user_id']
            )
            if quest:
                results.append(quest)
        
        print(f"Processed {len(results)} ideas successfully")
        return results