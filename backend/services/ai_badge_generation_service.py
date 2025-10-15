"""
AI Badge Generation Service
Automated badge creation using Gemini API with quality validation.
"""

from typing import Dict, List, Optional
import json
import os
from database import get_supabase_admin_client

# Import Gemini
try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True

    # Configure Gemini
    api_key = os.getenv('GEMINI_API_KEY')
    if api_key:
        genai.configure(api_key=api_key)
        gemini_model = genai.GenerativeModel('gemini-2.5-flash-lite')
    else:
        GEMINI_AVAILABLE = False
        gemini_model = None
except ImportError:
    GEMINI_AVAILABLE = False
    gemini_model = None


class AIBadgeGenerationService:
    """Service for AI-powered badge creation and validation."""

    # Core philosophy for badge creation
    CORE_PHILOSOPHY = """
    "The Process Is The Goal" - Focus on growth and learning journey, not outcomes.

    Language Guidelines:
    ✅ Use: "becoming", "exploring", "developing", "building skills in"
    ✅ Focus: Present growth, internal motivation, process celebration
    ❌ Avoid: "prepare for", "prove to", "ahead of peers", career outcomes

    Identity statements should inspire and celebrate who students are becoming.
    """

    @staticmethod
    def generate_badge(parameters: Dict) -> Dict:
        """
        Create new badge with AI (Gemini).

        Args:
            parameters: Dictionary with:
                - target_gap: What content gap to fill
                - trending_topic: Current student interest
                - pillar_focus: Specific pillar to target (optional)
                - seasonal_context: Time-based relevance (optional)

        Returns:
            Badge data with quality score
        """
        if not GEMINI_AVAILABLE or not gemini_model:
            raise ValueError("Gemini API not available. Set GEMINI_API_KEY environment variable.")

        # Build generation prompt
        prompt = AIBadgeGenerationService._build_badge_generation_prompt(parameters)

        try:
            # Call Gemini
            response = gemini_model.generate_content(prompt)
            badge_json = AIBadgeGenerationService._extract_json(response.text)

            if not badge_json:
                raise ValueError("Failed to parse Gemini response as JSON")

            # Validate quality
            quality = AIBadgeGenerationService.validate_badge_quality(badge_json)

            badge_json['quality_score'] = quality['overall_score']
            badge_json['quality_feedback'] = quality

            return badge_json

        except Exception as e:
            raise ValueError(f"Badge generation failed: {str(e)}")

    @staticmethod
    def validate_badge_quality(badge_data: Dict) -> Dict:
        """
        QA check for badge quality using AI.

        Args:
            badge_data: Badge JSON to validate

        Returns:
            Quality assessment with scores and feedback
        """
        if not GEMINI_AVAILABLE or not gemini_model:
            # Fallback to simple validation
            return AIBadgeGenerationService._simple_validation(badge_data)

        prompt = f"""
Evaluate this badge for quality and appropriateness.

Badge Data:
{json.dumps(badge_data, indent=2)}

Rate on scale of 0.0 to 1.0 for:
1. Clarity (is it clear what this badge represents?)
2. Engagement (will students find this interesting?)
3. Pedagogical Soundness (does it support learning effectively?)
4. Age Appropriateness (suitable for 13-18?)
5. Philosophy Alignment (matches "Process Is The Goal"?)
6. Diploma Relevance (connects to academic subjects?)

Identify:
- Strengths (2-3 points)
- Weaknesses (2-3 points)
- Required Fixes (if any)
- Improvement Suggestions

Core Philosophy Check:
{AIBadgeGenerationService.CORE_PHILOSOPHY}

Output Format (JSON):
{{
  "overall_score": 0.85,
  "dimension_scores": {{
    "clarity": 0.9,
    "engagement": 0.8,
    "pedagogy": 0.85,
    "age_appropriate": 0.9,
    "philosophy_aligned": 0.8,
    "diploma_relevant": 0.85
  }},
  "strengths": ["...", "..."],
  "weaknesses": ["...", "..."],
  "required_fixes": ["..."],
  "suggestions": ["...", "..."],
  "recommendation": "publish" or "review" or "reject"
}}
"""

        try:
            response = gemini_model.generate_content(prompt)
            quality_json = AIBadgeGenerationService._extract_json(response.text)

            if quality_json:
                return quality_json
            else:
                return AIBadgeGenerationService._simple_validation(badge_data)

        except Exception as e:
            print(f"Quality validation error: {e}")
            return AIBadgeGenerationService._simple_validation(badge_data)

    @staticmethod
    def create_initial_quests(badge_id: str, count: int = 12) -> List[Dict]:
        """
        Generate starter quests for new badge.

        Args:
            badge_id: Badge ID
            count: Number of quests to generate

        Returns:
            List of generated quest data
        """
        if not GEMINI_AVAILABLE or not gemini_model:
            raise ValueError("Gemini API not available")

        supabase = get_supabase_admin_client()

        # Get badge details
        badge = supabase.table('badges').select('*').eq('id', badge_id).single().execute()

        if not badge.data:
            raise ValueError(f"Badge {badge_id} not found")

        badge_data = badge.data

        prompt = f"""
Generate {count} diverse learning quests for this badge:

Badge: {badge_data['name']}
Identity Statement: {badge_data['identity_statement']}
Description: {badge_data['description']}
Primary Pillar: {badge_data['pillar_primary']}

Requirements:
- Create {count} varied quest types
- Range of complexity levels (beginner, intermediate, advanced)
- Each quest should have 4-6 tasks
- Include XP distribution across tasks
- Map to diploma credits (1000 XP = 1 credit)
- Provide learning resources for each task

Core Philosophy:
{AIBadgeGenerationService.CORE_PHILOSOPHY}

Output Format (JSON array):
[
  {{
    "title": "Quest Title",
    "description": "Engaging description (2-3 sentences)",
    "complexity_level": "beginner|intermediate|advanced",
    "estimated_xp": 400,
    "estimated_hours": 8,
    "tasks": [
      {{
        "title": "Task title",
        "description": "What to do",
        "evidence_prompt": "What to submit",
        "pillar": "Pillar name",
        "xp_amount": 80,
        "subject_xp_distribution": {{"math": 60, "science": 20}},
        "materials_needed": ["Resource 1", "Resource 2"]
      }}
    ]
  }}
]
"""

        try:
            response = gemini_model.generate_content(prompt)
            quests_json = AIBadgeGenerationService._extract_json(response.text)

            if not quests_json:
                raise ValueError("Failed to parse quest generation response")

            return quests_json

        except Exception as e:
            raise ValueError(f"Quest generation failed: {str(e)}")

    @staticmethod
    def analyze_content_gaps() -> Dict:
        """
        Identify missing badges in content library.

        Returns:
            Analysis of content gaps with recommendations
        """
        supabase = get_supabase_admin_client()

        # Get all existing badges
        badges = supabase.table('badges').select('pillar_primary').eq('status', 'active').execute()

        # Count badges per pillar
        pillar_counts = {}
        for badge in badges.data:
            pillar = badge['pillar_primary']
            pillar_counts[pillar] = pillar_counts.get(pillar, 0) + 1

        # Define target counts per pillar (balanced library)
        target_per_pillar = 5

        # Identify gaps
        gaps = []
        for pillar in ['STEM & Logic', 'Life & Wellness', 'Language & Communication',
                       'Society & Culture', 'Arts & Creativity']:
            current = pillar_counts.get(pillar, 0)
            gap = max(0, target_per_pillar - current)
            if gap > 0:
                gaps.append({
                    'pillar': pillar,
                    'current_count': current,
                    'target_count': target_per_pillar,
                    'gap': gap,
                    'priority': 'high' if gap >= 3 else 'medium' if gap >= 2 else 'low'
                })

        # Get student interest trends (from recent quest starts)
        from datetime import datetime, timedelta
        week_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()

        # This is simplified - in production, analyze actual task completions
        trending_topics = [
            {'topic': 'Game Design', 'interest_score': 0.8},
            {'topic': 'Environmental Science', 'interest_score': 0.7},
            {'topic': 'Creative Writing', 'interest_score': 0.75}
        ]

        return {
            'pillar_gaps': sorted(gaps, key=lambda x: x['gap'], reverse=True),
            'trending_topics': trending_topics,
            'total_badges': len(badges.data),
            'recommendations': [
                f"Create {gap['gap']} more badges in {gap['pillar']}"
                for gap in gaps if gap['gap'] > 0
            ]
        }

    @staticmethod
    def _build_badge_generation_prompt(parameters: Dict) -> str:
        """Build detailed Gemini prompt for badge generation."""

        gap_info = parameters.get('target_gap', 'General learning exploration')
        trending = parameters.get('trending_topic', 'Student interests')
        pillar = parameters.get('pillar_focus', 'Any pillar')
        seasonal = parameters.get('seasonal_context', '')

        prompt = f"""
Create an identity-based learning badge for teenage students (ages 13-18).

Context:
- Content Gap: {gap_info}
- Student Interest Trend: {trending}
- Pillar Focus: {pillar}
{f"- Seasonal Factor: {seasonal}" if seasonal else ""}

Core Philosophy:
{AIBadgeGenerationService.CORE_PHILOSOPHY}

Badge Requirements:
- Identity Statement: Craft a compelling "I am a...", "I can...", or "I have..." statement
- Name: Creative, aspirational title (2-4 words)
- Description: 2-3 engaging sentences about this learning path
- Pillar Alignment: Map to one of these pillars as primary:
  * STEM & Logic
  * Life & Wellness
  * Language & Communication
  * Society & Culture
  * Arts & Creativity
- Pillar Weights: Distribute 100 points across pillars (primary gets most)
- Requirements: Set min_quests (5-10) and min_xp (1500-3000)
- Diploma Relevance: Connect to academic subjects
- Real-World Application: Explain practical value

Output Format (JSON):
{{
  "name": "Creative Storyteller",
  "identity_statement": "I am a storyteller who brings ideas to life through words",
  "description": "Explore the art of narrative by creating stories across different genres and mediums. Develop your unique voice while learning the craft of compelling storytelling.",
  "pillar_primary": "Language & Communication",
  "pillar_weights": {{"Language & Communication": 60, "Arts & Creativity": 30, "Society & Culture": 10}},
  "min_quests": 8,
  "min_xp": 2000,
  "portfolio_requirement": "Create a portfolio of 5 diverse stories showcasing different styles",
  "ai_generated": true,
  "status": "beta"
}}

Use encouraging, process-focused language. Avoid future-promises or external validation.
Make it inspiring for teenagers exploring who they're becoming.
"""

        return prompt

    @staticmethod
    def _extract_json(text: str) -> Optional[Dict]:
        """Extract JSON from Gemini response."""

        # Try to find JSON in code blocks
        if '```json' in text:
            start = text.find('```json') + 7
            end = text.find('```', start)
            json_str = text[start:end].strip()
        elif '```' in text:
            start = text.find('```') + 3
            end = text.find('```', start)
            json_str = text[start:end].strip()
        else:
            # Try to find JSON directly
            json_str = text.strip()

        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            # Try to find first { and last }
            try:
                start = text.find('{')
                end = text.rfind('}') + 1
                if start >= 0 and end > start:
                    return json.loads(text[start:end])
            except:
                pass

        return None

    @staticmethod
    def _simple_validation(badge_data: Dict) -> Dict:
        """Simple validation without AI (fallback)."""

        required_fields = ['name', 'identity_statement', 'description', 'pillar_primary']

        score = 0.7  # Base score
        strengths = []
        weaknesses = []
        required_fixes = []

        # Check required fields
        for field in required_fields:
            if field not in badge_data or not badge_data[field]:
                required_fixes.append(f"Missing required field: {field}")
                score -= 0.15

        # Check identity statement format
        identity = badge_data.get('identity_statement', '')
        if identity and any(starter in identity.lower() for starter in ['i am', 'i can', 'i have']):
            strengths.append("Identity statement uses proper format")
        else:
            weaknesses.append("Identity statement should start with 'I am', 'I can', or 'I have'")
            score -= 0.1

        # Check description length
        description = badge_data.get('description', '')
        if 50 <= len(description) <= 300:
            strengths.append("Description has appropriate length")
        else:
            weaknesses.append("Description should be 2-3 sentences (50-300 characters)")

        # Check XP requirements
        min_xp = badge_data.get('min_xp', 0)
        if 1000 <= min_xp <= 5000:
            strengths.append("XP requirement is reasonable")
        else:
            weaknesses.append("XP should be between 1000-5000 for balanced progression")
            score -= 0.05

        recommendation = 'publish' if score >= 0.85 else 'review' if score >= 0.6 else 'reject'

        return {
            'overall_score': round(score, 2),
            'dimension_scores': {
                'clarity': round(score, 2),
                'engagement': round(score - 0.1, 2),
                'pedagogy': round(score, 2),
                'age_appropriate': round(score + 0.1, 2),
                'philosophy_aligned': round(score - 0.05, 2),
                'diploma_relevant': round(score, 2)
            },
            'strengths': strengths,
            'weaknesses': weaknesses,
            'required_fixes': required_fixes,
            'suggestions': ['Review with AI for detailed feedback'] if score < 0.85 else [],
            'recommendation': recommendation
        }
