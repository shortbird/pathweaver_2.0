"""
Docs AI Service
================

AI-powered documentation generation and analysis.
Extends BaseAIService to leverage Gemini for:
- Article generation from codebase context
- Gap analysis (features vs existing docs)
- Article freshness checking
- Full docs structure scaffolding

Usage:
    from services.docs_ai_service import DocsAIService

    docs_ai = DocsAIService()
    result = docs_ai.generate_article("How to create a quest", ["student"])
"""

import time
from typing import Dict, List, Optional
from services.base_ai_service import BaseAIService
from services.codebase_index_service import CodebaseIndexService
from database import get_supabase_admin_client
from prompts.components import TONE_LEVELS
from utils.logger import get_logger

logger = get_logger(__name__)

# Shared codebase indexer instance
_indexer: Optional[CodebaseIndexService] = None


def get_indexer() -> CodebaseIndexService:
    """Get or create the shared codebase indexer."""
    global _indexer
    if _indexer is None:
        _indexer = CodebaseIndexService()
    return _indexer


class DocsAIService(BaseAIService):
    """
    AI service for automated documentation generation and maintenance.

    Uses the codebase index to provide relevant context to Gemini
    for generating accurate, user-facing help articles.
    """

    def __init__(self):
        super().__init__()
        self.indexer = get_indexer()

    def _ensure_index(self):
        """Build the codebase index if not already built."""
        if not self.indexer.is_built:
            self.indexer.build_index()

    def generate_article(
        self,
        topic: str,
        target_roles: Optional[List[str]] = None,
        context_hints: Optional[List[str]] = None
    ) -> Dict:
        """
        Generate a complete help article about a given topic.

        1. Searches codebase index for relevant code
        2. Reads top source files for detailed context
        3. Prompts Gemini to write user-facing documentation

        Args:
            topic: What the article should be about
            target_roles: Target audience roles (student, parent, etc.)
            context_hints: Optional hints to guide generation

        Returns:
            Dict with title, slug, summary, content, suggested_category, target_roles
        """
        self._ensure_index()

        # Search for relevant codebase entries
        search_results = self.indexer.search(topic, top_n=15)
        if context_hints:
            for hint in context_hints:
                extra = self.indexer.search(hint, top_n=5)
                for e in extra:
                    if e not in search_results:
                        search_results.append(e)
            search_results = search_results[:15]

        # Build codebase context summaries
        context_summaries = []
        for entry in search_results:
            line = f"- [{entry['type']}] {entry['display_name']}"
            if entry.get('description'):
                line += f": {entry['description']}"
            if entry.get('roles'):
                line += f" (roles: {', '.join(entry['roles'])})"
            context_summaries.append(line)

        # Read top 3 most relevant files for detailed context
        file_excerpts = []
        seen_files = set()
        for entry in search_results[:5]:
            fp = entry.get('file_path', '')
            if fp and fp not in seen_files:
                seen_files.add(fp)
                content = self.indexer.get_file_content(fp, max_chars=2000)
                if content:
                    file_excerpts.append(f"### {fp}\n```\n{content}\n```")
                if len(file_excerpts) >= 3:
                    break

        roles_str = ', '.join(target_roles) if target_roles else 'all users'
        hints_str = ', '.join(context_hints) if context_hints else 'none'

        prompt = f"""You are a technical documentation writer for Optio, a learning platform.
{TONE_LEVELS['content_generation']}

Write a help center article about: "{topic}"
TARGET AUDIENCE: {roles_str}
ADDITIONAL CONTEXT: {hints_str}

CODEBASE REFERENCE (features available in the platform):
{chr(10).join(context_summaries) if context_summaries else 'No specific code references found.'}

DETAILED CODE EXCERPTS:
{chr(10).join(file_excerpts) if file_excerpts else 'No detailed excerpts available.'}

REQUIREMENTS:
- Markdown format, 400-800 words
- Start with a 1-2 sentence summary
- Use step-by-step instructions where appropriate
- Reference actual UI elements and features users would see
- Do NOT include internal code paths, file names, or technical implementation details
- Write entirely from the user's perspective
- Use clear headings (## and ###) to organize content
- Include tips or notes where helpful

Return ONLY valid JSON with this exact structure:
{{
  "title": "Article title",
  "slug": "url-friendly-slug",
  "summary": "1-2 sentence preview for search results",
  "content": "Full markdown article content",
  "suggested_category": "Best matching category name (Getting Started, Quests & Projects, Account & Settings, etc.)",
  "target_roles": ["student"]
}}"""

        try:
            result = self.generate_json(
                prompt,
                strict=False,
                generation_config_preset='creative_generation'
            )

            if not result or 'content' not in result:
                logger.warning("Docs AI generate_article returned invalid response")
                return {'success': False, 'error': 'AI returned an invalid response'}

            return {
                'success': True,
                'article': {
                    'title': str(result.get('title', topic)).strip(),
                    'slug': str(result.get('slug', '')).strip(),
                    'summary': str(result.get('summary', '')).strip(),
                    'content': str(result.get('content', '')).strip(),
                    'suggested_category': str(result.get('suggested_category', '')).strip(),
                    'target_roles': result.get('target_roles', target_roles or [])
                }
            }

        except Exception as e:
            logger.error(f"Docs AI generate_article error: {str(e)}")
            return {'success': False, 'error': str(e)}

    def suggest_missing_docs(self) -> Dict:
        """
        Compare codebase features against existing docs to find gaps.

        Returns:
            Dict with gaps list, coverage_score, and summary.
        """
        self._ensure_index()

        # Get feature summary from index
        feature_summary = self.indexer.get_summary(max_entries=80)

        # Get existing articles
        try:
            client = get_supabase_admin_client()
            result = client.table('docs_articles').select(
                'title, summary, target_roles'
            ).execute()
            existing = result.data or []
        except Exception as e:
            logger.error(f"Failed to fetch existing articles: {e}")
            existing = []

        existing_list = []
        for a in existing:
            line = f"- {a['title']}"
            if a.get('summary'):
                line += f": {a['summary']}"
            existing_list.append(line)

        prompt = f"""You are analyzing documentation coverage for Optio, a learning platform.
{TONE_LEVELS['admin_tools']}

PLATFORM FEATURES (from codebase scan):
{feature_summary[:6000]}

EXISTING DOCUMENTATION ARTICLES:
{chr(10).join(existing_list) if existing_list else 'No articles exist yet.'}

TASK: Compare the platform features against existing documentation.
Identify features that are NOT covered by any existing article.

Focus on user-facing features that would benefit from documentation:
- How to use key features (quests, tasks, courses, etc.)
- Account management and settings
- Role-specific guides (student, parent, advisor, org_admin)
- Common workflows and processes

Return ONLY valid JSON:
{{
  "gaps": [
    {{
      "topic": "Suggested article topic",
      "priority": "high|medium|low",
      "target_roles": ["student"],
      "reason": "Why this needs documentation",
      "suggested_category": "Category name"
    }}
  ],
  "coverage_score": 65,
  "summary": "Brief overview of documentation coverage state"
}}

Return 5-15 gaps, ordered by priority (high first)."""

        try:
            result = self.generate_json(
                prompt,
                strict=False,
                generation_config_preset='structured_output'
            )

            if not result or 'gaps' not in result:
                return {'success': False, 'error': 'AI returned an invalid response'}

            return {
                'success': True,
                'gaps': result.get('gaps', []),
                'coverage_score': result.get('coverage_score', 0),
                'summary': result.get('summary', '')
            }

        except Exception as e:
            logger.error(f"Docs AI suggest_missing_docs error: {str(e)}")
            return {'success': False, 'error': str(e)}

    def suggest_article_updates(self, article_id: str) -> Dict:
        """
        Check an existing article against current code to find outdated sections.

        Args:
            article_id: UUID of the article to check

        Returns:
            Dict with needs_update, confidence, issues list, and summary.
        """
        self._ensure_index()

        # Fetch the article
        try:
            client = get_supabase_admin_client()
            result = client.table('docs_articles').select('*').eq(
                'id', article_id
            ).execute()
            if not result.data:
                return {'success': False, 'error': 'Article not found'}
            article = result.data[0]
        except Exception as e:
            return {'success': False, 'error': f'Failed to fetch article: {str(e)}'}

        # Search index for topics related to the article
        search_query = article.get('title', '') + ' ' + (article.get('summary', '') or '')
        search_results = self.indexer.search(search_query, top_n=10)

        # Read relevant current code
        code_excerpts = []
        seen_files = set()
        for entry in search_results[:5]:
            fp = entry.get('file_path', '')
            if fp and fp not in seen_files:
                seen_files.add(fp)
                content = self.indexer.get_file_content(fp, max_chars=2000)
                if content:
                    code_excerpts.append(f"### {fp}\n```\n{content}\n```")
                if len(code_excerpts) >= 3:
                    break

        prompt = f"""You are checking if a documentation article is up-to-date with the current codebase.
{TONE_LEVELS['admin_tools']}

ARTICLE TITLE: {article.get('title', '')}
ARTICLE CONTENT:
{article.get('content', '')[:4000]}

CURRENT CODEBASE STATE (relevant code):
{chr(10).join(code_excerpts) if code_excerpts else 'No matching code found.'}

RELATED FEATURES FOUND:
{chr(10).join(f"- {e['display_name']}: {e.get('description', '')}" for e in search_results[:10])}

TASK: Compare the article content against the current code state.
Look for:
- Features described in the article that no longer exist or work differently
- Missing information about new features
- Incorrect steps or UI references
- Outdated terminology

Return ONLY valid JSON:
{{
  "needs_update": true,
  "confidence": 0.85,
  "issues": [
    {{
      "type": "outdated|missing|incorrect",
      "description": "What is wrong",
      "suggested_fix": "How to fix it",
      "severity": "high|medium|low"
    }}
  ],
  "summary": "Brief overview of article freshness state"
}}"""

        try:
            result = self.generate_json(
                prompt,
                strict=False,
                generation_config_preset='structured_output'
            )

            if not result:
                return {'success': False, 'error': 'AI returned an invalid response'}

            return {
                'success': True,
                'needs_update': result.get('needs_update', False),
                'confidence': result.get('confidence', 0),
                'issues': result.get('issues', []),
                'summary': result.get('summary', '')
            }

        except Exception as e:
            logger.error(f"Docs AI suggest_article_updates error: {str(e)}")
            return {'success': False, 'error': str(e)}

    def generate_category_structure(self) -> Dict:
        """
        Generate a complete docs category and article structure from codebase analysis.

        Returns:
            Dict with categories list, each containing suggested articles.
        """
        self._ensure_index()

        feature_summary = self.indexer.get_summary(max_entries=80)

        # Get existing categories
        try:
            client = get_supabase_admin_client()
            result = client.table('docs_categories').select('title, slug').execute()
            existing_cats = result.data or []
        except Exception:
            existing_cats = []

        existing_list = [f"- {c['title']} ({c['slug']})" for c in existing_cats]

        prompt = f"""You are designing the complete documentation structure for Optio, a learning platform.
{TONE_LEVELS['content_generation']}

PLATFORM FEATURES (from codebase scan):
{feature_summary[:6000]}

EXISTING CATEGORIES:
{chr(10).join(existing_list) if existing_list else 'No categories exist yet.'}

TASK: Design a complete help center structure organized by user journey.
Create categories and article topics that cover ALL major platform features.

GUIDELINES:
- Organize from a user's perspective, not a developer's
- Group by user journey stage or feature area
- Include articles for each user role where relevant
- Suggest 3-8 articles per category
- Categories should be intuitive and scannable
- Use icons from Heroicons (BookOpenIcon, AcademicCapIcon, UserGroupIcon, CogIcon, etc.)

Return ONLY valid JSON:
{{
  "categories": [
    {{
      "title": "Getting Started",
      "slug": "getting-started",
      "description": "Everything you need to begin your learning journey",
      "icon": "RocketLaunchIcon",
      "articles": [
        {{
          "title": "Creating Your Account",
          "slug": "creating-your-account",
          "summary": "How to sign up and set up your profile",
          "priority": "high"
        }}
      ]
    }}
  ]
}}

Return 4-8 categories with 3-8 articles each."""

        try:
            result = self.generate_json(
                prompt,
                strict=False,
                generation_config_preset='creative_generation'
            )

            if not result or 'categories' not in result:
                return {'success': False, 'error': 'AI returned an invalid response'}

            return {
                'success': True,
                'categories': result.get('categories', [])
            }

        except Exception as e:
            logger.error(f"Docs AI generate_category_structure error: {str(e)}")
            return {'success': False, 'error': str(e)}

    def bulk_generate_articles(self, articles: List[Dict]) -> Dict:
        """
        Generate multiple articles with delays between Gemini calls.

        Args:
            articles: List of dicts with 'topic', 'target_roles', 'context_hints'

        Returns:
            Dict with generated list and errors list.
        """
        generated = []
        errors = []

        for i, article_spec in enumerate(articles):
            topic = article_spec.get('topic', '')
            if not topic:
                errors.append({'index': i, 'error': 'Missing topic'})
                continue

            result = self.generate_article(
                topic=topic,
                target_roles=article_spec.get('target_roles'),
                context_hints=article_spec.get('context_hints')
            )

            if result.get('success'):
                generated.append(result['article'])
            else:
                errors.append({'index': i, 'topic': topic, 'error': result.get('error', 'Unknown error')})

            # Rate limit delay between calls (3 seconds)
            if i < len(articles) - 1:
                time.sleep(3)

        return {
            'success': True,
            'generated': generated,
            'errors': errors,
            'total': len(articles),
            'succeeded': len(generated),
            'failed': len(errors)
        }
