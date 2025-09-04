"""
AI Quest Generation Service
Generates educational quests using Gemini AI with structured prompts
"""

import os
import json
import re
from typing import Dict, List, Optional, Any
import google.generativeai as genai
from datetime import datetime
from utils.pillar_mapping import normalize_pillar_name, FULL_PILLAR_NAMES

class AIQuestGenerator:
    """Handles AI-powered quest generation using Gemini"""
    
    def __init__(self):
        """Initialize the AI quest generator with Gemini API"""
        api_key = os.getenv('GEMINI_API_KEY')
        self.api_key = api_key
        self.model = None
        
        # Only configure if API key is available and not a placeholder
        if api_key and api_key != 'PLACEHOLDER_KEY_NEEDS_TO_BE_SET':
            try:
                genai.configure(api_key=api_key)
                self.model = genai.GenerativeModel('gemini-pro')
            except Exception as e:
                print(f"Failed to initialize Gemini model: {e}")
                self.model = None
        else:
            print(f"GEMINI_API_KEY not properly configured (current value: {'not set' if not api_key else 'placeholder'})")
        
        # Define available pillars (use from pillar_mapping)
        self.pillars = FULL_PILLAR_NAMES
        
        # XP ranges by difficulty
        self.xp_ranges = {
            'beginner': (50, 100),
            'intermediate': (100, 150),
            'advanced': (150, 200)
        }
    
    def generate_quest(
        self,
        generation_mode: str,
        parameters: Dict[str, Any],
        user_context: Optional[Dict] = None
    ) -> Dict:
        """
        Generate a complete quest based on mode and parameters
        
        Args:
            generation_mode: 'topic', 'skill', 'difficulty', or 'custom'
            parameters: Mode-specific parameters
            user_context: Optional user information for personalization
        
        Returns:
            Generated quest structure with tasks
        """
        
        # Check if model is initialized
        if not self.model:
            raise ValueError("AI model not initialized. Please check GEMINI_API_KEY configuration.")
        
        # Build the prompt based on generation mode
        prompt = self._build_generation_prompt(generation_mode, parameters)
        
        try:
            # Generate quest using Gemini
            response = self.model.generate_content(prompt)
            
            # Parse the response
            quest_data = self._parse_quest_response(response.text)
            
            # Validate and enhance the quest
            quest_data = self._validate_and_enhance_quest(quest_data, parameters)
            
            # Add metadata
            quest_data['ai_generated'] = True
            quest_data['generation_mode'] = generation_mode
            quest_data['generation_params'] = parameters
            quest_data['generated_at'] = datetime.utcnow().isoformat()
            
            return {
                'success': True,
                'quest': quest_data
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'message': 'Failed to generate quest'
            }
    
    def _build_generation_prompt(self, mode: str, params: Dict) -> str:
        """Build structured prompt based on generation mode"""
        
        base_prompt = """
        You are an educational quest designer creating engaging learning experiences for students.
        Generate a quest that is educational, age-appropriate, and encourages real-world application.
        
        REQUIRED FORMAT (JSON):
        {
            "title": "Quest title (clear and engaging)",
            "description": "2-3 sentences describing the quest objective",
            "big_idea": "The overarching concept or question explored",
            "difficulty": "beginner/intermediate/advanced",
            "tasks": [
                {
                    "title": "Task title (action-oriented)",
                    "description": "Clear instructions for completing the task",
                    "pillar": "One of: STEM & Logic, Life & Wellness, Language & Communication, Society & Culture, Arts & Creativity",
                    "xp_value": number between 50-200,
                    "evidence_type": "text/image/video/document",
                    "suggested_evidence": "Example of good evidence to submit"
                }
            ]
        }
        
        REQUIREMENTS:
        - Create 3-5 tasks that build upon each other
        - Each task should be completable with evidence
        - Tasks should encourage critical thinking and creativity
        - XP values should reflect task complexity
        - Content must be educational and appropriate
        - Focus on real-world application
        """
        
        if mode == 'topic':
            prompt = base_prompt + f"""
            
            TOPIC-BASED GENERATION:
            Create a quest about: {params.get('topic')}
            Target age group: {params.get('age_group', '13-18')}
            Preferred pillars: {params.get('pillars', 'Any')}
            
            Make sure the quest deeply explores this topic through varied activities.
            """
            
        elif mode == 'skill':
            prompt = base_prompt + f"""
            
            SKILL-FOCUSED GENERATION:
            Primary skills to develop: {params.get('skills', [])}
            Pillars to focus on: {params.get('pillars', [])}
            Difficulty level: {params.get('difficulty', 'intermediate')}
            
            Design tasks that specifically build these skills progressively.
            """
            
        elif mode == 'difficulty':
            prompt = base_prompt + f"""
            
            DIFFICULTY-TARGETED GENERATION:
            Difficulty level: {params.get('difficulty')}
            Subject area: {params.get('subject', 'general education')}
            
            Ensure all tasks match the difficulty level appropriately.
            XP range for {params.get('difficulty')}: {self.xp_ranges.get(params.get('difficulty', 'intermediate'))}
            """
            
        elif mode == 'custom':
            prompt = base_prompt + f"""
            
            CUSTOM GENERATION:
            Requirements: {params.get('requirements', '')}
            
            Create a unique quest that fulfills these specific requirements.
            """
        
        prompt += """
        
        IMPORTANT:
        - Return ONLY valid JSON, no additional text
        - Ensure all tasks are unique and build towards the quest goal
        - Make the quest engaging and educational
        """
        
        return prompt
    
    def _parse_quest_response(self, response_text: str) -> Dict:
        """Parse AI response into quest structure"""
        
        # Extract JSON from response
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if not json_match:
            raise ValueError("No valid JSON found in AI response")
        
        try:
            quest_data = json.loads(json_match.group())
        except json.JSONDecodeError as e:
            # Try to clean up common issues
            cleaned = self._clean_json_response(json_match.group())
            quest_data = json.loads(cleaned)
        
        return quest_data
    
    def _clean_json_response(self, json_str: str) -> str:
        """Clean up common JSON formatting issues from AI"""
        
        # Remove trailing commas
        json_str = re.sub(r',\s*}', '}', json_str)
        json_str = re.sub(r',\s*]', ']', json_str)
        
        # Fix single quotes (convert to double quotes)
        json_str = re.sub(r"'([^']*)'", r'"\1"', json_str)
        
        # Remove any non-JSON content
        json_str = json_str.strip()
        
        return json_str
    
    def _validate_and_enhance_quest(self, quest_data: Dict, params: Dict) -> Dict:
        """Validate and enhance the generated quest"""
        
        # Ensure required fields
        if 'title' not in quest_data or not quest_data['title']:
            quest_data['title'] = f"Quest: {params.get('topic', 'Learning Journey')}"
        
        if 'description' not in quest_data or not quest_data['description']:
            quest_data['description'] = "An educational quest to explore new concepts and skills."
        
        if 'big_idea' not in quest_data:
            quest_data['big_idea'] = quest_data['description']
        
        # Validate difficulty
        if 'difficulty' not in quest_data or quest_data['difficulty'] not in ['beginner', 'intermediate', 'advanced']:
            quest_data['difficulty'] = params.get('difficulty', 'intermediate')
        
        # Validate and enhance tasks
        if 'tasks' not in quest_data or not quest_data['tasks']:
            raise ValueError("No tasks generated for quest")
        
        validated_tasks = []
        for i, task in enumerate(quest_data['tasks']):
            validated_task = self._validate_task(task, i, quest_data['difficulty'])
            validated_tasks.append(validated_task)
        
        quest_data['tasks'] = validated_tasks
        
        # Add quest metadata
        quest_data['source'] = 'ai_generated'
        quest_data['is_active'] = False  # Requires admin approval
        quest_data['is_v3'] = True
        
        return quest_data
    
    def _validate_task(self, task: Dict, index: int, difficulty: str) -> Dict:
        """Validate and enhance individual task"""
        
        # Ensure required fields
        if 'title' not in task or not task['title']:
            task['title'] = f"Task {index + 1}"
        
        if 'description' not in task or not task['description']:
            task['description'] = "Complete this learning task and submit evidence."
        
        # Validate and normalize pillar
        if 'pillar' in task:
            try:
                task['pillar'] = normalize_pillar_name(task['pillar'])
            except ValueError:
                # If normalization fails, try to determine from content
                task['pillar'] = self._determine_pillar(task['title'], task['description'])
        else:
            # Try to determine pillar from content
            task['pillar'] = self._determine_pillar(task['title'], task['description'])
        
        # Validate XP value
        min_xp, max_xp = self.xp_ranges.get(difficulty, (50, 200))
        if 'xp_value' not in task or not isinstance(task['xp_value'], (int, float)):
            task['xp_value'] = min_xp + (index * 25)  # Progressive XP
        else:
            # Ensure XP is within range
            task['xp_value'] = max(min_xp, min(max_xp, int(task['xp_value'])))
        
        # Add task metadata
        task['order_index'] = index
        task['is_required'] = True
        
        # Validate evidence type
        valid_evidence_types = ['text', 'image', 'video', 'document']
        if 'evidence_type' not in task or task['evidence_type'] not in valid_evidence_types:
            task['evidence_type'] = 'text'
        
        return task
    
    def _determine_pillar(self, title: str, description: str) -> str:
        """Determine appropriate pillar based on task content"""
        
        content = f"{title} {description}".lower()
        
        # Keywords for each pillar
        pillar_keywords = {
            "STEM & Logic": ["math", "science", "technology", "engineering", "logic", "code", "data", "experiment", "calculate", "analyze"],
            "Life & Wellness": ["health", "wellness", "exercise", "nutrition", "mindfulness", "lifestyle", "habit", "fitness", "mental", "physical"],
            "Language & Communication": ["write", "speak", "language", "communicate", "present", "story", "essay", "debate", "discuss", "express"],
            "Society & Culture": ["community", "society", "culture", "history", "geography", "civic", "social", "global", "local", "tradition"],
            "Arts & Creativity": ["art", "creative", "design", "music", "draw", "paint", "craft", "perform", "compose", "artistic"]
        }
        
        # Count keyword matches
        pillar_scores = {}
        for pillar, keywords in pillar_keywords.items():
            score = sum(1 for keyword in keywords if keyword in content)
            pillar_scores[pillar] = score
        
        # Return pillar with highest score
        if max(pillar_scores.values()) > 0:
            return max(pillar_scores, key=pillar_scores.get)
        
        # Default to Language & Communication
        return "Language & Communication"
    
    async def generate_batch(
        self,
        count: int,
        mode: str,
        base_params: Dict,
        variations: Optional[List[Dict]] = None
    ) -> List[Dict]:
        """
        Generate multiple quests in batch
        
        Args:
            count: Number of quests to generate
            mode: Generation mode
            base_params: Base parameters for all quests
            variations: Optional list of parameter variations
        
        Returns:
            List of generated quests
        """
        
        quests = []
        
        for i in range(count):
            # Apply variations if provided
            params = base_params.copy()
            if variations and i < len(variations):
                params.update(variations[i])
            
            # Generate quest
            result = await self.generate_quest(mode, params)
            
            if result['success']:
                quests.append(result['quest'])
            else:
                print(f"Failed to generate quest {i+1}: {result.get('error')}")
        
        return quests
    
    async def enhance_submission(self, submission: Dict) -> Dict:
        """
        Enhance a student's quest submission with AI
        
        Args:
            submission: Student's quest submission data
        
        Returns:
            Enhanced quest data
        """
        
        prompt = f"""
        A student has submitted this quest idea:
        Title: {submission.get('title')}
        Description: {submission.get('description')}
        Suggested Tasks: {submission.get('suggested_tasks', [])}
        
        Please enhance this quest idea by:
        1. Improving the title and description for clarity
        2. Expanding the suggested tasks with clear instructions
        3. Assigning appropriate pillars and XP values
        4. Adding educational value while maintaining the student's vision
        
        Return the enhanced quest in the same JSON format as before.
        Maintain the student's core idea but make it more structured and educational.
        """
        
        try:
            response = self.model.generate_content(prompt)
            enhanced_quest = self._parse_quest_response(response.text)
            
            # Preserve original submission data
            enhanced_quest['original_submission_id'] = submission.get('id')
            enhanced_quest['submitted_by'] = submission.get('user_id')
            enhanced_quest['ai_enhanced'] = True
            
            return {
                'success': True,
                'quest': enhanced_quest,
                'original': submission
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'message': 'Failed to enhance submission'
            }
    
    def generate_quest_templates(self) -> List[Dict]:
        """Generate a library of quest templates for quick use"""
        
        templates = [
            {
                'name': 'Research Project',
                'description': 'Investigate a topic through research and documentation',
                'mode': 'topic',
                'base_params': {
                    'pillars': ['Language & Communication', 'Society & Culture'],
                    'difficulty': 'intermediate'
                }
            },
            {
                'name': 'Creative Expression',
                'description': 'Express ideas through various artistic mediums',
                'mode': 'skill',
                'base_params': {
                    'skills': ['creativity', 'expression', 'design'],
                    'pillars': ['Arts & Creativity'],
                    'difficulty': 'beginner'
                }
            },
            {
                'name': 'Problem Solving Challenge',
                'description': 'Tackle real-world problems with logical thinking',
                'mode': 'skill',
                'base_params': {
                    'skills': ['problem-solving', 'critical thinking', 'analysis'],
                    'pillars': ['STEM & Logic'],
                    'difficulty': 'advanced'
                }
            },
            {
                'name': 'Community Impact',
                'description': 'Make a positive difference in your community',
                'mode': 'topic',
                'base_params': {
                    'topic': 'community service and social impact',
                    'pillars': ['Society & Culture', 'Life & Wellness'],
                    'difficulty': 'intermediate'
                }
            },
            {
                'name': 'Personal Growth Journey',
                'description': 'Develop personal skills and healthy habits',
                'mode': 'skill',
                'base_params': {
                    'skills': ['self-improvement', 'goal-setting', 'reflection'],
                    'pillars': ['Life & Wellness'],
                    'difficulty': 'beginner'
                }
            }
        ]
        
        return templates