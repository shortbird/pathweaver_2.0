"""
AI-powered quest generation service using Google Gemini API.
Provides intelligent assistance for creating quests, tasks, and educational content.
"""

import json
import re
import os
from typing import Dict, List, Optional, Any, Tuple
import google.generativeai as genai

class QuestAIService:
    """Service for AI-powered quest generation using Gemini API"""
    
    def __init__(self):
        """Initialize the AI service with Gemini configuration"""
        self.api_key = os.getenv('GOOGLE_API_KEY') or os.getenv('GEMINI_API_KEY')
        self.model_name = os.getenv('GEMINI_MODEL', 'gemini-1.5-flash')
        
        if not self.api_key:
            raise ValueError("GOOGLE_API_KEY not configured. Set GEMINI_API_KEY environment variable.")
        
        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel(self.model_name)
        
        # Valid pillars for validation
        self.valid_pillars = [
            'STEM & Logic',
            'Life & Wellness', 
            'Language & Communication',
            'Society & Culture',
            'Arts & Creativity'
        ]
        
        # Subcategories mapping
        self.subcategories_by_pillar = {
            'Arts & Creativity': ['Visual Arts', 'Music', 'Drama & Theater', 'Creative Writing', 'Digital Media', 'Design'],
            'STEM & Logic': ['Mathematics', 'Biology', 'Chemistry', 'Physics', 'Computer Science', 'Engineering', 'Data Science'],
            'Language & Communication': ['English', 'Foreign Languages', 'Journalism', 'Public Speaking', 'Digital Communication', 'Literature'],
            'Society & Culture': ['History', 'Geography', 'Social Studies', 'World Cultures', 'Civics & Government', 'Psychology', 'Sociology'],
            'Life & Wellness': ['Physical Education', 'Health & Nutrition', 'Personal Finance', 'Life Skills', 'Mental Wellness', 'Outdoor Education', 'Sports & Athletics']
        }
    
    def generate_quest_from_topic(self, topic: str, age_level: str = "high school", 
                                learning_objectives: Optional[str] = None) -> Dict[str, Any]:
        """
        Generate a complete quest structure from a topic.
        
        Args:
            topic: The subject or topic for the quest
            age_level: Target age level (elementary, middle school, high school, college)
            learning_objectives: Optional specific learning goals
            
        Returns:
            Dict containing quest structure with title, description, and tasks
        """
        try:
            prompt = self._build_quest_generation_prompt(topic, age_level, learning_objectives)
            
            response = self.model.generate_content(prompt)
            if not response or not response.text:
                raise Exception("Empty response from Gemini API")
            
            # Parse the response and validate structure
            quest_data = self._parse_quest_response(response.text)
            quest_data = self._validate_and_fix_quest_data(quest_data)
            
            return {
                'success': True,
                'quest': quest_data,
                'ai_generated': True
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f"Failed to generate quest: {str(e)}",
                'quest': None
            }
    
    def enhance_quest_description(self, title: str, current_description: str) -> Dict[str, str]:
        """
        Enhance an existing quest description to be more engaging and detailed.
        
        Args:
            title: Quest title
            current_description: Current description to enhance
            
        Returns:
            Dict with enhanced description
        """
        try:
            prompt = f"""
            Enhance this educational quest description to be more engaging, specific, and pedagogically sound:

            Title: {title}
            Current Description: {current_description}

            Please provide an enhanced version that:
            - Is engaging and motivating for students
            - Clearly explains the learning value
            - Includes specific outcomes students will achieve
            - Uses active, positive language
            - Is 2-3 sentences long
            - Avoids generic educational jargon

            Return only the enhanced description, no additional text.
            """
            
            response = self.model.generate_content(prompt)
            enhanced_description = response.text.strip()
            
            return {
                'success': True,
                'enhanced_description': enhanced_description
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f"Failed to enhance description: {str(e)}",
                'enhanced_description': current_description
            }
    
    def suggest_tasks_for_quest(self, title: str, description: str, 
                               target_task_count: int = 4) -> Dict[str, Any]:
        """
        Generate specific tasks for a quest based on title and description.
        
        Args:
            title: Quest title
            description: Quest description
            target_task_count: Number of tasks to generate (3-6)
            
        Returns:
            Dict containing list of suggested tasks
        """
        try:
            target_task_count = max(3, min(6, target_task_count))
            
            prompt = f"""
            Create {target_task_count} specific, measurable tasks for this educational quest:

            Quest Title: {title}
            Quest Description: {description}

            For each task, provide:
            - title: Clear, action-oriented task name (max 100 chars)
            - description: Detailed explanation of what students do (100-200 words)
            - pillar: One of [{', '.join(self.valid_pillars)}]
            - subcategory: Appropriate subcategory for the pillar
            - xp_value: XP points (50-300 based on complexity)
            - evidence_prompt: Specific instructions for what evidence to submit

            Tasks should:
            - Build upon each other logically
            - Cover different skill areas when possible
            - Be achievable but challenging
            - Have clear, measurable outcomes
            - Require specific evidence/deliverables

            Return as valid JSON array with these exact field names.
            """
            
            response = self.model.generate_content(prompt)
            tasks_data = self._parse_tasks_response(response.text)
            tasks_data = self._validate_tasks_data(tasks_data)
            
            return {
                'success': True,
                'tasks': tasks_data
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f"Failed to generate tasks: {str(e)}",
                'tasks': []
            }
    
    def validate_quest_quality(self, quest_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze quest data and provide quality feedback and suggestions.
        
        Args:
            quest_data: Complete quest data structure
            
        Returns:
            Dict with quality score and improvement suggestions
        """
        try:
            prompt = f"""
            Analyze this educational quest for quality and pedagogical soundness:

            Quest Data: {json.dumps(quest_data, indent=2)}

            Evaluate:
            1. Learning progression (do tasks build logically?)
            2. Skill coverage (are multiple pillars represented?)
            3. XP balance (are points distributed fairly?)
            4. Evidence requirements (are they specific and measurable?)
            5. Age appropriateness
            6. Engagement factor

            Provide:
            - quality_score: Number from 1-10
            - strengths: List of 2-3 positive aspects
            - improvements: List of 2-3 specific suggestions
            - missing_elements: Any critical missing components

            Return as valid JSON with these exact field names.
            """
            
            response = self.model.generate_content(prompt)
            feedback = self._parse_validation_response(response.text)
            
            return {
                'success': True,
                'feedback': feedback
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f"Failed to validate quest: {str(e)}",
                'feedback': {
                    'quality_score': 5,
                    'strengths': [],
                    'improvements': ['AI validation unavailable'],
                    'missing_elements': []
                }
            }
    
    def _build_quest_generation_prompt(self, topic: str, age_level: str, 
                                     learning_objectives: Optional[str]) -> str:
        """Build the main quest generation prompt"""
        objectives_text = f"\nLearning Objectives: {learning_objectives}" if learning_objectives else ""
        
        return f"""
        Create an educational quest for {age_level} students on the topic: {topic}{objectives_text}

        Generate a complete quest with:
        1. title: Action-oriented quest name (Design a website, Build a robot, etc.)
        2. big_idea: Compelling 2-3 sentence description explaining the quest's value
        3. tasks: Array of 4-5 specific tasks, each with:
           - title: Clear task name
           - description: Detailed explanation (100-200 words)
           - pillar: One of [{', '.join(self.valid_pillars)}]
           - subcategory: Appropriate subcategory for the pillar
           - xp_value: Points 50-300 based on complexity and time
           - evidence_prompt: Suggestions for how they can demonstrate completion (e.g. "Submit a photo of your model", "Write a 200-word reflection")
           - order_index: Sequential number starting from 1

        Requirements:
        - Tasks should build upon each other logically
        - Cover multiple skill pillars when possible
        - Be appropriate for {age_level} level
        - Have measurable, specific outcomes
        - Total XP should be 400-1200 points
        - Evidence prompts must be specific (not just "submit your work")

        Return as valid JSON with exact field names shown above.
        """
    
    def _parse_quest_response(self, response_text: str) -> Dict[str, Any]:
        """Parse and extract quest data from AI response"""
        try:
            # Try to find JSON in the response
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                json_str = json_match.group()
                return json.loads(json_str)
            else:
                # Fallback: try to parse the whole response as JSON
                return json.loads(response_text)
        except json.JSONDecodeError:
            # If JSON parsing fails, create a fallback structure
            return {
                'title': 'Generated Quest',
                'big_idea': 'This quest was generated by AI but parsing failed.',
                'tasks': []
            }
    
    def _parse_tasks_response(self, response_text: str) -> List[Dict[str, Any]]:
        """Parse tasks from AI response"""
        try:
            # Try to find JSON array in the response
            json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
            if json_match:
                json_str = json_match.group()
                return json.loads(json_str)
            else:
                return json.loads(response_text)
        except json.JSONDecodeError:
            return []
    
    def _parse_validation_response(self, response_text: str) -> Dict[str, Any]:
        """Parse validation feedback from AI response"""
        try:
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                json_str = json_match.group()
                return json.loads(json_str)
            else:
                return json.loads(response_text)
        except json.JSONDecodeError:
            return {
                'quality_score': 5,
                'strengths': ['AI analysis unavailable'],
                'improvements': ['Could not parse AI feedback'],
                'missing_elements': []
            }
    
    def _validate_and_fix_quest_data(self, quest_data: Dict[str, Any]) -> Dict[str, Any]:
        """Validate and fix quest data structure and values"""
        # Ensure required fields exist
        if 'title' not in quest_data:
            quest_data['title'] = 'AI Generated Quest'
        
        if 'big_idea' not in quest_data:
            quest_data['big_idea'] = 'An engaging educational quest created with AI assistance.'
        
        if 'tasks' not in quest_data:
            quest_data['tasks'] = []
        
        # Validate and fix tasks
        quest_data['tasks'] = self._validate_tasks_data(quest_data['tasks'])
        
        return quest_data
    
    def _validate_tasks_data(self, tasks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Validate and fix task data"""
        validated_tasks = []
        
        for i, task in enumerate(tasks):
            # Ensure required fields
            validated_task = {
                'title': task.get('title', f'Task {i+1}'),
                'description': task.get('description', 'Complete this task.'),
                'pillar': self._validate_pillar(task.get('pillar', 'STEM & Logic')),
                'subcategory': self._validate_subcategory(task.get('pillar', 'STEM & Logic'), task.get('subcategory', '')),
                'xp_value': self._validate_xp(task.get('xp_value', 100)),
                'evidence_prompt': task.get('evidence_prompt', 'Provide evidence of your completed work.'),
                'materials_needed': task.get('materials_needed', []),
                'order_index': task.get('order_index', i + 1)
            }
            
            validated_tasks.append(validated_task)
        
        return validated_tasks
    
    def _validate_pillar(self, pillar: str) -> str:
        """Validate pillar value, return normalized version or default"""
        if not pillar:
            return 'STEM & Logic'
        
        # Check if pillar is already valid
        if pillar in self.valid_pillars:
            return pillar
        
        # Fuzzy matching for common variations
        pillar_lower = pillar.lower()
        if 'stem' in pillar_lower or 'math' in pillar_lower or 'science' in pillar_lower:
            return 'STEM & Logic'
        elif 'art' in pillar_lower or 'creative' in pillar_lower:
            return 'Arts & Creativity'
        elif 'language' in pillar_lower or 'communication' in pillar_lower:
            return 'Language & Communication'
        elif 'society' in pillar_lower or 'culture' in pillar_lower or 'history' in pillar_lower:
            return 'Society & Culture'
        elif 'life' in pillar_lower or 'wellness' in pillar_lower or 'health' in pillar_lower:
            return 'Life & Wellness'
        
        return 'STEM & Logic'  # Default fallback
    
    def _validate_subcategory(self, pillar: str, subcategory: str) -> str:
        """Validate subcategory for the given pillar"""
        if not subcategory:
            # Return first subcategory for the pillar as default
            return self.subcategories_by_pillar.get(pillar, ['General'])[0]
        
        # Check if subcategory is valid for the pillar
        valid_subcategories = self.subcategories_by_pillar.get(pillar, [])
        if subcategory in valid_subcategories:
            return subcategory
        
        # Return default for pillar
        return valid_subcategories[0] if valid_subcategories else 'General'
    
    def _validate_xp(self, xp_value: Any) -> int:
        """Validate and normalize XP value"""
        try:
            xp = int(xp_value) if xp_value else 100
            return max(50, min(500, xp))  # Clamp between 50-500
        except (ValueError, TypeError):
            return 100