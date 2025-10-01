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
        self.model_name = os.getenv('GEMINI_MODEL', 'gemini-2.5-flash-lite')

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
        min_confidence: int = 70,
        max_to_analyze: int = 50
    ) -> Dict[str, Any]:
        """
        Analyze active quests to find suitable matches for a badge.

        Args:
            badge_id: Badge UUID to analyze quests for
            min_confidence: Minimum confidence score to recommend (0-100)
            max_to_analyze: Maximum number of quests to analyze (default 50, prevents runaway API costs)

        Returns:
            Dict with recommendations, statistics, and analysis results
        """
        supabase = get_supabase_admin_client()

        # Get badge details
        badge_result = supabase.table('badges').select('*').eq('id', badge_id).single().execute()
        if not badge_result.data:
            raise ValueError(f"Badge {badge_id} not found")

        badge = badge_result.data

        # Get all active quests - LIMIT to prevent excessive API calls
        quests_result = supabase.table('quests').select('*').eq('is_active', True).limit(max_to_analyze * 2).execute()
        quests = quests_result.data or []

        # Get already linked quests
        existing_links = supabase.table('badge_quests')\
            .select('quest_id')\
            .eq('badge_id', badge_id)\
            .execute()

        existing_quest_ids = {link['quest_id'] for link in (existing_links.data or [])}

        # Filter unlinked quests
        unlinked_quests = [q for q in quests if q['id'] not in existing_quest_ids]

        # Limit how many we'll actually analyze
        quests_to_analyze = unlinked_quests[:max_to_analyze]

        # OPTIMIZATION: Fetch all quest tasks in one query
        quest_ids = [q['id'] for q in quests_to_analyze]
        all_tasks_result = supabase.table('quest_tasks')\
            .select('*')\
            .in_('quest_id', quest_ids)\
            .order('quest_id, order_index')\
            .execute()

        # Group tasks by quest_id
        tasks_by_quest = {}
        for task in (all_tasks_result.data or []):
            quest_id = task['quest_id']
            if quest_id not in tasks_by_quest:
                tasks_by_quest[quest_id] = []
            tasks_by_quest[quest_id].append(task)

        # Analyze each quest
        recommendations = []
        total_analyzed = 0
        print(f"Analyzing up to {len(quests_to_analyze)} quests for badge {badge['name']}...")

        for quest in quests_to_analyze:
            quest_tasks = tasks_by_quest.get(quest['id'], [])

            if not quest_tasks:
                continue  # Skip quests without tasks

            # Analyze this quest with AI
            print(f"  Analyzing quest: {quest['title'][:50]}...")
            analysis = self.analyze_quest_for_badge(quest, badge, quest_tasks)
            total_analyzed += 1

            # Add to recommendations if meets confidence threshold
            if analysis['confidence'] >= min_confidence and not analysis.get('error'):
                recommendations.append(analysis)
                print(f"    ✓ Confidence: {analysis['confidence']}% - {analysis['recommendation']}")

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
        max_per_badge: int = 15,
        quests_to_sample: int = 20
    ) -> Dict[str, Any]:
        """
        Analyze all active badges efficiently using pillar-based pre-filtering.

        Args:
            min_confidence: Minimum confidence score to recommend (0-100)
            max_per_badge: Maximum recommendations per badge (default 15)
            quests_to_sample: Number of quests to sample PER PILLAR for analysis (default 30)

        Returns:
            Dict with all badge analyses and aggregate statistics
        """
        supabase = get_supabase_admin_client()

        print("Starting efficient bulk badge analysis...")

        # Get all active badges
        badges_result = supabase.table('badges').select('*').eq('status', 'active').execute()
        badges = badges_result.data or []
        print(f"Found {len(badges)} active badges")

        # OPTIMIZATION: Get all quests and tasks upfront in ONE query each
        all_quests_result = supabase.table('quests').select('*').eq('is_active', True).execute()
        all_quests = all_quests_result.data or []
        print(f"Found {len(all_quests)} active quests")

        quest_ids = [q['id'] for q in all_quests]
        all_tasks_result = supabase.table('quest_tasks')\
            .select('*')\
            .in_('quest_id', quest_ids)\
            .execute()

        # Group tasks by quest_id
        tasks_by_quest = {}
        for task in (all_tasks_result.data or []):
            quest_id = task['quest_id']
            if quest_id not in tasks_by_quest:
                tasks_by_quest[quest_id] = []
            tasks_by_quest[quest_id].append(task)
        print(f"Loaded tasks for {len(tasks_by_quest)} quests")

        # Get ALL existing badge-quest links in one query
        all_links_result = supabase.table('badge_quests').select('badge_id, quest_id').execute()
        links_by_badge = {}
        for link in (all_links_result.data or []):
            badge_id = link['badge_id']
            if badge_id not in links_by_badge:
                links_by_badge[badge_id] = set()
            links_by_badge[badge_id].add(link['quest_id'])
        print(f"Loaded existing links for {len(links_by_badge)} badges")

        # Group quests by their PRIMARY pillar for smart filtering
        quests_by_pillar = {}
        for quest in all_quests:
            quest_id = quest['id']
            tasks = tasks_by_quest.get(quest_id, [])
            if not tasks:
                continue

            # Calculate primary pillar by XP
            pillar_xp = {}
            for task in tasks:
                pillar = task.get('pillar', 'Unknown')
                xp = task.get('xp_value', 0)
                pillar_xp[pillar] = pillar_xp.get(pillar, 0) + xp

            if pillar_xp:
                primary_pillar = max(pillar_xp.items(), key=lambda x: x[1])[0]
                if primary_pillar not in quests_by_pillar:
                    quests_by_pillar[primary_pillar] = []
                quests_by_pillar[primary_pillar].append(quest)

        print(f"Grouped quests by pillar: {[(p, len(q)) for p, q in quests_by_pillar.items()]}")

        results = {
            'total_badges': len(badges),
            'badges_analyzed': 0,
            'total_recommendations': 0,
            'total_ai_calls': 0,
            'badge_results': []
        }

        for badge in badges:
            try:
                print(f"\nAnalyzing badge: {badge['name']} ({badge['pillar_primary']})")

                # Smart filtering: Only analyze quests from matching pillar + cross-pillar quests
                existing_links = links_by_badge.get(badge['id'], set())

                # Get quests from badge's primary pillar
                candidate_quests = quests_by_pillar.get(badge['pillar_primary'], [])[:quests_to_sample]

                # Add some cross-pillar quests for diversity (fewer to speed up)
                for pillar, quests in quests_by_pillar.items():
                    if pillar != badge['pillar_primary']:
                        candidate_quests.extend(quests[:3])  # Reduced from 5 to 3

                # Filter out already linked quests
                unlinked_candidates = [q for q in candidate_quests if q['id'] not in existing_links]

                # Limit total to analyze - REDUCED to speed up
                quests_to_analyze = unlinked_candidates[:max_per_badge]  # Changed from max_per_badge * 2

                print(f"  Pre-filtered to {len(quests_to_analyze)} candidate quests (from {len(all_quests)} total)")

                # Analyze each candidate quest
                recommendations = []
                errors_count = 0

                for idx, quest in enumerate(quests_to_analyze, 1):
                    quest_tasks = tasks_by_quest.get(quest['id'], [])
                    if not quest_tasks:
                        continue

                    try:
                        print(f"  [{idx}/{len(quests_to_analyze)}] Analyzing: {quest['title'][:50]}...")

                        analysis = self.analyze_quest_for_badge(quest, badge, quest_tasks)
                        results['total_ai_calls'] += 1

                        if analysis.get('error'):
                            errors_count += 1
                            print(f"    ✗ AI Error: {analysis.get('reasoning', 'Unknown error')[:60]}")
                        elif analysis['confidence'] >= min_confidence:
                            recommendations.append(analysis)
                            print(f"    ✓ {analysis['confidence']}% - {analysis['recommendation']}")
                        else:
                            print(f"    - Below threshold: {analysis['confidence']}%")

                    except Exception as e:
                        errors_count += 1
                        print(f"    ✗ Exception: {str(e)[:60]}")
                        continue

                # Sort and limit
                recommendations.sort(key=lambda x: x['confidence'], reverse=True)
                recommendations = recommendations[:max_per_badge]

                badge_analysis = {
                    'badge_id': badge['id'],
                    'badge_name': badge['name'],
                    'total_quests_analyzed': len(quests_to_analyze),
                    'total_already_linked': len(existing_links),
                    'recommendations_count': len(recommendations),
                    'errors_count': errors_count,
                    'min_confidence_threshold': min_confidence,
                    'recommendations': recommendations,
                    'statistics': {
                        'high_confidence': len([r for r in recommendations if r['confidence'] >= 85]),
                        'medium_confidence': len([r for r in recommendations if 70 <= r['confidence'] < 85]),
                        'low_confidence': len([r for r in recommendations if r['confidence'] < 70]),
                        'avg_confidence': sum(r['confidence'] for r in recommendations) / len(recommendations) if recommendations else 0
                    }
                }

                results['badge_results'].append(badge_analysis)
                results['badges_analyzed'] += 1
                results['total_recommendations'] += len(recommendations)

                print(f"  ✓ Completed: {len(recommendations)} recs, {errors_count} errors\n")

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
                else:
                    # No data returned means insert likely failed
                    links_failed.append({
                        'quest_id': rec['quest_id'],
                        'quest_title': rec.get('quest_title', 'Unknown'),
                        'error': 'Database insert returned no data'
                    })
                    print(f"Warning: No data returned for quest {rec['quest_id']} link to badge {badge_id}")

            except Exception as e:
                error_msg = str(e)
                # Extract more specific error information if available
                if hasattr(e, 'response'):
                    try:
                        error_details = e.response.json()
                        error_msg = error_details.get('message', error_msg)
                    except:
                        pass

                links_failed.append({
                    'quest_id': rec['quest_id'],
                    'quest_title': rec.get('quest_title', 'Unknown'),
                    'error': error_msg
                })
                print(f"Error linking quest {rec['quest_id']} to badge {badge_id}: {error_msg}")

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
