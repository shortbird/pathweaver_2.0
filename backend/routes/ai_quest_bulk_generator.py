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

bp = Blueprint('ai_quest_bulk_generator', __name__)

# Skill categories with detailed descriptions for better prompting
SKILL_CATEGORY_DETAILS = {
    'reading_writing': {
        'name': 'Reading & Writing',
        'skills': ['reading', 'writing', 'speaking', 'digital_media', 'math_data'],
        'examples': ['Create a blog series', 'Write a short story', 'Analyze literature', 'Create presentations']
    },
    'thinking_skills': {
        'name': 'Thinking Skills', 
        'skills': ['critical_thinking', 'creative_thinking', 'research', 'information_literacy', 'systems_thinking', 'decision_making'],
        'examples': ['Solve complex puzzles', 'Design solutions', 'Research topics', 'Analyze systems']
    },
    'personal_growth': {
        'name': 'Personal Growth',
        'skills': ['learning_reflection', 'emotional_skills', 'grit', 'time_management'],
        'examples': ['Build habits', 'Practice mindfulness', 'Set and achieve goals', 'Develop resilience']
    },
    'life_skills': {
        'name': 'Life Skills',
        'skills': ['money_skills', 'health_fitness', 'home_skills', 'tech_skills', 'citizenship'],
        'examples': ['Budget planning', 'Fitness challenges', 'Cook meals', 'Learn software', 'Community service']
    },
    'making_creating': {
        'name': 'Making & Creating',
        'skills': ['building', 'art', 'scientific_method', 'coding', 'business_thinking'],
        'examples': ['Build projects', 'Create artwork', 'Run experiments', 'Develop apps', 'Start ventures']
    },
    'world_understanding': {
        'name': 'World Understanding',
        'skills': ['cultural_awareness', 'history', 'environment', 'teamwork', 'ethics_philosophy'],
        'examples': ['Study cultures', 'Document history', 'Environmental projects', 'Team collaborations', 'Ethical debates']
    }
}

class BulkQuestGenerator:
    def __init__(self):
        self.api_key = os.getenv('GEMINI_API_KEY')
        if self.api_key:
            genai.configure(api_key=self.api_key)
            # Use Gemini 1.5 Flash for cost-effective bulk generation
            self.model = genai.GenerativeModel('gemini-1.5-flash')
        else:
            self.model = None
            
    def generate_category_specific_prompt(self, category: str, count: int, difficulty: str, 
                                         existing_titles: List[str], theme: Optional[str] = None) -> str:
        """Generate a category-specific prompt for better quest quality"""
        
        category_info = SKILL_CATEGORY_DETAILS.get(category, {})
        skills_list = ', '.join(category_info.get('skills', []))
        examples = '\n'.join([f"- {ex}" for ex in category_info.get('examples', [])])
        
        existing_titles_str = '\n'.join([f"- {title}" for title in existing_titles[:50]]) if existing_titles else "None"
        
        prompt = f"""You are an expert educational quest designer specializing in {category_info.get('name', category)} skills.

Create exactly {count} unique, highly specific quests for the "{category}" skill category.

CATEGORY FOCUS: {category_info.get('name', category)}
Core Skills: {skills_list}

Example Activities for Inspiration:
{examples}

DIFFICULTY LEVEL: {difficulty}
{"THEME: " + theme if theme else ""}

EXISTING QUESTS TO AVOID (don't create similar):
{existing_titles_str}

For each quest, provide the following in valid JSON format:
{{
  "title": "Specific, action-focused accomplishment (max 100 chars)",
  "description": "Detailed description (200-300 chars)",
  "difficulty_level": "{difficulty}",
  "effort_level": "light" | "moderate" | "intensive",
  "estimated_hours": number between 1-50,
  "evidence_requirements": "How students showcase their achievement",
  "accepted_evidence_types": ["photo", "video", "written", "project_link", "presentation", "artifact", "certificate"],
  "example_submissions": "Specific examples of good evidence",
  "core_skills": [3-5 skills from: {skills_list}],
  "skill_xp_awards": [
    {{
      "skill_category": "{category}",
      "xp_amount": number (25-300 based on effort)
    }}
  ],
  "resources_needed": "Materials or tools needed",
  "location_requirements": "Where this can be done",
  "safety_considerations": "Any safety notes",
  "requires_adult_supervision": boolean,
  "collaboration_ideas": "Three collaboration ideas separated by periods",
  "optional_challenges": [
    {{
      "description": "Bonus challenge",
      "skill_category": "{category}",
      "xp_amount": 10-50
    }}
  ],
  "tags": ["relevant", "searchable", "tags"],
  "subject": "Academic subject if applicable"
}}

CRITICAL REQUIREMENTS:
- Each quest must be a SPECIFIC, CONCRETE achievement
- Focus heavily on {category_info.get('name', category)} skills
- Vary the activities to cover different aspects of the category
- Make them age-appropriate for high school students
- Ensure clear completion criteria
- XP awards should match effort level (light: 25-75, moderate: 75-150, intensive: 150-300)

Return ONLY a JSON array with exactly {count} quest objects."""
        
        return prompt
    
    def generate_varied_prompts(self, total_count: int, distribution: Dict[str, Any], 
                               existing_titles: List[str]) -> List[Dict[str, Any]]:
        """Generate varied prompts for different categories and difficulties"""
        
        prompts = []
        
        # Parse distribution settings
        category_dist = distribution.get('categories', 'even')
        difficulty_dist = distribution.get('difficulties', {'beginner': 0.4, 'intermediate': 0.4, 'advanced': 0.2})
        themes = distribution.get('themes', [])
        
        # Calculate quests per category
        categories = list(SKILL_CATEGORY_DETAILS.keys())
        if category_dist == 'even':
            quests_per_category = total_count // len(categories)
            remainder = total_count % len(categories)
        elif isinstance(category_dist, str) and category_dist in categories:
            # Single category focus
            quests_per_category = {category_dist: total_count}
            remainder = 0
        elif isinstance(category_dist, dict):
            # Custom distribution dictionary
            quests_per_category = category_dist
            remainder = 0
        else:
            # Default to even distribution if unknown
            quests_per_category = total_count // len(categories)
            remainder = total_count % len(categories)
        
        # Generate prompts for each category
        for idx, category in enumerate(categories):
            if isinstance(quests_per_category, dict):
                category_count = quests_per_category.get(category, 0)
            else:
                category_count = quests_per_category + (1 if idx < remainder else 0)
            
            if category_count == 0:
                continue
                
            # Distribute by difficulty
            for difficulty, ratio in difficulty_dist.items():
                diff_count = int(category_count * ratio)
                if diff_count == 0:
                    continue
                    
                # Add theme variation
                theme = random.choice(themes) if themes else None
                
                prompts.append({
                    'category': category,
                    'difficulty': difficulty,
                    'count': diff_count,
                    'theme': theme,
                    'prompt': self.generate_category_specific_prompt(
                        category, diff_count, difficulty, existing_titles, theme
                    )
                })
        
        return prompts
    
    def call_gemini_batch(self, prompt: str, retry_count: int = 3) -> List[Dict]:
        """Call Gemini API with retry logic"""
        
        if not self.model:
            raise ValueError("Gemini API not configured")
        
        for attempt in range(retry_count):
            try:
                # Add delay between attempts to avoid rate limiting
                if attempt > 0:
                    time.sleep(2 ** attempt)  # Exponential backoff
                
                response = self.model.generate_content(prompt)
                content = response.text
                
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
                
                return quests
                
            except Exception as e:
                print(f"Gemini API error (attempt {attempt + 1}): {str(e)}")
                if attempt == retry_count - 1:
                    raise
        
        return []
    
    def calculate_quality_score(self, quest: Dict) -> float:
        """Calculate quality score for a generated quest"""
        
        score = 0.0
        
        # Clarity of instructions (25%)
        instructions = quest.get('evidence_requirements', '')
        if len(instructions) > 150:
            score += 25
        elif len(instructions) > 75:
            score += 15
        else:
            score += 5
        
        # Educational value (25%)
        if quest.get('core_skills') and len(quest.get('core_skills', [])) >= 3:
            score += 25
        elif quest.get('description') and len(quest.get('description', '')) > 100:
            score += 15
        else:
            score += 5
        
        # Engagement potential (20%)
        title = quest.get('title', '')
        if title and len(title) > 20 and not title.lower().startswith(('learn', 'start', 'begin')):
            score += 20
        elif title and len(title) > 10:
            score += 10
        else:
            score += 5
        
        # Difficulty alignment (15%)
        if quest.get('difficulty_level') and quest.get('estimated_hours'):
            hours = quest.get('estimated_hours', 0)
            difficulty = quest.get('difficulty_level', '')
            
            if (difficulty == 'beginner' and 1 <= hours <= 10) or \
               (difficulty == 'intermediate' and 5 <= hours <= 20) or \
               (difficulty == 'advanced' and 10 <= hours <= 50):
                score += 15
            else:
                score += 7
        else:
            score += 5
        
        # Completion criteria clarity (15%)
        if quest.get('example_submissions') and len(quest.get('example_submissions', '')) > 50:
            score += 15
        else:
            score += 7
        
        return score
    
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
        
        # Generate varied prompts
        prompts = generator.generate_varied_prompts(count, distribution, existing_titles)
        
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
                        # Add metadata
                        quest['generation_job_id'] = job_id
                        quest['skill_category'] = prompt_info['category']
                        quest['difficulty_level'] = prompt_info['difficulty']
                        
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
                            'review_status': 'approved' if quality_score >= 80 and not duplicate_of else 'pending',
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
                    print(f"Failed to generate quests for {prompt_info['category']}: {str(e)}")
                    failed_count += 1
        
        # Insert generated quests
        if all_generated_quests:
            supabase.table('ai_generated_quests').insert(all_generated_quests).execute()
        
        # Update job status
        approved_count = len([q for q in all_generated_quests if q['review_status'] == 'approved'])
        job_update = {
            'status': 'completed',
            'generated_count': len(all_generated_quests),
            'approved_count': approved_count,
            'completed_at': datetime.utcnow().isoformat()
        }
        
        supabase.table('ai_generation_jobs').update(job_update).eq('id', job_id).execute()
        
        return jsonify({
            'job_id': job_id,
            'generated_count': len(all_generated_quests),
            'approved_count': approved_count,
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
            .order('created_at', {'ascending': False})\
            .limit(50)\
            .execute()
        
        return jsonify({'jobs': response.data}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

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
            .order('quality_score', {'ascending': False})\
            .limit(50)\
            .execute()
        
        return jsonify({'quests': response.data}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/review/<quest_id>', methods=['POST'])
@require_admin
def review_quest(user_id, quest_id):
    """Review and approve/reject/modify a generated quest"""
    
    supabase = get_supabase_admin_client()
    data = request.json
    
    action = data.get('action')  # approve, reject, modify
    modifications = data.get('modifications', {})
    notes = data.get('notes', '')
    
    if action not in ['approve', 'reject', 'modify']:
        return jsonify({'error': 'Invalid action'}), 400
    
    try:
        # Get the generated quest
        quest_response = supabase.table('ai_generated_quests')\
            .select('*')\
            .eq('id', quest_id)\
            .single()\
            .execute()
        
        generated_quest = quest_response.data
        
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
            
            # Map to actual quest table structure
            new_quest = {
                'title': quest_data.get('title'),
                'description': quest_data.get('description'),
                'skill_category': quest_data.get('skill_category'),
                'difficulty_level': quest_data.get('difficulty_level'),
                'effort_level': quest_data.get('effort_level'),
                'estimated_hours': quest_data.get('estimated_hours'),
                'evidence_requirements': quest_data.get('evidence_requirements'),
                'accepted_evidence_types': quest_data.get('accepted_evidence_types'),
                'example_submissions': quest_data.get('example_submissions'),
                'core_skills': quest_data.get('core_skills'),
                'skill_xp_awards': quest_data.get('skill_xp_awards'),
                'resources_needed': quest_data.get('resources_needed'),
                'location_requirements': quest_data.get('location_requirements'),
                'safety_considerations': quest_data.get('safety_considerations'),
                'requires_adult_supervision': quest_data.get('requires_adult_supervision', False),
                'collaboration_ideas': quest_data.get('collaboration_ideas'),
                'optional_challenges': quest_data.get('optional_challenges'),
                'is_ai_generated': True,
                'created_at': datetime.utcnow().isoformat()
            }
            
            # Insert the new quest
            quest_insert_response = supabase.table('quests').insert(new_quest).execute()
            published_quest_id = quest_insert_response.data[0]['id']
            
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
        return jsonify({'error': str(e)}), 400

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
    """Automatically publish all high-quality quests (score >= 80)"""
    
    supabase = get_supabase_admin_client()
    
    try:
        # Get high-quality pending quests
        response = supabase.table('ai_generated_quests')\
            .select('*')\
            .eq('review_status', 'pending')\
            .gte('quality_score', 80)\
            .execute()
        
        published_count = 0
        
        for generated_quest in response.data:
            quest_data = generated_quest['quest_data']
            
            # Create actual quest
            new_quest = {
                'title': quest_data.get('title'),
                'description': quest_data.get('description'),
                'skill_category': quest_data.get('skill_category'),
                'difficulty_level': quest_data.get('difficulty_level'),
                'effort_level': quest_data.get('effort_level'),
                'estimated_hours': quest_data.get('estimated_hours'),
                'evidence_requirements': quest_data.get('evidence_requirements'),
                'accepted_evidence_types': quest_data.get('accepted_evidence_types'),
                'example_submissions': quest_data.get('example_submissions'),
                'core_skills': quest_data.get('core_skills'),
                'skill_xp_awards': quest_data.get('skill_xp_awards'),
                'resources_needed': quest_data.get('resources_needed'),
                'location_requirements': quest_data.get('location_requirements'),
                'safety_considerations': quest_data.get('safety_considerations'),
                'requires_adult_supervision': quest_data.get('requires_adult_supervision', False),
                'collaboration_ideas': quest_data.get('collaboration_ideas'),
                'optional_challenges': quest_data.get('optional_challenges'),
                'is_ai_generated': True
            }
            
            # Insert quest
            quest_insert = supabase.table('quests').insert(new_quest).execute()
            
            if quest_insert.data:
                published_quest_id = quest_insert.data[0]['id']
                
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