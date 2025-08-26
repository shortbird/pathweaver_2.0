from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth_utils import require_admin
import os
import json
import asyncio
import google.generativeai as genai
from datetime import datetime
from typing import List, Dict, Any, Optional
import time
import random
from concurrent.futures import ThreadPoolExecutor, as_completed
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.quest_framework_validator import QuestFrameworkValidator

bp = Blueprint('ai_quest_bulk_generator', __name__)

# Diploma Pillar details for AI quest generation
DIPLOMA_PILLAR_DETAILS = {
    'creativity': {
        'name': 'Creativity',
        'core_competencies': ['Artistic Expression', 'Design Thinking', 'Innovation', 'Problem-Solving'],
        'examples': [
            'Design a board game that teaches climate science',
            'Create a photo essay documenting community stories',
            'Compose original music for a short film',
            'Build a prototype for a sustainable product'
        ]
    },
    'critical_thinking': {
        'name': 'Critical Thinking',
        'core_competencies': ['Analysis & Research', 'Logic & Reasoning', 'Systems Thinking', 'Evidence-Based Decision Making'],
        'examples': [
            'Analyze media bias in news coverage',
            'Research and debate ethical AI implications',
            'Design a scientific experiment to test a hypothesis',
            'Create a data visualization revealing hidden patterns'
        ]
    },
    'practical_skills': {
        'name': 'Practical Skills',
        'core_competencies': ['Life Skills', 'Technical Skills', 'Financial Literacy', 'Health & Wellness'],
        'examples': [
            'Build a personal budget and track expenses',
            'Code a mobile app solving a real problem',
            'Plan and cook a week of healthy meals',
            'Repair or upcycle household items'
        ]
    },
    'communication': {
        'name': 'Communication',
        'core_competencies': ['Writing & Storytelling', 'Public Speaking', 'Digital Communication', 'Active Listening'],
        'examples': [
            'Host a podcast interviewing local changemakers',
            'Write and illustrate a children\'s book',
            'Create a documentary about an important issue',
            'Lead a workshop teaching a skill to peers'
        ]
    },
    'cultural_literacy': {
        'name': 'Cultural Literacy',
        'core_competencies': ['Global Awareness', 'History & Context', 'Empathy & Perspective-Taking', 'Community Engagement'],
        'examples': [
            'Research family history and create a heritage project',
            'Organize a cultural exchange event',
            'Document endangered local traditions',
            'Volunteer for a community organization'
        ]
    }
}

class BulkQuestGenerator:
    def __init__(self):
        self.api_key = os.getenv('GEMINI_API_KEY')
        print(f"Initializing BulkQuestGenerator - API Key present: {bool(self.api_key)}")
        if self.api_key:
            print(f"API Key length: {len(self.api_key)}")
            genai.configure(api_key=self.api_key)
            # Use Gemini 1.5 Flash for cost-effective bulk generation
            self.model = genai.GenerativeModel('gemini-1.5-flash')
            print("Gemini model initialized successfully")
        else:
            self.model = None
            print("WARNING: No GEMINI_API_KEY found in environment!")
            
    def generate_pillar_specific_prompt(self, pillar: str, count: int, intensity: str, 
                                         existing_titles: List[str], theme: Optional[str] = None) -> str:
        """Generate a pillar-specific prompt for better quest quality"""
        
        pillar_info = DIPLOMA_PILLAR_DETAILS.get(pillar, {})
        competencies_list = ', '.join(pillar_info.get('core_competencies', []))
        examples = '\n'.join([f"- {ex}" for ex in pillar_info.get('examples', [])])
        
        existing_titles_str = '\n'.join([f"- {title}" for title in existing_titles[:50]]) if existing_titles else "None"
        
        prompt = f"""You are an expert quest designer following The Quest Creation Framework.

Core Philosophy: The process is the goal. Every quest must inspire students to do, create, and reflect for its own sake, not to prove they did it.

Create exactly {count} unique quests for the "{pillar_info.get('name', pillar)}" diploma pillar.

PILLAR FOCUS: {pillar_info.get('name', pillar)}
Core Competencies: {competencies_list}

Example Activities for Inspiration:
{examples}

INTENSITY LEVEL: {intensity}
{"THEME: " + theme if theme else ""}

EXISTING QUESTS TO AVOID (don't create similar):
{existing_titles_str}

Each quest MUST follow this EXACT framework structure:

1. THE BIG PICTURE (The "Why"):
- title: Action-oriented title starting with a verb (e.g., "Launch", "Build", "Create", NOT "Learn About")
- big_idea: Single powerful sentence explaining the quest's purpose
- what_youll_create: 2-4 tangible, exciting outcomes (array)
- primary_pillar: "{pillar}"

2. YOUR TOOLKIT (The "How"):
- estimated_time: Realistic time estimate (e.g., "10-15 hours over 2-3 weeks")
- intensity: "{intensity}"
- helpful_resources: Objects with tools, materials, and links (1-3 quality starting points)

3. THE JOURNEY (The "What"):
- your_mission: 3-5 step guide focused on the creative process (array)
- showcase_your_journey: How to celebrate work, asking for both product and reflection

4. THE LEARNING LOG:
- log_bonus: Object with description encouraging process documentation, xp_amount: 25

5. GO FURTHER:
- collaboration_spark: Direct call to action for teamwork (awards 2x XP)
- real_world_bonus: Challenge for real-world interaction, xp_amount: 50

6. FINE PRINT:
- heads_up: Safety warnings or important context (or null)
- location: Where this can be done (default: "anywhere")

For each quest, return this EXACT JSON format:
{{
  "title": "Action verb + compelling outcome",
  "big_idea": "One sentence that sparks curiosity and provides vision",
  "what_youll_create": ["Tangible outcome 1", "Tangible outcome 2"],
  "primary_pillar": "{pillar}",
  "intensity": "{intensity}",
  "estimated_time": "X-Y hours over Z weeks",
  "your_mission": ["Step 1: Specific action", "Step 2: Specific action", "Step 3: Specific action"],
  "showcase_your_journey": "Share [specific deliverable]. In your submission, include [reflection prompt]",
  "helpful_resources": {{
    "tools": ["Specific tool with purpose"],
    "materials": ["Specific material needed"],
    "links": ["Curated resource or inspiration"]
  }},
  "collaboration_spark": "Partner with [who] to [specific collaborative action] for 2x XP!",
  "real_world_bonus": {{
    "description": "Present/share/teach [specific action] with [audience]",
    "xp_amount": 50
  }},
  "log_bonus": {{
    "description": "Add at least 3 log entries documenting your progress and earn bonus XP!",
    "xp_amount": 25
  }},
  "heads_up": null or "Specific safety/context note",
  "location": "anywhere" or specific location,
  "skill_xp_awards": [
    {{
      "skill_category": "{pillar}",
      "xp_amount": {25 if intensity == 'light' else 100 if intensity == 'moderate' else 200}
    }}
  ]
}}

CRITICAL REQUIREMENTS:
- Title MUST start with action verb
- Focus on process over product
- Make it narrative-driven and intrinsically motivating
- Emphasize {pillar_info.get('name', pillar)} competencies
- Clear but flexible completion paths
- Celebrate the journey, not just the outcome

Return ONLY a JSON array with exactly {count} quest objects."""
        
        return prompt
    
    def generate_varied_prompts(self, total_count: int, distribution: Dict[str, Any], 
                               existing_titles: List[str]) -> List[Dict[str, Any]]:
        """Generate varied prompts for different categories and difficulties"""
        
        prompts = []
        
        print(f"Generating prompts for {total_count} quests with distribution: {distribution}")
        
        # Parse distribution settings
        pillar_dist = distribution.get('pillars', 'even')
        intensity_dist = distribution.get('intensities', {'light': 0.4, 'moderate': 0.4, 'intensive': 0.2})
        themes = distribution.get('themes', [])
        
        print(f"Pillar distribution: {pillar_dist}")
        print(f"Intensity distribution: {intensity_dist}")
        
        # Calculate quests per pillar
        pillars = list(DIPLOMA_PILLAR_DETAILS.keys())
        if pillar_dist == 'even':
            quests_per_pillar = total_count // len(pillars)
            remainder = total_count % len(pillars)
        elif isinstance(pillar_dist, str) and pillar_dist in pillars:
            # Single pillar focus
            quests_per_pillar = {pillar_dist: total_count}
            remainder = 0
        elif isinstance(pillar_dist, dict):
            # Custom distribution dictionary
            quests_per_pillar = pillar_dist
            remainder = 0
        else:
            # Default to even distribution if unknown
            quests_per_pillar = total_count // len(pillars)
            remainder = total_count % len(pillars)
        
        # Generate prompts for each pillar
        for idx, pillar in enumerate(pillars):
            if isinstance(quests_per_pillar, dict):
                pillar_count = quests_per_pillar.get(pillar, 0)
            else:
                pillar_count = quests_per_pillar + (1 if idx < remainder else 0)
            
            if pillar_count == 0:
                continue
                
            print(f"  Pillar {pillar}: {pillar_count} quests")
                
            # Distribute by intensity
            remaining = pillar_count
            intensity_counts = {}
            
            # Calculate initial distribution
            for intensity, ratio in intensity_dist.items():
                count = int(pillar_count * ratio)
                intensity_counts[intensity] = count
                remaining -= count
            
            # Distribute remaining quests to ensure we use all allocated quests
            intensities = list(intensity_dist.keys())
            for i in range(remaining):
                intensity_counts[intensities[i % len(intensities)]] += 1
            
            # Create prompts for each intensity
            for intensity, int_count in intensity_counts.items():
                if int_count == 0:
                    continue
                
                print(f"    {intensity}: {int_count} quests")
                    
                # Add theme variation
                theme = random.choice(themes) if themes else None
                
                prompts.append({
                    'pillar': pillar,
                    'intensity': intensity,
                    'count': int_count,
                    'theme': theme,
                    'prompt': self.generate_pillar_specific_prompt(
                        pillar, int_count, intensity, existing_titles, theme
                    )
                })
        
        return prompts
    
    def call_gemini_batch(self, prompt: str, retry_count: int = 3) -> List[Dict]:
        """Call Gemini API with retry logic"""
        
        print("Calling Gemini API...")
        
        if not self.model:
            print("ERROR: Model is None!")
            raise ValueError("Gemini API not configured")
        
        for attempt in range(retry_count):
            try:
                # Add delay between attempts to avoid rate limiting
                if attempt > 0:
                    time.sleep(2 ** attempt)  # Exponential backoff
                
                response = self.model.generate_content(prompt)
                content = response.text
                print(f"Gemini response received, length: {len(content)}")
                
                # Clean up the response
                if '```json' in content:
                    content = content.split('```json')[1].split('```')[0]
                elif '```' in content:
                    content = content.split('```')[1].split('```')[0]
                
                # Parse JSON
                quests = json.loads(content.strip())
                
                # Ensure it's a list
                if isinstance(quests, dict) and 'quests' in quests:
                    quests = quests['quests']
                
                print(f"Successfully parsed {len(quests)} quests from Gemini")
                return quests
                
            except Exception as e:
                print(f"Gemini API error (attempt {attempt + 1}): {str(e)}")
                if attempt == retry_count - 1:
                    raise
        
        return []
    
    def calculate_quality_score(self, quest: Dict) -> float:
        """Calculate quality score for a generated quest using the framework validator"""
        validator = QuestFrameworkValidator()
        return validator.calculate_quality_score(quest)
    
    def check_for_duplicates(self, quest_title: str, existing_titles: List[str], 
                            threshold: float = 0.8) -> Optional[str]:
        """Check if quest title is too similar to existing ones"""
        
        # Simple similarity check (can be enhanced with fuzzy matching)
        quest_title_lower = quest_title.lower()
        for existing in existing_titles:
            existing_lower = existing.lower()
            
            # Check for exact match
            if quest_title_lower == existing_lower:
                return existing
            
            # Check for very similar titles
            if quest_title_lower in existing_lower or existing_lower in quest_title_lower:
                return existing
            
            # Check for common words overlap
            quest_words = set(quest_title_lower.split())
            existing_words = set(existing_lower.split())
            common_words = quest_words.intersection(existing_words)
            
            if len(common_words) >= min(3, min(len(quest_words), len(existing_words)) - 1):
                return existing
        
        return None

@bp.route('/generate-batch', methods=['POST'])
@require_admin
def generate_batch(user_id):
    """Generate a batch of quests using AI"""
    
    supabase = get_supabase_admin_client()
    data = request.json
    
    # Extract parameters
    count = min(data.get('count', 10), 100)  # Limit to 100 per batch
    distribution = data.get('distribution', {'categories': 'even'})
    parameters = data.get('parameters', {})
    
    print(f"Generate batch called - Count: {count}, Distribution: {distribution}")
    print(f"User ID: {user_id}")
    
    try:
        # Create generation job
        job_data = {
            'parameters': {
                'count': count,
                'distribution': distribution,
                'parameters': parameters
            },
            'status': 'processing',
            'created_by': user_id,
            'started_at': datetime.utcnow().isoformat()
        }
        
        job_response = supabase.table('ai_generation_jobs').insert(job_data).execute()
        job_id = job_response.data[0]['id']
        
        # Get existing quest titles
        existing_response = supabase.table('quests').select('title').execute()
        existing_titles = [q['title'] for q in existing_response.data]
        
        # Initialize generator
        generator = BulkQuestGenerator()
        
        if not generator.model:
            print("ERROR: Gemini model not initialized - likely missing API key")
            raise ValueError("AI model not configured. Please set GEMINI_API_KEY environment variable.")
        
        # Generate varied prompts
        prompts = generator.generate_varied_prompts(count, distribution, existing_titles)
        print(f"Generated {len(prompts)} prompts for processing")
        
        # Generate quests in parallel (with rate limiting)
        all_generated_quests = []
        failed_count = 0
        
        with ThreadPoolExecutor(max_workers=3) as executor:
            future_to_prompt = {
                executor.submit(generator.call_gemini_batch, p['prompt']): p 
                for p in prompts
            }
            
            for future in as_completed(future_to_prompt):
                prompt_info = future_to_prompt[future]
                try:
                    quests = future.result()
                    
                    # Process each quest
                    for quest in quests:
                        # Don't modify the original quest object
                        # Ensure intensity is set if not present
                        if 'intensity' not in quest:
                            quest['intensity'] = prompt_info['intensity']
                        
                        # Validate and enhance quest
                        validator = QuestFrameworkValidator()
                        is_valid, errors = validator.validate_quest(quest)
                        if not is_valid:
                            print(f"Quest validation errors: {errors}")
                            quest = validator.enhance_quest(quest)
                        
                        # Calculate quality score
                        quality_score = generator.calculate_quality_score(quest)
                        
                        # Check for duplicates
                        duplicate_of = generator.check_for_duplicates(
                            quest.get('title', ''), 
                            existing_titles
                        )
                        
                        # Prepare quest data for storage
                        generated_quest = {
                            'generation_job_id': job_id,
                            'quest_data': quest,
                            'quality_score': quality_score,
                            'review_status': 'pending',  # Always require manual review
                            'duplicate_of_quest_id': None,  # Would need to look up actual ID
                            'quality_metrics': {
                                'clarity': quality_score * 0.25,
                                'educational_value': quality_score * 0.25,
                                'engagement': quality_score * 0.20,
                                'difficulty_alignment': quality_score * 0.15,
                                'completion_clarity': quality_score * 0.15
                            }
                        }
                        
                        all_generated_quests.append(generated_quest)
                        
                except Exception as e:
                    print(f"Failed to generate quests for {prompt_info['pillar']}: {str(e)}")
                    failed_count += 1
        
        # Insert generated quests
        if all_generated_quests:
            print(f"Inserting {len(all_generated_quests)} generated quests...")
            try:
                insert_result = supabase.table('ai_generated_quests').insert(all_generated_quests).execute()
                print(f"Successfully inserted {len(insert_result.data)} quests")
            except Exception as insert_error:
                print(f"Error inserting quests: {str(insert_error)}")
                raise
        
        # Update job status
        pending_count = len(all_generated_quests)
        high_quality_count = len([q for q in all_generated_quests if q['quality_score'] >= 80])
        job_update = {
            'status': 'completed',
            'generated_count': len(all_generated_quests),
            'approved_count': 0,  # None auto-approved anymore
            'completed_at': datetime.utcnow().isoformat()
        }
        
        supabase.table('ai_generation_jobs').update(job_update).eq('id', job_id).execute()
        
        return jsonify({
            'job_id': job_id,
            'generated_count': len(all_generated_quests),
            'pending_review': pending_count,
            'high_quality': high_quality_count,
            'failed_count': failed_count,
            'status': 'completed'
        }), 200
        
    except Exception as e:
        # Update job with error
        if 'job_id' in locals():
            supabase.table('ai_generation_jobs').update({
                'status': 'failed',
                'error_message': str(e),
                'completed_at': datetime.utcnow().isoformat()
            }).eq('id', job_id).execute()
        
        return jsonify({'error': str(e)}), 500

@bp.route('/generation-jobs', methods=['GET'])
@require_admin
def get_generation_jobs(user_id):
    """Get list of generation jobs"""
    
    supabase = get_supabase_admin_client()
    
    try:
        response = supabase.table('ai_generation_jobs')\
            .select('*')\
            .order('created_at', desc=True)\
            .limit(50)\
            .execute()
        
        return jsonify({'jobs': response.data if response.data else []}), 200
        
    except Exception as e:
        error_msg = str(e)
        print(f"Error in get_generation_jobs: {error_msg}")
        
        # Try to check if table exists
        try:
            test_response = supabase.table('ai_generation_jobs').select('id').limit(1).execute()
            # Table exists but might be empty
            return jsonify({'jobs': []}), 200
        except:
            # Table doesn't exist
            if 'does not exist' in error_msg or 'relation' in error_msg.lower():
                return jsonify({
                    'error': 'AI quest tables not found. Please run the migration.',
                    'details': error_msg,
                    'solution': 'Run the SQL migration in backend/migrations/add_ai_generation_tables.sql'
                }), 400
        
        return jsonify({'error': error_msg}), 400

@bp.route('/review-queue', methods=['GET'])
@require_admin
def get_review_queue(user_id):
    """Get quests pending review"""
    
    supabase = get_supabase_admin_client()
    
    try:
        # Get pending quests sorted by quality score
        response = supabase.table('ai_generated_quests')\
            .select('*')\
            .eq('review_status', 'pending')\
            .order('quality_score', desc=True)\
            .limit(50)\
            .execute()
        
        print(f"Review queue response: {len(response.data) if response.data else 0} quests found")
        return jsonify({'quests': response.data if response.data else []}), 200
        
    except Exception as e:
        error_msg = str(e)
        print(f"Error in get_review_queue: {error_msg}")
        
        # Try to check if table exists
        try:
            test_response = supabase.table('ai_generated_quests').select('id').limit(1).execute()
            # Table exists but might be empty
            return jsonify({'quests': []}), 200
        except:
            # Table doesn't exist
            if 'does not exist' in error_msg or 'relation' in error_msg.lower():
                return jsonify({
                    'error': 'AI quest tables not found. Please run the migration.',
                    'details': error_msg,
                    'solution': 'Run the SQL migration in backend/migrations/add_ai_generation_tables.sql'
                }), 400
        
        return jsonify({'error': error_msg}), 400

@bp.route('/review/<quest_id>', methods=['POST'])
@require_admin
def review_quest(user_id, quest_id):
    """Review and approve/reject/modify a generated quest"""
    
    print(f"Review quest called - user_id: {user_id}, quest_id: {quest_id}")
    
    supabase = get_supabase_admin_client()
    data = request.json
    
    action = data.get('action')  # approve, reject, modify
    modifications = data.get('modifications', {})
    notes = data.get('notes', '')
    
    print(f"Action: {action}, Modifications: {modifications}")
    
    if action not in ['approve', 'reject', 'modify']:
        return jsonify({'error': 'Invalid action'}), 400
    
    try:
        # Get the generated quest
        quest_response = supabase.table('ai_generated_quests')\
            .select('*')\
            .eq('id', quest_id)\
            .execute()
        
        if not quest_response.data or len(quest_response.data) == 0:
            return jsonify({'error': 'Quest not found'}), 404
            
        generated_quest = quest_response.data[0]
        
        # Create review history entry
        history_entry = {
            'generated_quest_id': quest_id,
            'reviewer_id': user_id,
            'action': action,
            'previous_data': generated_quest['quest_data'],
            'updated_data': {**generated_quest['quest_data'], **modifications} if modifications else None,
            'notes': notes
        }
        
        supabase.table('ai_quest_review_history').insert(history_entry).execute()
        
        if action == 'approve':
            # Create actual quest from approved data
            quest_data = generated_quest['quest_data']
            
            # Validate required fields
            if not quest_data.get('title'):
                return jsonify({'error': 'Quest is missing title'}), 400
            if not quest_data.get('description'):
                return jsonify({'error': 'Quest is missing description'}), 400
            if not quest_data.get('evidence_requirements'):
                return jsonify({'error': 'Quest is missing evidence requirements'}), 400
            
            # Base quest data (matching manual creation pattern)
            new_quest = {
                'title': quest_data.get('title'),
                'description': quest_data.get('description'),
                'evidence_requirements': quest_data.get('evidence_requirements'),
                'created_by': user_id,
                'created_at': datetime.utcnow().isoformat()
            }
            
            # Add optional fields if present (matching manual creation)
            # IMPORTANT: Only add fields that exist in the quests table
            optional_fields = [
                'difficulty_level', 'effort_level', 'estimated_hours',
                'accepted_evidence_types', 'example_submissions', 'core_skills',
                'resources_needed', 'location_requirements', 'optional_challenges',
                'safety_considerations', 'requires_adult_supervision', 'collaboration_ideas'
            ]
            
            for field in optional_fields:
                value = quest_data.get(field)
                if value is not None:
                    # Special handling for estimated_hours - ensure it's an integer
                    if field == 'estimated_hours':
                        try:
                            new_quest[field] = int(value)
                        except (TypeError, ValueError):
                            new_quest[field] = 1  # Default to 1 hour if invalid
                    else:
                        new_quest[field] = value
            
            # Note: Removed is_ai_generated flag as it may not exist in the quests table
            
            print(f"Inserting quest with fields: {list(new_quest.keys())}")
            print(f"Quest data: {json.dumps(new_quest, default=str)[:500]}")  # Log first 500 chars for debugging
            
            # Insert the new quest
            try:
                quest_insert_response = supabase.table('quests').insert(new_quest).execute()
                if not quest_insert_response.data or len(quest_insert_response.data) == 0:
                    return jsonify({'error': 'Failed to insert quest'}), 400
                published_quest_id = quest_insert_response.data[0]['id']
            except Exception as insert_error:
                print(f"Quest insert error: {str(insert_error)}")
                return jsonify({'error': f'Failed to insert quest: {str(insert_error)}'}), 400
            
            # Handle skill-based XP awards (new system) - with error handling like manual creation
            if 'skill_xp_awards' in quest_data:
                for award in quest_data['skill_xp_awards']:
                    try:
                        supabase.table('quest_skill_xp').insert({
                            'quest_id': published_quest_id,
                            'skill_category': award['skill_category'],
                            'xp_amount': award['xp_amount']
                        }).execute()
                    except Exception:
                        # If skill table doesn't exist or insert fails, skip
                        pass
            
            # Update generated quest status
            supabase.table('ai_generated_quests').update({
                'review_status': 'published',
                'reviewer_id': user_id,
                'reviewed_at': datetime.utcnow().isoformat(),
                'published_at': datetime.utcnow().isoformat(),
                'published_quest_id': published_quest_id
            }).eq('id', quest_id).execute()
            
            # Update job counts
            # TODO: Implement job count updates
            # job_id = generated_quest['generation_job_id']
            # supabase.rpc('increment', {
            #     'table_name': 'ai_generation_jobs',
            #     'column_name': 'approved_count',
            #     'row_id': job_id
            # }).execute()
            
        elif action == 'reject':
            # Update status to rejected
            supabase.table('ai_generated_quests').update({
                'review_status': 'rejected',
                'reviewer_id': user_id,
                'reviewed_at': datetime.utcnow().isoformat(),
                'review_notes': notes
            }).eq('id', quest_id).execute()
            
            # Update job counts
            # TODO: Implement job count updates
            # job_id = generated_quest['generation_job_id']
            # supabase.rpc('increment', {
            #     'table_name': 'ai_generation_jobs',
            #     'column_name': 'rejected_count',
            #     'row_id': job_id
            # }).execute()
            
        elif action == 'modify':
            # Update quest data with modifications
            updated_quest_data = {**generated_quest['quest_data'], **modifications}
            
            supabase.table('ai_generated_quests').update({
                'quest_data': updated_quest_data,
                'review_status': 'modified',
                'reviewer_id': user_id,
                'reviewed_at': datetime.utcnow().isoformat(),
                'review_notes': notes
            }).eq('id', quest_id).execute()
        
        return jsonify({'success': True, 'action': action}), 200
        
    except Exception as e:
        error_msg = str(e)
        print(f"Error in review_quest: {error_msg}")
        print(f"Full error details: {repr(e)}")
        
        # Check for specific error types
        if 'violates foreign key constraint' in error_msg:
            return jsonify({
                'error': 'Database constraint error',
                'details': error_msg,
                'hint': 'The quest references invalid data. Check skill categories and user IDs.'
            }), 400
        elif 'null value in column' in error_msg:
            return jsonify({
                'error': 'Missing required field',
                'details': error_msg,
                'hint': 'Some required quest fields are missing.'
            }), 400
        
        return jsonify({
            'error': 'Failed to process quest review',
            'details': error_msg
        }), 400

@bp.route('/quality-metrics', methods=['GET'])
@require_admin
def get_quality_metrics(user_id):
    """Get analytics on generation quality"""
    
    supabase = get_supabase_admin_client()
    
    try:
        # Get aggregated metrics
        # TODO: Implement metrics aggregation
        # metrics_response = supabase.rpc('get_ai_generation_metrics').execute()
        
        # For now, return empty metrics
        return jsonify({
            'metrics': {},
            'analytics': []
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/auto-publish', methods=['POST'])
@require_admin
def auto_publish_high_quality(user_id):
    """Automatically publish all high-quality quests (score >= 95)"""
    
    supabase = get_supabase_admin_client()
    
    try:
        # Get high-quality pending quests
        response = supabase.table('ai_generated_quests')\
            .select('*')\
            .eq('review_status', 'pending')\
            .gte('quality_score', 95)\
            .execute()
        
        published_count = 0
        
        for generated_quest in response.data:
            quest_data = generated_quest['quest_data']
            
            # Base quest data (matching manual creation pattern)
            new_quest = {
                'title': quest_data.get('title'),
                'description': quest_data.get('description'),
                'evidence_requirements': quest_data.get('evidence_requirements'),
                'created_by': user_id,
                'created_at': datetime.utcnow().isoformat()
            }
            
            # Add optional fields if present (matching manual creation)
            optional_fields = [
                'difficulty_level', 'effort_level', 'estimated_hours',
                'accepted_evidence_types', 'example_submissions', 'core_skills',
                'resources_needed', 'location_requirements', 'optional_challenges',
                'safety_considerations', 'requires_adult_supervision', 'collaboration_ideas'
            ]
            
            for field in optional_fields:
                value = quest_data.get(field)
                if value is not None:
                    # Special handling for estimated_hours - ensure it's an integer
                    if field == 'estimated_hours':
                        try:
                            new_quest[field] = int(value)
                        except (TypeError, ValueError):
                            new_quest[field] = 1  # Default to 1 hour if invalid
                    else:
                        new_quest[field] = value
            
            # Insert quest
            quest_insert = supabase.table('quests').insert(new_quest).execute()
            
            if quest_insert.data:
                published_quest_id = quest_insert.data[0]['id']
                
                # Handle skill-based XP awards (new system) - with error handling like manual creation
                if 'skill_xp_awards' in quest_data:
                    for award in quest_data['skill_xp_awards']:
                        try:
                            supabase.table('quest_skill_xp').insert({
                                'quest_id': published_quest_id,
                                'skill_category': award['skill_category'],
                                'xp_amount': award['xp_amount']
                            }).execute()
                        except Exception:
                            # If skill table doesn't exist or insert fails, skip
                            pass
                
                # Update generated quest status
                supabase.table('ai_generated_quests').update({
                    'review_status': 'published',
                    'reviewer_id': user_id,
                    'reviewed_at': datetime.utcnow().isoformat(),
                    'published_at': datetime.utcnow().isoformat(),
                    'published_quest_id': published_quest_id,
                    'review_notes': 'Auto-published due to high quality score'
                }).eq('id', generated_quest['id']).execute()
                
                published_count += 1
        
        return jsonify({
            'published_count': published_count,
            'message': f'Successfully published {published_count} high-quality quests'
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400