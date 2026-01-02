"""
Prompt Management Service
=========================

Manages AI prompt components with database storage and Python file fallback.
Provides CRUD operations for editable prompts used across AI services.

Storage Strategy:
- Primary: Database table `ai_prompt_components`
- Fallback: Python file `prompts/components.py` provides defaults
- On read: Check database first, fall back to Python if not found
- On reset: Restore Python default value to database

Usage:
    from services.prompt_management_service import PromptManagementService

    service = PromptManagementService()

    # Get a component (database first, then Python fallback)
    philosophy = service.get_component('CORE_PHILOSOPHY')

    # Update a component
    service.update_component('CORE_PHILOSOPHY', new_content, user_id)

    # Reset to Python default
    service.reset_component('CORE_PHILOSOPHY', user_id)
"""

from typing import Dict, List, Optional, Any
from datetime import datetime
from services.base_service import BaseService, ValidationError, NotFoundError
from database import get_supabase_admin_client
from utils.logger import get_logger

# Import Python defaults for fallback
from prompts.components import (
    CORE_PHILOSOPHY,
    LANGUAGE_GUIDELINES,
    PILLAR_DEFINITIONS,
    PILLAR_DEFINITIONS_DETAILED,
    JSON_OUTPUT_INSTRUCTIONS,
    JSON_OUTPUT_INSTRUCTIONS_STRICT,
    CONVERSATION_MODE_INSTRUCTIONS,
    LEARNING_STYLE_INSTRUCTIONS,
    ACTION_TYPE_INSTRUCTIONS,
    FORBIDDEN_WORDS,
    ENCOURAGED_WORDS,
)

logger = get_logger(__name__)


class PromptManagementService(BaseService):
    """
    Service for managing AI prompt components.

    Features:
    - Database-backed storage with Python fallback
    - Category-based organization (core, tutor, lesson, quest)
    - Audit trail for modifications
    - Reset to default functionality
    """

    # Map of component names to their Python default values
    PYTHON_DEFAULTS = {
        # Core components
        'CORE_PHILOSOPHY': {
            'content': CORE_PHILOSOPHY,
            'category': 'core',
            'description': 'The foundational philosophy that guides all AI interactions',
            'is_editable': True
        },
        'LANGUAGE_GUIDELINES': {
            'content': LANGUAGE_GUIDELINES,
            'category': 'core',
            'description': 'Words and phrases to use/avoid in AI responses',
            'is_editable': True
        },
        'PILLAR_DEFINITIONS': {
            'content': PILLAR_DEFINITIONS,
            'category': 'core',
            'description': 'Brief definitions of the 5 learning pillars',
            'is_editable': True
        },
        'PILLAR_DEFINITIONS_DETAILED': {
            'content': PILLAR_DEFINITIONS_DETAILED,
            'category': 'core',
            'description': 'Detailed pillar definitions with examples',
            'is_editable': True
        },
        'JSON_OUTPUT_INSTRUCTIONS': {
            'content': JSON_OUTPUT_INSTRUCTIONS,
            'category': 'core',
            'description': 'Standard JSON output format instructions',
            'is_editable': False
        },
        'JSON_OUTPUT_INSTRUCTIONS_STRICT': {
            'content': JSON_OUTPUT_INSTRUCTIONS_STRICT,
            'category': 'core',
            'description': 'Strict JSON output format instructions',
            'is_editable': False
        },
        'FORBIDDEN_WORDS': {
            'content': ', '.join(FORBIDDEN_WORDS),
            'category': 'core',
            'description': 'Words that should never appear in AI responses',
            'is_editable': True
        },
        'ENCOURAGED_WORDS': {
            'content': ', '.join(ENCOURAGED_WORDS),
            'category': 'core',
            'description': 'Words that should be used in AI responses',
            'is_editable': True
        },

        # Tutor conversation modes
        'CONVERSATION_MODE_STUDY_BUDDY': {
            'content': CONVERSATION_MODE_INSTRUCTIONS.get('study_buddy', ''),
            'category': 'tutor',
            'description': 'Study buddy conversation mode instructions',
            'is_editable': True
        },
        'CONVERSATION_MODE_TEACHER': {
            'content': CONVERSATION_MODE_INSTRUCTIONS.get('teacher', ''),
            'category': 'tutor',
            'description': 'Teacher conversation mode instructions',
            'is_editable': True
        },
        'CONVERSATION_MODE_DISCOVERY': {
            'content': CONVERSATION_MODE_INSTRUCTIONS.get('discovery', ''),
            'category': 'tutor',
            'description': 'Discovery conversation mode instructions',
            'is_editable': True
        },
        'CONVERSATION_MODE_REVIEW': {
            'content': CONVERSATION_MODE_INSTRUCTIONS.get('review', ''),
            'category': 'tutor',
            'description': 'Review conversation mode instructions',
            'is_editable': True
        },
        'CONVERSATION_MODE_CREATIVE': {
            'content': CONVERSATION_MODE_INSTRUCTIONS.get('creative', ''),
            'category': 'tutor',
            'description': 'Creative conversation mode instructions',
            'is_editable': True
        },

        # Learning styles
        'LEARNING_STYLE_VISUAL': {
            'content': LEARNING_STYLE_INSTRUCTIONS.get('visual', ''),
            'category': 'tutor',
            'description': 'Visual learner adaptation instructions',
            'is_editable': True
        },
        'LEARNING_STYLE_AUDITORY': {
            'content': LEARNING_STYLE_INSTRUCTIONS.get('auditory', ''),
            'category': 'tutor',
            'description': 'Auditory learner adaptation instructions',
            'is_editable': True
        },
        'LEARNING_STYLE_KINESTHETIC': {
            'content': LEARNING_STYLE_INSTRUCTIONS.get('kinesthetic', ''),
            'category': 'tutor',
            'description': 'Kinesthetic learner adaptation instructions',
            'is_editable': True
        },
        'LEARNING_STYLE_MIXED': {
            'content': LEARNING_STYLE_INSTRUCTIONS.get('mixed', ''),
            'category': 'tutor',
            'description': 'Mixed learner adaptation instructions',
            'is_editable': True
        },

        # Lesson action types
        'ACTION_TYPE_EXAMPLE': {
            'content': ACTION_TYPE_INSTRUCTIONS.get('example', ''),
            'category': 'lesson',
            'description': 'Example action type for lesson chat',
            'is_editable': True
        },
        'ACTION_TYPE_ANALOGY': {
            'content': ACTION_TYPE_INSTRUCTIONS.get('analogy', ''),
            'category': 'lesson',
            'description': 'Analogy action type for lesson chat',
            'is_editable': True
        },
        'ACTION_TYPE_DRAW': {
            'content': ACTION_TYPE_INSTRUCTIONS.get('draw', ''),
            'category': 'lesson',
            'description': 'Draw action type for lesson chat',
            'is_editable': True
        },
        'ACTION_TYPE_DEBATE': {
            'content': ACTION_TYPE_INSTRUCTIONS.get('debate', ''),
            'category': 'lesson',
            'description': 'Debate action type for lesson chat',
            'is_editable': True
        },
    }

    # Categories for grouping in UI
    CATEGORIES = ['core', 'tutor', 'lesson', 'quest']

    def __init__(self):
        """Initialize the prompt management service."""
        super().__init__()
        self._cache = {}  # Simple in-memory cache
        self._cache_ttl = 300  # 5 minutes
        self._cache_timestamps = {}

    def get_all_components(self, category: Optional[str] = None) -> List[Dict]:
        """
        Get all prompt components, optionally filtered by category.

        Args:
            category: Optional category filter (core, tutor, lesson, quest)

        Returns:
            List of component dictionaries with name, content, category, etc.
        """
        try:
            supabase = get_supabase_admin_client()

            query = supabase.table('ai_prompt_components').select('*')

            if category:
                query = query.eq('category', category)

            response = query.order('category').order('name').execute()

            db_components = {c['name']: c for c in (response.data or [])}

            # Merge with Python defaults (database takes precedence)
            result = []
            for name, defaults in self.PYTHON_DEFAULTS.items():
                if category and defaults['category'] != category:
                    continue

                if name in db_components:
                    # Use database version
                    component = db_components[name]
                    component['source'] = 'database'
                    component['has_modifications'] = component['content'] != defaults['content']
                else:
                    # Use Python default
                    component = {
                        'name': name,
                        'content': defaults['content'],
                        'category': defaults['category'],
                        'description': defaults['description'],
                        'is_editable': defaults['is_editable'],
                        'source': 'python_default',
                        'has_modifications': False,
                        'last_modified_at': None,
                        'modified_by': None
                    }
                result.append(component)

            return result

        except Exception as e:
            logger.error(f"Error getting all components: {e}")
            # Fall back to Python defaults only
            result = []
            for name, defaults in self.PYTHON_DEFAULTS.items():
                if category and defaults['category'] != category:
                    continue
                result.append({
                    'name': name,
                    'content': defaults['content'],
                    'category': defaults['category'],
                    'description': defaults['description'],
                    'is_editable': defaults['is_editable'],
                    'source': 'python_default',
                    'has_modifications': False
                })
            return result

    def get_component(self, name: str) -> Optional[Dict]:
        """
        Get a single prompt component by name.
        Database first, then Python fallback.

        Args:
            name: Component name (e.g., 'CORE_PHILOSOPHY')

        Returns:
            Component dictionary or None if not found
        """
        # Check cache first
        cache_key = f"component:{name}"
        if self._is_cache_valid(cache_key):
            return self._cache[cache_key]

        try:
            supabase = get_supabase_admin_client()

            response = supabase.table('ai_prompt_components')\
                .select('*')\
                .eq('name', name)\
                .maybeSingle()\
                .execute()

            if response.data:
                component = response.data
                component['source'] = 'database'

                # Check if modified from default
                if name in self.PYTHON_DEFAULTS:
                    component['has_modifications'] = component['content'] != self.PYTHON_DEFAULTS[name]['content']
                    component['default_content'] = self.PYTHON_DEFAULTS[name]['content']

                self._set_cache(cache_key, component)
                return component

        except Exception as e:
            logger.warning(f"Error fetching component {name} from database: {e}")

        # Fallback to Python defaults
        if name in self.PYTHON_DEFAULTS:
            defaults = self.PYTHON_DEFAULTS[name]
            component = {
                'name': name,
                'content': defaults['content'],
                'category': defaults['category'],
                'description': defaults['description'],
                'is_editable': defaults['is_editable'],
                'source': 'python_default',
                'has_modifications': False,
                'default_content': defaults['content']
            }
            self._set_cache(cache_key, component)
            return component

        return None

    def get_component_content(self, name: str) -> str:
        """
        Get just the content string for a component.
        Convenience method for AI services.

        Args:
            name: Component name

        Returns:
            Content string or empty string if not found
        """
        component = self.get_component(name)
        return component['content'] if component else ''

    def update_component(
        self,
        name: str,
        content: str,
        user_id: str,
        description: Optional[str] = None
    ) -> Dict:
        """
        Update a prompt component's content.

        Args:
            name: Component name
            content: New content
            user_id: ID of user making the change
            description: Optional new description

        Returns:
            Updated component

        Raises:
            ValidationError: If component is not editable
            NotFoundError: If component doesn't exist
        """
        # Validate component exists
        if name not in self.PYTHON_DEFAULTS:
            raise NotFoundError(f"Component '{name}' not found")

        defaults = self.PYTHON_DEFAULTS[name]

        # Check if editable
        if not defaults['is_editable']:
            raise ValidationError(f"Component '{name}' is not editable")

        # Validate content
        if not content or not content.strip():
            raise ValidationError("Content cannot be empty")

        try:
            supabase = get_supabase_admin_client()

            # Upsert the component
            update_data = {
                'name': name,
                'content': content.strip(),
                'category': defaults['category'],
                'description': description or defaults['description'],
                'is_editable': defaults['is_editable'],
                'last_modified_at': datetime.utcnow().isoformat(),
                'modified_by': user_id
            }

            response = supabase.table('ai_prompt_components')\
                .upsert(update_data, on_conflict='name')\
                .execute()

            if not response.data:
                raise Exception("Failed to update component")

            # Clear cache
            self._invalidate_cache(f"component:{name}")

            logger.info(f"Component '{name}' updated by user {user_id}")

            result = response.data[0]
            result['source'] = 'database'
            result['has_modifications'] = result['content'] != defaults['content']
            result['default_content'] = defaults['content']

            return result

        except ValidationError:
            raise
        except Exception as e:
            logger.error(f"Error updating component {name}: {e}")
            raise

    def reset_component(self, name: str, user_id: str) -> Dict:
        """
        Reset a component to its Python default value.

        Args:
            name: Component name
            user_id: ID of user making the reset

        Returns:
            Reset component

        Raises:
            NotFoundError: If component doesn't exist
        """
        if name not in self.PYTHON_DEFAULTS:
            raise NotFoundError(f"Component '{name}' not found")

        defaults = self.PYTHON_DEFAULTS[name]

        try:
            supabase = get_supabase_admin_client()

            # Update with default content
            update_data = {
                'name': name,
                'content': defaults['content'],
                'category': defaults['category'],
                'description': defaults['description'],
                'is_editable': defaults['is_editable'],
                'last_modified_at': datetime.utcnow().isoformat(),
                'modified_by': user_id
            }

            response = supabase.table('ai_prompt_components')\
                .upsert(update_data, on_conflict='name')\
                .execute()

            # Clear cache
            self._invalidate_cache(f"component:{name}")

            logger.info(f"Component '{name}' reset to default by user {user_id}")

            result = response.data[0] if response.data else update_data
            result['source'] = 'database'
            result['has_modifications'] = False
            result['default_content'] = defaults['content']

            return result

        except Exception as e:
            logger.error(f"Error resetting component {name}: {e}")
            raise

    def get_categories(self) -> List[Dict]:
        """
        Get list of component categories with counts.

        Returns:
            List of category dictionaries with name and count
        """
        components = self.get_all_components()

        category_counts = {}
        for comp in components:
            cat = comp['category']
            if cat not in category_counts:
                category_counts[cat] = {'name': cat, 'count': 0, 'modified_count': 0}
            category_counts[cat]['count'] += 1
            if comp.get('has_modifications'):
                category_counts[cat]['modified_count'] += 1

        return list(category_counts.values())

    def validate_component_content(self, content: str) -> Dict:
        """
        Validate content for common issues.

        Args:
            content: Content to validate

        Returns:
            Validation result with 'is_valid', 'issues', 'warnings'
        """
        issues = []
        warnings = []

        # Check for empty content
        if not content or not content.strip():
            issues.append("Content cannot be empty")

        # Check for very short content
        if len(content.strip()) < 10:
            warnings.append("Content seems very short")

        # Check for unbalanced brackets (template variables)
        open_braces = content.count('{')
        close_braces = content.count('}')
        if open_braces != close_braces:
            warnings.append(f"Unbalanced braces: {open_braces} open, {close_braces} close")

        # Check for potential template variables
        import re
        variables = re.findall(r'\{(\w+)\}', content)
        if variables:
            warnings.append(f"Contains template variables: {', '.join(set(variables))}")

        return {
            'is_valid': len(issues) == 0,
            'issues': issues,
            'warnings': warnings,
            'character_count': len(content),
            'word_count': len(content.split())
        }

    # Cache helpers
    def _is_cache_valid(self, key: str) -> bool:
        """Check if cache entry is still valid."""
        import time
        if key not in self._cache:
            return False
        if key not in self._cache_timestamps:
            return False
        return (time.time() - self._cache_timestamps[key]) < self._cache_ttl

    def _set_cache(self, key: str, value: Any):
        """Set cache entry with timestamp."""
        import time
        self._cache[key] = value
        self._cache_timestamps[key] = time.time()

    def _invalidate_cache(self, key: str):
        """Invalidate a cache entry."""
        if key in self._cache:
            del self._cache[key]
        if key in self._cache_timestamps:
            del self._cache_timestamps[key]

    def clear_cache(self):
        """Clear all cached data."""
        self._cache.clear()
        self._cache_timestamps.clear()
