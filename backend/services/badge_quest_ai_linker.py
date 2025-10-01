"""
Badge-Quest AI Linking Service
Automatically analyzes and suggests quest-to-badge mappings using AI.
"""

import json
import os
from typing import Dict, List, Optional, Any, Tuple
import google.generativeai as genai
from database import get_supabase_admin_client


class BadgeQuestAILinker:
    """AI-powered service for intelligent badge-quest linking"""

    def __init__(self):
        """Initialize the AI service with Gemini configuration"""
        self.api_key = os.getenv('GOOGLE_API_KEY') or os.getenv('GEMINI_API_KEY')
        self.model_name = os.getenv('GEMINI_MODEL', 'gemini-1.5-flash')

        if not self.api_key:
            raise ValueError("GOOGLE_API_KEY not configured. Set GEMINI_API_KEY environment variable.")

        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel(self.model_name)

        # Valid pillars
        self.valid_pillars = [
            'STEM & Logic',
            'Life & Wellness',
            'Language & Communication',
            'Society & Culture',
            'Arts & Creativity'
        ]

    def analyze_quest_for_badge(
        self,
        quest: Dict[str, Any],
        badge: Dict[str, Any],
        quest_tasks: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Analyze if a quest is suitable for a badge using AI.

        Args:
            quest: Quest data (title, description, etc)
            badge: Badge data (name, identity_statement, pillars, etc)
            quest_tasks: List of tasks for the quest with pillar and xp_value

        Returns:
            Dict with confidence score, reasoning, and recommendation
        """
        try:
            # Calculate quest metadata
            total_xp = sum(task.get('xp_value', 0) for task in quest_tasks)
            pillar_distribution = self._calculate_pillar_distribution(quest_tasks)

            prompt = self._build_analysis_prompt(quest, badge, quest_tasks, total_xp, pillar_distribution)

            response = self.model.generate_content(prompt)
            if not response or not response.text:
                raise Exception("Empty response from Gemini API")

            # Parse AI response
            analysis = self._parse_analysis_response(response.text)

            # Add metadata
            analysis['quest_id'] = quest['id']
            analysis['quest_title'] = quest['title']
            analysis['badge_id'] = badge['id']
            analysis['badge_name'] = badge['name']
            analysis['total_xp'] = total_xp
            analysis['task_count'] = len(quest_tasks)

            return analysis

        except Exception as e:
            print(f"Error analyzing quest {quest.get('id')}: {str(e)}")
            return {
                'quest_id': quest['id'],
                'quest_title': quest.get('title', 'Unknown'),
                'badge_id': badge['id'],
                'badge_name': badge['name'],
                'confidence': 0,
                'pillar_alignment': 0,
                'skill_match': 0,
                'xp_appropriateness': 0,
                'recommendation': 'error',
                'reasoning': f'Analysis failed: {str(e)}',
                'error': True
            }

    def analyze_all_quests_for_badge(
        self,
        badge_id: str,
        min_confidence: int = 70
    ) -> Dict[str, Any]:
        """
        Analyze all active quests to find suitable matches for a badge.

        Args:
            badge_id: Badge UUID to analyze quests for
            min_confidence: Minimum confidence score to recommend (0-100)

        Returns:
            Dict with recommendations, statistics, and analysis results
        """
        supabase = get_supabase_admin_client()

        # Get badge details
        badge_result = supabase.table('badges').select('*').eq('id', badge_id).single().execute()
        if not badge_result.data:
            raise ValueError(f"Badge {badge_id} not found")

        badge = badge_result.data

        # Get all active quests
        quests_result = supabase.table('quests').select('*').eq('is_active', True).execute()
        quests = quests_result.data or []

        # Get already linked quests
        existing_links = supabase.table('badge_quests')\
            .select('quest_id')\
            .eq('badge_id', badge_id)\
            .execute()

        existing_quest_ids = {link['quest_id'] for link in (existing_links.data or [])}

        # Analyze each unlinked quest
        recommendations = []
        total_analyzed = 0

        for quest in quests:
            # Skip already linked quests
            if quest['id'] in existing_quest_ids:
                continue

            # Get quest tasks
            tasks_result = supabase.table('quest_tasks')\
                .select('*')\
                .eq('quest_id', quest['id'])\
                .order('order_index')\
                .execute()

            quest_tasks = tasks_result.data or []

            if not quest_tasks:
                continue  # Skip quests without tasks

            # Analyze this quest
            analysis = self.analyze_quest_for_badge(quest, badge, quest_tasks)
            total_analyzed += 1

            # Add to recommendations if meets confidence threshold
            if analysis['confidence'] >= min_confidence and not analysis.get('error'):
                recommendations.append(analysis)

        # Sort by confidence score (descending)
        recommendations.sort(key=lambda x: x['confidence'], reverse=True)

        return {
            'badge_id': badge_id,
            'badge_name': badge['name'],
            'total_quests_analyzed': total_analyzed,
            'total_already_linked': len(existing_quest_ids),
            'recommendations_count': len(recommendations),
            'min_confidence_threshold': min_confidence,
            'recommendations': recommendations,
            'statistics': {
                'high_confidence': len([r for r in recommendations if r['confidence'] >= 85]),
                'medium_confidence': len([r for r in recommendations if 70 <= r['confidence'] < 85]),
                'low_confidence': len([r for r in recommendations if r['confidence'] < 70]),
                'avg_confidence': sum(r['confidence'] for r in recommendations) / len(recommendations) if recommendations else 0
            }
        }

    def analyze_all_badges_bulk(
        self,
        min_confidence: int = 70,
        max_per_badge: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Analyze all active badges and generate quest recommendations for each.

        Args:
            min_confidence: Minimum confidence score to recommend (0-100)
            max_per_badge: Maximum recommendations per badge (None = unlimited)

        Returns:
            Dict with all badge analyses and aggregate statistics
        """
        supabase = get_supabase_admin_client()

        # Get all active badges
        badges_result = supabase.table('badges').select('*').eq('status', 'active').execute()
        badges = badges_result.data or []

        results = {
            'total_badges': len(badges),
            'badges_analyzed': 0,
            'total_recommendations': 0,
            'badge_results': []
        }

        for badge in badges:
            try:
                analysis = self.analyze_all_quests_for_badge(badge['id'], min_confidence)

                # Limit recommendations if specified
                if max_per_badge and len(analysis['recommendations']) > max_per_badge:
                    analysis['recommendations'] = analysis['recommendations'][:max_per_badge]
                    analysis['recommendations_count'] = max_per_badge
                    analysis['truncated'] = True

                results['badge_results'].append(analysis)
                results['badges_analyzed'] += 1
                results['total_recommendations'] += len(analysis['recommendations'])

            except Exception as e:
                print(f"Error analyzing badge {badge['id']}: {str(e)}")
                results['badge_results'].append({
                    'badge_id': badge['id'],
                    'badge_name': badge.get('name', 'Unknown'),
                    'error': str(e),
                    'recommendations': []
                })

        return results

    def auto_link_recommendations(
        self,
        badge_id: str,
        recommendations: List[Dict[str, Any]],
        dry_run: bool = False
    ) -> Dict[str, Any]:
        """
        Automatically link recommended quests to a badge.

        Args:
            badge_id: Badge UUID
            recommendations: List of recommendation objects from analysis
            dry_run: If True, don't actually create links (preview mode)

        Returns:
            Dict with linking results
        """
        supabase = get_supabase_admin_client()

        if dry_run:
            return {
                'dry_run': True,
                'badge_id': badge_id,
                'would_link': len(recommendations),
                'recommendations': recommendations
            }

        # Create links
        links_created = []
        links_failed = []

        for idx, rec in enumerate(recommendations):
            try:
                link_data = {
                    'badge_id': badge_id,
                    'quest_id': rec['quest_id'],
                    'is_required': False,  # All AI-linked quests are optional
                    'order_index': idx,
                    'ai_confidence': rec['confidence'],
                    'ai_reasoning': rec.get('reasoning', '')
                }

                result = supabase.table('badge_quests').insert(link_data).execute()

                if result.data:
                    links_created.append({
                        'quest_id': rec['quest_id'],
                        'quest_title': rec['quest_title'],
                        'confidence': rec['confidence']
                    })

            except Exception as e:
                links_failed.append({
                    'quest_id': rec['quest_id'],
                    'quest_title': rec.get('quest_title', 'Unknown'),
                    'error': str(e)
                })

        return {
            'badge_id': badge_id,
            'links_created': len(links_created),
            'links_failed': len(links_failed),
            'created': links_created,
            'failed': links_failed
        }

    def _calculate_pillar_distribution(self, tasks: List[Dict[str, Any]]) -> Dict[str, float]:
        """Calculate XP distribution across pillars for quest tasks"""
        distribution = {}
        total_xp = 0

        for task in tasks:
            pillar = task.get('pillar', 'Unknown')
            xp = task.get('xp_value', 0)
            distribution[pillar] = distribution.get(pillar, 0) + xp
            total_xp += xp

        # Convert to percentages
        if total_xp > 0:
            for pillar in distribution:
                distribution[pillar] = round((distribution[pillar] / total_xp) * 100, 1)

        return distribution

    def _build_analysis_prompt(
        self,
        quest: Dict[str, Any],
        badge: Dict[str, Any],
        tasks: List[Dict[str, Any]],
        total_xp: int,
        pillar_distribution: Dict[str, float]
    ) -> str:
        """Build the AI prompt for quest-badge analysis"""

        tasks_summary = "\n".join([
            f"  - {task.get('title', 'Untitled')}: {task.get('pillar', 'Unknown')} pillar, {task.get('xp_value', 0)} XP"
            for task in tasks[:5]  # Limit to first 5 tasks to save tokens
        ])

        if len(tasks) > 5:
            tasks_summary += f"\n  ... and {len(tasks) - 5} more tasks"

        pillar_dist_str = ", ".join([f"{pillar}: {pct}%" for pillar, pct in pillar_distribution.items()])

        return f"""You are an educational content expert analyzing if a quest should count toward earning a badge.

BADGE INFORMATION:
Name: {badge['name']}
Identity Statement: {badge['identity_statement']}
Description: {badge['description']}
Primary Pillar: {badge['pillar_primary']}
Requirements: {badge['min_quests']} quests minimum, {badge['min_xp']} XP minimum

QUEST INFORMATION:
Title: {quest['title']}
Description: {quest.get('description', 'No description')}
Total XP: {total_xp}
Number of Tasks: {len(tasks)}
Pillar Distribution: {pillar_dist_str}

TASKS:
{tasks_summary}

ANALYSIS REQUIRED:
Evaluate if this quest is appropriate for this badge on the following criteria:

1. Pillar Alignment (0-100): How well do the quest's pillars match the badge's primary pillar?
2. Skill Development Match (0-100): Does completing this quest develop the skills described in the badge's identity statement?
3. XP Appropriateness (0-100): Is the quest's XP value reasonable given the badge's XP requirement?
4. Overall Confidence (0-100): Your overall confidence that this quest should count toward the badge

5. Brief Reasoning: One sentence explaining your recommendation

IMPORTANT:
- A quest doesn't need to be PERFECT to qualify - badges are flexible
- Students can complete ANY {badge['min_quests']} quests to earn the badge
- Cross-pillar quests are valuable if they develop relevant skills
- Consider if the quest genuinely contributes to the badge's identity

Return ONLY valid JSON in this exact format:
{{
  "pillar_alignment": <number 0-100>,
  "skill_match": <number 0-100>,
  "xp_appropriateness": <number 0-100>,
  "confidence": <number 0-100>,
  "recommendation": "<recommend|maybe|reject>",
  "reasoning": "<one sentence explanation>"
}}"""

    def _parse_analysis_response(self, response_text: str) -> Dict[str, Any]:
        """Parse AI response into structured analysis data"""
        try:
            # Try to extract JSON from response
            json_match = json.loads(response_text)

            # Validate required fields
            required_fields = ['pillar_alignment', 'skill_match', 'xp_appropriateness', 'confidence', 'recommendation', 'reasoning']
            for field in required_fields:
                if field not in json_match:
                    raise ValueError(f"Missing required field: {field}")

            # Ensure numeric fields are integers
            for field in ['pillar_alignment', 'skill_match', 'xp_appropriateness', 'confidence']:
                json_match[field] = int(json_match[field])
                # Clamp to 0-100
                json_match[field] = max(0, min(100, json_match[field]))

            # Validate recommendation
            if json_match['recommendation'] not in ['recommend', 'maybe', 'reject']:
                json_match['recommendation'] = 'maybe'

            return json_match

        except json.JSONDecodeError:
            # Try to find JSON in the response text
            import re
            json_pattern = r'\{[^{}]*\}'
            matches = re.findall(json_pattern, response_text, re.DOTALL)

            if matches:
                try:
                    return self._parse_analysis_response(matches[0])
                except:
                    pass

            # Fallback: return low confidence
            return {
                'pillar_alignment': 0,
                'skill_match': 0,
                'xp_appropriateness': 0,
                'confidence': 0,
                'recommendation': 'reject',
                'reasoning': 'Failed to parse AI response'
            }
        except Exception as e:
            print(f"Error parsing AI response: {str(e)}")
            return {
                'pillar_alignment': 0,
                'skill_match': 0,
                'xp_appropriateness': 0,
                'confidence': 0,
                'recommendation': 'reject',
                'reasoning': f'Parse error: {str(e)}'
            }
