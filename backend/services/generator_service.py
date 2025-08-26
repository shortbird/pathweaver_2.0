import os
import json
import google.generativeai as genai
from supabase import create_client, Client
from datetime import datetime
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.quest_framework_validator import QuestFrameworkValidator

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
    
    def get_skill_category_balance(self):
        """Analyze quest distribution across diploma pillars"""
        response = self.supabase.table('quest_skill_xp').select('skill_category').execute()
        if not response.data:
            return 'practical_skills'  # Default if no quests exist
        
        # Use the new diploma pillar categories
        category_counts = {
            'creativity': 0,
            'critical_thinking': 0,
            'practical_skills': 0,
            'communication': 0,
            'cultural_literacy': 0
        }
        
        for record in response.data:
            if record['skill_category'] in category_counts:
                category_counts[record['skill_category']] += 1
        
        # Return the least represented category
        return min(category_counts, key=category_counts.get)
    
    def get_feedback_data(self):
        """Fetch recently created quests for pattern learning"""
        # Get recently created quests (since we don't have ratings)
        recent_quests = self.supabase.table('quests').select('*').order('created_at', desc=True).limit(10).execute()
        
        return {
            'recent_patterns': recent_quests.data if recent_quests.data else []
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
        
        # Get the least represented diploma pillar
        target_category = self.get_skill_category_balance()
        
        # Map to human-friendly names for the prompt
        pillar_names = {
            'creativity': 'Creativity',
            'critical_thinking': 'Critical Thinking',
            'practical_skills': 'Practical Skills',
            'communication': 'Communication',
            'cultural_literacy': 'Cultural Literacy'
        }
        pillar_name = pillar_names.get(target_category, target_category)
        
        # Define core competencies for each pillar
        pillar_competencies = {
            'creativity': ['artistic_expression', 'design_thinking', 'innovation', 'problem_solving'],
            'critical_thinking': ['analysis_research', 'logic_reasoning', 'systems_thinking', 'evidence_based_decision'],
            'practical_skills': ['life_skills', 'technical_skills', 'financial_literacy', 'health_wellness'],
            'communication': ['writing_storytelling', 'public_speaking', 'digital_communication', 'active_listening'],
            'cultural_literacy': ['global_awareness', 'history_context', 'empathy_perspective', 'community_engagement']
        }
        
        competencies = pillar_competencies.get(target_category, [])
        
        prompt = f"""
        You are an expert quest designer following The Quest Creation Framework.
        
        Core Philosophy: The process is the goal. Every quest must inspire students to do, create, and reflect for its own sake, not to prove they did it.
        
        Generate a quest for the "{pillar_name}" diploma pillar.
        
        The quest MUST follow this EXACT structure:
        
        1. THE BIG PICTURE (The "Why"):
        - title: A compelling, action-oriented title that starts with a verb (e.g., "Launch a Podcast Mini-Series" NOT "Learn About Podcasting")
        - big_idea: A single powerful sentence explaining the quest's purpose
        - what_youll_create: 2-4 tangible, exciting outcomes (as an array)
        - primary_pillar: "{target_category}"
        
        2. YOUR TOOLKIT (The "How"):
        - estimated_time: Realistic time estimate (e.g., "10-15 hours over 2-3 weeks")
        - intensity: "light", "moderate", or "intensive"
        - helpful_resources: 1-3 high-quality starting points with type, name, and description
        
        3. THE JOURNEY (The "What"):
        - your_mission: 3-5 step guide focused on the creative process (as an array)
        - showcase_your_journey: How to celebrate and share the work, asking for both product and reflection
        
        4. GO FURTHER (Optional):
        - collaboration_spark: Direct call to action for teamwork (awards 2x XP bonus)
        - real_world_bonus: Specific challenge for real-world interaction with description and xp_amount (50)
        
        5. THE LEARNING LOG:
        - log_bonus: Object with description and xp_amount (25) to incentivize documenting the process
        
        6. FINE PRINT (Optional):
        - heads_up: Any necessary warnings or important context (optional)
        - location: If tied to specific place (otherwise "anywhere")
        
        Return ONLY valid JSON in this format:
        {{
            "title": "Action-oriented title starting with verb",
            "big_idea": "Single powerful sentence explaining purpose",
            "what_youll_create": ["Outcome 1", "Outcome 2"],
            "primary_pillar": "{target_category}",
            "estimated_time": "Time estimate with timeframe",
            "intensity": "light|moderate|intensive",
            "helpful_resources": {{
                "tools": ["Tool 1", "Tool 2"],
                "materials": ["Material 1"],
                "links": ["Resource or inspiration"]
            }},
            "your_mission": ["Step 1: Action", "Step 2: Action", "Step 3: Action"],
            "showcase_your_journey": "How to share your work and reflect on the process",
            "collaboration_spark": "How to work with others for 2x XP",
            "real_world_bonus": {{
                "description": "Real-world challenge",
                "xp_amount": 50
            }},
            "log_bonus": {{
                "description": "Add at least 3 log entries documenting your progress",
                "xp_amount": 25
            }},
            "heads_up": "Safety or important considerations (or null)",
            "location": "Where this can be done"
        }}
        
        Remember: Focus on {competencies} competencies for {pillar_name}.
        Make it narrative-driven, intrinsically motivating, and process-focused!
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
            
            # Check for semantic duplicates FIRST (before any modifications)
            original_title = quest_data.get('title', '')
            is_duplicate, duplicate_title = self.check_semantic_duplicates(
                original_title, 
                quest_data.get('big_idea', '')
            )
            
            if is_duplicate:
                print(f"Quest rejected: Too similar to existing quest '{duplicate_title}'")
                return None
            
            # Validate quest against framework
            validator = QuestFrameworkValidator()
            is_valid, errors = validator.validate_quest(quest_data)
            
            if not is_valid:
                print(f"Quest validation failed: {errors}")
                # Try to enhance the quest to fix issues
                quest_data = validator.enhance_quest(quest_data)
                # Re-validate
                is_valid, errors = validator.validate_quest(quest_data)
                if not is_valid:
                    print(f"Quest still invalid after enhancement: {errors}")
                    # Continue anyway but log the issues
            
            # Calculate quality score
            quality_score = validator.calculate_quality_score(quest_data)
            print(f"Quest quality score: {quality_score}/100")
            
            # Map intensity to difficulty and effort levels
            intensity_mapping = {
                'light': {'difficulty': 'beginner', 'effort': 'light', 'xp': 50, 'hours': 5},
                'moderate': {'difficulty': 'intermediate', 'effort': 'moderate', 'xp': 100, 'hours': 15},
                'intensive': {'difficulty': 'advanced', 'effort': 'intensive', 'xp': 200, 'hours': 30}
            }
            
            intensity = quest_data.get('intensity', 'moderate')
            mapping = intensity_mapping.get(intensity, intensity_mapping['moderate'])
            
            # Transform quest data to match database schema for when it's approved
            db_quest = {
                'title': quest_data.get('title'),
                'big_idea': quest_data.get('big_idea', ''),
                'description': quest_data.get('big_idea', ''),  # Use big_idea as description
                'evidence_requirements': quest_data.get('showcase_your_journey', ''),
                'difficulty_level': mapping['difficulty'],
                'effort_level': mapping['effort'],
                'estimated_hours': mapping['hours'],
                'accepted_evidence_types': ['photo', 'video', 'text', 'link'],
                'core_skills': [],  # Will be populated based on pillar
                'resources_needed': json.dumps(quest_data.get('helpful_resources', {})) if isinstance(quest_data.get('helpful_resources'), dict) else quest_data.get('helpful_resources'),
                'location_requirements': quest_data.get('location', 'anywhere'),
                'optional_challenges': [],
                'safety_considerations': quest_data.get('heads_up'),
                'requires_adult_supervision': bool(quest_data.get('heads_up') and 'adult' in quest_data.get('heads_up', '').lower()),
                'collaboration_ideas': quest_data.get('collaboration_spark'),
                'what_youll_create': quest_data.get('what_youll_create', []),
                'your_mission': quest_data.get('your_mission', []),
                'showcase_your_journey': quest_data.get('showcase_your_journey'),
                'primary_pillar': quest_data.get('primary_pillar', target_category),
                'collaboration_spark': quest_data.get('collaboration_spark'),
                'real_world_bonus': quest_data.get('real_world_bonus'),
                'log_bonus': quest_data.get('log_bonus'),
                # Add skill XP awards to be created when approved
                'skill_xp_awards': [
                    {
                        'skill_category': target_category,
                        'xp_amount': mapping['xp']
                    }
                ]
            }
            
            # Save to AI review queue instead of directly to quests table
            try:
                # Create a generation job for this single quest
                job_result = self.supabase.table('ai_generation_jobs').insert({
                    'parameters': {
                        'count': 1,
                        'distribution': {'categories': target_category},
                        'trigger': 'manual_run_cycle'
                    },
                    'status': 'completed',
                    'generated_count': 1,
                    'created_at': datetime.utcnow().isoformat(),
                    'completed_at': datetime.utcnow().isoformat()
                }).execute()
                
                job_id = job_result.data[0]['id'] if job_result.data else None
                
                # Add quest to review queue
                review_result = self.supabase.table('ai_generated_quests').insert({
                    'generation_job_id': job_id,
                    'quest_data': db_quest,
                    'quality_score': quality_score,
                    'review_status': 'pending',
                    'quality_metrics': {
                        'clarity': quality_score * 0.25,
                        'educational_value': quality_score * 0.25,
                        'engagement': quality_score * 0.20,
                        'difficulty_alignment': quality_score * 0.15,
                        'completion_clarity': quality_score * 0.15
                    },
                    'created_at': datetime.utcnow().isoformat()
                }).execute()
                
                if review_result.data and len(review_result.data) > 0:
                    quest_id = review_result.data[0]['id']
                    print(f"Successfully added quest to review queue: {quest_id}")
                    print(f"Quest '{quest_data.get('title')}' pending admin approval")
                    
                    # Return a simplified version with the necessary info
                    return {
                        'id': quest_id,
                        'title': quest_data.get('title'),
                        'status': 'pending_review',
                        'quality_score': quality_score
                    }
                else:
                    print("Warning: Quest insert to review queue succeeded but no data returned")
                    return None
            except Exception as db_error:
                print(f"Error adding quest to review queue: {db_error}")
                return None
            
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